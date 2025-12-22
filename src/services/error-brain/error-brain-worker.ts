/**
 * Error Brain — Background Worker
 *
 * Continuous learning worker that:
 * - Refreshes L1 cache from SQLite periodically
 * - Updates pattern weights based on observations
 * - Syncs with PostgreSQL for persistent storage
 * - Harvests correlation and cascade data
 * - Maintains baselines and prunes stale data
 *
 * @module error-brain/error-brain-worker
 */

import { ErrorBrainConfig } from "../../config/error-brain-config.js";
import {
  initialize as initializeDb,
  upsertTimePattern,
  upsertCorrelation,
  upsertCascade,
  upsertImpactWeight,
  upsertBaseline,
  pruneStalePatterns,
  saveToDisk,
  getStats as getDbStats,
  shutdown as shutdownDb,
  recordRecoveryOutcome as dbRecordRecoveryOutcome,
  type TimePatternEntry,
  type CorrelationEntry,
  type CascadeEntry,
} from "./error-brain-db.js";
import {
  initialize as initializeCache,
  refreshFromDb,
  getStats as getCacheStats,
  shutdown as shutdownCache,
  hotUpdateTimePattern,
  hotUpdateCascade,
  // hotUpdateImpactWeight - reserved for future use
} from "./error-brain-cache.js";
import {
  harvestCorrelationData,
  harvestCompletedCascades,
  harvestTimePatternData,
  pruneStaleObservations,
  getPatternDetectorStats,
  clearAllPatternState,
} from "./pattern-detector.js";
import {
  pruneStaleHistory,
  getImpactPredictorStats,
} from "./impact-predictor.js";
import { getLogger } from "../../shared/logging/index.js";

const logger = getLogger();

// ==================== TYPES ====================

/**
 * Worker status for monitoring.
 */
export interface WorkerStatus {
  /** Worker name */
  name: string;
  /** Whether worker is running */
  isRunning: boolean;
  /** Last execution timestamp */
  lastExecution: number | null;
  /** Last execution duration (ms) */
  lastDurationMs: number | null;
  /** Total executions */
  executionCount: number;
  /** Error count */
  errorCount: number;
  /** Next scheduled execution */
  nextExecution: number | null;
}

/**
 * Combined worker statistics.
 */
export interface BrainWorkerStats {
  /** Whether workers are active */
  isActive: boolean;
  /** Start timestamp */
  startTime: number | null;
  /** Uptime in milliseconds */
  uptimeMs: number;
  /** Worker statuses */
  workers: WorkerStatus[];
  /** Database stats */
  database: ReturnType<typeof getDbStats> | null;
  /** Cache stats */
  cache: ReturnType<typeof getCacheStats> | null;
  /** Pattern detector stats */
  patternDetector: ReturnType<typeof getPatternDetectorStats>;
  /** Impact predictor stats */
  impactPredictor: ReturnType<typeof getImpactPredictorStats>;
}

/**
 * Learning update from PostgreSQL.
 */
export interface LearningUpdate {
  /** Time patterns learned */
  timePatterns: TimePatternEntry[];
  /** Correlations learned */
  correlations: CorrelationEntry[];
  /** Cascades learned */
  cascades: CascadeEntry[];
}

// ==================== STATE ====================

let isActive = false;
let startTime: number | null = null;

// Worker intervals
let cacheRefreshInterval: NodeJS.Timeout | null = null;
let patternUpdateInterval: NodeJS.Timeout | null = null;
let correlationHarvestInterval: NodeJS.Timeout | null = null;
let diskSaveInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

// Worker status tracking
const workerStatuses: Map<string, WorkerStatus> = new Map();

// Initialize worker status
function initWorkerStatus(name: string): void {
  workerStatuses.set(name, {
    name,
    isRunning: false,
    lastExecution: null,
    lastDurationMs: null,
    executionCount: 0,
    errorCount: 0,
    nextExecution: null,
  });
}

