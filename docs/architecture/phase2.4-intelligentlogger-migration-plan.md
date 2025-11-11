# Phase 2.4: IntelligentLogger Event Bus Migration Plan

**Status**: READY
**Created**: 2025-11-11
**Estimated Duration**: 3-5 hours
**Complexity**: LOW-MEDIUM

---

## Executive Summary

**Goal**: Migrate IntelligentLogger from EventEmitter to Event Bus for centralized log event distribution with correlation IDs, replay buffer, and priority queuing.

**Current Architecture**:
- IntelligentLogger extends EventEmitter (line 446)
- Emits 2 event types:
  - `'log'` event (line 544) — emitted for every log entry
  - `'cache:eviction'` event (line 383) — emitted when circular buffer evicts entries
- **Currently has NO external listeners** — events emitted but not consumed elsewhere in codebase
- Already subscribes to Event Bus `error.**` pattern (Phase 2.2.2 integration, line 835)

**Key Insight**: This is a **preventive migration** — IntelligentLogger emits events but has no external consumers yet. Migrating now prevents future coupling to EventEmitter before listeners are added.

**Migration Benefits**:
1. **Centralized log distribution** — Log events flow through Event Bus for cross-service visibility
2. **Correlation IDs** — Track log sequences across async operations
3. **Replay buffer** — Access last 100 log events for debugging/analysis
4. **Priority queuing** — CRITICAL/HIGH priority for errors, NORMAL for info/debug
5. **Consistent architecture** — Aligns with ErrorTracker (Phase 2.2) and DripAlertManager (Phase 2.3)
6. **Future-proof** — Event Bus API ready for when consumers need log events

**Proposed Topics**:
```
log.trace     — Verbose debugging output (NORMAL priority)
log.debug     — Debug information (NORMAL priority)
log.info      — Informational messages (NORMAL priority)
log.warn      — Warning conditions (HIGH priority)
log.error     — Error conditions (CRITICAL priority)
log.fatal     — Fatal errors (CRITICAL priority)
cache.eviction — Circular buffer evictions (NORMAL priority)
```

**Migration Strategy**: 3-phase incremental rollout (backward compatible at each phase)

---

## Current Architecture Analysis

### EventEmitter Usage

**Location**: `src/utils/intelligent-logger.ts`

**Class Definition** (line 446):
```typescript
class IntelligentLogger extends EventEmitter {
  private buffer: CircularBuffer;
  private minLevel: LogLevel;
  private serviceName: string;
  private writeQueue: LogEntry[] = [];
  private writeInterval: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;
  private errorBusSubscriptionId?: string; // Event Bus subscription ID
  
  constructor() {
    super(); // EventEmitter initialization
    // ...
  }
}
```

**Event Emissions**:

1. **'log' event** (line 544):
```typescript
log(level: LogLevel, message: string, options?: LogOptions): void {
  // Create log entry
  const entry = this.createEntry(level, message, options);
  
  // Add to buffer
  this.buffer.add(entry);
  
  // Queue for disk write
  this.writeQueue.push(entry);
  
  // Emit event
  this.emit('log', entry); // ← EventEmitter emission
  
  // Immediate console output for errors/fatal
  if (level === 'error' || level === 'fatal') {
    this.emitToConsole(entry);
  }
}
```

2. **'cache:eviction' event** (line 383, in CircularBuffer class):
```typescript
private evict(): void {
  // ... eviction logic ...
  
  // Emit eviction event
  logger.emit('cache:eviction', { // ← EventEmitter emission
    evicted: evicted.length,
    remaining: this.entries.size,
    freedBytes: evicted.reduce((sum, e) => sum + this.estimateSize(e), 0),
  });
}
```

**Existing Event Bus Integration** (Phase 2.2.2, line 835):
```typescript
private subscribeToErrorStream(): void {
  try {
    const bus = EventBus.getInstance();
    
    // Subscribe to all error events via Event Bus
    this.errorBusSubscriptionId = bus.subscribe('error.**', (event: BusEvent) => {
      const errorEvent: LiveErrorEvent = event.payload;
      // ... log error with enhanced context ...
    });
  } catch (err) {
    console.error('[intelligent-logger] Failed to subscribe to error stream:', err);
  }
}
```

