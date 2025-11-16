# ARCHITECTURE BIBLE
**Centralized System Architecture Documentation** | **Created: 2025-11-16** | **Status: TEMPLATE (Phase 1 Week 3)**

## Purpose
Single source of truth for Infinity Gauntlet architectural design, component relationships, safety guarantees, and technical decisions. Consolidates 37 source documents into unified reference.

---

## Table of Contents

### 1. System Overview
- High-level architecture snapshot
- Technology stack
- Service topology
- Design principles

### 2. Database Architecture
- **2.1 Overview** — Database system design
- **2.2 Replication** — Master-replica cascade (Phase 16)
- **2.3 URL Selection** — Connection string logic (CRITICAL)
- **2.4 Multi-Client Runtime** — `prisma`, `onPremiseDevPrisma`, `experimentPrisma`

### 3. Worker Architecture
- **3.1 Core Design** — Worker topology, scaling roadmap
- **3.2 State Visibility** — Cross-worker state management

### 4. Event Bus
- Pub-sub event system (Phase 2.4)
- Correlation tracking
- Backpressure management

### 5. Logging Architecture
- **5.1 Core Design** — Intelligent logging system
- **5.2 Buffer Design** — Log buffering strategy
- **5.3 AI Integration** — AI-readable logs
- **5.4 Scaling** — Log scaling techniques

### 6. Error System
- **6.1 Detection Architecture** — Error detection design
- **6.2 Guarantees** — Error detection guarantees
- **6.3 Tracker Integration** — ErrorTracker integration
- **6.4 Logger Integration** — Logger-error bridge
- **6.5 Logging Integration** — Error-logging pipeline

### 7. Security Bot
- **7.1 State Persistence** — 7-day state history, restart continuity
- **7.2 Restart DMs** — Restart notification format

### 8. Router System
- Meta-router design
- Router-of-routers architecture
- Routing discipline

### 9. Game Engine
- **9.1 PBSL Manifesto** — Deterministic battle system
- **9.2 Battle DM Flow** — Battle interaction patterns
- **9.3 Cache Safety** — Engine cache guarantees
- **9.4 DB Replication** — Engine DB architecture (Phases 17-22)
- **9.5 DB Persistence Roadmap** — sql.js → better-sqlite3 migration
- **9.6 Event Tracking** — Event schema design
- **9.7 Dex V2** — Dexpack v2 architecture

### 10. Discord Bot
- **10.1 Command Suite** — Discord command overview
- **10.2 AI DM Commands** — AI DM guidance
- **10.3 Admin Command Spec** — Admin command specification
- **10.4 Admin Docs Index** — Admin documentation navigation

### 11. Safety Guarantees
- Memory safety
- Error isolation
- State persistence
- Disaster recovery

### 12. Observability
- **12.1 Metrics** — Metrics transparency design
- **12.2 Calculation Methods** — Metrics calculation

### 13. Performance
- **13.1 Optimization Roadmap** — System-wide optimization plan
- **13.2 Centralization** — Centralized architecture analysis

### 14. Future Roadmap
- System evolution vision
- Planned improvements
- Research areas

---

## Navigation

### Referenced By
*(To be populated during Phase 1 consolidation)*

### Cross-References
- **OPERATIONS-BIBLE.md** § Database Operations — Operational procedures
- **DEVELOPMENT-BIBLE.md** § Local Setup — Development environment
- **Agents.md** — Operations guide
- **README.md** — Getting started

---

## Section 1: System Overview

*(Content to be consolidated from `architecture/architecture.md` in Phase 1 Week 3)*

**Placeholder**: High-level architecture snapshot, technology stack, service topology, design principles.

---

## Section 2: Database Architecture

### 2.1 Overview

*(Content to be consolidated from `database/database-systems.md` in Phase 1 Week 3)*

**Placeholder**: Database system design, schema architecture, migration strategy.

### 2.2 Replication

*(Content to be consolidated from `database/db-replication-architecture.md` in Phase 1 Week 3)*

**Placeholder**: Master-replica cascade (PROD → DEV → Local), version tracking, sync orchestration.

### 2.3 URL Selection

**See**: OPERATIONS-BIBLE.md § Database Operations → URL Selection (CRITICAL operational procedures)

### 2.4 Multi-Client Runtime

**See**: OPERATIONS-BIBLE.md § Database Operations → Connections (runtime client configuration)

---

## Section 3: Worker Architecture

### 3.1 Core Design

*(Content to be consolidated from `deployment/workers.md` in Phase 1 Week 3)*

**Placeholder**: Worker topology, Render service matrix, Phase 10+ scaling roadmap, cost optimization.

### 3.2 State Visibility

*(Content to be consolidated from `architecture/cross-worker-state-visibility.md` in Phase 1 Week 3)*

**Placeholder**: Cross-worker state management, shared cache, coordination patterns.

---

