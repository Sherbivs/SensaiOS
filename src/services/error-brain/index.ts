/**
 * Error Brain — Local Intelligence System for Error Detection and Learning
 * 
 * Barrel export for all Error Brain components.
 * 
 * Usage:
 * ```typescript
 * import * as ErrorBrain from '../services/error-brain/index.js';
 * 
 * // Initialize with workers at startup
 * await ErrorBrain.initializeWithWorkers();
 * 
 * // Real-time detection during error capture
 * const anomaly = ErrorBrain.detectTimeAnomaly(fingerprint, currentCount);
 * const cascade = ErrorBrain.predictCascade(fingerprint);
 * const impact = ErrorBrain.assessImpact({ fingerprint, severity: 3, errorCount: 10 });
 * const recovery = ErrorBrain.recommendRecovery(fingerprint);
 * 
 * // Record events for pattern learning
 * ErrorBrain.recordError({ fingerprint, timestamp: Date.now(), severity: 3 });
 * ErrorBrain.recordRecoveryOutcome(fingerprint, 'RETRY', true, 150);
 * 
 * // Graceful shutdown
 * await ErrorBrain.shutdownWithWorkers();
 * ```
 * 
 * @module services/error-brain
 */

// Re-export database types
export type {
  TimePatternEntry,
  CorrelationEntry,
  CascadeEntry,
  RecoveryWeightEntry,
  ImpactWeightEntry,
  BaselineEntry,
  ErrorBrainDbStats,
} from './error-brain-db.js';

// Re-export cache types
export type {
  BrainCacheStats,
  AnomalyResult,
  CascadePrediction,
  RecoveryRecommendation,
  ImpactPrediction,
} from './error-brain-cache.js';

// Re-export pattern detector types
export type {
  ErrorEvent,
  CorrelationResult,
  BurstResult,
  RootCauseResult,
} from './pattern-detector.js';

// Re-export impact predictor types
export type {
  ErrorContext,
  ImpactAssessment,
  ImpactFactor,
  ServiceHealth,
  ImpactForecast,
} from './impact-predictor.js';

// Re-export worker types
export type {
  WorkerStatus,
  BrainWorkerStats,
  LearningUpdate,
} from './error-brain-worker.js';

// Re-export database functions (for advanced use)
export * as db from './error-brain-db.js';

// Re-export cache functions (for advanced use)
export * as cache from './error-brain-cache.js';

// Re-export pattern detector functions (for advanced use)
export * as patterns from './pattern-detector.js';

// Re-export impact predictor functions (for advanced use)
export * as impact from './impact-predictor.js';

// Re-export worker functions (for advanced use)
export * as workers from './error-brain-worker.js';

// Import for facade functions
import * as ErrorBrainDb from './error-brain-db.js';
import * as ErrorBrainCache from './error-brain-cache.js';
import * as PatternDetector from './pattern-detector.js';
import * as ImpactPredictor from './impact-predictor.js';
import * as ErrorBrainWorker from './error-brain-worker.js';

// LOGGER — After barrel re-exports, early in facade implementation
import { getLogger } from '../../shared/logging/index.js';
const logger = getLogger();

// ============================================================================
// Facade API — Simplified Interface
// ============================================================================

/**
 * Initialize Error Brain (database + cache only)
 * Use initializeWithWorkers() for full initialization with background learning
 */
export async function initialize(): Promise<void> {
  logger.info('error-brain', 'init', 'Initializing Error Brain system');
  
  // Verify DB separation before initializing to avoid accidental collisions
  try {
    const dbVerify = await import('./db-verify.js');
    dbVerify.ensureDistinctOrThrow();
  } catch (err) {
    logger.error('error-brain', 'init', 'DB verification failed during initialize', { error: { name: 'VerifyError', message: String(err) } });
    throw err;
  }

  // Database initializes first, then cache loads from it
  await ErrorBrainCache.initialize();
  
  logger.info('error-brain', 'init', 'Error Brain system initialized');
}

