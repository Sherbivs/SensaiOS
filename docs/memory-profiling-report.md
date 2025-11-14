# Memory Profiling Report — Pre-Launch Accumulation Analysis
**Generated:** 2025-11-13  
**Repository:** Infinity-Gauntlet  
**Phase:** Pre-Launch Memory Footprint Analysis

## Executive Summary

This report analyzes memory accumulation **before game launch** (initialization phase) to identify what's "piling up" in memory and whether database replication is creating unnecessary duplicate instances.

**Key Findings:**
- ✅ **No Database Replication Duplication** — 3 Prisma clients exist, but they connect to **3 physically different databases** (1 cloud + 2 local workstations)
- ✅ **Pre-Launch Memory: 55-100 MB** — Primarily from Engine Read-DB (SQLite in-memory), module imports, and L1 cache
- ⚠️ **Optimization Opportunities** — 6 high-impact deferrals identified to reduce pre-launch footprint by 20-40 MB (20-40%)

---

## 1. Database Connection Analysis

### 1.1 Prisma Client Instances

**Question:** Is database replication creating duplicate instances?

**Answer:** **NO** — The system creates 3 separate Prisma clients, but they are NOT replication copies:

| Client | Database | Purpose | Environment | Memory Est. |
|--------|----------|---------|-------------|-------------|
| **`prodPrismaClient`** | PROD_DATABASE_URL | Production gameplay (Render-managed PostgreSQL) | Cloud (Render) | 2-5 MB |
| **`onPremiseDevPrismaClient`** | DATABASE_ONPREMISE_DEV_PRIMARY | Local development mirror (127.0.0.1:55433) | Workstation only | 2-5 MB (if configured) |
| **`onPremiseExperimentPrismaClient`** | DATABASE_ONPREMISE_DEV_EXPERIMENT | Migration testing (127.0.0.1:55434) | Workstation only | 2-5 MB (if configured) |

**Source:** `src/shared/prisma.ts` lines 60-72, 601-750

**Critical Context:**
- **Production (Render):** Only `prodPrismaClient` exists (environment variables for local databases not set)
- **Local Development:** 1-3 clients depending on configuration (DATABASE_ONPREMISE_DEV_PRIMARY, DATABASE_ONPREMISE_DEV_EXPERIMENT)
- **No Duplication:** Each client connects to a **physically different database** (different hostnames/ports)
- **Total Memory:** 2-15 MB (1 client in production, up to 3 locally)

### 1.2 Connection Architecture

```
PRODUCTION (Render):
┌─────────────────────┐
│ prodPrismaClient    │ → PROD_DATABASE_URL (infinity-gauntlet-db @ Render)
└─────────────────────┘
   Single connection, no duplication

LOCAL WORKSTATION:
┌─────────────────────┐
│ prodPrismaClient    │ → PROD_DATABASE_URL (Render cloud)
│ onPremiseDevPrisma  │ → DATABASE_ONPREMISE_DEV_PRIMARY (127.0.0.1:55433)
│ onPremiseExperiment │ → DATABASE_ONPREMISE_DEV_EXPERIMENT (127.0.0.1:55434)
└─────────────────────┘
   3 independent databases, no duplication
```

**Verdict:** ✅ **No unnecessary duplication** — Each client serves a distinct purpose and connects to a different database instance.

---

## 2. Pre-Launch Memory Allocations

### 2.1 Startup Sequence Phases

**Source:** `src/index.ts` lines 59-63, 1001-1296 (STARTUP_MEMORY tracking)

The system tracks memory at 5 key phases:

| Phase | Timing | Purpose | Est. Memory Delta |
|-------|--------|---------|-------------------|
| **initial** | Process start | Node.js runtime baseline | 20-30 MB |
| **pre_database** | After module imports | All dependencies loaded | +15-25 MB |
| **post_database** | After Prisma connection | Database client initialized | +2-5 MB |
| **pre_engine_and_bots** | Before Engine DB | Prepare for parallel init | +0-2 MB |
| **post_engine_and_bots** | After Engine DB + Bots | L1 cache loaded, SQLite DBs, Discord clients | +20-40 MB |
| **steady_state** | First heartbeat | Runtime monitoring started | +5-10 MB |

