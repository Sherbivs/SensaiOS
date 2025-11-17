# Section 4: Event Bus

[← Back to INDEX](INDEX.md) | [Next: Logging Architecture →](05-logging-architecture.md)

---

**Status:** Phase 2 COMPLETE (2025-11-11) — Unified Event Bus consolidates 4 fragmented event systems into single observable infrastructure.

**Target Systems Unified:**
1. **EventTracker** — User event batching to PostgreSQL
2. **ErrorTracker live stream** — Real-time error broadcasting
3. **DripAlertManager** — In-memory alert queue with digest
4. **BusMessage** — PostgreSQL async message queue (SKIP LOCKED)

**Fragmentation Problems Solved:**
- **No Event Correlation**: Events emitted to 4 independent systems with no shared context → Events now have UUID correlation IDs for cross-system tracing
- **Duplicate Telemetry**: Same event logged 3x (EventTracker + EngineWriteBuffer + BusMessage) → Single emission to EventBus, subscribers decide persistence
- **No Unified Observability**: Must query 4 systems to understand event flow → Unified event timeline with pattern matching and replay buffer
- **Memory Leak Risk**: EventEmitter unbounded listeners + in-memory queue → Per-subscriber queue limits with drop-oldest backpressure

**Architecture:**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Event Bus (Layer 2)                         │
│                                                                   │
│  EventEmitter + Correlation ID + Event Replay Buffer (100)     │
│  Pattern Match (battle.*) + Subscriber Registry + Backpressure │
└─────────────────────────────────────────────────────────────────┘
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│  EventTracker   │   │  ErrorTracker   │   │  DripAlert      │
│  (PostgreSQL)   │   │  (live stream)  │   │  Manager        │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

**Core API** (`src/shared/event-bus.ts`, 400 lines):

> **CRITICAL: Circular Dependency Prevention (2025-11-17)**  
> Event Bus uses `console.*()` for internal logging instead of `logger.js` to avoid circular dependency during initialization. The `intelligent-logger` subscribes to Event Bus in its constructor, which would trigger `log()` calls before `LOG_LABEL` is initialized, causing "Cannot access before initialization" errors. This is intentional and documented with `/* eslint-disable no-console */`.

```typescript
class EventBus {
  // Singleton
  static getInstance(): EventBus;
  static resetInstance(): void;
  
  // Event emission
  emit(topic: string, payload: any, options?: EmitOptions): CorrelationId;
  emitSync(topic: string, payload: any): void;
  
  // Subscription management
  subscribe(pattern: string, handler: EventHandler, options?: SubscribeOptions): SubscriptionId;
  unsubscribe(subscriptionId: SubscriptionId): boolean;
  unsubscribeAll(pattern?: string): number;
  
  // Event replay (last 100 events, pattern + time filtering)
  replay(pattern: string, since?: Date): BusEvent[];
  getReplayBuffer(): BusEvent[];
  
  // Observability
  getStats(): BusStats;
  getSubscribers(pattern?: string): SubscriberInfo[];
  
  // Lifecycle
  async shutdown(): Promise<void>;
}
```

**Event Structure:**

```typescript
interface BusEvent {
  correlationId: string;         // UUID v4 for cross-system tracing
  topic: string;                 // Dot-separated (battle.started, error.critical)
  payload: any;                  // Event-specific data
  timestamp: Date;               // Emission time
  emitter?: string;              // Service that emitted
  parentCorrelationId?: string;  // For event chains
}
```

**Pattern Matching:**
- **Exact match**: `battle.started` matches only `battle.started`
- **Wildcard**: `battle.*` matches `battle.started`, `battle.ended`, `battle.error`
- **Multi-level**: `battle.**` matches `battle.started`, `battle.turn.1`, `battle.turn.2.move.1`
- **Prefix**: `error.*` matches `error.critical`, `error.validation`, `error.network`

**Event Replay Buffer:**
- FIFO buffer (100 events max)
- Pattern filtering: `replay('battle.*')` returns battle events
- Time filtering: `replay('battle.*', since)` returns events after timestamp
- Use case: Late subscribers receive recent events, debugging full timeline

**Backpressure Control:**
- Per-subscriber queue limits (default 1000 events)
- Drop-oldest strategy when queue full
- Statistics tracking: droppedEvents counter
- Prevents memory leaks from slow subscribers

**Migration Phases:**

**Phase 2.1: Foundation** (Week 1)
- EventBus class implementation (400 lines)
- Test suite (500 lines, 30+ tests)
- Service Registry integration
- Documentation

**Phase 2.2: EventTracker** (Week 1)
- Subscribe EventTracker to `user.**` pattern
- Update 50+ call sites: `eventTracker.track()` → `bus.emit('user.battle.started')`
- Batch events from bus instead of direct track

**Phase 2.3: ErrorTracker** (Week 1)
- Replace `liveErrorStream` EventEmitter with EventBus
- Emit errors to `error.<severity>` topics
- Logger subscribes to `error.**` pattern
- Maintains live ERROR MONITORING section updates

**Phase 2.4: DripAlertManager** (Week 2)
- Replace in-memory queue with EventBus subscriptions
- Emit alerts to `alert.<severity>` topics
- Immediate delivery subscribes to `alert.critical|alert.security`
- Digest subscriber batches `alert.warning|alert.notice` (daily 2 AM Eastern)

**Phase 2.5: BusMessage Integration** (Week 2)
- EventBus → BusMessage bridge: subscribe to `**`, publish to BusMessage
- Use correlation ID as idempotency key
- Workers subscribe to specific patterns: `bus.subscribe('battle.**')`

**Performance:**
- Event emission: <1ms (pattern matching + subscription routing)
- Handler latency: <5ms P99 target
- Load test: 1000 events/sec sustained throughput
- Replay buffer: O(1) append, O(n) pattern filtering

**Statistics Tracked:**
- Events emitted
- Subscriptions active
- Replay buffer size
- Total handler invocations
- Failed handler invocations
- Average handler latency
- Backpressure events (dropped due to queue limits)

**Success Metrics:**
- ✅ TypeScript 0 errors (strict mode)
- ✅ 110+ tests (500 Event Bus + 80 migration)
- ✅ Correlation IDs on every event
- ✅ Pattern matching: exact, wildcard, multi-level
- ✅ Event replay: last 100 events
- ✅ Backpressure: per-subscriber queue limits
- ✅ Incremental migration: old APIs preserved during transition

**Implementation Summary:**
- 400 lines Event Bus core
- 220 lines migration code
- 580 lines tests (110+ tests)
- 4 event systems unified
- <1ms latency per event

---

[← Back to INDEX](INDEX.md) | [Next: Logging Architecture →](05-logging-architecture.md)
