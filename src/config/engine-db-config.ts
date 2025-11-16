/**
 * Engine DB Configuration — Centralized settings for all Engine DB operations
 * 
 * Single source of truth for:
 * - File paths (environment-aware)
 * - Memory limits (cache + buffer sizing)
 * - Performance thresholds (flush intervals, timeouts)
 * - Validation settings (quality thresholds, sampling rates)
 * 
 * Referenced By: src/services/engine-cache.ts, src/services/engine-write-buffer.ts, 
 *                src/workers/engine-workers.ts, docs/engine-db-replication.md
 * 
 * @module config/engine-db-config
 */

import path from 'node:path';
import { getErrorMessage } from '../shared/utils/error-utils.js';

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Determine if running in Render production environment
 */
export const IS_PRODUCTION = Boolean(process.env.RENDER);

/**
 * Determine if running in test environment (Vitest)
 */
export const IS_TEST = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

/**
 * Base storage directory for Engine DB files
 * - Production (Render): /Store (persistent disk mount)
 * - Local dev: ./Store (relative to project root)
 * - Test: ./Store/test (isolated namespace)
 */
export const STORAGE_BASE_DIR = IS_PRODUCTION
  ? '/Store'
  : IS_TEST
    ? path.join(process.cwd(), 'Store', 'test')
    : path.join(process.cwd(), 'Store');

// ============================================================================
// File Paths (Read-DB, Write-DB, WAL)
// ============================================================================

/**
 * Engine Read-DB path (SQLite, static Pokemon data)
 * Synced from PROD daily via Worker 3
 */
export const ENGINE_READ_DB_PATH = path.join(STORAGE_BASE_DIR, 'engine-read.db');

/**
 * Engine Write-DB path (SQLite, gameplay logs)
 * Flushed from Write Buffer every 30s via Worker 2
 */
export const ENGINE_WRITE_DB_PATH = path.join(STORAGE_BASE_DIR, 'engine-write.db');

/**
 * Write-Ahead Log path (crash recovery)
 * Replayed on startup if process crashed
 */
export const ENGINE_WAL_PATH = path.join(STORAGE_BASE_DIR, 'engine-write.wal');

/**
 * Read-DB version file (tracks last PROD sync)
 */
export const ENGINE_READ_VERSION_PATH = path.join(STORAGE_BASE_DIR, 'engine-read.version.json');

// ============================================================================
// L1 Cache Configuration (In-Memory Map)
// ============================================================================

/**
 * Maximum L1 cache size (in-memory Pokemon + Move + Type data)
 * 
 * OPTIMIZATION (Phase 2B Alternative): Reduced from 20 MB → 6 MB via LRU enforcement.
 * 
 * Previous (load-all approach):
 *   1,328 Pokemon * 10 KB avg = 13.3 MB
 *   900 Moves * 2 KB avg = 1.8 MB
 *   300 Types * 1 KB avg = 0.3 MB
 *   + overhead (Maps, indexes) = ~5 MB
 *   = ~20 MB total
 * 
 * Current (LRU lazy-load approach):
 *   500 Pokemon * 10 KB avg = 5 MB (most-used only, Gen 1-2 priority)
 *   200 Moves * 2 KB avg = 0.4 MB (common moves only)
 *   300 Types * 1 KB avg = 0.3 MB (always loaded, small dataset)
 *   + overhead (Maps, indexes) = ~1 MB
 *   = ~6-7 MB total
 * 
 * Memory savings: -14 MB (-70% reduction)
 * 
 * Extended Pokemon (Gen 3-9) lazy-loaded on-demand from Read-DB, then cached with LRU eviction.
 */
export const L1_CACHE_MAX_SIZE_MB = IS_TEST ? 5 : 6;

/**
 * L1 cache refresh interval (background worker)
 * Default: 1 hour (3600 seconds)
 * 
 * Read-DB syncs from PROD daily, but L1 cache refreshes hourly
 * to pick up any emergency data fixes applied to Read-DB directly.
 */
export const L1_CACHE_REFRESH_INTERVAL_MS = IS_TEST
  ? 10 * 1000      // 10 seconds (faster test cycles)
  : 60 * 60 * 1000; // 1 hour

/**
 * L1 cache initialization timeout (startup blocking)
 * If cache load exceeds this, startup fails hard (cannot operate without cache)
 */
