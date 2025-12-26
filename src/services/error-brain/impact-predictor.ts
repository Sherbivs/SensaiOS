/**
 * Error Brain — Impact Predictor
 *
 * ML-based user impact prediction and forecasting:
 * - Estimate affected user count from error patterns
 * - Predict service degradation severity
 * - Calculate business impact scores
 * - Provide actionable recommendations
 *
 * Uses lightweight statistical models (no heavy ML frameworks)
 * that can run in real-time without blocking.
 *
 * @module error-brain/impact-predictor
 */

// KERNEL FIRST — Must be first import to monitor other system initialization
import {
  createIntelligenceHook,
  type IntelligenceHook,
} from "../../kernel/kernel-hooks.js";

import { ErrorBrainConfig } from "../../config/error-brain-config.js";
import {
  predictImpact as cachePredictImpact,
  getImpactWeight,
  type ImpactPrediction,
} from "./error-brain-cache.js";
import {
  detectBurst,
  getSignificantCorrelations,
  predictCascade,
  type BurstResult,
} from "./pattern-detector.js";

// ==================== KERNEL INTEGRATION ====================

/** Lazy-initialized kernel hook for impact predictor */
let kernelHook: IntelligenceHook | null = null;

/**
 * Get or create kernel hook for impact predictor observability.
 * Uses lazy initialization to avoid startup dependencies.
 */
function getImpactPredictorHook(): IntelligenceHook | null {
  if (!kernelHook) {
    try {
      kernelHook = createIntelligenceHook("impact-predictor");
    } catch {
      // Kernel not available, silently skip
    }
  }
  return kernelHook;
}

// ==================== TYPES ====================

/**
 * Error context for impact prediction.
 */
export interface ErrorContext {
  /** Error fingerprint */
  fingerprint: string;
  /** Error severity (1-5) */
  severity: number;
  /** Error count in current window */
  errorCount: number;
  /** Active user count (if known) */
  activeUsers?: number;
  /** Component/service that errored */
  component?: string;
  /** Is this a user-facing error? */
  isUserFacing?: boolean;
  /** Request path/action (if applicable) */
  requestPath?: string;
}

/**
 * Comprehensive impact assessment.
 */
export interface ImpactAssessment {
  /** Overall impact severity (1-100) */
  impactScore: number;
  /** Impact classification */
  severity: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** Estimated affected users */
  estimatedAffectedUsers: number;
  /** Confidence in this assessment (0-1) */
  confidence: number;
  /** Business impact factors */
  factors: ImpactFactor[];
  /** Recommended actions */
  recommendations: string[];
  /** Whether this requires immediate attention */
  requiresImmediate: boolean;
  /** Estimated time to impact (ms) if cascade predicted */
  estimatedTimeToImpact?: number;
}

/**
 * Individual impact factor contribution.
 */
export interface ImpactFactor {
  /** Factor name */
  name: string;
  /** Factor weight (0-1) */
  weight: number;
  /** Raw value for this factor */
  value: number;
  /** Contribution to overall score */
  contribution: number;
  /** Human-readable description */
  description: string;
}

/**
 * Service health score.
 */
export interface ServiceHealth {
  /** Service/component name */
  service: string;
  /** Health score (0-100) */
  healthScore: number;
  /** Recent error count */
  errorCount: number;
  /** Trend direction */
  trend: "IMPROVING" | "STABLE" | "DEGRADING" | "CRITICAL";
  /** Active alerts */
  activeAlerts: number;
}

/**
 * Forecasting result for future impact.
 */
export interface ImpactForecast {
  /** Prediction timestamp */
  predictionTime: number;
  /** Forecast horizon (minutes) */
  horizonMinutes: number;
  /** Predicted error count */
  predictedErrorCount: number;
  /** Predicted affected users */
  predictedAffectedUsers: number;
  /** Confidence interval (low, high) */
  confidenceInterval: [number, number];
  /** Key risk factors */
  riskFactors: string[];
}

// ==================== CONFIGURATION ====================

// Impact score weights (sum to 1.0)
const FACTOR_WEIGHTS = {
  errorFrequency: 0.25, // How often is this error occurring?
  userImpact: 0.30, // How many users affected?
  severityLevel: 0.20, // How severe is the error?
  cascadeRisk: 0.15, // Will it cause downstream errors?
  timeOfDay: 0.10, // Is it peak hours?
};

