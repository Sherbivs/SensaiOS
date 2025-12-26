/**
 * Error Brain — Pattern Detector
 *
 * Real-time error pattern detection algorithms:
 * - Time-based anomaly detection (Z-score analysis)
 * - Correlation detection (co-occurrence analysis)
 * - Cascade prediction (root cause → downstream)
 * - Temporal clustering (error bursts)
 *
 * All algorithms are designed for O(1) or O(log n) performance
 * using pre-computed data from the L1 cache.
 *
 * @module error-brain/pattern-detector
 */

// KERNEL FIRST — Must be first import to monitor other system initialization
import {
  createIntelligenceHook,
  type IntelligenceHook,
} from "../../kernel/kernel-hooks.js";

import { ErrorBrainConfig } from "../../config/error-brain-config.js";
import {
  detectTimeAnomaly as cacheDetectTimeAnomaly,
  predictCascade as cachePredictCascade,
  getTimePatterns,
  getCorrelations,
  getCascade,
  getBaseline,
  type AnomalyResult,
  type CascadePrediction,
} from "./error-brain-cache.js";

// ==================== KERNEL INTEGRATION ====================

/** Lazy-initialized kernel hook for pattern detector */
let kernelHook: IntelligenceHook | null = null;

/**
 * Get or create kernel hook for pattern detector observability.
 * Uses lazy initialization to avoid startup dependencies.
 */
function getPatternDetectorHook(): IntelligenceHook | null {
  if (!kernelHook) {
    try {
      kernelHook = createIntelligenceHook("pattern-detector");
    } catch {
      // Kernel not available, silently skip
    }
  }
  return kernelHook;
}

// ==================== TYPES ====================

/**
 * Error event for pattern detection input.
 */
export interface ErrorEvent {
  /** Unique fingerprint for error type */
  fingerprint: string;
  /** Unix timestamp (ms) */
  timestamp: number;
  /** Error severity (1-5) */
  severity: number;
  /** Optional correlation ID for request tracing */
  correlationId?: string;
  /** Optional user ID for impact tracking */
  userId?: string;
  /** Optional component source */
  component?: string;
}

/**
 * Result from correlation analysis.
 */
export interface CorrelationResult {
  /** Primary error fingerprint */
  primaryFingerprint: string;
  /** Secondary error fingerprint */
  secondaryFingerprint: string;
  /** Correlation strength (0-1) */
  strength: number;
  /** Number of co-occurrences observed */
  coOccurrences: number;
  /** Time window (seconds) within which they co-occur */
  timeWindow: number;
  /** Whether this is a significant correlation */
  isSignificant: boolean;
}

/**
 * Result from temporal burst detection.
 */
export interface BurstResult {
  /** Error fingerprint */
  fingerprint: string;
  /** Whether a burst is detected */
  isBurst: boolean;
  /** Events per second during burst */
  eventsPerSecond: number;
  /** Baseline events per second */
  baselineEventsPerSecond: number;
  /** Burst multiplier (actual / baseline) */
  burstMultiplier: number;
  /** Recommended action */
  recommendation: "IGNORE" | "LOG" | "WARN" | "ALERT" | "CRITICAL";
}

/**
 * Result from root cause analysis.
 */
export interface RootCauseResult {
  /** The likely root cause fingerprint */
  rootCauseFingerprint: string;
  /** Confidence in root cause (0-1) */
  confidence: number;
  /** Chain of errors from root to current */
  errorChain: string[];
  /** Time delta from root to current (ms) */
  timeDelta: number;
  /** Evidence for this root cause */
  evidence: string[];
}

/**
 * Sliding window for rate tracking.
 */
interface SlidingWindow {
  /** Timestamps of events in window */
  timestamps: number[];
  /** Total count in current window */
  count: number;
  /** Window size in milliseconds */
  windowSizeMs: number;
}

// ==================== STATE ====================

/** Sliding windows for burst detection (per fingerprint) */
const burstWindows: Map<string, SlidingWindow> = new Map();