/**
 * Initialize Error Brain with background workers
 * Full initialization with continuous learning
 */
export async function initializeWithWorkers(): Promise<void> {
  logger.info('error-brain', 'init', 'Initializing Error Brain system with workers');
  
  // Verify DB separation before starting workers
  try {
    const dbVerify = await import('./db-verify.js');
    dbVerify.ensureDistinctOrThrow();
  } catch (err) {
    logger.error('error-brain', 'init', 'DB verification failed during initializeWithWorkers', { error: { name: 'VerifyError', message: String(err) } });
    throw err;
  }

  await ErrorBrainWorker.startWorkers();
  
  logger.info('error-brain', 'init', 'Error Brain system initialized with workers');
}

/**
 * Shutdown Error Brain gracefully (database + cache only)
 */
export async function shutdown(): Promise<void> {
  logger.info('error-brain', 'shutdown', 'Shutting down Error Brain system');
  
  await ErrorBrainCache.shutdown();
  
  logger.info('error-brain', 'shutdown', 'Error Brain system shutdown complete');
}

/**
 * Shutdown Error Brain with workers gracefully
 */
export async function shutdownWithWorkers(): Promise<void> {
  logger.info('error-brain', 'shutdown', 'Shutting down Error Brain system with workers');
  
  await ErrorBrainWorker.stopWorkers();
  
  logger.info('error-brain', 'shutdown', 'Error Brain system with workers shutdown complete');
}

/**
 * Detect if current error count is anomalous
 * Synchronous, <1μs latency
 */
export function detectTimeAnomaly(
  fingerprint: string, 
  currentCount: number
): ErrorBrainCache.AnomalyResult {
  return ErrorBrainCache.detectTimeAnomaly(fingerprint, currentCount);
}

/**
 * Predict cascade from a root error
 * Synchronous, <10μs latency
 */
export function predictCascade(
  fingerprint: string
): ErrorBrainCache.CascadePrediction | null {
  return ErrorBrainCache.predictCascade(fingerprint);
}

/**
 * Get recovery recommendation
 * Synchronous, <1μs latency
 */
export function recommendRecovery(
  fingerprint: string
): ErrorBrainCache.RecoveryRecommendation | null {
  return ErrorBrainCache.recommendRecovery(fingerprint);
}

/**
 * Predict user impact
 * Synchronous, <1μs latency
 */
export function predictImpact(
  fingerprint: string, 
  activeUserCount?: number
): ErrorBrainCache.ImpactPrediction | null {
  return ErrorBrainCache.predictImpact(fingerprint, activeUserCount);
}

/**
 * Record recovery outcome for learning
 */
export function recordRecoveryOutcome(
  fingerprint: string,
  strategy: string,
  success: boolean,
  recoveryTimeMs?: number
): void {
  ErrorBrainDb.recordRecoveryOutcome(fingerprint, strategy, success, recoveryTimeMs);
}

/**
 * Update time pattern (for learning)
 */
export function updateTimePattern(
  hour: number,
  avgCount: number,
  stdDev: number,
  fingerprint?: string | null,
  dayOfWeek?: number | null
): void {
  ErrorBrainDb.upsertTimePattern(hour, avgCount, stdDev, fingerprint, dayOfWeek);
}

/**
 * Update correlation (for learning)
 */
export function updateCorrelation(
  primaryFingerprint: string,
  secondaryFingerprint: string,
  correlationStrength: number,
  avgTimeDeltaMs: number
): void {
  ErrorBrainDb.upsertCorrelation(
    primaryFingerprint, 
    secondaryFingerprint, 
    correlationStrength, 
    avgTimeDeltaMs
  );
}

/**
 * Update cascade (for learning)
 */
export function updateCascade(
  rootFingerprint: string,
  childFingerprints: string[],
  cascadeDepth: number,
  avgSpreadTimeMs: number,
  totalImpact: number
): void {
  ErrorBrainDb.upsertCascade(
    rootFingerprint, 
    childFingerprints, 
    cascadeDepth, 
    avgSpreadTimeMs, 
    totalImpact
  );
}

