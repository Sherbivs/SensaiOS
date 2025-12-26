# Kernel Logging & Error Detection — System Flow Map

**Date:** December 26, 2025  
**Purpose:** Systematic audit from entry points to pipeline endpoints  
**Status:** Integration audit for kernel observation coverage

---

## 1. ENTRY POINTS (Boot Order)

### 1.1 src/index.ts — Main Application Entry
**Boot Order Position:** #1 (absolute first)

```
KERNEL IMPORT (line 7) ← MUST BE FIRST
   │
   ├─► kernel/boot-kernel.ts initializes:
   │   ├─ kernel-logger.ts (ring buffer, log levels)
   │   ├─ kernel-error-detector.ts (global handlers)
   │   ├─ kernel-observer.ts (system registration)
   │   ├─ kernel-metrics.ts (aggregation)
   │   └─ kernel-hooks.ts (application bridge)
   │
   ├─► signalModulesLoaded() — marks modules loaded
   ├─► ... module imports (Discord, Prisma, services)
   ├─► signalRuntimeReady() — marks system ready
   └─► shutdownKernel() — on SIGTERM/SIGINT
```

**✅ KERNEL COVERAGE:** Full — First import, lifecycle signals, shutdown

---

### 1.2 src/bot/index.ts — Discord Bot Entry
**Boot Order Position:** Loaded by index.ts after kernel

```
KERNEL IMPORT (line 7)
   │
   ├─► kernel.info/warn/error for:
   │   ├─ Bot ready event
   │   ├─ Command loading (lazy)
   │   └─ Interaction handling
   │
   └─► Legacy logger REMOVED (2025-12-26)
```

**✅ KERNEL COVERAGE:** Full — Uses kernel directly

---

### 1.3 src/workers/*.ts — Worker Entry Points

| Worker | File | Kernel? | Logger? | Error Handler? |
|--------|------|---------|---------|----------------|
| **WorkerManager** | worker-manager.ts | ❌ | ✅ getLogger() | ❌ |
| **EngineWorkers** | engine-workers.ts | ❌ | ✅ getLogger() | ✅ workerErrorHandler |
| **ErrorLearningWorker** | error-learning-worker.ts | ❌ | ❓ | ❓ |
| **HeapPruner** | heap-pruner.ts | ❌ | ❓ | ❓ |
| **HomesteadIntegrity** | homestead-integrity.ts | ❌ | ❓ | ❓ |

**⚠️ GAP:** Workers use `getLogger()` which reports UP to kernel, but don't import kernel directly for structured observation.

---

## 2. APPLICATION LAYER (Kernel-Connected)

### 2.1 src/shared/logger.ts — DB-First Logging
**Status:** ✅ INTEGRATED (2025-12-26)

```
Application Code
   │
   └─► logger.info/warn/error()
       ├─► Injects kernel correlation IDs (if available)
       ├─► Kernel.observeLog() ← REPORTS UP
       └─► TimescaleDB write ← CONTINUES DOWN
           └─► Loki (via transport)
```

**Integration Points:**
- Line ~50: `import { createLoggerHook } from "../kernel/kernel-hooks.js"`
- Line ~60: `lazy getKernelHook()` initialization
- Line ~185: `kernelHook?.onLog()` before DB write

---

### 2.2 src/services/monitoring/error-tracker.ts — Error Capture
**Status:** ✅ INTEGRATED (2025-12-26)

```
Application Code
   │
   └─► errorTracker.captureError(error, context)
       ├─► Fingerprint generation
       ├─► Severity classification
       ├─► EventBus.emit('error.*') ← CONTINUES
       ├─► Kernel.observeError() ← REPORTS UP
       ├─► ErrorBrain patterns ← CONTINUES
       └─► DB persistence ← CONTINUES
```

**Integration Points:**
- Line ~50: `import { createErrorTrackerHook } from "../kernel/kernel-hooks.js"`
- Line ~65: `lazy getKernelHook()` initialization
- Line ~450: `kernelHook?.onError()` after EventBus emission

