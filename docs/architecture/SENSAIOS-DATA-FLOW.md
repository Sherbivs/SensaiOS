# SensaiOS — Data Flow Architecture

**Document Type:** Architecture Diagram  
**Status:** Current  
**Version:** 1.0.0  
**Last Updated:** 2025-12-30  
**Related:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md), [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md), [SENSAIOS-OBSERVABILITY-LAYER.md](./SENSAIOS-OBSERVABILITY-LAYER.md)

---

## Overview

This document details **how data flows through the SensaiOS 3-layer architecture** — from user-space (Application/Observability) through OS (SensaiOS) to mainframe substrate (Kernel) and finally to database persistence.

**Architecture Layers:**
```
Layer 3: Application & Observability (User Space) — Domain systems
         ↓
Layer 2: SensaiOS (OS Abstractions) — Component model, lifecycle
         ↓
Layer 1: Kernel (Mainframe Substrate) — Metrics, DB control, parsing → DB
```

**Four Primary Data Flows:**
1. **Log Flow**: Application logs → Kernel (parse) → Hub → Loki → DB
2. **Error Flow**: Errors → Kernel (parse/route) → Hub → Loki → DB
3. **Metric Flow**: Metrics → Kernel (aggregate) → Hub → Loki → DB
4. **Event Flow**: Events → Event Bus → Hub → Loki → DB

---

## 1. Log Flow

### Overview
Application code logs via adapters → Kernel observes → Hub routes → Loki persists.

### Detailed Flow

```
APPLICATION CODE
    │
    ├─ Discord Bot: appLog.info('Battle started', { battleId })
    ├─ Worker: workerLog.info('Cache refreshed', { entries: 100 })
    └─ Direct: useLoggerHook().info('system', 'op', 'message', { data })
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ APPLICATION LAYER (Adapters)                                │
│ • appLog (discord-adapter)                                  │
│ • workerLog (worker-adapter)                                │
│ • Hook: useLoggerHook() (infrastructure-adapter)            │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Call useLoggerHook()
                              │ (from kernel/kernel-hooks.ts)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ KERNEL LAYER                                                │
│ kernel-logger.ts: logToKernel()                             │
│   1. Create LogObservation:                                 │
│      {                                                      │
│        timestamp, level, component, operation, message,     │
│        data, correlationId, parentCorrelationId            │
│      }                                                      │
│   2. Push to ring buffer (KERNEL_STATE.logs)               │
│      • Size: 5000 entries                                  │
│      • Overwrite policy: FIFO circular buffer              │
│   3. Emit to kernel observer                                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Observer detects new log
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ KERNEL OBSERVER (kernel-observer.ts)                        │
│   • Query: queryKernel({ kind: 'log', limit: 100 })        │
│   • Convert: LogObservation → BusEvent                      │
│   • Emit to Event Bus: eventBus.emit(event)               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Event Bus broadcast
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ EVENT BUS (shared/event-bus.ts)                             │
│   Pattern: 'log.**'                                         │
│   Subscribers:                                              │
│   • ObservabilityHub ('**' pattern - all events)           │
│   • Application handlers (specific patterns)                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Hub subscription triggered
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OBSERVABILITY HUB (observability-hub.ts)                    │
│   1. Receive BusEvent from Event Bus                        │
│   2. Convert: BusEvent → ObservabilityEvent                │
│      {                                                      │
│        timestamp, topic, level, service, payload,           │
│        correlationId, parentCorrelationId                   │
│      }                                                      │
│   3. Fan out to all registered backends                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Backend.receive()
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOKI BACKEND (loki-backend.ts)                              │
│   1. Receive ObservabilityEvent                             │
│   2. Convert: ObservabilityEvent → LokiLogEntry           │
│      {                                                      │
│        timestamp, level, service, topic, message,           │
│        data: { ...payload, correlationId, ... }            │
│      }                                                      │
│   3. Queue.push() (fire-and-forget, never blocks)         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Queued for flush
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOKI QUEUE (loki-queue.ts)                                  │
│   • Bounded: 10,000 entries max                            │
│   • Backpressure: 75% warn, 95% reject                     │
│   • Flush Worker drains every 5 seconds                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ FlushWorker periodic drain
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOKI FLUSH WORKER (loki-flush-worker.ts)                    │
│   • Interval: 5 seconds                                    │
│   • Batch size: 100 entries                                │
│   • Circuit breaker check before sending                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Circuit breaker CLOSED?
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOKI CIRCUIT BREAKER (loki-circuit-breaker.ts)              │
│   States:                                                   │
│   • CLOSED: Pass through (normal operation)                │
│   • OPEN: Block all requests (too many failures)           │
│   • HALF_OPEN: Allow probe requests (recovery attempt)     │
│                                                             │
│   If CLOSED:                                                │
│     → HttpTransport.send()                                 │
│   If OPEN/HALF_OPEN:                                        │
│     → Drop batch (HealthWorker will retry later)           │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ HTTP POST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOKI HTTP TRANSPORT (loki-http-transport.ts)                │
│   POST {LOKI_ENDPOINT}/loki/api/v1/push                    │
│   Body: {                                                   │
│     streams: [{                                             │
│       stream: { level, service, topic },                   │
│       values: [[timestamp_ns, json_string], ...]           │
│     }]                                                      │
│   }                                                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Success/Failure
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LOKI SERVICE (External)                                     │
│   • Receives logs via HTTP                                 │
│   • Indexes by labels (level, service, topic)              │
│   • Stores in time-series format                           │
│   • Queryable via LogQL                                    │
└─────────────────────────────────────────────────────────────┘
```

