# Phase 2.3: DripAlertManager Event Bus Migration - Implementation Plan

**Created:** 2025-11-11T17:50:00Z  
**Status:** READY  
**Dependencies:** Phase 2.2 complete (ErrorTracker Event Bus migration)  
**Target:** Event Bus integration for alert routing

## Executive Summary

Migrate DripAlertManager from in-memory queue architecture to Event Bus subscriptions for unified alert routing. This migration eliminates in-memory queue management overhead, adds correlation tracking for alert chains, enables event replay for missed alerts, and provides backpressure control for alert flooding scenarios.

**Migration Strategy:** 3-phase incremental rollout with backward compatibility
1. Phase 2.3.1: Add Event Bus emission alongside in-memory queue (dual mode)
2. Phase 2.3.2: Add Event Bus subscribers for immediate and digest delivery
3. Phase 2.3.3: Remove in-memory queue completely (Event Bus only)

**Key Benefits:**
- Correlation tracking for alert chains (parent error → child alerts)
- Event replay for missed alerts (late subscriber recovery)
- Backpressure control for alert flooding (queue limits, drop-oldest)
- Unified observability (all alerts visible in Event Bus statistics)
- Simplified architecture (no manual queue management)

## Current State Analysis

**File:** `src/bot/dripAlerts.js` (319 lines)

**Architecture:**
```
DripAlertManager
├── In-Memory Queue (queue = [])
│   ├── Push alerts (recordAlert)
│   ├── Flush digest (flushDigest)
│   └── Delivery retry (queue.unshift on failure)
├── Immediate Delivery (critical + security)
│   ├── buildImmediateMessage()
│   └── deliverImmediate()
└── Scheduled Digest (warning + notice)
    ├── scheduleDigest() — daily 2 AM Eastern
    └── flushDigest() — batch delivery
```

**Current Flow:**
1. **Alert Recording:** `recordAlert(severity, title, meta)` → normalize → create entry
2. **Immediate Delivery:** critical/security → `deliverImmediate()` → send DM immediately
3. **Digest Queueing:** warning/notice → `queue.push(entry)` → wait for scheduled flush
4. **Digest Delivery:** scheduled timer → `flushDigest()` → batch all queued alerts → send digest DM
5. **Retry on Failure:** delivery fails → `queue.unshift(entry)` → retry next flush

**Problems with Current Approach:**
1. **No Correlation Tracking:** Alerts exist in isolation, can't trace parent error → child alerts
2. **No Event Replay:** Late subscribers (monitoring systems) miss historical alerts
3. **No Backpressure:** Alert flooding can cause unbounded queue growth
4. **Manual Queue Management:** In-memory array requires explicit push/shift/splice logic
5. **No Unified Observability:** Alerts separate from Event Bus, not visible in statistics

**Severity Routing:**
- `SEVERITY.critical` → immediate delivery (🚨 icon)
- `SEVERITY.security` → immediate delivery (🚨 icon)
- `SEVERITY.warning` → digest queue (⚠️ icon)
- `SEVERITY.notice` → digest queue (ℹ️ icon)

**Scheduled Digest:**
- Time: Daily 2 AM Eastern (`digestHour: 2, digestMinute: 0`)
- Guard: `MIN_DIGEST_DELAY_MS` (60s) prevents tight loops
- Fallback: `FALLBACK_DIGEST_DELAY_MS` (1h) for invalid delays
- Rollover: If delay < 60s, add 24h to next window

**Delivery Behavior:**
- Immediate: Send DM instantly for critical/security
- Digest: Batch all warning/notice alerts into single DM
- Retry: Failed deliveries return to queue (unshift) for next attempt
- Empty Digest: Skip digest if queue empty

## Target State Design

**Event Bus Integration:**

### Event Topics
```typescript
// Alert emission topics (by severity)
alert.critical  // 🚨 Immediate delivery required
alert.security  // 🚨 Immediate delivery required
alert.warning   // ⚠️ Digest queue
alert.notice    // ℹ️ Digest queue
```

### Payload Structure
```typescript
interface AlertEvent {
  severity: 'critical' | 'security' | 'warning' | 'notice';
  title: string;
  meta?: string; // JSON stringified metadata
  timestamp: string; // ISO 8601
  recipient?: string; // Discord user ID
}
```