---

### 2.3 src/shared/event-bus.ts — Event Routing
**Status:** ✅ INTEGRATED (2025-12-26)

```
Application Code
   │
   └─► EventBus.emit(event)
       ├─► Backpressure check
       ├─► Pattern matching
       ├─► Kernel.observeEvent() ← REPORTS UP
       └─► Handler dispatch ← CONTINUES
```

**Integration Points:**
- Line ~45: `import { createEventBusHook } from "../kernel/kernel-hooks.js"`
- Line ~55: `lazy getKernelHook()` initialization
- Line ~320: `kernelHook?.onEvent()` with payload size

---

### 2.4 src/shared/service-registry.ts — Service Lifecycle
**Status:** ✅ INTEGRATED (2025-12-26)

```
Service Lifecycle
   │
   ├─► register() ─────────────► Kernel: "REGISTERED"
   ├─► initializeService() ────► Kernel: "INITIALIZING"
   ├─► health check pass ──────► Kernel: "HEALTHY"
   ├─► health check fail ──────► Kernel: "DEGRADED"/"ERROR"
   └─► shutdownService() ──────► Kernel: "SHUTDOWN"
```

**Integration Points:**
- Line ~40: `import { createServiceRegistryHook } from "../kernel/kernel-hooks.js"`
- Line ~55: `lazy getKernelHook()` initialization
- Line ~200: `reportStateToKernel()` helper function

---

## 3. INFRASTRUCTURE LAYER (Sprint 4 Complete)

### 3.1 src/workers/database/*.ts — Database Workers
**Status:** ✅ INTEGRATED (2025-12-26)

| Service | File | Kernel? | Integration |
|---------|------|---------|-------------|
| **BaseWorker** | base-worker.ts | ✅ | `createDatabaseHook()` |
| **WorkerManager** | worker-manager.ts | ✅ | `createWorkerHook()` |
| **EngineWorkers** | engine-workers.ts | ✅ | `createWorkerHook()` |

**Integration Points:**

**base-worker.ts:**
- Line ~50: `import { createDatabaseHook } from "../../kernel/kernel-hooks.js"`
- Line ~60: `lazy getKernelHook(workerName)` initialization
- Line ~200: `kernelHook?.connection('CONNECTED')` in initialize()
- Line ~250: `kernelHook?.connection('DISCONNECTED')` in stop()
- Line ~300: `kernelHook?.query()` with timing in executeOperation()

**worker-manager.ts:**
- Line ~25: `import { createWorkerHook } from "../kernel/kernel-hooks.js"`
- Line ~35: `lazy getKernelHook()` initialization
- Line ~100: `kernelHook?.status('EXECUTING')` in initializeAll()
- Line ~150: `kernelHook?.execution()` timing on complete
- Line ~200: `kernelHook?.status('STOPPED')` in stopAll()

**engine-workers.ts (5 workers):**
- Line ~35: `import { createWorkerHook } from "../kernel/kernel-hooks.js"`
- Line ~45: `lazy getKernelHook()` initialization
- CacheRefreshWorker: `kernelHook?.execution('cache-refresh', durationMs, success)`
- WriteBufferFlusher: `kernelHook?.execution('buffer-flush', durationMs, success)`
- WriteDbValidatorWorker: `kernelHook?.execution('write-db-validator', durationMs, success)`
- EngineMaintenanceWorker: `kernelHook?.execution('engine-maintenance', durationMs, success)`
- startEngineWorkers(): `kernelHook?.status('STARTED')`
- stopEngineWorkers(): `kernelHook?.status('STOPPED')`

