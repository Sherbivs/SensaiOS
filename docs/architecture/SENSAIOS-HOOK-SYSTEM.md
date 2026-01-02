# SensaiOS — Hook System Architecture

**Document Type:** Architecture Diagram  
**Status:** Current  
**Version:** 1.0.0  
**Last Updated:** 2025-12-30  
**Related:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md), [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md), [SENSAIOS-DATA-FLOW.md](./SENSAIOS-DATA-FLOW.md)

---

## Overview

The **Hook System** is the primary integration mechanism that bridges the 3-layer architecture. It provides **type-safe, fail-safe, non-blocking connections** from user-space (Application/Observability) down to the Kernel substrate.

**Architectural Role in 3-Layer System:**
- **Layer 3 → Layer 1 Bridge**: Hooks connect user-space systems (Application/Observability) directly to Kernel substrate
- **SensaiOS-Wrapped**: Hooks are exposed through SensaiOS context injection (`ctx.*` primitives)
- **Cross-Layer Parsing**: Kernel receives observations from ALL layers via hooks, parses them, routes to DB

**Hook Capabilities:**
1. **Register** with the kernel (system discovery)
2. **Observe** application state (logs, errors, metrics, events)
3. **Subscribe** to real-time observations (reactive hooks)
4. **Query** kernel state (current metrics, health, logs)

**Key Design Principles:**
- **Zero Dependencies**: Kernel never depends on application code (SensaiOS provides context)
- **Fail-Safe**: Hook failures never crash the application
- **Non-Blocking**: All observations are queued, never block caller
- **Parsing Router**: Kernel parses observations from all layers → routes to DB persistence
- **Type-Safe**: Full TypeScript interfaces for all hooks

---

## Hook System Architecture

**Role in 3-Layer Model:** Bridges ALL layers (3 → 2 → 1) for cross-layer observation

```
┌─────────────────────────────────────────────────────────────────┐
│          LAYER 3: APPLICATION & OBSERVABILITY (User Space)      │
│                                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │
│ │ Discord Bot │ │   Workers   │ │   Services  │              │
│ └─────┬───────┘ └─────┬───────┘ └─────┬───────┘              │
│       │               │               │                        │
│       │ Create Hook   │ Create Hook   │ Create Hook            │
│       │ (via SensaiOS)│ (via SensaiOS)│ (via SensaiOS)         │
└───────┼───────────────┼───────────────┼────────────────────────┘
        │               │               │
        ↓               ↓               ↓
┌─────────────────────────────────────────────────────────────────┐
│               LAYER 2: SENSAIOS (Operating System)              │
│    Context injection provides access to Kernel hooks            │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ Hooks exposed via ctx.*
                          ↓
┌─────────────────────────────────────────────────────────────────┐
│              LAYER 1: KERNEL (Mainframe Substrate)              │
│        Cross-layer parsing bridge (ALL layers → DB)             │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ KERNEL HOOKS (src/kernel/kernel-hooks.ts)                │  │
│ │ • 12+ Hook Factories                                     │  │
│ │ • Safe Wrappers (catch errors)                           │  │
│ │ • Type-Safe Interfaces                                   │  │
│ │ • Cross-layer parsing router → DB                        │  │
│ └──────────────┬──────────────┬──────────────┬─────────────┘  │
└────────────────│──────────────│──────────────│────────────────┘
                 │              │              │
                 │ observe*()   │ observe*()   │ observe*()  
                 │ Parse & route to DB        │
                 ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│ KERNEL OBSERVER LAYER                                           │
│                                                                 │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│ │   Logger     │ │ Error Tracker│ │   Metrics    │           │
│ │ (10K logs)   │ │ (1000 errors)│ │ (500 metrics)│           │
│ └──────┬───────┘ └──────┬───────┘ └──────┬───────┘           │
│        │                │                │                     │
│        │ Ring Buffer    │ Ring Buffer    │ Ring Buffer         │
│        ▼                ▼                ▼                     │
│ ┌──────────────────────────────────────────────────────────┐  │
│ │ KERNEL OBSERVER (kernel-observer.ts)                      │  │
│ │ • DB control flow coordination                           │  │
│ │ • Query API                                              │  │
│ │ • Real-time Subscriptions                                │  │
│ │ • System Registry                                        │  │
│ │ • Parse ALL observations → route to DB persistence       │  │
│ └──────────────────────────┬───────────────────────────────┘  │
└────────────────────────────│──────────────────────────────────┘
                             │
                             │ emit events
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ EVENT BUS (shared/event-bus.ts)                                 │
│ • Pattern matching                                              │
│ • Backpressure control                                          │
│ • Correlation tracking                                          │
└─────────────────────────────────────────────────────────────────┘
                             │
                             │ subscriptions
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ OBSERVABILITY HUB (observability-hub.ts)                        │
│ • Backend fan-out                                               │
│ • Loki ingestion                                                │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ↓
                    ┌────────────────┐
                    │  PostgreSQL DB │
                    └────────────────┘
```