export const L1_CACHE_INIT_TIMEOUT_MS = IS_TEST ? 5000 : 30000; // 30 seconds

// ============================================================================
// Write Buffer Configuration (In-Memory Queues)
// ============================================================================

/**
 * Maximum write buffer size per queue (battles, moves, anomalies)
 * Default: 2,000 entries per queue = 6,000 total
 * 
 * Memory estimate: 2k battles * 500 bytes = 1 MB per queue = 3 MB total
 * Backpressure triggers at 90% utilization (1,800 entries)
 * 
 * OPTIMIZATION (Phase 2): Reduced from 10k → 2k (5x reduction) to achieve
 * 154 MB → 100 MB runtime memory target. Write buffer: 25 MB → 5 MB.
 */
export const WRITE_BUFFER_MAX_QUEUE_SIZE = IS_TEST ? 100 : 2_000;

/**
 * Write buffer flush interval (drain queues to Write-DB)
 * Default: 10 seconds
 * 
 * OPTIMIZATION (Phase 2): Reduced from 30s → 10s (3x faster) to compensate
 * for smaller queue size and reduce data loss risk.
 * 
 * Trade-off: Shorter interval = less data loss risk, more disk I/O
 *            Longer interval = better batching, higher memory usage
 */
export const WRITE_BUFFER_FLUSH_INTERVAL_MS = IS_TEST
  ? 5 * 1000  // 5 seconds (faster test cycles)
  : 10 * 1000; // 10 seconds (reduced from 30s for memory optimization)

/**
 * Backpressure threshold (percentage of max queue size)
 * At 75%: Log warnings, alert operators
 * At 90%: Reject new battles, emergency flush
 * 
 * OPTIMIZATION (Phase 2): Reject threshold reduced from 95% → 90% to
 * trigger earlier backpressure with smaller queue size.
 */
export const WRITE_BUFFER_WARN_THRESHOLD = 0.75;  // 75%
export const WRITE_BUFFER_REJECT_THRESHOLD = 0.90; // 90% (reduced from 95%)

/**
 * Write buffer shutdown timeout (graceful termination)
 * Max time to wait for final flush during SIGTERM
 */
export const WRITE_BUFFER_SHUTDOWN_TIMEOUT_MS = IS_TEST ? 2000 : 10000; // 10 seconds

// ============================================================================
// Worker Configuration (Background Tasks)
// ============================================================================

/**
 * Worker 1: Cache Refresh Worker
 * Frequency: Hourly (matches L1_CACHE_REFRESH_INTERVAL_MS)
 */
export const CACHE_REFRESH_WORKER_INTERVAL_MS = L1_CACHE_REFRESH_INTERVAL_MS;

/**
 * Worker 2: Write Buffer Flusher
 * Frequency: 30 seconds (matches WRITE_BUFFER_FLUSH_INTERVAL_MS)
 */
export const BUFFER_FLUSH_WORKER_INTERVAL_MS = WRITE_BUFFER_FLUSH_INTERVAL_MS;

/**
 * Worker 3: Read-DB Sync Worker (PROD → Read-DB)
 * Frequency: Daily cron (4 AM UTC)
 * NOTE: This worker runs as a separate Render Cron Job, not in-process
 */
export const READ_DB_SYNC_CRON = '0 4 * * *'; // Daily at 4 AM UTC

/**
 * Worker 4: Write-DB Validator Worker
 * Frequency: 10 minutes (validation + upload if quality passes)
 */
export const WRITE_DB_VALIDATOR_INTERVAL_MS = IS_TEST
  ? 30 * 1000       // 30 seconds (faster test cycles)
  : 10 * 60 * 1000; // 10 minutes

/**
 * Engine Maintenance Worker (Write-DB flush + Read-DB rebuild)
 * Frequency: Every 8 hours in production, 1 minute during tests.
 */
export const ENGINE_MAINTENANCE_INTERVAL_MS = IS_TEST
  ? 60 * 1000        // 1 minute for unit tests
  : 8 * 60 * 60 * 1000; // 8 hours

/**
 * Worker startup stagger delay (prevent thundering herd)
 * Each worker waits N seconds before first execution
 */
export const WORKER_STARTUP_STAGGER_MS = IS_TEST ? 100 : 5000; // 5 seconds