### Transformations

| Stage | Format | Key Fields |
|-------|--------|------------|
| Application | `appLog.info(...)` | message, data object |
| Kernel | `LogObservation` | timestamp, level, component, operation, message, data, correlationId |
| Event Bus | `BusEvent` | topic, payload (contains LogObservation) |
| Hub | `ObservabilityEvent` | timestamp, topic, level, service, payload, correlationId |
| Loki Backend | `LokiLogEntry` | timestamp, level, service, topic, message, data |
| Loki Service | Loki stream format | timestamp_ns, json_string, labels |

---

## 2. Error Flow

### Overview
Errors thrown → Caught by runGuarded or error handlers → Kernel detects → Routed → Hub → Loki.

### Detailed Flow

```
APPLICATION CODE
    │
    ├─ throw new Error('Battle failed')
    ├─ throw kernelError(KERNEL_ERRORS.BOOT_FAILED, 'Boot failed')
    └─ Caught by runGuarded() wrapper
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ RUN GUARDED (sensaios/run-guarded.ts)                       │
│   try {                                                     │
│     await handler();                                        │
│   } catch (error) {                                         │
│     const canonical = toCanonicalError(error);             │
│     await routeError(canonical, context);                  │
│     if (rethrow) throw canonical;                          │
│   }                                                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Convert to CanonicalError
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ CANONICAL ERROR (sensaios/canonical-error.ts)               │
│   toCanonicalError(error):                                  │
│   • If SensaiError: Use as-is                              │
│   • If Error: Convert to generic error                     │
│   • Attach context: { correlationId, scope, stack }       │
│                                                             │
│   Result: CanonicalError with code, message, context,      │
│           cause, scope, correlationId                       │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Route based on error code
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ ERROR ROUTING (sensaios/error-routing.ts)                   │
│   routeError(error, context):                               │
│   1. Log error via kernel (useErrorTrackerHook())          │
│   2. Determine routing based on code:                      │
│      • 1xxx (Kernel): Critical system error                │
│      • 2xxx (Database): Retry or alert                     │
│      • 3xxx (Component): Component issue                   │
│      • 4xxx (Validation): User error                       │
│      • 5xxx (External): Third-party failure                │
│      • 6xxx (Game): Game logic error                       │
│   3. Route to appropriate handlers                         │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Log to kernel
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ KERNEL ERROR TRACKER (kernel/error-detector.ts)             │
│   errorToKernel():                                          │
│   1. Create ErrorObservation:                               │
│      {                                                      │
│        timestamp, code, message, stack, context,            │
│        cause, correlationId, parentCorrelationId           │
│      }                                                      │
│   2. Push to ring buffer (KERNEL_STATE.errors)             │
│      • Size: 1000 entries                                  │
│      • Overwrite policy: FIFO circular buffer              │
│   3. Emit to kernel observer                                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Observer detects new error
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ KERNEL OBSERVER (kernel-observer.ts)                        │
│   • Query: queryKernel({ kind: 'error', limit: 100 })      │
│   • Convert: ErrorObservation → BusEvent                    │
│   • Emit to Event Bus: eventBus.emit(event)               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Event Bus broadcast
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ EVENT BUS (shared/event-bus.ts)                             │
│   Pattern: 'error.**'                                       │
│   Subscribers:                                              │
│   • ObservabilityHub ('**' pattern - all events)           │
│   • Error handlers (specific patterns)                      │
│   • Alert systems (critical error patterns)                 │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Hub subscription triggered
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OBSERVABILITY HUB (observability-hub.ts)                    │
│   1. Receive BusEvent from Event Bus                        │
│   2. Convert: BusEvent → ObservabilityEvent                │
│      {                                                      │
│        timestamp, topic: 'error', level: 'error',          │
│        service, payload: { code, message, stack, ... },     │
│        correlationId, parentCorrelationId                   │
│      }                                                      │
│   3. Fan out to all registered backends                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ [Same as Log Flow: Backend → Queue → Flush → Loki]
                              ▼
                         (See Log Flow above)
```