---

## Complete Hook Catalog

### 1. Logger Hook (`createLoggerHook`)

**Purpose**: Connect logging systems to kernel observation.

**Interface**:
```typescript
interface LoggerHook {
  systemId: string;
  log: (
    level: string,
    component: string,
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In shared/logger.ts
import { createLoggerHook } from '../kernel/kernel-hooks.js';

const kernelHook = createLoggerHook('shared-logger');

export function log(level: string, component: string, operation: string, message: string, data?: Record<string, unknown>) {
  // Application logging logic
  console.log(`[${level}] ${component}.${operation}: ${message}`);
  
  // Report to kernel
  kernelHook.log(level, component, operation, message, data);
}
```

**Internal Flow**:
```
log() → observeLog() → KERNEL_STATE.logs (ring buffer) → kernel-observer → Event Bus
```

---

### 2. Error Tracker Hook (`createErrorTrackerHook`)

**Purpose**: Connect error tracking systems to kernel observation.

**Interface**:
```typescript
interface ErrorTrackerHook {
  systemId: string;
  error: (observation: Omit<ErrorObservation, 'uptimeMs' | 'source'>) => void;
  unregister: () => void;
}

interface ErrorObservation {
  errorId: string;
  fingerprint: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  timestamp: Date;
  level: string;
  component?: string;
}
```

**Usage Example**:
```typescript
// In error-tracker.ts
import { createErrorTrackerHook } from '../kernel/kernel-hooks.js';

const kernelHook = createErrorTrackerHook('error-tracker');

export function trackError(error: Error, context?: Record<string, unknown>) {
  const fingerprint = computeFingerprint(error);
  
  kernelHook.error({
    errorId: generateId(),
    fingerprint,
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date(),
    level: 'error',
    component: context?.component as string,
  });
}
```

**Internal Flow**:
```
error() → observeError() → KERNEL_STATE.errors (ring buffer) → kernel-observer → Event Bus
```

---

### 3. Infrastructure Hook (`createInfrastructureHook`)

**Purpose**: Report infrastructure metrics (memory, CPU, disk, network, database, cache, worker, Discord, game, system).

**Interface**:
```typescript
interface InfrastructureHook {
  systemId: string;
  metric: (
    category: MetricCategory,
    name: string,
    value: number,
    unit: MetricUnit,
    labels?: Record<string, string>,
    metadata?: Record<string, unknown>
  ) => void;
  batch: (
    metrics: Array<{
      category: MetricCategory;
      name: string;
      value: number;
      unit: MetricUnit;
      labels?: Record<string, string>;
      metadata?: Record<string, unknown>;
    }>
  ) => void;
  health: (
    checkName: string,
    healthy: boolean,
    latencyMs?: number,
    metadata?: Record<string, unknown>
  ) => void;
  alert: (
    alertName: string,
    level: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY',
    message: string,
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Metric Categories (10 Categories)**:
```typescript
type MetricCategory =
  | 'MEMORY'    // heap_used, heap_total, rss, external
  | 'CPU'       // cpu_usage, load_average
  | 'DISK'      // disk_used, disk_available
  | 'NETWORK'   // bytes_sent, bytes_received
  | 'DATABASE'  // query_duration, connection_count, pool_size
  | 'CACHE'     // cache_hits, cache_misses, cache_size
  | 'WORKER'    // worker_queue_size, worker_errors
  | 'DISCORD'   // api_calls, rate_limit_hits
  | 'GAME'      // battles_completed, encounters_generated
  | 'SYSTEM';   // uptime, boot_time

