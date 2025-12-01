/**
 * Behavioral Analysis Module
 * 
 * Advanced heuristics for detecting suspicious patterns in Discord guild security.
 * Implements member-specific baselines, time-series analysis, and anomaly scoring
 * to identify compromised accounts, insider threats, and coordinated attacks.
 * 
 * **Capabilities:**
 * - Member-Specific Baselines: Individual user behavior profiles
 * - Time-Series Analysis: Temporal pattern detection across multiple dimensions
 * - Anomaly Scoring: Multi-factor risk assessment with confidence intervals
 * - Coordinated Attack Detection: Identifies synchronized suspicious activity
 * - Account Compromise Indicators: Behavioral deviation scoring
 * 
 * **Architecture:**
 * - Member Profiles: Rolling 30-day activity windows per user
 * - Time-Series: Hourly/daily aggregation with seasonal decomposition
 * - Anomaly Detection: Statistical outlier detection (Z-score, IQR)
 * - Scoring: Weighted composite of behavioral factors (0-100 risk score)
 * 
 * **Integration:**
 * Used by threat detector to enhance detection accuracy and reduce false positives.
 * Provides additional context for threat response decisions.
 * 
 * @module behavioralAnalysis
 */

import { log } from '../../utils/logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Time windows for behavioral analysis
 */
const TIME_WINDOWS = {
  SHORT: 1 * 60 * 60 * 1000,      // 1 hour
  MEDIUM: 24 * 60 * 60 * 1000,    // 1 day
  LONG: 7 * 24 * 60 * 60 * 1000,  // 7 days
  BASELINE: 30 * 24 * 60 * 60 * 1000 // 30 days for baseline
};

/**
 * Statistical thresholds for anomaly detection
 */
const ANOMALY_THRESHOLDS = {
  Z_SCORE_HIGH: 2.5,      // Z-score threshold for high anomaly
  Z_SCORE_CRITICAL: 3.0,  // Z-score threshold for critical anomaly
  IQR_MULTIPLIER: 1.5,    // IQR multiplier for outlier detection
  MIN_SAMPLES: 10         // Minimum samples for statistical analysis
};

/**
 * Behavioral risk factor weights (must sum to 1.0)
 */
const RISK_WEIGHTS = {
  volumeAnomaly: 0.30,      // Unusual activity volume
  timingAnomaly: 0.25,      // Unusual timing patterns
  targetAnomaly: 0.20,      // Unusual target selection
  velocityAnomaly: 0.15,    // Unusual rate of change
  patternDeviation: 0.10    // Deviation from historical patterns
};

// ============================================================================
// MEMBER-SPECIFIC BASELINES
// ============================================================================

/**
 * Generate member-specific behavioral baselines
 * 
 * Analyzes individual member activity to create personalized profiles
 * capturing typical behavior patterns for anomaly detection.
 * 
 * @param {Array} roleArchive - Role change archive (all changes)
 * @param {string} memberId - Discord member ID to analyze
 * @returns {Object} Member-specific baseline profile
 * @property {number} avgChangesPerDay - Average changes per day
 * @property {Array<number>} activeHours - Hours when member is typically active (0-23)
 * @property {Object} targetDistribution - Distribution of targeted members
 * @property {number} maxChangesInHour - Historical maximum changes in 1 hour
 * @property {number} avgTimeBetweenChanges - Average time between changes (ms)
 * @property {number} confidence - Confidence level (0-1.0)
 * @property {number} sampleSize - Number of changes analyzed
 */