**Consumer Analysis**:
- ✅ **No external consumers found** — grep search for `logger.on(` and `intelligentLogger.on(` returned 0 matches
- ✅ Events are emitted but not subscribed to elsewhere in codebase
- ✅ This is a **preventive migration** — establish Event Bus pattern before future consumers add EventEmitter coupling

---

## Migration Strategy

### 3-Phase Incremental Rollout

**Philosophy**: Maintain backward compatibility at each phase, validate thoroughly before removing legacy code.

### Phase 2.4.1: Add Event Bus Emission (Dual Emission)

**Goal**: Emit log events to Event Bus alongside existing EventEmitter emissions.

**Changes**:
1. Import EventBus in IntelligentLogger class
2. Add Event Bus emissions in `log()` method (parallel to `this.emit('log', entry)`)
3. Add Event Bus emissions in `CircularBuffer.evict()` (parallel to `logger.emit('cache:eviction', ...)`)
4. Map log levels to Event Bus priorities:
   - `trace`, `debug`, `info` → `NORMAL`
   - `warn` → `HIGH`
   - `error`, `fatal` → `CRITICAL`
   - `cache:eviction` → `NORMAL`

**Implementation**:

```typescript
// In log() method (line 544)
log(level: LogLevel, message: string, options?: LogOptions): void {
  // ... existing entry creation logic ...
  
  // Queue for disk write
  this.writeQueue.push(entry);
  
  // PHASE 2.4.1: Emit to Event Bus (parallel to EventEmitter)
  try {
    const bus = EventBus.getInstance();
    const priority = this.mapLogLevelToPriority(level);
    
    bus.emit(`log.${level}`, entry, {
      priority,
      correlationId: options?.correlationId, // Pass through if provided
    });
  } catch (err) {
    console.error('[intelligent-logger] Failed to emit to Event Bus:', err);
  }
  
  // LEGACY: Emit event via EventEmitter (keep for now)
  this.emit('log', entry);
  
  // ... rest of method ...
}

// Add priority mapping helper
private mapLogLevelToPriority(level: LogLevel): EventPriority {
  switch (level) {
    case 'error':
    case 'fatal':
      return 'CRITICAL';
    case 'warn':
      return 'HIGH';
    default:
      return 'NORMAL';
  }
}
```

**Tests**:
- ✅ Verify Event Bus emission for each log level (trace, debug, info, warn, error, fatal)
- ✅ Verify priority mapping (error/fatal → CRITICAL, warn → HIGH, trace/debug/info → NORMAL)
- ✅ Verify correlation ID passthrough
- ✅ Verify EventEmitter emission still works (backward compatibility)
- ✅ Verify graceful degradation on Event Bus failures

**Validation**:
- Run full test suite (expect 23/29+ passing)
- Grep for Event Bus topics: `log.trace`, `log.debug`, `log.info`, `log.warn`, `log.error`, `log.fatal`
- TypeScript 0 errors

**Duration**: 1-1.5 hours

---

### Phase 2.4.2: Add Event Bus Subscriptions (Dual Consumption - Optional)

**Goal**: Add Event Bus subscriptions for log events (for future consumers).

**Note**: Since IntelligentLogger currently has **no external consumers**, this phase is **OPTIONAL** and mainly serves to establish the subscription pattern for future use.

**Potential Use Cases** (future consumers):
1. **Centralized log aggregator** — Subscribe to `log.**` and forward to external service (Datadog, CloudWatch, etc.)
2. **Real-time log monitoring** — Subscribe to `log.error` and `log.fatal` for alerting
3. **Debug console** — Subscribe to `log.**` and stream to web UI for live debugging
4. **Log analytics** — Subscribe to `log.**` and aggregate statistics (error rates, performance trends)

**Implementation Pattern** (example for future reference):

```typescript
// Example: Centralized log aggregator
class LogAggregator {
  private subscriptionId?: string;
  
  start(): void {
    const bus = EventBus.getInstance();
    
    // Subscribe to all log events
    this.subscriptionId = bus.subscribe('log.**', (event: BusEvent) => {
      const entry: LogEntry = event.payload;
      
      // Forward to external service
      this.forwardToExternalService(entry);
    });
  }
  
  stop(): void {
    if (this.subscriptionId) {
      EventBus.getInstance().unsubscribe(this.subscriptionId);
      this.subscriptionId = undefined;
    }
  }
}
```