## Section 4: Event Bus

*(Content to be consolidated from `architecture/phase2-event-bus-design.md` in Phase 1 Week 3)*

**Placeholder**: Pub-sub event system (Phase 2.4), correlation tracking, pattern matching, backpressure management.

---

## Section 5: Logging Architecture

### 5.1 Core Design

*(Content to be consolidated from `architecture/intelligent-logging-system.md` in Phase 1 Week 3)*

**Placeholder**: Intelligent logging system design, log levels, categorization, output formatting.

### 5.2 Buffer Design

*(Content to be consolidated from `architecture/log-buffer.md` in Phase 1 Week 3)*

**Placeholder**: Log buffering strategy, deduplication, aggregation, flush intervals.

### 5.3 AI Integration

*(Content to be consolidated from `architecture/AI-LOG-SYSTEM.md` in Phase 1 Week 3)*

**Placeholder**: AI-readable log format, context preservation, debugging assistance.

### 5.4 Scaling

*(Content to be consolidated from `architecture/AI-LOG-SCALING.md` in Phase 1 Week 3)*

**Placeholder**: Log scaling techniques, memory management, retention policies.

---

## Section 6: Error System

### 6.1 Detection Architecture

*(Content to be consolidated from `error-system/error-detection-system.md` in Phase 1 Week 3)*

**Placeholder**: Error detection system design, classification, routing, telemetry.

### 6.2 Guarantees

*(Content to be consolidated from `error-system/error-detection-guarantees.md` in Phase 1 Week 3)*

**Placeholder**: Error detection guarantees, coverage, response times, recovery procedures.

### 6.3 Tracker Integration

*(Content to be consolidated from `error-system/error-tracker-integration.md` in Phase 1 Week 3)*

**Placeholder**: ErrorTracker integration, error aggregation, reporting.

### 6.4 Logger Integration

*(Content to be consolidated from `error-system/error-monitoring-logger-integration.md` in Phase 1 Week 3)*

**Placeholder**: Logger-error bridge, automatic error capture, context enrichment.

### 6.5 Logging Integration

*(Content to be consolidated from `architecture/error-logging-integration.md` in Phase 1 Week 3)*

**Placeholder**: Error-logging pipeline, structured error logs, correlation.

---

## Section 7: Security Bot

### 7.1 State Persistence

*(Content to be consolidated from `architecture/security-bot-state.md` in Phase 1 Week 3)*

**Placeholder**: 7-day state history, hourly snapshots, restart continuity, cumulative statistics.

### 7.2 Restart DMs

*(Content to be consolidated from `architecture/restart-dm-format.md` in Phase 1 Week 3)*

**Placeholder**: Restart notification format, operational summary, activity timeline.

---

## Section 8: Router System

*(Content to be consolidated from `architecture/meta-router.md` in Phase 1 Week 3)*

**Placeholder**: Meta-router design, router-of-routers architecture, routing discipline, navigation patterns.

---

## Section 9: Game Engine

### 9.1 PBSL Manifesto

**Official Statement**: PBSL = Pokémon Buddy System Logics. Deterministic, auditable framework for Discord battles.

**Core Pillars:**
1. **Determinism & Auditability** — Every damage roll, catch check, status proc reproducible from a logged seed
2. **Truth Hierarchy** — Upstream Pokémon data (PokeAPI/Bulbapedia) → immutable snapshot → runtime decisions
3. **Adaptable Interfaces** — Clean contracts allow swap-out implementations (e.g., different RNG, alternative formulas)
4. **Continuous Validation** — Unit tests + integration tests + oracle fixtures guard against regressions
5. **Provenance First** — Log source references for moves, abilities, formulas before results

**Module Layout:**
- `src/core/pbsl/rng.ts` — Seeded RNG with `next()`, `nextInRange()`, `shuffle()`, audit trail
- `src/core/pbsl/audit.ts` — Structured log recorder for battle events
- `src/core/pbsl/phases.ts` — Turn phases (selection → priority → execution → end-of-turn)
- `src/core/battle/engine.ts` — Battle state machine using PBSL components
- `src/core/encounter/generator.ts` — Wild Pokémon spawning with seeded RNG
- `src/data/provenance.ts` — Upstream source metadata (PokeAPI versions, Bulbapedia timestamps)

**Oracle Fixtures**: `tests/pbsl/oracle.spec.ts` validates deterministic outcomes match upstream expectations. Snapshots include: seed, moves, damage ranges, status effects, catch rates. Any change to formulas requires oracle update + approval.

