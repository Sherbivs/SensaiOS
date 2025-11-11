# Centralized Architecture Analysis & Implementation Plan

**Date:** 2025-11-11  
**Status:** DRAFT  
**Priority:** HIGH  
**Purpose:** Ensure all systems are centralized, scalable, work systematically together, and operate efficiently/asynchronously without draining CPU

## Executive Summary

Current architecture has **8 workers + 1 web service** with strong foundations but fragmentation in:
- **Service Discovery:** Direct imports create tight coupling (ResourceManager, ErrorTracker, ProfileService)
- **Event Coordination:** Multiple event systems (EventTracker, error streams, bus messages, drip alerts) operate independently
- **Worker Patterns:** Boilerplate duplication across 7 worker files (initialization, error handling, health checks)
- **Resource Pooling:** Multiple Prisma clients, cache instances, logger instances duplicated per service
- **CPU Efficiency:** Blocking operations in event loop (heavy validation, data processing)

**Goal:** Create a **centralized, event-driven architecture** where all systems coordinate through a unified registry and communicate asynchronously without blocking the event loop.

---

## Current State Audit

### Services Inventory

| Service | Purpose | Current State | Issues |
|---------|---------|---------------|--------|
| **ResourceManager** | Resource request validation | Singleton export | Direct coupling, no service discovery |
| **ErrorTracker** | Error capture + fingerprinting | Singleton export | Good: Event stream, but subscribers tightly coupled |
| **ErrorRecovery** | Automatic error recovery | Singleton export | Direct service calls, no queue-based recovery |
| **ProfileService** | User profile CRUD | Singleton export | Good: Factory pattern, isolated |
| **CacheFacade** | Runtime cache (L1 + disk) | Function exports | No lifecycle management, no stats aggregation |
| **EngineCache** | L1 Pokemon/Move cache | Module singleton | Good: Isolated, but no coordination with CacheFacade |
| **EngineWriteBuffer** | Battle log buffering | Module singleton | Good: Async flush, but no backpressure coordination |
| **LogBuffer** | Log deduplication + aggregation | Module singleton | Good: Async flush, isolated |
| **EventTracker** | User event batching | Class-based singleton | Good: Batch processing, but no cross-service event correlation |

**Key Finding:** Services are **well-isolated** but **lack centralized coordination**. No service registry, no dependency injection, tight coupling through direct imports.

---

### Workers Inventory

| Worker | Purpose | CPU Usage | Async Pattern | Issues |
|--------|---------|-----------|---------------|--------|
| **infinity-gauntlet-bots** | Discord bot + auto-sync | High (battle engine) | Event-driven (Discord events) | Blocking battle resolution in event loop |
| **infinity-gauntlet-outbox** | Event bus drain + backup | Low | Poll-based (30s intervals) | Good: Jitter + backoff |
| **infinity-gauntlet-cache** | Cache maintenance + cleanup | Low | Scheduled (10min intervals) | Good: Isolated |
| **infinity-gauntlet-data-pipeline** | Reference data updates | Medium | Scheduled (daily) | Good: Isolated |
| **infinity-gauntlet-security** | Permission guardrails | Low | Event-driven (Discord audit log) | Good: State persistence |
| **pokedex-cache-worker** | External data sync to GitHub | Low | Scheduled (daily) | Good: Isolated |
| **pokedex-cache-failsafe** | Weekly fallback refresh (cron) | Low | Cron-based (weekly) | Good: Isolated |
| **infinity-gauntlet-bot** (web) | HTTP health checks + webhooks | Low | HTTP-driven | Good: Isolated |

**Key Finding:** Workers use **3 different patterns** (event-driven, poll-based, scheduled) with **boilerplate duplication** in initialization, error handling, and health checks. No centralized worker orchestration.

---

### Event Systems Inventory

