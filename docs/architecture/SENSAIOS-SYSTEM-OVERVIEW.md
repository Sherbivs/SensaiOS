# SensaiOS System Architecture Overview

**Version:** 1.0  
**Date:** December 30, 2025  
**Status:** Current & Accurate

---

## 🏗️ High-Level Architecture

SensaiOS implements a **3-layer architecture** where the Kernel acts as the mainframe substrate, SensaiOS provides operating system abstractions, and Application/Observability systems run in user-space.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│             LAYER 3: APPLICATION & OBSERVABILITY (User Space)               │
│                      Load POST-OS, consume SensaiOS primitives              │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   APPLICATION ADAPTERS (src/app/)                    │  │
│  │                                                                      │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌─────────────────────┐  │  │
│  │  │ Discord Adapter│  │ Worker Adapter │  │ Infrastructure      │  │  │
│  │  │ (Bot facade)   │  │ (Job facade)   │  │ Adapter (Hooks)     │  │  │
│  │  └────────────────┘  └────────────────┘  └─────────────────────┘  │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │            OBSERVABILITY BACKENDS (src/observability/layer/)         │  │
│  │                                                                      │  │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │  │
│  │  │ Observability │  │ Loki Backend │  │ Envelope System          │ │  │
│  │  │ Hub (Router)  │  │ (Log ship)   │  │ (Universal format)       │ │  │
│  │  └───────────────┘  └──────────────┘  └──────────────────────────┘ │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │               APPLICATION SYSTEMS (Business Logic)                   │  │
│  │                                                                      │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐ │  │
│  │  │ Discord  │  │ Workers  │  │ Services │  │ Core (Battle/PBSL)  │ │  │
│  │  │ Bot      │  │ (Engine) │  │ (Logger) │  │                     │ │  │
│  │  └──────────┘  └──────────┘  └──────────┘  └─────────────────────┘ │  │
│  │                                                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ Use SensaiOS primitives (ctx.*)
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│                LAYER 2: SENSAIOS (Operating System)                         │
│             Sits directly above Kernel, NO intermediate layers              │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │ Component Context│  │ Component Registry│  │  Component Supervisor  │   │
│  │ (DI Container)   │  │  (Lifecycle Mgmt) │  │   (Service Manager)    │   │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │   runGuarded()   │  │  Tenant Scope    │  │    SensaiError         │   │
│  │ (Error Boundary) │  │ (Multi-tenant ID)│  │  (Typed Taxonomy)      │   │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘   │
│                                                                             │
│  Context Injection: ctx.db | ctx.exports | ctx.jobs | ctx.outbox |         │
│                     ctx.obs | ctx.rng | ctx.rbac | ctx.config | ctx.storage│
│                                                                             │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ Direct access to Kernel substrate
                              ↓
┌─────────────────────────────────────────────────────────────────────────────┐
│               LAYER 1: KERNEL (Mainframe Substrate)                         │
│       Metrics, DB control flow, cross-layer parsing → DB persistence        │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  Boot Kernel     │  │  Kernel Logger   │  │   Kernel Observer      │   │
│  │  (Entry Point)   │  │  (Ring Buffer)   │  │   (DB Control Flow)    │   │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  Kernel Hooks    │  │  Kernel Metrics  │  │   Error Detector       │   │
│  │  (Layer Bridge)  │  │  (Aggregation)   │  │   (Fingerprinting)     │   │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
│  │  Correlation     │  │  Persistence     │  │   Cross-Layer Parser   │   │
│  │  (Trace IDs)     │  │  (Snapshots)     │  │   (ALL layers → DB)    │   │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘   │
│                                                                             │
│  Ring Buffers: 10,000 logs | 1,000 errors | 500 metrics                    │
│  DB Control: Transaction boundaries | Stop/control flow coordination       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
                              ↓
                    ┌────────────────────┐
                    │   PostgreSQL + WAL │
                    └────────────────────┘
```

---

## 📦 Layer Responsibilities

### **Architecture: 3 Layers (No Intermediate Layers)**

```
┌───────────────────────────────────────────────────────────┐
│ LAYER 3: APPLICATION & OBSERVABILITY (User Space)        │
│ Domain systems that load POST-OS                         │
│ • Discord/Worker/Infrastructure adapters                 │
│ • ObservabilityHub + Loki backend                        │
└───────────────────────┬───────────────────────────────────┘
                        │ Use OS primitives
                        ↓