### Correlation IDs
- **Parent Correlation:** When alert triggered by error, include `parentCorrelationId` from ErrorTracker event
- **Alert Chains:** Critical error → multiple follow-up alerts share parent correlation
- **Digest Batching:** All alerts in single digest share digest correlation ID

### Event Bus Subscribers

#### Subscriber 1: Immediate Delivery Handler
```typescript
// Subscribe to critical + security alerts
bus.subscribe('alert.critical', handleImmediateDelivery, { priority: 20 });
bus.subscribe('alert.security', handleImmediateDelivery, { priority: 20 });

async function handleImmediateDelivery(event: BusEvent) {
  const alert: AlertEvent = event.payload;
  const user = await ensureRecipient();
  if (!user) {
    // Re-emit to digest queue if recipient unavailable
    bus.emit('alert.warning', alert, { parentCorrelationId: event.correlationId });
    return;
  }
  const message = buildImmediateMessage(alert, event.correlationId);
  await user.send(message);
}
```

#### Subscriber 2: Digest Queue Handler
```typescript
// Subscribe to warning + notice alerts
bus.subscribe('alert.warning', handleDigestQueue, { priority: 10 });
bus.subscribe('alert.notice', handleDigestQueue, { priority: 10 });

async function handleDigestQueue(event: BusEvent) {
  const alert: AlertEvent = event.payload;
  // Event Bus replay buffer acts as digest queue
  // No explicit queue management needed
}
```

#### Subscriber 3: Digest Flusher (Scheduled)
```typescript
// Scheduled digest delivery
scheduleDigest(); // Existing timer logic unchanged

async function flushDigest() {
  // Replay all warning + notice alerts since last digest
  const alerts = bus.replay('alert.warning', lastDigestTime);
  alerts.push(...bus.replay('alert.notice', lastDigestTime));
  
  if (alerts.length === 0) {
    return; // Skip empty digest
  }
  
  const user = await ensureRecipient();
  if (!user) {
    return; // Retry next digest
  }
  
  const message = buildDigestMessage(alerts);
  await user.send(message);
  
  lastDigestTime = new Date(); // Update last digest time
}
```

### Migration Benefits

1. **Correlation Tracking:**
   - Alert chains visible via `parentCorrelationId`
   - Cross-system tracing (error → alert → digest)
   - Example: `error.critical` (ErrorTracker) → `alert.critical` (immediate) → `alert.warning` (follow-up)

2. **Event Replay:**
   - Late subscribers can replay missed alerts: `bus.replay('alert.**', since)`
   - Monitoring systems see historical alerts without manual state sync
   - Digest flusher uses replay instead of in-memory queue

3. **Backpressure Control:**
   - Per-subscriber queue limits prevent alert flooding
   - Drop-oldest strategy for overwhelmed subscribers
   - Statistics track backpressure events

4. **Unified Observability:**
   - All alerts visible in Event Bus statistics
   - Alert rates tracked: `bus.getStats().topicStats['alert.critical']`
   - Subscriber health monitoring via Event Bus

5. **Simplified Architecture:**
   - No manual queue management (`queue.push`, `queue.splice`, `queue.unshift`)
   - Event Bus handles buffering, replay, delivery
   - Digest flusher uses Event Bus replay instead of in-memory array

## Migration Steps

### Phase 2.3.1: Add Event Bus Emission (Backward Compatible)

**Goal:** Emit alerts to Event Bus alongside existing in-memory queue

**Files to Modify:**
- `src/bot/dripAlerts.js`

**Changes:**
1. Import Event Bus:
   ```javascript
   import { EventBus } from '../shared/event-bus.js';
   ```

2. Add Event Bus emission to `recordAlert()`:
   ```javascript
   async function recordAlert(severity, title, meta = {}) {
     const normalizedSeverity = SEVERITY[severity] ? severity : SEVERITY.warning;
     const normalizedMeta = normalizeMeta(meta);
     const entry = {
       severity: normalizedSeverity,
       title,
       meta: normalizedMeta,
       timestamp: new Date(),
     };
     
     // NEW: Emit to Event Bus
     const bus = EventBus.getInstance();
     const topic = `alert.${normalizedSeverity}`;
     const correlationId = bus.emit(topic, {
       severity: normalizedSeverity,
       title,
       meta: normalizedMeta,
       timestamp: entry.timestamp.toISOString(),
       recipient,
     }, {
       emitter: 'drip-alert-manager',
     });
     
     if (process.env.NODE_ENV !== 'production') {
       console.log(`🔗 Alert Correlation: ${correlationId}`);
     }
     
     // EXISTING: Keep in-memory queue logic (backward compatible)
     if (normalizedSeverity === SEVERITY.critical || normalizedSeverity === SEVERITY.security) {
       return deliverImmediate(entry);
     }
     
     queue.push(entry);
     record('drip-alert-warning', title, {
       severity: normalizedSeverity,
       meta: normalizedMeta,
     });
     return true;
   }
   ```