export function generateMemberBaseline(roleArchive, memberId) {
  try {
    // Filter changes by this member
    const memberChanges = roleArchive.filter(change => 
      change.actor === memberId || change.actorId === memberId
    );

    if (memberChanges.length < ANOMALY_THRESHOLDS.MIN_SAMPLES) {
      return {
        avgChangesPerDay: 0,
        activeHours: [],
        targetDistribution: {},
        maxChangesInHour: 0,
        avgTimeBetweenChanges: 0,
        confidence: 0,
        sampleSize: memberChanges.length
      };
    }

    // Calculate time span
    const timestamps = memberChanges.map(c => new Date(c.timestamp).getTime());
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timeSpanDays = (maxTime - minTime) / (24 * 60 * 60 * 1000);

    // Calculate average changes per day
    const avgChangesPerDay = timeSpanDays > 0 ? memberChanges.length / timeSpanDays : 0;

    // Identify active hours (hours with above-average activity)
    const hourCounts = new Array(24).fill(0);
    memberChanges.forEach(change => {
      const hour = new Date(change.timestamp).getUTCHours();
      hourCounts[hour]++;
    });
    const avgCountPerHour = memberChanges.length / 24;
    const activeHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(({ count }) => count > avgCountPerHour)
      .map(({ hour }) => hour);

    // Calculate target distribution (who does this member typically affect?)
    const targetDistribution = {};
    memberChanges.forEach(change => {
      const targetId = change.targetMemberId || change.memberId || 'unknown';
      targetDistribution[targetId] = (targetDistribution[targetId] || 0) + 1;
    });

    // Calculate max changes in 1 hour window
    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
    let maxChangesInHour = 0;
    for (let i = 0; i < sortedTimestamps.length; i++) {
      const windowStart = sortedTimestamps[i];
      const windowEnd = windowStart + TIME_WINDOWS.SHORT;
      const changesInWindow = sortedTimestamps.filter(t => t >= windowStart && t < windowEnd).length;
      maxChangesInHour = Math.max(maxChangesInHour, changesInWindow);
    }

    // Calculate average time between changes
    let totalTimeBetween = 0;
    for (let i = 1; i < sortedTimestamps.length; i++) {
      totalTimeBetween += sortedTimestamps[i] - sortedTimestamps[i - 1];
    }
    const avgTimeBetweenChanges = sortedTimestamps.length > 1 
      ? totalTimeBetween / (sortedTimestamps.length - 1) 
      : 0;

    // Calculate confidence based on sample size and time span
    const sampleSizeConfidence = Math.min(memberChanges.length / 50, 1.0); // 50 samples = full confidence
    const timeSpanConfidence = Math.min(timeSpanDays / 30, 1.0); // 30 days = full confidence
    const confidence = (sampleSizeConfidence + timeSpanConfidence) / 2;

    return {
      avgChangesPerDay,
      activeHours,
      targetDistribution,
      maxChangesInHour,
      avgTimeBetweenChanges,
      confidence,
      sampleSize: memberChanges.length
    };
  } catch (error) {
    log('error', '[BehavioralAnalysis] Failed to generate member baseline', { 
      memberId, 
      error: error.message 
    });
    return {
      avgChangesPerDay: 0,
      activeHours: [],
      targetDistribution: {},
      maxChangesInHour: 0,
      avgTimeBetweenChanges: 0,
      confidence: 0,
      sampleSize: 0,
      error: error.message
    };
  }
}

/**
 * Generate baselines for all active members
 * 
 * @param {Array} roleArchive - Role change archive
 * @param {number} minChanges - Minimum changes required to generate baseline (default: 5)
 * @returns {Object} Map of memberId → baseline
 */
export function generateAllMemberBaselines(roleArchive, minChanges = 5) {
  try {
    // Identify unique member IDs (actors)
    const memberIds = new Set();
    roleArchive.forEach(change => {
      if (change.actor) memberIds.add(change.actor);
      if (change.actorId) memberIds.add(change.actorId);
    });

    const baselines = {};
    let generated = 0;

    memberIds.forEach(memberId => {
      const baseline = generateMemberBaseline(roleArchive, memberId);
      if (baseline.sampleSize >= minChanges) {
        baselines[memberId] = baseline;
        generated++;
      }
    });

    log('info', '[BehavioralAnalysis] Generated member baselines', { 
      totalMembers: memberIds.size,
      baselinesGenerated: generated,
      minChanges 
    });

    return baselines;
  } catch (error) {
    log('error', '[BehavioralAnalysis] Failed to generate all member baselines', { 
      error: error.message 
    });
    return {};
  }
}

// ============================================================================
// TIME-SERIES ANALYSIS
// ============================================================================