/** Recent errors for correlation detection (circular buffer) */
const recentErrors: ErrorEvent[] = [];
const MAX_RECENT_ERRORS = 1000;
let recentErrorIndex = 0;

/** Correlation observation counts */
const correlationObservations: Map<string, Map<string, number>> = new Map();

/** Total observations per fingerprint (for correlation calculation) */
const fingerprintObservations: Map<string, number> = new Map();

/** Potential cascades in progress */
const activeCascades: Map<
  string,
  {
    rootFingerprint: string;
    childFingerprints: Set<string>;
    startTime: number;
    lastUpdate: number;
  }
> = new Map();

// ==================== CONFIGURATION ====================

const ANOMALY_ZSCORE_THRESHOLD = ErrorBrainConfig.anomalyZScoreThreshold;
const CORRELATION_MIN_STRENGTH = ErrorBrainConfig.correlationMinStrength;
const CASCADE_TIME_WINDOW_MS = ErrorBrainConfig.correlationWindowMs; // Reuse correlation window
const DEFAULT_WINDOW_MINUTES = 60; // Default window for baseline queries

const BURST_WINDOW_MS = 10_000; // 10 second sliding window
const BURST_THRESHOLD_MULTIPLIER = 5; // 5x baseline = burst
const CORRELATION_WINDOW_MS = 5_000; // 5 second co-occurrence window
const MIN_OBSERVATIONS_FOR_CORRELATION = 10;

// ==================== ANOMALY DETECTION ====================

/**
 * Detect time-based anomalies using Z-score analysis.
 * Compares current error rate against learned hourly baseline.
 *
 * @param fingerprint - Error fingerprint to check
 * @param currentCount - Current count of this error in current hour
 * @returns Anomaly detection result
 */
export function detectTimeAnomaly(
  fingerprint: string,
  currentCount: number
): AnomalyResult {
  // Delegate to cache for fast lookup
  return cacheDetectTimeAnomaly(fingerprint, currentCount);
}

/**
 * Detect global anomaly (total error rate vs baseline).
 * Uses the 'global_error_rate' baseline metric.
 *
 * @param currentErrorRate - Current errors per minute
 * @returns Anomaly detection result
 */
export function detectGlobalAnomaly(currentErrorRate: number): AnomalyResult {
  const baseline = getBaseline("global_error_rate", DEFAULT_WINDOW_MINUTES);

  if (!baseline) {
    return {
      isAnomalous: false,
      zScore: 0,
      expectedCount: 0,
      actualCount: currentErrorRate,
      threshold: ANOMALY_ZSCORE_THRESHOLD,
      confidence: 0,
    };
  }

  // Z-score: (observed - expected) / stdDev
  const zScore =
    baseline.stdDev > 0
      ? (currentErrorRate - baseline.avgValue) / baseline.stdDev
      : 0;

  const isAnomalous = Math.abs(zScore) > ANOMALY_ZSCORE_THRESHOLD;
  const confidence = baseline.sampleCount > 100 ? 0.95 : baseline.sampleCount / 100;

  // Report anomaly to kernel if detected
  if (isAnomalous) {
    const severity = Math.abs(zScore) > 4 ? "critical" : Math.abs(zScore) > 3 ? "high" : "medium";
    getPatternDetectorHook()?.anomaly(
      "global_error_rate",
      currentErrorRate,
      ANOMALY_ZSCORE_THRESHOLD,
      severity,
      { zScore, expectedCount: baseline.avgValue, confidence }
    );
  }

  return {
    isAnomalous,
    zScore,
    expectedCount: baseline.avgValue,
    actualCount: currentErrorRate,
    threshold: ANOMALY_ZSCORE_THRESHOLD,
    confidence,
  };
}

/**
 * Detect if a specific metric is anomalous.
 *
 * @param metricName - Name of the baseline metric
 * @param currentValue - Current value of the metric
 * @returns Anomaly result or null if no baseline
 */