**Launch Blockers (12 items):**
1. **User management & data storage** — Prisma models for User, TrainerProfile, PokemonInstance, Inventory
2. **Game init trigger** — `/start` command creates TrainerProfile, spawns starter selection
3. **Player options** — Starter selection menu with 3 options + confirmation
4. **Starter selection** — `/choose-starter <name>` creates first PokemonInstance
5. **Catching/obtaining & storage (Pokébox)** — `/catch <ball>` during encounter, stored in Inventory
6. **Battle event triggers (emoji-based 👀)** — React with 👀 to opponent's message triggers battle DM flow
7. **Battle log delivery (DM + arena broadcast)** — DM both trainers with move/switch buttons, broadcast summary to arena
8. **Arena channel safety & moderation** — Security bot monitors role changes, auto-reverts unauthorized edits
9. **Commands & events (Discord)** — Slash commands + button interactions + emoji reactions
10. **Observability & ops** — `/ops` command suite with error dashboard, cache stats, battle metrics
11. **Minimal data schemas (Prisma models)** — User, TrainerProfile, PokemonInstance, Battle, Encounter, Inventory
12. **Acceptance criteria for "launchable"** — All 11 blockers resolved + smoke tests passing + observability green

**Compliance Checklist:**
- ✅ Deterministic RNG (seeded PRNGs with audit trails)
- ✅ Battle phases (selection → priority → execution → end-of-turn)
- ✅ Encounter generator (wild spawns with seeded RNG)
- ✅ Audit trail (structured logs for damage, status, catch checks)
- ✅ Provenance metadata (upstream sources tracked via `data/provenance.ts`)
- ✅ Oracle CI (tests/pbsl/oracle.spec.ts validates deterministic outcomes)
- 🔄 Citations ledger (planned: link every formula to upstream URL)
- 🔄 Adapter integration (planned: swap RNG/formula implementations via DI)

**Governance & Contributions:**
- **Gameplay changes require upstream sources** — No formula changes without Bulbapedia/Smogon citation
- **Automated tests required** — Every new formula needs unit test + oracle fixture
- **Provenance metadata schema** — Track PokeAPI version, Bulbapedia permalink, last-verified timestamp

**Next Steps:**
1. Wire PBSL into legacy flows (replace ad-hoc RNG with seeded `rng.next()`)
2. Extend provenance metadata (add Smogon damage calculator URLs)
3. Document adapter patterns (RNG interface, formula interface)
4. Grow oracle fixture catalog (cover all Gen 1-3 mechanics)

---

### 9.2 Battle DM Flow

Battle DM experience drives every turn through ephemeral component menus so both trainers submit actions without leaving the conversation. Lightweight flow while full arena automation matures.

**Turn Prompts:**
- When battle enters `Active` state, DM both participants "Your Move" embed with **Move**, **Switch**, **Forfeit** buttons
- Selecting **Move** opens follow-up select menu listing active Pokémon's legal moves (PP callouts when available)
- Trainer chooses option, handler immediately queues move in turn manager
- Ephemeral prompt updates to confirm choice, waits for opponent if not yet acted
- Choosing **Switch** works same way: select menu lists only healthy, non-active party members
- Picking target queues swap with battle engine API, updates cached battle state, confirms pending switch

**Turn Resolution:**
- Both move and switch submissions land in turn queue managed by `src/core/battle/turn-manager.ts`
- Once each trainer has pending action, queue resolves turn, swaps active combatants when required
- Immediately sends next "Your Move" DM to both players
- Ensures ongoing battles keep moving without manual pinging in arena thread
- Failures to deliver DMs are best-effort and logged for observability work
- Handler will not block turn resolution if Discord API rejects delivery

---

### 9.3 Cache Safety

**As of 2025-11-09**, Engine Cache (L1 cache layer) implements comprehensive safety mechanisms to prevent corruption and protect against game crashes.

**Critical Safety Features:**

**1. Read-Only Data Protection**

**Private Fields**: All cache storage Maps are `private` and cannot be accessed directly:
```typescript
private pokemon: Map<number, PokemonCacheEntry> = new Map();
private moves: Map<number, MoveCacheEntry> = new Map();
private typeChart: Map<string, number> = new Map();
```

**Defensive Copies**: All getter methods return defensive copies to prevent external mutations:
```typescript
getPokemon(id: number): PokemonCacheEntry | null {
  const result = this.pokemon.get(id);
  if (result) {
    return { ...result, baseStats: { ...result.baseStats } };
  }
  return null;
}
```

**Controlled Writes**: Only two methods can modify cache data:
1. `initialize()` — Startup initialization (blocking, one-time)
2. `refresh()` — Background refresh (atomic swap via double-buffering)

Both methods are `private` and called only by EngineCache class itself.

**2. Corruption Detection**

**Data Checksum**: Simple hash calculated after every data modification (fingerprint: P:1328:1,2,3...|M:900:33,85...|T:324:1:2,1:3...). Fast hash, not cryptographic, just corruption detection.

**Integrity Verification**: Comprehensive checks run periodically:
```typescript
verifyIntegrity(): boolean {
  // Check 1: Maps not empty if initialized
  // Check 2: Secondary indexes match primary maps
  // Check 3: Data structure sanity (IDs match keys)
}
```

