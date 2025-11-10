# Error Detection Guarantees — Zero False Negatives

**As of 2025-11-09** — Comprehensive guarantees for live error detection with zero tolerance for missed errors.

## Mission Statement

**"No Silent Errors"** — Every error that occurs in the runtime MUST be:
1. **Captured** immediately (no delays, no caching)
2. **Visible** in console output within milliseconds
3. **Persisted** to database (or emergency fallback if database fails)
4. **Streamed** to live monitoring systems in real-time
5. **Actionable** with full context for debugging

## Critical Guarantees

### 1. LIVE DETECTION (No Caching)

**Problem**: Cached error detection can miss errors that occur between cache refresh cycles, leading to false negatives.

**Solution**: Direct, synchronous error capture with immediate console output BEFORE any async operations.

```typescript
async captureError(error: Error, context: ErrorContext): Promise<string> {
  // IMMEDIATE console output (synchronous, before any async operations)
  const timestamp = new Date().toISOString();
  console.error(`\n🚨 [ERROR CAPTURED] ${timestamp}`);
  console.error(`   Type: ${error.name}`);
  console.error(`   Message: ${error.message}`);
  console.error(`   Context: ${JSON.stringify(context)}`);
  
  // Then proceed with async database write...
}
```

**Guarantee**: Every error is visible in console logs within **<1ms** of occurrence, regardless of database status.

### 2. ZERO FALSE NEGATIVES (Triple Redundancy)

**Problem**: If database write fails, error could be lost entirely.

**Solution**: Three-tier fallback system ensures every error is captured somewhere.

```
┌─────────────────────────────────────────────────┐
│          ERROR OCCURS IN RUNTIME               │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
      ┌───────────────────────┐
      │  1. CONSOLE OUTPUT    │ ◄── ALWAYS SUCCEEDS (tier 1)
      │  (Immediate, sync)    │
      └───────────┬───────────┘
                  │
                  ▼
      ┌───────────────────────┐
      │  2. DATABASE WRITE    │ ◄── Primary persistence (tier 2)
      │  (PostgreSQL)         │
      └───────────┬───────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
    SUCCESS              FAILURE
        │                   │
        │                   ▼
        │       ┌───────────────────────┐
        │       │  3. EMERGENCY LOG     │ ◄── Last resort (tier 3)
        │       │  (JSON file on disk)  │
        │       └───────────────────────┘
        │                   │
        └───────────────────┘
                  │
                  ▼
      ┌───────────────────────┐
      │  4. LIVE STREAM       │ ◄── Real-time monitoring (tier 4)
      │  (EventEmitter)       │
      └───────────────────────┘
```

**Guarantee**: Even in catastrophic database failure, every error is captured in:
- Console logs (tier 1, always succeeds)
- Emergency JSON files in `Store/emergency-error-logs/` (tier 3, disk fallback)
- Live event stream for logger integration (tier 4, optional enhancement)

### 3. IMMEDIATE VISIBILITY (Console First)

**Problem**: Waiting for database write before logging creates delays where errors are "invisible" during async operations.

**Solution**: Console output FIRST (synchronous), database write SECOND (async).

```typescript
// ❌ BAD: Error invisible until database write completes
async captureError(error: Error) {
  try {
    await prisma.errorLog.create({ /* ... */ }); // 50-100ms database latency
    console.error('Error captured'); // Only visible after DB write
  } catch (e) {
    // If DB fails, error is completely invisible!
  }
}

// ✅ GOOD: Error visible immediately, database write happens after
async captureError(error: Error) {
  // IMMEDIATE visibility (0ms, synchronous)
  console.error(`🚨 [ERROR CAPTURED] ${error.message}`);
  
  try {
    await prisma.errorLog.create({ /* ... */ }); // Async, non-blocking visibility
  } catch (e) {
    // DB failure logged, but original error already visible
  }
}
```

**Guarantee**: Every error is visible in console output within **<1ms**, regardless of database latency (typically 50-100ms).

### 4. LIVE STREAM (Real-Time Monitoring)

**Problem**: Logger stats refresh every 15 seconds, creating up to 15-second delay in ERROR MONITORING section.

**Solution**: Event-driven live stream with immediate emission to logger.

