/**
 * Error Brain Configuration — Centralized settings for the Error Intelligence System
 * 
 * Single source of truth for:
 * - File paths (environment-aware)
 * - Cache limits (L1 memory sizing)
 * - Detection thresholds (anomaly, correlation, cascade)
 * - Learning parameters (EMA alpha, confidence thresholds)
 * - Worker intervals (refresh, sync, prune schedules)
 * 
 * Referenced By: src/services/error-brain/error-brain-db.ts,
 *                src/services/error-brain/error-brain-cache.ts,
 *                src/services/error-brain/pattern-detector.ts,
 *                src/workers/error-brain-worker.ts,
 *                docs/projects/error-brain-architecture.md
 * 
 * @module config/error-brain-config
 */

import path from 'node:path';

// ============================================================================
// Environment Detection (reuse from engine-db-config)
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
 * Base storage directory for Error Brain files
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
// File Paths
// ============================================================================

/**
 * Error Brain SQLite database path
 * Contains: patterns, correlations, cascades, recovery weights, impact weights
 */
export const ERROR_BRAIN_DB_PATH = path.join(STORAGE_BASE_DIR, 'error-brain.db');

/**
 * Error Brain WAL path (crash recovery for SQLite)
 */
export const ERROR_BRAIN_WAL_PATH = path.join(STORAGE_BASE_DIR, 'error-brain.db-wal');

/**
 * Error Brain version file (tracks schema version and last sync)
 */
export const ERROR_BRAIN_VERSION_PATH = path.join(STORAGE_BASE_DIR, 'error-brain.version.json');

// ============================================================================
// L1 Cache Configuration (In-Memory)
// ============================================================================

/**
 * Maximum L1 cache size for Error Brain patterns
 * 
 * Estimated usage:
 *   500 fingerprints * 4KB patterns = 2 MB
 *   24 global hourly patterns = 24 KB
 *   10 baseline metrics = 1 KB
 *   = ~2.1 MB actual usage
 * 
 * The 2 MB limit is strict to avoid memory pressure on error paths.
 */
export const L1_CACHE_MAX_SIZE_MB = IS_TEST ? 1 : 2;

/**
 * Maximum number of unique fingerprints to track
 * Older patterns are evicted when this limit is reached (LRU)
 */
export const MAX_TRACKED_FINGERPRINTS = IS_TEST ? 100 : 500;

/**
 * Pattern expiry in days (patterns older than this are pruned)
 */
export const PATTERN_EXPIRY_DAYS = 30;

/**
 * Maximum correlations stored per fingerprint
 * Only top N by correlation strength are kept
 */
export const MAX_CORRELATIONS_PER_FINGERPRINT = 10;

/**
 * Maximum cascade depth to track
 * Prevents infinite loops in cascade detection
 */
export const MAX_CASCADE_DEPTH = 5;

// ============================================================================
// Detection Thresholds
// ============================================================================

/**
 * Z-score threshold for anomaly detection
 * 2.0 = 95% confidence (2 standard deviations from mean)
 * 2.5 = 99% confidence
 * 3.0 = 99.7% confidence
 */
export const ANOMALY_ZSCORE_THRESHOLD = 2.0;

/**
 * Minimum correlation strength to consider two errors related
 * Range: 0.0 to 1.0 (1.0 = always occur together)
 */
export const CORRELATION_MIN_STRENGTH = 0.3;

/**
 * Minimum confidence for cascade predictions
 * Range: 0.0 to 1.0
 */
export const CASCADE_MIN_CONFIDENCE = 0.5;

/**
 * Minimum confidence for impact predictions
 * Below this threshold, fallback to heuristics
 */
export const IMPACT_MIN_CONFIDENCE = 0.6;

/**
 * Minimum observations required to build confidence
 * Patterns with fewer observations have reduced confidence
 */
export const MIN_OBSERVATIONS_FOR_CONFIDENCE = 5;

/**
 * Time window for correlation detection (ms)
 * Errors within this window of each other may be correlated
 */
export const CORRELATION_WINDOW_MS = 5000;

// ============================================================================
// Learning Parameters
// ============================================================================

/**
 * Exponential Moving Average alpha (learning rate)
 * Higher = more weight on recent observations
 * Lower = more stable, slower to adapt
 * Range: 0.0 to 1.0
 */
export const LEARNING_RATE_ALPHA = 0.1;

/**
 * Bayesian prior for success rate calculations
 * Used when no prior observations exist
 */
export const BAYESIAN_PRIOR_SUCCESS_RATE = 0.5;

/**
 * Confidence decay factor per day without observations
 * Confidence = confidence * (decay ^ daysSinceLastObservation)
 */
export const CONFIDENCE_DECAY_FACTOR = 0.95;

/**
 * Minimum samples required before pattern is considered "learned"
 */
export const MIN_SAMPLES_FOR_PATTERN = 3;

// ============================================================================
// Worker Intervals (milliseconds)
// ============================================================================