/**
 * Perform time-series analysis on role changes
 * 
 * Aggregates changes into time buckets and identifies temporal patterns,
 * trends, and periodicities.
 * 
 * @param {Array} roleArchive - Role change archive
 * @param {string} granularity - Time granularity ('hour', 'day', 'week')
 * @returns {Object} Time-series analysis results
 * @property {Array<Object>} buckets - Time buckets with aggregated data
 * @property {Object} statistics - Statistical summary
 * @property {Array<number>} trend - Trend component (linear regression)
 * @property {Object} seasonality - Seasonal patterns detected
 */
export function analyzeTimeSeries(roleArchive, granularity = 'hour') {
  try {
    // Define bucket size based on granularity
    const bucketSizeMs = {
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000
    }[granularity] || 60 * 60 * 1000;

    if (roleArchive.length === 0) {
      return {
        buckets: [],
        statistics: { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 },
        trend: [],
        seasonality: {}
      };
    }

    // Find time range
    const timestamps = roleArchive.map(c => new Date(c.timestamp).getTime());
    const minTime = Math.min(...timestamps);

    // Create buckets
    const bucketMap = new Map();
    roleArchive.forEach(change => {
      const timestamp = new Date(change.timestamp).getTime();
      const bucketKey = Math.floor((timestamp - minTime) / bucketSizeMs);
      
      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          bucketIndex: bucketKey,
          startTime: minTime + bucketKey * bucketSizeMs,
          endTime: minTime + (bucketKey + 1) * bucketSizeMs,
          count: 0,
          changes: []
        });
      }
      
      const bucket = bucketMap.get(bucketKey);
      bucket.count++;
      bucket.changes.push(change);
    });

    // Convert to array and sort
    const buckets = Array.from(bucketMap.values()).sort((a, b) => a.bucketIndex - b.bucketIndex);

    // Calculate statistics
    const counts = buckets.map(b => b.count);
    const mean = counts.reduce((sum, c) => sum + c, 0) / counts.length;
    const sortedCounts = [...counts].sort((a, b) => a - b);
    const median = sortedCounts[Math.floor(sortedCounts.length / 2)];
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);
    const min = Math.min(...counts);
    const max = Math.max(...counts);

    // Simple linear trend (least squares)
    const trend = calculateLinearTrend(buckets.map(b => b.count));

    // Detect seasonality (periodic patterns)
    const seasonality = detectSeasonality(buckets, granularity);

    return {
      buckets,
      statistics: { mean, median, stdDev, min, max },
      trend,
      seasonality
    };
  } catch (error) {
    log('error', '[BehavioralAnalysis] Failed to analyze time series', { 
      granularity, 
      error: error.message 
    });
    return {
      buckets: [],
      statistics: { mean: 0, median: 0, stdDev: 0, min: 0, max: 0 },
      trend: [],
      seasonality: {},
      error: error.message
    };
  }
}

/**
 * Calculate linear trend using least squares regression
 * 
 * @param {Array<number>} values - Time series values
 * @returns {Array<number>} Trend line values
 */
function calculateLinearTrend(values) {
  if (values.length < 2) return values;

  const n = values.length;
  const xSum = (n * (n - 1)) / 2; // Sum of 0, 1, 2, ..., n-1
  const ySum = values.reduce((sum, v) => sum + v, 0);
  const xySum = values.reduce((sum, v, i) => sum + i * v, 0);
  const x2Sum = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares

  const slope = (n * xySum - xSum * ySum) / (n * x2Sum - xSum * xSum);
  const intercept = (ySum - slope * xSum) / n;

  return values.map((_, i) => intercept + slope * i);
}

/**
 * Detect seasonal patterns in time series
 * 
 * @param {Array<Object>} buckets - Time buckets
 * @param {string} granularity - Time granularity
 * @returns {Object} Detected seasonal patterns
 */
