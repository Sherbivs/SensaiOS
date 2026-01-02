# SensaiOS Kernel Layer — Detailed Architecture

**Version:** 1.0  
**Date:** December 30, 2025  
**Location:** `src/kernel/`  
**Status:** Current & Accurate

---

## 🎯 Purpose

The Kernel Layer is the **mainframe substrate** that sits at the foundation of SensaiOS. It:
- Starts FIRST (before any application code, before SensaiOS)
- Controls DB FLOW (coordinates all database operations, transaction boundaries)
- Parses ACROSS LAYERS (receives observations from ALL layers, routes to DB persistence)
- Collects METRICS (ring buffers for logs/errors/metrics before DB write)
- Stops LAST (exports all data before exit)

**Key Shift from Observer → Substrate:**
- **Before:** Passive observer that "sees everything, modifies nothing"
- **Now:** Active mainframe controlling DB stop/control flow, parsing observations from ALL layers into database handling

---

## 🏗️ Component Architecture

**Position in 3-Layer Model:** Layer 1 (Mainframe Substrate) — Sits below SensaiOS with NO intermediate layers

```
                    ┌──────────────────────────────────┐
                    │   LAYER 3: User Space            │
                    │   Application & Observability    │
                    └────────────┬─────────────────────┘
                                 │ Use SensaiOS primitives
                    ┌────────────▼─────────────────────┐
                    │   LAYER 2: SensaiOS (OS)         │
                    │   Component model, context       │
                    └────────────┬─────────────────────┘
                                 │ Direct access to Kernel
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   LAYER 1: KERNEL (Mainframe Substrate)                     │
│                            (src/kernel/)                                    │
│      Metrics, DB control flow, cross-layer parsing → DB persistence         │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                    BOOT KERNEL (Entry Point)                       │    │
│  │                      boot-kernel.ts                                │    │
│  │                                                                    │    │
│  │  • Captures absolute start time                                   │    │
│  │  • Initializes kernel logger (ring buffer)                        │    │
│  │  • Installs error handlers (global)                               │    │
│  │  • Initializes observer (DB control flow)                         │    │
│  │  • Initializes metrics (infrastructure tracking)                  │    │
│  │  • Initializes persistence (snapshot/crash export)                │    │
│  │  • Exports unified Kernel interface                               │    │
│  │                                                                    │    │
│  │  Lifecycle: PRE_BOOT → MODULE_LOAD → INIT → RUNTIME → SHUTDOWN   │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                   │                                         │
│                                   ↓                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │ KERNEL LOGGER   │  │ ERROR DETECTOR  │  │   KERNEL OBSERVER        │   │
│  │ kernel-logger.ts│  │ kernel-error-   │  │   kernel-observer.ts     │   │
│  │                 │  │ detector.ts     │  │                          │   │
│  │ • Ring buffer   │  │                 │  │ • DB control flow coord  │   │
│  │   (10,000)      │  │ • Global error  │  │ • System registry        │   │
│  │ • Pre-boot queue│  │   handlers      │  │ • Observation hooks      │   │
│  │ • Log levels    │  │ • Fingerprinting│  │ • Health tracking        │   │
│  │ • File export   │  │ • Pattern detect│  │ • Metrics aggregation    │   │
│  │ • Stats         │  │ • Crash detect  │  │ • State export           │   │
│  └─────────────────┘  └─────────────────┘  └──────────────────────────┘   │
│                                   │                                         │
│                                   ↓                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │ KERNEL HOOKS    │  │ KERNEL METRICS  │  │   CORRELATION            │   │
│  │ kernel-hooks.ts │  │ kernel-metrics. │  │   correlation.ts         │   │
│  │                 │  │ ts              │  │                          │   │
│  │ • Layer bridge  │  │                 │  │ • Trace ID generation    │   │
│  │ • Registration  │  │ • Infra metrics │  │ • Context propagation    │   │
│  │ • Cross-layer   │  │ • Ring buffer   │  │ • Parent/child tracking  │   │
│  │   parsing → DB  │  │   (500 entries) │  │ • Root trace tracking    │   │
│  │ • Query API     │  │ • Health score  │  │ • Stats                  │   │
│  │ • Safe wrappers │  │ • Alert levels  │  │                          │   │
│  └─────────────────┘  └─────────────────┘  └──────────────────────────┘   │
│                                   │                                         │
│                                   ↓                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐   │
│  │ PERSISTENCE     │  │ OUTPUT PLUGINS  │  │   LOG SAMPLING           │   │
│  │ kernel-         │  │ kernel-output-  │  │   log-sampling.ts        │   │
│  │ persistence.ts  │  │ plugins.ts      │  │                          │   │
│  │                 │  │                 │  │ • Sample rate control    │   │
│  │ • Snapshots     │  │ • JSON export   │  │ • Adaptive sampling      │   │
│  │ • Crash reports │  │ • CSV export    │  │ • Priority preservation  │   │
│  │ • Metrics export│  │ • Console pretty│  │                          │   │
│  │ • DB hooks      │  │ • Custom plugins│  │   PII SCRUBBER           │   │
│  │ • Cleanup       │  │                 │  │   pii-scrubber.ts        │   │
│  │ • Stats         │  │                 │  │                          │   │
│  │                 │  │                 │  │ • Secret redaction       │   │
│  │                 │  │                 │  │ • Pattern matching       │   │
│  └─────────────────┘  └─────────────────┘  └──────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Component Details

### **1. boot-kernel.ts** — System Bootstrap

**Responsibility:** First code that runs, initializes entire kernel

**Initialization Sequence:**
1. Capture absolute start time (`Date.now()`, `process.hrtime.bigint()`)
2. Initialize kernel logger → creates ring buffer
3. Install error handlers → global uncaught/unhandled
4. Initialize observer → system registry
5. Initialize metrics → infrastructure tracking
6. Initialize persistence → snapshot/crash export
7. Set phase to `PRE_BOOT`
8. Return unified `Kernel` interface

**Exports:**
```typescript
// Main interface
export { default as Kernel } from './boot-kernel.js';