**Current Flow:**
```
Database Workers
   │
   ├─► BaseWorker.initialize() ──────────► Kernel: "CONNECTED"
   ├─► BaseWorker.executeOperation() ───► Kernel: query timing (durationMs, success)
   ├─► BaseWorker.stop() ───────────────► Kernel: "DISCONNECTED"
   │
   ├─► WorkerManager.initializeAll() ───► Kernel: "EXECUTING" → execution timing
   ├─► WorkerManager.startAll() ────────► Kernel: "EXECUTING" → execution timing
   ├─► WorkerManager.stopAll() ─────────► Kernel: "STOPPED"
   │
   ├─► EngineWorkers (5 workers):
   │   ├─► execute() success ───────────► Kernel: execution(taskName, durationMs, true)
   │   └─► execute() failure ───────────► Kernel: execution(taskName, durationMs, false)
   │
   ├─► startEngineWorkers() ────────────► Kernel: "STARTED"
   └─► stopEngineWorkers() ─────────────► Kernel: "STOPPED"
```

---

### 3.2 src/observability/*.ts — Observability Suite

| Component | File | Kernel? | Uses EventBus? |
|-----------|------|---------|----------------|
| **Hub** | hub/index.ts | ❌ | ✅ Subscribes |
| **LokiBackend** | backends/loki/index.ts | ❌ | ✅ Receives events |

**Current Flow:**
```
Application ──► EventBus ──► Hub ──► Loki Backend ──► Loki Server
                   │
                   └──► Kernel (via event-bus integration)
```

**⚠️ GAP:** Observability hub has its own lifecycle but doesn't report status to kernel.

---

### 3.3 src/services/error-brain/*.ts — Error Intelligence

| Component | File | Kernel? | Logger? |
|-----------|------|---------|---------|
| **ErrorBrainDB** | error-brain-db.ts | ❌ | ✅ |
| **ErrorBrainCache** | error-brain-cache.ts | ❌ | ✅ |
| **PatternDetector** | pattern-detector.ts | ❌ | ✅ |
| **ImpactPredictor** | impact-predictor.ts | ❌ | ✅ |
| **Worker** | error-brain-worker.ts | ❌ | ✅ |

**Current Flow:**
```
error-tracker.captureError()
   │
   ├──► ErrorBrain.detectTimeAnomaly() ← No kernel reporting
   ├──► ErrorBrain.predictCascade()    ← No kernel reporting
   └──► ErrorBrain.assessImpact()      ← No kernel reporting
```

**⚠️ GAP:** ErrorBrain intelligence insights don't report to kernel for unified observation.

---

## 4. COMMAND & GAME LAYERS (Needs Audit)

### 4.1 src/bot/ops/*.ts — Admin Commands

| Command | File | Kernel? | Logger? | Error Handler? |
|---------|------|---------|---------|----------------|
| **admin.ts** | admin.ts | ❌ | ✅ | ✅ BotErrorHandler |

**⚠️ GAP:** `/ops` commands log but don't report command execution metrics to kernel.

---

### 4.2 src/bot/homestead/*.ts — Gameplay Commands

| Module | File | Kernel? | Logger? | Error Handler? |
|--------|------|---------|---------|----------------|
| **home.ts** | home.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **heal.ts** | heal.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **starters.ts** | starters.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **explore.ts** | explore.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **fish.ts** | fish.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **trade.ts** | trade.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **bag.ts** | bag.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **pokedex.ts** | pokedex.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **party.ts** | party.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **storage.ts** | storage.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **daily.ts** | daily.ts | ❌ | ✅ | ✅ BotErrorHandler |
| **shop.ts** | shop.ts | ❌ | ✅ | ✅ BotErrorHandler |

**Current Flow:**
```
Player Button Click
   │
   └─► handleXButton()
       ├─► Logger call (getLogger()) ──► Kernel (indirect)
       └─► Error? ──► BotErrorHandler ──► errorTracker ──► Kernel ✅
```

**⚠️ GAP:** Normal gameplay flows (non-errors) only reach kernel via logger. Could benefit from:
- Gameplay metrics (actions per minute, session duration)
- Feature usage tracking

---

### 4.3 src/core/*.ts — Game Engines

| Engine | Directory | Kernel? | Logger? |
|--------|-----------|---------|---------|
| **Battle** | battle/ | ❌ | ✅ |
| **Encounter** | encounter/ | ❌ | ✅ |
| **PBSL** | pbsl/ | ❌ | ✅ |