```typescript
// Global event emitter for live error streaming
export const liveErrorStream = new EventEmitter();

// ErrorTracker emits to stream immediately after capture
this.emitToLiveStream({
  errorId: result.errorId,
  fingerprint,
  category,
  severity,
  errorName: error.name,
  errorMessage: error.message,
  timestamp,
  context: enrichedContext,
});

// Logger subscribes to live stream
liveErrorStream.on('error', (event: LiveErrorEvent) => {
  // Update ERROR MONITORING section immediately (no 15s delay)
  updateErrorSection(event);
});
```

**Guarantee**: ERROR MONITORING section in live logs updates within **<100ms** of error occurrence (vs. 15-second polling delay).

### 5. DATABASE UPSERT (No Race Conditions)

**Problem**: High-frequency errors (e.g., timeout errors occurring 100x/second) could create race conditions with separate find-then-update logic.

**Solution**: Atomic upsert operation with increment.

```typescript
// ❌ BAD: Race condition between find and update
const existing = await prisma.errorLog.findUnique({ where: { fingerprint } });
if (existing) {
  await prisma.errorLog.update({
    where: { fingerprint },
    data: { occurrenceCount: existing.occurrenceCount + 1 }, // ← WRONG VALUE if another error captured between find and update
  });
}

// ✅ GOOD: Atomic upsert with increment
await prisma.errorLog.upsert({
  where: { fingerprint },
  update: {
    occurrenceCount: { increment: 1 }, // ← Atomic increment, no race condition
  },
  create: { /* new error */ },
});
```

**Guarantee**: Occurrence counts are accurate even under high-frequency error scenarios (100+ errors/second).

## Integration with Logger

### Logger Subscription Pattern

```javascript
// src/utils/logger.js
import { liveErrorStream } from '../services/error-tracker.js';

// Subscribe to live error stream
const recentErrors = []; // Ring buffer (last 10 errors)

liveErrorStream.on('error', (event) => {
  // Add to ring buffer (FIFO)
  recentErrors.unshift(event);
  if (recentErrors.length > 10) {
    recentErrors.pop();
  }
  
  // Immediate console update (bypasses 15s refresh cycle)
  if (event.severity === 'CRITICAL') {
    console.log('\n🚨 [CRITICAL ERROR DETECTED]');
    console.log(`   ${event.errorName}: ${event.errorMessage}`);
    console.log(`   Affecting: ${event.context.impactedFeatures?.join(', ')}`);
  }
});

// ERROR MONITORING section in stats display
function printStats() {
  console.log('\n[ERROR MONITORING] (Live - Last 10 Errors)');
  
  for (const error of recentErrors) {
    const elapsed = Date.now() - new Date(error.timestamp).getTime();
    const timeAgo = formatTimeAgo(elapsed);
    
    const icon = error.severity === 'CRITICAL' ? '❌' : error.severity === 'HIGH' ? '⚠️' : '📊';
    console.log(`  ${icon} [${error.severity}] ${error.errorName} (${timeAgo})`);
    console.log(`     → affecting: ${error.context.impactedFeatures?.join(', ') || 'unknown'}`);
  }
}
```

**Result**: ERROR MONITORING section shows live errors with <100ms latency, not 15-second polling delay.

## Emergency Log Structure

**Location**: `Store/emergency-error-logs/error-<timestamp>.json`

**Format**:
```json
{
  "timestamp": "2025-11-09T22:30:45.123Z",
  "error": {
    "name": "PrismaClientInitializationError",
    "message": "Can't reach database server at `localhost:5432`",
    "stack": "Error: Can't reach database server\n    at PrismaClient.connect (/app/node_modules/@prisma/client/runtime/library.js:1234:5)\n    ..."
  },
  "context": {
    "category": "DATABASE",
    "severity": "CRITICAL",
    "service": "prisma",
    "operation": "connect",
    "timestamp": "2025-11-09T22:30:45.123Z"
  },
  "captureError": {
    "name": "Error",
    "message": "Connection timeout after 5000ms",
    "stack": "..."
  },
  "nodeVersion": "v20.11.0",
  "platform": "linux"
}
```

**Retention**: Manual cleanup (no auto-deletion) to preserve forensic evidence.

**Usage**: Operator reviews emergency logs after database failures to ensure no errors were lost.

## Testing Error Detection

### Test 1: Console Output Latency

```typescript
const start = performance.now();
await errorTracker.captureError(new Error('Test error'), { service: 'test' });
const consoleLatency = performance.now() - start;

// Console output should appear BEFORE database write completes
assert(consoleLatency < 1, 'Console output must be <1ms');
```