| System | Purpose | Pattern | Issues |
|--------|---------|---------|--------|
| **BusMessage (PostgreSQL)** | Async message queue | Poll-based (SKIP LOCKED) | Good: Transaction-safe, but no pub/sub |
| **EventTracker** | User event batching | Batch insert (100 events, 5s delay) | Good: Efficient, but isolated from other events |
| **ErrorTracker live stream** | Real-time error broadcast | Subscriber pattern (EventEmitter) | Memory leak risk (unbounded listeners) |
| **Drip Alert Queue** | Critical alert delivery | In-memory queue + retry | Good: Retry logic, but no persistence |
| **Ops Error Queue** | Ops alert delivery | In-memory queue + retry | Good: Retry logic, but no persistence |
| **Cooldown Store** | Rate limiting | In-memory Map + TTL | Good: Cleanup + persistence (Phase 2B) |

**Key Finding:** **6 independent event systems** with no centralized coordination. Good isolation, but missed opportunities for cross-system event correlation and unified observability.

---

### Resource Pooling Audit

| Resource | Instances | Memory Impact | Issues |
|----------|-----------|---------------|--------|
| **Prisma Clients** | 3 (prod, onPremiseDev, onPremiseExperiment) | 30-50 MB each | Good: Singleton per DB, connection pooling |
| **Cache Instances** | 3 (engineCache, cacheFacade, legacy cache) | ~15 MB total | Good: Isolated namespaces |
| **Logger Instances** | 2 (log, aiLogger) | ~5 MB | Good: Singleton pattern |
| **Event Queues** | 6 (bus, events, errors, alerts, cooldowns, write buffer) | ~10 MB | Good: Bounded queues |

**Key Finding:** Resource pooling is **efficient** with singleton patterns. Memory optimizations (Phase 2A/2B) achieved -50 MB reduction. No major duplication issues.

---

## Fragmentation Issues

### 1. Service Discovery Fragmentation

**Problem:** Services use direct imports with no centralized registry:

```typescript
// Current Pattern (Tight Coupling):
import { resourceManager } from '../services/resource-manager.js';
import { errorTracker } from '../services/error-tracker.js';
import { profileService } from '../services/profiles/index.js';

// In every file that needs these services
const result = await resourceManager.requestResource({ /* ... */ });
```

**Impact:**
- ❌ Tight coupling (cannot swap implementations)
- ❌ No lifecycle management (startup order undefined)
- ❌ No health checks (cannot detect service failures)
- ❌ No dependency injection (hard to test)

**Solution:** Centralized **Service Registry** with dependency injection:

```typescript
// Proposed Pattern (Loose Coupling):
import { ServiceRegistry } from '../shared/service-registry.js';

const registry = ServiceRegistry.getInstance();
const resourceManager = registry.get('resource-manager');
const errorTracker = registry.get('error-tracker');

// Startup in src/index.ts:
await registry.initialize([
  { name: 'error-tracker', factory: () => createErrorTracker() },
  { name: 'resource-manager', factory: () => createResourceManager({ errorTracker }) },
  { name: 'profile-service', factory: () => createProfileService({ db: prisma }) },
]);
```

**Benefits:**
- ✅ Loose coupling (can swap implementations via factory)
- ✅ Explicit dependency graph (startup order enforced)
- ✅ Health checks (registry monitors service status)
- ✅ Testability (can inject mocks)

---

### 2. Event Coordination Fragmentation

**Problem:** 6 independent event systems with no cross-system correlation:

```typescript
// Current Pattern (Isolated Events):

// System 1: User events
eventTracker.track({ category: 'BATTLE', eventType: 'BATTLE_STARTED', ... });

// System 2: Error events
errorTracker.captureError(error, { category: 'BATTLE', ... });

// System 3: Alert events
dripAlertManager.recordAlert('critical', 'Battle crashed', ...);

// System 4: Bus messages
publishMessage('battle.started', { battleId: '...' });
```

**Impact:**
- ❌ No event correlation (cannot track battle start → error → alert → recovery)
- ❌ Duplicate telemetry (battle event logged 3+ times in different systems)
- ❌ No unified observability (must query 6 different systems)

**Solution:** Unified **Event Bus** with event routing:

