# ROUTER
Title: Background Workers
Purpose: Long-running background tasks for cache refresh, data sync, validation, and maintenance.
Owned Globs: src/workers/**
Last Updated (UTC): 2025-11-09T00:00:00Z

Notes:
- Workers run as separate processes in production (Render background workers).
- Each worker has isolated error handling to prevent cascading failures.
- Workers use staggered startup delays to avoid thundering herd on boot.
- All workers track performance metrics (run count, error count, last run time).

Key Files:

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