function detectSeasonality(buckets, granularity) {
  try {
    if (buckets.length < 24) return {}; // Need sufficient data

    // For hourly data, check for daily patterns (24-hour cycle)
    if (granularity === 'hour' && buckets.length >= 24) {
      const hourlyPattern = new Array(24).fill(0);
      const hourlyCounts = new Array(24).fill(0);

      buckets.forEach(bucket => {
        const hour = new Date(bucket.startTime).getUTCHours();
        hourlyPattern[hour] += bucket.count;
        hourlyCounts[hour]++;
      });

      // Average counts per hour
      const avgHourlyPattern = hourlyPattern.map((sum, i) => 
        hourlyCounts[i] > 0 ? sum / hourlyCounts[i] : 0
      );

      return {
        type: 'daily',
        period: 24,
        pattern: avgHourlyPattern,
        strength: calculatePatternStrength(avgHourlyPattern)
      };
    }

    // For daily data, check for weekly patterns (7-day cycle)
    if (granularity === 'day' && buckets.length >= 7) {
      const weeklyPattern = new Array(7).fill(0);
      const weeklyCounts = new Array(7).fill(0);

      buckets.forEach(bucket => {
        const dayOfWeek = new Date(bucket.startTime).getUTCDay();
        weeklyPattern[dayOfWeek] += bucket.count;
        weeklyCounts[dayOfWeek]++;
      });

      const avgWeeklyPattern = weeklyPattern.map((sum, i) => 
        weeklyCounts[i] > 0 ? sum / weeklyCounts[i] : 0
      );

      return {
        type: 'weekly',
        period: 7,
        pattern: avgWeeklyPattern,
        strength: calculatePatternStrength(avgWeeklyPattern)
      };
    }

    return {};
  } catch {
    return {};
  }
}

/**
 * Calculate pattern strength (coefficient of variation)
 * 
 * @param {Array<number>} pattern - Pattern values
 * @returns {number} Pattern strength (0-1.0)
 */
function calculatePatternStrength(pattern) {
  if (pattern.length === 0) return 0;
  
  const mean = pattern.reduce((sum, v) => sum + v, 0) / pattern.length;
  if (mean === 0) return 0;
  
  const variance = pattern.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / pattern.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean; // Coefficient of variation
  
  // Normalize to 0-1 range (higher CV = stronger pattern)
  return Math.min(cv, 1.0);
}

// ============================================================================
// ANOMALY SCORING
// ============================================================================

/**
 * Calculate anomaly score for current activity
 * 
 * Combines multiple behavioral factors to produce a composite risk score
 * indicating likelihood of suspicious or malicious activity.
 * 
 * @param {Object} currentActivity - Current activity snapshot
 * @param {Object} memberBaseline - Member-specific baseline (optional)
 * @param {Object} globalBaseline - Global baseline for guild
 * @returns {Object} Anomaly assessment
 * @property {number} riskScore - Overall risk score (0-100)
 * @property {string} riskLevel - Risk level (LOW, MEDIUM, HIGH, CRITICAL)
 * @property {Object} factors - Individual risk factor scores
 * @property {Array<string>} indicators - Human-readable risk indicators
 * @property {number} confidence - Confidence in assessment (0-1.0)
 */