// Individual functions
export { 
  kernel,           // Main kernel instance
  getKernelUptime,  // Uptime in ms
  getKernelPhase,   // Current lifecycle phase
  setKernelPhase,   // Transition phase
  shutdownKernel,   // Graceful shutdown
};
```

**Lifecycle Phases:**
- `PRE_BOOT` — Before any code runs
- `MODULE_LOAD` — Importing modules
- `INIT` — Service initialization
- `RUNTIME` — Normal operation
- `SHUTDOWN` — Graceful shutdown

---

### **2. kernel-logger.ts** — Ring Buffer Logging

**Responsibility:** Circular buffer for kernel's own logs (not application logs)

**Data Structures:**
```typescript
// Ring buffer (10,000 entries)
const logBuffer: KernelLogEntry[] = [];
let bufferIndex = 0;
let entriesWritten = 0;

// Pre-boot queue (before logger ready)
const preBootQueue: KernelLogEntry[] = [];
let booted = false;
```

**Key Functions:**
```typescript
kernel(level, operation, message, data?)  // Main logging function
klog(operation, message, data?)           // Alias for info level
setKernelLogLevel(level)                   // Configure log level
getKernelLogs(limit?, levels?)             // Query logs
getKernelLogStats()                        // Statistics
exportKernelLogs(format)                   // Export to JSON/CSV
shutdownKernelLogger()                     // Flush and close
```

**Log Levels:** `debug`, `info`, `warn`, `error`, `critical`

**Features:**
- Ring buffer prevents unbounded growth
- Pre-boot queue captures early logs
- File export (`/Store/kernel/logs/`)
- Stats: total, by level, ring buffer utilization

---

### **3. kernel-error-detector.ts** — Error Intelligence

**Responsibility:** Global error handling, fingerprinting, pattern detection

**Global Handlers Installed:**
```typescript
process.on('uncaughtException', handler);
process.on('unhandledRejection', handler);
process.on('warning', handler);
```

**Error Processing:**
1. **Fingerprint Generation** — Hash of error name + first 3 stack frames
2. **Deduplication** — Same fingerprint = increment occurrence count
3. **Pattern Detection** — Identify repeated error patterns
4. **Crash Detection** — Detect critical failures
5. **Learning Extraction** — Suggest fixes based on patterns

**Data Structures:**
```typescript
// Error store
const errors: Map<string, KernelError> = new Map();

// Pattern tracking
const patterns: Map<string, ErrorPattern> = new Map();