// Update worker status
function recordWorkerExecution(
  name: string,
  durationMs: number,
  isError: boolean
): void {
  const status = workerStatuses.get(name);
  if (status) {
    status.lastExecution = Date.now();
    status.lastDurationMs = durationMs;
    status.executionCount++;
    if (isError) {
      status.errorCount++;
    }
  }
}

// ==================== CONFIGURATION ====================

const CACHE_REFRESH_INTERVAL_MS = ErrorBrainConfig.cacheRefreshIntervalMs;
const PATTERN_UPDATE_INTERVAL_MS = ErrorBrainConfig.timePatternUpdateIntervalMs;
const CORRELATION_UPDATE_INTERVAL_MS = ErrorBrainConfig.correlationUpdateIntervalMs;
const PG_SYNC_INTERVAL_MS = ErrorBrainConfig.postgresSyncIntervalMs;
const DISK_SAVE_INTERVAL_MS = ErrorBrainConfig.autoSaveIntervalMs;

// ==================== WORKER FUNCTIONS ====================

/**
 * Cache Refresh Worker
 * Refreshes L1 cache from SQLite database.
 */
async function runCacheRefresh(): Promise<void> {
  const name = "CacheRefresh";
  const status = workerStatuses.get(name);
  if (status) status.isRunning = true;

  const startMs = Date.now();
  let isError = false;

  try {
    await refreshFromDb();
  } catch (error) {
    isError = true;
    logger.error('error-brain', 'cache-refresh', 'Cache refresh failed', { error: { name: 'CacheRefreshError', message: String(error) } });
  } finally {
    const durationMs = Date.now() - startMs;
    recordWorkerExecution(name, durationMs, isError);
    if (status) {
      status.isRunning = false;
      status.nextExecution = Date.now() + CACHE_REFRESH_INTERVAL_MS;
    }
  }
}

/**
 * Pattern Update Worker
 * Harvests time patterns and updates SQLite.
 */
async function runPatternUpdate(): Promise<void> {
  const name = "PatternUpdate";
  const status = workerStatuses.get(name);
  if (status) status.isRunning = true;

  const startMs = Date.now();
  let isError = false;

  try {
    // Harvest time pattern data from detector
    const timePatterns = harvestTimePatternData();
    const hour = new Date().getUTCHours();

    for (const { fingerprint, currentCount, windowSizeMs } of timePatterns) {
      // Scale to hourly rate
      const hourlyRate = currentCount * (3600000 / windowSizeMs);

      // Note: We're updating incrementally
      upsertTimePattern(
        hour,
        hourlyRate,
        hourlyRate * 0.3, // Rough std dev estimate
        fingerprint,
        null // dayOfWeek
      );

      // Hot update cache with full TimePatternEntry
      hotUpdateTimePattern({
        id: 0,
        hour,
        dayOfWeek: null,
        fingerprint,
        avgCount: hourlyRate,
        stdDev: hourlyRate * 0.3,
        anomalyThreshold: ErrorBrainConfig.anomalyZScoreThreshold,
        sampleCount: 1,
        lastUpdated: Date.now(),
      });
    }
  } catch (error) {
    isError = true;
    logger.error('error-brain', 'pattern-update', 'Pattern update failed', { error: { name: 'PatternUpdateError', message: String(error) } });
  } finally {
    const durationMs = Date.now() - startMs;
    recordWorkerExecution(name, durationMs, isError);
    if (status) {
      status.isRunning = false;
      status.nextExecution = Date.now() + PATTERN_UPDATE_INTERVAL_MS;
    }
  }
}

/**
 * Correlation Harvest Worker
 * Harvests correlations and cascades, updates SQLite.
 */