### Error Code Routing

| Code Range | Category | Routing Action |
|------------|----------|----------------|
| 1xxx | Kernel | Alert operators, log to Loki with 'critical' label |
| 2xxx | Database | Retry with backoff, alert if persistent |
| 3xxx | Component | Log to Loki, notify component owner |
| 4xxx | Validation | Log to Loki with 'warn' level, user-facing error |
| 5xxx | External | Retry with exponential backoff, circuit breaker |
| 6xxx | Game | Log to Loki, game-specific error handling |

---

## 3. Metric Flow

### Overview
Application emits metrics → Kernel aggregates → Hub routes → Loki persists.

### Detailed Flow

```
APPLICATION CODE
    │
    ├─ ctx.obs.metrics.inc('battle.completed', { outcome: 'victory' })
    ├─ ctx.obs.metrics.gauge('cache.size', 1024, { namespace: 'pokemon' })
    └─ ctx.obs.metrics.timing('db.query', 12, { table: 'Trainer' })
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ APPLICATION LAYER (ObsPrimitive)                            │
│ • ComponentContext.obs.metrics.inc/gauge/timing             │
│ • Calls useInfrastructureHook() (from kernel)              │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Call kernel hook
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ KERNEL INFRASTRUCTURE (kernel/kernel-metrics.ts)            │
│   observeInfraMetric():                                     │
│   1. Create ResourceMetricObservation:                      │
│      {                                                      │
│        timestamp, category, name, value, unit,              │
│        labels, threshold?, correlationId                    │
│      }                                                      │
│   2. Push to ring buffer (KERNEL_STATE.infra)              │
│      • Size: 500 entries                                   │
│      • Overwrite policy: FIFO circular buffer              │
│   3. Update aggregated metrics:                            │
│      • KERNEL_STATE.aggregated (counts, sums, avgs)        │
│   4. Emit to kernel observer                                │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Observer detects new metric
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ KERNEL OBSERVER (kernel-observer.ts)                        │
│   • Query: queryKernel({ kind: 'infra', limit: 100 })      │
│   • Convert: ResourceMetricObservation → BusEvent          │
│   • Emit to Event Bus: eventBus.emit(event)               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Event Bus broadcast
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ EVENT BUS (shared/event-bus.ts)                             │
│   Pattern: 'metric.**'                                      │
│   Subscribers:                                              │
│   • ObservabilityHub ('**' pattern - all events)           │
│   • Metrics aggregators (specific patterns)                 │
│   • Alerting systems (threshold patterns)                   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Hub subscription triggered
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OBSERVABILITY HUB (observability-hub.ts)                    │
│   1. Receive BusEvent from Event Bus                        │
│   2. Convert: BusEvent → ObservabilityEvent                │
│      {                                                      │
│        timestamp, topic: 'metric.{category}.{name}',       │
│        level: 'info', service, payload: { value, unit, ... },│
│        correlationId                                        │
│      }                                                      │
│   3. Fan out to all registered backends                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ [Same as Log Flow: Backend → Queue → Flush → Loki]
                              ▼
                         (See Log Flow above)
```

### Metric Categories (10 Categories)

| Category | Examples | Aggregation |
|----------|----------|-------------|
| MEMORY | heap_used, heap_total, rss | gauge (current value) |
| CPU | cpu_usage, load_average | gauge (current value) |
| DISK | disk_used, disk_available | gauge (current value) |
| NETWORK | bytes_sent, bytes_received | counter (cumulative) |
| DATABASE | query_duration, connection_count | timing + gauge |
| CACHE | cache_hits, cache_misses, cache_size | counter + gauge |
| WORKER | worker_queue_size, worker_errors | gauge + counter |
| DISCORD | api_calls, rate_limit_hits | counter |
| GAME | battles_completed, encounters_generated | counter |
| SYSTEM | uptime, boot_time | gauge |

---

## 4. Event Flow

### Overview
Custom events → Event Bus → Hub → Loki (parallel to kernel flow).

### Detailed Flow