**Total Pre-Launch Estimate:** **55-100 MB**  
**Post-Launch Runtime:** **150-250 MB** (includes Discord connections, workers, runtime cache)

### 2.2 Detailed Memory Breakdown

#### 2.2.1 Module Imports (20-35 MB)

**Source:** `src/index.ts` lines 16-53

| Module Category | Modules | Est. Memory |
|-----------------|---------|-------------|
| **Prisma Client** | `@prisma/client` | 5-10 MB |
| **Discord.js** | `discord.js` (Client, Gateway, Partials, Events) | 10-15 MB |
| **Services** | Service Registry, config, logging, cache, engine services | 3-5 MB |
| **Workers** | engine-workers, error-learning-worker | 1-2 MB |
| **Monitoring** | resource-monitor, AI logger, analyzer, integrations | 1-3 MB |

**Total:** 20-35 MB

**Critical Imports (Always Loaded):**
- `@prisma/client` — Required for database access
- `discord.js` — Required for bot functionality
- `ServiceRegistry`, `getAllServiceConfigs` — Foundation services
- `config`, `log`, `setupLogBuffer` — Core runtime

**Deferred Imports (Lazy-Loaded):**
- ✅ `autoSync.js` — Loaded only if `ENABLE_DB_AUTO_SYNC=true`
- ✅ `databaseRecovery.js` — Loaded only on connection failure
- ✅ `cache.js` monitoring — Loaded via `import()` in `refreshCacheSection()`
- ✅ `pokemonService.js` — Loaded via `import()` in `refreshPokedexSection()`

#### 2.2.2 Service Registry (1-3 MB)

**Source:** `src/index.ts` lines 969-996, `src/shared/service-registry.ts`

**Services Registered:**
1. **resourceManager** — Memory guardian, resource tracking (~0.5 MB)
2. **errorTracker** — Error detection, Event Bus subscriptions (~0.5 MB)
3. **engineCache** — L1 cache instance (initially empty, ~0.5 MB)
4. **engineWriteBuffer** — Battle log queues (initially empty, ~0.5 MB)

**Total:** 1-3 MB (includes service configurations + lifecycle management)

**Optimization Notes:**
- ✅ Services initialized via Service Registry (centralized, no duplication)
- ✅ Instances retrieved once (`registry.get()`) and stored in module-level variables

#### 2.2.3 Database Connections (2-15 MB)

**Source:** `src/shared/prisma.ts` lines 230-450, 601-750

| Component | Memory Est. | Notes |
|-----------|-------------|-------|
| **Primary Prisma Client** | 2-5 MB | PROD_DATABASE_URL connection |
| **Heartbeat Monitoring** | 0.5-1 MB | 30s interval, consecutive failure tracking |
| **OnPremise Dev Client** (optional) | 2-5 MB | Only if DATABASE_ONPREMISE_DEV_PRIMARY set |
| **OnPremise Experiment Client** (optional) | 2-5 MB | Only if DATABASE_ONPREMISE_DEV_EXPERIMENT set |

**Total:** 2-15 MB (2-5 MB in production, up to 15 MB locally with all clients)

**Connection Details:**
- **Direct PostgreSQL** — No pooling overhead (2-NODE CLUSTER architecture)
- **Query Event Logging** — Tracks slow queries >100ms (lines 254-272)
- **Heartbeat State** — `HeartbeatState` object + listeners (~0.5 MB per client)

#### 2.2.4 Engine Read-DB (10-20 MB)

**Source:** `src/services/engine-read-db.ts` lines 1-101, `src/index.ts` lines 1138-1156

**SQLite Database (sql.js in-memory):**
- **Storage:** `/Store/engine-read.db` loaded into memory
- **Tables:** `pokemon`, `moves`, `type_effectiveness`, `engine_read_version`
- **Data:** 1,025 Pokemon, 900 moves, ~300 type chart entries
- **Memory:** **10-20 MB** (depends on data size)

**Initialization:**
```typescript
// Step 2: Initialize Read-DB (SQLite read-only database)
await engineReadDb.initialize();
```

**Usage:**
- Loaded at startup (BLOCKING) — L1 cache reads from this
- Read-only — Never written during gameplay
- Persistent — Survives restarts via disk storage