async function runCorrelationHarvest(): Promise<void> {
  const name = "CorrelationHarvest";
  const status = workerStatuses.get(name);
  if (status) status.isRunning = true;

  const startMs = Date.now();
  let isError = false;

  try {
    // Harvest correlations
    const correlations = harvestCorrelationData(10);

    for (const { primaryFingerprint, secondaryFingerprint, strength, coOccurrences } of correlations) {
      // upsertCorrelation expects: primaryFp, secondaryFp, strength, avgTimeDeltaMs
      upsertCorrelation(
        primaryFingerprint,
        secondaryFingerprint,
        strength,
        coOccurrences * 100 // Rough time estimate from count
      );
    }

    // Harvest completed cascades
    const cascades = harvestCompletedCascades();

    for (const { rootFingerprint, childFingerprints, durationMs } of cascades) {
      // upsertCascade expects: rootFp, childFps, cascadeDepth, avgSpreadTimeMs, totalImpact
      upsertCascade(
        rootFingerprint,
        childFingerprints,
        childFingerprints.length, // cascadeDepth
        durationMs, // avgSpreadTimeMs
        childFingerprints.length * 10 // totalImpact estimate
      );

      // Hot update cache
      hotUpdateCascade({
        id: 0,
        rootFingerprint,
        childFingerprints,
        cascadeDepth: childFingerprints.length,
        avgSpreadTimeMs: durationMs,
        totalImpact: childFingerprints.length * 10,
        confidence: 0.5,
        lastObserved: Date.now(),
      });
    }
  } catch (error) {
    isError = true;
    logger.error('error-brain', 'correlation-harvest', 'Correlation harvest failed', { error: { name: 'CorrelationHarvestError', message: String(error) } });
  } finally {
    const durationMs = Date.now() - startMs;
    recordWorkerExecution(name, durationMs, isError);
    if (status) {
      status.isRunning = false;
      status.nextExecution = Date.now() + CORRELATION_UPDATE_INTERVAL_MS;
    }
  }
}

/**
 * Disk Save Worker
 * Saves SQLite database to disk.
 */
async function runDiskSave(): Promise<void> {
  const name = "DiskSave";
  const status = workerStatuses.get(name);
  if (status) status.isRunning = true;

  const startMs = Date.now();
  let isError = false;

  try {
    await saveToDisk();
  } catch (error) {
    isError = true;
    logger.error('error-brain', 'disk-save', 'Disk save failed', { error: { name: 'DiskSaveError', message: String(error) } });
  } finally {
    const durationMs = Date.now() - startMs;
    recordWorkerExecution(name, durationMs, isError);
    if (status) {
      status.isRunning = false;
      status.nextExecution = Date.now() + DISK_SAVE_INTERVAL_MS;
    }
  }
}

/**
 * Cleanup Worker
 * Prunes stale data and reclaims memory.
 */
async function runCleanup(): Promise<void> {
  const name = "Cleanup";
  const status = workerStatuses.get(name);
  if (status) status.isRunning = true;

  const startMs = Date.now();
  let isError = false;

  try {
    // Prune stale patterns from SQLite (uses patternExpiryDays from config)
    pruneStalePatterns();

    // Prune stale observations from pattern detector
    pruneStaleObservations(24 * 60 * 60 * 1000); // 24 hours

    // Prune stale error history from impact predictor
    pruneStaleHistory();
  } catch (error) {
    isError = true;
    logger.error('error-brain', 'cleanup', 'Cleanup failed', { error: { name: 'CleanupError', message: String(error) } });
  } finally {
    const durationMs = Date.now() - startMs;
    recordWorkerExecution(name, durationMs, isError);
    if (status) {
      status.isRunning = false;
      // Cleanup runs every hour
      status.nextExecution = Date.now() + 60 * 60 * 1000;
    }
  }
}

// ==================== POSTGRESQL SYNC ====================

/**
 * Sync patterns with PostgreSQL.
 * This is called periodically to persist learned patterns to the cloud.
 *
 * NOTE: This function requires access to Prisma client.
 * In a real implementation, this would import from shared/prisma.js
 * and write to ErrorKnowledge, ErrorResolution tables.
 */