┌───────────────────────────────────────────────────────────┐
│ LAYER 2: SENSAIOS (Operating System)                     │
│ OS abstractions sitting directly above kernel            │
│ • Component model (lifecycle management)                 │
│ • Context injection (9 kernel primitives)                │
│ • runGuarded wrapper (automatic observability)           │
└───────────────────────┬───────────────────────────────────┘
                        │ Direct access to substrate
                        ↓
┌───────────────────────────────────────────────────────────┐
│ LAYER 1: KERNEL (Mainframe Substrate)                    │
│ Metrics, DB control flow, cross-layer parsing → DB       │
│ • Ring buffers (logs/errors/metrics)                     │
│ • Database stop/control flow coordination                │
│ • Parse observations from ALL layers → DB persistence    │
└───────────────────────────────────────────────────────────┘
```

### **1. Kernel Layer** (`src/kernel/`) — Mainframe Substrate
**Role:** Mainframe substrate controlling metrics, database flow, and cross-layer parsing  
**Started:** First (before any application code)  
**Stopped:** Last (exports all data before exit)

**Core Primitives** (9):
- `ctx.db` — Transaction wrapper + **DB control flow coordination** (PostgreSQL/Prisma)
- `ctx.exports` — Append-only event log (immutable facts) + **parsing router to DB**
- `ctx.jobs` — Background work queue (with retries)
- `ctx.outbox` — External message delivery (Discord, webhooks)
- `ctx.obs` — **Ring buffers** (logs/errors/metrics) + structured emission
- `ctx.rng` — Deterministic RNG service (seeded per-user)
- `ctx.rbac` — Role-based access control
- `ctx.config` — Configuration + feature flags
- `ctx.storage` — Database-backed object store

**Key Responsibilities**:
- **Database Stop/Control Flow**: Coordinate all DB operations, transaction boundaries
- **Cross-Layer Parsing**: Receive observations from ALL layers, parse, route to DB persistence
- **Metrics Collection**: Ring buffers capturing system telemetry before DB write
- Boot logger (before database connects)
- TenantScope propagation support (trace IDs and scope handed upward)

**Components:**
- `boot-kernel.ts` — System bootstrap entry point
- `kernel-logger.ts` — Ring buffer logging (10,000 entries)
- `kernel-observer.ts` — **DB control flow coordination**
- `kernel-hooks.ts` — **Cross-layer parsing bridge** (ALL layers → DB)
- `kernel-metrics.ts` — Aggregation and infrastructure tracking
- `kernel-persistence.ts` — Snapshot/crash report export
- `correlation.ts` — Distributed trace ID propagation
- `kernel-error-detector.ts` — Error fingerprinting and pattern detection

**Key Properties:**
- Zero dependencies on application code
- Fail-safe: kernel failures never crash application
- Non-blocking: observations queued, never block application
- Passive: never modifies application state

---

### **2. SensaiOS Layer** (`src/sensai/`) — Operating System
**Role:** OS abstractions sitting directly above Kernel with NO intermediate layers  
**Position:** Between Kernel (mainframe substrate) and Application/Observability (user space)

**Components:**
- Component model (lifecycle management)
- Context injection (9 kernel primitives: `ctx.db`, `ctx.exports`, `ctx.jobs`, `ctx.outbox`, `ctx.obs`, `ctx.rng`, `ctx.rbac`, `ctx.config`, `ctx.storage`)
- `runGuarded()` wrapper (automatic observability: correlation, timing, error capture)
- Component supervisor (load/enable/disable/unload)
- Multi-tenant scope (`{ tenantId, guildId }` in every envelope)
- `SensaiError` taxonomy (1xxx-6xxx) defined and enforced here

**Key Properties:**
- Direct access to Kernel primitives (no middleware)
- Provides abstractions for user-space systems
- Manages component lifecycle and dependency injection
- Enforces tenant isolation and security boundaries
- Exposes primitives via a syscall-like surface; Kernel never imports OS or user-space

---

### **3. Application & Observability Layers** (User Space) — POST-OS Systems
**Role:** Domain systems that load AFTER SensaiOS is initialized  
**Position:** Top-level user space consuming OS services

#### **3A. Application Layer** (`src/app/`)
**Role:** Domain adapters providing business logic access to SensaiOS primitives

**Adapters:**

##### **Discord Adapter** (`discord-adapter.ts`)
- `appLog()` — Logging facade for Discord bot
- `withDiscordTrace()` — Discord-specific tracing
- `scopeFromInteraction()` — Extract tenant scope from Discord interactions
- `createHandler()` — Wrap handlers with correlation tracking

##### **Worker Adapter** (`worker-adapter.ts`)
- `workerLog()` — Logging facade for background workers
- `executeWorker()` — Worker execution wrapper with observability
- `createWorkerHook()` — Hook for worker registration

##### **Infrastructure Adapter** (`infrastructure-adapter.ts`)
- Re-exports SensaiOS hooks for infrastructure integration
- Re-exports correlation utilities and metrics APIs
- Re-exports kernel query API for observability

**Why This Adapter Layer?**
- **Clean Separation** — Application never imports from kernel directly (goes through SensaiOS)
- **Testability** — Adapters can be mocked for testing
- **Flexibility** — Kernel can change without breaking application
- **Security** — All kernel access auditable through single entry point

#### **3B. Observability Layer** (`src/observability/layer/`)
**Role:** Monitoring backends providing telemetry collection and analysis

**Components:**

##### **Observability Hub** (`hub/observability-hub.ts`)
- Service manager where backends "install" themselves
- Routes events to registered backends
- Manages backend lifecycle (enable/disable/health checks)

#### **Loki Backend** (`backends/loki/`)
- Log aggregation service that ships logs to Grafana Loki
- Batches logs with flush workers
- Health monitoring with circuit breaker

#### **Envelope System** (`envelope/`)
- Universal event format for all observability data
- Factory functions: `createLog`, `createMetric`, `createTrace`, `createAlert`
- Serialization: `serialize`, `deserialize`
- Safe console logging: `scopedLogger` (no circular dependencies)

**Why Parallel to Application Layer?**
- **Separation of Concerns** — Business logic vs monitoring
- **Independent Evolution** — Backends can be added/removed without app changes
- **Kernel Access** — Both layers need direct kernel access for their domain
- **Installation Point** — Hub is where backends "install" like OS services

---

> Legacy sections removed: SensaiOS and Application systems are already covered in the 3-layer model above. This document is now single-sourced to the 3-layer architecture (Kernel → SensaiOS → Application & Observability).

## 🔄 Interaction Patterns

**Boot & Shutdown Order (must always hold):**
1) Boot logger → 2) Kernel minimal init → 3) SensaiOS supervisor + DI → 4) Application + Observability adapters/backends.
On shutdown: mark NOT READY → stop user-space → drain/flush (observability drops before correctness) → persist snapshots → stop kernel.

**Boundary Enforcement:** Kernel never imports SensaiOS or user-space; SensaiOS imports Kernel only; user-space consumes via SensaiOS context/adapters. Enforce with lint/build rules.

**Observability Independence:** Logs/metrics may degrade or drop under backpressure; correctness paths (DB/outbox/exports/jobs) must remain intact and idempotent.

### **Logs Flow**
```
Application Logger (src/shared/logger.ts)
    ↓ creates hook via
