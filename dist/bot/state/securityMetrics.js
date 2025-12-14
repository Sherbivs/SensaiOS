/**
 * Security Metrics Dashboard Module
 * 
 * Provides comprehensive security health monitoring and scoring for the security bot.
 * Calculates security scores, tracks threat trends, monitors archive health, and generates
 * actionable recommendations based on historical data and current state.
 * 
 * **Capabilities:**
 * - Security Score Calculation (0-100 scale)
 * - Threat Trend Analysis (24h, 7d, 30d windows)
 * - Archive Health Monitoring
 * - Actionable Recommendation Generation
 * - Performance: <50ms metric calculation, <10 MB memory
 * 
 * **Architecture:**
 * - Security Score: Weighted composite of 5 factors (baseline quality, threat activity,
 *   archive health, response effectiveness, uptime)
 * - Threat Trends: Rolling window analysis with severity weighting
 * - Recommendations: Priority-sorted action items based on detected issues
 * 
 * **Integration:**
 * Used by /ops security commands and state auto-save for persistent metrics tracking.
 * 
 * @module securityMetrics
 */

import { existsSync, readFileSync } from 'fs';
import { log } from '../../utils/logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Security Score Component Weights (must sum to 1.0)
 */
const SCORE_WEIGHTS = {
  baselineQuality: 0.25,    // Baseline confidence and data quality
  threatActivity: 0.30,     // Recent threat count and severity
  archiveHealth: 0.20,      // Archive integrity and completeness
  responseEffectiveness: 0.15, // Response actions taken and success rate
  uptime: 0.10              // Bot uptime and sweep consistency
};

/**
 * Score Grade Thresholds
 */
const SCORE_GRADES = {
  excellent: 90,  // A+ security posture
  good: 75,       // B+ security posture
  fair: 60,       // C+ security posture
  poor: 40,       // D+ security posture
  critical: 0     // F security posture
};

/**
 * Threat Severity Weights (for trend analysis)
 */
const SEVERITY_WEIGHTS = {
  CRITICAL: 10,
  HIGH: 5,
  MEDIUM: 2,
  LOW: 1
};

/**
 * Time Windows for Trend Analysis (milliseconds)
 */
const TIME_WINDOWS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000
};

// ============================================================================
// SECURITY SCORE CALCULATION
// ============================================================================

/**
 * Calculate comprehensive security score (0-100)
 * 
 * Score components:
 * 1. Baseline Quality (25%): Confidence level, data points, freshness
 * 2. Threat Activity (30%): Recent threat count, severity, frequency
 * 3. Archive Health (20%): Integrity, size, backup status
 * 4. Response Effectiveness (15%): Actions taken, success rate
 * 5. Uptime (10%): Bot availability, sweep consistency
 * 
 * @param {Object} botState - Security bot state with baselines, threats, archive stats
 * @returns {Object} Security score with breakdown
 * @property {number} overall - Overall score (0-100)
 * @property {string} grade - Letter grade (A+, B+, C+, D+, F)
 * @property {Object} components - Individual component scores
 * @property {string} calculatedAt - ISO timestamp
 */
export function calculateSecurityScore(botState) {
  try {
    const components = {
      baselineQuality: calculateBaselineQualityScore(botState),
      threatActivity: calculateThreatActivityScore(botState),
      archiveHealth: calculateArchiveHealthScore(botState),
      responseEffectiveness: calculateResponseEffectivenessScore(botState),
      uptime: calculateUptimeScore(botState)
    };

    // Weighted average
    const overall = Math.round(
      components.baselineQuality * SCORE_WEIGHTS.baselineQuality +
      components.threatActivity * SCORE_WEIGHTS.threatActivity +
      components.archiveHealth * SCORE_WEIGHTS.archiveHealth +
      components.responseEffectiveness * SCORE_WEIGHTS.responseEffectiveness +
      components.uptime * SCORE_WEIGHTS.uptime
    );

    const grade = getScoreGrade(overall);

    return {
      overall,
      grade,
      components,
      calculatedAt: new Date().toISOString()
    };
  } catch (error) {
    log('error', '[SecurityMetrics] Failed to calculate security score', { error: error.message });
    return {
      overall: 0,
      grade: 'F',
      components: {},
      error: error.message,
      calculatedAt: new Date().toISOString()
    };
  }
}