export async function syncWithPostgres(): Promise<void> {
  const name = "PostgresSync";
  const status = workerStatuses.get(name);
  if (status) status.isRunning = true;

  const startMs = Date.now();
  let isError = false;

  try {
    // TODO: Implement PostgreSQL sync when integrating with error-tracker
    logger.debug('error-brain', 'postgres-sync', 'PostgreSQL sync placeholder executed');
  } catch (error) {
    isError = true;
    logger.error('error-brain', 'postgres-sync', 'PostgreSQL sync failed', { error: { name: 'PostgresSyncError', message: String(error) } });
  } finally {
    const durationMs = Date.now() - startMs;
    recordWorkerExecution(name, durationMs, isError);
    if (status) {
      status.isRunning = false;
      status.nextExecution = Date.now() + PG_SYNC_INTERVAL_MS;
    }
  }
}

/**
 * Apply learning updates from external source.
 */
export async function applyLearningUpdates(updates: LearningUpdate): Promise<void> {
  // Apply time patterns
  for (const pattern of updates.timePatterns) {
    upsertTimePattern(
      pattern.hour,
      pattern.avgCount,
      pattern.stdDev,
      pattern.fingerprint,
      pattern.dayOfWeek
    );
    hotUpdateTimePattern(pattern);
  }

  // Apply correlations
  for (const corr of updates.correlations) {
    upsertCorrelation(
      corr.primaryFingerprint,
      corr.secondaryFingerprint,
      corr.correlationStrength,
      corr.avgTimeDeltaMs
    );
  }

  // Apply cascades
  for (const cascade of updates.cascades) {
    upsertCascade(
      cascade.rootFingerprint,
      cascade.childFingerprints,
      cascade.cascadeDepth,
      cascade.avgSpreadTimeMs,
      cascade.totalImpact
    );
    hotUpdateCascade(cascade);
  }
}

// ==================== LIFECYCLE ====================

/**
 * Start the Error Brain worker system.
 */
export async function startWorkers(): Promise<void> {
  if (isActive) {
    logger.debug('error-brain', 'startup', 'Workers already running');
    return;
  }

  logger.info('error-brain', 'startup', 'Starting Error Brain workers');
  startTime = Date.now();

  // Initialize worker status tracking
  initWorkerStatus("CacheRefresh");
  initWorkerStatus("PatternUpdate");
  initWorkerStatus("CorrelationHarvest");
  initWorkerStatus("DiskSave");
  initWorkerStatus("Cleanup");
  initWorkerStatus("PostgresSync");

  // Initialize database
  await initializeDb();

  // Initialize cache (loads from DB)
  await initializeCache();

  // Start workers with staggered intervals
  cacheRefreshInterval = setInterval(runCacheRefresh, CACHE_REFRESH_INTERVAL_MS);
  workerStatuses.get("CacheRefresh")!.nextExecution = Date.now() + CACHE_REFRESH_INTERVAL_MS;

  patternUpdateInterval = setInterval(runPatternUpdate, PATTERN_UPDATE_INTERVAL_MS);
  workerStatuses.get("PatternUpdate")!.nextExecution = Date.now() + PATTERN_UPDATE_INTERVAL_MS;

  correlationHarvestInterval = setInterval(runCorrelationHarvest, CORRELATION_UPDATE_INTERVAL_MS);
  workerStatuses.get("CorrelationHarvest")!.nextExecution = Date.now() + CORRELATION_UPDATE_INTERVAL_MS;

  diskSaveInterval = setInterval(runDiskSave, DISK_SAVE_INTERVAL_MS);
  workerStatuses.get("DiskSave")!.nextExecution = Date.now() + DISK_SAVE_INTERVAL_MS;

  cleanupInterval = setInterval(runCleanup, 60 * 60 * 1000);
  workerStatuses.get("Cleanup")!.nextExecution = Date.now() + 60 * 60 * 1000;

  workerStatuses.get("PostgresSync")!.nextExecution = Date.now() + PG_SYNC_INTERVAL_MS;

  isActive = true;
  logger.info('error-brain', 'startup', 'All Error Brain workers started');
}