```typescript
// Proposed Pattern (Unified Events):
import { EventBus } from '../shared/event-bus.js';

const bus = EventBus.getInstance();

// Emit once, route to multiple subscribers
bus.emit('battle.started', {
  battleId: '...',
  userId: '...',
  timestamp: Date.now(),
});

// Subscribers register interest:
bus.subscribe('battle.*', (event) => {
  eventTracker.track(event); // User event persistence
});

bus.subscribe('battle.error', (event) => {
  errorTracker.captureError(event.error, event.context); // Error capture
  dripAlertManager.recordAlert('critical', event.message); // Alert delivery
});

bus.subscribe('battle.completed', (event) => {
  engineWriteBuffer.logBattle(event); // Battle log persistence
});
```

**Benefits:**
- ✅ Event correlation (single event ID across all systems)
- ✅ Reduced duplication (emit once, route to many)
- ✅ Unified observability (single event timeline)
- ✅ Extensibility (add new subscribers without modifying emitters)

---

### 3. Worker Coordination Fragmentation

**Problem:** 7 worker files with repeated boilerplate:

```typescript
// Repeated Pattern (src/worker/outbox.ts, cache-refresh.ts, data-pipeline.ts, ...):

import { log } from '../shared/log.js';
import { setupGracefulShutdown } from '../shared/worker-runtime.js';

async function main() {
  log.info('worker.outbox.start', { service: 'outbox' });
  
  setupGracefulShutdown(async () => {
    log.info('worker.outbox.shutdown', {});
    // Cleanup logic
  });
  
  // Worker-specific logic
  setInterval(async () => {
    try {
      // Task logic
    } catch (error) {
      log.error('worker.outbox.error', { error });
    }
  }, 30_000);
}

main().catch((error) => {
  log.error('worker.outbox.fatal', { error });
  process.exit(1);
});
```