**Automatic Detection**: Integrity checks run before/after every background refresh (hourly) + on-demand via `verifyIntegrity()`.

**3. Corruption Response**

**Refuse Reads**: If corruption detected, all getters return safe defaults:
```typescript
getPokemon(id: number): PokemonCacheEntry | null {
  if (this.corruptionDetected) {
    log('error', 'Cache corruption detected, refusing read');
    return null; // Safe: Battle engine handles null gracefully
  }
  // ... normal read
}
```

**Block Refresh**: Corrupted cache won't be refreshed (prevents cascading corruption). Manual intervention required.

**Observability**: Corruption status exposed via `/ops engine` command (isHealthy, corruptionDetected, dataChecksum).

**4. Atomic Updates (Double-Buffering)**

**Non-Blocking Refresh**: Background refresh builds new cache without affecting ongoing battles:
```typescript
async refresh(): Promise<void> {
  // Step 1: Build new Maps (doesn't touch current cache)
  const newPokemon = new Map();
  const newMoves = new Map();
  // ... load data into new Maps ...
  
  // Step 2: Atomic swap (battles see old OR new, never partial)
  this.pokemon = newPokemon;
  this.moves = newMoves;
  // Old Maps garbage collected automatically
}
```

**Race Condition Protection**: Refresh flag prevents concurrent refreshes (`isRefreshing` boolean guard).

**What This Prevents:**

✅ **Prevented Scenarios:**
1. External Mutation — Battle engine receives defensive copies, modifications don't affect cache
2. Concurrent Writes — Only refresh() can write, protected by `isRefreshing` flag
3. Partial Updates — Atomic swap ensures battles never see half-updated cache
4. Cascading Corruption — Corrupted cache won't be refreshed, preventing propagation
5. Silent Failures — Corruption detection logs errors and returns safe defaults

⚠️ **Attack Vectors Still Possible (But Mitigated):**
1. Memory Pressure — OS could kill process if cache grows too large (Mitigation: Memory usage tracked, 20MB target enforced)
2. Malicious Code — Another module with access to `engineCache` object (Mitigation: Private fields, no public setters, defensive copies; TypeScript/JavaScript cannot prevent prototype pollution from determined attacker)
3. Logic Bugs — Bug in refresh() could load invalid data (Mitigation: Integrity checks detect structural issues, checksum detects unexpected changes)

**Emergency Recovery:**
- Automatic: Cache refuses reads, returns safe defaults (null/neutral)
- Manual: Restart application to re-initialize cache from Read-DB
- Debug: Check logs for corruption detection messages with context

**Performance Impact:**
- Defensive Copies: ~2-5μs overhead per read (still <10μs target)
- Corruption Checks: ~50-100μs every hour (negligible)
- Checksum Update: ~10-20μs after refresh (one-time)
- **Net Impact**: <1% performance overhead for significant safety improvement

**Contract (Absolute)**: Engine Cache data MUST NOT be modified by any code outside `engine-cache.ts`. Violations will cause game crashes and unpredictable battle outcomes.

**Enforcement**: TypeScript private fields + defensive copies + corruption detection + periodic integrity checks.

---

### 9.4 DB Replication

**As of 2025-11-09**, Engine DB implements production-ready 3-tier caching with write buffering, background workers, and comprehensive monitoring. Phase 17-22 delivered 4,416 lines with 0 build errors and 10-100x performance improvements.

**Architecture**: PROD → L1 Cache (Map) → Read-DB (SQLite) → Game Engine → Write Buffer → Write-DB (SQLite) → Validator → PROD

**Purpose**: Provide ultra-fast local lookups (<1μs L1, ~50ms SQLite vs 50-100ms PostgreSQL), enable offline gameplay, validate data quality before PROD upload, capture battle outcomes for analysis.

**Runtime Principle**: Game engine operates on fast in-memory cache (L1). Read-DB/Write-DB synchronization happens asynchronously in background workers. Battles never block on disk I/O or replication.

**Completed Implementation (4,416 lines):**

**1. Engine Cache (L1 In-Memory)** — `src/services/engine-cache.ts` (661 lines)
- API: `getPokemon(id)`, `getPokemonByName(name)`, `getMove(id)`, `getTypeEffectiveness(attack, defense)`, `getStats()`
- Data structures: `pokemon` Map (by ID), `pokemonByName` Map (secondary index), `moves` Map, `typeChart` Map
- Performance: <1μs read latency, 20 MB memory, 10M+ ops/sec throughput
- Refresh: Hourly background refresh with double-buffering (atomic swap)
- Integration: `src/data/dexpack.js` uses cache-first lookup pattern
- Safety: Defensive copies, corruption detection, automatic integrity checks