// ============================================================================
// Validation Configuration (Write-DB Quality Checks)
// ============================================================================

/**
 * Minimum quality score to upload Write-DB → PROD
 * Below this threshold, data stays quarantined in Write-DB
 */
export const VALIDATION_MIN_QUALITY_SCORE = 0.95; // 95% pass rate

/**
 * Validation sampling rate (for expensive logic checks)
 * Default: 10% (validates every 10th row for logic correctness)
 */
export const VALIDATION_SAMPLING_RATE = IS_TEST ? 1.0 : 0.10; // 10%

/**
 * Validation batch size (rows processed per chunk)
 * Larger batches = better performance, higher memory usage
 */
export const VALIDATION_BATCH_SIZE = IS_TEST ? 10 : 1000;

/**
 * Validation timeout per batch (prevents runaway workers)
 */
export const VALIDATION_BATCH_TIMEOUT_MS = IS_TEST ? 5000 : 60000; // 60 seconds

/**
 * Maximum quarantine size (anomalies + failed validations)
 * When exceeded, oldest entries auto-pruned
 */
export const VALIDATION_MAX_QUARANTINE_SIZE = 1000;

// ============================================================================
// Database Connection Configuration
// ============================================================================

/**
 * SQLite busy timeout (milliseconds to wait for lock)
 * Higher values = better concurrency, longer blocking risk
 */
export const SQLITE_BUSY_TIMEOUT_MS = 5000; // 5 seconds

/**
 * SQLite page size (bytes, affects I/O performance)
 * Default: 4096 (4 KB, matches most filesystems)
 */
export const SQLITE_PAGE_SIZE = 4096;

/**
 * SQLite cache size (pages in memory)
 * Default: 2000 pages * 4 KB = 8 MB per database
 */
export const SQLITE_CACHE_SIZE_PAGES = 2000;

/**
 * PostgreSQL connection pool size (PROD uploads)
 * Only used by Worker 4 during Write-DB → PROD sync
 */
export const POSTGRES_POOL_SIZE = IS_TEST ? 1 : 5;

/**
 * PostgreSQL query timeout (milliseconds)
 * Prevents hung queries during PROD uploads
 */
export const POSTGRES_QUERY_TIMEOUT_MS = IS_TEST ? 5000 : 30000; // 30 seconds

// ============================================================================
// Performance Thresholds (Observability)
// ============================================================================

/**
 * Expected L1 cache lookup latency (microseconds)
 * Latency above this triggers performance warnings
 */
export const L1_CACHE_EXPECTED_LATENCY_US = 1; // <1μs

/**
 * Expected write buffer push latency (microseconds)
 * Latency above this triggers performance warnings
 */
export const WRITE_BUFFER_EXPECTED_LATENCY_US = 10; // <10μs

/**
 * Expected Read-DB query latency (milliseconds)
 * Used during cache refresh, not battle-critical
 */
export const READ_DB_EXPECTED_LATENCY_MS = 50; // <50ms

/**
 * Expected Write-DB insert latency (milliseconds)
 * Used during buffer flush, not battle-critical
 */
export const WRITE_DB_EXPECTED_LATENCY_MS = 100; // <100ms

// ============================================================================
// Disk Management Configuration
// ============================================================================

/**
 * Write-DB retention period (hours)
 * Rows older than this auto-pruned during validation
 */
export const WRITE_DB_RETENTION_HOURS = IS_TEST ? 1 : 24; // 24 hours

/**
 * Write-DB pruning interval (Worker 4 cleanup)
 * Frequency: Every 6 hours (4x per day)
 */
export const WRITE_DB_PRUNING_INTERVAL_MS = IS_TEST
  ? 60 * 1000        // 1 minute (faster test cycles)
  : 6 * 60 * 60 * 1000; // 6 hours

/**
 * Disk space alert threshold (percentage)
 * At 75%: Log warnings
 * At 90%: Emergency prune + alert operators
 */
export const DISK_SPACE_WARN_THRESHOLD = 0.75;  // 75%
export const DISK_SPACE_EMERGENCY_THRESHOLD = 0.90; // 90%

/**
 * Write-DB max size before emergency VACUUM (megabytes)
 * Forces cleanup even if retention period not reached
 */
export const WRITE_DB_MAX_SIZE_MB = IS_TEST ? 10 : 500; // 500 MB