export function calculateAnomalyScore(currentActivity, memberBaseline, globalBaseline) {
  try {
    const factors = {};
    const indicators = [];

    // Factor 1: Volume Anomaly (unusual number of changes)
    if (memberBaseline && memberBaseline.confidence > 0.5) {
      const expectedChanges = memberBaseline.maxChangesInHour * 0.8; // 80% of historical max
      const actualChanges = currentActivity.changeCount || 0;
      const volumeDeviation = actualChanges > expectedChanges 
        ? (actualChanges - expectedChanges) / expectedChanges 
        : 0;
      factors.volumeAnomaly = Math.min(volumeDeviation * 50, 100); // Scale to 0-100
      
      if (volumeDeviation > 1.0) {
        indicators.push(`Volume 2x+ higher than historical maximum (${actualChanges} vs ${expectedChanges.toFixed(1)} expected)`);
      }
    } else {
      // Fallback to global baseline
      const globalThreshold = globalBaseline?.rapidChangeThreshold || 10;
      const actualChanges = currentActivity.changeCount || 0;
      factors.volumeAnomaly = Math.min((actualChanges / globalThreshold) * 100, 100);
    }

    // Factor 2: Timing Anomaly (unusual time of activity)
    const currentHour = new Date().getUTCHours();
    if (memberBaseline && memberBaseline.activeHours.length > 0) {
      const isTypicalHour = memberBaseline.activeHours.includes(currentHour);
      factors.timingAnomaly = isTypicalHour ? 0 : 60; // High score if outside typical hours
      
      if (!isTypicalHour) {
        indicators.push(`Activity during atypical hours (${currentHour}:00 UTC, typical: ${memberBaseline.activeHours.join(', ')})`);
      }
    } else {
      // Fallback to global peak hours
      const globalPeakHours = globalBaseline?.peakHours || [];
      const isGlobalPeak = globalPeakHours.includes(currentHour);
      factors.timingAnomaly = isGlobalPeak ? 0 : 40;
    }

    // Factor 3: Target Anomaly (unusual target selection)
    if (memberBaseline && currentActivity.targetMemberId) {
      const targetId = currentActivity.targetMemberId;
      const historicalTargetCount = memberBaseline.targetDistribution[targetId] || 0;
      const isNewTarget = historicalTargetCount === 0;
      factors.targetAnomaly = isNewTarget ? 50 : 0;
      
      if (isNewTarget && memberBaseline.sampleSize > 20) {
        indicators.push(`Targeting member never targeted before (ID: ${targetId})`);
      }
    } else {
      factors.targetAnomaly = 0;
    }

    // Factor 4: Velocity Anomaly (rate of changes)
    if (memberBaseline && memberBaseline.avgTimeBetweenChanges > 0 && currentActivity.avgTimeBetweenChanges) {
      const velocityRatio = memberBaseline.avgTimeBetweenChanges / currentActivity.avgTimeBetweenChanges;
      const velocityDeviation = velocityRatio > 1 ? (velocityRatio - 1) : 0;
      factors.velocityAnomaly = Math.min(velocityDeviation * 50, 100);
      
      if (velocityRatio > 3) {
        indicators.push(`Change velocity 3x+ faster than historical average`);
      }
    } else {
      factors.velocityAnomaly = 0;
    }

    // Factor 5: Pattern Deviation (deviation from typical behavior)
    if (currentActivity.origin && globalBaseline?.expectedOrigins) {
      const isExpectedOrigin = globalBaseline.expectedOrigins.includes(currentActivity.origin);
      factors.patternDeviation = isExpectedOrigin ? 0 : 70;
      
      if (!isExpectedOrigin) {
        indicators.push(`Unusual origin: ${currentActivity.origin} (not in expected list)`);
      }
    } else {
      factors.patternDeviation = 0;
    }

    // Calculate weighted risk score
    const riskScore = Math.round(
      factors.volumeAnomaly * RISK_WEIGHTS.volumeAnomaly +
      factors.timingAnomaly * RISK_WEIGHTS.timingAnomaly +
      factors.targetAnomaly * RISK_WEIGHTS.targetAnomaly +
      factors.velocityAnomaly * RISK_WEIGHTS.velocityAnomaly +
      factors.patternDeviation * RISK_WEIGHTS.patternDeviation
    );

    // Determine risk level
    let riskLevel = 'LOW';
    if (riskScore >= 80) riskLevel = 'CRITICAL';
    else if (riskScore >= 60) riskLevel = 'HIGH';
    else if (riskScore >= 40) riskLevel = 'MEDIUM';

    // Calculate confidence
    const hasBaseline = memberBaseline && memberBaseline.confidence > 0;
    const baselineConfidence = hasBaseline ? memberBaseline.confidence : 0.3;
    const factorConfidence = Object.values(factors).filter(f => f > 0).length / 5;
    const confidence = (baselineConfidence + factorConfidence) / 2;

    return {
      riskScore,
      riskLevel,
      factors,
      indicators,
      confidence
    };
  } catch (error) {
    log('error', '[BehavioralAnalysis] Failed to calculate anomaly score', { 
      error: error.message 
    });
    return {
      riskScore: 0,
      riskLevel: 'UNKNOWN',
      factors: {},
      indicators: [],
      confidence: 0,
      error: error.message
    };
  }
}