**Tests** (if implemented):
- ✅ Verify subscription registration
- ✅ Verify event delivery to subscribers
- ✅ Verify wildcard pattern matching (`log.**` receives all log.* events)
- ✅ Verify subscription cleanup on unsubscribe

**Decision**: **DEFER** this phase until actual consumers are identified. Phase 2.4.1 establishes Event Bus emission infrastructure, which is sufficient for now.

**Duration**: N/A (deferred)

---

### Phase 2.4.3: Remove EventEmitter (Event Bus Exclusive)

**Goal**: Remove EventEmitter inheritance and legacy emissions, making Event Bus the sole event distribution mechanism.

**Changes**:
1. Remove `extends EventEmitter` from IntelligentLogger class definition (line 446)
2. Remove `super()` call in constructor
3. Remove `this.emit('log', entry)` from `log()` method (line 544)
4. Remove `logger.emit('cache:eviction', ...)` from CircularBuffer (line 383)
5. Remove EventEmitter import statement

**Implementation**:

```typescript
// BEFORE (Phase 2.4.1/2.4.2):
class IntelligentLogger extends EventEmitter {
  constructor() {
    super(); // EventEmitter initialization
    // ...
  }
  
  log(level: LogLevel, message: string, options?: LogOptions): void {
    // ... entry creation ...
    
    // Event Bus emission
    bus.emit(`log.${level}`, entry, { priority });
    
    // LEGACY: EventEmitter emission (REMOVE in Phase 2.4.3)
    this.emit('log', entry);
  }
}

// AFTER (Phase 2.4.3):
class IntelligentLogger { // ← Remove extends EventEmitter
  constructor() {
    // Remove super(); ← No longer needed
    // ...
  }
  
  log(level: LogLevel, message: string, options?: LogOptions): void {
    // ... entry creation ...
    
    // Event Bus emission (exclusive)
    bus.emit(`log.${level}`, entry, { priority });
    
    // ← Remove this.emit('log', entry);
  }
}
```

**Tests**:
- ✅ Verify IntelligentLogger no longer extends EventEmitter (TypeScript type check)
- ✅ Verify all log events still emit to Event Bus
- ✅ Verify cache:eviction events still emit to Event Bus
- ✅ Verify no EventEmitter methods accessible (`logger.on()`, `logger.emit()`, etc.)
- ✅ Run full test suite (expect 23/29+ passing)

**Validation**:
- Grep for EventEmitter references in intelligent-logger.ts: **expect 0 matches**
- TypeScript 0 errors
- All existing tests passing

**Duration**: 0.5-1 hour

---

## Topic Design

### Proposed Event Bus Topics

```
log.trace       — Verbose debugging output
log.debug       — Debug information
log.info        — Informational messages
log.warn        — Warning conditions
log.error       — Error conditions
log.fatal       — Fatal errors
cache.eviction  — Circular buffer evictions
```

### Topic Naming Rationale

**Log Topics**: Follow standard log level names for clarity and consistency with existing logging conventions.

**Cache Topics**: Use `cache.*` prefix to distinguish buffer management events from log content events.

### Priority Mapping

| Topic | Priority | Rationale |
|-------|----------|-----------|
| `log.trace` | NORMAL | Verbose debugging, low urgency |
| `log.debug` | NORMAL | Debug information, low urgency |
| `log.info` | NORMAL | Informational, low urgency |
| `log.warn` | HIGH | Warning conditions, elevated urgency |
| `log.error` | CRITICAL | Error conditions, high urgency |
| `log.fatal` | CRITICAL | Fatal errors, highest urgency |
| `cache.eviction` | NORMAL | Buffer management, low urgency |

### Wildcard Subscriptions

**Supported patterns**:
- `log.**` — All log events (trace, debug, info, warn, error, fatal)
- `log.error` + `log.fatal` — Error-level events only (CRITICAL priority)
- `cache.**` — All cache events (currently only eviction)