```
APPLICATION CODE
    │
    ├─ eventBus.emit({ topic: 'battle.started', payload: { battleId, trainerId } })
    ├─ eventBus.emit({ topic: 'cache.invalidated', payload: { key, reason } })
    └─ eventBus.emit({ topic: 'security.sweep.completed', payload: { guildId, changes } })
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ EVENT BUS (shared/event-bus.ts)                             │
│   • Pattern matching: '**' matches all, 'battle.*' specific │
│   • Subscribers notified in order of registration           │
│   • Backpressure: 75% warn, 95% reject new events          │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ Hub subscribed to '**'
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OBSERVABILITY HUB (observability-hub.ts)                    │
│   1. Receive BusEvent directly from Event Bus               │
│   2. Convert: BusEvent → ObservabilityEvent                │
│      {                                                      │
│        timestamp: event.timestamp || new Date(),           │
│        topic: event.topic,                                  │
│        level: deriveLevelFromTopic(topic),                 │
│        service: 'infinity-gauntlet',                       │
│        payload: event.payload,                              │
│        correlationId: event.correlationId,                 │
│        parentCorrelationId: event.parentCorrelationId      │
│      }                                                      │
│   3. Fan out to all registered backends                    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ [Same as Log Flow: Backend → Queue → Flush → Loki]
                              ▼
                         (See Log Flow above)
```

### Direct Hub Ingestion (Bypass Event Bus)

```
APPLICATION CODE (Security Bot)
    │
    └─ observabilityHub.ingest({ timestamp, topic, level, service, payload })
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ OBSERVABILITY HUB (observability-hub.ts)                    │
│   ingest(event: ObservabilityEvent):                        │
│   • Directly fan out to backends (no Event Bus)            │
│   • Same backend routing as Event Bus flow                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              │ [Same as Log Flow: Backend → Queue → Flush → Loki]
                              ▼
                         (See Log Flow above)
```

---

## 5. Unified Flow Comparison

### All Four Flows Side-by-Side

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│   LOG FLOW   │  ERROR FLOW  │ METRIC FLOW  │  EVENT FLOW  │
├──────────────┼──────────────┼──────────────┼──────────────┤
│              │              │              │              │
│ appLog.info()│ throw Error  │ obs.metrics  │ eventBus.    │
│              │              │ .inc()       │ emit()       │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ useLoggerHook│ runGuarded   │ useInfra     │ (direct to   │
│ ()           │ catches      │ Hook()       │  Event Bus)  │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ kernel-logger│ toCanonical  │ kernel-      │ Event Bus    │
│              │ Error        │ metrics      │              │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ Log          │ Error        │ Resource     │ BusEvent     │
│ Observation  │ Observation  │ Metric       │ (as-is)      │
│      ↓       │      ↓       │ Observation  │      ↓       │
│              │              │      ↓       │              │
│ Ring Buffer  │ Ring Buffer  │ Ring Buffer  │ (skip        │
│ (5000)       │ (1000)       │ (500)        │  buffer)     │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ Kernel       │ Kernel       │ Kernel       │ (direct)     │
│ Observer     │ Observer     │ Observer     │              │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ Event Bus    │ Event Bus    │ Event Bus    │ Event Bus    │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ Observability Hub (All flows converge here)              │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ Loki Backend (Queue → Flush → Circuit Breaker → HTTP)    │
│      ↓       │      ↓       │      ↓       │      ↓       │
│              │              │              │              │
│ Loki Service (External persistence)                      │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 6. Key Decision Points

### 1. Should This Go Through Kernel?

| Source | Via Kernel? | Reason |
|--------|-------------|--------|
| Application logs | ✅ YES | Kernel observes all logs |
| Application errors | ✅ YES | runGuarded routes through kernel |
| Application metrics | ✅ YES | Infrastructure hooks |
| Event Bus events | ❌ NO | Hub subscribes directly |
| Security Bot events | ❌ NO | Direct hub ingestion |

### 2. Should This Go Through Event Bus?

| Source | Via Event Bus? | Reason |
|--------|----------------|--------|
| Kernel observations | ✅ YES | Observer emits to bus |
| Security Bot | ❌ NO | Direct hub ingestion |
| Custom events | ✅ YES | Primary event mechanism |
| Hub ingestion | ❌ NO | Hub is the endpoint |

### 3. Should This Be Buffered?

| Source | Buffered? | Where | Size |
|--------|-----------|-------|------|
| Logs | ✅ YES | Kernel ring buffer | 5000 |
| Errors | ✅ YES | Kernel ring buffer | 1000 |
| Metrics | ✅ YES | Kernel ring buffer | 500 |
| Events | ❌ NO | Direct to bus | N/A |
| Loki entries | ✅ YES | Loki queue | 10000 |