/**
 * L1 cache refresh interval
 * How often to sync L1 cache from SQLite
 */
export const CACHE_REFRESH_INTERVAL_MS = IS_TEST ? 5000 : 5 * 60 * 1000; // 5 min

/**
 * Time pattern update interval
 * How often to update hourly baseline patterns
 */
export const TIME_PATTERN_UPDATE_INTERVAL_MS = IS_TEST ? 10000 : 15 * 60 * 1000; // 15 min

/**
 * Correlation update interval
 * How often to detect and update correlations
 */
export const CORRELATION_UPDATE_INTERVAL_MS = IS_TEST ? 15000 : 30 * 60 * 1000; // 30 min

/**
 * Cascade update interval
 * How often to detect and update cascade chains
 */
export const CASCADE_UPDATE_INTERVAL_MS = IS_TEST ? 15000 : 30 * 60 * 1000; // 30 min

/**
 * Recovery weight update interval
 * How often to recalculate strategy effectiveness
 */
export const RECOVERY_UPDATE_INTERVAL_MS = IS_TEST ? 30000 : 60 * 60 * 1000; // 1 hour

/**
 * PostgreSQL sync interval
 * How often to persist critical patterns to ErrorKnowledge table
 */
export const POSTGRES_SYNC_INTERVAL_MS = IS_TEST ? 60000 : 60 * 60 * 1000; // 1 hour

/**
 * Stale pattern prune interval
 * How often to remove expired patterns from SQLite
 */
export const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Worker startup stagger delay
 * Prevents all workers from starting simultaneously
 */
export const WORKER_STARTUP_STAGGER_MS = IS_TEST ? 100 : 5000;

// ============================================================================
// SQLite Configuration
// ============================================================================

/**
 * SQLite busy timeout (ms)
 * How long to wait for locks before failing
 */
export const SQLITE_BUSY_TIMEOUT_MS = 5000;

/**
 * SQLite cache size (pages, negative = KB)
 * -2000 = 2 MB cache
 */
export const SQLITE_CACHE_SIZE_PAGES = -2000;

/**
 * SQLite page size (bytes)
 * 4096 is optimal for most SSDs
 */
export const SQLITE_PAGE_SIZE = 4096;

/**
 * Auto-save interval (ms)
 * How often to persist in-memory SQLite to disk
 */
export const AUTO_SAVE_INTERVAL_MS = 30000;

// ============================================================================
// Performance Limits
// ============================================================================

/**
 * Maximum errors to process in a single observation batch
 */
export const MAX_OBSERVATION_BATCH_SIZE = 100;

/**
 * Maximum time (ms) to spend on pattern detection per error
 */
export const MAX_DETECTION_TIME_MS = 500;

/**
 * Rate limit for observations (observations per second)
 * Prevents overwhelming the brain during error storms
 */
export const OBSERVATION_RATE_LIMIT = 100;

/**
 * Buffer size for recent errors (for correlation detection)
 */
export const RECENT_ERRORS_BUFFER_SIZE = 1000;

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Enable/disable L1 cache (for debugging)
 */
export const L1_CACHE_ENABLED = !IS_TEST || process.env.ERROR_BRAIN_CACHE_ENABLED === 'true';

/**
 * Enable/disable pattern detection
 */
export const PATTERN_DETECTION_ENABLED = true;

/**
 * Enable/disable cascade prediction
 */
export const CASCADE_PREDICTION_ENABLED = true;

/**
 * Enable/disable impact prediction
 */
export const IMPACT_PREDICTION_ENABLED = true;

/**
 * Enable/disable PostgreSQL sync
 */
export const POSTGRES_SYNC_ENABLED = !IS_TEST;

/**
 * Enable/disable verbose logging for Error Brain
 */
export const VERBOSE_LOGGING = process.env.ERROR_BRAIN_VERBOSE === 'true';

// ============================================================================
// Exported Configuration Object
// ============================================================================

/**
 * Centralized configuration export for Error Brain system
 */
