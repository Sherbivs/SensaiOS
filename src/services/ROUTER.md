# ROUTER
Title: Service Layer Helpers
Purpose: Organized service layer providing cache management, database operations, error monitoring, resource management, alert routing, and AI logging.
Owned Globs: src/services/**
Last Updated (UTC): 2025-12-20T22:00:00Z

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
- **pokemonService.ts** (845 lines) — Pokemon cache service fetching from PokéAPI. Dynamically imported in src/index.ts. Provides in-memory Pokemon lookup (pokemonById, pokemonByName Maps) with weekly cron refresh (Thursday 12 AM UTC). Exports initializePokemonCache(), refreshPokemonCache(), getPokemon(), getAllPokemon(), getCacheMetadata() API. *(Note: pokemonService.d.ts removed 2025-12-20 in Dead Code Cleanup Meeting #5 — orphan declaration file superseded by TypeScript source)*
- **cache.js** (227 lines) — Legacy filesystem cache for security bot (Discord role healing). Used by src/bot/main.js. Stores guild/role metadata in Store/discord-cache/ with 7-day TTL. Provides ensureDir(), readCache(), writeCache(), pruneCache() API.
- **home-bundle-pg.ts** (117 lines) — PostgreSQL query helpers for DM home bundles. Used by src/bot/wilds/walk.ts. Provides findCooldownByUserAndKind(), createCooldown(), updateCooldownReadyAt() API for cooldown management.

**Engine DB Services (Phase 17-22):**
- **engine-cache.ts (661 lines)** — L1 in-memory cache (Map-based) for synchronous Pokemon/Move/Type lookups. **LRU eviction** (500 Pokemon, 200 Moves) with Read-DB fallback for 60% memory reduction (20MB → 8MB). Performance: <1μs cache hit, <5ms cache miss with fallback, >95% hit rate maintained. Loads Gen 1-2 Pokemon (~200ms) + background extended loading (Gen 3-9). Pre-warms Read-DB with 35 hot Pokemon (starters + meta) for 50% faster first queries. Exposes getPokemon(), getMove(), getTypeEffectiveness(), getStats() API with eviction metrics (evictionCount, cacheMissWithFallbackCount, hitRate).
- **engine-write-buffer.ts (476 lines)** — In-memory write queues (3 queues: battles, moves, anomalies) for non-blocking battle outcome logging. Flushes to Write-DB every 30s (atomic splice). Backpressure management (95% reject threshold). Performance: <10μs push latency, 10k entries per queue max. Exposes logBattle(), logMoveUsage(), logAnomaly(), flush(), getStats() API.
- **engine-read-db.ts (470 lines)** — Read-only SQLite database (sql.js) for static Pokemon data. Synced from PROD daily (Worker 3). Schema: pokemon, moves, type_effectiveness, engine_read_version. WAL mode, cache_size optimized. **Individual getters** (getPokemonById, getMoveById) for L1 cache miss fallback. Exposes getAllPokemon(), getAllMoves(), getAllTypeEffectiveness(), getPokemonById(), getMoveById(), getStats() API.
- **engine-write-db.ts (697 lines)** — Append-only SQLite database (sql.js) for battle logs. Schema: battle_logs, move_usage, anomalies, write_ahead_log. WAL with SHA-256 checksums for crash recovery, auto-save every 30s, validation with quality score (95% threshold), 24h retention. Exposes insertBattleLogs(), insertMoveUsage(), insertAnomalies(), validateData(), uploadToProd(), pruneOldEntries(), getStats() API.

**Resource Management Services (Phase Centralization):**
- **resource-request.ts (600 lines)** — Centralized resource request gateway with validation and approval. Architecture: App → ResourceRequestHandler (validation) → ResourceManager (execution). Validates against memory budget (2 GB Standard plan), resource quotas (300 timers, 300 listeners, 100 connections), per-owner limits (40 timers, 60 listeners, 20 connections). Memory thresholds: CRITICAL 1741MB (85%, reject all), WARNING 1536MB (75%, allow critical only), OPTIMAL 1229-1536MB (60-75% target). Performance: <1ms validation, zero overhead on approval. Exposes requestManagedInterval(), requestManagedTimeout(), requestManagedListener(), requestManagedConnection(), getResourceRequestStats(), getResourceBudget(), updateResourceBudget() API. Rejection reasons include: quota exceeded, memory critical, per-owner limit. **Replaces direct createManaged* calls from resource-manager** - all resource allocations now centrally approved.
- **resource-manager.ts (741 lines)** — Resource lifecycle management with automatic tracking and cleanup. Execution layer only (validation delegated to resource-request). Manages timers (interval/timeout), event listeners, database connections with automatic cleanup on owner shutdown. Tracks resource counts by type, by owner, with limits enforcement (maxTimersPerOwner: 40, maxListenersPerOwner: 60, maxConnectionsPerOwner: 20). Exposes registerInterval(), registerTimeout(), registerListener(), registerConnection(), getStats(), cleanupByOwner(), cleanupAll() API. Performance: <1ms registration, automatic cleanup on process exit.
- **resource-monitor.ts (469 lines)** — Lightweight background monitoring running health checks twice daily. Tracks memory/CPU/disk against standardized thresholds aligned with 2 GB Standard plan (upgraded 2025-11-17). Memory zones: EMERGENCY 1843MB (90%), CRITICAL 1741MB (85%), WARNING 1536MB (75%), OPTIMAL 1229-1536MB (60-75%), UNDERUTILIZED <1024MB (50%). Resource count limits: totalResourcesWarning 300, totalResourcesCritical 500. Exposes startMonitor(), stopMonitor(), runHealthCheck(), analyzeStats() API. Enhanced analyzeStats() classifies memory utilization by zone with alert generation.

**Error Detection Services (Phase 1-12 + Event Bus Migration):**
- **error-tracker.ts (717 lines)** — Centralized error capture and tracking service with Event Bus integration (Phase 2.2). SHA-256 fingerprinting for deduplication, automatic severity classification (CRITICAL/HIGH/MEDIUM/LOW), context enrichment (userId, guildId, commandName), occurrence counting with atomic upsert. Stores in PROD PostgreSQL (ErrorLog table) with triple redundancy fallback (console → database → emergency log → Event Bus). **Event Bus Integration:** Emits errors to `error.<severity>` topics (error.critical, error.high, error.medium, error.low) with UUID v4 correlation IDs and parent-child chaining. EventEmitter completely removed (Phase 2.2.3). Performance: <1ms console output, ~50ms database write, <1ms Event Bus emit. Exposes captureError(), getErrorStats(), getRecentErrors(), getErrorByFingerprint(), updateLearningData() API. Guarantees 100% error capture rate with zero false negatives. See tests/error-tracker-bus-integration.test.ts for integration tests (23 tests, 100% passing).
- **error-learning.ts (741 lines)** — Pattern detection and knowledge base learning service. Runs hourly analysis worker detecting time-of-day patterns, error correlations (ErrorA → ErrorB with 85% co-occurrence), cascade detection (root error → downstream failures), impact prediction (estimated users affected, impacted features). Generates mitigation suggestions ranked by historical success rate (exponential-backoff-retry 85% success, reconnect-database 70%). Updates ErrorLog.learningMetadata with frequency patterns, correlation scores, recovery recommendations. Exposes detectTimePatterns(), detectCorrelations(), detectCascades(), predictImpact(), suggestMitigation(), updateKnowledgeBase() API.
- **error-alerting.ts (451 lines)** — Real-time error alerting and escalation service. Sends critical error DMs (rate-limited to 1 per fingerprint per 5min), detects error storms (>10 errors/min, rate-limited to 1 DM per 10min), tracks new errors (first occurrence alerts for HIGH/CRITICAL), generates restart summaries (top 5 critical errors from last 24h with recovery rates). Integrates with Discord client for DM delivery to admin (DripTVDD). Exposes initializeAlerting(), alertOnCritical(), alertOnPattern(), alertOnNewError(), getCriticalErrorsSummary() API. Alert history persisted in ErrorAlert table.
- **error-recovery.ts (634 lines)** — Automated error recovery service implementing 7 strategies: exponential-backoff-retry (network errors, transient failures), rate-limit-queue (Discord 429 errors), increase-timeout (timeout errors, +5s per occurrence), rebuild-cache (cache corruption), restart-worker (worker crashes, max 3 attempts), reconnect-database (connection failures with SELECT 1 test), clear-corrupted-state (state corruption). Tracks recovery attempts in database (recoveryAttempted counter, lastRecoveryStrategy, lastRecoveryOutcome), enforces max retries (default 3), applies exponential backoff (baseDelayMs * 2^attemptNumber, capped at maxDelayMs). Exposes attemptRecovery(), getRecoveryStats(), clearRecoveryState() API.

**Prometheus Metrics Services (Phase 3, P5):**
- **prometheus-metrics.ts (~930 lines)** — Prometheus metrics export service with EventBus integration (Phase 3, Project 5 of Metrics Expansion Bible). **Dual Metric Sets:** Security Bot metrics (security_bot_* prefix: role assignments, cache invalidations, permission violations, time-windowed gauges) + Resource Monitor metrics (ig_* prefix: memory, disk, CPU, uptime gauges, heap pruning counters, disk alert counters). **EventBus Subscriptions:** metrics.snapshot (every 15s updates gauges), alert.disk.* (increments ig_disk_alerts_total{level}), system.prune.heapsnapshot (increments ig_heap_snapshots_pruned_total), system.auto-remediation (increments ig_auto_remediation_total{action,success}). **Gauge Metrics:** ig_memory_rss_bytes, ig_memory_heap_used_bytes, ig_memory_heap_total_bytes, ig_memory_external_bytes, ig_disk_total_bytes, ig_disk_used_bytes, ig_disk_free_bytes, ig_disk_used_percent, ig_cpu_user_percent, ig_cpu_system_percent, ig_uptime_seconds. **Counter Metrics:** ig_heap_snapshots_pruned_total, ig_disk_alerts_total{level}, ig_auto_remediation_total{action,success}. **HTTP Integration:** handleMetricsRequest() function for health-server.ts integration, exposes /metrics endpoint. **API:** initializeMetrics(), shutdownMetrics(), getMetricsText(), getMetricsContentType(), getPrometheusStatus(), handleMetricsRequest(). See docs/projects/metrics-expansion-bible.md § Project 5.
- **statistics-window.js** — Time-windowed statistics calculation for 24-hour metrics. Used by prometheus-metrics.ts for security bot metrics. Exposes calculateWindowStats(), TIME_WINDOWS API.

**Health Check Services:**
- **health-server.ts (280 lines)** — HTTP health check server for external monitoring. Endpoints: /health (200/206/503 based on engine ready state), /metrics (Prometheus metrics via prometheus-metrics.ts handleMetricsRequest). Features: 206 Partial Content during warmup (prevents false alarms), uptime tracking, memory stats, service registry health aggregation. Configuration: HEALTH_CHECK_PORT (default 3000), HEALTH_CHECK_HOST. Exposes startHealthServer(), stopHealthServer() API.

**Alert Routing Services (Phase 1, Project 2):**
- **alert-dispatcher.ts (~600 lines)** — Centralized alert routing hub for system-wide alerts (Phase 1, Project 2 of Metrics Expansion Bible). Subscribes to EventBus patterns (alert.*, system.remediation.*) and routes alerts to appropriate destinations based on severity. **Routing Logic:** INFO → log only, WARNING → Discord channel, CRITICAL → channel + admin DM + persist, EMERGENCY → channel + admin DM + @here + persist. **Features:** Startup grace period (60s, prevents deploy false positives), severity-based cooldowns (1h default), consecutive alert escalation (after 5 alerts), JSON persistence for audit trail (30-day retention), test mode routing. **Configuration:** ALERT_DISPATCHER_ENABLED, ALERT_CHANNEL_ID, ALERT_TEST_CHANNEL_ID, ALERT_ADMIN_USER_ID, ALERT_COOLDOWN_MS, STARTUP_GRACE_PERIOD_MS. **API:** initialize(client), stop(), getStatus(), sendTestAlert(), sendAlert(). **Events:** system.service.started, system.service.stopped, alert.escalation. **Integration:** Boot sequence after Engine DB workers via src/index.ts, graceful shutdown in gracefulShutdown(). See docs/projects/metrics-expansion-bible.md § Project 2.

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
  - operations-bible/03-deployment-procedures.md — Render deployment procedures and resource management
  - operations-bible/05-monitoring.md — Standardized resource monitoring thresholds aligned with 2 GB Standard plan (upgraded 2025-11-17)

---

## ⚠️ ARCHIVED (2025-12-20) — Dead Code Cleanup Meeting #4

The following files were removed as part of the Dead Code Cleanup Initiative:

| File | Lines | Evidence Tier | Reason |
|------|-------|---------------|--------|
| `alert-throttle.ts` | 617 | A | Zero external imports — only self-reference in JSDoc |
| `rls-context.ts` | 328 | A | Zero external imports — Row-Level Security context never integrated |

**Total Removed from src/services/:** 2 files, ~945 lines

**If Restoration Needed:**
```bash
git checkout HEAD~N -- src/services/alert-throttle.ts src/services/rls-context.ts
```