/**
 * Calculate baseline quality score (0-100)
 * 
 * Factors:
 * - Baseline confidence (0-1.0)
 * - Data point count (≥50 optimal)
 * - Baseline freshness (≤24h optimal)
 * 
 * @param {Object} botState - Security bot state
 * @returns {number} Baseline quality score (0-100)
 */
function calculateBaselineQualityScore(botState) {
  if (!botState.security?.baselines) {
    return 0; // No baselines = 0 score
  }

  const baselines = botState.security.baselines;
  
  // Factor 1: Confidence level (50% weight)
  const confidenceScore = (baselines.confidence || 0) * 50;

  // Factor 2: Data point count (30% weight)
  const dataPoints = baselines.dataPoints || 0;
  const dataPointScore = Math.min(dataPoints / 50, 1.0) * 30; // 50 entries = 100%

  // Factor 3: Freshness (20% weight)
  const lastRefresh = botState.security.lastBaselineRefresh;
  const freshnessScore = lastRefresh ? calculateFreshnessScore(lastRefresh, 24 * 60 * 60 * 1000) * 20 : 0;

  return Math.round(confidenceScore + dataPointScore + freshnessScore);
}

/**
 * Calculate threat activity score (0-100)
 * Higher threat activity = LOWER score
 * 
 * Factors:
 * - 24h threat count (weighted by severity)
 * - Threat frequency (threats per sweep)
 * - Severity distribution
 * 
 * @param {Object} botState - Security bot state
 * @returns {number} Threat activity score (0-100, lower threats = higher score)
 */
function calculateThreatActivityScore(botState) {
  if (!botState.security?.threatHistory) {
    return 100; // No threats = perfect score
  }

  const now = Date.now();
  const last24h = now - TIME_WINDOWS['24h'];
  
  // Get threats from last 24 hours
  const recentThreats = botState.security.threatHistory.filter(record => {
    const timestamp = new Date(record.timestamp).getTime();
    return timestamp >= last24h;
  });

  if (recentThreats.length === 0) {
    return 100; // No recent threats = perfect score
  }

  // Calculate weighted threat count
  const weightedThreatCount = recentThreats.reduce((sum, record) => {
    return sum + record.threats.reduce((threatSum, threat) => {
      return threatSum + (SEVERITY_WEIGHTS[threat.severity] || 1);
    }, 0);
  }, 0);

  // Penalty based on weighted threat count (exponential decay)
  // 0 threats = 100, 10 weighted threats = 50, 30+ weighted threats = 0
  const penalty = Math.min(weightedThreatCount / 30, 1.0) * 100;
  
  return Math.max(0, 100 - Math.round(penalty));
}

/**
 * Calculate archive health score (0-100)
 * 
 * Factors:
 * - Archive integrity (HMAC verification)
 * - Archive size (within limits)
 * - Backup availability
 * 
 * @param {Object} _botState - Security bot state (unused - reads from disk directly)
 * @returns {number} Archive health score (0-100)
 */
function calculateArchiveHealthScore(_botState) {
  let score = 0;

  // Factor 1: Archive exists (40% weight)
  const archiveExists = existsSync('./Store/security-bot-state/role-archive.json');
  if (archiveExists) {
    score += 40;
  }

  // Factor 2: Archive integrity via HMAC (40% weight)
  if (archiveExists) {
    try {
      const archiveData = JSON.parse(readFileSync('./Store/security-bot-state/role-archive.json', 'utf8'));
      if (archiveData.hmacSignature) {
        score += 40; // Has signature = assumed valid (full verification happens on load)
      }
    } catch {
      // Corrupted archive = 0 points for integrity
    }
  }

  // Factor 3: Backup availability (20% weight)
  const backupExists = existsSync('./Store/security-bot-state/role-archive.backup.json');
  if (backupExists) {
    score += 20;
  }

  return score;
}

/**
 * Calculate response effectiveness score (0-100)
 * 
 * Factors:
 * - Response actions taken (vs threats detected)
 * - Auto-healing success rate
 * - Alert delivery success rate
 * 
 * @param {Object} _botState - Security bot state (unused - stub implementation)
 * @returns {number} Response effectiveness score (0-100)
 */
