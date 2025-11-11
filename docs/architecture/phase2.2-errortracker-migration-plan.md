# Phase 2.2: ErrorTracker Live Stream Migration - Implementation Plan

**Status**: 🚧 IN PROGRESS  
**Date**: 2025-11-11  
**Dependencies**: Phase 2.1 Event Bus Foundation (✅ COMPLETE)  
**Target**: Week 1 (1-2 days implementation)

## Executive Summary

Phase 2.2 migrates ErrorTracker's EventEmitter-based live error stream to the unified Event Bus. This eliminates EventEmitter-specific memory leak risks (unbounded listeners), provides correlation ID tracking across error events, and unifies error monitoring with the centralized event system.

## Current State Analysis

### ErrorTracker Live Stream (src/services/error-tracker.ts)

**Current Implementation**:
```typescript
// Line 55: EventEmitter instantiation
export const liveErrorStream = new EventEmitter();

// Line 58: Listener limit configuration
liveErrorStream.setMaxListeners(5);

// Line 583: Error emission
liveErrorStream.emit('error', event);
```

**Usage Pattern**:
- **Emitter**: `src/services/error-tracker.ts` (line 583)
  - Emits `LiveErrorEvent` objects with error details
  - Triggered after error is captured and stored in database
  - Provides real-time error notifications

- **Subscriber**: `src/utils/intelligent-logger.ts`
  - **Import** (line 20): `import { liveErrorStream, type LiveErrorEvent } from '../services/error-tracker.js';`
  - **Subscribe** (line 866): `liveErrorStream.on('error', this.errorStreamListener)`
  - **Unsubscribe** (line 621): `liveErrorStream.off('error', this.errorStreamListener)`
  - **Purpose** (line 865): Add listener to update ERROR MONITORING section in console

### LiveErrorEvent Structure

```typescript
interface LiveErrorEvent {
  errorId: string;           // UUID for error instance
  fingerprint: string;        // SHA-256 hash of normalized stack
  category: ErrorCategory;    // 'APPLICATION' | 'VALIDATION' | 'DATABASE' | 'EXTERNAL'
  severity: ErrorSeverity;    // 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  errorName: string;          // Error constructor name
  errorMessage: string;       // Error message
  context: ErrorContext;      // Request context, userId, etc.
  parsedStack: StackFrame[];  // Parsed stack trace
  occurredAt: Date;           // Timestamp
}
```

### Current Problems

1. **EventEmitter Leak Risk**: 
   - No automatic listener cleanup
   - `setMaxListeners(5)` arbitrary limit
   - No backpressure control if logger is slow

2. **No Correlation Tracking**:
   - Cannot trace errors across systems
   - No parent-child error chains
   - Difficult to debug cascading failures

3. **Isolated Monitoring**:
   - ErrorTracker exists independently
   - No unified event observability
   - Cannot correlate errors with user events, battles, etc.

4. **No Event Replay**:
   - Late subscribers miss historical errors
   - Cannot replay recent errors for debugging
   - No persistent error stream buffer

## Target State Design

### Event Bus Integration

**Topic Naming Convention**:
```
error.<severity>
  - error.critical    (CRITICAL severity errors)
  - error.high        (HIGH severity errors)
  - error.medium      (MEDIUM severity errors)
  - error.low         (LOW severity errors)
```

**Event Payload**:
```typescript
interface ErrorBusEvent {
  // LiveErrorEvent fields (existing)
  errorId: string;
  fingerprint: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  errorName: string;
  errorMessage: string;
  context: ErrorContext;
  parsedStack: StackFrame[];
  occurredAt: Date;
  
  // NEW: Correlation tracking
  correlationId?: string;  // From BusEvent (UUID v4)
  parentCorrelationId?: string; // For error chains
}
```

### Migration Implementation

#### Step 1: Update ErrorTracker Emitter (src/services/error-tracker.ts)

**Before** (line 583):
```typescript
liveErrorStream.emit('error', event);
```