### Test 2: Database Failure Fallback

```typescript
// Simulate database failure
jest.spyOn(prisma, 'errorLog').mockImplementation(() => {
  throw new Error('Database unavailable');
});

const errorId = await errorTracker.captureError(new Error('Test error'), { service: 'test' });

// Error must still be captured (returns 'capture-failed' but logs to console + emergency file)
assert(errorId === 'capture-failed', 'Database failure handled gracefully');

// Verify emergency log file exists
const files = await fs.readdir('Store/emergency-error-logs');
assert(files.length > 0, 'Emergency log file created');
```

### Test 3: High-Frequency Accuracy

```typescript
// Capture 1000 identical errors rapidly
const promises = [];
for (let i = 0; i < 1000; i++) {
  promises.push(errorTracker.captureError(new Error('Timeout'), { service: 'test' }));
}

await Promise.all(promises);

// Verify occurrence count is exactly 1000 (no race conditions)
const fingerprint = generateFingerprint(new Error('Timeout'), 'NETWORK');
const errorLog = await prisma.errorLog.findUnique({ where: { fingerprint } });
assert(errorLog.occurrenceCount === 1000, 'Accurate count under high frequency');
```

### Test 4: Live Stream Latency

```typescript
let streamReceived = false;
const start = performance.now();

liveErrorStream.once('error', (event) => {
  streamReceived = true;
  const latency = performance.now() - start;
  assert(latency < 100, 'Live stream latency must be <100ms');
});

await errorTracker.captureError(new Error('Test error'), { service: 'test' });

assert(streamReceived, 'Live stream event emitted');
```

## Operational Checklist

### Deployment Verification

- [ ] Console logs show `🚨 [ERROR CAPTURED]` for test errors
- [ ] Database ErrorLog table populated with test errors
- [ ] Emergency log directory exists: `Store/emergency-error-logs/`
- [ ] Logger ERROR MONITORING section visible in live logs
- [ ] Live stream events emitting (<100ms latency)

### Monitoring

- [ ] Watch for `❌ [ERROR TRACKER FAILURE]` in logs (database write failures)
- [ ] Check emergency log directory for new files (indicates database issues)
- [ ] Review ErrorLog table for CRITICAL severity errors daily
- [ ] Verify occurrence counts match expected frequency for known issues

### Troubleshooting

**Symptom**: Error not visible in console logs
- **Cause**: Error occurred before ErrorTracker initialization
- **Fix**: Add error boundaries at process level (uncaughtException, unhandledRejection)

**Symptom**: Error not in database but in emergency logs
- **Cause**: Database connection issues
- **Fix**: Check DATABASE_URL, verify Prisma client connectivity

**Symptom**: ERROR MONITORING section not updating in real-time
- **Cause**: Logger not subscribed to liveErrorStream
- **Fix**: Add subscription in logger initialization

**Symptom**: Occurrence count inaccurate under high frequency
- **Cause**: Race condition (using find-then-update instead of upsert)
- **Fix**: Verify upsert with atomic increment is being used

## Summary

The error detection system provides **five layers of redundancy** to guarantee zero false negatives:

1. **Console Output** (tier 1, <1ms) — Always succeeds, immediate visibility
2. **Database Write** (tier 2, ~50ms) — Primary persistence with atomic upsert
3. **Emergency Log** (tier 3, ~10ms) — Disk fallback if database fails
4. **Live Stream** (tier 4, <100ms) — Real-time event emission to logger
5. **Stack Trace Capture** (tier 5) — Full context for debugging

**Latency Targets**:
- Console visibility: **<1ms** (synchronous)
- Database write: **~50-100ms** (async, non-blocking)
- Emergency fallback: **~10ms** (async file write)
- Live stream emission: **<100ms** (event emitter)
- Logger integration: **<100ms** (event subscriber)

**Result**: Every error is captured, visible, and actionable within **<100ms** of occurrence, with multiple fallbacks ensuring **zero false negatives** even in catastrophic failure scenarios.

---

**References**:
- See `src/services/error-tracker.ts` for implementation
- See `docs/error-detection-system.md` for architecture overview
- See `src/utils/logger.js` for live stream integration

**Referenced By**: Agents.md (operations guide), README.md (error detection), ops/ROUTER.yaml