// Severity thresholds
const SEVERITY_THRESHOLDS = {
  MINIMAL: 10,
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 90,
};

// User impact multipliers by component
const COMPONENT_USER_MULTIPLIERS: Record<string, number> = {
  "auth": 1.0, // All users affected
  "battle": 0.3, // Only active battlers
  "encounter": 0.4, // Only exploring users
  "home": 0.6, // Most users use home
  "api": 0.8, // Most traffic
  "database": 1.0, // Critical infrastructure
  "cache": 0.5, // Degraded but functional
  "default": 0.5,
};

// Time-of-day activity multipliers (UTC hours)
const TIME_ACTIVITY_MULTIPLIERS: Record<number, number> = {
  0: 0.3, 1: 0.2, 2: 0.2, 3: 0.2, 4: 0.2, 5: 0.3,
  6: 0.4, 7: 0.5, 8: 0.6, 9: 0.7, 10: 0.8, 11: 0.9,
  12: 1.0, 13: 1.0, 14: 0.95, 15: 0.9, 16: 0.85, 17: 0.9,
  18: 1.0, 19: 1.0, 20: 1.0, 21: 0.9, 22: 0.7, 23: 0.5,
};

// ==================== STATE ====================

/** Service health tracking */
const serviceHealthMap: Map<string, ServiceHealth> = new Map();

/** Error history for trend analysis (per fingerprint) */
const errorHistory: Map<string, number[]> = new Map();
const MAX_HISTORY_POINTS = 60; // Last 60 data points (1 hour at 1-minute intervals)

// ==================== CORE PREDICTION ====================

/**
 * Predict user impact for an error fingerprint.
 * Fast path uses L1 cache data.
 *
 * @param fingerprint - Error fingerprint
 * @param activeUserCount - Current active user count
 * @returns Impact prediction or null if insufficient data
 */
export function predictImpact(
  fingerprint: string,
  activeUserCount: number
): ImpactPrediction | null {
  return cachePredictImpact(fingerprint, activeUserCount);
}

/**
 * Perform comprehensive impact assessment.
 * Considers multiple factors for accurate prediction.
 *
 * @param context - Error context
 * @returns Full impact assessment
 */