export function detectMetricAnomaly(
  metricName: string,
  currentValue: number
): AnomalyResult | null {
  const baseline = getBaseline(metricName, DEFAULT_WINDOW_MINUTES);

  if (!baseline) {
    return null;
  }

  const zScore =
    baseline.stdDev > 0
      ? (currentValue - baseline.avgValue) / baseline.stdDev
      : 0;

  const isAnomalous = Math.abs(zScore) > ANOMALY_ZSCORE_THRESHOLD;
  const confidence = baseline.sampleCount > 100 ? 0.95 : baseline.sampleCount / 100;

  // Report anomaly to kernel if detected
  if (isAnomalous) {
    const severity = Math.abs(zScore) > 4 ? "critical" : Math.abs(zScore) > 3 ? "high" : "medium";
    getPatternDetectorHook()?.anomaly(
      metricName,
      currentValue,
      ANOMALY_ZSCORE_THRESHOLD,
      severity,
      { zScore, expectedCount: baseline.avgValue, confidence }
    );
  }

  return {
    isAnomalous,
    zScore,
    expectedCount: baseline.avgValue,
    actualCount: currentValue,
    threshold: ANOMALY_ZSCORE_THRESHOLD,
    confidence,
  };
}

// ==================== BURST DETECTION ====================

/**
 * Detect error bursts using sliding window analysis.
 * A burst is defined as N times the baseline rate.
 *
 * @param event - Error event to record
 * @returns Burst detection result
 */
export function detectBurst(event: ErrorEvent): BurstResult {
  const { fingerprint, timestamp } = event;

  // Get or create sliding window
  let window = burstWindows.get(fingerprint);
  if (!window) {
    window = {
      timestamps: [],
      count: 0,
      windowSizeMs: BURST_WINDOW_MS,
    };
    burstWindows.set(fingerprint, window);
  }

  // Add current timestamp
  window.timestamps.push(timestamp);
  window.count++;

  // Evict old timestamps outside window
  const cutoff = timestamp - window.windowSizeMs;
  while (window.timestamps.length > 0 && window.timestamps[0] < cutoff) {
    window.timestamps.shift();
    window.count--;
  }

  // Calculate events per second
  const eventsPerSecond = window.count / (BURST_WINDOW_MS / 1000);

  // Get baseline from cache
  const patterns = getTimePatterns(fingerprint);
  const hour = new Date(timestamp).getUTCHours();
  const hourlyPattern = patterns.find((p) => p.hour === hour);

  // Convert hourly baseline to per-second
  const baselineEventsPerSecond = hourlyPattern
    ? hourlyPattern.avgCount / 3600
    : 0.01; // Default: 1 per 100 seconds

  const burstMultiplier = eventsPerSecond / Math.max(baselineEventsPerSecond, 0.001);

  const isBurst = burstMultiplier >= BURST_THRESHOLD_MULTIPLIER;

  // Determine recommendation based on severity
  let recommendation: BurstResult["recommendation"] = "IGNORE";
  if (isBurst) {
    if (burstMultiplier >= 20) {
      recommendation = "CRITICAL";
    } else if (burstMultiplier >= 10) {
      recommendation = "ALERT";
    } else if (burstMultiplier >= 5) {
      recommendation = "WARN";
    } else {
      recommendation = "LOG";
    }

    // Report burst as anomaly to kernel
    const severity = recommendation === "CRITICAL" ? "critical" : 
                     recommendation === "ALERT" ? "high" : 
                     recommendation === "WARN" ? "medium" : "low";
    getPatternDetectorHook()?.anomaly(
      `burst:${fingerprint}`,
      eventsPerSecond,
      baselineEventsPerSecond * BURST_THRESHOLD_MULTIPLIER,
      severity,
      { burstMultiplier, recommendation, windowMs: BURST_WINDOW_MS }
    );
  }

  return {
    fingerprint,
    isBurst,
    eventsPerSecond,
    baselineEventsPerSecond,
    burstMultiplier,
    recommendation,
  };
}

/**
 * Clear burst detection state for a fingerprint.
 * Call this when you want to reset burst tracking.
 */