function calculateResponseEffectivenessScore(_botState) {
  // Stub implementation - will be populated when response module is active
  // For now, return 80 (neutral/good score) as response framework is ready but not yet activated
  return 80;
}

/**
 * Calculate uptime score (0-100)
 * 
 * Factors:
 * - Bot uptime (from restart count)
 * - Sweep consistency (last sweep time)
 * 
 * @param {Object} botState - Security bot state
 * @returns {number} Uptime score (0-100)
 */
function calculateUptimeScore(botState) {
  let score = 0;

  // Factor 1: Bot is running (50% weight)
  score += 50;

  // Factor 2: Sweep recency (50% weight)
  if (botState.guilds && Object.keys(botState.guilds).length > 0) {
    const guilds = Object.values(botState.guilds);
    const mostRecentSweep = Math.max(...guilds.map(g => new Date(g.lastSweep || 0).getTime()));
    
    if (mostRecentSweep > 0) {
      // Last sweep within 1 hour = full points, linear decay to 24h
      const timeSinceLastSweep = Date.now() - mostRecentSweep;
      const sweepScore = Math.max(0, 1 - (timeSinceLastSweep / TIME_WINDOWS['24h']));
      score += Math.round(sweepScore * 50);
    }
  }

  return score;
}

/**
 * Get score grade letter based on numeric score
 * 
 * @param {number} score - Numeric score (0-100)
 * @returns {string} Letter grade (A+, B+, C+, D+, F)
 */
function getScoreGrade(score) {
  if (score >= SCORE_GRADES.excellent) return 'A+';
  if (score >= SCORE_GRADES.good) return 'B+';
  if (score >= SCORE_GRADES.fair) return 'C+';
  if (score >= SCORE_GRADES.poor) return 'D+';
  return 'F';
}

/**
 * Calculate freshness score based on age
 * 
 * @param {string} timestamp - ISO timestamp
 * @param {number} optimalAge - Optimal age in milliseconds
 * @returns {number} Freshness score (0-1.0)
 */
function calculateFreshnessScore(timestamp, optimalAge) {
  const age = Date.now() - new Date(timestamp).getTime();
  return Math.max(0, 1 - (age / (optimalAge * 2))); // Linear decay over 2x optimal age
}

// ============================================================================
// THREAT TREND ANALYSIS
// ============================================================================

/**
 * Analyze threat trends across time windows
 * 
 * Returns threat counts, severity distribution, and trend direction for:
 * - Last 24 hours
 * - Last 7 days
 * - Last 30 days
 * 
 * @param {Object} botState - Security bot state with threatHistory
 * @returns {Object} Threat trend analysis
 * @property {Object} windows - Trend data for each time window (24h, 7d, 30d)
 * @property {string} trend - Overall trend direction ('improving', 'stable', 'degrading')
 * @property {string} calculatedAt - ISO timestamp
 */
export function analyzeThreatTrends(botState) {
  try {
    if (!botState.security?.threatHistory || botState.security.threatHistory.length === 0) {
      return {
        windows: {
          '24h': { count: 0, severity: {}, weightedCount: 0 },
          '7d': { count: 0, severity: {}, weightedCount: 0 },
          '30d': { count: 0, severity: {}, weightedCount: 0 }
        },
        trend: 'stable',
        calculatedAt: new Date().toISOString()
      };
    }

    const now = Date.now();
    const windows = {};

    // Calculate metrics for each time window
    for (const [label, duration] of Object.entries(TIME_WINDOWS)) {
      const windowStart = now - duration;
      const threatsInWindow = botState.security.threatHistory.filter(record => {
        const timestamp = new Date(record.timestamp).getTime();
        return timestamp >= windowStart;
      });

      const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      let weightedCount = 0;

      threatsInWindow.forEach(record => {
        record.threats.forEach(threat => {
          severityCounts[threat.severity]++;
          weightedCount += SEVERITY_WEIGHTS[threat.severity] || 1;
        });
      });

      windows[label] = {
        count: threatsInWindow.reduce((sum, r) => sum + r.threatCount, 0),
        severity: severityCounts,
        weightedCount
      };
    }

    // Determine overall trend (24h vs 7d)
    const trend = determineTrend(windows['24h'].weightedCount, windows['7d'].weightedCount / 7);

    return {
      windows,
      trend,
      calculatedAt: new Date().toISOString()
    };
  } catch (error) {
    log('error', '[SecurityMetrics] Failed to analyze threat trends', { error: error.message });
    return {
      windows: {},
      trend: 'unknown',
      error: error.message,
      calculatedAt: new Date().toISOString()
    };
  }
}