export function assessImpact(context: ErrorContext): ImpactAssessment {
  const factors: ImpactFactor[] = [];
  const recommendations: string[] = [];

  // Factor 1: Error Frequency
  const burstResult = detectBurst({
    fingerprint: context.fingerprint,
    timestamp: Date.now(),
    severity: context.severity,
  });

  const frequencyScore = calculateFrequencyScore(burstResult);
  factors.push({
    name: "Error Frequency",
    weight: FACTOR_WEIGHTS.errorFrequency,
    value: burstResult.eventsPerSecond,
    contribution: frequencyScore * FACTOR_WEIGHTS.errorFrequency,
    description: burstResult.isBurst
      ? `Burst detected: ${burstResult.burstMultiplier.toFixed(1)}x baseline`
      : `Normal rate: ${burstResult.eventsPerSecond.toFixed(2)}/s`,
  });

  if (burstResult.isBurst) {
    recommendations.push(
      `Error burst detected (${burstResult.burstMultiplier.toFixed(1)}x normal). Consider rate limiting or circuit breaking.`
    );
  }

  // Factor 2: User Impact
  const impactWeight = getImpactWeight(context.fingerprint);
  const componentMultiplier =
    COMPONENT_USER_MULTIPLIERS[context.component || "default"] ||
    COMPONENT_USER_MULTIPLIERS.default;
  const activeUsers = context.activeUsers || 100; // Default assumption
  const userFacingMultiplier = context.isUserFacing ? 1.0 : 0.5;

  let estimatedAffectedUsers: number;
  if (impactWeight) {
    // Use learned impact weight
    estimatedAffectedUsers = Math.ceil(
      activeUsers * impactWeight.avgUserImpact * userFacingMultiplier
    );
  } else {
    // Estimate from component and severity
    estimatedAffectedUsers = Math.ceil(
      activeUsers *
        componentMultiplier *
        (context.severity / 5) *
        userFacingMultiplier
    );
  }

  const userImpactScore = Math.min(
    100,
    (estimatedAffectedUsers / Math.max(activeUsers, 1)) * 100
  );
  factors.push({
    name: "User Impact",
    weight: FACTOR_WEIGHTS.userImpact,
    value: estimatedAffectedUsers,
    contribution: userImpactScore * FACTOR_WEIGHTS.userImpact,
    description: `~${estimatedAffectedUsers} users potentially affected`,
  });

  if (estimatedAffectedUsers > activeUsers * 0.5) {
    recommendations.push(
      `High user impact (>${Math.round(estimatedAffectedUsers / activeUsers * 100)}% of users). Consider emergency response.`
    );
  }

  // Factor 3: Severity Level
  const severityScore = (context.severity / 5) * 100;
  factors.push({
    name: "Severity Level",
    weight: FACTOR_WEIGHTS.severityLevel,
    value: context.severity,
    contribution: severityScore * FACTOR_WEIGHTS.severityLevel,
    description: `Severity ${context.severity}/5`,
  });

  if (context.severity >= 4) {
    recommendations.push("High severity error. Review for potential data loss or security implications.");
  }

  // Factor 4: Cascade Risk
  const cascadePrediction = predictCascade(context.fingerprint);
  const cascadeScore = cascadePrediction ? cascadePrediction.probability * 100 : 0;
  factors.push({
    name: "Cascade Risk",
    weight: FACTOR_WEIGHTS.cascadeRisk,
    value: cascadePrediction?.probability ?? 0,
    contribution: cascadeScore * FACTOR_WEIGHTS.cascadeRisk,
    description:
      cascadePrediction && cascadePrediction.probability > 0.3
        ? `${cascadePrediction.predictedChildren.length} downstream errors predicted`
        : "Low cascade risk",
  });

  if (cascadePrediction && cascadePrediction.probability > 0.5) {
    recommendations.push(
      `Cascade likely: May trigger ${cascadePrediction.predictedChildren.length} downstream errors. Address root cause immediately.`
    );
  }

  // Factor 5: Time of Day
  const currentHour = new Date().getUTCHours();
  const timeMultiplier = TIME_ACTIVITY_MULTIPLIERS[currentHour];
  const timeScore = timeMultiplier * 100;
  factors.push({
    name: "Time of Day",
    weight: FACTOR_WEIGHTS.timeOfDay,
    value: timeMultiplier,
    contribution: timeScore * FACTOR_WEIGHTS.timeOfDay,
    description:
      timeMultiplier > 0.8
        ? "Peak hours - high traffic"
        : timeMultiplier > 0.5
        ? "Moderate traffic period"
        : "Low traffic period",
  });

  // Calculate overall impact score
  const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);
  const impactScore = Math.min(100, Math.max(0, rawScore));

  // Determine severity classification
  let severity: ImpactAssessment["severity"] = "MINIMAL";
  if (impactScore >= SEVERITY_THRESHOLDS.CRITICAL) {
    severity = "CRITICAL";
  } else if (impactScore >= SEVERITY_THRESHOLDS.HIGH) {
    severity = "HIGH";
  } else if (impactScore >= SEVERITY_THRESHOLDS.MEDIUM) {
    severity = "MEDIUM";
  } else if (impactScore >= SEVERITY_THRESHOLDS.LOW) {
    severity = "LOW";
  }

  // Calculate confidence based on data availability
  const hasImpactWeight = impactWeight !== null;
  const hasCascadeData = cascadePrediction !== null && cascadePrediction.probability > 0;
  const hasCorrelations = getSignificantCorrelations(context.fingerprint).length > 0;
  const confidence = 0.5 + (hasImpactWeight ? 0.2 : 0) + (hasCascadeData ? 0.15 : 0) + (hasCorrelations ? 0.15 : 0);

  // Add severity-specific recommendations
  if (severity === "CRITICAL") {
    recommendations.unshift("🚨 CRITICAL: Immediate intervention required. Consider emergency rollback or failover.");
  } else if (severity === "HIGH") {
    recommendations.unshift("⚠️ HIGH PRIORITY: Requires immediate attention from on-call engineer.");
  }

  const requiresImmediate = severity === "CRITICAL" || severity === "HIGH";

  // Report impact assessment to kernel
  if (severity !== "MINIMAL") {
    getImpactPredictorHook()?.prediction(
      "impact",
      confidence,
      {
        fingerprint: context.fingerprint,
        impactScore,
        severity,
        estimatedAffectedUsers,
        factorCount: factors.length,
        requiresImmediate,
      }
    );
  }

  return {
    impactScore,
    severity,
    estimatedAffectedUsers,
    confidence,
    factors,
    recommendations,
    requiresImmediate,
    estimatedTimeToImpact:
      cascadePrediction && cascadePrediction.probability > 0.3
        ? ErrorBrainConfig.correlationWindowMs
        : undefined,
  };
}