export function clearBurstWindow(fingerprint: string): void {
  burstWindows.delete(fingerprint);
}

/**
 * Clear all burst detection state.
 */
export function clearAllBurstWindows(): void {
  burstWindows.clear();
}

// ==================== CORRELATION DETECTION ====================

/**
 * Record an error for correlation analysis.
 * This updates the co-occurrence matrix.
 *
 * @param event - Error event to record
 */
export function recordErrorForCorrelation(event: ErrorEvent): void {
  const { fingerprint, timestamp } = event;

  // Add to recent errors (circular buffer)
  recentErrors[recentErrorIndex] = event;
  recentErrorIndex = (recentErrorIndex + 1) % MAX_RECENT_ERRORS;

  // Update total observations for this fingerprint
  fingerprintObservations.set(
    fingerprint,
    (fingerprintObservations.get(fingerprint) || 0) + 1
  );

  // Find co-occurring errors within time window
  const cutoff = timestamp - CORRELATION_WINDOW_MS;

  for (const other of recentErrors) {
    if (!other || other.fingerprint === fingerprint) continue;
    if (other.timestamp < cutoff) continue;

    // Record co-occurrence
    let primaryMap = correlationObservations.get(fingerprint);
    if (!primaryMap) {
      primaryMap = new Map();
      correlationObservations.set(fingerprint, primaryMap);
    }
    primaryMap.set(other.fingerprint, (primaryMap.get(other.fingerprint) || 0) + 1);

    // Record reverse co-occurrence
    let secondaryMap = correlationObservations.get(other.fingerprint);
    if (!secondaryMap) {
      secondaryMap = new Map();
      correlationObservations.set(other.fingerprint, secondaryMap);
    }
    secondaryMap.set(fingerprint, (secondaryMap.get(fingerprint) || 0) + 1);
  }
}

/**
 * Calculate correlation strength between two error types.
 * Uses the Jaccard coefficient: intersection / union.
 *
 * @param fp1 - First fingerprint
 * @param fp2 - Second fingerprint
 * @returns Correlation result or null if insufficient data
 */
export function calculateCorrelation(
  fp1: string,
  fp2: string
): CorrelationResult | null {
  const coOccurrences =
    correlationObservations.get(fp1)?.get(fp2) ||
    correlationObservations.get(fp2)?.get(fp1) ||
    0;

  const fp1Count = fingerprintObservations.get(fp1) || 0;
  const fp2Count = fingerprintObservations.get(fp2) || 0;

  // Need minimum observations for meaningful correlation
  if (
    fp1Count < MIN_OBSERVATIONS_FOR_CORRELATION ||
    fp2Count < MIN_OBSERVATIONS_FOR_CORRELATION
  ) {
    return null;
  }

  // Jaccard-like coefficient: coOccur / (fp1 + fp2 - coOccur)
  const union = fp1Count + fp2Count - coOccurrences;
  const strength = union > 0 ? coOccurrences / union : 0;

  return {
    primaryFingerprint: fp1,
    secondaryFingerprint: fp2,
    strength,
    coOccurrences,
    timeWindow: CORRELATION_WINDOW_MS / 1000,
    isSignificant: strength >= CORRELATION_MIN_STRENGTH,
  };
}

/**
 * Get all significant correlations for a fingerprint.
 * Combines cached correlations with live observations.
 *
 * @param fingerprint - Error fingerprint
 * @returns Array of significant correlations
 */