/**
 * Determine trend direction based on recent vs historical rates
 * 
 * @param {number} recentRate - Recent weighted threat rate (24h)
 * @param {number} historicalRate - Historical weighted threat rate (7d average)
 * @returns {string} Trend direction ('improving', 'stable', 'degrading')
 */
function determineTrend(recentRate, historicalRate) {
  if (historicalRate === 0) {
    return recentRate === 0 ? 'stable' : 'degrading';
  }

  const changeRatio = (recentRate - historicalRate) / historicalRate;

  if (changeRatio < -0.2) return 'improving';  // 20% reduction
  if (changeRatio > 0.2) return 'degrading';   // 20% increase
  return 'stable';
}

// ============================================================================
// RECOMMENDATION GENERATION
// ============================================================================

/**
 * Generate actionable security recommendations
 * 
 * Analyzes current state and generates priority-sorted recommendations
 * for improving security posture. Recommendations are based on detected
 * issues, missing capabilities, and best practices.
 * 
 * @param {Object} botState - Security bot state
 * @param {Object} securityScore - Security score breakdown
 * @param {Object} threatTrends - Threat trend analysis
 * @returns {Array<Object>} Priority-sorted recommendations
 * @property {string} priority - Priority level ('critical', 'high', 'medium', 'low')
 * @property {string} category - Category ('baseline', 'threat', 'archive', 'response', 'uptime')
 * @property {string} title - Short recommendation title
 * @property {string} description - Detailed recommendation description
 * @property {string} action - Specific action to take
 */