export const ErrorBrainConfig = {
  // Environment
  isProduction: IS_PRODUCTION,
  isTest: IS_TEST,
  storageBaseDir: STORAGE_BASE_DIR,
  
  // File paths
  brainDbPath: ERROR_BRAIN_DB_PATH,
  brainWalPath: ERROR_BRAIN_WAL_PATH,
  brainVersionPath: ERROR_BRAIN_VERSION_PATH,
  
  // Cache limits
  l1CacheMaxSizeMB: L1_CACHE_MAX_SIZE_MB,
  maxTrackedFingerprints: MAX_TRACKED_FINGERPRINTS,
  patternExpiryDays: PATTERN_EXPIRY_DAYS,
  maxCorrelationsPerFingerprint: MAX_CORRELATIONS_PER_FINGERPRINT,
  maxCascadeDepth: MAX_CASCADE_DEPTH,
  
  // Detection thresholds
  anomalyZScoreThreshold: ANOMALY_ZSCORE_THRESHOLD,
  correlationMinStrength: CORRELATION_MIN_STRENGTH,
  cascadeMinConfidence: CASCADE_MIN_CONFIDENCE,
  impactMinConfidence: IMPACT_MIN_CONFIDENCE,
  minObservationsForConfidence: MIN_OBSERVATIONS_FOR_CONFIDENCE,
  correlationWindowMs: CORRELATION_WINDOW_MS,
  
  // Learning parameters
  learningRateAlpha: LEARNING_RATE_ALPHA,
  bayesianPriorSuccessRate: BAYESIAN_PRIOR_SUCCESS_RATE,
  confidenceDecayFactor: CONFIDENCE_DECAY_FACTOR,
  minSamplesForPattern: MIN_SAMPLES_FOR_PATTERN,
  
  // Worker intervals
  cacheRefreshIntervalMs: CACHE_REFRESH_INTERVAL_MS,
  timePatternUpdateIntervalMs: TIME_PATTERN_UPDATE_INTERVAL_MS,
  correlationUpdateIntervalMs: CORRELATION_UPDATE_INTERVAL_MS,
  cascadeUpdateIntervalMs: CASCADE_UPDATE_INTERVAL_MS,
  recoveryUpdateIntervalMs: RECOVERY_UPDATE_INTERVAL_MS,
  postgresSyncIntervalMs: POSTGRES_SYNC_INTERVAL_MS,
  pruneIntervalMs: PRUNE_INTERVAL_MS,
  workerStartupStaggerMs: WORKER_STARTUP_STAGGER_MS,
  
  // SQLite configuration
  sqliteBusyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS,
  sqliteCacheSizePages: SQLITE_CACHE_SIZE_PAGES,
  sqlitePageSize: SQLITE_PAGE_SIZE,
  autoSaveIntervalMs: AUTO_SAVE_INTERVAL_MS,
  
  // Performance limits
  maxObservationBatchSize: MAX_OBSERVATION_BATCH_SIZE,
  maxDetectionTimeMs: MAX_DETECTION_TIME_MS,
  observationRateLimit: OBSERVATION_RATE_LIMIT,
  recentErrorsBufferSize: RECENT_ERRORS_BUFFER_SIZE,
  
  // Feature flags
  l1CacheEnabled: L1_CACHE_ENABLED,
  patternDetectionEnabled: PATTERN_DETECTION_ENABLED,
  cascadePredictionEnabled: CASCADE_PREDICTION_ENABLED,
  impactPredictionEnabled: IMPACT_PREDICTION_ENABLED,
  postgresSyncEnabled: POSTGRES_SYNC_ENABLED,
  verboseLogging: VERBOSE_LOGGING,
} as const;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate Error Brain configuration at startup
 * @returns Array of validation errors (empty if valid)
 */
export function validateErrorBrainConfig(): string[] {
  const errors: string[] = [];
  
  // Cache limits
  if (L1_CACHE_MAX_SIZE_MB < 1 || L1_CACHE_MAX_SIZE_MB > 10) {
    errors.push(`L1_CACHE_MAX_SIZE_MB must be 1-10 MB (got ${L1_CACHE_MAX_SIZE_MB})`);
  }
  
  if (MAX_TRACKED_FINGERPRINTS < 10 || MAX_TRACKED_FINGERPRINTS > 10000) {
    errors.push(`MAX_TRACKED_FINGERPRINTS must be 10-10000 (got ${MAX_TRACKED_FINGERPRINTS})`);
  }
  
  // Thresholds
  if (ANOMALY_ZSCORE_THRESHOLD < 1 || ANOMALY_ZSCORE_THRESHOLD > 5) {
    errors.push(`ANOMALY_ZSCORE_THRESHOLD must be 1-5 (got ${ANOMALY_ZSCORE_THRESHOLD})`);
  }
  
  if (CORRELATION_MIN_STRENGTH < 0 || CORRELATION_MIN_STRENGTH > 1) {
    errors.push(`CORRELATION_MIN_STRENGTH must be 0-1 (got ${CORRELATION_MIN_STRENGTH})`);
  }
  
  if (CASCADE_MIN_CONFIDENCE < 0 || CASCADE_MIN_CONFIDENCE > 1) {
    errors.push(`CASCADE_MIN_CONFIDENCE must be 0-1 (got ${CASCADE_MIN_CONFIDENCE})`);
  }
  
  // Learning parameters
  if (LEARNING_RATE_ALPHA <= 0 || LEARNING_RATE_ALPHA > 1) {
    errors.push(`LEARNING_RATE_ALPHA must be 0-1 (got ${LEARNING_RATE_ALPHA})`);
  }
  
  // Intervals
  if (CACHE_REFRESH_INTERVAL_MS < 1000) {
    errors.push(`CACHE_REFRESH_INTERVAL_MS must be >= 1000ms (got ${CACHE_REFRESH_INTERVAL_MS})`);
  }
  
  return errors;
}

export default ErrorBrainConfig;