// Crash detection
let crashDetected: CrashDetection | null = null;
```

**Key Functions:**
```typescript
captureError(error, context?)          // Capture error
detectCrash(error)                     // Detect crash condition
getErrors(limit?, severities?)         // Query errors
getPatterns()                          // Get error patterns
getLearnings()                         // Get suggested fixes
exportErrorData()                      // Export to JSON
shutdownErrorDetector()                // Cleanup
```

**Error Severities:** `low`, `medium`, `high`, `critical`

---

### **4. kernel-observer.ts** — System Registry

**Responsibility:** Track registered systems, observe their activity, aggregate health

**System Registry:**
```typescript
// Registered systems
const systems: Map<string, SystemRegistration> = new Map();

// Observation buffers (ring buffers)
const logObservations: LogObservation[] = [];      // 1,000 entries
const errorObservations: ErrorObservation[] = [];  // 1,000 entries
const serviceObservations: ServiceObservation[] = [];
const eventObservations: EventObservation[] = [];
```

**Key Functions:**
```typescript
// System registration
registerSystem(id, type, name, metadata?)
unregisterSystem(id)

// Observations
observeLog(observation)
observeError(observation)
observeService(observation)
observeEvent(observation)

// Subscriptions (real-time)
onLog(callback)
onError(callback)
onService(callback)
onEvent(callback)

// Queries
getMetrics()              // Aggregated kernel metrics
getSystemHealth()         // Health status per system
getRecentLogs(limit?)
getRecentErrors(limit?)
exportKernelState()       // Full state export
```

**System Types:**
- `LOGGER` — Logging systems
- `ERROR_TRACKER` — Error tracking
- `SERVICE` — Service Registry services
- `EVENT_BUS` — Event bus
- `DATABASE` — Database connections
- `DISCORD` — Discord clients
- `WORKER` — Background workers
- `CACHE` — Cache systems
- `INTELLIGENCE` — ErrorBrain, PatternDetector
- `OBSERVABILITY` — ObservabilityHub, backends
- `CUSTOM` — User-defined

**Health Tracking:**
- Status: `HEALTHY`, `DEGRADED`, `ERROR`, `UNKNOWN`
- Last seen timestamp
- Observation count
- Error count

---

### **5. kernel-hooks.ts** — Integration Bridge

**Responsibility:** Factory functions for application systems to connect to kernel

**Hook Types:**

#### **Logger Hook**
```typescript
const hook = createLoggerHook(id, name, metadata?);

hook.register();
hook.log(level, component, operation, message, metadata?);
hook.unregister();
```

#### **Error Tracker Hook**
```typescript
const hook = createErrorTrackerHook(id, name, metadata?);

hook.register();
hook.error(errorId, fingerprint, category, severity, error, context?);
hook.unregister();
```

#### **Service Registry Hook**
```typescript
const hook = createServiceRegistryHook(id, name, metadata?);

hook.register();
hook.service(serviceName, event, previousState?, metadata?);
hook.unregister();
```

#### **Event Bus Hook**
```typescript
const hook = createEventBusHook(id, name, metadata?);

hook.register();
hook.event(topic, correlationId, emitter?, payloadSize?, metadata?);
hook.unregister();
```

#### **Infrastructure Hook**
```typescript
const hook = createInfrastructureHook(id, name, metadata?);