// ============================================================================
// Health Check Configuration (Render Integration)
// ============================================================================

/**
 * Health check endpoint path
 * Returns 200 when engineReady = true, 503 otherwise
 */
export const HEALTH_CHECK_PATH = '/health';

/**
 * Health check timeout (milliseconds)
 * Max time Render waits for response before marking unhealthy
 */
export const HEALTH_CHECK_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Health check failure threshold (consecutive failures before restart)
 * Render restarts service after N consecutive 503 responses
 */
export const HEALTH_CHECK_FAILURE_THRESHOLD = 3;

// ============================================================================
// Logging Configuration
// ============================================================================

/**
 * Engine DB log level
 * Options: 'debug' | 'info' | 'warn' | 'error'
 */
export const ENGINE_LOG_LEVEL = IS_TEST ? 'warn' : 'info';

/**
 * Performance metrics logging interval (milliseconds)
 * How often to emit cache/buffer stats to console/telemetry
 */
export const METRICS_LOG_INTERVAL_MS = IS_TEST
  ? 60 * 1000       // 1 minute (faster test cycles)
  : 5 * 60 * 1000;  // 5 minutes

// ============================================================================
// Feature Flags (Gradual Rollout)
// ============================================================================

/**
 * Enable L1 cache (in-memory Map)
 * Disable to fall back to Read-DB queries (useful for debugging)
 */
export const FEATURE_L1_CACHE_ENABLED = process.env.ENGINE_FEATURE_L1_CACHE !== 'false';

/**
 * Enable L1 cache extended data loading (Gen 3-9 Pokemon, rare moves)
 * 
 * OPTIMIZATION (Phase 2B Alternative): Disabled by default to enforce LRU lazy-loading.
 * 
 * When disabled (default):
 * - Only Gen 1-2 Pokemon (IDs 1-251) + common moves loaded at startup
 * - Extended Pokemon lazy-loaded on-demand from Read-DB
 * - Memory: ~6 MB (500 Pokemon max via LRU eviction)
 * 
 * When enabled:
 * - All Pokemon (IDs 1-1025) + all moves loaded eventually
 * - Memory: ~20 MB (full dataset)
 * 
 * Set ENGINE_FEATURE_L1_EXTENDED_LOADING=true to enable full dataset.
 */
export const FEATURE_L1_EXTENDED_LOADING_ENABLED = process.env.ENGINE_FEATURE_L1_EXTENDED_LOADING === 'true';

/**
 * Enable Write Buffer (in-memory queues)
 * Disable to write directly to Write-DB (useful for debugging)
 */
export const FEATURE_WRITE_BUFFER_ENABLED = process.env.ENGINE_FEATURE_WRITE_BUFFER !== 'false';

/**
 * Enable background workers (cache refresh, buffer flush, etc.)
 * Disable for manual testing (run workers explicitly)
 */
export const FEATURE_WORKERS_ENABLED = process.env.ENGINE_FEATURE_WORKERS !== 'false';

/**
 * Enable validation before PROD upload
 * Disable to upload Write-DB data immediately (dangerous!)
 */
export const FEATURE_VALIDATION_ENABLED = process.env.ENGINE_FEATURE_VALIDATION !== 'false';

// ============================================================================
// Exports (Type-Safe Config Object)
// ============================================================================

/**
 * Centralized Engine DB configuration object
 * Import this instead of individual constants for better testability
 */