// ============================================================================
// COORDINATED ATTACK DETECTION
// ============================================================================

/**
 * Detect coordinated attacks involving multiple members
 * 
 * Identifies patterns suggesting multiple accounts acting in concert,
 * which may indicate bot networks, compromised accounts, or insider collusion.
 * 
 * @param {Array} recentChanges - Recent role changes (last N minutes)
 * @param {number} timeWindowMs - Time window to analyze (milliseconds)
 * @returns {Object} Coordinated attack assessment
 * @property {boolean} detected - Whether coordinated activity was detected
 * @property {number} suspicionScore - Suspicion score (0-100)
 * @property {Array<string>} involvedMembers - Member IDs involved
 * @property {Array<string>} indicators - Evidence of coordination
 */
export function detectCoordinatedAttack(recentChanges, timeWindowMs = TIME_WINDOWS.SHORT) {
  try {
    if (recentChanges.length < 5) {
      return {
        detected: false,
        suspicionScore: 0,
        involvedMembers: [],
        indicators: []
      };
    }

    const indicators = [];
    let suspicionScore = 0;

    // Identify unique actors
    const actors = new Set();
    recentChanges.forEach(change => {
      if (change.actor) actors.add(change.actor);
      if (change.actorId) actors.add(change.actorId);
    });

    // Indicator 1: Multiple actors in short time window
    if (actors.size >= 3) {
      suspicionScore += 30;
      indicators.push(`${actors.size} different actors active in ${Math.round(timeWindowMs / 60000)} minutes`);
    }

    // Indicator 2: Similar timing patterns (changes clustered in time)
    const timestamps = recentChanges.map(c => new Date(c.timestamp).getTime());
    const timeDifferences = [];
    for (let i = 1; i < timestamps.length; i++) {
      timeDifferences.push(timestamps[i] - timestamps[i - 1]);
    }
    const avgTimeDiff = timeDifferences.reduce((sum, d) => sum + d, 0) / timeDifferences.length;
    const isClusteredTiming = avgTimeDiff < 5000; // Changes within 5 seconds of each other
    
    if (isClusteredTiming && actors.size > 1) {
      suspicionScore += 25;
      indicators.push(`Changes clustered within ${Math.round(avgTimeDiff / 1000)}s intervals (potential automation)`);
    }

    // Indicator 3: Similar target patterns (same members targeted)
    const targets = new Map();
    recentChanges.forEach(change => {
      const targetId = change.targetMemberId || change.memberId || 'unknown';
      targets.set(targetId, (targets.get(targetId) || 0) + 1);
    });
    const mostTargetedCount = Math.max(...targets.values());
    const mostTargeted = Array.from(targets.entries()).find(([_, count]) => count === mostTargetedCount);
    
    if (mostTargeted && mostTargeted[1] >= 3) {
      suspicionScore += 20;
      indicators.push(`Single member targeted ${mostTargeted[1]} times (potential gang-up)`);
    }

    // Indicator 4: Identical change types (all additions or all removals)
    const changeTypes = new Set(recentChanges.map(c => c.action || c.type));
    if (changeTypes.size === 1 && recentChanges.length >= 5) {
      suspicionScore += 15;
      indicators.push(`All changes of same type: ${Array.from(changeTypes)[0]} (potential coordinated operation)`);
    }

    // Indicator 5: New/unfamiliar actors (check if actors have recent history)
    const newActors = Array.from(actors).filter(actorId => {
      const actorHistory = recentChanges.filter(c => 
        c.actor === actorId || c.actorId === actorId
      );
      return actorHistory.length === recentChanges.length; // Only active in this window
    });
    
    if (newActors.length >= 2) {
      suspicionScore += 10;
      indicators.push(`${newActors.length} actors with no prior history in archive`);
    }

    const detected = suspicionScore >= 50;

    return {
      detected,
      suspicionScore,
      involvedMembers: Array.from(actors),
      indicators
    };
  } catch (error) {
    log('error', '[BehavioralAnalysis] Failed to detect coordinated attack', { 
      error: error.message 
    });
    return {
      detected: false,
      suspicionScore: 0,
      involvedMembers: [],
      indicators: [],
      error: error.message
    };
  }
}