/**
 * Update impact weight (for learning)
 */
export function updateImpactWeight(
  fingerprint: string,
  category: string,
  severity: string,
  userImpact: number,
  featureCount: number
): void {
  ErrorBrainDb.upsertImpactWeight(fingerprint, category, severity, userImpact, featureCount);
}

/**
 * Update baseline metric
 */
export function updateBaseline(
  metricName: string,
  windowMinutes: number,
  value: number
): void {
  ErrorBrainDb.upsertBaseline(metricName, windowMinutes, value);
}

/**
 * Refresh cache from database
 */
export async function refreshCache(): Promise<void> {
  await ErrorBrainCache.refreshFromDb();
}

/**
 * Save database to disk
 */
export async function saveToDisk(): Promise<void> {
  await ErrorBrainDb.saveToDisk();
}

/**
 * Prune old patterns
 */
export function pruneStalePatterns(): number {
  return ErrorBrainDb.pruneStalePatterns();
}

/**
 * Get database statistics
 */
export function getDbStats(): ErrorBrainDb.ErrorBrainDbStats {
  return ErrorBrainDb.getStats();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): ErrorBrainCache.BrainCacheStats {
  return ErrorBrainCache.getStats();
}

/**
 * Get combined statistics
 */
export function getStats(): {
  db: ErrorBrainDb.ErrorBrainDbStats;
  cache: ErrorBrainCache.BrainCacheStats;
} {
  return {
    db: ErrorBrainDb.getStats(),
    cache: ErrorBrainCache.getStats(),
  };
}

// ============================================================================
// Convenience Getters (Synchronous)
// ============================================================================

/**
 * Get time patterns for fingerprint
 */
export function getTimePatterns(fingerprint: string) {
  return ErrorBrainCache.getTimePatterns(fingerprint);
}

/**
 * Get correlations for fingerprint
 */
export function getCorrelations(fingerprint: string) {
  return ErrorBrainCache.getCorrelations(fingerprint);
}

/**
 * Get cascade for fingerprint
 */
export function getCascade(fingerprint: string) {
  return ErrorBrainCache.getCascade(fingerprint);
}

/**
 * Get recovery weights for fingerprint
 */
export function getRecoveryWeights(fingerprint: string) {
  return ErrorBrainCache.getRecoveryWeights(fingerprint);
}

/**
 * Get impact weight for fingerprint
 */
export function getImpactWeight(fingerprint: string) {
  return ErrorBrainCache.getImpactWeight(fingerprint);
}

/**
 * Get baseline for metric
 */
export function getBaseline(metricName: string, windowMinutes: number) {
  return ErrorBrainCache.getBaseline(metricName, windowMinutes);
}

// ============================================================================
// Pattern Detector Facade (Real-time Analysis)
// ============================================================================

/**
 * Record an error event for pattern learning
 * Updates burst detection, correlation analysis, and cascade tracking
 */
export function recordError(event: PatternDetector.ErrorEvent): void {
  PatternDetector.recordErrorForCorrelation(event);
  PatternDetector.recordErrorForCascade(event);
}

/**
 * Detect error bursts (5x baseline rate)
 */
export function detectBurst(event: PatternDetector.ErrorEvent): PatternDetector.BurstResult {
  return PatternDetector.detectBurst(event);
}

/**
 * Detect global error rate anomaly
 */
export function detectGlobalAnomaly(currentErrorRate: number): ErrorBrainCache.AnomalyResult {
  return PatternDetector.detectGlobalAnomaly(currentErrorRate);
}

/**
 * Get significant correlations for a fingerprint
 */
export function getSignificantCorrelations(fingerprint: string): PatternDetector.CorrelationResult[] {
  return PatternDetector.getSignificantCorrelations(fingerprint);
}

/**
 * Analyze root cause of an error
 */
export function analyzeRootCause(fingerprint: string): PatternDetector.RootCauseResult | null {
  return PatternDetector.analyzeRootCause(fingerprint);
}