**Impact:**
- ❌ Boilerplate duplication (40+ lines repeated 7 times)
- ❌ Inconsistent error handling (some workers have retries, others don't)
- ❌ No health checks (cannot monitor worker status)
- ❌ No coordination (workers cannot communicate)

**Solution:** Centralized **Worker Orchestrator**:

```typescript
// Proposed Pattern (src/shared/worker-orchestrator.ts):

import { WorkerOrchestrator } from '../shared/worker-orchestrator.js';

const orchestrator = WorkerOrchestrator.getInstance();

// Register worker with standardized configuration:
orchestrator.registerWorker({
  name: 'outbox',
  type: 'poll-based',
  intervalMs: 30_000,
  jitterMs: 5_000,
  maxRetries: 3,
  healthCheckInterval: 60_000,
  execute: async (ctx) => {
    // Worker logic (only business logic, no boilerplate)
    const messages = await claimPendingBatch(10);
    for (const message of messages) {
      await processMessage(ctx, message);
    }
  },
});

// Start all workers:
await orchestrator.startAll();
```

**Benefits:**
- ✅ No boilerplate (orchestrator handles initialization, error handling, health checks)
- ✅ Consistent error handling (standardized retry logic)
- ✅ Health monitoring (orchestrator reports status to registry)
- ✅ Worker coordination (can pause/resume workers, enforce dependencies)

---

### 4. CPU Efficiency Issues

**Problem:** Blocking operations in event loop:

```typescript
// Current Pattern (Blocking):

// Battle resolution blocks event loop (~50-200ms):
async function executeBattle(battleId) {
  const battle = await loadBattle(battleId);
  const result = await resolveTurn(battle); // BLOCKS: Heavy CPU calculation
  await saveBattle(battle);
  return result;
}

// Data validation blocks event loop (~100-500ms):
async function validateData() {
  const battles = await readBattlesFromDb(); // 1000+ rows
  for (const battle of battles) {
    validateBattleIntegrity(battle); // BLOCKS: CPU-intensive
  }
}
```

**Impact:**
- ❌ Event loop blocked (Discord events delayed, HTTP responses slow)
- ❌ CPU spikes (single-threaded bottleneck)
- ❌ Poor scalability (cannot handle >100 concurrent battles)

**Solution:** **Worker Threads** for CPU-intensive tasks:

```typescript
// Proposed Pattern (Non-Blocking):

import { WorkerPool } from '../shared/worker-pool.js';

const battlePool = WorkerPool.create({
  name: 'battle-engine',
  workerScript: './dist/workers/battle-worker.js',
  poolSize: 4, // 4 worker threads
  maxQueueSize: 100,
});

// Offload to worker thread:
async function executeBattle(battleId) {
  const battle = await loadBattle(battleId);
  const result = await battlePool.execute('resolveTurn', battle); // NON-BLOCKING
  await saveBattle(battle);
  return result;
}

// Worker thread (dist/workers/battle-worker.js):
import { parentPort } from 'node:worker_threads';

parentPort.on('message', ({ method, data }) => {
  if (method === 'resolveTurn') {
    const result = resolveTurn(data); // Heavy CPU work in separate thread
    parentPort.postMessage({ result });
  }
});
```

**Benefits:**
- ✅ Non-blocking (event loop stays responsive)
- ✅ CPU parallelism (utilize all cores)
- ✅ Better scalability (handle 1000+ concurrent battles)
- ✅ Graceful degradation (queue fills → reject early)

---

## Proposed Centralized Architecture

### Layer 1: Service Registry (Foundation)

**Purpose:** Centralized service discovery, lifecycle management, health monitoring

**Location:** `src/shared/service-registry.ts`

**Features:**
- Service registration with factory pattern
- Dependency graph resolution (startup order)
- Health check monitoring (periodic pings)
- Graceful shutdown coordination (reverse dependency order)
- Service statistics (uptime, request count, error rate)

**API:**
```typescript
const registry = ServiceRegistry.getInstance();

// Register services:
registry.register('error-tracker', createErrorTracker, { startupOrder: 1 });
registry.register('resource-manager', createResourceManager, { 
  startupOrder: 2, 
  dependencies: ['error-tracker'] 
});

// Initialize all:
await registry.initializeAll();

// Get service:
const errorTracker = registry.get('error-tracker');

// Health check:
const health = registry.getHealth(); // { 'error-tracker': 'healthy', ... }

// Graceful shutdown:
await registry.shutdownAll();
```

---

### Layer 2: Event Bus (Coordination)

**Purpose:** Unified event routing, cross-system correlation, async coordination

**Location:** `src/shared/event-bus.ts`

**Features:**
- Event emission with automatic correlation ID
- Pattern-based subscriptions (`battle.*`, `error.*`)
- Event replay (last N events for debugging)
- Event persistence (critical events to database)
- Backpressure handling (slow subscribers don't block fast emitters)

**API:**
```typescript
const bus = EventBus.getInstance();

// Emit event:
bus.emit('battle.started', { battleId, userId, timestamp });

// Subscribe with pattern:
bus.subscribe('battle.*', async (event) => {
  log.info('Battle event', event);
  await eventTracker.track(event);
});

// Subscribe with priority (critical handlers first):
bus.subscribe('error.*', async (event) => {
  await errorTracker.captureError(event);
}, { priority: 'high' });

// Get event history (for debugging):
const history = bus.getHistory('battle.started', { limit: 10 });
```

---

### Layer 3: Worker Orchestrator (Execution)

**Purpose:** Standardized worker lifecycle, health monitoring, coordination

**Location:** `src/shared/worker-orchestrator.ts`

**Features:**
- Worker registration with configuration
- Standardized error handling + retries
- Health check monitoring
- Worker coordination (pause/resume, dependencies)
- CPU offloading to worker threads

**API:**
```typescript
const orchestrator = WorkerOrchestrator.getInstance();

// Register worker:
orchestrator.register({
  name: 'outbox',
  type: 'poll-based',
  intervalMs: 30_000,
  execute: async (ctx) => {
    const messages = await claimPendingBatch(10);
    for (const msg of messages) await processMessage(ctx, msg);
  },
});

// Start all workers:
await orchestrator.startAll();

// Monitor health:
const health = orchestrator.getHealth(); // { 'outbox': 'healthy', ... }

// Pause worker (for maintenance):
await orchestrator.pause('outbox');

// Resume worker:
await orchestrator.resume('outbox');
```

---

### Layer 4: Worker Pool (CPU Optimization)

**Purpose:** Offload CPU-intensive tasks to worker threads

**Location:** `src/shared/worker-pool.ts`

**Features:**
- Worker thread pool management (create, destroy, reuse)
- Task queue with backpressure
- Load balancing (round-robin, least-busy)
- Worker health monitoring (crash detection + restart)
- Statistics (throughput, latency, queue depth)

**API:**
```typescript
const pool = WorkerPool.create({
  name: 'battle-engine',
  workerScript: './dist/workers/battle-worker.js',
  poolSize: 4, // 4 worker threads
  maxQueueSize: 100,
});

// Execute task:
const result = await pool.execute('resolveTurn', battleData);

// Monitor stats:
const stats = pool.getStats(); 
// { activeWorkers: 4, queueDepth: 12, avgLatencyMs: 45 }

// Graceful shutdown:
await pool.shutdown();
```

---

## Implementation Phases

### Phase 1: Foundation (Service Registry)
**Effort:** 2-3 days  
**Priority:** HIGH  
**Dependencies:** None

**Deliverables:**
1. `src/shared/service-registry.ts` (300 lines)
   - Service registration with factory pattern
   - Dependency graph resolution
   - Health check monitoring
   - Graceful shutdown coordination

2. Migrate existing services to registry:
   - ResourceManager
   - ErrorTracker
   - ProfileService
   - CacheFacade
   - EngineCache
   - EngineWriteBuffer

3. Update `src/index.ts`:
   - Initialize registry on startup
   - Register all services
   - Replace direct imports with `registry.get()`

4. Tests:
   - Service registration + retrieval
   - Dependency resolution
   - Health checks
   - Graceful shutdown

---

### Phase 2: Event Bus (Coordination)
**Effort:** 3-4 days  
**Priority:** HIGH  
**Dependencies:** Phase 1

**Deliverables:**
1. `src/shared/event-bus.ts` (400 lines)
   - Event emission with correlation IDs
   - Pattern-based subscriptions
   - Event replay buffer
   - Backpressure handling

2. Migrate existing event systems:
   - EventTracker (user events)
   - ErrorTracker (error streams)
   - DripAlertManager (critical alerts)
   - BusMessage (async messages)

3. Unified event schema:
   - Common fields: `eventId`, `eventType`, `category`, `timestamp`, `correlationId`
   - Type-safe event definitions

4. Tests:
   - Event emission + routing
   - Subscription patterns
   - Event replay
   - Backpressure handling

---

### Phase 3: Worker Orchestrator (Execution)
**Effort:** 2-3 days  
**Priority:** MEDIUM  
**Dependencies:** Phase 1

**Deliverables:**
1. `src/shared/worker-orchestrator.ts` (350 lines)
   - Worker registration
   - Standardized error handling
   - Health monitoring
   - Pause/resume coordination

2. Refactor existing workers:
   - outbox.ts → use orchestrator
   - cache-refresh.ts → use orchestrator
   - data-pipeline.ts → use orchestrator
   - Remove 200+ lines of boilerplate

3. Worker health dashboard:
   - `/ops workers` command
   - Show: status, uptime, last run, error count

4. Tests:
   - Worker registration + execution
   - Error handling + retries
   - Health monitoring
   - Pause/resume

---

### Phase 4: Worker Pool (CPU Optimization)
**Effort:** 4-5 days  
**Priority:** MEDIUM  
**Dependencies:** Phase 3

**Deliverables:**
1. `src/shared/worker-pool.ts` (500 lines)
   - Worker thread pool management
   - Task queue + backpressure
   - Load balancing
   - Worker crash detection + restart

2. Battle engine worker thread:
   - `dist/workers/battle-worker.js`
   - Move `resolveTurn()` to worker thread
   - Handle 1000+ concurrent battles

3. Validation worker thread:
   - `dist/workers/validator-worker.js`
   - Move `validateData()` to worker thread
   - Free up event loop

4. Tests:
   - Task execution
   - Load balancing
   - Backpressure
   - Worker crash recovery

---

### Phase 5: Documentation + Migration
**Effort:** 1-2 days  
**Priority:** LOW  
**Dependencies:** Phases 1-4

**Deliverables:**
1. `docs/architecture/centralized-architecture.md`
   - System overview
   - Service registry guide
   - Event bus patterns
   - Worker orchestration
   - CPU optimization strategies

2. Migration guide:
   - Converting direct imports to registry
   - Migrating event systems to bus
   - Refactoring workers to orchestrator
   - Performance tuning worker pools

3. Update `AGENTS.md`:
   - Add centralized architecture section
   - Link to new docs

---

## Success Metrics

### Performance Metrics

| Metric | Current | Target (Post-Implementation) |
|--------|---------|------------------------------|
| **Service startup time** | ~5s (sequential) | <2s (parallel via registry) |
| **Event loop lag** | 50-200ms (battles block loop) | <10ms (battles in worker threads) |
| **Concurrent battles** | ~50 (single-threaded) | 1000+ (worker pool) |
| **Worker coordination** | N/A (independent workers) | <100ms (pause/resume all) |
| **Event correlation** | 0% (isolated systems) | 100% (unified event IDs) |
| **Memory duplication** | ~15 MB (multiple cache instances) | ~10 MB (shared resources) |

### Code Quality Metrics

| Metric | Current | Target |
|--------|---------|--------|
| **Worker boilerplate** | 280+ lines (7 files × 40 lines) | 0 lines (orchestrator handles all) |
| **Service coupling** | High (direct imports) | Low (registry + DI) |
| **Test coverage** | ~60% (skip worker tests due to boilerplate) | 80%+ (isolated business logic) |
| **Event system duplication** | 6 independent systems | 1 unified event bus |

---

## Risks & Mitigation

### Risk 1: Breaking Changes
**Impact:** Existing code breaks during migration  
**Mitigation:** 
- Incremental migration (Phase 1 → 2 → 3 → 4)
- Keep old APIs working alongside new registry
- Comprehensive test coverage before migration
- Feature flags to toggle new architecture

### Risk 2: Performance Regression
**Impact:** Worker threads add overhead  
**Mitigation:**
- Benchmark before/after (battle resolution latency)
- Only offload CPU-intensive tasks (>50ms)
- Keep I/O-bound tasks in event loop
- Monitor event loop lag in production

### Risk 3: Complexity Increase
**Impact:** New abstractions harder to understand  
**Mitigation:**
- Comprehensive documentation
- Usage examples for each layer
- Gradual rollout (Phase 1 first, stabilize, then Phase 2)
- Code reviews focused on architecture clarity

---

## Next Steps

1. **Review & Approval:** Review this analysis, confirm approach
2. **Phase 1 Implementation:** Start with Service Registry (2-3 days)
3. **Incremental Rollout:** Migrate services one by one
4. **Performance Testing:** Benchmark after each phase
5. **Documentation:** Update docs as we go

**Estimated Total Effort:** 12-17 days  
**Estimated Timeline:** 3-4 weeks (with testing + stabilization)

---

## Related Documentation

- `docs/architecture/architecture.md` — Current high-level architecture
- `docs/workers.md` — Worker scaling roadmap (Phase 10+)
- `docs/OPTIMIZATION-BIBLE.md` — System optimization roadmap
- `src/shared/worker-runtime.ts` — Existing worker helper
- `src/services/error-tracker.ts` — Error system foundation
- `src/services/events/EventTracker.ts` — User event batching
- `src/shared/models/bus-queries-pg.ts` — Message queue implementation
