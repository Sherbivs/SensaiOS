# ROUTER
Title: Service Layer Helpers
Purpose: Legacy abstractions that supply data to command handlers and DM flows.
Owned Globs: src/services/**
Last Updated (UTC): 2025-11-09T00:00:00Z

Notes:
- These modules bridge cached data and presentation layers pending full TypeScript rewrites.
- Keep TypeScript declaration files aligned with their CommonJS counterparts.
- `cache/facade.ts` now tracks hit/miss counters, disk usage, maintenance schedule state, and exposes an immediate cleanup trigger consumed by `/ops cache` and tests; see src/services/cache/ROUTER.md for namespace recipes.
- **Engine DB Runtime (Phase 17-22)** — Bidirectional replication architecture separating read operations (static Pokemon data) from write operations (gameplay outcomes) with integrity validation before mirroring back to PROD. Performance: <1μs cache reads, <10μs buffer writes, 10-100x faster than remote PostgreSQL.

Key Files:
- pokemonService.js / .d.ts - Provides Pokemon lookup helpers for commands and DM flows.
- cache.js - Wraps cache hydration logic for downstream consumers.
- home-bundle.ts - Bundles DM home data for React renderers.

**Engine DB Services (Phase 17-22):**
- **engine-cache.ts (661 lines)** — L1 in-memory cache (Map-based) for synchronous Pokemon/Move/Type lookups. Loads from Read-DB at startup, refreshes hourly (non-blocking double-buffering). Performance: <1μs read latency, 20 MB memory limit, 10M+ ops/sec throughput. Exposes getPokemon(), getMove(), getTypeEffectiveness(), getStats() API.
- **engine-write-buffer.ts (476 lines)** — In-memory write queues (3 queues: battles, moves, anomalies) for non-blocking battle outcome logging. Flushes to Write-DB every 30s (atomic splice). Backpressure management (95% reject threshold). Performance: <10μs push latency, 10k entries per queue max. Exposes logBattle(), logMoveUsage(), logAnomaly(), flush(), getStats() API.
- **engine-read-db.ts (470 lines)** — Read-only SQLite database (sql.js) for static Pokemon data. Synced from PROD daily (Worker 3). Schema: pokemon, moves, type_effectiveness, engine_read_version. WAL mode, cache_size optimized. Exposes getAllPokemon(), getAllMoves(), getAllTypeEffectiveness(), getStats() API.
- **engine-write-db.ts (697 lines)** — Append-only SQLite database (sql.js) for battle logs. Schema: battle_logs, move_usage, anomalies, write_ahead_log. WAL with SHA-256 checksums for crash recovery, auto-save every 30s, validation with quality score (95% threshold), 24h retention. Exposes insertBattleLogs(), insertMoveUsage(), insertAnomalies(), validateData(), uploadToProd(), pruneOldEntries(), getStats() API.

Linked Routers:
- src/services/cache/ROUTER.md — Namespace recipes and instrumentation backing these helpers.
- src/shared/cache/ROUTER.md — Backend implementations leveraged by service caches.
- Store/ROUTER.md — Persistent cache targets populated via service hydration.
- src/workers/ROUTER.md — Engine DB background workers (cache refresh, buffer flush, sync, validation).
- src/config/ROUTER.md — Engine DB configuration (if exists).
- docs/engine-db-replication.md — Comprehensive architecture documentation for Engine DB runtime.