Application Layer (src/app/infrastructure-adapter.ts)
    ↓ calls
Kernel Hooks (src/kernel/kernel-hooks.ts::createLoggerHook)
    ↓ registers and observes via
Kernel Observer (src/kernel/kernel-observer.ts::observeLog)
    ↓ stores in
Kernel Logger (src/kernel/kernel-logger.ts::ring buffer)
    ↓ triggers hooks for
Observability Layer (src/observability/layer/)
    ↓ routes to
Loki Backend (src/observability/backends/loki/)
    ↓ ships to
Grafana Loki (external)
```

### **Infrastructure Metrics Flow**
```
Resource Monitor (src/services/monitoring/resource-monitor.ts)
    ↓ creates hook via
Application Layer (src/app/infrastructure-adapter.ts)
    ↓ calls
Kernel Hooks (src/kernel/kernel-hooks.ts::createInfrastructureHook)
    ↓ observes via
Kernel Metrics (src/kernel/kernel-metrics.ts::observeInfraMetric)
    ↓ stores in ring buffer
Kernel Metrics (500 entry buffer)
    ↓ aggregates for
Dashboard (src/kernel/kernel-metrics.ts::getInfrastructureMetrics)
```

### **Error Flow**
```
Application Code (throws error)
    ↓ caught by