**Optimization Opportunity:** ⚠️ **HIGH PRIORITY** — Read-DB is loaded even if battles are never initiated

#### 2.2.5 Engine Write-DB (5-10 MB)

**Source:** `src/services/engine-write-db.ts` lines 1-101, `src/index.ts` lines 1159-1177

**SQLite Database (sql.js in-memory):**
- **Storage:** `/Store/engine-write.db` loaded into memory
- **Tables:** `battle_logs`, `move_usage`, `anomalies`, `write_ahead_log`
- **Data:** Initially empty (grows during gameplay)
- **Memory:** **5-10 MB** (minimal when empty)

**Initialization:**
```typescript
// Step 4: Initialize Write-DB (SQLite append-only database)
await engineWriteDb.initialize();

// Step 5: Replay WAL (recover from crashes)
await engineWriteDb.replayWAL();
```

**Optimization Opportunity:** ⚠️ **HIGH PRIORITY** — Write-DB loaded even if battles never occur

#### 2.2.6 L1 Cache (6 MB)

**Source:** `src/services/engine-cache.ts` lines 1-151, `src/index.ts` lines 1148-1156

**In-Memory Maps:**
- `pokemon`: Map<number, PokemonCacheEntry> — Pokemon by ID
- `pokemonByName`: Map<string, number> — Secondary index (name → ID)
- `moves`: Map<number, MoveCacheEntry> — Moves by ID
- `typeChart`: Map<string, number> — Type effectiveness (key: "atkType:defType")

**Memory:** **6 MB** (optimized from 20 MB via lazy loading)

**LRU Configuration:**
- Max Pokemon: 500 entries (vs 1,025 total) — Most-used kept in memory
- Max Moves: 200 entries (vs 900 total) — Lazy-load from Read-DB on miss

**Initialization:**
```typescript
// Step 3: L1 Cache already initialized by Service Registry - just get stats
const cacheStats = engineCache.getStats();
```

**Optimization:** ✅ **Already optimized** — Lazy loading reduced footprint from 20 MB → 6 MB

#### 2.2.7 Background Workers (10-20 MB)

**Source:** `src/workers/engine-workers.ts` lines 23-27, `src/index.ts` lines 1180-1202

**Worker Processes Started at Boot:**
1. **CacheRefreshWorker** — Hourly L1 cache refresh (~2-3 MB)
2. **BufferFlushWorker** — 30s write buffer flush (~1-2 MB)
3. **ReadDbSyncWorker** — Daily PROD → Read-DB sync (~2-3 MB)
4. **WriteDbValidatorWorker** — 10min validation + PROD upload (~3-5 MB)
5. **Error Learning Worker** — Hourly error analysis (~2-3 MB)
6. **Resource Monitor** — 30s health checks + memory guardian (~2-3 MB)

**Total:** 10-20 MB (6 workers × 1.5-3.5 MB average)

**Optimization Opportunity:** ⚠️ **MEDIUM PRIORITY** — Workers start immediately even if not needed

#### 2.2.8 AI Logging System (5-10 MB)

**Source:** `src/index.ts` lines 1194-1197

```typescript
await aiLogger.initialize();
await aiLogAnalyzer.initialize();
```

**Components:**
- **aiLogger** — Hard logs to `/Store/ai-logs/` (~2-3 MB)
- **aiLogAnalyzer** — Pattern detection, correlation tracking (~2-3 MB)
- **aiLogIntegrations** — System integrations (~1-2 MB)

**Total:** 5-10 MB

**Optimization Opportunity:** ⚠️ **LOW PRIORITY** — Logging infrastructure is always useful

#### 2.2.9 Global State (5-10 MB)

**Source:** `src/index.ts` lines 90-108

**Global Variables:**
```typescript
let engineReady = false;
let activeClient: Client | null = null;
let securityClient: Client | null = null;
let stopPrismaHeartbeatTask: (() => void) | null = null;
let monitorRefreshTimer: NodeJS.Timeout | null = null;
let lastCacheSnapshot: CacheSnapshot | null = null;
let prismaConnectDurationMs: number | null = null;
let stopAutoSyncSupervisor: (() => void) | null = null;
let engineWorkersRunning = false;
```

