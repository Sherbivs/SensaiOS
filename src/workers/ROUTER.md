# ROUTER
Title: Background Workers
Purpose: Long-running background tasks for cache refresh, data sync, validation, disk maintenance, and alerting.
Owned Globs: src/workers/**
Last Updated (UTC): 2025-12-19T00:00:00Z

**Recent Updates:**
- ✅ **Heap Snapshot Pruner (2025-12-19):** Phase 1, Project 1 of Metrics Expansion Bible
  - Automated cleanup of startup heap snapshots
  - Keeps MAX_COUNT (default: 3) most recent, deletes older than MAX_AGE_DAYS (default: 7)
  - Runs on 24-hour interval + startup prune
  - Emits EventBus events for observability
  - See: docs/projects/metrics-expansion-bible.md § Project 1
- ✅ Eliminated 4 duplicate `delay()` functions from engine-workers.ts (2025-11-16)
- ✅ Now imports shared `delay()` from `src/shared/utils/async-utils.ts`
- ✅ Impact: -20 lines of duplicate code, improved maintainability
- ✅ Pattern: All workers use shared async utilities instead of private helpers

Notes:
- Workers run as separate processes in production (Render background workers).
- Each worker has isolated error handling to prevent cascading failures.
- Workers use staggered startup delays to avoid thundering herd on boot.
- All workers track performance metrics (run count, error count, last run time).

Key Files:

**Heap Snapshot Pruner (Phase 1, Project 1):**
- **heap-pruner.ts (~400 lines)** — Automated disk space management for heap snapshots:
  
  **Purpose:**
  - Heap snapshots created via v8.writeHeapSnapshot() on startup (~27 MB each)
  - Pattern: `startup-heap-{ISO-timestamp}.heapsnapshot`
  - Without pruning: 7 snapshots = 190 MB (22% of 974 MB /Store disk)
  - With pruning: 3 snapshots = ~80 MB (8% of disk), saves ~110 MB
  
  **Configuration:**
  - `HEAP_SNAPSHOT_ENABLED` — Master switch (default: true)
  - `HEAP_SNAPSHOT_MAX_COUNT` — Keep N most recent (default: 3)
  - `HEAP_SNAPSHOT_MAX_AGE_DAYS` — Delete older than N days (default: 7)
  - `HEAP_SNAPSHOT_PRUNE_INTERVAL_MS` — Interval (default: 24 hours)
  - `HEAP_SNAPSHOT_RUN_ON_STARTUP` — Run immediately on boot (default: true)
  
  **Safety:**
  - ONLY targets files matching `startup-heap-*.heapsnapshot`
  - Other files (state.json, cache, etc.) are never touched
  - Error handling with EventBus failure events
  
  **API:**
  - startHeapPruner() — Start worker with staggered delay
  - stopHeapPruner() — Stop worker gracefully
  - getHeapPrunerStatus() — Status for observability
  - pruneHeapSnapshots() — Core prune logic
  - forcePrune() — Manual trigger for /ops commands
  
  **Events:**
  - `system.prune.heapsnapshot` — Emitted after each prune (success/failure)
  - `system.worker.started` — On startup
  - `system.worker.stopped` — On shutdown
  
  **Integration:**
  - Boot: src/index.ts calls startHeapPruner() after Engine DB workers
  - Shutdown: src/index.ts calls stopHeapPruner() in gracefulShutdown()

**Engine DB Workers (Phase 17-22):**
- **engine-workers.ts (655 lines)** — Orchestrates 4 background workers for Engine DB runtime:
  
  **Worker 1: CacheRefreshWorker**
  - Purpose: Refreshes L1 cache from Read-DB hourly (non-blocking)
  - Frequency: Hourly (configurable via EngineDbConfig.l1CacheRefreshIntervalMs)
  - Stagger: +5s delay on startup
  - Non-blocking: Uses double-buffering, battles unaffected during refresh
  - Integration: Calls engineCache['refresh']() private method
  
  **Worker 2: BufferFlushWorker**
  - Purpose: Flushes Write Buffer to Write-DB every 30s
  - Frequency: 30s (configurable via EngineDbConfig.writeBufferFlushIntervalMs)
  - Stagger: +10s delay on startup
  - Atomic: Uses splice to extract entries, ongoing battles can still push
  - Integration: Calls engineWriteBuffer.flush() method
  
  **Worker 3: ReadDbSyncWorker**
  - Purpose: Syncs Read-DB from PROD daily (Render cron job)
  - Frequency: Daily (handled by Render cron, not this worker)
  - Stagger: N/A (external cron)
  - Status: Placeholder for recordExecution() API
  - Integration: Future integration with Render cron job
  
  **Worker 4: WriteDbValidatorWorker**
  - Purpose: Validates Write-DB data quality and uploads to PROD
  - Frequency: 10min (configurable via EngineDbConfig.validationIntervalMs)
  - Stagger: +15s delay on startup
  - Quality threshold: 95% (configurable via EngineDbConfig.validationMinQualityScore)
  - Flow: validateData() → uploadToProd() (if quality >= 95%) → pruneOldEntries()
  - Integration: Calls engineWriteDb methods
  
  **Orchestration API:**
  - startEngineWorkers() — Start all 4 workers with staggered delays
  - stopEngineWorkers() — Stop all 4 workers gracefully
  - getEngineWorkersStatus() — Get status for all 4 workers (last run time, success/error counts)
  
  **Error Isolation:**
  - Each worker has try-catch block
  - Worker failure doesn't crash other workers
  - Errors logged with worker name + context
  
  **Feature Flags:**
  - FEATURE_WORKERS_ENABLED — Master switch for all workers
  - Individual worker control via config intervals (0 = disabled)

Linked Routers:
- src/services/ROUTER.md — Engine DB services (cache, buffer, read-db, write-db).
- src/config/ROUTER.md — Engine DB configuration (if exists).
- docs/engine-db-replication.md — Comprehensive architecture documentation.