---

## 7. Performance Characteristics

### Latency Breakdown (Typical Log Entry)

| Stage | Latency | Notes |
|-------|---------|-------|
| `appLog.info()` call | <10μs | Function call overhead |
| Kernel logger | ~50μs | Ring buffer push + observer notify |
| Event Bus emit | ~100μs | Pattern matching + subscriber notify |
| Hub receive | ~10μs | Conversion + fan-out |
| Loki queue push | <5μs | Array push (fire-and-forget) |
| **Total (sync path)** | **~175μs** | **Application never blocks** |
| Flush worker | 5s interval | Background, async |
| HTTP transport | ~50ms | Network roundtrip |
| **Total (end-to-end)** | **~5.05s** | **From app to Loki** |

### Throughput

| Component | Throughput | Bottleneck |
|-----------|------------|------------|
| Kernel logger | 100k+ entries/sec | Ring buffer (in-memory) |
| Event Bus | 10k+ events/sec | Subscriber callbacks |
| Observability Hub | 10k+ events/sec | Backend fan-out |
| Loki queue | 2k+ entries/sec | Flush interval (5s) |
| Loki HTTP | 100+ batches/sec | Network + Loki ingestion |

### Memory Usage

| Component | Memory | Policy |
|-----------|--------|--------|
| Kernel logs buffer | ~5 MB | 5000 × 1 KB entries |
| Kernel errors buffer | ~1 MB | 1000 × 1 KB entries |
| Kernel metrics buffer | ~500 KB | 500 × 1 KB entries |
| Event Bus queue | ~1 MB | Bounded at 1000 events |
| Loki queue | ~10 MB | 10000 × 1 KB entries |
| **Total (observability)** | **~18 MB** | **Bounded, predictable** |

---

## 8. Failure Modes & Recovery

### Scenario 1: Loki Endpoint Down

```
Application logs
    ↓
Kernel (working normally)
    ↓
Event Bus (working normally)
    ↓
Hub (working normally)
    ↓
Loki Backend (queue filling)
    ↓
Circuit Breaker (detects failures)
    ↓
Circuit Breaker OPEN (blocks requests)
    ↓
Queue full (backpressure warning)
    ↓
New logs REJECTED (graceful degradation)
    ↓
Health Worker probes Loki (every 60s)
    ↓
Loki recovers
    ↓
Health Worker detects recovery
    ↓
Circuit Breaker → HALF_OPEN (allow probes)
    ↓
Probe succeeds
    ↓
Circuit Breaker → CLOSED (normal operation)
    ↓
Queue drains to Loki
```

**Recovery Time**: ~60-120 seconds (health probe interval)
**Data Loss**: Logs generated during queue-full period (after 10k entries)

---

### Scenario 2: Event Bus Overload

```
Application generates 50k events/sec
    ↓
Event Bus queue fills to 75% (750/1000)
    ↓
Event Bus emits 'backpressure.warning'
    ↓
Application slows down (graceful degradation)
    ↓
Event Bus queue fills to 95% (950/1000)
    ↓
Event Bus REJECTS new events
    ↓
Application receives rejection error
    ↓
Application reduces event rate
    ↓
Event Bus queue drains below 75%
    ↓
Event Bus resumes normal operation
```

**Recovery Time**: Immediate (self-healing)
**Data Loss**: Events emitted during rejection period

---

### Scenario 3: Kernel Ring Buffer Full

```
Application generates logs faster than observer can drain
    ↓
Kernel ring buffer fills (5000 entries)
    ↓
New log overwrites oldest entry (FIFO)
    ↓
Observer drains buffer to Event Bus
    ↓
Ring buffer space freed
    ↓
Normal operation resumes
```

**Recovery Time**: Immediate (circular buffer)
**Data Loss**: Oldest entries overwritten (not observable)

---

## Related Documentation

- **System Overview**: [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
- **Kernel Layer**: [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md)
- **Observability Layer**: [SENSAIOS-OBSERVABILITY-LAYER.md](./SENSAIOS-OBSERVABILITY-LAYER.md)
- **SensaiOS Components**: [SENSAIOS-SENSAIOS-COMPONENTS.md](./SENSAIOS-SENSAIOS-COMPONENTS.md)
- **Implementation**: 
  - `src/kernel/` — Kernel layer (logger, observer, metrics)
  - `src/observability/hub/` — Observability Hub
  - `src/observability/backends/loki/` — Loki backend infrastructure
  - `src/shared/event-bus.ts` — Event Bus implementation

---

**END OF DOCUMENT**