/**
 * Get pattern detector statistics
 */
export function getPatternDetectorStats() {
  return PatternDetector.getPatternDetectorStats();
}

// ============================================================================
// Impact Predictor Facade (Impact Analysis)
// ============================================================================

/**
 * Assess comprehensive impact for an error
 */
export function assessImpact(context: ImpactPredictor.ErrorContext): ImpactPredictor.ImpactAssessment {
  return ImpactPredictor.assessImpact(context);
}

/**
 * Update service health tracking
 */
export function updateServiceHealth(
  service: string,
  errorCount: number,
  alertCount?: number
): ImpactPredictor.ServiceHealth {
  return ImpactPredictor.updateServiceHealth(service, errorCount, alertCount);
}

/**
 * Get service health status
 */
export function getServiceHealth(service: string): ImpactPredictor.ServiceHealth | null {
  return ImpactPredictor.getServiceHealth(service);
}

/**
 * Get all service health statuses
 */
export function getAllServiceHealth(): ImpactPredictor.ServiceHealth[] {
  return ImpactPredictor.getAllServiceHealth();
}

/**
 * Get system-wide health score
 */
export function getSystemHealthScore(): number {
  return ImpactPredictor.getSystemHealthScore();
}

/**
 * Forecast future impact
 */
export function forecastImpact(
  fingerprint: string,
  horizonMinutes: number,
  activeUsers: number
): ImpactPredictor.ImpactForecast {
  return ImpactPredictor.forecastImpact(fingerprint, horizonMinutes, activeUsers);
}

/**
 * Record error count for trend analysis
 */
export function recordErrorCount(fingerprint: string, count: number): void {
  ImpactPredictor.recordErrorCount(fingerprint, count);
}

/**
 * Get impact predictor statistics
 */
export function getImpactPredictorStats() {
  return ImpactPredictor.getImpactPredictorStats();
}

// ============================================================================
// Worker Control Facade
// ============================================================================

/**
 * Check if workers are running
 */
export function isWorkersRunning(): boolean {
  return ErrorBrainWorker.isWorkersRunning();
}

/**
 * Get worker statistics
 */
export function getWorkerStats(): ErrorBrainWorker.BrainWorkerStats {
  return ErrorBrainWorker.getWorkerStats();
}

/**
 * Force immediate execution of a specific worker
 */
export async function runWorkerNow(
  workerName: 'CacheRefresh' | 'PatternUpdate' | 'CorrelationHarvest' | 'DiskSave' | 'Cleanup' | 'PostgresSync'
): Promise<void> {
  return ErrorBrainWorker.runWorkerNow(workerName);
}

/**
 * Apply learning updates from external source (e.g., PostgreSQL)
 */
export async function applyLearningUpdates(updates: ErrorBrainWorker.LearningUpdate): Promise<void> {
  return ErrorBrainWorker.applyLearningUpdates(updates);
}

// ============================================================================
// Combined Statistics
// ============================================================================

/**
 * Get comprehensive Error Brain statistics
 */
export function getComprehensiveStats() {
  return {
    db: ErrorBrainDb.getStats(),
    cache: ErrorBrainCache.getStats(),
    patternDetector: PatternDetector.getPatternDetectorStats(),
    impactPredictor: ImpactPredictor.getImpactPredictorStats(),
    workers: ErrorBrainWorker.isWorkersRunning() ? ErrorBrainWorker.getWorkerStats() : null,
    systemHealth: ImpactPredictor.getSystemHealthScore(),
  };
}

/**
 * Diagnostic: verify DB separation and return any conflict messages
 */
export function diagnoseDbSeparation(): string[] {
  // Synchronous call - db-verify module uses only config values, no async needed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const verify = require('./db-verify.js') as { verifyDistinctDatabases: () => string[] };
    return verify.verifyDistinctDatabases();
  } catch (err) {
    logger.error('error-brain', 'diagnose', 'diagnoseDbSeparation failed', { error: { name: 'DiagnoseError', message: String(err) } });
    return [String(err)];
  }
}
