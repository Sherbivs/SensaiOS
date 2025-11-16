# ROUTER
Title: Service Layer Helpers
Purpose: Organized service layer providing cache management, database operations, error monitoring, resource management, and AI logging.
Owned Globs: src/services/**
Last Updated (UTC): 2025-11-16T00:00:00Z

Notes:
- **Phase 5 Consolidation (2025-11-16):** Services organized into 4 domain subdirectories with barrel exports. Deleted duplicate resource-manager.ts and legacy resource-monitor.js from root (now in monitoring/).
- **Subdirectories:** `cache/` (5 files), `database/` (3 files), `monitoring/` (5 files), `ai/` (4 files).
- **Barrel Exports:** Each subdirectory exports via `index.ts` with namespace exports to avoid naming collisions.
- **Import Pattern:** Bot layer uses barrel exports (e.g., `from '../../services/monitoring'`).
- **Legacy Root Files:** 3 active services remain at root level: pokemonService.js (Pokemon cache), cache.js (security bot cache), home-bundle-pg.ts (cooldown queries).

**Service Subdirectories:**
- **cache/** (4 files + ROUTER.md) — Runtime cache facade, engine L1 cache, write buffer, namespace recipes. See `src/services/cache/ROUTER.md`.
- **database/** (2 files + ROUTER.md) — Engine Read-DB (static Pokemon data) + Write-DB (battle logs). See `src/services/database/ROUTER.md`.
- **monitoring/** (3 files + ROUTER.md) — Error tracking, pattern learning, resource monitoring. See `src/services/monitoring/ROUTER.md`.
- **ai/** (3 files + ROUTER.md) — AI logging, analysis, integrations (JavaScript legacy). See `src/services/ai/ROUTER.md`.

**Legacy Root Files:**
- **pokemonService.js / .d.ts** (589 lines) — Pokemon cache service fetching from PokéAPI. Dynamically imported in src/index.ts. Provides in-memory Pokemon lookup (pokemonById, pokemonByName Maps) with weekly cron refresh (Thursday 12 AM UTC). Exports getPokemonList(), getPokemonById(), getPokemonByName(), getCacheMetadata(), refreshCache(), scheduleCronRefresh() API.
- **cache.js** (227 lines) — Legacy filesystem cache for security bot (Discord role healing). Used by src/bot/main.js. Stores guild/role metadata in Store/discord-cache/ with 7-day TTL. Provides ensureDir(), readCache(), writeCache(), pruneCache() API.
- **home-bundle-pg.ts** (117 lines) — PostgreSQL query helpers for DM home bundles. Used by src/bot/wilds/walk.ts. Provides findCooldownByUserAndKind(), createCooldown(), updateCooldownReadyAt() API for cooldown management.

**Engine DB Services (Phase 17-22):**
- **engine-cache.ts (661 lines)** — L1 in-memory cache (Map-based) for synchronous Pokemon/Move/Type lookups. **LRU eviction** (500 Pokemon, 200 Moves) with Read-DB fallback for 60% memory reduction (20MB → 8MB). Performance: <1μs cache hit, <5ms cache miss with fallback, >95% hit rate maintained. Loads Gen 1-2 Pokemon (~200ms) + background extended loading (Gen 3-9). Pre-warms Read-DB with 35 hot Pokemon (starters + meta) for 50% faster first queries. Exposes getPokemon(), getMove(), getTypeEffectiveness(), getStats() API with eviction metrics (evictionCount, cacheMissWithFallbackCount, hitRate).
- **engine-write-buffer.ts (476 lines)** — In-memory write queues (3 queues: battles, moves, anomalies) for non-blocking battle outcome logging. Flushes to Write-DB every 30s (atomic splice). Backpressure management (95% reject threshold). Performance: <10μs push latency, 10k entries per queue max. Exposes logBattle(), logMoveUsage(), logAnomaly(), flush(), getStats() API.
- **engine-read-db.ts (470 lines)** — Read-only SQLite database (sql.js) for static Pokemon data. Synced from PROD daily (Worker 3). Schema: pokemon, moves, type_effectiveness, engine_read_version. WAL mode, cache_size optimized. **Individual getters** (getPokemonById, getMoveById) for L1 cache miss fallback. Exposes getAllPokemon(), getAllMoves(), getAllTypeEffectiveness(), getPokemonById(), getMoveById(), getStats() API.
- **engine-write-db.ts (697 lines)** — Append-only SQLite database (sql.js) for battle logs. Schema: battle_logs, move_usage, anomalies, write_ahead_log. WAL with SHA-256 checksums for crash recovery, auto-save every 30s, validation with quality score (95% threshold), 24h retention. Exposes insertBattleLogs(), insertMoveUsage(), insertAnomalies(), validateData(), uploadToProd(), pruneOldEntries(), getStats() API.

**Resource Management Services (Phase Centralization):**
- **resource-request.ts (600 lines)** — Centralized resource request gateway with validation and approval. Architecture: App → ResourceRequestHandler (validation) → ResourceManager (execution). Validates against memory budget (512 MB Starter plan), resource quotas (150 timers, 150 listeners, 50 connections), per-owner limits (20 timers, 30 listeners, 10 connections). Memory thresholds: CRITICAL 435MB (85%, reject all), WARNING 384MB (75%, allow critical only), OPTIMAL 307-384MB (60-75% target). Performance: <1ms validation, zero overhead on approval. Exposes requestManagedInterval(), requestManagedTimeout(), requestManagedListener(), requestManagedConnection(), getResourceRequestStats(), getResourceBudget(), updateResourceBudget() API. Rejection reasons include: quota exceeded, memory critical, per-owner limit. **Replaces direct createManaged* calls from resource-manager** - all resource allocations now centrally approved.
- **resource-manager.ts (741 lines)** — Resource lifecycle management with automatic tracking and cleanup. Execution layer only (validation delegated to resource-request). Manages timers (interval/timeout), event listeners, database connections with automatic cleanup on owner shutdown. Tracks resource counts by type, by owner, with limits enforcement (maxTimersPerOwner: 20, maxListenersPerOwner: 30, maxConnectionsPerOwner: 10). Exposes registerInterval(), registerTimeout(), registerListener(), registerConnection(), getStats(), cleanupByOwner(), cleanupAll() API. Performance: <1ms registration, automatic cleanup on process exit.
- **resource-monitor.ts (469 lines)** — Lightweight background monitoring running health checks twice daily. Tracks memory/CPU/disk against standardized thresholds aligned with 512 MB Starter plan. Memory zones: EMERGENCY 460MB (90%), CRITICAL 435MB (85%), WARNING 384MB (75%), OPTIMAL 307-384MB (60-75%), UNDERUTILIZED <256MB (50%). Resource count limits: totalResourcesWarning 150, totalResourcesCritical 250. Exposes startMonitor(), stopMonitor(), runHealthCheck(), analyzeStats() API. Enhanced analyzeStats() classifies memory utilization by zone with alert generation.

**Error Detection Services (Phase 1-12 + Event Bus Migration):**
- **error-tracker.ts (717 lines)** — Centralized error capture and tracking service with Event Bus integration (Phase 2.2). SHA-256 fingerprinting for deduplication, automatic severity classification (CRITICAL/HIGH/MEDIUM/LOW), context enrichment (userId, guildId, commandName), occurrence counting with atomic upsert. Stores in PROD PostgreSQL (ErrorLog table) with triple redundancy fallback (console → database → emergency log → Event Bus). **Event Bus Integration:** Emits errors to `error.<severity>` topics (error.critical, error.high, error.medium, error.low) with UUID v4 correlation IDs and parent-child chaining. EventEmitter completely removed (Phase 2.2.3). Performance: <1ms console output, ~50ms database write, <1ms Event Bus emit. Exposes captureError(), getErrorStats(), getRecentErrors(), getErrorByFingerprint(), updateLearningData() API. Guarantees 100% error capture rate with zero false negatives. See tests/error-tracker-bus-integration.test.ts for integration tests (23 tests, 100% passing).
- **error-learning.ts (741 lines)** — Pattern detection and knowledge base learning service. Runs hourly analysis worker detecting time-of-day patterns, error correlations (ErrorA → ErrorB with 85% co-occurrence), cascade detection (root error → downstream failures), impact prediction (estimated users affected, impacted features). Generates mitigation suggestions ranked by historical success rate (exponential-backoff-retry 85% success, reconnect-database 70%). Updates ErrorLog.learningMetadata with frequency patterns, correlation scores, recovery recommendations. Exposes detectTimePatterns(), detectCorrelations(), detectCascades(), predictImpact(), suggestMitigation(), updateKnowledgeBase() API.
- **error-alerting.ts (451 lines)** — Real-time error alerting and escalation service. Sends critical error DMs (rate-limited to 1 per fingerprint per 5min), detects error storms (>10 errors/min, rate-limited to 1 DM per 10min), tracks new errors (first occurrence alerts for HIGH/CRITICAL), generates restart summaries (top 5 critical errors from last 24h with recovery rates). Integrates with Discord client for DM delivery to admin (DripTVDD). Exposes initializeAlerting(), alertOnCritical(), alertOnPattern(), alertOnNewError(), getCriticalErrorsSummary() API. Alert history persisted in ErrorAlert table.
- **error-recovery.ts (634 lines)** — Automated error recovery service implementing 7 strategies: exponential-backoff-retry (network errors, transient failures), rate-limit-queue (Discord 429 errors), increase-timeout (timeout errors, +5s per occurrence), rebuild-cache (cache corruption), restart-worker (worker crashes, max 3 attempts), reconnect-database (connection failures with SELECT 1 test), clear-corrupted-state (state corruption). Tracks recovery attempts in database (recoveryAttempted counter, lastRecoveryStrategy, lastRecoveryOutcome), enforces max retries (default 3), applies exponential backoff (baseDelayMs * 2^attemptNumber, capped at maxDelayMs). Exposes attemptRecovery(), getRecoveryStats(), clearRecoveryState() API.

Linked Routers:
- **Subdirectory Routers:**
  - src/services/cache/ROUTER.md — Cache services (facade, engine cache, write buffer, recipes).
  - src/services/database/ROUTER.md — Engine DB services (Read-DB, Write-DB).
  - src/services/monitoring/ROUTER.md — Error tracking, learning, resource monitoring.
  - src/services/ai/ROUTER.md — AI logging, analysis, integrations.
- **Related Systems:**
  - src/shared/cache/ROUTER.md — Backend implementations leveraged by service caches.
  - Store/ROUTER.md — Persistent cache targets populated via service hydration.
  - src/workers/ROUTER.md — Engine DB background workers (cache refresh, buffer flush, sync, validation).
  - src/config/ROUTER.md — Engine DB configuration (if exists).
  - tests/shared/ROUTER.md — Centralized test mocks (error-tracker-mocks.ts with 8 factory functions).
- **Documentation:**
  - docs/engine-db-replication.md — Comprehensive architecture documentation for Engine DB runtime.
  - docs/error-detection-system.md — Comprehensive error detection system documentation (architecture, taxonomy, integration guide).
  - docs/deployment/RESOURCE-REQUEST-MIGRATION.md — Centralized resource request system migration guide.
  - docs/deployment/RESOURCE-MONITOR-STANDARDS.md — Standardized resource monitoring thresholds aligned with 512 MB Starter plan.
  - docs/deployment/RENDER-RESOURCE-OPTIMIZATION-PLAN.md — Overall resource optimization strategy and 6-phase roadmap.