// ==================== SERVICE HEALTH ====================

/**
 * Update service health tracking.
 *
 * @param service - Service/component name
 * @param errorCount - Recent error count
 * @param alertCount - Active alert count
 */
export function updateServiceHealth(
  service: string,
  errorCount: number,
  alertCount: number = 0
): ServiceHealth {
  const existing = serviceHealthMap.get(service);

  // Calculate health score (inverse of error density)
  // Max errors per minute for health=0 is 100
  const errorRate = Math.min(errorCount, 100);
  const healthScore = Math.max(0, 100 - errorRate);

  // Determine trend
  let trend: ServiceHealth["trend"] = "STABLE";
  if (existing) {
    const delta = existing.errorCount - errorCount;
    if (delta > 5) {
      trend = "IMPROVING";
    } else if (delta < -10) {
      trend = errorCount > 50 ? "CRITICAL" : "DEGRADING";
    }
  }

  const health: ServiceHealth = {
    service,
    healthScore,
    errorCount,
    trend,
    activeAlerts: alertCount,
  };

  serviceHealthMap.set(service, health);
  return health;
}

/**
 * Get health status for a service.
 *
 * @param service - Service name
 * @returns Service health or null if not tracked
 */
export function getServiceHealth(service: string): ServiceHealth | null {
  return serviceHealthMap.get(service) || null;
}

/**
 * Get health status for all tracked services.
 *
 * @returns Array of service health records
 */
export function getAllServiceHealth(): ServiceHealth[] {
  return Array.from(serviceHealthMap.values()).sort(
    (a, b) => a.healthScore - b.healthScore
  );
}

/**
 * Get overall system health score.
 *
 * @returns Aggregated health score (0-100)
 */