**2. Write Buffer (In-Memory Queues)** — `src/services/engine-write-buffer.ts` (476 lines)
- API: `logBattle(entry)`, `logMoveUsage(entry)`, `logAnomaly(entry)`, `flush()`, `getStats()`
- Data structures: `battleLogQueue[]`, `moveUsageQueue[]`, `anomalyQueue[]` (arrays)
- Performance: <10μs push latency, 10k entries per queue max
- Backpressure: 75% warn, 95% reject, <50% deactivate
- Flush: Every 30s (atomic splice), calls Write-DB insert methods
- Integration: `src/commands/battle-turn.js` logs move usage + battle completion

**3. Background Workers (4 Workers)** — `src/workers/engine-workers.ts` (655 lines)
- Worker 1: CacheRefreshWorker (hourly, +5s stagger) — Calls `engineCache['refresh']()`
- Worker 2: BufferFlushWorker (30s, +10s stagger) — Calls `engineWriteBuffer.flush()`
- Worker 3: ReadDbSyncWorker (daily, Render cron) — Placeholder with `recordExecution()` API
- Worker 4: WriteDbValidatorWorker (10min, +15s stagger) — `validateData()` → `uploadToProd()` → `pruneOldEntries()`
- Orchestration: `startEngineWorkers()`, `stopEngineWorkers()`, `getEngineWorkersStatus()`
- Error isolation: Each worker has try-catch, failures don't cascade

**4. Read-DB (SQLite)** — `src/services/engine-read-db.ts` (470 lines)
- Schema: `pokemon`, `moves`, `type_effectiveness`, `engine_read_version` (4 tables, 7 indexes)
- API: `getAllPokemon()`, `getAllMoves()`, `getAllTypeEffectiveness()`, `getVersion()`, `getStats()`
- SQLite config: WAL mode, NORMAL synchronous, cache_size from config, busy_timeout 5000ms
- Integration: L1 cache loads from this at startup and hourly refresh

**5. Write-DB (SQLite with WAL)** — `src/services/engine-write-db.ts` (697 lines)
- Schema: `battle_logs`, `move_usage`, `anomalies`, `write_ahead_log` (4 tables, 7 indexes)
- API: `insertBattleLogs()`, `insertMoveUsage()`, `insertAnomalies()`, `validateData()`, `uploadToProd()`, `pruneOldEntries()`, `replayWAL()`, `getStats()`
- WAL: `appendToWAL()` with SHA-256 checksum, `replayWAL()` with corruption detection
- Auto-save: Every 30s (sql.js in-memory → disk)
- Validation: Quality score calculation (passedRows / validatedRows), 95% threshold
- Retention: 24h after upload, VACUUM after pruning

**6. Centralized Config** — `src/config/engine-db-config.ts` (558 lines)
- Environment detection: `IS_PRODUCTION`, `IS_TEST`
- Storage paths: `/Store/` (prod), `Store/` (local), `Store/test/` (test)
- Memory limits: 20 MB L1 cache, 10k queue size
- Feature flags: `L1_CACHE_ENABLED`, `WRITE_BUFFER_ENABLED`, `WORKERS_ENABLED`, `VALIDATION_ENABLED`
- Validation: `validateEngineDbConfig()` function ensures safe runtime

**Integration Points (310 lines):**

**Startup/Shutdown Lifecycle** — `src/index.ts` (+140 lines)
- Initialization (7 steps): validateConfig → Read-DB init → L1 cache load (blocking) → Write-DB init → WAL replay → workers start → `global.engineReady = true`
- Shutdown (6 steps): mark not ready → stop workers → flush buffer (emergency) → save Write-DB → close Read-DB → cleanup cache
- Telemetry: `updateEngineSection()` shows cache hit rate, buffer utilization, database stats, worker errors

**Cache Integration** — `src/data/dexpack.js` (+80 lines)
- `getSpecies()` tries `engineCache` first (by ID → by name → fallback to dexpack)
- Performance: <1μs cache hits, 0.1-1ms dexpack fallback
- Metrics: Cache hits/misses recorded in dex metrics system

**Buffer Integration** — `src/commands/battle-turn.js` (+70 lines)
- After `resolveTurn()`, logs move usage (both sides) + battle completion (on KO)
- Performance: <10μs per log call, zero impact on battle execution
- Graceful degradation: Backpressure errors caught, battles continue normally

**Operations & Monitoring**: `/ops engine` command displays L1 Cache (hit rate, memory, entries, latency), Write Buffer (utilization, queues, backpressure), Workers (4 workers with status), Read-DB (counts, size), Write-DB (counts, WAL size, oldest entry).

**Performance Metrics:**
- L1 Cache: <1μs read latency (10-100x faster than SQLite)
- Write Buffer: <10μs push latency (non-blocking battle flow)
- Read-DB: ~50ms query latency (cached in L1 after first access)
- Write-DB: WAL ensures durability with <5ms append overhead
- **Overall: 10-100x performance improvement over remote PostgreSQL queries**