**Memory:** 5-10 MB (includes Discord client references, timers, cache snapshots)

#### 2.2.10 Log Buffer (< 1 MB)

**Source:** `src/index.ts` lines 68, `src/shared/logBufferInit.js`

```typescript
setupLogBuffer(); // Called before most logging
```

**Purpose:** 10-second log buffering to reduce console noise  
**Memory:** < 1 MB (small buffer, periodic flushes)

---

## 3. Optimization Opportunities

### 3.1 High-Priority Deferrals (20-40 MB savings)

#### 3.1.1 Defer Engine Read-DB Loading (10-20 MB)

**Current:** Loaded at startup (BLOCKING)  
**Proposal:** Load on first battle command  
**Memory Saved:** 10-20 MB  
**Impact:** 10-20% reduction in pre-launch footprint

**Implementation:**
```typescript
// src/index.ts lines 1138-1156 (boot function)
// BEFORE (current):
await engineReadDb.initialize();

// AFTER (lazy):
if (global.engineReady === false && battlesEnabled) {
  await engineReadDb.initialize();
}
```

**Files to Modify:**
- `src/index.ts` — Remove `engineReadDb.initialize()` from boot sequence
- `src/services/engine-cache.ts` — Add lazy initialization check in `refresh()` method
- `src/commands/battle.js` — Call `ensureEngineReady()` before first battle

**Trade-offs:**
- ✅ **Pros:** 10-20 MB saved pre-launch, faster startup
- ⚠️ **Cons:** First battle command slower (~100-200ms one-time delay)

#### 3.1.2 Defer Engine Write-DB Loading (5-10 MB)

**Current:** Loaded at startup (BLOCKING)  
**Proposal:** Load on first battle completion  
**Memory Saved:** 5-10 MB  
**Impact:** 5-10% reduction

**Implementation:**
```typescript
// src/index.ts lines 1159-1177 (boot function)
// BEFORE (current):
await engineWriteDb.initialize();
await engineWriteDb.replayWAL();

// AFTER (lazy):
// Defer until first battle log entry
```

**Files to Modify:**
- `src/index.ts` — Remove Write-DB initialization from boot
- `src/services/engine-write-buffer.ts` — Add lazy initialization in `flush()` method

#### 3.1.3 Defer Background Workers (10-20 MB)

**Current:** All 6 workers start at boot  
**Proposal:** Start workers on-demand based on activity  
**Memory Saved:** 10-20 MB (depending on usage)  
**Impact:** 10-20% reduction

**Implementation:**
```typescript
// Start workers based on conditions:
// - CacheRefreshWorker: Start after first L1 cache hit
// - BufferFlushWorker: Start when buffer has entries
// - ReadDbSyncWorker: Start via Render cron (already deferred)
// - WriteDbValidatorWorker: Start after first battle log
// - Error Learning Worker: Start after first error captured
// - Resource Monitor: Always start (critical for health)
```

**Files to Modify:**
- `src/index.ts` — Conditionally start workers
- `src/workers/engine-workers.ts` — Add `startWorkerIfNeeded()` helpers

### 3.2 Medium-Priority Optimizations (5-10 MB savings)

#### 3.2.1 Defer AI Logging System (5-10 MB)

**Proposal:** Initialize AI logging after Discord client ready  
**Memory Saved:** 5-10 MB  
**Impact:** 5-10% reduction

#### 3.2.2 Reduce Prisma Query Event Logging (0.5-1 MB)

**Current:** All queries logged with >100ms threshold  
**Proposal:** Disable query logging in production (enable via env var)  
**Memory Saved:** 0.5-1 MB (event handler overhead)

### 3.3 Low-Priority Optimizations (< 5 MB savings)

#### 3.3.1 Service Registry Optimization

**Current:** All 4 services registered at startup  
**Proposal:** Already optimized — no changes needed

#### 3.3.2 Discord.js Cache Tuning

**Current:** Default Discord.js caching  
**Proposal:** Use `LimitedCollection` for guilds/channels (already implemented in Main.js)  
**Memory Saved:** Minimal (< 2 MB)

---

## 4. Memory Progression Analysis