/**
 * Assess account compromise risk for a specific member
 * 
 * Evaluates whether a member's recent activity suggests their account
 * has been compromised or is being used by an unauthorized party.
 * 
 * @param {string} memberId - Discord member ID
 * @param {Array} recentChanges - Recent changes by this member
 * @param {Object} memberBaseline - Member's historical baseline
 * @returns {Object} Compromise assessment
 * @property {boolean} compromised - Whether account appears compromised
 * @property {number} compromiseScore - Compromise likelihood (0-100)
 * @property {Array<string>} indicators - Evidence of compromise
 */
export function assessAccountCompromise(memberId, recentChanges, memberBaseline) {
  try {
    if (!memberBaseline || memberBaseline.confidence < 0.3) {
      return {
        compromised: false,
        compromiseScore: 0,
        indicators: ['Insufficient baseline data for compromise assessment']
      };
    }

    const indicators = [];
    let compromiseScore = 0;

    // Indicator 1: Dramatic volume increase
    const recentVolume = recentChanges.length;
    const historicalMaxVolume = memberBaseline.maxChangesInHour || 1;
    const volumeRatio = recentVolume / historicalMaxVolume;
    
    if (volumeRatio > 3) {
      compromiseScore += 30;
      indicators.push(`Activity volume ${volumeRatio.toFixed(1)}x higher than historical maximum`);
    }

    // Indicator 2: Activity during atypical hours
    const recentHours = new Set(recentChanges.map(c => new Date(c.timestamp).getUTCHours()));
    const atypicalHours = Array.from(recentHours).filter(h => 
      !memberBaseline.activeHours.includes(h)
    );
    
    if (atypicalHours.length > 0 && memberBaseline.activeHours.length > 0) {
      compromiseScore += 25;
      indicators.push(`Activity during ${atypicalHours.length} atypical hours (typical: ${memberBaseline.activeHours.join(', ')})`);
    }

    // Indicator 3: Targeting unfamiliar members
    const recentTargets = new Set(recentChanges.map(c => 
      c.targetMemberId || c.memberId || 'unknown'
    ));
    const newTargets = Array.from(recentTargets).filter(targetId => 
      !memberBaseline.targetDistribution[targetId]
    );
    
    if (newTargets.length >= 3) {
      compromiseScore += 20;
      indicators.push(`Targeting ${newTargets.length} members never targeted before`);
    }

    // Indicator 4: Rapid-fire changes (much faster than normal)
    const timestamps = recentChanges.map(c => new Date(c.timestamp).getTime()).sort((a, b) => a - b);
    if (timestamps.length > 1) {
      let totalTimeDiff = 0;
      for (let i = 1; i < timestamps.length; i++) {
        totalTimeDiff += timestamps[i] - timestamps[i - 1];
      }
      const avgTimeDiff = totalTimeDiff / (timestamps.length - 1);
      
      if (memberBaseline.avgTimeBetweenChanges > 0) {
        const velocityRatio = memberBaseline.avgTimeBetweenChanges / avgTimeDiff;
        if (velocityRatio > 5) {
          compromiseScore += 15;
          indicators.push(`Change velocity ${velocityRatio.toFixed(1)}x faster than historical average`);
        }
      }
    }

    // Indicator 5: Sudden behavioral shift (all indicators present)
    if (indicators.length >= 3) {
      compromiseScore += 10;
      indicators.push(`Multiple behavioral deviations detected simultaneously`);
    }

    const compromised = compromiseScore >= 60;

    return {
      compromised,
      compromiseScore,
      indicators
    };
  } catch (error) {
    log('error', '[BehavioralAnalysis] Failed to assess account compromise', { 
      memberId, 
      error: error.message 
    });
    return {
      compromised: false,
      compromiseScore: 0,
      indicators: [],
      error: error.message
    };
  }
}
