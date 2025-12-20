# ROUTER
Title: Engine Database Services
Purpose: SQLite database services for Pokémon engine data persistence (read-only reference data + append-only battle logs + historical metrics).
Owned Globs: src/services/database/**
Last Updated (UTC): 2025-12-19T00:00:00Z

Notes:
- `engine-read-db.ts` — Read-only SQLite database for Pokémon reference data (species, moves, type effectiveness). Supports L1 cache hydration with ~50ms query latency. WAL mode, NORMAL synchronous, configurable cache_size.
- `engine-write-db.ts` — Append-only SQLite database for battle logs, move usage analytics, anomaly detection, AND system metrics storage. WAL-based durability, auto-save every 30s, validation before PROD upload, 24h retention for battle data, 7-day retention for metrics.
- `index.ts` — Barrel exports with namespace exports (EngineReadDB, EngineWriteDB) to avoid naming collisions.
- All database paths configured via `src/config/engine-db-config.ts` (environment detection, feature flags, storage paths).
- Integration: L1 cache loads from Read-DB at startup + hourly refresh. Write buffer drains to Write-DB every 30s. Metrics subscribed via EventBus.

Phase 3, P6 (Historical Metrics Storage):
- `system_metrics` table stores metrics.snapshot events (1 sample/minute, ~10,080 rows/week)
- EventBus subscription captures memory, CPU, disk metrics automatically
- 7-day retention policy with automatic pruning during validation worker runs
- Query endpoint via queryMetricsHistory() for /ops metrics-history command
- @see docs/projects/metrics-expansion-bible.md § Project 6

Linked Routers:
- src/services/cache/ROUTER.md — Engine cache (L1) loads data from Read-DB.
- src/config/ROUTER.md — Centralized engine-db-config.ts with paths, limits, feature flags.
- src/workers/ROUTER.md — Background workers for cache refresh, buffer flush, Write-DB validation.
- src/services/monitoring/ROUTER.md — Resource monitor emits metrics.snapshot events consumed by Write-DB.
- src/bot/ops/ROUTER.md — /ops metrics-history command queries historical metrics.

Areas:
- `engine-read-db.ts` (470 lines) — Read-only database: schema (pokemon, moves, type_effectiveness, engine_read_version), API (getAllPokemon, getAllMoves, getAllTypeEffectiveness, getVersion, getStats), SQLite config (WAL mode, NORMAL sync, cache_size).
- `engine-write-db.ts` (~1050 lines, +350 P6) — Write database: schema (battle_logs, move_usage, anomalies, write_ahead_log, system_metrics), API (insertBattleLogs, insertMoveUsage, insertAnomalies, validateData, uploadToProd, pruneOldEntries, pruneOldMetrics, queryMetricsHistory, replayWAL, getStats, isMetricsSubscribed), EventBus subscription (metrics.snapshot), WAL (appendToWAL with SHA-256 checksum, replayWAL with corruption detection), auto-save (every 30s, sql.js in-memory → disk), validation (quality score 95% threshold), retention (24h battle data, 7-day metrics, VACUUM after pruning).
- `index.ts` (28 lines) — Barrel export with namespace exports for both DB services.
- `sql-utils.ts` — Shared SQL utilities (getTableCount, getCount).