runGuarded (src/sensaios/run-guarded.ts)
    ↓ wraps in
SensaiError (src/sensaios/sensai-error.ts)
    ↓ reports via
Application Layer (src/app/infrastructure-adapter.ts)
    ↓ calls
Kernel Hooks (src/kernel/kernel-hooks.ts::createErrorTrackerHook)
    ↓ fingerprints and stores via
Kernel Error Detector (src/kernel/kernel-error-detector.ts)
    ↓ notifies
Kernel Observer (src/kernel/kernel-observer.ts::observeError)
    ↓ triggers hooks for
Observability Layer → Loki Backend → Grafana Loki
```

---

## 🎯 Design Principles

### **1. Layered Isolation**
- Each layer has clear boundaries and responsibilities
- Lower layers never import from higher layers
- Kernel has zero application dependencies

### **2. Fail-Safe Operation**
- Kernel failures never crash application
- All observations are non-blocking
- Hooks catch and log their own errors

### **3. Observability First**
- All operations traced with correlation IDs
- All errors fingerprinted and deduplicated
- All metrics aggregated for health scoring

### **4. Multi-Tenant by Default**
- All envelopes carry `{ tenantId, guildId }`
- Tenant isolation at kernel level
- Per-tenant correlation tracking

### **5. Type Safety**
- Comprehensive TypeScript types throughout
- Error taxonomy with codes (1xxx-6xxx)
- Metric categories and units enforced

---

## 📊 Metrics & Observability

### **Kernel Metrics** (Aggregated)
- Uptime, boot time, current phase
- Registered systems by type
- Total observations (logs, errors, services, events)
- Ring buffer utilization
- Observations per second (current + peak)

### **Infrastructure Metrics** (Resource Tracking)
Categories: MEMORY | CPU | DISK | NETWORK | DATABASE | CACHE | WORKER | DISCORD | GAME | SYSTEM

**Aggregated View:**
- Memory: RSS, heap used/total, external, utilization %
- CPU: usage %, event loop lag
- Disk: used/free MB, utilization %
- Database: active connections, query latency, query count
- Cache: hit rate, size MB, entry count
- Workers: active/idle count, tasks completed/failed
- Discord: latency ms, gateway status
- Health Score: 0-100 overall health
- Alert Level: NORMAL | WARNING | CRITICAL | EMERGENCY

---

## 🔌 Extension Points

### **New System Integration**
1. Create hook via `createCustomHook(id, type, name)`
2. Register with kernel via `hook.register()`
3. Forward observations via `hook.log()`, `hook.error()`, `hook.service()`, `hook.event()`

### **New Backend Installation**
1. Implement `IObservabilityBackend` interface
2. Call `observabilityHub.installBackend(backend)`
3. Backend receives events via `handleEvent(event)`

### **New SensaiOS Component**
1. Define component manifest with capabilities
2. Register via component registry
3. Access primitives via component context
4. Implement lifecycle hooks: `onLoad`, `onEnable`, `onDisable`, `onUnload`

---

## 📚 Related Documentation

- **Kernel Implementation:** `src/kernel/ROUTER.md`
- **Application Layer:** `src/app/index.ts` (inline docs)
- **Observability Layer:** `src/observability/layer/index.ts` (inline docs)
- **SensaiOS Spec:** `docs/projects/SensaiOS/SENSAI-FINAL-ARCHITECTURE.md`
- **Detailed Diagrams:** See individual layer diagrams (coming next)

---

**Next Diagram:** [Diagram 2: Kernel Layer Detail](./SENSAIOS-KERNEL-DETAIL.md)