hook.register();
hook.metric(observation);                    // Single metric
hook.batch(observations);                    // Batch metrics
hook.health(): InfrastructureMetrics;        // Get aggregated
hook.alert(): 'NORMAL' | 'WARNING' | ...;    // Get alert level
hook.unregister();
```

**Other Hooks:**
- `createDatabaseHook` — DB connection tracking
- `createDiscordHook` — Discord client tracking
- `createWorkerHook` — Worker tracking
- `createCacheHook` — Cache tracking
- `createIntelligenceHook` — AI/ML system tracking
- `createObservabilityHook` — Backend tracking
- `createCustomHook` — Generic hook

**Subscription Functions:**
```typescript
subscribeToLogs(callback)      // Real-time log stream
subscribeToErrors(callback)    // Real-time error stream
subscribeToServices(callback)  // Real-time service events
subscribeToEvents(callback)    // Real-time event bus events
subscribeToMetrics(callback)   // Real-time metrics
```

**Query API:**
```typescript
queryKernel.uptime()           // Get kernel uptime
queryKernel.phase()            // Get current phase
queryKernel.systems()          // Get registered systems
queryKernel.health()           // Get system health
queryKernel.logs(limit?)       // Get recent logs
queryKernel.errors(limit?)     // Get recent errors
queryKernel.metrics()          // Get kernel metrics
queryKernel.infrastructure()   // Get infra metrics
queryKernel.export()           // Export full state
```

**Safety Wrapper:**
```typescript
// All hooks wrapped with safe() to catch errors
function safe<T extends (...args: any[]) => any>(fn: T): T {
  return ((...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      process.stderr.write(`[KERNEL HOOK ERROR] ${error}\n`);
      return undefined;
    }
  }) as T;
}
```

---

### **6. kernel-metrics.ts** — Infrastructure Tracking

**Responsibility:** Aggregate infrastructure metrics, calculate health scores

**Metric Categories:**
- `MEMORY` — RAM, heap, buffers
- `CPU` — CPU usage, load
- `DISK` — Disk I/O, storage
- `NETWORK` — Network I/O
- `DATABASE` — Query times, connections
- `CACHE` — Hit rates, sizes
- `WORKER` — Task durations, queue sizes
- `DISCORD` — API latency, shard status
- `GAME` — Battle durations, encounters
- `SYSTEM` — Generic system metrics

**Data Structures:**
```typescript
// Ring buffer for observations (500 entries)
const infraMetricObservations: ResourceMetricObservation[] = [];

// Metric definitions registry
const metricDefinitions: Map<string, MetricDefinition> = new Map();

// Latest values per metric
const latestMetricValues: Map<string, ResourceMetricObservation> = new Map();

// Metric hooks
const metricHooks: MetricHook[] = [];
```

**Key Functions:**
```typescript
// Recording
observeInfraMetric(observation)
observeInfraMetrics(observations)
onInfraMetric(callback)

// Queries
getRecentInfraMetrics(limit?, category?)
getInfraMetricsByCategory(category)
getLatestInfraMetric(name)
getAllLatestInfraMetrics()
getInfrastructureMetrics()        // Aggregated view
getInfraMetricStats()

// Registration
registerMetricDefinition(definition)
getMetricDefinitions()

// Health calculation
calculateInfraHealthScore(): number          // 0-100
calculateInfraAlertLevel(): 'NORMAL' | ...

// Kernel metrics
getDashboard(): KernelDashboard
recordBootTime(ms)
recordMetric(name, value, labels?)
getMetricTrend(name): MetricTrend
getAllTrends(): MetricTrend[]
checkForAnomalies(): SystemAnomaly[]
getAnomalies(): SystemAnomaly[]
getActiveAnomalies(): SystemAnomaly[]
clearAnomalies()
getOverallHealth(): number
exportMetrics(): string
shutdownMetrics()
```

**Health Score Calculation:**
```typescript
// Weighted scoring
- Memory utilization: 30%
- CPU usage: 25%
- Disk utilization: 15%
- Event loop lag: 10%
- Cache hit rate: 10%
- Discord latency: 10%

// Alert levels
- NORMAL:    health >= 80
- WARNING:   health >= 60
- CRITICAL:  health >= 40
- EMERGENCY: health < 40
```

---

### **7. correlation.ts** — Distributed Tracing

**Responsibility:** Generate and propagate correlation IDs across async operations

**Correlation ID Format:**
- Full: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` (UUID v4)
- Short: `xxxxxxxx` (8 hex chars, for concise logging)

**Context Structure:**
```typescript
interface CorrelationContext {
  correlationId: string;
  parentCorrelationId?: string;
  rootCorrelationId: string;
  traceSource: TraceSource;
  startTime: number;
  metadata?: TraceMetadata;
}
```

**Trace Sources:**
- `DISCORD_COMMAND`
- `DISCORD_INTERACTION`
- `DISCORD_MESSAGE`
- `WORKER_JOB`
- `HTTP_REQUEST`
- `EVENT_BUS`
- `SCHEDULED_JOB`
- `SYSTEM_INTERNAL`

**Key Functions:**
```typescript
// Generation
generateCorrelationId()
generateShortCorrelationId()

// Context access
getCurrentCorrelationId()
getParentCorrelationId()
getRootCorrelationId()
getCurrentContext()
isInTrace()

// Trace management
startTrace(source, metadata?)
startTraceAsync(source, metadata?, fn)
continueTrace(correlationId, fn)
continueTraceAsync(correlationId, fn)
withCorrelation(correlationId, fn)

// Stats
getCorrelationStats()
```