export const EngineDbConfig = {
  // Environment
  isProduction: IS_PRODUCTION,
  isTest: IS_TEST,
  
  // Paths
  storageBaseDir: STORAGE_BASE_DIR,
  readDbPath: ENGINE_READ_DB_PATH,
  writeDbPath: ENGINE_WRITE_DB_PATH,
  walPath: ENGINE_WAL_PATH,
  readVersionPath: ENGINE_READ_VERSION_PATH,
  
  // L1 Cache
  l1CacheMaxSizeMb: L1_CACHE_MAX_SIZE_MB,
  l1CacheRefreshIntervalMs: L1_CACHE_REFRESH_INTERVAL_MS,
  l1CacheInitTimeoutMs: L1_CACHE_INIT_TIMEOUT_MS,
  
  // Write Buffer
  writeBufferMaxQueueSize: WRITE_BUFFER_MAX_QUEUE_SIZE,
  writeBufferFlushIntervalMs: WRITE_BUFFER_FLUSH_INTERVAL_MS,
  writeBufferWarnThreshold: WRITE_BUFFER_WARN_THRESHOLD,
  writeBufferRejectThreshold: WRITE_BUFFER_REJECT_THRESHOLD,
  writeBufferShutdownTimeoutMs: WRITE_BUFFER_SHUTDOWN_TIMEOUT_MS,
  
  // Workers
  cacheRefreshWorkerIntervalMs: CACHE_REFRESH_WORKER_INTERVAL_MS,
  bufferFlushWorkerIntervalMs: BUFFER_FLUSH_WORKER_INTERVAL_MS,
  readDbSyncCron: READ_DB_SYNC_CRON,
  writeDbValidatorIntervalMs: WRITE_DB_VALIDATOR_INTERVAL_MS,
  maintenanceWorkerIntervalMs: ENGINE_MAINTENANCE_INTERVAL_MS,
  workerStartupStaggerMs: WORKER_STARTUP_STAGGER_MS,
  
  // Validation
  validationMinQualityScore: VALIDATION_MIN_QUALITY_SCORE,
  validationSamplingRate: VALIDATION_SAMPLING_RATE,
  validationBatchSize: VALIDATION_BATCH_SIZE,
  validationBatchTimeoutMs: VALIDATION_BATCH_TIMEOUT_MS,
  validationMaxQuarantineSize: VALIDATION_MAX_QUARANTINE_SIZE,
  
  // Database Connections
  sqliteBusyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
  sqlitePageSize: SQLITE_PAGE_SIZE,
  sqliteCacheSizePages: SQLITE_CACHE_SIZE_PAGES,
  postgresPoolSize: POSTGRES_POOL_SIZE,
  postgresQueryTimeoutMs: POSTGRES_QUERY_TIMEOUT_MS,
  
  // Performance
  l1CacheExpectedLatencyUs: L1_CACHE_EXPECTED_LATENCY_US,
  writeBufferExpectedLatencyUs: WRITE_BUFFER_EXPECTED_LATENCY_US,
  readDbExpectedLatencyMs: READ_DB_EXPECTED_LATENCY_MS,
  writeDbExpectedLatencyMs: WRITE_DB_EXPECTED_LATENCY_MS,
  
  // Disk Management
  writeDbRetentionHours: WRITE_DB_RETENTION_HOURS,
  writeDbPruningIntervalMs: WRITE_DB_PRUNING_INTERVAL_MS,
  diskSpaceWarnThreshold: DISK_SPACE_WARN_THRESHOLD,
  diskSpaceEmergencyThreshold: DISK_SPACE_EMERGENCY_THRESHOLD,
  writeDbMaxSizeMb: WRITE_DB_MAX_SIZE_MB,
  
  // Health Check
  healthCheckPath: HEALTH_CHECK_PATH,
  healthCheckTimeoutMs: HEALTH_CHECK_TIMEOUT_MS,
  healthCheckFailureThreshold: HEALTH_CHECK_FAILURE_THRESHOLD,
  
  // Logging
  engineLogLevel: ENGINE_LOG_LEVEL,
  metricsLogIntervalMs: METRICS_LOG_INTERVAL_MS,
  
  // Feature Flags
  featureL1CacheEnabled: FEATURE_L1_CACHE_ENABLED,
  featureL1ExtendedLoadingEnabled: FEATURE_L1_EXTENDED_LOADING_ENABLED,
  featureWriteBufferEnabled: FEATURE_WRITE_BUFFER_ENABLED,
  featureWorkersEnabled: FEATURE_WORKERS_ENABLED,
  featureValidationEnabled: FEATURE_VALIDATION_ENABLED,
} as const;

/**
 * Validation: Ensure critical paths exist at startup
 * Throws error if storage directory inaccessible
 */
export async function validateEngineDbConfig(): Promise<void> {
  const fs = await import('node:fs/promises');
  
  try {
    await fs.mkdir(STORAGE_BASE_DIR, { recursive: true });
  } catch (error) {
    throw new Error(
      `Engine DB config validation failed: Cannot create storage directory ${STORAGE_BASE_DIR}. ` +
      `Error: ${getErrorMessage(error)}`
    );
  }
}