export function getSignificantCorrelations(
  fingerprint: string
): CorrelationResult[] {
  const results: CorrelationResult[] = [];

  // Get cached correlations from L1 cache
  const cached = getCorrelations(fingerprint);
  for (const c of cached) {
    results.push({
      primaryFingerprint: fingerprint,
      secondaryFingerprint: c.secondaryFingerprint,
      strength: c.correlationStrength,
      coOccurrences: c.observationCount,
      timeWindow: 5,
      isSignificant: c.correlationStrength >= CORRELATION_MIN_STRENGTH,
    });
  }

  // Check live observations for any new correlations not in cache
  const liveMap = correlationObservations.get(fingerprint);
  if (liveMap) {
    for (const [otherFp, coOccur] of liveMap) {
      // Skip if already in cached results
      if (results.some((r) => r.secondaryFingerprint === otherFp)) continue;

      const fp1Count = fingerprintObservations.get(fingerprint) || 0;
      const fp2Count = fingerprintObservations.get(otherFp) || 0;

      if (
        fp1Count >= MIN_OBSERVATIONS_FOR_CORRELATION &&
        fp2Count >= MIN_OBSERVATIONS_FOR_CORRELATION
      ) {
        const union = fp1Count + fp2Count - coOccur;
        const strength = union > 0 ? coOccur / union : 0;

        if (strength >= CORRELATION_MIN_STRENGTH) {
          results.push({
            primaryFingerprint: fingerprint,
            secondaryFingerprint: otherFp,
            strength,
            coOccurrences: coOccur,
            timeWindow: CORRELATION_WINDOW_MS / 1000,
            isSignificant: true,
          });
        }
      }
    }
  }

  return results.sort((a, b) => b.strength - a.strength);
}

// ==================== CASCADE PREDICTION ====================

/**
 * Predict error cascades from a root error.
 * Uses learned cascade patterns from the L1 cache.
 *
 * @param fingerprint - Potential root cause fingerprint
 * @returns Cascade prediction or null if no cascade known
 */
export function predictCascade(fingerprint: string): CascadePrediction | null {
  // Delegate to cache for fast lookup
  const prediction = cachePredictCascade(fingerprint);
  
  // Report prediction to kernel if found
  if (prediction) {
    getPatternDetectorHook()?.prediction(
      "cascade",
      prediction.probability,
      { 
        rootFingerprint: fingerprint, 
        predictedChildren: prediction.predictedChildren.length,
        expectedTimeMs: prediction.expectedTimeMs
      }
    );
  }
  
  return prediction;
}

/**
 * Record an error event for cascade tracking.
 * Updates active cascade state for pattern learning.
 *
 * @param event - Error event
 */
export function recordErrorForCascade(event: ErrorEvent): void {
  const { fingerprint, timestamp, correlationId } = event;

  // If we have a correlation ID, track in cascade
  if (correlationId) {
    let cascade = activeCascades.get(correlationId);

    if (!cascade) {
      // This is the first error in this request/correlation
      cascade = {
        rootFingerprint: fingerprint,
        childFingerprints: new Set(),
        startTime: timestamp,
        lastUpdate: timestamp,
      };
      activeCascades.set(correlationId, cascade);
    } else {
      // Add as child if within time window
      const elapsed = timestamp - cascade.startTime;
      if (elapsed <= CASCADE_TIME_WINDOW_MS && fingerprint !== cascade.rootFingerprint) {
        const wasNew = !cascade.childFingerprints.has(fingerprint);
        cascade.childFingerprints.add(fingerprint);
        
        // Report cascade growth to kernel when new child is added
        if (wasNew) {
          getPatternDetectorHook()?.cascade(
            cascade.rootFingerprint,
            cascade.childFingerprints.size,
            1, // depth = 1 for direct children
            { correlationId, elapsedMs: elapsed, newChild: fingerprint }
          );
        }
      }
      cascade.lastUpdate = timestamp;
    }
  }

  // Cleanup old cascades (older than 2x window)
  const cleanupCutoff = timestamp - CASCADE_TIME_WINDOW_MS * 2;
  for (const [id, cascade] of activeCascades) {
    if (cascade.lastUpdate < cleanupCutoff) {
      activeCascades.delete(id);
    }
  }
}

/**
 * Get an active cascade by correlation ID.
 *
 * @param correlationId - Request/correlation ID
 * @returns Cascade info or null
 */