---

## Payload Structure

### Log Event Payload

**Type**: `LogEntry` (existing type from intelligent-logger.ts)

**Structure**:
```typescript
interface LogEntry {
  id: string;                    // Unique entry ID
  timestamp: string;             // ISO 8601 timestamp
  level: LogLevel;               // trace | debug | info | warn | error | fatal
  message: string;               // Log message
  category: LogCategory;         // SYSTEM | DB | CACHE | API | etc.
  service: string;               // Service name (e.g., 'bot', 'worker')
  ai: {
    tags: string[];              // AI-generated tags
    summary: string;             // AI-generated summary
    actionable: boolean;         // Is action required?
    anomaly: boolean;            // Is this anomalous?
  };
  context: {
    correlationId?: string;      // Operation correlation ID
    operation?: {
      name?: string;             // Operation name
      duration?: number;         // Duration in ms
      success?: boolean;         // Operation success status
      retryCount?: number;       // Retry attempts
    };
    error?: {
      name: string;              // Error name
      message: string;           // Error message
      fingerprint: string;       // Error fingerprint
      stack?: string;            // Stack trace
    };
  };
  data?: Record<string, unknown>; // Additional structured data
}
```

**Event Bus Metadata**:
```typescript
{
  topic: 'log.info',             // Event topic
  priority: 'NORMAL',            // Event priority
  correlationId?: string,        // Correlation ID (from options or auto-generated)
  timestamp: Date,               // Event Bus timestamp
}
```

### Cache Eviction Event Payload

**Type**: Custom eviction stats object

**Structure**:
```typescript
interface CacheEvictionEvent {
  evicted: number;               // Number of entries evicted
  remaining: number;             // Entries remaining in buffer
  freedBytes: number;            // Bytes freed by eviction
}
```

**Event Bus Metadata**:
```typescript
{
  topic: 'cache.eviction',
  priority: 'NORMAL',
  correlationId: string,         // Auto-generated
  timestamp: Date,
}
```

---

## Testing Strategy

### Unit Tests

**Location**: `tests/utils/intelligent-logger-event-bus.test.ts` (new file)

**Coverage**:

1. **Phase 2.4.1 Tests** (dual emission):
   - ✅ Log events emit to Event Bus with correct topics
   - ✅ Log events emit to EventEmitter (backward compatibility)
   - ✅ Priority mapping (error/fatal → CRITICAL, warn → HIGH, trace/debug/info → NORMAL)
   - ✅ Correlation ID passthrough from log options
   - ✅ Cache eviction events emit to Event Bus
   - ✅ Graceful degradation on Event Bus failures

2. **Phase 2.4.3 Tests** (Event Bus exclusive):
   - ✅ IntelligentLogger no longer extends EventEmitter
   - ✅ No EventEmitter methods accessible
   - ✅ All log events emit to Event Bus
   - ✅ All cache eviction events emit to Event Bus
   - ✅ Existing functionality preserved (buffer, disk writes, console output)

**Test Pattern**:
```typescript
describe('IntelligentLogger Event Bus Migration', () => {
  describe('Phase 2.4.1: Dual Emission', () => {
    it('should emit log.info event to Event Bus', () => {
      const bus = EventBus.getInstance();
      const events: BusEvent[] = [];
      
      bus.subscribe('log.info', (event) => {
        events.push(event);
      });
      
      logger.info('Test message');
      
      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('log.info');
      expect(events[0].priority).toBe('NORMAL');
      expect(events[0].payload).toHaveProperty('message', 'Test message');
    });
    
    it('should emit to EventEmitter for backward compatibility', () => {
      const events: any[] = [];
      
      logger.on('log', (entry) => {
        events.push(entry);
      });
      
      logger.info('Test message');
      
      expect(events).toHaveLength(1);
      expect(events[0]).toHaveProperty('message', 'Test message');
    });
  });
  
  describe('Phase 2.4.3: Event Bus Exclusive', () => {
    it('should not extend EventEmitter', () => {
      expect(logger).not.toHaveProperty('on');
      expect(logger).not.toHaveProperty('emit');
    });
    
    it('should only emit to Event Bus', () => {
      const bus = EventBus.getInstance();
      const events: BusEvent[] = [];
      
      bus.subscribe('log.info', (event) => {
        events.push(event);
      });
      
      logger.info('Test message');
      
      expect(events).toHaveLength(1);
    });
  });
});
```