/**
 * Stop all Error Brain workers.
 */
export async function stopWorkers(): Promise<void> {
  if (!isActive) {
    logger.debug('error-brain', 'shutdown', 'Workers not running');
    return;
  }

  logger.info('error-brain', 'shutdown', 'Stopping Error Brain workers');
  isActive = false;

  // Clear all intervals
  if (cacheRefreshInterval) { clearInterval(cacheRefreshInterval); cacheRefreshInterval = null; }
  if (patternUpdateInterval) { clearInterval(patternUpdateInterval); patternUpdateInterval = null; }
  if (correlationHarvestInterval) { clearInterval(correlationHarvestInterval); correlationHarvestInterval = null; }
  if (diskSaveInterval) { clearInterval(diskSaveInterval); diskSaveInterval = null; }
  if (cleanupInterval) { clearInterval(cleanupInterval); cleanupInterval = null; }

  // Final save to disk
  try {
    await saveToDisk();
  } catch (error) {
    logger.error('error-brain', 'shutdown', 'Final disk save failed', { error: { name: 'FinalSaveError', message: String(error) } });
  }

  // Shutdown subsystems
  await shutdownCache();
  await shutdownDb();
  clearAllPatternState();

  startTime = null;
  logger.info('error-brain', 'shutdown', 'All Error Brain workers stopped');
}

/**
 * Check if workers are running.
 */
export function isWorkersRunning(): boolean {
  return isActive;
}

/**
 * Get worker statistics.
 */
export function getWorkerStats(): BrainWorkerStats {
  return {
    isActive,
    startTime,
    uptimeMs: startTime ? Date.now() - startTime : 0,
    workers: Array.from(workerStatuses.values()),
    database: isActive ? getDbStats() : null,
    cache: isActive ? getCacheStats() : null,
    patternDetector: getPatternDetectorStats(),
    impactPredictor: getImpactPredictorStats(),
  };
}

/**
 * Force immediate execution of a specific worker.
 */
export async function runWorkerNow(
  workerName: "CacheRefresh" | "PatternUpdate" | "CorrelationHarvest" | "DiskSave" | "Cleanup" | "PostgresSync"
): Promise<void> {
  switch (workerName) {
    case "CacheRefresh": await runCacheRefresh(); break;
    case "PatternUpdate": await runPatternUpdate(); break;
    case "CorrelationHarvest": await runCorrelationHarvest(); break;
    case "DiskSave": await runDiskSave(); break;
    case "Cleanup": await runCleanup(); break;
    case "PostgresSync": await syncWithPostgres(); break;
    default: logger.warn('error-brain', 'run-worker', `Unknown worker: ${workerName}`);
  }
}

// ==================== LEARNING API ====================

/**
 * Record a recovery outcome for learning.
 */
export async function recordRecoveryOutcome(
  fingerprint: string,
  strategy: string,
  wasSuccessful: boolean,
  durationMs?: number
): Promise<void> {
  dbRecordRecoveryOutcome(fingerprint, strategy, wasSuccessful, durationMs);
}

/**
 * Update baseline metrics for anomaly detection.
 */
export async function updateBaseline(
  metricName: string,
  windowMinutes: number,
  value: number
): Promise<void> {
  upsertBaseline(metricName, windowMinutes, value);
}

/**
 * Update impact weight for a fingerprint.
 */
export async function updateImpactWeight(
  fingerprint: string,
  category: string,
  severity: string,
  userImpact: number,
  featureCount: number
): Promise<void> {
  upsertImpactWeight(fingerprint, category, severity, userImpact, featureCount);
}