export function getActiveCascade(correlationId: string): {
  rootFingerprint: string;
  childFingerprints: string[];
  ageMs: number;
} | null {
  const cascade = activeCascades.get(correlationId);
  if (!cascade) return null;

  return {
    rootFingerprint: cascade.rootFingerprint,
    childFingerprints: Array.from(cascade.childFingerprints),
    ageMs: Date.now() - cascade.startTime,
  };
}

/**
 * Get completed cascades for learning.
 * Returns cascades that have timed out (no new errors in window).
 *
 * @returns Array of completed cascade observations
 */
export function harvestCompletedCascades(): Array<{
  rootFingerprint: string;
  childFingerprints: string[];
  durationMs: number;
}> {
  const now = Date.now();
  const cutoff = now - CASCADE_TIME_WINDOW_MS;
  const completed: Array<{
    rootFingerprint: string;
    childFingerprints: string[];
    durationMs: number;
  }> = [];

  for (const [id, cascade] of activeCascades) {
    if (cascade.lastUpdate < cutoff && cascade.childFingerprints.size > 0) {
      completed.push({
        rootFingerprint: cascade.rootFingerprint,
        childFingerprints: Array.from(cascade.childFingerprints),
        durationMs: cascade.lastUpdate - cascade.startTime,
      });
      activeCascades.delete(id);
    }
  }

  return completed;
}

// ==================== ROOT CAUSE ANALYSIS ====================

/**
 * Attempt to identify the root cause of an error.
 * Uses correlation and cascade data to trace back.
 *
 * @param fingerprint - Current error fingerprint
 * @param recentEvents - Recent error events (optional, uses internal buffer if not provided)
 * @returns Root cause analysis result or null if no clear root cause
 */
export function analyzeRootCause(
  fingerprint: string,
  recentEvents?: ErrorEvent[]
): RootCauseResult | null {
  const events = recentEvents || recentErrors.filter(Boolean);

  // Find recent events of this fingerprint
  const thisErrorEvents = events.filter((e) => e.fingerprint === fingerprint);
  if (thisErrorEvents.length === 0) return null;

  const latestEvent = thisErrorEvents.reduce((latest, e) =>
    e.timestamp > latest.timestamp ? e : latest
  );

  // Check if this error appears as a child in any known cascade
  // We need to look for errors that typically precede this one
  const correlations = getSignificantCorrelations(fingerprint);

  // Find the most likely root cause:
  // 1. Has strong correlation with this error
  // 2. Typically occurs BEFORE this error (check cascade data)
  // 3. Has high confidence as root cause

  let bestCandidate: RootCauseResult | null = null;
  let bestScore = 0;

  for (const corr of correlations) {
    const potentialRootFp = corr.secondaryFingerprint;

    // Check if we have cascade data showing this as a root
    const cascadeData = getCascade(potentialRootFp);

    if (cascadeData && cascadeData.childFingerprints.includes(fingerprint)) {
      // This fingerprint is a known root cause for our error
      const score = corr.strength * cascadeData.confidence;

      if (score > bestScore) {
        bestScore = score;

        // Find the most recent event of the potential root cause
        const rootEvents = events.filter((e) => e.fingerprint === potentialRootFp);
        const latestRoot = rootEvents.reduce(
          (latest, e) => (e.timestamp > latest.timestamp ? e : latest),
          rootEvents[0]
        );

        const timeDelta = latestRoot
          ? latestEvent.timestamp - latestRoot.timestamp
          : 0;

        bestCandidate = {
          rootCauseFingerprint: potentialRootFp,
          confidence: cascadeData.confidence,
          errorChain: [potentialRootFp, fingerprint],
          timeDelta,
          evidence: [
            `Correlation strength: ${(corr.strength * 100).toFixed(1)}%`,
            `Cascade confidence: ${(cascadeData.confidence * 100).toFixed(1)}%`,
            `Co-occurrences: ${corr.coOccurrences}`,
            timeDelta > 0 ? `Time delta: ${timeDelta}ms` : "No timing data",
          ],
        };
      }
    }
  }

  return bestCandidate;
}

// ==================== PATTERN HARVESTING ====================