### Integration Tests

**Location**: `tests/integration/intelligent-logger-event-bus-integration.test.ts` (new file)

**Coverage**:
- ✅ IntelligentLogger + ErrorTracker Event Bus interaction (existing Phase 2.2.2 integration)
- ✅ Log events flow through Event Bus replay buffer
- ✅ Correlation IDs preserved across log entries
- ✅ Wildcard subscriptions (`log.**`) receive all log events
- ✅ Priority queueing (CRITICAL events processed before NORMAL)

### Regression Tests

**Coverage**:
- ✅ Existing intelligent-logger tests still pass (buffer, disk writes, console output)
- ✅ Log levels respected (minLevel filtering)
- ✅ Timer API (`startTimer()`) still works
- ✅ Shutdown cleanup (`shutdown()`) still works
- ✅ Error stream subscription (Phase 2.2.2) still works

---

## Timeline Estimate

### Phase 2.4.1: Add Event Bus Emission
- Implementation: 45 minutes
- Testing: 30 minutes
- Validation: 15 minutes
- **Total**: 1.5 hours

### Phase 2.4.2: Add Event Bus Subscriptions
- **DEFERRED** (no current consumers)
- **Total**: 0 hours

### Phase 2.4.3: Remove EventEmitter
- Implementation: 20 minutes
- Testing: 20 minutes
- Validation: 10 minutes
- **Total**: 50 minutes

### Documentation & Completion Report
- ROUTER.md updates: 20 minutes
- Completion report: 30 minutes
- **Total**: 50 minutes

### **Grand Total**: 2.8 hours (rounded to 3 hours)

**Confidence**: HIGH (based on Phase 2.3 experience: 4 hours actual vs 9-14 hours estimated)

---

## Risk Assessment

### Low Risk

✅ **No external consumers** — Events currently emitted but not subscribed to elsewhere
✅ **Small surface area** — Only 2 event types to migrate (log, cache:eviction)
✅ **Existing Event Bus integration** — Already subscribes to error.** (Phase 2.2.2)
✅ **Proven migration pattern** — 3-phase rollout validated in Phase 2.2 and 2.3
✅ **Backward compatibility** — Dual emission maintains existing behavior

### Medium Risk

⚠️ **Performance impact** — Event Bus adds latency (~1-2ms per log call)
  - **Mitigation**: Profile with `logger.startTimer()` before/after migration
  - **Acceptance Criteria**: <20ms added latency (95th percentile)

⚠️ **Memory overhead** — Event Bus replay buffer stores last 100 events
  - **Mitigation**: Monitor with `bus.getStats()` after migration
  - **Acceptance Criteria**: <1 MB memory overhead

### High Risk

❌ **None identified** — This is a preventive migration with no external dependencies

---

## Rollback Plan

### Phase 2.4.1 Rollback (if needed)

**Scenario**: Event Bus emission causes performance degradation or errors

**Steps**:
1. Remove Event Bus emission code from `log()` method
2. Remove Event Bus emission code from CircularBuffer
3. Keep EventEmitter emissions (no change)
4. Revert tests
5. Run test suite (expect 23/29+ passing)

**Effort**: 15 minutes

### Phase 2.4.3 Rollback (if needed)

**Scenario**: Removing EventEmitter breaks unexpected dependencies

**Steps**:
1. Re-add `extends EventEmitter` to class definition
2. Re-add `super()` to constructor
3. Re-add `this.emit('log', entry)` to `log()` method
4. Re-add `logger.emit('cache:eviction', ...)` to CircularBuffer
5. Keep Event Bus emissions (dual emission state = Phase 2.4.1)
6. Run test suite (expect 23/29+ passing)

**Effort**: 15 minutes

---

## Success Criteria

### Phase 2.4.1 Success Criteria