3. Add correlation ID to immediate delivery messages:
   ```javascript
   function buildImmediateMessage({ title, severity, meta, timestamp }, correlationId) {
     const icon = SEVERITY_ICON[severity] || '⚠️';
     const header = `${icon} DripTVDD Alert — ${title}`;
     const parts = [header, `Severity: ${severity.toUpperCase()}`, `Timestamp: ${formatInTimeZone(timestamp, timeZone, {
       dateStyle: 'short',
       timeStyle: 'short',
     })} (${timeZone})`];
     
     if (correlationId && process.env.NODE_ENV !== 'production') {
       parts.push(`Correlation: ${correlationId}`);
     }
     
     if (meta) {
       parts.push('', '```json', meta, '```');
     }
     return parts.join('\n');
   }
   ```

4. Update `deliverImmediate()` to accept correlation ID:
   ```javascript
   async function deliverImmediate(entry, correlationId) {
     const user = await ensureRecipient();
     if (!user) {
       // ... existing logic
       queue.unshift(entry);
       return false;
     }
     const message = buildImmediateMessage(entry, correlationId);
     // ... rest unchanged
   }
   ```

**Testing:**
- Verify Event Bus emission: Subscribe to `alert.**` pattern, confirm events received
- Verify backward compatibility: In-memory queue still works
- Verify immediate delivery: critical/security alerts sent instantly
- Verify digest queueing: warning/notice alerts queued
- Verify correlation IDs: Unique UUID v4 for each alert

**Expected Behavior:**
- All alerts emitted to Event Bus (dual mode)
- In-memory queue continues working (no functional changes)
- Correlation IDs logged in development mode

### Phase 2.3.2: Add Event Bus Subscribers (Backward Compatible)

**Goal:** Subscribe to Event Bus for immediate and digest delivery

**Files to Modify:**
- `src/bot/dripAlerts.js`

**Changes:**
1. Add subscription IDs for tracking:
   ```javascript
   let immediateSubscriptionIds = [];
   let digestSubscriptionIds = [];
   let lastDigestTime = new Date();
   ```

2. Add Event Bus subscribers in `start()`:
   ```javascript
   function start() {
     if (started) {
       return;
     }
     started = true;
     if (!recipient) {
       logContext('warn', 'Drip alert system inactive (recipient unset)', {});
       return;
     }
     
     // NEW: Subscribe to Event Bus
     const bus = EventBus.getInstance();
     
     // Subscribe to immediate delivery (critical + security)
     immediateSubscriptionIds.push(
       bus.subscribe('alert.critical', async (event) => {
         const alert = event.payload;
         logContext('info', 'Event Bus alert received (immediate)', {
           severity: alert.severity,
           title: alert.title,
           correlationId: event.correlationId,
         });
         // Delivery handled by existing in-memory queue logic for now
       }, { priority: 20, maxQueueSize: 50 })
     );
     
     immediateSubscriptionIds.push(
       bus.subscribe('alert.security', async (event) => {
         const alert = event.payload;
         logContext('info', 'Event Bus alert received (immediate)', {
           severity: alert.severity,
           title: alert.title,
           correlationId: event.correlationId,
         });
         // Delivery handled by existing in-memory queue logic for now
       }, { priority: 20, maxQueueSize: 50 })
     );
     
     // Subscribe to digest queue (warning + notice)
     digestSubscriptionIds.push(
       bus.subscribe('alert.warning', async (event) => {
         const alert = event.payload;
         logContext('info', 'Event Bus alert received (digest)', {
           severity: alert.severity,
           title: alert.title,
           correlationId: event.correlationId,
         });
         // Queueing handled by existing in-memory queue logic for now
       }, { priority: 10, maxQueueSize: 100 })
     );
     
     digestSubscriptionIds.push(
       bus.subscribe('alert.notice', async (event) => {
         const alert = event.payload;
         logContext('info', 'Event Bus alert received (digest)', {
           severity: alert.severity,
           title: alert.title,
           correlationId: event.correlationId,
         });
         // Queueing handled by existing in-memory queue logic for now
       }, { priority: 10, maxQueueSize: 100 })
     );
     
     // EXISTING: Schedule digest
     scheduleDigest();
   }
   ```