**⚠️ GAP:** Core engines log but don't report:
- Battle start/end to kernel
- Encounter generation timing
- PBSL validation results

---

## 5. DATA PIPELINE (Needs Audit)

### 5.1 src/data_pipeline/*.ts — Data Ingestion

| Component | File | Kernel? | Logger? |
|-----------|------|---------|---------|
| **index.ts** | index.ts | ❌ | ❓ |

**⚠️ GAP:** Data pipeline imports/validation don't report to kernel.

---

## 6. SUMMARY: INTEGRATION STATUS

### ✅ COMPLETE (Kernel-Connected)

| System | Integration | Notes |
|--------|-------------|-------|
| **Main Entry** (index.ts) | ✅ Full | Kernel first import, lifecycle signals |
| **Bot Entry** (bot/index.ts) | ✅ Full | Uses kernel directly |
| **shared/logger.ts** | ✅ Full | Reports UP before DB write |
| **error-tracker.ts** | ✅ Full | Reports UP after EventBus |
| **event-bus.ts** | ✅ Full | Reports UP on emit |
| **service-registry.ts** | ✅ Full | Reports state changes |
| **base-worker.ts** | ✅ Full | Reports query timing, connection status |
| **worker-manager.ts** | ✅ Full | Reports orchestration lifecycle |
| **engine-workers.ts** | ✅ Full | Reports 5 worker task execution |

### ⚠️ PARTIAL (Logger Only → Kernel Indirect)

| System | Gap | Priority |
|--------|-----|----------|
| **ErrorBrain** | Intelligence insights not reported | MEDIUM |
| **Observability Hub** | Hub lifecycle not reported | LOW |

### ❌ MISSING (No Kernel Integration)

| System | Gap | Priority |
|--------|-----|----------|
| **Gameplay Commands** | No action metrics | LOW |
| **Core Engines** | No battle/encounter metrics | LOW |
| **Data Pipeline** | No import/validation metrics | LOW |

---

## 7. RECOMMENDED INTEGRATION ORDER

### Sprint 4: Database Layer (HIGH Priority) — ✅ COMPLETE
1. ✅ **base-worker.ts** — Query timing, connection status
2. ✅ **worker-manager.ts** — Orchestration lifecycle
3. ✅ **engine-workers.ts** — 5 worker task execution

### Sprint 5: Intelligence Layer (MEDIUM Priority) — ✅ COMPLETE
1. ✅ **error-brain-db.ts** — Report learning events (time patterns, correlations, cascades, recovery)
2. ✅ **pattern-detector.ts** — Report anomalies (global, metric, burst), cascade predictions
3. ✅ **impact-predictor.ts** — Report impact assessments and forecasts

### Sprint 6: Observability Layer (LOW Priority) — ✅ COMPLETE
1. ✅ **observability-hub.ts** — Report backend registration, lifecycle, event counts
2. ✅ **loki-backend.ts** — Report lifecycle, queue state

### Future: Gameplay Metrics (Optional)
1. Gameplay action counting
2. Session duration tracking
3. Feature usage analytics

---

## 8. ARCHITECTURE DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KERNEL (Root Observer)                          │
│  ┌──────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ Logger   │ │ Error     │ │ Observer  │ │ Metrics  │ │ Persistence     │  │
│  │ (Ring)   │ │ Detector  │ │ (Systems) │ │ (Agg)    │ │ (Export/JSON)   │  │
│  └──────────┘ └───────────┘ └───────────┘ └──────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
       ▲              ▲              ▲              ▲              ▲
       │              │              │              │              │
       │ reports UP   │              │              │              │
       │              │              │              │              │