✅ **Event Bus emission**: All log events emit to Event Bus with correct topics
✅ **Priority mapping**: error/fatal → CRITICAL, warn → HIGH, trace/debug/info → NORMAL
✅ **Correlation IDs**: Preserved from log options
✅ **Backward compatibility**: EventEmitter emissions still work
✅ **Tests**: New tests passing (10+ tests)
✅ **Build**: TypeScript 0 errors
✅ **Performance**: <20ms added latency (95th percentile)

### Phase 2.4.3 Success Criteria

✅ **EventEmitter removed**: 0 grep matches for EventEmitter in intelligent-logger.ts
✅ **Event Bus exclusive**: All events emit to Event Bus only
✅ **Tests**: All tests passing (23/29+)
✅ **Regression**: Existing functionality preserved
✅ **Documentation**: ROUTER.md updated with Event Bus topics

### Final Completion Criteria

✅ **All phases complete**: Phase 2.4.1 + Phase 2.4.3 (Phase 2.4.2 deferred)
✅ **Test suite**: 23/29+ tests passing
✅ **Build**: TypeScript 0 errors
✅ **Grep validation**: EventEmitter 0 matches in intelligent-logger.ts
✅ **Documentation**: Completion report published
✅ **Metadata**: Prompt.md, NEXT.yaml, ROUTER.md updated

---

## Dependencies

### Required Phases

✅ **Phase 2.1**: Event Bus Foundation (COMPLETE)
  - 574-line Event Bus implementation
  - Topics, priorities, replay buffer, correlation IDs

✅ **Phase 2.2**: ErrorTracker Migration (COMPLETE)
  - 7 commits, EventEmitter removed
  - 23/23 tests passing

✅ **Phase 2.3**: DripAlertManager Migration (COMPLETE)
  - 6 commits, in-memory queue removed
  - 23/29 tests passing

### External Dependencies

✅ **Event Bus runtime**: `src/shared/event-bus.ts`
✅ **TypeScript**: 5.7.3+
✅ **Vitest**: 2.1.8+
✅ **Node.js**: 22.11.0+

---

## Post-Migration Opportunities

### Future Enhancements (Phase 2.5+)

1. **Centralized Log Aggregator** (HIGH value):
   - Subscribe to `log.**` via Event Bus
   - Forward to external service (Datadog, CloudWatch, etc.)
   - Enable cross-service log correlation
   - Estimated effort: 4-6 hours

2. **Real-Time Log Monitoring** (MEDIUM value):
   - Subscribe to `log.error` and `log.fatal`
   - Emit alerts to DripAlertManager
   - Enable proactive error detection
   - Estimated effort: 2-3 hours

3. **Debug Console** (LOW value):
   - Subscribe to `log.**`
   - Stream to web UI for live debugging
   - Enable real-time troubleshooting
   - Estimated effort: 8-10 hours

4. **Log Analytics** (MEDIUM value):
   - Subscribe to `log.**`
   - Aggregate statistics (error rates, performance trends)
   - Enable data-driven optimization
   - Estimated effort: 6-8 hours

---

## Conclusion

**Phase 2.4 is READY for execution**:
- ✅ Clear migration path (3 phases: emit → [defer subscribe] → cleanup)
- ✅ Low risk (no external consumers, proven pattern)
- ✅ Small surface area (2 event types)
- ✅ Solid foundation (Event Bus, ErrorTracker, DripAlertManager)
- ✅ Estimated 3 hours (based on Phase 2.3 experience)

**Key Advantages**:
- Preventive migration establishes Event Bus pattern before consumers are added
- Dual emission maintains backward compatibility
- Incremental rollout reduces risk
- Future-proof for centralized log aggregation and monitoring

**Next Steps**:
1. ✅ User approval of this plan
2. Execute Phase 2.4.1 (dual emission)
3. Skip Phase 2.4.2 (no current consumers)
4. Execute Phase 2.4.3 (remove EventEmitter)
5. Update documentation (ROUTER.md, completion report)
6. Update metadata (Prompt.md, NEXT.yaml)

**Confidence**: HIGH — This migration follows the proven 3-phase pattern from Phase 2.2 and 2.3, with even lower risk due to zero external consumers.

---

**Plan Approved**: [Pending]
**Implementation Start**: [Pending]
**Expected Completion**: [Pending]