3. Add Event Bus cleanup in `stop()`:
   ```javascript
   function stop() {
     // NEW: Unsubscribe from Event Bus
     const bus = EventBus.getInstance();
     immediateSubscriptionIds.forEach(id => bus.unsubscribe(id));
     digestSubscriptionIds.forEach(id => bus.unsubscribe(id));
     immediateSubscriptionIds = [];
     digestSubscriptionIds = [];
     
     // EXISTING: Clear digest timer
     if (digestTimer) {
       clearTimeout(digestTimer);
       digestTimer = null;
     }
     started = false;
   }
   ```

4. Update `flushDigest()` to use Event Bus replay (optional - can defer to Phase 2.3.3):
   ```javascript
   async function flushDigest() {
     // NEW: Use Event Bus replay instead of in-memory queue (optional)
     const bus = EventBus.getInstance();
     const warningAlerts = bus.replay('alert.warning', lastDigestTime);
     const noticeAlerts = bus.replay('alert.notice', lastDigestTime);
     const replayedAlerts = [...warningAlerts, ...noticeAlerts];
     
     if (replayedAlerts.length === 0 && queue.length === 0) {
       logContext('info', 'Drip alert digest skipped (no pending alerts)', {
         recipient: recipient || 'unset',
       });
       return false;
     }
     
     // EXISTING: Use in-memory queue for now (backward compatible)
     const user = await ensureRecipient();
     if (!user) {
       logContext('warn', 'Drip alert digest could not be delivered (recipient missing)', {
         pendingAlerts: queue.length,
       });
       return false;
     }
     
     const items = queue.splice(0, queue.length);
     // ... rest unchanged
     
     lastDigestTime = new Date(); // Update last digest time for replay
   }
   ```

**Testing:**
- Verify Event Bus subscriptions created: Check `bus.getStats().subscriptionsActive`
- Verify subscriber invocation: Log messages confirm Event Bus alerts received
- Verify backward compatibility: In-memory queue still handles delivery
- Verify graceful cleanup: Subscriptions removed on `stop()`

**Expected Behavior:**
- Event Bus subscribers log received alerts
- In-memory queue continues handling delivery (no functional changes)
- Subscriptions cleaned up on shutdown

### Phase 2.3.3: Remove In-Memory Queue (Event Bus Only)

**Goal:** Remove in-memory queue, use Event Bus replay for digest delivery

**Files to Modify:**
- `src/bot/dripAlerts.js`

**Changes:**
1. Remove in-memory queue declaration:
   ```javascript
   // REMOVE: const queue = [];
   ```

2. Update `recordAlert()` to remove queue logic:
   ```javascript
   async function recordAlert(severity, title, meta = {}) {
     const normalizedSeverity = SEVERITY[severity] ? severity : SEVERITY.warning;
     const normalizedMeta = normalizeMeta(meta);
     const entry = {
       severity: normalizedSeverity,
       title,
       meta: normalizedMeta,
       timestamp: new Date(),
     };
     
     // Emit to Event Bus
     const bus = EventBus.getInstance();
     const topic = `alert.${normalizedSeverity}`;
     const correlationId = bus.emit(topic, {
       severity: normalizedSeverity,
       title,
       meta: normalizedMeta,
       timestamp: entry.timestamp.toISOString(),
       recipient,
     }, {
       emitter: 'drip-alert-manager',
     });
     
     if (process.env.NODE_ENV !== 'production') {
       console.log(`🔗 Alert Correlation: ${correlationId}`);
     }
     
     // REMOVE: In-memory queue logic
     // if (normalizedSeverity === SEVERITY.critical || normalizedSeverity === SEVERITY.security) {
     //   return deliverImmediate(entry);
     // }
     // queue.push(entry);
     
     record('drip-alert-queued', title, {
       severity: normalizedSeverity,
       meta: normalizedMeta,
       correlationId,
     });
     return true;
   }
   ```