/**
 * Harvest all observed correlations for DB persistence.
 * Call this periodically to save learned patterns.
 *
 * @param minObservations - Minimum observations to include
 * @returns Array of correlation data for persistence
 */
export function harvestCorrelationData(minObservations: number = 10): Array<{
  primaryFingerprint: string;
  secondaryFingerprint: string;
  strength: number;
  coOccurrences: number;
}> {
  const results: Array<{
    primaryFingerprint: string;
    secondaryFingerprint: string;
    strength: number;
    coOccurrences: number;
  }> = [];

  const processed = new Set<string>();

  for (const [fp1, coOccurMap] of correlationObservations) {
    for (const [fp2, coOccur] of coOccurMap) {
      // Avoid duplicates (fp1-fp2 and fp2-fp1)
      const key = [fp1, fp2].sort().join("|");
      if (processed.has(key)) continue;
      processed.add(key);

      if (coOccur < minObservations) continue;

      const fp1Count = fingerprintObservations.get(fp1) || 0;
      const fp2Count = fingerprintObservations.get(fp2) || 0;

      if (fp1Count >= minObservations && fp2Count >= minObservations) {
        const union = fp1Count + fp2Count - coOccur;
        const strength = union > 0 ? coOccur / union : 0;

        results.push({
          primaryFingerprint: fp1,
          secondaryFingerprint: fp2,
          strength,
          coOccurrences: coOccur,
        });
      }
    }
  }

  return results.sort((a, b) => b.strength - a.strength);
}

/**
 * Harvest time pattern data from burst detection windows.
 *
 * @returns Array of fingerprints with their current rates
 */
export function harvestTimePatternData(): Array<{
  fingerprint: string;
  currentCount: number;
  windowSizeMs: number;
}> {
  const results: Array<{
    fingerprint: string;
    currentCount: number;
    windowSizeMs: number;
  }> = [];

  for (const [fingerprint, window] of burstWindows) {
    results.push({
      fingerprint,
      currentCount: window.count,
      windowSizeMs: window.windowSizeMs,
    });
  }

  return results;
}

// ==================== STATS & CLEANUP ====================

/**
 * Get pattern detector statistics.
 */
export function getPatternDetectorStats(): {
  burstWindowsActive: number;
  recentErrorsCount: number;
  correlationPairsTracked: number;
  fingerprintsObserved: number;
  activeCascadesTracked: number;
} {
  let correlationPairs = 0;
  for (const map of correlationObservations.values()) {
    correlationPairs += map.size;
  }

  return {
    burstWindowsActive: burstWindows.size,
    recentErrorsCount: recentErrors.filter(Boolean).length,
    correlationPairsTracked: correlationPairs,
    fingerprintsObserved: fingerprintObservations.size,
    activeCascadesTracked: activeCascades.size,
  };
}

/**
 * Clear all pattern detector state.
 * Call this for testing or when resetting the system.
 */
export function clearAllPatternState(): void {
  burstWindows.clear();
  recentErrors.length = 0;
  recentErrorIndex = 0;
  correlationObservations.clear();
  fingerprintObservations.clear();
  activeCascades.clear();
}

/**
 * Prune stale observations to free memory.
 *
 * @param maxAge - Maximum age in milliseconds (default: 24 hours)
 */
export function pruneStaleObservations(
  maxAge: number = 24 * 60 * 60 * 1000
): void {
  // Prune old burst windows (they self-clean, but clear inactive ones)
  const now = Date.now();
  for (const [fp, window] of burstWindows) {
    if (
      window.timestamps.length === 0 ||
      window.timestamps[window.timestamps.length - 1] < now - maxAge
    ) {
      burstWindows.delete(fp);
    }
  }

  // Prune old cascade tracking
  for (const [id, cascade] of activeCascades) {
    if (cascade.lastUpdate < now - maxAge) {
      activeCascades.delete(id);
    }
  }

  // Note: correlationObservations and fingerprintObservations accumulate
  // and should be reset periodically in the worker, not here
}