**Quality Metrics:**
- Build Status: ✅ 0 errors, 0 warnings throughout implementation
- Integration: ✅ All 5 integration points operational
- Documentation: ✅ Comprehensive ROUTER.md updates (services, workers, config)
- Testing: ⏳ Unit tests planned (Task 9) — cache, buffer, workers, read-db, write-db

**Implementation Status:**
- ✅ Phase 17 (COMPLETE): Engine Read-DB foundation, PROD → Read sync
- ✅ Phase 18 (COMPLETE): Engine Write-DB foundation, logging operations
- ✅ Phase 19 (COMPLETE): Integrity scanner with validation rules
- ✅ Phase 20 (COMPLETE): Write-DB → PROD sync with PROD schema migration placeholder
- ✅ Phase 21 (COMPLETE): Battle engine integration (cache → dexpack, buffer → battle-turn)
- ✅ Phase 22 (COMPLETE): Monitoring, automation, `/ops engine` command

**Next Steps:**
- Task 9 (READY): Unit tests for all 6 services + integration points (80%+ coverage target)
- Phase 23+ (READY): PROD schema migration for battle logs, upload automation, retention policies

---

### 9.5 DB Persistence Roadmap

**Status**: Analysis — Opportunities to migrate from sql.js (in-memory) to better-sqlite3 (native SQLite) for 78% memory reduction and disk-backed operations.

**Current State**: Hybrid In-Memory + Disk Architecture
- Read-DB (`/Store/engine-read.db`) — Static Pokemon data, loaded at startup, saved after PROD sync
- Write-DB (`/Store/engine-write.db`) — Battle logs, auto-saved every 30s
- WAL (`/Store/engine-write.wal`) — Crash recovery log
- **Problem**: sql.js operates entirely in-memory, requiring 20 MB L1 cache + Write-DB in-memory (up to 15 MB) + manual `db.export()` + `fs.writeFile()` every 30s (slow, blocking)

**Opportunity**: Migrate to better-sqlite3 for:
- ✅ True disk-backed operations (no manual persistence)
- ✅ 70% memory reduction (20 MB → 6 MB L1 cache via lazy loading)
- ✅ Crash-safe writes (WAL mode built-in, no manual recovery)
- ✅ Faster queries (native C++ vs JavaScript)
- ✅ Additional databases without memory penalty

**Migration Plan: sql.js → better-sqlite3**

**Phase 1**: Install better-sqlite3 (`npm install better-sqlite3`)

**Phase 2**: Create adapter layer (dual support for both backends)

**Phase 3**: Migrate Read-DB (low risk, read-only, large memory savings 10 MB → 0 MB)

**Phase 4**: Migrate Write-DB (medium risk, writes critical, auto-save logic changes, WAL replay changes)

**Phase 5**: Implement LRU Cache (low risk, depends on better-sqlite3 disk fallback, requires performance tuning)

**Expected Outcomes:**

**Memory Savings:**
- Read-DB: 10 MB (in-memory) → 0 MB (disk-backed) — **100% reduction**
- Write-DB: 20 MB (in-memory) → 5 MB (active pages) — **75% reduction**
- L1 Cache: 20 MB (all Pokemon) → 6 MB (LRU 500) — **70% reduction**
- **Total: 50 MB → 11 MB (78% reduction)**

**Performance Improvements:**
- Startup (cold): 1000ms → 50ms — **20x faster**
- Startup (warm): 1000ms → 5ms — **200x faster**
- Single query: 0.5ms → 0.05ms — **10x faster**
- Bulk insert: 500ms → 50ms — **10x faster**
- Auto-save: 100ms (blocking) → 0ms (async) — **∞x faster**

**Additional Databases (Zero Memory Cost):**
1. Trainer Analytics DB — Leaderboards, stats, achievements (0 MB memory)
2. Move Effectiveness Cache DB — Pre-computed damage multipliers (0 MB memory)
3. Battle Replay DB — Full turn-by-turn states for debugging (0 MB memory)
4. Rate Limiting DB — Persistent rate limits across restarts (0 MB memory)

**Risks & Mitigation:**
1. better-sqlite3 requires native compilation (Render supports via build hooks)
2. Queries may be slower (disk I/O) — Mitigated by OS page cache + LRU cache + memory-mapped I/O
3. WAL mode requires disk space — Mitigated by auto-checkpoint every 1000 pages + monitoring
4. Migration complexity — Mitigated by phased rollout + feature flags + rollback plan

**Recommendation**: Proceed with migration as Week 8-11 optimization initiative following console log cleanup and profile creation optimization.

---

### 9.6 Event Tracking

**Created**: 2025-11-06 — Complete event tracking schema for Infinity Gauntlet. Every user interaction, system event, and gameplay action is tracked through `UserEvent` table with typed JSON payloads.

**Event Categories:**