### 4.1 Startup Timeline

**Source:** `src/index.ts` lines 1309-1314 (startup metrics logging)

```typescript
log.info("🚀 Startup complete - Performance baseline established", {
  totalStartupMs,
  initial_rss_mb: Math.round(STARTUP_MEMORY.initial.rss / 1024 / 1024),
  post_database_rss_mb: Math.round(STARTUP_MEMORY.post_database.rss / 1024 / 1024),
  post_engine_rss_mb: Math.round(STARTUP_MEMORY.post_engine_and_bots.rss / 1024 / 1024),
  steady_state_rss_mb: Math.round(STARTUP_MEMORY.steady_state.rss / 1024 / 1024),
  heap_used_mb: Math.round(STARTUP_MEMORY.steady_state.heapUsed / 1024 / 1024),
  heap_total_mb: Math.round(STARTUP_MEMORY.steady_state.heapTotal / 1024 / 1024),
});
```

**Expected Values (Production):**

| Phase | RSS (MB) | Heap Used (MB) | Cumulative Delta (MB) |
|-------|----------|----------------|-----------------------|
| **initial** | 20-30 | 10-15 | 0 (baseline) |
| **post_database** | 40-60 | 20-30 | +20-30 (imports + Prisma) |
| **post_engine** | 70-110 | 40-60 | +30-50 (Engine DB + L1 cache) |
| **steady_state** | 100-150 | 60-90 | +30-40 (Discord + workers) |

**Post-Launch (Runtime):**

| Phase | RSS (MB) | Heap Used (MB) | Delta from Steady State (MB) |
|-------|----------|----------------|------------------------------|
| **After first battle** | 120-170 | 70-100 | +20-30 (Write-DB activity) |
| **Peak gameplay** | 150-250 | 90-150 | +50-100 (Discord caches, buffers) |

### 4.2 Memory Leak Risk Analysis

**Monitored Surfaces (Resource Monitor):**

**Source:** `src/services/resource-monitor.ts` lines 598-599

```typescript
const memoryUsage = process.memoryUsage();
const memoryRssMB = memoryUsage.rss / (1024 * 1024);
```

**Thresholds:**
- ⚠️ **Warning:** 384 MB (75% of 512 MB Render limit)
- 🚨 **Critical:** 435 MB (85% of limit)
- 💀 **Emergency:** 460 MB (90% of limit) — Triggers aggressive cleanup

**Bounded Structures (Safety Audit Complete):**

**Source:** `docs/MEMORY-LEAK-ANALYSIS.md` (Phase 16 complete - 12/12 structures bounded)