3. Update Event Bus subscribers to handle delivery:
   ```javascript
   // Immediate delivery subscriber
   bus.subscribe('alert.critical', async (event) => {
     const alert = event.payload;
     const entry = {
       severity: alert.severity,
       title: alert.title,
       meta: alert.meta,
       timestamp: new Date(alert.timestamp),
     };
     await deliverImmediate(entry, event.correlationId);
   }, { priority: 20, maxQueueSize: 50 });
   
   bus.subscribe('alert.security', async (event) => {
     const alert = event.payload;
     const entry = {
       severity: alert.severity,
       title: alert.title,
       meta: alert.meta,
       timestamp: new Date(alert.timestamp),
     };
     await deliverImmediate(entry, event.correlationId);
   }, { priority: 20, maxQueueSize: 50 });
   ```

4. Update `flushDigest()` to use Event Bus replay exclusively:
   ```javascript
   async function flushDigest() {
     const bus = EventBus.getInstance();
     const warningAlerts = bus.replay('alert.warning', lastDigestTime);
     const noticeAlerts = bus.replay('alert.notice', lastDigestTime);
     const allAlerts = [...warningAlerts, ...noticeAlerts];
     
     if (allAlerts.length === 0) {
       logContext('info', 'Drip alert digest skipped (no pending alerts)', {
         recipient: recipient || 'unset',
       });
       return false;
     }
     
     const user = await ensureRecipient();
     if (!user) {
       logContext('warn', 'Drip alert digest could not be delivered (recipient missing)', {
         pendingAlerts: allAlerts.length,
       });
       return false;
     }
     
     const items = allAlerts.map(event => ({
       severity: event.payload.severity,
       title: event.payload.title,
       meta: event.payload.meta,
       timestamp: new Date(event.payload.timestamp),
     }));
     
     const generatedAt = new Date();
     const headerTime = formatInTimeZone(generatedAt, timeZone, {
       dateStyle: 'long',
       timeStyle: 'short',
     });
     const lines = [
       '💧 DripTVDD Daily Alert Digest',
       `Generated ${headerTime} (${timeZone})`,
       '',
     ];
     items.forEach((item, index) => {
       const icon = SEVERITY_ICON[item.severity] || '•';
       const when = formatInTimeZone(item.timestamp, timeZone, { timeStyle: 'short' });
       lines.push(`${index + 1}. [${when}] ${icon} ${item.title}`);
       if (item.meta) {
         lines.push('```json');
         lines.push(item.meta);
         lines.push('```');
       }
       lines.push('');
     });
     const message = lines.join('\n').trim();
     
     try {
       await user.send(message);
       logContext('info', 'Drip alert digest delivered', {
         recipient: describeUser ? describeUser(user) : recipient,
         alertsIncluded: items.length,
       });
       record('drip-alert-digest', `${items.length} alert(s) delivered`, {
         alertsIncluded: items.length,
         generatedAt: generatedAt.toISOString(),
       });
       lastDigestTime = new Date(); // Update last digest time
       return true;
     } catch (error) {
       logContext('error', 'Drip alert digest delivery failed', {
         recipient: describeUser ? describeUser(user) : recipient,
         error: error instanceof Error ? error.message : String(error),
       });
       // Event Bus replay will retry on next digest (no manual queue management)
       return false;
     }
   }
   ```

5. Remove queue-based retry logic from `deliverImmediate()`:
   ```javascript
   async function deliverImmediate(entry, correlationId) {
     const user = await ensureRecipient();
     if (!user) {
       logContext('warn', 'Drip alert immediate delivery skipped (recipient missing)', {
         title: entry.title,
         severity: entry.severity,
       });
       // REMOVE: queue.unshift(entry);
       // NEW: Re-emit to digest queue for retry
       const bus = EventBus.getInstance();
       bus.emit('alert.warning', {
         severity: entry.severity,
         title: entry.title,
         meta: entry.meta,
         timestamp: entry.timestamp.toISOString(),
         recipient,
       }, {
         emitter: 'drip-alert-manager',
         parentCorrelationId: correlationId,
       });
       record('drip-alert-warning', entry.title, {
         severity: entry.severity,
         meta: entry.meta,
         reason: 'recipient-missing',
       });
       return false;
     }
     const message = buildImmediateMessage(entry, correlationId);
     try {
       await user.send(message);
       logContext('info', 'Drip alert delivered', {
         recipient: describeUser ? describeUser(user) : recipient,
         severity: entry.severity,
         title: entry.title,
       });
       record('drip-alert-critical', entry.title, {
         severity: entry.severity,
         meta: entry.meta ? entry.meta : undefined,
       });
       return true;
     } catch (error) {
       logContext('error', 'Drip alert immediate delivery failed', {
         recipient: describeUser ? describeUser(user) : recipient,
         severity: entry.severity,
         title: entry.title,
         error: error instanceof Error ? error.message : String(error),
       });
       // REMOVE: queue.unshift(entry);
       // NEW: Re-emit to digest queue for retry
       const bus = EventBus.getInstance();
       bus.emit('alert.warning', {
         severity: entry.severity,
         title: entry.title,
         meta: entry.meta,
         timestamp: entry.timestamp.toISOString(),
         recipient,
       }, {
         emitter: 'drip-alert-manager',
         parentCorrelationId: correlationId,
       });
       record('drip-alert-warning', entry.title, {
         severity: entry.severity,
         meta: entry.meta,
         reason: 'delivery-failed',
       });
       return false;
     }
   }
   ```

**Testing:**
- Verify in-memory queue removed: grep confirms 0 `queue` references
- Verify Event Bus replay works: Digest delivers all warning/notice alerts
- Verify immediate delivery: critical/security alerts sent via Event Bus subscribers
- Verify retry behavior: Failed deliveries re-emitted to digest queue
- Verify scheduled digest: Still runs daily 2 AM Eastern
- Build status: TypeScript 0 errors

**Expected Behavior:**
- In-memory queue completely removed
- Event Bus replay provides digest buffering
- Immediate delivery handled by Event Bus subscribers
- Failed deliveries re-emitted to digest queue (parent correlation preserved)

## Testing Strategy

### Unit Tests (25+ tests recommended)

1. **Event Emission Tests (5 tests)**
   - Emit critical alert → verify `alert.critical` topic
   - Emit security alert → verify `alert.security` topic
   - Emit warning alert → verify `alert.warning` topic
   - Emit notice alert → verify `alert.notice` topic
   - Emit with correlation ID → verify UUID v4 format

2. **Immediate Delivery Tests (5 tests)**
   - Subscribe to `alert.critical` → verify handler invoked
   - Subscribe to `alert.security` → verify handler invoked
   - Immediate delivery success → verify DM sent
   - Immediate delivery failure → verify re-emit to `alert.warning`
   - Recipient missing → verify re-emit to `alert.warning`

3. **Digest Queue Tests (5 tests)**
   - Subscribe to `alert.warning` → verify handler invoked
   - Subscribe to `alert.notice` → verify handler invoked
   - Digest replay → verify warnings + notices collected
   - Empty digest → verify skip (no DM sent)
   - Digest delivery success → verify DM sent with all alerts

4. **Correlation Tracking Tests (3 tests)**
   - Alert chain → verify parent correlation preserved
   - Failed delivery → verify parent correlation in re-emitted alert
   - Digest batch → verify all alerts share digest correlation

5. **Backpressure Tests (3 tests)**
   - Alert flooding → verify backpressure detected
   - Queue limit exceeded → verify drop-oldest strategy
   - Backpressure statistics → verify tracking

6. **Scheduled Digest Tests (4 tests)**
   - Schedule next digest → verify delay calculation (2 AM Eastern)
   - Digest rollover → verify min 60s delay guard
   - Digest fallback → verify 1h fallback for invalid delays
   - Digest replay since last time → verify timestamp filtering

### Integration Tests

1. **Full Alert Flow Test:**
   - Emit critical alert → verify immediate delivery
   - Emit warning alert → verify digest queueing
   - Trigger digest flush → verify batch delivery
   - Verify correlation IDs preserved throughout

2. **Retry Flow Test:**
   - Emit critical alert with recipient unavailable
   - Verify re-emit to `alert.warning`
   - Verify parent correlation preserved
   - Trigger digest flush → verify retry delivery

3. **Event Bus Integration Test:**
   - Subscribe monitoring system to `alert.**`
   - Emit multiple alerts
   - Verify monitoring system receives all alerts
   - Verify Event Bus statistics updated

### Manual Testing

1. **Immediate Delivery:**
   - Trigger critical error in production
   - Verify DM received instantly
   - Verify correlation ID in message (dev mode)

2. **Digest Delivery:**
   - Trigger multiple warning alerts
   - Wait for scheduled digest (2 AM Eastern)
   - Verify batch DM received with all alerts

3. **Scheduled Digest:**
   - Verify digest runs daily 2 AM Eastern
   - Verify rollover protection (min 60s delay)
   - Verify fallback delay (1h) for invalid delays

## Success Criteria

### Functional Requirements
- ✅ All alerts emitted to Event Bus topics (`alert.<severity>`)
- ✅ Immediate delivery works for critical + security alerts
- ✅ Digest queueing works for warning + notice alerts
- ✅ Scheduled digest runs daily 2 AM Eastern
- ✅ Failed deliveries re-emitted to digest queue
- ✅ Correlation IDs tracked throughout alert chain
- ✅ Event Bus replay provides digest buffering

### Non-Functional Requirements
- ✅ Build passing: TypeScript 0 errors
- ✅ Tests passing: 25+ tests (100% coverage)
- ✅ grep validation: 0 `queue = []` references (Phase 2.3.3)
- ✅ Performance: <1ms Event Bus emit latency
- ✅ Memory: No in-memory queue overhead (Phase 2.3.3)

### Documentation Requirements
- ✅ Implementation plan created (this document)
- ✅ Completion report documenting achievements
- ✅ ROUTER.md updated (src/bot/, tests/, docs/architecture/)
- ✅ Integration tests document alert flow

## Migration Risks & Mitigations

### Risk 1: Digest Timing Regression
**Risk:** Event Bus replay might miss alerts if `lastDigestTime` not updated correctly  
**Mitigation:** Update `lastDigestTime` only after successful delivery  
**Validation:** Manual test digest delivery, verify no duplicate/missing alerts

### Risk 2: Failed Delivery Retry Loop
**Risk:** Re-emitting failed deliveries could cause infinite loop  
**Mitigation:** Re-emit to digest queue (not immediate), rely on scheduled digest retry  
**Validation:** Test failed delivery scenario, verify no infinite loop

### Risk 3: Event Bus Replay Buffer Overflow
**Risk:** If digest doesn't run for 24+ hours, replay buffer (100 events) might overflow  
**Mitigation:** Monitor Event Bus statistics for replay buffer size, alert if >80%  
**Validation:** Load test with >100 alerts, verify FIFO eviction works

### Risk 4: Correlation ID Tracking Failure
**Risk:** Correlation IDs might not propagate through alert chain  
**Mitigation:** Explicitly pass `parentCorrelationId` in all re-emits  
**Validation:** Integration tests verify correlation preserved in retry scenarios

### Risk 5: Scheduled Digest Delay Regression
**Risk:** Digest delay calculation might break if timezone logic changes  
**Mitigation:** Keep existing `scheduleDigest()` logic unchanged  
**Validation:** Manual test digest scheduling, verify 2 AM Eastern runs

## Implementation Timeline

- **Phase 2.3.1:** 2-3 hours (Event Bus emission + correlation IDs)
- **Phase 2.3.2:** 2-3 hours (Event Bus subscribers + graceful cleanup)
- **Phase 2.3.3:** 2-3 hours (Remove in-memory queue + Event Bus replay)
- **Testing:** 2-3 hours (25+ unit tests + 3 integration tests)
- **Documentation:** 1-2 hours (ROUTER.md updates + completion report)

**Total Estimated Time:** 9-14 hours (1-2 days)

## Commit Strategy

1. **Commit 1:** Phase 2.3.1 - Add Event Bus emission (backward compatible)
2. **Commit 2:** Phase 2.3.2 - Add Event Bus subscribers (backward compatible)
3. **Commit 3:** Phase 2.3.3 - Remove in-memory queue (Event Bus only)
4. **Commit 4:** Phase 2.3.4 - Add integration tests
5. **Commit 5:** Phase 2.3.5 - Update ROUTER.md documentation
6. **Commit 6:** Phase 2.3 completion report

**Expected:** 6-7 commits total

## References

- Phase 2.1 Event Bus Foundation: `docs/architecture/phase2.1-event-bus-foundation-complete.md`
- Phase 2.2 ErrorTracker Migration: `docs/architecture/phase2.2-errortracker-migration-complete.md`
- Event Bus Implementation: `src/shared/event-bus.ts`
- DripAlertManager Current: `src/bot/dripAlerts.js`
- Integration Tests Example: `tests/error-tracker-bus-integration.test.ts`