**AsyncLocalStorage Integration:**
Uses Node.js `AsyncLocalStorage` for automatic context propagation across async boundaries.

---

### **8. kernel-persistence.ts** — Data Export

**Responsibility:** Export kernel data to disk for analysis/recovery

**Export Types:**

#### **Snapshots** (`/Store/kernel/snapshots/`)
- Full kernel state at point in time
- Triggered manually or on shutdown
- JSON format
- Includes: logs, errors, metrics, system health

#### **Crash Reports** (`/Store/kernel/crashes/`)
- Generated on critical errors/crashes
- Includes: error details, stack trace, kernel state
- JSON format
- Automatic on process exit with error

#### **Metrics History** (`/Store/kernel/metrics/`)
- Time-series metric data
- JSON or CSV format
- Includes: all infra metrics, kernel metrics

**Key Functions:**
```typescript
initializePersistence(config?)
saveSnapshot(filename?)
saveCrashReport(error, context?)
exportFullState(): KernelStateExport
exportMetricsHistory(format): string
registerDatabaseHook(hook)         // Hook for DB export
unregisterDatabaseHook(id)
cleanupOldFiles(maxAgeDays)
listSnapshots()
getPersistenceStats()
shutdownPersistence()
```

**Database Hook Interface:**
```typescript
interface DatabaseExportHook {
  id: string;
  exportLogs(logs): Promise<void>;
  exportErrors(errors): Promise<void>;
  exportMetrics(metrics): Promise<void>;
}
```

---

### **9. kernel-output-plugins.ts** — Format Export

**Responsibility:** Output formatters for different export targets

**Plugins:**

#### **JSON Plugin**
```typescript
outputJSON(data): string
// Compact JSON, no pretty printing
```

#### **CSV Plugin**
```typescript
outputCSV(data, columns): string
// CSV format for spreadsheet import
```

#### **Console Pretty Plugin**
```typescript
outputConsolePretty(data): string
// Human-readable formatted output
// Used for kernel dashboards
```

#### **Custom Plugin Interface**
```typescript
interface OutputPlugin {
  name: string;
  format(data: unknown): string;
}

registerOutputPlugin(plugin)
```

---

### **10. log-sampling.ts** — Adaptive Sampling

**Responsibility:** Reduce log volume while preserving critical information

**Sampling Strategy:**
- **Always:** `error`, `critical` levels
- **Sample:** `info`, `debug` based on rate
- **Adaptive:** Increase sample rate under high load

**Key Functions:**
```typescript
shouldSample(level, key?): boolean
setSampleRate(rate)                // 0.0 - 1.0
getSampleRate(): number
setAdaptiveSampling(enabled)
getStats()
```

---

### **11. pii-scrubber.ts** — Security

**Responsibility:** Redact sensitive data from logs/exports

**Patterns Detected:**
- API keys (`BOT_TOKEN`, `RENDER_API_KEY`)
- Passwords
- Email addresses
- Credit card numbers
- Discord tokens
- Database URLs with credentials

**Key Functions:**
```typescript
scrub(text): string
scrubObject(obj): object
addPattern(name, regex)
removePattern(name)
getPatterns()
```

---

## 🔄 Interaction Flows

### **System Registration Flow**
```
Application System
    ↓ calls
createLoggerHook(id, name)
    ↓ creates hook with
registerSystem(id, 'LOGGER', name)
    ↓ stores in
kernel-observer.ts::systems Map
    ↓ returns
Hook instance with log(), error() methods
```

### **Log Observation Flow**
```
Application Logger
    ↓ calls
hook.log(level, component, operation, message)
    ↓ creates
LogObservation object
    ↓ forwards to
observeLog(observation)
    ↓ stores in
kernel-observer.ts::logObservations buffer
    ↓ triggers
All registered log hooks (subscriptions)
    ↓ forwards to
Observability Layer → Loki Backend
```