export function getSystemHealthScore(): number {
  const services = Array.from(serviceHealthMap.values());
  if (services.length === 0) return 100;

  // Weighted average, with critical services having higher weight
  const criticalServices = new Set(["auth", "database", "api"]);
  let totalWeight = 0;
  let weightedSum = 0;

  for (const service of services) {
    const weight = criticalServices.has(service.service) ? 2 : 1;
    weightedSum += service.healthScore * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 100;
}

// ==================== FORECASTING ====================

/**
 * Record error count for trend analysis.
 *
 * @param fingerprint - Error fingerprint
 * @param count - Error count in period
 */
export function recordErrorCount(fingerprint: string, count: number): void {
  let history = errorHistory.get(fingerprint);
  if (!history) {
    history = [];
    errorHistory.set(fingerprint, history);
  }

  history.push(count);

  // Trim to max length
  if (history.length > MAX_HISTORY_POINTS) {
    history.shift();
  }
}

/**
 * Forecast future impact for an error fingerprint.
 * Uses exponential smoothing for prediction.
 *
 * @param fingerprint - Error fingerprint
 * @param horizonMinutes - How far ahead to forecast
 * @param activeUsers - Current active user count
 * @returns Impact forecast
 */
export function forecastImpact(
  fingerprint: string,
  horizonMinutes: number,
  activeUsers: number
): ImpactForecast {
  const history = errorHistory.get(fingerprint) || [];
  const riskFactors: string[] = [];

  // Need at least 5 data points for forecasting
  if (history.length < 5) {
    return {
      predictionTime: Date.now(),
      horizonMinutes,
      predictedErrorCount: history.length > 0 ? history[history.length - 1] : 0,
      predictedAffectedUsers: 0,
      confidenceInterval: [0, activeUsers * 0.1],
      riskFactors: ["Insufficient historical data for accurate forecast"],
    };
  }

  // Exponential smoothing (α = 0.3)
  const alpha = 0.3;
  let smoothed = history[0];
  let trend = 0;

  for (let i = 1; i < history.length; i++) {
    const prevSmoothed = smoothed;
    smoothed = alpha * history[i] + (1 - alpha) * (smoothed + trend);
    trend = 0.1 * (smoothed - prevSmoothed) + 0.9 * trend;
  }

  // Project forward
  const predictedErrorCount = Math.max(0, Math.round(smoothed + trend * horizonMinutes));

  // Calculate prediction variance for confidence interval
  let sumSquaredErrors = 0;
  let predicted = history[0];
  for (let i = 1; i < history.length; i++) {
    predicted = alpha * history[i - 1] + (1 - alpha) * predicted;
    sumSquaredErrors += Math.pow(history[i] - predicted, 2);
  }
  const stdError = Math.sqrt(sumSquaredErrors / (history.length - 1));

  // Estimate affected users based on prediction
  const impactWeight = getImpactWeight(fingerprint);
  const userImpactRate = impactWeight?.avgUserImpact || 0.1;
  const predictedAffectedUsers = Math.ceil(
    Math.min(activeUsers, predictedErrorCount * userImpactRate * activeUsers)
  );

  // Identify risk factors
  if (trend > 0) {
    riskFactors.push(`Upward trend detected (+${trend.toFixed(2)} errors/interval)`);
  }
  if (predictedErrorCount > history[history.length - 1] * 1.5) {
    riskFactors.push("Significant increase predicted");
  }

  // Check for cascade risk
  const cascadePrediction = predictCascade(fingerprint);
  if (cascadePrediction && cascadePrediction.probability > 0.3) {
    riskFactors.push(
      `Cascade risk: ${(cascadePrediction.probability * 100).toFixed(0)}% probability`
    );
  }

  // Check correlations
  const correlations = getSignificantCorrelations(fingerprint);
  if (correlations.length > 0) {
    riskFactors.push(`Correlated with ${correlations.length} other error types`);
  }

  // Confidence interval (95%)
  const confidenceInterval: [number, number] = [
    Math.max(0, predictedErrorCount - 1.96 * stdError),
    predictedErrorCount + 1.96 * stdError,
  ];

  // Report forecast to kernel if significant risk
  if (riskFactors.length > 0 || predictedAffectedUsers > 0) {
    const confidence = 1 - (stdError / (predictedErrorCount + 1)); // Normalize confidence
    getImpactPredictorHook()?.prediction(
      "forecast",
      Math.max(0, Math.min(1, confidence)),
      {
        fingerprint,
        horizonMinutes,
        predictedErrorCount,
        predictedAffectedUsers,
        riskFactorCount: riskFactors.length,
        trend: trend > 0 ? "up" : trend < 0 ? "down" : "stable",
      }
    );
  }

  return {
    predictionTime: Date.now(),
    horizonMinutes,
    predictedErrorCount,
    predictedAffectedUsers,
    confidenceInterval,
    riskFactors,
  };
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Calculate frequency score from burst result.
 */
function calculateFrequencyScore(burst: BurstResult): number {
  if (burst.isBurst) {
    // Burst detected: scale by multiplier
    return Math.min(100, 50 + burst.burstMultiplier * 5);
  }
  // Normal rate: scale by events per second (max 10 = 100%)
  return Math.min(100, burst.eventsPerSecond * 10);
}

// ==================== STATS & CLEANUP ====================

/**
 * Get impact predictor statistics.
 */
export function getImpactPredictorStats(): {
  servicesTracked: number;
  fingerprintsWithHistory: number;
  systemHealthScore: number;
  averageServiceHealth: number;
} {
  const services = Array.from(serviceHealthMap.values());
  const avgHealth =
    services.length > 0
      ? services.reduce((sum, s) => sum + s.healthScore, 0) / services.length
      : 100;

  return {
    servicesTracked: serviceHealthMap.size,
    fingerprintsWithHistory: errorHistory.size,
    systemHealthScore: getSystemHealthScore(),
    averageServiceHealth: Math.round(avgHealth),
  };
}

/**
 * Clear all impact predictor state.
 */
export function clearAllImpactState(): void {
  serviceHealthMap.clear();
  errorHistory.clear();
}

/**
 * Prune stale error history.
 */
export function pruneStaleHistory(): void {
  // Keep only fingerprints with recent activity
  // (In a real implementation, you'd track last update time)
  for (const [fp, history] of errorHistory) {
    // If all zeros in recent history, consider stale
    const recentSum = history.slice(-10).reduce((a, b) => a + b, 0);
    if (recentSum === 0) {
      errorHistory.delete(fp);
    }
  }
}