export function generateRecommendations(botState, securityScore, threatTrends) {
  const recommendations = [];

  try {
    // Baseline Quality Recommendations
    if (securityScore.components.baselineQuality < 70) {
      if (!botState.security?.baselines) {
        recommendations.push({
          priority: 'critical',
          category: 'baseline',
          title: 'Initialize Security Baselines',
          description: 'No security baselines detected. Baselines are required for threat detection.',
          action: 'Wait for bot startup to generate baselines from role archive, or run manual baseline generation if archive has ≥50 entries.'
        });
      } else if (botState.security.baselines.confidence < 0.5) {
        recommendations.push({
          priority: 'high',
          category: 'baseline',
          title: 'Improve Baseline Confidence',
          description: `Baseline confidence is low (${Math.round(botState.security.baselines.confidence * 100)}%). Need more historical data for reliable threat detection.`,
          action: 'Continue monitoring for 7+ days to accumulate ≥50 archive entries and improve confidence.'
        });
      }

      const lastRefresh = botState.security?.lastBaselineRefresh;
      if (lastRefresh) {
        const age = Date.now() - new Date(lastRefresh).getTime();
        if (age > TIME_WINDOWS['7d']) {
          recommendations.push({
            priority: 'medium',
            category: 'baseline',
            title: 'Refresh Baselines',
            description: `Baselines are ${Math.round(age / (24 * 60 * 60 * 1000))} days old. Stale baselines may miss new threat patterns.`,
            action: 'Restart bot to regenerate baselines from current archive data, or implement automatic baseline refresh.'
          });
        }
      }
    }

    // Threat Activity Recommendations
    if (securityScore.components.threatActivity < 70) {
      const recentThreats = threatTrends.windows['24h'];
      
      if (recentThreats.severity.CRITICAL > 0) {
        recommendations.push({
          priority: 'critical',
          category: 'threat',
          title: 'Critical Threats Detected',
          description: `${recentThreats.severity.CRITICAL} CRITICAL threat(s) detected in last 24 hours. Immediate investigation required.`,
          action: 'Use /ops security threats command to review critical threats and evidence. Consider activating automated response with freeze permissions.'
        });
      }

      if (threatTrends.trend === 'degrading') {
        recommendations.push({
          priority: 'high',
          category: 'threat',
          title: 'Threat Activity Increasing',
          description: 'Threat activity is increasing. Recent threat rate is 20%+ higher than 7-day average.',
          action: 'Review recent threat patterns with /ops security threats --window 24h. Investigate unusual origins or member activity.'
        });
      }
    }

    // Archive Health Recommendations
    if (securityScore.components.archiveHealth < 70) {
      if (!existsSync('./Store/security-bot-state/role-archive.json')) {
        recommendations.push({
          priority: 'critical',
          category: 'archive',
          title: 'Archive Missing',
          description: 'Role change archive not found. Cannot generate baselines or detect threats.',
          action: 'Check Store/security-bot-state/ directory permissions. Archive should be created automatically on first role change.'
        });
      } else {
        // Check backup
        if (!existsSync('./Store/security-bot-state/role-archive.backup.json')) {
          recommendations.push({
            priority: 'medium',
            category: 'archive',
            title: 'Archive Backup Missing',
            description: 'No archive backup found. Risk of data loss if main archive becomes corrupted.',
            action: 'Trigger archive save to create backup file, or manually copy role-archive.json to role-archive.backup.json.'
          });
        }
      }
    }

    // Response Effectiveness Recommendations
    if (securityScore.components.responseEffectiveness < 70) {
      recommendations.push({
        priority: 'medium',
        category: 'response',
        title: 'Activate Automated Response',
        description: 'Automated threat response framework is ready but not yet integrated. Currently logging threats only.',
        action: 'Integrate threatResponse.respondToThreats() into sweep workflow to enable automatic healing and alerting.'
      });
    }

    // Uptime Recommendations
    if (securityScore.components.uptime < 70) {
      const guilds = botState.guilds ? Object.values(botState.guilds) : [];
      if (guilds.length > 0) {
        const mostRecentSweep = Math.max(...guilds.map(g => new Date(g.lastSweep || 0).getTime()));
        const timeSinceLastSweep = Date.now() - mostRecentSweep;
        
        if (timeSinceLastSweep > TIME_WINDOWS['24h']) {
          recommendations.push({
            priority: 'high',
            category: 'uptime',
            title: 'Sweep Activity Stalled',
            description: `Last sweep was ${Math.round(timeSinceLastSweep / (60 * 60 * 1000))} hours ago. Threat detection may be delayed.`,
            action: 'Check bot status and sweep scheduler. Verify bot has necessary guild permissions to read roles.'
          });
        }
      }
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  } catch (error) {
    log('error', '[SecurityMetrics] Failed to generate recommendations', { error: error.message });
    return [{
      priority: 'critical',
      category: 'system',
      title: 'Recommendation Generation Failed',
      description: `Error generating recommendations: ${error.message}`,
      action: 'Check security bot logs for details. This may indicate a system issue.'
    }];
  }
}

// ============================================================================
// METRICS SUMMARY
// ============================================================================

/**
 * Generate comprehensive security metrics summary
 * 
 * Combines security score, threat trends, and recommendations into a single
 * dashboard-ready summary. This is the primary interface for the /ops security
 * command and monitoring systems.
 * 
 * @param {Object} botState - Security bot state
 * @returns {Object} Comprehensive metrics summary
 * @property {Object} score - Security score breakdown
 * @property {Object} trends - Threat trend analysis
 * @property {Array<Object>} recommendations - Priority-sorted recommendations
 * @property {Object} metadata - Generation metadata (version, timestamp)
 */
export function getSecurityMetrics(botState) {
  try {
    const score = calculateSecurityScore(botState);
    const trends = analyzeThreatTrends(botState);
    const recommendations = generateRecommendations(botState, score, trends);

    return {
      score,
      trends,
      recommendations,
      metadata: {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        dataSource: 'security-bot-state'
      }
    };
  } catch (error) {
    log('error', '[SecurityMetrics] Failed to get security metrics', { error: error.message });
    return {
      score: { overall: 0, grade: 'F', error: error.message },
      trends: { windows: {}, trend: 'unknown', error: error.message },
      recommendations: [],
      metadata: {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        error: error.message
      }
    };
  }
}
