/**
 * Error Brain L1 Cache — In-Memory Pattern Cache for Ultra-Fast Lookups
 * 
 * Purpose:
 * - Provide <1μs pattern lookups during error capture (Map-based)
 * - Cache hot patterns from SQLite for real-time detection
 * - Maintain bounded memory (2 MB max) with LRU eviction
 * - Background refresh from SQLite every 5 minutes
 * 
 * Architecture:
 * - L1 Cache (this): In-memory Maps, synchronous reads, <1μs latency
 * - L2 Cache: SQLite (error-brain-db), persistent storage, ~10ms latency
 * - L3 Cache: PostgreSQL (ErrorKnowledge), single source of truth
 * 
 * Key Features:
 * - Pre-loaded at startup (blocking initialization)
 * - Synchronous getters (no async/await, error capture stays fast)
 * - Background refresh (5-minute intervals, non-blocking)
 * - LRU eviction (oldest accessed patterns evicted when full)
 * - Memory monitoring (tracks approximate size)
 * 
 * Referenced By: src/services/error-brain/pattern-detector.ts,
 *                src/services/error-brain/impact-predictor.ts,
 *                src/workers/error-brain-worker.ts,
 *                docs/projects/error-brain-architecture.md
 * 
 * @module services/error-brain/error-brain-cache
 */

import { ErrorBrainConfig } from '../../config/error-brain-config.js';
import { getLogger } from '../../shared/logging/index.js';
import * as ErrorBrainDb from './error-brain-db.js';

const logger = getLogger();
import type {
  TimePatternEntry,
  CorrelationEntry,
  CascadeEntry,
  RecoveryWeightEntry,
  ImpactWeightEntry,
  BaselineEntry,
} from './error-brain-db.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * LRU cache entry wrapper
 */
interface LruEntry<T> {
  data: T;
  lastAccessed: number;
  sizeBytes: number;
}

/**
 * Cache statistics
 */