┌──────┴──────┐ ┌─────┴─────┐ ┌──────┴──────┐ ┌─────┴─────┐ ┌──────┴──────┐
│shared/logger│ │  error-   │ │ event-bus  │ │ service-  │ │  Database   │
│    ✅ S3    │ │tracker ✅S3│ │   ✅ S3    │ │registry ✅S3│ │Workers ✅S4 │
└──────┬──────┘ └─────┬─────┘ └──────┬──────┘ └─────┬─────┘ └──────┬──────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
  [TimescaleDB]  [Errors DB]   [Handlers]     [Services]    [PROD/Engine]
  [Loki]         [ErrorBrain]  [Replay]       [Health]      [Query Timing]
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PIPELINE ENDPOINTS                                 │
│  ┌──────────────┐ ┌────────────────┐ ┌─────────────┐ ┌───────────────────┐  │
│  │ PostgreSQL   │ │ SQLite         │ │ Loki        │ │ JSON Export       │  │
│  │ (PROD/TSdb)  │ │ (Engine DBs)   │ │ (Logs)      │ │ (Kernel persist)  │  │
│  └──────────────┘ └────────────────┘ └─────────────┘ └───────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. SPRINT PROGRESS

### ✅ Sprint 3: Application Layer (COMPLETE 2025-12-26)
- ✅ shared/logger.ts — Reports UP before DB write
- ✅ error-tracker.ts — Reports UP after EventBus
- ✅ event-bus.ts — Reports UP on emit
- ✅ service-registry.ts — Reports state changes

### ✅ Sprint 4: Database Layer (COMPLETE 2025-12-26)
- ✅ base-worker.ts — Reports query timing, connection status
- ✅ worker-manager.ts — Reports orchestration lifecycle
- ✅ engine-workers.ts — Reports 5 worker task execution

### ✅ Sprint 5: Intelligence Layer (COMPLETE 2025-12-26)
- ✅ error-brain-db.ts — Reports learning events (time patterns, correlations, cascades, recovery)
- ✅ pattern-detector.ts — Reports anomalies (global, metric, burst), cascade predictions
- ✅ impact-predictor.ts — Reports impact assessments and forecasts

### ✅ Sprint 6: Observability Layer (COMPLETE 2025-12-26)
- ✅ observability-hub.ts — Reports backend registration/unregistration, lifecycle (start/stop), event counts (sampled)
- ✅ loki-backend.ts — Reports lifecycle (start/stop), queue state (sampled every 200 events)
- Added OBSERVABILITY SystemType to kernel-types.ts
- Created ObservabilityHook with: backend(), event(), batch(), failure(), lifecycle(), queue() methods

---

## 10. PROJECT-WIDE IMPORT ORDER ENFORCEMENT (2025-12-26)

### Rule: KERNEL FIRST
All files with kernel imports MUST have kernel as the **FIRST import** after the module JSDoc comment.

**Purpose:** Enables kernel to monitor other system initialization and capture any errors during import resolution.

### Pattern Applied:
```typescript
/**
 * @module module-name
 */

// KERNEL FIRST — Must be first import to monitor other system initialization
import { createXxxHook, type XxxHook } from '../kernel/kernel-hooks.js';

// ... all other imports follow
```

### Files Verified (12 files):

| File | Status | Line # |
|------|--------|--------|
| src/shared/logger.ts | ✅ | ~42 |
| src/shared/event-bus.ts | ✅ | ~24 |
| src/shared/service-registry.ts | ✅ | ~19 |
| src/services/monitoring/error-tracker.ts | ✅ | ~17 |
| src/services/error-brain/error-brain-db.ts | ✅ | ~33 |
| src/services/error-brain/pattern-detector.ts | ✅ | ~17 |
| src/services/error-brain/impact-predictor.ts | ✅ | ~17 |
| src/workers/worker-manager.ts | ✅ | ~26 |
| src/workers/engine-workers.ts | ✅ | ~24 |
| src/workers/database/base-worker.ts | ✅ | ~13 |
| src/observability/hub/observability-hub.ts | ✅ | ~24 |
| src/observability/backends/loki/loki-backend.ts | ✅ | ~14 |

**TypeScript Build:** ✅ 0 errors after all changes

---

**Prepared by:** System Audit (Kernel-First Logging Initiative)  
**Last Updated:** 2025-12-26T16:45:00Z