**After**:
```typescript
import { EventBus } from '../shared/event-bus.js';

// Get bus instance (singleton)
const bus = EventBus.getInstance();

// Emit to error.<severity> topic with correlation tracking
const correlationId = bus.emit(`error.${event.severity.toLowerCase()}`, {
  errorId: event.errorId,
  fingerprint: event.fingerprint,
  category: event.category,
  severity: event.severity,
  errorName: event.errorName,
  errorMessage: event.errorMessage,
  context: event.context,
  parsedStack: event.parsedStack,
  occurredAt: event.occurredAt,
}, {
  emitter: 'error-tracker',
  parentCorrelationId: event.context.correlationId, // Chain if exists
});

// Log correlation ID for tracing
log('info', '[ErrorTracker] Error emitted to Event Bus', {
  errorId: event.errorId,
  correlationId,
  severity: event.severity,
});
```

#### Step 2: Update Intelligent Logger Subscriber (src/utils/intelligent-logger.ts)

**Before** (lines 866, 621):
```typescript
// Subscribe
liveErrorStream.on('error', this.errorStreamListener);

// Unsubscribe
liveErrorStream.off('error', this.errorStreamListener);
```

**After**:
```typescript
import { EventBus } from '../shared/event-bus.js';

private errorSubscriptionId: string | null = null;

// Subscribe to all error events
setupErrorStreamListener(): void {
  const bus = EventBus.getInstance();
  
  this.errorSubscriptionId = bus.subscribe('error.**', (event) => {
    // Extract error event from bus payload
    const errorEvent: ErrorBusEvent = event.payload;
    
    // Update ERROR MONITORING section (existing logic)
    this.handleLiveError(errorEvent, event.correlationId);
  }, {
    priority: 10, // High priority for monitoring
    maxQueueSize: 100, // Backpressure control
  });
}

// Unsubscribe on shutdown
cleanupErrorStreamListener(): void {
  if (this.errorSubscriptionId) {
    const bus = EventBus.getInstance();
    bus.unsubscribe(this.errorSubscriptionId);
    this.errorSubscriptionId = null;
  }
}

// Updated handler with correlation tracking
private handleLiveError(errorEvent: ErrorBusEvent, correlationId: string): void {
  // Existing ERROR MONITORING section update logic
  // PLUS: Add correlation ID to display for tracing
  console.log(`[ERROR MONITORING] ${errorEvent.severity} - ${errorEvent.errorMessage}`);
  console.log(`  Correlation ID: ${correlationId}`);
  console.log(`  Error ID: ${errorEvent.errorId}`);
  // ... rest of existing display logic
}
```

#### Step 3: Remove EventEmitter Dependency (src/services/error-tracker.ts)

**Remove**:
```typescript
// Line 55: Remove EventEmitter
export const liveErrorStream = new EventEmitter();

// Line 58: Remove setMaxListeners
liveErrorStream.setMaxListeners(5);
```

**Update Exports**:
```typescript
// Remove from exports
export type { LiveErrorEvent } from './types.js'; // Keep type export
// DO NOT export liveErrorStream (removed)
```

#### Step 4: Update Imports (src/utils/intelligent-logger.ts)

**Before** (line 20):
```typescript
import { liveErrorStream, type LiveErrorEvent } from '../services/error-tracker.js';
```

**After**:
```typescript
import type { LiveErrorEvent } from '../services/error-tracker.js'; // Type-only import
import { EventBus } from '../shared/event-bus.js'; // Event Bus import
```

## Benefits

### Correlation Tracking ✅
- **Every error has correlation ID** (UUID v4)
- **Parent-child error chains** (cascade failures traced)
- **Cross-system tracing** (errors linked to user events, battles, etc.)

**Example**:
```
User initiates battle → correlationId: 550e8400-...
  ↓
Battle validation error → correlationId: 550e8400-...:a1b2c3d4
  ↓
Database connection error → correlationId: 550e8400-...:a1b2c3d4:e5f6g7h8
```