### **Infrastructure Metric Flow**
```
Resource Monitor
    ↓ calls
hook.metric({ category, name, value, unit })
    ↓ creates
ResourceMetricObservation object
    ↓ forwards to
observeInfraMetric(observation)
    ↓ stores in
kernel-metrics.ts::infraMetricObservations buffer
    ↓ updates
latestMetricValues Map
    ↓ triggers
All registered metric hooks
    ↓ aggregates for
getInfrastructureMetrics() → Dashboard
```

### **Error Detection Flow**
```
Global Error Handler
    ↓ captures
uncaughtException / unhandledRejection
    ↓ calls
captureError(error, context)
    ↓ generates
Fingerprint (hash of name + stack)
    ↓ stores/updates in
errors Map (deduplicated)
    ↓ detects
Patterns (repeated errors)
    ↓ triggers
detectCrash(error) if critical
    ↓ exports
saveCrashReport() on critical
```

---

## 📊 Data Structures

### **Ring Buffers**
| Buffer | Size | Purpose |
|--------|------|---------|
| Kernel logs | 10,000 | Kernel's own logs |
| Log observations | 1,000 | Application log events |
| Error observations | 1,000 | Application error events |
| Service observations | 1,000 | Service lifecycle events |
| Event observations | 1,000 | Event bus events |
| Infra metrics | 500 | Infrastructure metrics |

### **Maps**
| Map | Key | Value |
|-----|-----|-------|
| systems | string (id) | SystemRegistration |
| errors | string (fingerprint) | KernelError |
| patterns | string (pattern) | ErrorPattern |
| metricDefinitions | string (name) | MetricDefinition |
| latestMetricValues | string (name) | ResourceMetricObservation |

---

## 🎯 Design Principles

### **1. Zero Dependencies**
- Kernel never imports application code
- Only Node.js built-ins allowed
- Safe from circular dependencies

### **2. Fail-Safe Operation**
- All hooks wrapped with `safe()` error catcher
- Kernel failures logged to stderr, never crash app
- Pre-boot queue captures early logs

### **3. Non-Blocking**
- All observations queued immediately
- No async operations in hot path
- Ring buffers prevent unbounded growth

### **4. Passive Observation**
- Kernel reads, never writes to application state
- Read-only queries for external systems
- Snapshots/exports on demand or shutdown

### **5. Performance First**
- Ring buffers for O(1) writes
- Maps for O(1) lookups
- Minimal processing in observation path
- Batching for exports

---

## 📈 Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| Log write | O(1) | Ring buffer append |
| Error capture | O(1) | Map insert/update |
| System registration | O(1) | Map insert |
| Observation | O(1) | Ring buffer append |
| Metric recording | O(1) | Ring buffer + Map update |
| Query recent logs | O(n) | n = limit, max buffer size |
| Health calculation | O(m) | m = registered systems |
| Snapshot export | O(n) | n = total observations |

**Memory Footprint:**
- Kernel logs: ~10 MB (10k × ~1 KB/entry)
- Observations: ~4 MB (4 × 1k × ~1 KB/entry)
- Metrics: ~500 KB (500 × ~1 KB/entry)
- **Total: ~15 MB** (bounded, never grows)

---

## 🔌 Extension Points

### **Add New Observation Type**
1. Define observation interface in `kernel-types.ts`
2. Add ring buffer in `kernel-observer.ts`
3. Add `observe*` function in `kernel-observer.ts`
4. Add `on*` subscription in `kernel-observer.ts`
5. Add hook factory in `kernel-hooks.ts`

### **Add New Metric Category**
1. Add to `MetricCategory` type in `kernel-types.ts`
2. Update health score calculation in `kernel-metrics.ts`
3. Document in `getInfrastructureMetrics()` return type

### **Add New Output Plugin**
1. Implement `OutputPlugin` interface
2. Register via `registerOutputPlugin()`
3. Use in persistence exports

---

## 📚 Related Documentation

- **System Overview:** [SENSAIOS-SYSTEM-OVERVIEW.md](./SENSAIOS-SYSTEM-OVERVIEW.md)
- **Application Layer:** [SENSAIOS-APPLICATION-LAYER.md](./SENSAIOS-APPLICATION-LAYER.md) (next)
- **Kernel Types Reference:** `src/kernel/kernel-types.ts`
- **Kernel API Reference:** `src/kernel/index.ts`

---

**Next Diagram:** [Diagram 3: Application Layer Detail](./SENSAIOS-APPLICATION-LAYER.md)