type MetricUnit =
  | 'bytes' | 'count' | 'percent' | 'milliseconds' | 'seconds'
  | 'gauge' | 'counter' | 'histogram';
```

**Usage Example**:
```typescript
// In resource-monitor.ts
import { createInfrastructureHook } from '../kernel/kernel-hooks.js';

const kernelHook = createInfrastructureHook('resource-monitor');

export function reportMetrics() {
  const mem = process.memoryUsage();
  
  // Single metric
  kernelHook.metric('MEMORY', 'memory_rss', mem.rss, 'bytes');
  
  // Batch metrics (more efficient)
  kernelHook.batch([
    { category: 'MEMORY', name: 'memory_heap_used', value: mem.heapUsed, unit: 'bytes' },
    { category: 'MEMORY', name: 'memory_heap_total', value: mem.heapTotal, unit: 'bytes' },
    { category: 'MEMORY', name: 'memory_external', value: mem.external, unit: 'bytes' },
  ]);
  
  // Health check
  kernelHook.health('database', databaseHealthy, latencyMs);
  
  // Alert
  if (mem.rss > THRESHOLD) {
    kernelHook.alert('memory_high', 'WARNING', `RSS: ${mem.rss} bytes`);
  }
}
```

**Internal Flow**:
```
metric() → observeInfraMetric() → KERNEL_STATE.infra (ring buffer) → kernel-observer → Event Bus
```

---

### 4. Service Registry Hook (`createServiceRegistryHook`)

**Purpose**: Track service lifecycle events (registration, health changes, shutdown).

**Interface**:
```typescript
interface ServiceRegistryHook {
  systemId: string;
  service: (
    serviceName: string,
    event: 'REGISTERED' | 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'SHUTDOWN',
    previousState?: string,
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In service-registry.ts
import { createServiceRegistryHook } from '../kernel/kernel-hooks.js';

const kernelHook = createServiceRegistryHook('service-registry');

export function registerService(name: string) {
  services.set(name, { state: 'REGISTERED', startedAt: Date.now() });
  kernelHook.service(name, 'REGISTERED');
}

export function setServiceState(name: string, state: ServiceState) {
  const service = services.get(name);
  const previousState = service?.state;
  kernelHook.service(name, state, previousState);
}
```

---

### 5. Event Bus Hook (`createEventBusHook`)

**Purpose**: Observe Event Bus activity (events emitted, correlation tracking).

**Interface**:
```typescript
interface EventBusHook {
  systemId: string;
  event: (
    topic: string,
    correlationId: string,
    emitter?: string,
    payloadSize?: number,
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In event-bus.ts
import { createEventBusHook } from '../kernel/kernel-hooks.js';

const kernelHook = createEventBusHook('event-bus');

export function emit(event: BusEvent) {
  // Emit event to subscribers
  notifySubscribers(event);
  
  // Report to kernel
  kernelHook.event(
    event.topic,
    event.correlationId,
    event.emitter,
    JSON.stringify(event.payload).length
  );
}
```

---

### 6. Database Hook (`createDatabaseHook`)

**Purpose**: Track database queries, connections, and health.

**Interface**:
```typescript
interface DatabaseHook {
  systemId: string;
  query: (
    operation: string,
    durationMs: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ) => void;
  connection: (
    event: 'CONNECTED' | 'DISCONNECTED' | 'ERROR',
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In database.ts
import { createDatabaseHook } from '../kernel/kernel-hooks.js';

const kernelHook = createDatabaseHook('prisma-client');

export async function executeQuery(sql: string) {
  const start = Date.now();
  try {
    const result = await prisma.$queryRaw(sql);
    kernelHook.query('queryRaw', Date.now() - start, true, { sql });
    return result;
  } catch (error) {
    kernelHook.query('queryRaw', Date.now() - start, false, { sql, error });
    throw error;
  }
}

prisma.$on('connected', () => kernelHook.connection('CONNECTED'));
prisma.$on('disconnected', () => kernelHook.connection('DISCONNECTED'));
```

---

### 7. Discord Hook (`createDiscordHook`)

**Purpose**: Track Discord client status and command execution.

**Interface**:
```typescript
interface DiscordHook {
  systemId: string;
  status: (
    event: 'READY' | 'DISCONNECTED' | 'ERROR' | 'RECONNECTING',
    metadata?: Record<string, unknown>
  ) => void;
  command: (
    commandName: string,
    userId: string,
    guildId?: string,
    success?: boolean
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In discord-client.ts
import { createDiscordHook } from '../kernel/kernel-hooks.js';

const kernelHook = createDiscordHook('discord-bot');

client.on('ready', () => {
  kernelHook.status('READY', { botId: client.user!.id });
});

client.on('disconnect', () => {
  kernelHook.status('DISCONNECTED');
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;
  
  const start = Date.now();
  try {
    await executeCommand(interaction);
    kernelHook.command(interaction.commandName, interaction.user.id, interaction.guildId, true);
  } catch (error) {
    kernelHook.command(interaction.commandName, interaction.user.id, interaction.guildId, false);
    throw error;
  }
});
```

---

### 8. Worker Hook (`createWorkerHook`)

**Purpose**: Track worker execution status and task completion.

**Interface**:
```typescript
interface WorkerHook {
  systemId: string;
  status: (
    event: 'STARTED' | 'STOPPED' | 'ERROR' | 'EXECUTING',
    metadata?: Record<string, unknown>
  ) => void;
  execution: (
    taskName: string,
    durationMs: number,
    success: boolean,
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In worker.ts
import { createWorkerHook } from '../kernel/kernel-hooks.js';

const kernelHook = createWorkerHook('cache-worker');

kernelHook.status('STARTED', { workerId: process.pid });

export async function executeTask(taskName: string) {
  const start = Date.now();
  kernelHook.status('EXECUTING', { taskName });
  
  try {
    await performTask(taskName);
    kernelHook.execution(taskName, Date.now() - start, true);
  } catch (error) {
    kernelHook.execution(taskName, Date.now() - start, false, { error });
    throw error;
  }
}

process.on('SIGTERM', () => {
  kernelHook.status('STOPPED');
  process.exit(0);
});
```

---

### 9. Cache Hook (`createCacheHook`)

**Purpose**: Track cache hits, misses, and evictions.

**Interface**:
```typescript
interface CacheHook {
  systemId: string;
  hit: (key: string, metadata?: Record<string, unknown>) => void;
  miss: (key: string, metadata?: Record<string, unknown>) => void;
  eviction: (key: string, reason: string, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In cache.ts
import { createCacheHook } from '../kernel/kernel-hooks.js';

const kernelHook = createCacheHook('lru-cache');

export function get(key: string) {
  const value = cache.get(key);
  if (value !== undefined) {
    kernelHook.hit(key, { size: cache.size });
    return value;
  }
  kernelHook.miss(key, { size: cache.size });
  return undefined;
}

cache.on('evict', (key: string, reason: string) => {
  kernelHook.eviction(key, reason, { size: cache.size });
});
```

---

### 10. Intelligence Hook (`createIntelligenceHook`)

**Purpose**: Report pattern detection, anomalies, cascades, predictions, and learning updates.

**Interface**:
```typescript
interface IntelligenceHook {
  systemId: string;
  pattern: (
    patternType: string,
    fingerprint: string,
    confidence: number,
    metadata?: Record<string, unknown>
  ) => void;
  anomaly: (
    metricName: string,
    actualValue: number,
    threshold: number,
    severity: string,
    metadata?: Record<string, unknown>
  ) => void;
  cascade: (
    rootFingerprint: string,
    childCount: number,
    depth: number,
    metadata?: Record<string, unknown>
  ) => void;
  prediction: (
    predictionType: string,
    confidence: number,
    metadata?: Record<string, unknown>
  ) => void;
  learning: (
    learnType: string,
    fingerprint: string,
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In error-brain.ts
import { createIntelligenceHook } from '../kernel/kernel-hooks.js';

const kernelHook = createIntelligenceHook('error-brain');

export function detectPattern(errorPattern: ErrorPattern) {
  if (errorPattern.type === 'TIME_ANOMALY') {
    kernelHook.pattern('time_anomaly', errorPattern.fingerprint, errorPattern.confidence, {
      burstCount: errorPattern.burstCount,
      timeWindow: errorPattern.timeWindow,
    });
  }
}

export function detectAnomaly(metric: string, value: number) {
  const threshold = getThreshold(metric);
  if (value > threshold) {
    kernelHook.anomaly(metric, value, threshold, 'high', {
      deviation: ((value - threshold) / threshold) * 100,
    });
  }
}
```

---

### 11. Observability Hook (`createObservabilityHook`)

**Purpose**: Report observability infrastructure events (backend registration, batch flushes, failures).

**Interface**:
```typescript
interface ObservabilityHook {
  systemId: string;
  backend: (
    action: 'register' | 'unregister',
    backendName: string,
    metadata?: Record<string, unknown>
  ) => void;
  event: (
    source: 'eventbus' | 'direct',
    topic: string,
    metadata?: Record<string, unknown>
  ) => void;
  batch: (
    batchSize: number,
    success: boolean,
    durationMs: number,
    metadata?: Record<string, unknown>
  ) => void;
  failure: (
    failureType: string,
    message: string,
    metadata?: Record<string, unknown>
  ) => void;
  lifecycle: (
    action: 'start' | 'stop',
    metadata?: Record<string, unknown>
  ) => void;
  queue: (
    depth: number,
    capacity: number,
    backpressure: 'normal' | 'warn' | 'critical',
    metadata?: Record<string, unknown>
  ) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In observability-hub.ts
import { createObservabilityHook } from '../kernel/kernel-hooks.js';

const kernelHook = createObservabilityHook('observability-hub');

export function registerBackend(backend: IObservabilityBackend) {
  backends.push(backend);
  kernelHook.backend('register', backend.name);
}

export function receive(event: BusEvent) {
  kernelHook.event('eventbus', event.topic);
  fanOutToBackends(event);
}

async function flushBatch(entries: LokiLogEntry[]) {
  const start = Date.now();
  try {
    await httpTransport.send(entries);
    kernelHook.batch(entries.length, true, Date.now() - start);
  } catch (error) {
    kernelHook.batch(entries.length, false, Date.now() - start, { error });
  }
}
```

---

### 12. Custom Hook (`createCustomHook`)

**Purpose**: Generic hook for any system type not covered by specialized hooks.

**Interface**:
```typescript
interface CustomHook {
  systemId: string;
  log: (
    level: string,
    component: string,
    operation: string,
    message: string,
    metadata?: Record<string, unknown>
  ) => void;
  error: (observation: Omit<ErrorObservation, 'uptimeMs' | 'source'>) => void;
  unregister: () => void;
}
```

**Usage Example**:
```typescript
// In custom-system.ts
import { createCustomHook } from '../kernel/kernel-hooks.js';

const kernelHook = createCustomHook('custom-system');

export function doSomething() {
  kernelHook.log('info', 'custom', 'do-something', 'Operation started');
  
  try {
    performOperation();
  } catch (error) {
    kernelHook.error({
      errorId: generateId(),
      fingerprint: 'custom-error',
      message: error.message,
      stack: error.stack,
      timestamp: new Date(),
      level: 'error',
    });
  }
}
```

---

## Real-Time Subscription API

### Log Subscription

```typescript
import { subscribeToLogs } from '../kernel/kernel-hooks.js';

const unsubscribe = subscribeToLogs((observation: LogObservation) => {
  console.log(`[${observation.level}] ${observation.component}.${observation.operation}: ${observation.message}`);
});

// Cleanup
process.on('SIGTERM', unsubscribe);
```

### Error Subscription

```typescript
import { subscribeToErrors } from '../kernel/kernel-hooks.js';

const unsubscribe = subscribeToErrors((observation: ErrorObservation) => {
  if (observation.level === 'error') {
    alertOperators(observation);
  }
});
```

### Metric Subscription

```typescript
import { subscribeToMetrics } from '../kernel/kernel-hooks.js';

const unsubscribe = subscribeToMetrics((observation: ResourceMetricObservation) => {
  if (observation.category === 'MEMORY' && observation.value > THRESHOLD) {
    console.warn(`High memory: ${observation.value} bytes`);
  }
});
```

### Service Subscription

```typescript
import { subscribeToServices } from '../kernel/kernel-hooks.js';

const unsubscribe = subscribeToServices((observation: ServiceObservation) => {
  if (observation.event === 'ERROR') {
    restartService(observation.service);
  }
});
```

### Event Subscription

```typescript
import { subscribeToEvents } from '../kernel/kernel-hooks.js';

const unsubscribe = subscribeToEvents((observation: EventObservation) => {
  console.log(`Event: ${observation.topic} (${observation.correlationId})`);
});
```

---

## Query API

### Kernel Metrics

```typescript
import { queryKernel } from '../kernel/kernel-hooks.js';

const metrics = queryKernel.metrics();
console.log(`Uptime: ${metrics.uptimeSeconds}s`);
console.log(`Logs: ${metrics.logsCount}`);
console.log(`Errors: ${metrics.errorsCount}`);
console.log(`Systems: ${metrics.systemsRegistered}`);
```

### System Health

```typescript
const health = queryKernel.health();
console.log(`Status: ${health.status}`);
console.log(`Score: ${health.score}`);
console.log(`Active Systems: ${health.systems.length}`);
```

### Recent Logs

```typescript
const logs = queryKernel.recentLogs(100);
logs.forEach(log => {
  console.log(`[${log.level}] ${log.component}: ${log.message}`);
});
```

### Recent Errors

```typescript
const errors = queryKernel.recentErrors(50);
errors.forEach(error => {
  console.error(`[${error.fingerprint}] ${error.message}`);
});
```

### Infrastructure Metrics

```typescript
const infraMetrics = queryKernel.infraMetrics();
console.log(`Memory RSS: ${infraMetrics.memory.rss} bytes`);
console.log(`CPU Usage: ${infraMetrics.cpu.percent}%`);
console.log(`Database Queries: ${infraMetrics.database.queryCount}`);
```

---

## Hook Lifecycle

### Registration

```
createHook(name) → registerSystem(type, name) → systemId assigned → hook object returned
```

**System ID Format**: `{type}:{name}:{uuid}`
**Example**: `LOGGER:shared-logger:f47ac10b-58cc-4372-a567-0e02b2c3d479`

### Observation Flow

```
hook.log() → safe wrapper → observeLog() → Ring Buffer → Kernel Observer → Event Bus
```

**Safe Wrapper**: Catches all errors, logs to stderr, returns undefined (never throws).

### Unregistration

```
hook.unregister() → unregisterSystem(systemId) → Remove from registry → Cleanup
```

---

## Performance Characteristics

### Hook Creation Overhead

| Hook Type | Creation Time | Memory |
|-----------|---------------|--------|
| Logger | ~10μs | ~1 KB |
| Error Tracker | ~10μs | ~1 KB |
| Infrastructure | ~10μs | ~1 KB |
| Service Registry | ~10μs | ~1 KB |
| Event Bus | ~10μs | ~1 KB |
| Database | ~10μs | ~1 KB |
| Discord | ~10μs | ~1 KB |
| Worker | ~10μs | ~1 KB |
| Cache | ~10μs | ~1 KB |
| Intelligence | ~10μs | ~1 KB |
| Observability | ~10μs | ~1 KB |
| Custom | ~10μs | ~1 KB |

### Observation Overhead

| Operation | Latency | Notes |
|-----------|---------|-------|
| `hook.log()` | <10μs | Safe wrapper + function call |
| `observeLog()` | ~50μs | Ring buffer push + observer notify |
| `hook.metric()` | <10μs | Safe wrapper + function call |
| `observeInfraMetric()` | ~50μs | Ring buffer push + observer notify |
| `hook.error()` | <10μs | Safe wrapper + function call |
| `observeError()` | ~50μs | Ring buffer push + observer notify |

**Total (sync path)**: ~60-100μs per observation
**Blocking**: NONE (all async after ring buffer push)

### Subscription Overhead

| Operation | Latency | Notes |
|-----------|---------|-------|
| `subscribeToLogs()` | ~5μs | Add callback to array |
| `subscribeToErrors()` | ~5μs | Add callback to array |
| `subscribeToMetrics()` | ~5μs | Add callback to array |
| Callback invocation | ~10-50μs | Depends on callback complexity |

---

## Error Handling & Fail-Safe Design

### Principle: Kernel Never Crashes Application

All hook functions are wrapped in `safe()` wrapper:

```typescript
function safe<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      // Log to stderr (kernel logger might be broken)
      writeHookError('[KERNEL HOOK ERROR]', error);
      return undefined;
    }
  }) as T;
}
```

### Failure Modes

| Failure | Behavior | Impact |
|---------|----------|--------|
| Hook creation fails | Returns undefined | Application continues, no observation |
| `hook.log()` throws | Caught by safe wrapper, logged to stderr | Application continues, observation lost |
| Ring buffer full | Oldest entry overwritten (FIFO) | Application continues, old observations lost |
| Kernel observer fails | Error logged, observation dropped | Application continues, observation lost |
| Event Bus fails | Error logged, event dropped | Application continues, event lost |

---

## Design Principles

### 1. Zero Dependencies
- **Kernel** never imports from **Application**
- **Application** can import from **Kernel** (one-way dependency)
- Kernel observes without coupling

### 2. Fail-Safe
- All hook operations wrapped in try-catch
- Errors never propagate to application
- Graceful degradation (log to stderr, return undefined)

### 3. Non-Blocking
- Ring buffers queue observations
- Kernel observer processes async
- Application never waits for kernel

### 4. Passive
- Kernel only observes, never modifies
- No side effects on application state
- Pure observation model

### 5. Type-Safe
- Full TypeScript interfaces
- Compile-time type checking
- IDE autocomplete support

---

## Extension Points

### Adding a New Hook Type

1. **Define Interface** in `kernel-hooks.ts`:
```typescript
export interface MyCustomHook {
  systemId: string;
  myMethod: (param: string, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}
```

2. **Implement Factory**:
```typescript
export const createMyCustomHook = safe((name: string): MyCustomHook => {
  const systemId = registerSystem('MY_CUSTOM', name);
  
  return {
    systemId,
    myMethod: safe((param, metadata) => {
      observeLog({
        source: name,
        level: 'info',
        component: 'my-custom',
        operation: 'my-method',
        message: `Method called: ${param}`,
        timestamp: new Date(),
        metadata,
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});
```

3. **Use in Application**:
```typescript
import { createMyCustomHook } from '../kernel/kernel-hooks.js';

const hook = createMyCustomHook('my-system');
hook.myMethod('test', { foo: 'bar' });
```

---

## Related Documentation

- **System Overview**: [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
- **Kernel Layer**: [SENSAIOS-KERNEL-DETAIL.md](./SENSAIOS-KERNEL-DETAIL.md)
- **Data Flow**: [SENSAIOS-DATA-FLOW.md](./SENSAIOS-DATA-FLOW.md)
- **Implementation**: 
  - `src/kernel/kernel-hooks.ts` — All hook factories (875 lines)
  - `src/kernel/kernel-observer.ts` — Observer + registry
  - `src/kernel/kernel-logger.ts` — Log ring buffer
  - `src/kernel/kernel-error-detector.ts` — Error ring buffer
  - `src/kernel/kernel-metrics.ts` — Metric ring buffer

---

**END OF DOCUMENT**