| Category | Description | Example Types | Retention |
| --- | --- | --- | --- |
| **gameplay** | Core game actions | battle.won, pokemon.caught, evolution.triggered | Indefinite |
| **engagement** | User engagement metrics | login, daily_quest.completed, achievement.unlocked | 90 days |
| **economy** | Virtual currency transactions | coins.earned, coins.spent, item.purchased | 1 year |
| **social** | Social interactions | friend.added, profile.updated, message.sent | 90 days |
| **system** | System events & errors | error.occurred, performance.slow_query | 30 days (info), 1 year (error/critical) |
| **admin** | Administrative actions | user.banned, content.moderated | Indefinite |

**Event Severity Levels:**

| Severity | Use Case | Retention | Examples |
| --- | --- | --- | --- |
| **info** | Normal operations | 30 days | login, pokemon.caught |
| **warning** | Noteworthy but not errors | 90 days | rate_limit.approached, cache.miss |
| **error** | Recoverable errors | 1 year | battle.timeout, api.error |
| **critical** | System failures | Indefinite | database.connection_lost, payment.failed |

**Key Event Schemas:**

**Gameplay Events:**
- `battle.started` — battleId, opponentId, ruleset, arenaThreadId
- `battle.won/lost` — battleId, opponentId, turns, duration_ms, pokemon_fainted, experience_gained, coins_earned
- `pokemon.caught` — pokemonId, speciesId, speciesName, level, isShiny, encounterId, catchMethod, attempts
- `pokemon.evolved` — pokemonId, fromSpeciesId, toSpeciesId, level, trigger
- `encounter.spawned` — encounterId, speciesId, speciesName, level, isShiny, spawnLocation, expiresAt

**Privacy & PII Handling:**
- IP addresses always hashed before storage (SHA-256 with daily rotating salt)
- Never store email in events, use userId only
- Data retention by category and severity (30 days to indefinite)

**Event Batching Strategy:**
- Max batch size: 100 events
- Max batch delay: 5000ms
- Critical events bypass batching (immediate flush)
- In-memory buffer before batch insert

**Query Patterns:**
- User Activity Timeline (last 7 days gameplay)
- Achievement Progress Tracking
- Error Rate Monitoring (last 24 hours)
- Top Active Users (event count, sessions, first/last activity)

---

### 9.7 Dex V2

**DEX v2** — High-Availability, Fast Pokédex Model and Day-One Database Blueprint combining high-performance Pokédex model with pragmatic day-one database plan.

**North-Star Principles:**
- **Immutable facts, mutable links** — Core reference data (Pokédex, moves, type chart) is read-only and versioned
- **Tenant-first keys** — Every gameplay row includes `tenant_id` (Discord guild/app id)
- **Time-sortable IDs** — Prefer ULIDs for chronology
- **Short, observable write paths** — Append-only where possible
- **Migrations are code** — Every schema change reversible, reviewed, tested

**Goals:**
- Instant lookups (no blocking I/O or ad-hoc parsing on hot path)
- Deterministic packs: content-addressed, signed, verified at boot
- Side-by-side rollout using feature flags; zero-downtime cutover with fast rollback
- Operational simplicity: single artifact with explicit invariants

**Architecture Overview (DEX v2):**

**Build Time:**
1. Aggregate sources → normalize → validate invariants
2. Generate binary slab `dexpack.v2.<SHA256>.bin` plus minimal perfect hash (MPH) map for name/alias → id resolution
3. Emit TypeScript accessors (codegen) with fixed offsets and integer tables (types, learnset bitsets)
4. Produce manifest `dexpack.v2.json` (hash, upstream SHAs, schema version)
5. Sign artifact using Ed25519

**Runtime:**
- Map read-only binary slab and expose typed-array views
- Verify hash and signature; on failure, refuse v2 and auto-fallback to v1
- Command handlers route through feature flag `DEX_V2_ENABLED` (supports per-guild canaries)

**Data Layout (Binary Slab, Structure-Of-Arrays):**
```
Header { magic "DEX2", schemaVersion u16, gen u8, sections: offsets & lengths }
Sections:
- species.soA: baseStats[u16][N][6], types[u8][N][2], abilities[u16][N][3], catchRate[u8][N]
- learnsets.bitset: bitset[N][ceil(M/8)] where M = total moves
- moves.tuples: [power u16, accuracy u8, type u8, priority i8, flags u16] x M
- types.table: 19x19 u8 multipliers encoded {0,5,10,20}
- names.aliases: utf8Blob + offsets[u32] + ids[u16]
- mph: arrays required for minimal perfect hash lookup
- text.offsets: flavorUtf8Blob + start/end[u32] per species
```