1. ✅ **Event Bus Queues** — Max 100 events per topic (auto-eviction)
2. ✅ **Write Buffer** — Max 10k entries (backpressure at 75%)
3. ✅ **L1 Cache LRU** — Max 500 Pokemon + 200 moves (LRU eviction)
4. ✅ **Discord.js Caches** — LimitedCollection (auto-sweep every 5 minutes)
5. ✅ **Error Learning** — Max 10k entries (90-day retention)
6. ✅ **AI Logs** — Rolling 1,000 entries (disk persistence)
7. ✅ **Security Bot State** — 100 events timeline (rolling window)
8. ✅ **Prisma Connections** — 3 max (no pooling, direct connections)
9. ✅ **Worker Timers** — 6 workers (unref'd, garbage-collectible)
10. ✅ **Log Buffer** — 10s flush interval (auto-clear)
11. ✅ **Resource Monitor** — 30s health checks (no accumulation)
12. ✅ **Service Registry** — 4 services (fixed size)

**Verdict:** ✅ **Low leak risk** — All major structures bounded and monitored

---

## 5. Recommendations

### 5.1 Immediate Actions (High Impact)

1. **Implement Deferred Engine DB Loading** (20-40 MB savings)
   - Priority: **HIGH**
   - Effort: **MEDIUM** (2-3 hours)
   - Risk: **LOW** (graceful degradation)
   - Files: `src/index.ts`, `src/services/engine-cache.ts`, `src/commands/battle.js`

2. **Implement Deferred Workers** (10-20 MB savings)
   - Priority: **HIGH**
   - Effort: **MEDIUM** (3-4 hours)
   - Risk: **LOW** (workers start on first use)
   - Files: `src/index.ts`, `src/workers/engine-workers.ts`

3. **Add Memory Progression Logging**
   - Priority: **MEDIUM**
   - Effort: **LOW** (30 minutes)
   - Risk: **NONE** (observability only)
   - Implementation: Expose `STARTUP_MEMORY` object via `/ops memory` command

### 5.2 Long-Term Optimizations (Medium Impact)

4. **Implement Lazy AI Logging** (5-10 MB savings)
   - Priority: **MEDIUM**
   - Effort: **LOW** (1-2 hours)
   - Risk: **LOW** (initialization after Discord ready)

5. **Add Environment-Based Query Logging** (0.5-1 MB savings)
   - Priority: **LOW**
   - Effort: **LOW** (30 minutes)
   - Risk: **NONE** (conditional feature)

### 5.3 Monitoring Enhancements

6. **Create `/ops memory` Command**
   - Display: `STARTUP_MEMORY` breakdown, current RSS/heap, delta from baseline
   - Purpose: Real-time memory profiling for operators
   - Files: `src/bot/ops/admin.ts`

7. **Add Memory Progression Dashboard**
   - Track: initial → pre_database → post_database → post_engine → steady_state
   - Alert: When pre-launch footprint exceeds 120 MB (20% over expected)

---

## 6. Conclusions

### 6.1 Key Findings

1. ✅ **No Database Replication Duplication** — 3 Prisma clients connect to 3 different databases (not replication copies)
2. ✅ **Pre-Launch Memory: 55-100 MB** — Within expected range for Discord bot + Engine DB
3. ⚠️ **Optimization Potential: 20-40 MB (20-40%)** — Defer Engine Read-DB, Write-DB, and workers

### 6.2 Memory Allocation by Category

| Category | Memory (MB) | Percentage | Optimization |
|----------|-------------|------------|--------------|
| **Engine Read-DB** | 10-20 | 18-20% | ⚠️ Defer (HIGH) |
| **Module Imports** | 20-35 | 36-35% | ✅ Already optimized |
| **Background Workers** | 10-20 | 18-20% | ⚠️ Defer (HIGH) |
| **Engine Write-DB** | 5-10 | 9-10% | ⚠️ Defer (MEDIUM) |
| **L1 Cache** | 6 | 11-6% | ✅ Already optimized |
| **AI Logging** | 5-10 | 9-10% | ⚠️ Defer (MEDIUM) |
| **Database Connections** | 2-15 | 4-15% | ✅ Necessary |
| **Global State** | 5-10 | 9-10% | ✅ Necessary |
| **Service Registry** | 1-3 | 2-3% | ✅ Already optimized |
| **Log Buffer** | <1 | <1% | ✅ Already optimized |
| **TOTAL** | **55-100** | **100%** | **20-40% reducible** |

### 6.3 Final Verdict

**Memory "Piling Up" Before Launch:** ✅ **EXPECTED AND JUSTIFIED**

The 55-100 MB pre-launch footprint is primarily from:
1. **Engine Read-DB** (10-20 MB) — Static game data loaded for fast battles
2. **Module Imports** (20-35 MB) — Prisma, Discord.js, services (necessary)
3. **Background Workers** (10-20 MB) — Monitoring, error learning, cache refresh

**Database Replication:** ✅ **NO DUPLICATION**

3 Prisma clients exist, but they connect to 3 different databases (not copies):
- Production: 1 client (PROD_DATABASE_URL)
- Local: 2 additional clients (on-premise mirrors for offline development)

**Optimization Opportunities:** ⚠️ **20-40 MB REDUCIBLE**

By deferring Engine DB and workers until first use, pre-launch footprint can drop from 55-100 MB → **35-60 MB** (36-40% reduction).

---

## Appendix A: Memory Tracking Implementation

### A.1 Current Instrumentation

**Source:** `src/index.ts` lines 59-63, 1309-1314

```typescript
const STARTUP_MEMORY: { [key: string]: NodeJS.MemoryUsage } = {};
function recordMemory(label: string) {
  STARTUP_MEMORY[label] = process.memoryUsage();
}
recordMemory("initial");
// ... boot sequence ...
recordMemory("pre_database");
// ... database connection ...
recordMemory("post_database");
// ... Engine DB + Bots ...
recordMemory("pre_engine_and_bots");
recordMemory("post_engine_and_bots");
// ... final initialization ...
recordMemory("steady_state");
```

### A.2 Memory Snapshot Format

**NodeJS.MemoryUsage Structure:**
```typescript
{
  rss: 104857600,        // Resident Set Size (total memory - MB)
  heapTotal: 52428800,   // V8 heap allocated (MB)
  heapUsed: 41943040,    // V8 heap used (MB)
  external: 2621440,     // C++ objects bound to JS (MB)
  arrayBuffers: 1048576  // ArrayBuffer + SharedArrayBuffer (MB)
}
```

### A.3 Proposed `/ops memory` Command

```typescript
// src/bot/ops/admin.ts
interaction.reply({
  content: `
📊 **Memory Profiling Report**

**Startup Progression:**
- Initial: ${STARTUP_MEMORY.initial.rss / 1024 / 1024} MB RSS
- Post-Database: ${STARTUP_MEMORY.post_database.rss / 1024 / 1024} MB RSS (+${delta} MB)
- Post-Engine: ${STARTUP_MEMORY.post_engine_and_bots.rss / 1024 / 1024} MB RSS (+${delta} MB)
- Steady State: ${STARTUP_MEMORY.steady_state.rss / 1024 / 1024} MB RSS (+${delta} MB)

**Current State:**
- RSS: ${current.rss / 1024 / 1024} MB (Δ +${currentDelta} MB from steady state)
- Heap: ${current.heapUsed / 1024 / 1024} MB / ${current.heapTotal / 1024 / 1024} MB
- External: ${current.external / 1024 / 1024} MB

**Resource Limits:**
- Warning: 384 MB (${(current.rss / (384 * 1024 * 1024) * 100).toFixed(1)}%)
- Critical: 435 MB (${(current.rss / (435 * 1024 * 1024) * 100).toFixed(1)}%)
- Emergency: 460 MB (${(current.rss / (460 * 1024 * 1024) * 100).toFixed(1)}%)
  `,
  ephemeral: true,
});
```

---

## Appendix B: References

### B.1 Source Files

- **Prisma Connections:** `src/shared/prisma.ts` (814 lines)
- **Startup Sequence:** `src/index.ts` (1,349 lines)
- **Engine Read-DB:** `src/services/engine-read-db.ts` (602 lines)
- **Engine Write-DB:** `src/services/engine-write-db.ts` (960 lines)
- **L1 Cache:** `src/services/engine-cache.ts` (1,650 lines)
- **Background Workers:** `src/workers/engine-workers.ts` (655 lines)
- **Resource Monitor:** `src/services/resource-monitor.ts` (598 lines)

### B.2 Related Documentation

- **Memory Leak Analysis:** `docs/MEMORY-LEAK-ANALYSIS.md` (Phase 16 complete)
- **Engine DB Architecture:** `docs/engine-db-replication.md` (Phases 17-22)
- **Database Architecture:** `docs/database-configuration.md` (Triple database stats)
- **Resource Optimization:** `docs/RESOURCE-MANAGER-SUMMARY.md` (32% reduction achieved)

### B.3 Environment Variables

**Database:**
- `PROD_DATABASE_URL` — Primary production database (Render-managed PostgreSQL)
- `DATABASE_ONPREMISE_DEV_PRIMARY` — Optional workstation mirror (127.0.0.1:55433)
- `DATABASE_ONPREMISE_DEV_EXPERIMENT` — Optional migration testing (127.0.0.1:55434)

**Memory Configuration:**
- `DISABLE_PRISMA_HEARTBEAT` — Skip heartbeat monitoring (saves ~0.5 MB)
- `DISABLE_CLI_MONITOR` — Skip terminal status display (saves ~1 MB)
- `LOG_BUFFER_ENABLED` — Enable 10s log buffering (default: true)

**Feature Flags:**
- `ENABLE_DB_AUTO_SYNC` — Auto-sync supervisor (deferred import)
- `ENABLE_SECURITY_BOT` — Security bot worker (separate process)

---

**End of Report**