export interface BrainCacheStats {
  timePatternCount: number;
  correlationCount: number;
  cascadeCount: number;
  recoveryWeightCount: number;
  impactWeightCount: number;
  baselineCount: number;
  globalTimePatternCount: number;
  totalEntries: number;
  estimatedSizeBytes: number;
  maxSizeBytes: number;
  utilizationPercent: number;
  lastRefresh: Date | null;
  isInitialized: boolean;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

/**
 * Anomaly detection result
 */
export interface AnomalyResult {
  isAnomalous: boolean;
  zScore: number;
  expectedCount: number;
  actualCount: number;
  threshold: number;
  confidence: number;
}

/**
 * Cascade prediction result
 */
export interface CascadePrediction {
  rootFingerprint: string;
  predictedChildren: string[];
  probability: number;
  expectedTimeMs: number;
  totalImpact: number;
  recommendation: 'BLOCK' | 'WARN' | 'MONITOR' | 'IGNORE';
}

/**
 * Recovery recommendation result
 */
export interface RecoveryRecommendation {
  fingerprint: string;
  strategy: string;
  effectivenessScore: number;
  expectedTimeMs: number | null;
  confidence: number;
  alternatives: Array<{
    strategy: string;
    effectivenessScore: number;
  }>;
}

/**
 * Impact prediction result
 */
export interface ImpactPrediction {
  fingerprint: string;
  estimatedUsers: number;
  estimatedFeatures: number;
  category: string;
  severity: string;
  confidence: number;
  recommendation: 'ALERT' | 'WARN' | 'LOG';
}

// ============================================================================
// Cache State
// ============================================================================

// Pattern caches (fingerprint → patterns)
const timePatternCache = new Map<string, LruEntry<TimePatternEntry[]>>();
const correlationCache = new Map<string, LruEntry<CorrelationEntry[]>>();
const cascadeCache = new Map<string, LruEntry<CascadeEntry>>();
const recoveryWeightCache = new Map<string, LruEntry<RecoveryWeightEntry[]>>();
const impactWeightCache = new Map<string, LruEntry<ImpactWeightEntry>>();

// Global patterns (not fingerprint-specific)
let globalTimePatterns: TimePatternEntry[] = [];
let baselines = new Map<string, BaselineEntry>();

// Cache metadata
let isInitialized = false;
let lastRefresh: Date | null = null;
let estimatedSizeBytes = 0;
let refreshInterval: NodeJS.Timeout | null = null;

// Performance metrics
let hitCount = 0;
let missCount = 0;

// Size estimates (bytes per entry type)
const SIZE_ESTIMATES = {
  timePattern: 200,
  correlation: 150,
  cascade: 500,
  recoveryWeight: 100,
  impactWeight: 100,
  baseline: 80,
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize L1 cache from SQLite (BLOCKING startup operation)
 * 
 * Loads all patterns into memory Maps for synchronous access.
 * Error detection cannot start until this completes.
 */
export async function initialize(): Promise<void> {
  if (isInitialized) {
    return;
  }

  try {
    logger.info('error-brain', 'init', 'Initializing L1 cache');

    // Ensure SQLite is initialized first
    await ErrorBrainDb.initialize();

    // Load all patterns from SQLite
    await refreshFromDb();

    // Start background refresh (if enabled)
    if (ErrorBrainConfig.l1CacheEnabled) {
      startBackgroundRefresh();
    }

    isInitialized = true;

    const stats = getStats();
    logger.info('error-brain', 'init', 'Initialization complete', {
      metadata: {
        totalEntries: stats.totalEntries,
        estimatedSizeMB: (stats.estimatedSizeBytes / (1024 * 1024)).toFixed(2),
        utilizationPercent: stats.utilizationPercent.toFixed(1),
      }
    });
  } catch (error) {
    logger.error('error-brain', 'init', 'Initialization failed', { error: { name: 'InitError', message: String(error) } });
    throw error;
  }
}

/**
 * Refresh cache from SQLite database
 */
export async function refreshFromDb(): Promise<void> {
  const startTime = performance.now();

  try {
    // Clear existing caches
    timePatternCache.clear();
    correlationCache.clear();
    cascadeCache.clear();
    recoveryWeightCache.clear();
    impactWeightCache.clear();
    baselines.clear();
    globalTimePatterns = [];
    estimatedSizeBytes = 0;

    // Load time patterns
    const timePatterns = ErrorBrainDb.getAllTimePatterns();
    for (const pattern of timePatterns) {
      if (pattern.fingerprint === null) {
        globalTimePatterns.push(pattern);
      } else {
        const existing = timePatternCache.get(pattern.fingerprint);
        if (existing) {
          existing.data.push(pattern);
          existing.sizeBytes += SIZE_ESTIMATES.timePattern;
        } else {
          timePatternCache.set(pattern.fingerprint, {
            data: [pattern],
            lastAccessed: Date.now(),
            sizeBytes: SIZE_ESTIMATES.timePattern,
          });
        }
      }
      estimatedSizeBytes += SIZE_ESTIMATES.timePattern;
    }

    // Load correlations
    const correlations = ErrorBrainDb.getAllCorrelations();
    for (const correlation of correlations) {
      const existing = correlationCache.get(correlation.primaryFingerprint);
      if (existing) {
        existing.data.push(correlation);
        existing.sizeBytes += SIZE_ESTIMATES.correlation;
      } else {
        correlationCache.set(correlation.primaryFingerprint, {
          data: [correlation],
          lastAccessed: Date.now(),
          sizeBytes: SIZE_ESTIMATES.correlation,
        });
      }
      estimatedSizeBytes += SIZE_ESTIMATES.correlation;
    }

    // Load cascades
    const cascades = ErrorBrainDb.getAllCascades();
    for (const cascade of cascades) {
      cascadeCache.set(cascade.rootFingerprint, {
        data: cascade,
        lastAccessed: Date.now(),
        sizeBytes: SIZE_ESTIMATES.cascade,
      });
      estimatedSizeBytes += SIZE_ESTIMATES.cascade;
    }

    // Load recovery weights
    const recoveryWeights = ErrorBrainDb.getAllRecoveryWeights();
    for (const weight of recoveryWeights) {
      const existing = recoveryWeightCache.get(weight.fingerprint);
      if (existing) {
        existing.data.push(weight);
        existing.sizeBytes += SIZE_ESTIMATES.recoveryWeight;
      } else {
        recoveryWeightCache.set(weight.fingerprint, {
          data: [weight],
          lastAccessed: Date.now(),
          sizeBytes: SIZE_ESTIMATES.recoveryWeight,
        });
      }
      estimatedSizeBytes += SIZE_ESTIMATES.recoveryWeight;
    }

    // Load impact weights
    const impactWeights = ErrorBrainDb.getAllImpactWeights();
    for (const weight of impactWeights) {
      impactWeightCache.set(weight.fingerprint, {
        data: weight,
        lastAccessed: Date.now(),
        sizeBytes: SIZE_ESTIMATES.impactWeight,
      });
      estimatedSizeBytes += SIZE_ESTIMATES.impactWeight;
    }

    // Load baselines
    const baselineEntries = ErrorBrainDb.getAllBaselines();
    for (const baseline of baselineEntries) {
      const key = `${baseline.metricName}:${baseline.windowMinutes}`;
      baselines.set(key, baseline);
      estimatedSizeBytes += SIZE_ESTIMATES.baseline;
    }

    lastRefresh = new Date();

    const duration = performance.now() - startTime;
    if (ErrorBrainConfig.verboseLogging) {
      logger.debug('error-brain', 'refresh', 'Refresh complete', {
        durationMs: Math.round(duration),
        metadata: {
          timePatterns: timePatterns.length,
          correlations: correlations.length,
          cascades: cascades.length,
          recoveryWeights: recoveryWeights.length,
          impactWeights: impactWeights.length,
          baselines: baselineEntries.length,
        },
      });
    }

    // Check memory limit
    enforceMemoryLimit();
  } catch (error) {
    logger.error('error-brain', 'refresh', 'Refresh failed', { error: { name: 'RefreshError', message: String(error) } });
    throw error;
  }
}

// ============================================================================
// Background Refresh
// ============================================================================

function startBackgroundRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(async () => {
    try {
      await refreshFromDb();
    } catch (error) {
      logger.error('error-brain', 'background-refresh', 'Background refresh failed', { error: { name: 'RefreshError', message: String(error) } });
    }
  }, ErrorBrainConfig.cacheRefreshIntervalMs);
}

function stopBackgroundRefresh(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// ============================================================================
// Memory Management
// ============================================================================

/**
 * Enforce memory limit via LRU eviction
 */
function enforceMemoryLimit(): void {
  const maxBytes = ErrorBrainConfig.l1CacheMaxSizeMB * 1024 * 1024;

  if (estimatedSizeBytes <= maxBytes) {
    return;
  }

  logger.info('error-brain', 'memory', 'Memory limit exceeded, starting LRU eviction', {
    metadata: {
      currentBytes: estimatedSizeBytes,
      maxBytes,
    },
  });

  // Collect all entries with timestamps
  const entries: Array<{ cache: Map<string, LruEntry<unknown>>; key: string; lastAccessed: number; sizeBytes: number }> = [];

  for (const [key, entry] of timePatternCache) {
    entries.push({ cache: timePatternCache as Map<string, LruEntry<unknown>>, key, lastAccessed: entry.lastAccessed, sizeBytes: entry.sizeBytes });
  }
  for (const [key, entry] of correlationCache) {
    entries.push({ cache: correlationCache as Map<string, LruEntry<unknown>>, key, lastAccessed: entry.lastAccessed, sizeBytes: entry.sizeBytes });
  }
  for (const [key, entry] of cascadeCache) {
    entries.push({ cache: cascadeCache as Map<string, LruEntry<unknown>>, key, lastAccessed: entry.lastAccessed, sizeBytes: entry.sizeBytes });
  }
  for (const [key, entry] of recoveryWeightCache) {
    entries.push({ cache: recoveryWeightCache as Map<string, LruEntry<unknown>>, key, lastAccessed: entry.lastAccessed, sizeBytes: entry.sizeBytes });
  }
  for (const [key, entry] of impactWeightCache) {
    entries.push({ cache: impactWeightCache as Map<string, LruEntry<unknown>>, key, lastAccessed: entry.lastAccessed, sizeBytes: entry.sizeBytes });
  }

  // Sort by last accessed (oldest first)
  entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

  // Evict until under limit
  let evicted = 0;
  while (estimatedSizeBytes > maxBytes && entries.length > 0) {
    const oldest = entries.shift()!;
    oldest.cache.delete(oldest.key);
    estimatedSizeBytes -= oldest.sizeBytes;
    evicted++;
  }

  logger.info('error-brain', 'memory', 'LRU eviction complete', {
    metadata: {
      evicted,
      newSizeBytes: estimatedSizeBytes,
    },
  });
}

// ============================================================================
// Synchronous Getters (Used During Error Capture)
// ============================================================================

/**
 * Get time patterns for a fingerprint (synchronous, <1μs)
 */
export function getTimePatterns(fingerprint: string): TimePatternEntry[] {
  const entry = timePatternCache.get(fingerprint);
  
  if (entry) {
    entry.lastAccessed = Date.now();
    hitCount++;
    return entry.data;
  }

  missCount++;
  return [];
}

/**
 * Get global time patterns (not fingerprint-specific)
 */
export function getGlobalTimePatterns(): TimePatternEntry[] {
  return globalTimePatterns;
}

/**
 * Get time pattern for a specific hour (synchronous)
 */
export function getTimePatternForHour(fingerprint: string, hour: number): TimePatternEntry | null {
  const patterns = getTimePatterns(fingerprint);
  const match = patterns.find(p => p.hour === hour);
  
  if (match) return match;
  
  // Fallback to global pattern
  return globalTimePatterns.find(p => p.hour === hour) ?? null;
}

/**
 * Get correlations for a fingerprint (synchronous, <1μs)
 */
export function getCorrelations(fingerprint: string): CorrelationEntry[] {
  const entry = correlationCache.get(fingerprint);
  
  if (entry) {
    entry.lastAccessed = Date.now();
    hitCount++;
    return entry.data;
  }

  missCount++;
  return [];
}

/**
 * Get cascade for a fingerprint (synchronous, <1μs)
 */
export function getCascade(fingerprint: string): CascadeEntry | null {
  const entry = cascadeCache.get(fingerprint);
  
  if (entry) {
    entry.lastAccessed = Date.now();
    hitCount++;
    return entry.data;
  }

  missCount++;
  return null;
}

/**
 * Get recovery weights for a fingerprint (synchronous, <1μs)
 */
export function getRecoveryWeights(fingerprint: string): RecoveryWeightEntry[] {
  const entry = recoveryWeightCache.get(fingerprint);
  
  if (entry) {
    entry.lastAccessed = Date.now();
    hitCount++;
    return entry.data;
  }

  missCount++;
  return [];
}

/**
 * Get impact weight for a fingerprint (synchronous, <1μs)
 */
export function getImpactWeight(fingerprint: string): ImpactWeightEntry | null {
  const entry = impactWeightCache.get(fingerprint);
  
  if (entry) {
    entry.lastAccessed = Date.now();
    hitCount++;
    return entry.data;
  }

  missCount++;
  return null;
}

/**
 * Get baseline for a metric (synchronous, <1μs)
 */
export function getBaseline(metricName: string, windowMinutes: number): BaselineEntry | null {
  const key = `${metricName}:${windowMinutes}`;
  return baselines.get(key) ?? null;
}

// ============================================================================
// High-Level Detection Functions (Synchronous)
// ============================================================================

/**
 * Detect if current error count is anomalous for this hour
 * 
 * @param fingerprint Error fingerprint
 * @param currentCount Current error count this hour
 * @returns Anomaly detection result
 */
export function detectTimeAnomaly(fingerprint: string, currentCount: number): AnomalyResult {
  const hour = new Date().getUTCHours();
  const pattern = getTimePatternForHour(fingerprint, hour);

  if (!pattern || pattern.sampleCount < ErrorBrainConfig.minSamplesForPattern) {
    return {
      isAnomalous: false,
      zScore: 0,
      expectedCount: 0,
      actualCount: currentCount,
      threshold: ErrorBrainConfig.anomalyZScoreThreshold,
      confidence: 0,
    };
  }

  // Calculate Z-score
  const zScore = pattern.stdDev > 0 
    ? (currentCount - pattern.avgCount) / pattern.stdDev 
    : 0;

  const isAnomalous = Math.abs(zScore) > pattern.anomalyThreshold;
  
  // Confidence based on sample count
  const confidence = Math.min(
    0.99,
    pattern.sampleCount / (pattern.sampleCount + ErrorBrainConfig.minObservationsForConfidence)
  );

  return {
    isAnomalous,
    zScore,
    expectedCount: pattern.avgCount,
    actualCount: currentCount,
    threshold: pattern.anomalyThreshold,
    confidence,
  };
}

/**
 * Predict cascade for a fingerprint
 * 
 * @param fingerprint Root error fingerprint
 * @returns Cascade prediction or null if no cascade known
 */
export function predictCascade(fingerprint: string): CascadePrediction | null {
  const cascade = getCascade(fingerprint);

  if (!cascade || cascade.confidence < ErrorBrainConfig.cascadeMinConfidence) {
    return null;
  }

  // Determine recommendation based on confidence and impact
  let recommendation: 'BLOCK' | 'WARN' | 'MONITOR' | 'IGNORE';
  if (cascade.confidence > 0.8 && cascade.totalImpact > 5) {
    recommendation = 'BLOCK';
  } else if (cascade.confidence > 0.6 || cascade.totalImpact > 3) {
    recommendation = 'WARN';
  } else if (cascade.confidence > 0.4) {
    recommendation = 'MONITOR';
  } else {
    recommendation = 'IGNORE';
  }

  return {
    rootFingerprint: fingerprint,
    predictedChildren: cascade.childFingerprints,
    probability: cascade.confidence,
    expectedTimeMs: cascade.avgSpreadTimeMs,
    totalImpact: cascade.totalImpact,
    recommendation,
  };
}

/**
 * Get recovery recommendation for a fingerprint
 * 
 * @param fingerprint Error fingerprint
 * @returns Recovery recommendation or null if no strategies known
 */
export function recommendRecovery(fingerprint: string): RecoveryRecommendation | null {
  const weights = getRecoveryWeights(fingerprint);

  if (weights.length === 0) {
    return null;
  }

  // Sort by effectiveness
  const sorted = [...weights].sort((a, b) => b.effectivenessScore - a.effectivenessScore);
  const best = sorted[0];

  // Calculate confidence based on total attempts
  const totalAttempts = best.successCount + best.failureCount;
  const confidence = Math.min(
    0.99,
    totalAttempts / (totalAttempts + ErrorBrainConfig.minObservationsForConfidence)
  );

  return {
    fingerprint,
    strategy: best.strategy,
    effectivenessScore: best.effectivenessScore,
    expectedTimeMs: best.avgRecoveryTimeMs,
    confidence,
    alternatives: sorted.slice(1, 4).map(w => ({
      strategy: w.strategy,
      effectivenessScore: w.effectivenessScore,
    })),
  };
}

/**
 * Predict impact for a fingerprint
 * 
 * @param fingerprint Error fingerprint
 * @param activeUserCount Current active user count (for scaling)
 * @returns Impact prediction or null if no data
 */
export function predictImpact(fingerprint: string, activeUserCount: number = 1): ImpactPrediction | null {
  const weight = getImpactWeight(fingerprint);

  if (!weight || weight.confidence < ErrorBrainConfig.impactMinConfidence) {
    return null;
  }

  // Scale user impact by current active users
  const estimatedUsers = Math.round(weight.avgUserImpact * activeUserCount);

  // Determine recommendation
  let recommendation: 'ALERT' | 'WARN' | 'LOG';
  if (estimatedUsers > 10 || weight.severity === 'CRITICAL') {
    recommendation = 'ALERT';
  } else if (estimatedUsers > 1 || weight.severity === 'HIGH') {
    recommendation = 'WARN';
  } else {
    recommendation = 'LOG';
  }

  return {
    fingerprint,
    estimatedUsers,
    estimatedFeatures: Math.round(weight.avgFeatureCount),
    category: weight.category,
    severity: weight.severity,
    confidence: weight.confidence,
    recommendation,
  };
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Get cache statistics
 */
export function getStats(): BrainCacheStats {
  const maxBytes = ErrorBrainConfig.l1CacheMaxSizeMB * 1024 * 1024;
  const totalHits = hitCount + missCount;

  return {
    timePatternCount: timePatternCache.size,
    correlationCount: correlationCache.size,
    cascadeCount: cascadeCache.size,
    recoveryWeightCount: recoveryWeightCache.size,
    impactWeightCount: impactWeightCache.size,
    baselineCount: baselines.size,
    globalTimePatternCount: globalTimePatterns.length,
    totalEntries: timePatternCache.size + correlationCache.size + cascadeCache.size + 
                  recoveryWeightCache.size + impactWeightCache.size + baselines.size,
    estimatedSizeBytes,
    maxSizeBytes: maxBytes,
    utilizationPercent: (estimatedSizeBytes / maxBytes) * 100,
    lastRefresh,
    isInitialized,
    hitCount,
    missCount,
    hitRate: totalHits > 0 ? hitCount / totalHits : 0,
  };
}

/**
 * Reset performance metrics (for testing)
 */
export function resetMetrics(): void {
  hitCount = 0;
  missCount = 0;
}

// ============================================================================
// Shutdown
// ============================================================================

/**
 * Graceful shutdown
 */
export async function shutdown(): Promise<void> {
  if (!isInitialized) return;

  logger.info('error-brain', 'shutdown', 'Shutting down cache');

  stopBackgroundRefresh();

  // Clear caches
  timePatternCache.clear();
  correlationCache.clear();
  cascadeCache.clear();
  recoveryWeightCache.clear();
  impactWeightCache.clear();
  baselines.clear();
  globalTimePatterns = [];

  estimatedSizeBytes = 0;
  isInitialized = false;
  lastRefresh = null;

  // Shutdown underlying database
  await ErrorBrainDb.shutdown();

  logger.info('error-brain', 'shutdown', 'Cache shutdown complete');
}

// ============================================================================
// Hot Update (for real-time learning without full refresh)
// ============================================================================

/**
 * Hot-update a time pattern in cache
 */
export function hotUpdateTimePattern(pattern: TimePatternEntry): void {
  if (pattern.fingerprint === null) {
    const idx = globalTimePatterns.findIndex(p => p.hour === pattern.hour);
    if (idx >= 0) {
      globalTimePatterns[idx] = pattern;
    } else {
      globalTimePatterns.push(pattern);
      estimatedSizeBytes += SIZE_ESTIMATES.timePattern;
    }
  } else {
    const entry = timePatternCache.get(pattern.fingerprint);
    if (entry) {
      const idx = entry.data.findIndex(p => p.hour === pattern.hour);
      if (idx >= 0) {
        entry.data[idx] = pattern;
      } else {
        entry.data.push(pattern);
        entry.sizeBytes += SIZE_ESTIMATES.timePattern;
        estimatedSizeBytes += SIZE_ESTIMATES.timePattern;
      }
      entry.lastAccessed = Date.now();
    } else {
      timePatternCache.set(pattern.fingerprint, {
        data: [pattern],
        lastAccessed: Date.now(),
        sizeBytes: SIZE_ESTIMATES.timePattern,
      });
      estimatedSizeBytes += SIZE_ESTIMATES.timePattern;
    }
  }

  enforceMemoryLimit();
}

/**
 * Hot-update a cascade in cache
 */
export function hotUpdateCascade(cascade: CascadeEntry): void {
  const existing = cascadeCache.get(cascade.rootFingerprint);
  
  if (existing) {
    existing.data = cascade;
    existing.lastAccessed = Date.now();
  } else {
    cascadeCache.set(cascade.rootFingerprint, {
      data: cascade,
      lastAccessed: Date.now(),
      sizeBytes: SIZE_ESTIMATES.cascade,
    });
    estimatedSizeBytes += SIZE_ESTIMATES.cascade;
  }

  enforceMemoryLimit();
}

/**
 * Hot-update an impact weight in cache
 */
export function hotUpdateImpactWeight(weight: ImpactWeightEntry): void {
  const existing = impactWeightCache.get(weight.fingerprint);
  
  if (existing) {
    existing.data = weight;
    existing.lastAccessed = Date.now();
  } else {
    impactWeightCache.set(weight.fingerprint, {
      data: weight,
      lastAccessed: Date.now(),
      sizeBytes: SIZE_ESTIMATES.impactWeight,
    });
    estimatedSizeBytes += SIZE_ESTIMATES.impactWeight;
  }

  enforceMemoryLimit();
}

// ============================================================================
// Export for Testing
// ============================================================================

export const _testing = {
  isInitialized: () => isInitialized,
  getEstimatedSizeBytes: () => estimatedSizeBytes,
  getCacheSize: () => ({
    timePatterns: timePatternCache.size,
    correlations: correlationCache.size,
    cascades: cascadeCache.size,
    recoveryWeights: recoveryWeightCache.size,
    impactWeights: impactWeightCache.size,
    baselines: baselines.size,
  }),
};