### Event Replay Buffer ✅
- **Late subscribers get recent errors** (last 100 errors buffered)
- **Debugging convenience** (replay errors for investigation)
- **Monitoring resilience** (logger restart doesn't lose errors)

**Example**:
```typescript
// Logger restarts, replays last 5 minutes of errors
const bus = EventBus.getInstance();
const recentErrors = bus.replay('error.**', new Date(Date.now() - 5 * 60 * 1000));
console.log(`Replaying ${recentErrors.length} recent errors...`);
```

### Backpressure Control ✅
- **No memory leaks** (max 100 errors per subscriber queue)
- **Drop-oldest strategy** (oldest errors dropped if slow subscriber)
- **Statistics tracking** (monitor dropped errors)

**Example**:
```typescript
// Logger subscription with backpressure protection
bus.subscribe('error.**', handler, {
  maxQueueSize: 100, // Max 100 queued errors
});

// Monitor backpressure
const stats = bus.getStats();
console.log(`Backpressure events: ${stats.backpressureEvents}`);
```

### Unified Observability ✅
- **Single event system** (errors visible in Event Bus stats)
- **Pattern-based filtering** (subscribe to error.critical only)
- **Consistent monitoring** (same tools for all events)

**Example**:
```typescript
// Monitor only critical errors
bus.subscribe('error.critical', (event) => {
  sendAlert(`CRITICAL ERROR: ${event.payload.errorMessage}`);
});

// Monitor all errors
const stats = bus.getStats();
console.log(`Total errors emitted: ${stats.eventsEmitted}`);
```

## Implementation Checklist

### Phase 2.2.1: Update ErrorTracker Emitter ✅ TODO
- [ ] Import EventBus in src/services/error-tracker.ts
- [ ] Replace `liveErrorStream.emit('error', event)` with `bus.emit('error.<severity>', payload)`
- [ ] Add correlation ID logging
- [ ] Add parent correlation ID chaining (from context)
- [ ] Validate TypeScript 0 errors
- [ ] Validate build passing

### Phase 2.2.2: Update Intelligent Logger Subscriber ✅ TODO
- [ ] Import EventBus in src/utils/intelligent-logger.ts
- [ ] Replace `liveErrorStream.on('error', handler)` with `bus.subscribe('error.**', handler)`
- [ ] Replace `liveErrorStream.off('error', handler)` with `bus.unsubscribe(subscriptionId)`
- [ ] Update handler to extract payload from BusEvent
- [ ] Add correlation ID to ERROR MONITORING display
- [ ] Add backpressure protection (maxQueueSize: 100)
- [ ] Validate TypeScript 0 errors
- [ ] Validate build passing

### Phase 2.2.3: Remove EventEmitter Dependency ✅ TODO
- [ ] Remove `export const liveErrorStream = new EventEmitter()` from src/services/error-tracker.ts
- [ ] Remove `liveErrorStream.setMaxListeners(5)` from src/services/error-tracker.ts
- [ ] Update imports in src/utils/intelligent-logger.ts (type-only import)
- [ ] Validate no references to `liveErrorStream` remain (grep search)
- [ ] Validate TypeScript 0 errors
- [ ] Validate build passing

### Phase 2.2.4: Integration Testing ✅ TODO
- [ ] Create test suite (tests/error-tracker-bus-integration.test.ts)
- [ ] Test: Error emission to Event Bus (all severities)
- [ ] Test: Logger receives errors via Event Bus
- [ ] Test: Correlation ID generation and chaining
- [ ] Test: Event replay for late subscribers
- [ ] Test: Backpressure control (slow subscriber)
- [ ] Test: Multiple subscribers receive same error
- [ ] Test: Unsubscribe stops receiving errors
- [ ] Test: Graceful shutdown (pending errors flushed)
- [ ] Validate 100% test pass rate
- [ ] Validate TypeScript 0 errors

### Phase 2.2.5: Validation & Documentation ✅ TODO
- [ ] Manual testing: Trigger errors (invalid input, database connection, etc.)
- [ ] Validate ERROR MONITORING section updates in console
- [ ] Validate correlation IDs displayed correctly
- [ ] Validate no memory leaks (run load test with 1000 errors)
- [ ] Update ROUTER.md files (src/services/ROUTER.md, src/utils/ROUTER.md)
- [ ] Update Agents.md (cross-references, architecture notes)
- [ ] Create Phase 2.2 completion report (comprehensive analysis)
- [ ] Commit changes with descriptive message
- [ ] Push to main

## Testing Strategy

### Unit Tests (tests/error-tracker-bus-integration.test.ts)

**Test Categories** (9 tests minimum):

1. **Error Emission** (3 tests):
   - Emit error to `error.critical` topic
   - Emit error to `error.high` topic
   - Emit error to `error.medium` topic
   - Validate correlation ID generated (UUID v4 format)
   - Validate severity in topic name

2. **Subscriber Integration** (2 tests):
   - Subscribe to `error.**` pattern, receive all severities
   - Subscribe to `error.critical` only, filter other severities
   - Validate payload structure (errorId, fingerprint, etc.)

3. **Correlation Tracking** (2 tests):
   - Emit error with parent correlation ID (event chain)
   - Validate parent:child relationship in correlation IDs

4. **Event Replay** (1 test):
   - Emit 5 errors, create late subscriber
   - Late subscriber replays last 5 errors

5. **Backpressure** (1 test):
   - Slow subscriber (100ms per error)
   - Emit 200 errors rapidly
   - Validate some dropped (max 100 queue size)

### Manual Testing

**Trigger Error Scenarios**:
```typescript
// 1. Application error
throw new Error('Test application error');

// 2. Validation error
await validateInput({ invalidField: 'bad value' });

// 3. Database error
await prisma.user.findUnique({ where: { id: 'nonexistent' } });

// 4. External API error
await fetch('https://invalid-domain-12345.com');
```

**Validate Outputs**:
- ERROR MONITORING section updates in console
- Correlation IDs displayed correctly
- Error severity correctly routed
- No EventEmitter warnings/errors

## Rollback Plan

If migration causes issues:

1. **Revert Commits**: 
   ```bash
   git revert HEAD~3..HEAD  # Revert last 3 commits (emitter, subscriber, cleanup)
   git push origin main
   ```

2. **Restore EventEmitter**:
   - Uncomment `export const liveErrorStream = new EventEmitter()`
   - Restore `liveErrorStream.on('error', handler)` in logger
   - Validate EventEmitter working (emit test error)

3. **Investigate Issues**:
   - Check Event Bus statistics (`bus.getStats()`)
   - Review correlation ID generation
   - Validate subscriber patterns (`error.**`)
   - Check backpressure events

## Success Criteria

### Functional ✅
- [ ] Errors emitted to Event Bus (`error.<severity>` topics)
- [ ] Logger receives errors via Event Bus subscription
- [ ] Correlation IDs generated and displayed
- [ ] Event replay working for late subscribers
- [ ] Backpressure control prevents memory leaks

### Quality ✅
- [ ] TypeScript 0 errors throughout implementation
- [ ] Build passing (npm run build)
- [ ] Tests passing (9+ tests, 100% pass rate)
- [ ] Manual testing validates console output

### Performance ✅
- [ ] Error emission latency < 5ms (EventBus overhead)
- [ ] No memory leaks (load test with 1000 errors)
- [ ] Backpressure prevents queue overflow

### Documentation ✅
- [ ] ROUTER.md updates (src/services, src/utils)
- [ ] Agents.md updates (cross-references, architecture)
- [ ] Phase 2.2 completion report (comprehensive analysis)

## Timeline

**Estimated Duration**: 1-2 days

- **Day 1 Morning**: Update ErrorTracker emitter (Phase 2.2.1) + Intelligent Logger subscriber (Phase 2.2.2)
- **Day 1 Afternoon**: Remove EventEmitter dependency (Phase 2.2.3) + Integration tests (Phase 2.2.4)
- **Day 2 Morning**: Manual testing + validation (Phase 2.2.5)
- **Day 2 Afternoon**: Documentation + completion report + commit/push

## Next Steps

After Phase 2.2 completion:
- **Phase 2.3**: DripAlertManager Migration (Week 2)
- **Phase 2.4**: BusMessage Integration (Week 2)
- **Phase 3**: Worker Orchestrator Implementation (Week 3)

---

**Phase 2.2 Status**: 🚧 IN PROGRESS - Ready to begin implementation (Phase 2.1 Event Bus Foundation complete)
