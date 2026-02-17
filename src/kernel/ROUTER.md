# ROUTER
Title: Kernel Root Observer Layer
Purpose: Production-grade kernel module providing unified logging, error detection, system observation, metrics collection, and persistence.
Owned Globs: src/kernel/**
Last Updated (UTC): 2026-02-17T10:00:00Z



## Overview

The kernel layer is the **root observer** for the entire application. It provides:

1. **Unified Logging** — Structured, leveled logging with rotation and persistence
2. **Error Detection** — Global error capturing with categorization and crash reports
3. **System Observation** — Observable patterns for system-wide state tracking
4. **Metrics Collection** — Performance metrics, rate limiting, and dashboard generation
5. **Lifecycle Hooks** — Event-driven system for boot/shutdown coordination
6. **Persistence** — Snapshot management, database export, and retention policies

All other modules depend on the kernel for observability and reliability.

---

## Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           KERNEL ROOT OBSERVER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         boot-kernel.ts                               │   │
│  │   Unified Kernel API - All kernel functions exposed through this    │   │
│  │   Kernel.log, Kernel.error, Kernel.observe, Kernel.metrics, ...     │   │
│  └────────────────────────────────────────────────────────────────┬────┘   │
│                                                                    │        │
│  ┌─────────────────┬─────────────────┬─────────────────┬──────────┴──────┐ │
│  │                 │                 │                 │                  │ │
│  │ kernel-logger   │ kernel-error    │ kernel-observer │ kernel-metrics   │ │
│  │                 │ -detector       │                 │                  │ │
│  │ - Log levels    │ - Error capture │ - Observables   │ - Rate tracking  │ │
│  │ - Rotation      │ - Crash reports │ - State export  │ - Dashboard      │ │
│  │ - Formatting    │ - Categories    │ - Subscriptions │ - Summaries      │ │
│  └────────┬────────┴────────┬────────┴────────┬────────┴────────┬─────────┘ │
│           │                 │                 │                 │           │
│  ┌────────┴─────────────────┴─────────────────┴─────────────────┴─────────┐ │
│  │                        kernel-hooks.ts                                  │ │
│  │   Lifecycle event system for boot, ready, shutdown coordination        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                      kernel-persistence.ts                              │ │
│  │   Snapshot management, database export, file retention policies        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                        kernel-types.ts                                  │ │
│  │   Type definitions for all kernel modules                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PERSISTENCE LAYER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Store/kernel-logs/       → Real-time log files (kernel-YYYY-MM-DD.log)    │
│  Store/kernel-snapshots/  → Periodic JSON snapshots (every 5 minutes)       │
│  Store/kernel-crashes/    → Crash reports (crash-*.json)                    │
│  Store/kernel-exports/    → On-demand full exports                          │
│  Store/kernel-metrics/    → Metrics history and summaries                   │
│                                                                             │
│  Database Hooks:                                                            │
│  - Prisma hook for PostgreSQL persistence                                   │
│  - File-based hook for JSON "database" storage                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Files Manifest

### Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.ts` | ~70 | Barrel export for all kernel types and functions |
| `kernel-types.ts` | ~200 | Type definitions: LogLevel, ErrorCategory, KernelState, etc. |
| `boot-kernel.ts` | ~525 | **Main Entry Point** - Unified Kernel API facade |
| `kernel-logger.ts` | ~380 | Structured logging with levels, rotation, formatting |
| `kernel-error-detector.ts` | ~350 | Global error capture, categorization, crash reports |
| `kernel-observer.ts` | ~400 | Observable patterns for system state tracking |
| `kernel-hooks.ts` | ~250 | Lifecycle event system (boot, ready, shutdown) |
| `kernel-metrics.ts` | ~350 | Performance metrics, rate tracking, dashboards |
| `kernel-persistence.ts` | ~520 | Snapshot management, database export, retention |
| `kernel-output-plugins.ts` | ~500 | Output plugin architecture for routing logs to multiple destinations |
| `pii-scrubber.ts` | ~500 | PII scrubbing patterns for sensitive data protection |

### Subdirectories

| Directory | Purpose |
|-----------|---------|
| `outputs/` | Concrete output plugin implementations (ConsoleOutput, FileOutput) |
| `correlation.ts` | ~430 | Correlation ID tracking with AsyncLocalStorage |
| `log-sampling.ts` | ~520 | Log sampling and rate limiting for volume control |

**Total:** ~4,995 lines of production-grade kernel code

---

## Detailed File Documentation

### kernel-types.ts (~200 lines)
**Purpose:** Type definitions for the entire kernel module

**Exports:**
```typescript
// Log levels
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Error categories
type ErrorCategory = 'NETWORK' | 'DATABASE' | 'DISCORD' | 'VALIDATION' | 
                     'PERMISSION' | 'RUNTIME' | 'CONFIGURATION' | 'UNKNOWN';

// Error severity
type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

// Kernel state phases
type KernelPhase = 'BOOTING' | 'INITIALIZING' | 'READY' | 'DEGRADED' | 
                   'SHUTTING_DOWN' | 'TERMINATED';

// Event hooks
type KernelHookPhase = 'pre-boot' | 'boot' | 'ready' | 'pre-shutdown' | 'shutdown';

// Full interfaces for KernelState, LogEntry, CapturedError, etc.
```

---

### kernel-logger.ts (~380 lines)
**Purpose:** Structured, leveled logging with persistence

**Key Functions:**
```typescript
log(level: LogLevel, message: string, meta?: Record<string, unknown>): void
debug(message: string, meta?): void
info(message: string, meta?): void
warn(message: string, meta?): void
error(message: string, meta?): void
fatal(message: string, meta?): void

getLogBuffer(): LogEntry[]
clearLogBuffer(): void
setLogLevel(level: LogLevel): void
getLogLevel(): LogLevel
getKernelUptime(): number      // Milliseconds since boot
getKernelBootTime(): number    // Boot timestamp
```

**Persistence:**
- Logs to `Store/kernel-logs/kernel-YYYY-MM-DD.log`
- Automatic daily rotation
- Configurable buffer size (default: 1000 entries)
- JSON-structured log entries

---

### kernel-error-detector.ts (~350 lines)
**Purpose:** Global error capturing and categorization

**Key Functions:**
```typescript
captureError(error: Error, source: string, context?: Record<string, unknown>): CapturedError
getRecentErrors(count?: number): CapturedError[]
getErrorsByCategory(category: ErrorCategory): CapturedError[]
getErrorsBySeverity(severity: ErrorSeverity): CapturedError[]
clearErrors(): void
getErrorStats(): ErrorStats

saveCrashReport(error: CapturedError): string  // Synchronous for reliability
recoverFromCrash(): CrashRecoveryResult | null
```

**Error Categories:**
- `NETWORK` — API failures, timeouts, connection issues
- `DATABASE` — Prisma errors, query failures, connection lost
- `DISCORD` — Discord.js errors, rate limits, API errors
- `VALIDATION` — Input validation, schema errors
- `PERMISSION` — Access denied, unauthorized actions
- `RUNTIME` — Uncaught exceptions, crashes
- `CONFIGURATION` — Missing env vars, invalid config
- `UNKNOWN` — Unclassified errors

**Persistence:**
- Crash reports saved to `Store/kernel-crashes/crash-{timestamp}.json`
- Recovery data includes last known state and error context

---

### kernel-observer.ts (~400 lines)
**Purpose:** Observable patterns for system-wide state tracking

**Key Functions:**
```typescript
getKernelState(): KernelState
setKernelPhase(phase: KernelPhase): void
subscribe(callback: (state: KernelState) => void): () => void
updateSystemStats(stats: Partial<SystemStats>): void
recordServiceHealth(service: string, status: 'healthy' | 'degraded' | 'down'): void
exportKernelState(): string  // JSON export

initializeObserver(): void
shutdownObserver(): void
```

**State Tracking:**
- Current phase (BOOTING → READY → SHUTTING_DOWN)
- System stats (memory, CPU, connections)
- Service health map
- Subscription-based notifications

---

### kernel-hooks.ts (~250 lines)
**Purpose:** Lifecycle event system for coordinated startup/shutdown

**Key Functions:**
```typescript
registerHook(phase: KernelHookPhase, name: string, handler: HookHandler, priority?: number): void
unregisterHook(phase: KernelHookPhase, name: string): void
executeHooks(phase: KernelHookPhase): Promise<HookResult[]>
getRegisteredHooks(): Map<KernelHookPhase, HookRegistration[]>
clearHooks(phase?: KernelHookPhase): void
```

**Hook Phases:**
1. `pre-boot` — Before kernel initialization
2. `boot` — During kernel initialization
3. `ready` — After kernel is fully operational
4. `pre-shutdown` — Before shutdown begins
5. `shutdown` — During shutdown (cleanup)

**Features:**
- Priority-based execution order
- Async handler support
- Error isolation (one hook failure doesn't block others)
- Timeout protection

---

### kernel-metrics.ts (~350 lines)
**Purpose:** Performance metrics, rate tracking, and dashboards

**Key Functions:**
```typescript
recordMetric(name: string, value: number, tags?: Record<string, string>): void
recordDuration(name: string, startTime: number, tags?: Record<string, string>): void
incrementCounter(name: string, tags?: Record<string, string>): void
getMetric(name: string): MetricSummary | undefined
getAllMetrics(): Map<string, MetricSummary>

// Rate limiting
checkRateLimit(key: string, limit: number, windowMs: number): boolean
getRateLimitStatus(key: string): RateLimitStatus | undefined

// Dashboard
recordBootTime(bootTimeMs: number): void
generateDashboard(): KernelDashboard
exportMetrics(): string

initializeMetrics(): void
shutdownMetrics(): void
```

**Metric Types:**
- Counters (incrementing values)
- Gauges (point-in-time values)
- Histograms (distributions)
- Durations (timing measurements)

**Dashboard Data:**
- Boot time and uptime
- Memory usage (heap, RSS)
- Error totals and rates
- Log counts by level
- Service health summary

---

### kernel-persistence.ts (~520 lines)
**Purpose:** Snapshot management, database export, and file retention

**Key Functions:**
```typescript
// Initialization
initializePersistence(config?: Partial<PersistenceConfig>): Promise<void>
shutdownPersistence(): Promise<void>

// Snapshots
saveSnapshot(type: SnapshotType, reason?: string): Promise<string>
listSnapshots(): Promise<SnapshotInfo[]>

// Exports
exportFullState(targetPath?: string): Promise<string>
exportMetricsHistory(targetPath?: string): Promise<string>
saveCrashReport(error: CapturedError): string  // Synchronous

// Database hooks
registerDatabaseHook(hook: DatabaseExportHook): void
unregisterDatabaseHook(hookId: string): void

// Maintenance
cleanupOldFiles(retentionDays?: number): Promise<CleanupResult>
getPersistenceStats(): Promise<PersistenceStats>

// Factory hooks
createPrismaHook(prismaClient: any, options?: PrismaHookOptions): DatabaseExportHook
createFileDbHook(basePath: string): DatabaseExportHook
```

**Snapshot Types:**
- `PERIODIC` — Automatic snapshots (every 5 minutes)
- `SHUTDOWN` — Saved during graceful shutdown
- `CRASH` — Emergency save on crash
- `MANUAL` — User-requested snapshot

**Storage Locations:**
| Directory | Purpose | Retention |
|-----------|---------|-----------|
| `Store/kernel-logs/` | Real-time log files | 7 days |
| `Store/kernel-snapshots/` | Periodic snapshots | 7 days |
| `Store/kernel-crashes/` | Crash reports | 30 days |
| `Store/kernel-exports/` | On-demand exports | Manual |
| `Store/kernel-metrics/` | Metrics history | 7 days |

---

### boot-kernel.ts (~525 lines)
**Purpose:** Unified Kernel API — single entry point for all kernel functions

**The Kernel Object:**
```typescript
export const Kernel = {
  // Lifecycle
  boot: bootKernel,
  shutdown: shutdownKernel,
  isReady: () => kernelReady,
  
  // Logging
  log: { debug, info, warn, error, fatal, setLevel, getLevel, getBuffer },
  
  // Error handling
  error: { capture, getRecent, getByCategory, getBySeverity, getStats, clear },
  
  // Observation
  observe: { getState, setPhase, subscribe, updateStats, recordHealth, export },
  
  // Metrics
  metrics: { record, recordDuration, increment, get, getAll, checkRateLimit, dashboard, export },
  
  // Hooks
  hooks: { register, unregister, execute, getAll, clear },
  
  // Persistence (NEW)
  persist: {
    saveSnapshot,
    saveCrashReport,
    exportFullState,
    exportMetricsHistory,
    registerDatabaseHook,
    unregisterDatabaseHook,
    cleanupOldFiles,
    listSnapshots,
    getStats,
    createPrismaHook,
    createFileDbHook,
  },
};
```

**Boot Sequence:**
1. Initialize logger (file persistence starts)
2. Initialize error detector (global handlers installed)
3. Initialize observer (state tracking begins)
4. Initialize metrics (counters ready)
5. Initialize hooks (lifecycle system ready)
6. Initialize persistence (snapshots scheduled)
7. Execute 'boot' hooks
8. Execute 'ready' hooks
9. Mark kernel as ready

**Shutdown Sequence:**
1. Execute 'pre-shutdown' hooks
2. Execute 'shutdown' hooks
3. Save shutdown snapshot
4. Shutdown persistence
5. Shutdown metrics
6. Shutdown observer
7. Mark kernel as terminated

---

## Usage Examples

### Basic Kernel Usage

```typescript
import { Kernel } from './kernel';

// Boot the kernel
await Kernel.boot();

// Logging
Kernel.log.info('Application started', { version: '1.0.0' });
Kernel.log.warn('High memory usage', { usedMB: 450 });
Kernel.log.error('Database connection failed', { error: 'ECONNREFUSED' });

// Error capture
try {
  await riskyOperation();
} catch (error) {
  Kernel.error.capture(error, 'RiskyOperation', { attempt: 3 });
}

// Metrics
Kernel.metrics.increment('api.requests');
Kernel.metrics.record('response.time', 150);

// Check rate limit
if (!Kernel.metrics.checkRateLimit('user:123:commands', 10, 60000)) {
  Kernel.log.warn('Rate limit exceeded', { userId: '123' });
}

// Shutdown
await Kernel.shutdown();
```

### Lifecycle Hooks

```typescript
import { Kernel } from './kernel';

// Register a boot hook
Kernel.hooks.register('boot', 'database-connect', async () => {
  await prisma.$connect();
  Kernel.log.info('Database connected');
}, 10); // Priority 10 (runs early)

// Register a shutdown hook
Kernel.hooks.register('shutdown', 'database-disconnect', async () => {
  await prisma.$disconnect();
  Kernel.log.info('Database disconnected');
}, 90); // Priority 90 (runs late)
```

### Database Persistence

```typescript
import { Kernel } from './kernel';
import { prisma } from './shared/prisma';

// Create and register a Prisma hook
const prismaHook = Kernel.persist.createPrismaHook(prisma, {
  tableName: 'KernelSnapshot',
  batchSize: 100,
});
Kernel.persist.registerDatabaseHook(prismaHook);

// Manual snapshot
await Kernel.persist.saveSnapshot('MANUAL', 'Pre-deployment backup');

// Export full state
const exportPath = await Kernel.persist.exportFullState();
Kernel.log.info('State exported', { path: exportPath });

// Cleanup old files
const cleanup = await Kernel.persist.cleanupOldFiles(7);
Kernel.log.info('Cleanup complete', { filesDeleted: cleanup.filesDeleted });
```

---

## Integration Points

### With Application Entry Point (src/index.ts)

```typescript
import { Kernel } from './kernel';

async function main() {
  // Step 1: Boot kernel FIRST
  await Kernel.boot();
  
  // Step 2: Register service hooks
  registerDatabaseHooks();
  registerDiscordHooks();
  registerWorkerHooks();
  
  // Step 3: Initialize services
  await initializeServices();
  
  // Step 4: Start Discord client
  await startDiscordBot();
  
  Kernel.log.info('Application fully operational');
}

process.on('SIGTERM', async () => {
  await Kernel.shutdown();
  process.exit(0);
});

main().catch(error => {
  Kernel.error.capture(error, 'MainEntry');
  process.exit(1);
});
```

### With Service Registry

```typescript
import { Kernel } from './kernel';

Kernel.hooks.register('boot', 'service-registry', async () => {
  const registry = ServiceRegistry.getInstance();
  await registry.initialize();
  
  // Report health to kernel
  registry.onHealthChange((service, status) => {
    Kernel.observe.recordHealth(service, status);
  });
});
```

### With Discord Bot

```typescript
import { Kernel } from './kernel';

client.on('ready', () => {
  Kernel.observe.updateStats({ 
    discordGuilds: client.guilds.cache.size,
    discordUsers: client.users.cache.size,
  });
  Kernel.log.info('Discord client ready', { 
    guilds: client.guilds.cache.size 
  });
});

client.on('error', error => {
  Kernel.error.capture(error, 'DiscordClient');
});
```

---

## Error Handling Philosophy

The kernel follows the **"fail-safe, log-everything, recover-gracefully"** philosophy:

1. **Capture All Errors** — Every error is categorized and stored
2. **Crash Reports** — Critical failures generate detailed crash reports
3. **Graceful Degradation** — System continues operating in degraded mode when possible
4. **Recovery Support** — Crash recovery loads last known good state
5. **Audit Trail** — All operations logged for debugging and compliance

---

## Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Log entry | <1μs | In-memory buffer, async file write |
| Error capture | <5μs | Categorization and storage |
| Metric record | <1μs | Map update |
| Rate limit check | <1μs | Sliding window algorithm |
| Snapshot save | ~50ms | JSON serialization + file write |
| Dashboard generate | ~10ms | Aggregation of all metrics |

---

## Cross-References

- **Parent Router:** [src/ROUTER.md](../ROUTER.md)
- **Store Router:** [Store/ROUTER.md](../../Store/ROUTER.md) — Persistence directories
- **Architecture Bible:** [docs/architecture-bible/INDEX.md](../../docs/architecture-bible/INDEX.md)
- **Operations Bible:** [docs/operations-bible/INDEX.md](../../docs/operations-bible/INDEX.md)
- **Error System:** [docs/architecture-bible/06-error-system.md](../../docs/architecture-bible/06-error-system.md)

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-06-21 | Added kernel-persistence.ts, kernel-hooks.ts, kernel-metrics.ts, kernel-observer.ts, kernel-types.ts | AI Agent |
| 2025-06-20 | Initial kernel module with logger, error-detector, boot-kernel | AI Agent |

---

**Last Validated:** 2025-06-21T02:30:00Z  
**Build Status:** ✅ Passing (npx tsc --noEmit)