**Generated Accessor API:**
```typescript
export function idByNameOrAlias(q: string): number | -1;     // MPH → id
export function baseHP(id: number): number;                   // u16
export function typesOf(id: number): [number, number];        // u8, u8
export function hasMove(id: number, moveId: number): boolean; // bit test
export function moveInfo(moveId: number): MoveTuple;
export function typeMultiplier(attacking: number, defending: number): number; // 0|5|10|20
export function flavorText(id: number): string;               // slice from blob
export const META: { schema: 2; gen: number; hash: string };
```

**Performance SLO**: p50 ≤ 50 µs, p95 ≤ 200 µs, p99 ≤ 500 µs on c5.large-class nodes.

**Security**: Ed25519 signature verified at boot; public key in repo, private key in CI secrets. Loader refuses unsigned or mismatched packs.

**Migration Path:**
1. Land v2 alongside v1
2. Compatibility layer keeps old accessor signatures, dispatches to v2 under flag
3. Enable 100% in DEV; run regression plus perf verification
4. Canary in PROD; ramp in stages if green
5. Remove v1 code in later, separate PR

**High-Availability Rollout Plan:**
- DEV enable: Tue, Nov 4, 2025, 11:00–11:30 ET
- PROD canary and ramp: Wed, Nov 5, 2025, 02:00–03:00 ET
- Reserved maintenance: Thu, Nov 6, 2025, 02:00–02:15 ET
- Backups: Pre-cutover `pg_dump -Fc` for DEV/PROD; retain 14 days
- Rollback: ≤ 10 minutes (flip `DEX_V2_ENABLED=false`, redeploy LKG image if necessary)

**Day-One Database Blueprint (v0.1):**
- Tables: tenants, users, trainers, dex_packs, trainer_settings, mons, parties, encounters, battles, items, inventories, audit_log
- Indexes: tenant_id, trainer_id, started_at DESC, at DESC
- Versioning: Repository `schema_ver` integer; every migration bumps it
- Seeds: Golden tenant/trainer/party dataset for smoke tests
- Backups: Nightly PITR to object storage; monthly restore rehearsal (RPO 15 min, RTO 30 min)
- Constraints: FKs, CHECKs, UNIQUEs keep bad states unrepresentable
- Roles: `app_rw`, `migrate`, `ro` with least privilege
- Retention: Audit rows hot for 30 days, then archive
- Observability: DB op metrics, latency histograms, error rates by constraint, spans tagged with `tenant_id`, `pack_hash`, `schema_ver`

---

## Section 10: Discord Bot

### 10.1 Command Suite

*(Content to be consolidated from `DISCORD-COMMAND-SUITE.md` in Phase 1 Week 3)*

**Placeholder**: Discord command suite overview, command categories, usage patterns.

### 10.2 AI DM Commands

*(Content to be consolidated from `specs/AI DM COMMAND SUITE GUIDANCE.md` in Phase 1 Week 3)*

**Placeholder**: AI DM command guidance, automation patterns, error handling.

### 10.3 Admin Command Spec

*(Content to be consolidated from `specs/DM-ADMIN-COMMAND-SUITE-SPEC.md` in Phase 1 Week 3)*

**Placeholder**: Admin command specification, access control, validation.

### 10.4 Admin Docs Index

*(Content to be consolidated from `specs/DM-ADMIN-DOCS-INDEX.md` in Phase 1 Week 3)*

**Placeholder**: Admin documentation navigation, quick reference, troubleshooting.

---

## Section 11: Safety Guarantees

*(Content to be consolidated from `architecture/safety.md` in Phase 1 Week 3)*

**Placeholder**: Memory safety, error isolation, state persistence, disaster recovery, operational safeguards.

---

## Section 12: Observability

### 12.1 Metrics

*(Content to be consolidated from `architecture/metrics-transparency.md` in Phase 1 Week 3)*

**Placeholder**: Metrics transparency design, visibility principles, telemetry architecture.

### 12.2 Calculation Methods

*(Content to be consolidated from `metrics-calculation.md` in Phase 1 Week 3)*

**Placeholder**: Metrics calculation methods, formulas, aggregation strategies.

---

## Section 13: Performance

### 13.1 Optimization Roadmap

*(Content to be consolidated from `architecture/OPTIMIZATION-BIBLE.md` in Phase 1 Week 3)*

**Placeholder**: System-wide optimization plan, startup time, console logging, runtime weight, queries, cache.

### 13.2 Centralization

*(Content to be consolidated from `architecture/centralized-architecture-analysis.md` in Phase 1 Week 3)*

**Placeholder**: Centralized architecture analysis, code duplication elimination, shared utilities.

---

## Section 14: Future Roadmap

*(Content to be consolidated from `architecture/perfect-system-roadmap.md` in Phase 1 Week 3)*

**Placeholder**: System evolution vision, planned improvements, research areas, scalability targets.

---

**Estimated Size**: ~3000 lines (after Phase 1 consolidation)  
**Source Files**: 37 documents consolidated  
**Last Updated**: 2025-11-16 (template created)  
**Status**: Template ready for Phase 1 Week 3 consolidation
