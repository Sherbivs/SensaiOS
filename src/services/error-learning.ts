/**
 * Error Learning Service — Pattern Detection and Impact Prediction
 * 
 * Analyzes error patterns over time to detect:
 * - Time-of-day clustering (errors spike at certain hours)
 * - Correlation patterns (error A often followed by error B)
 * - Cascade detection (single root cause triggers multiple errors)
 * - Recovery effectiveness (which strategies work best)
 * 
 * Uses historical data from ErrorLog table to build knowledge base and
 * predict impact of future errors.
 * 
 * Referenced By: docs/error-detection-system.md (Learning Engine section)
 *                docs/error-monitoring-logger-integration.md (Next Steps)
 * 
 * @module services/error-learning
 */

import { prisma } from '../models/index.js';
import { log } from '../shared/log.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Time-of-day pattern detection result
 */
export interface TimePattern {
  hour: number;              // Hour of day (0-23)
  errorCount: number;        // Number of errors in this hour
  errorRate: number;         // Errors per minute in this hour
  percentOfTotal: number;    // Percentage of total errors
  isAnomalous: boolean;      // True if >2x average rate
}

/**
 * Error correlation detection result
 */
export interface ErrorCorrelation {
  primaryFingerprint: string;    // The initial error
  secondaryFingerprint: string;  // The correlated error
  correlationStrength: number;   // 0-1 score (1 = always occurs together)
  timeDeltaMs: number;           // Average time between errors (ms)
  occurrences: number;           // How many times correlation observed
  confidence: number;            // Statistical confidence (0-1)
}

/**
 * Error cascade detection result
 */
export interface ErrorCascade {
  rootCauseFingerprint: string;  // The initial error that triggered cascade
  cascadedErrors: string[];      // Fingerprints of subsequent errors
  cascadeDepth: number;          // How many levels deep (1-3+)
  totalImpact: number;           // Total errors caused by root
  averageTimeToSpread: number;   // ms from root to cascade completion
  confidence: number;            // Statistical confidence (0-1)
}

/**
 * Impact prediction result
 */
export interface ImpactPrediction {
  predictedFeatures: string[];   // Features likely to be affected
  predictedSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  predictedUserImpact: number;   // Estimated number of users affected
  confidence: number;            // Prediction confidence (0-1)
  reasoning: string[];           // Why this prediction was made
}

/**
 * Recovery strategy effectiveness
 */
export interface RecoveryStrategy {
  strategyName: string;          // Name of recovery strategy
  errorCategory: string;         // Which category it applies to
  successRate: number;           // Success rate (0-1)
  averageRecoveryTime: number;   // ms to recover
  applicableCount: number;       // How many times attempted
  lastUsed: Date;                // Most recent usage
  effectiveness: 'HIGH' | 'MEDIUM' | 'LOW';  // Overall effectiveness
}

/**
 * Learning metadata update
 */
export interface LearningMetadata {
  timePatterns?: TimePattern[];
  correlations?: ErrorCorrelation[];
  cascades?: ErrorCascade[];
  recoveryStrategies?: RecoveryStrategy[];
  lastAnalyzed: Date;
  nextAnalysisDue: Date;
}

// ============================================================================
// Error Learning Service
// ============================================================================

export class ErrorLearningService {
  private analysisInProgress = false;
  
  /**
   * Detect time-of-day patterns in error occurrence.
   * Identifies hours when errors spike.
   * 
   * @param fingerprint - Optional: analyze specific error, or all errors if null
   * @param dayRange - Number of days to analyze (default: 7)
   * @returns Time patterns with anomaly detection
   */
  async detectTimePatterns(
    fingerprint: string | null = null,
    dayRange: number = 7
  ): Promise<TimePattern[]> {
    try {
      const startDate = new Date(Date.now() - dayRange * 24 * 60 * 60 * 1000);
      
      // Query errors grouped by hour of day
      const where = fingerprint ? { fingerprint } : {};
      const errors = await prisma.errorLog.findMany({
        where: {
          ...where,
          lastSeen: { gte: startDate },
        },
        select: {
          lastSeen: true,
          occurrenceCount: true,
        },
      });
      
      // Group by hour (0-23)
      const hourBuckets = new Array(24).fill(0).map((_, hour) => ({
        hour,
        errorCount: 0,
        errorRate: 0,
        percentOfTotal: 0,
        isAnomalous: false,
      }));
      
      let totalErrors = 0;
      errors.forEach(error => {
        const hour = new Date(error.lastSeen).getHours();
        hourBuckets[hour].errorCount += error.occurrenceCount;
        totalErrors += error.occurrenceCount;
      });
      
      // Calculate rates and percentages
      const averagePerHour = totalErrors / 24;
      const anomalyThreshold = averagePerHour * 2; // 2x average = anomaly
      
      hourBuckets.forEach(bucket => {
        bucket.errorRate = bucket.errorCount / (dayRange * 60); // errors per minute
        bucket.percentOfTotal = totalErrors > 0 ? (bucket.errorCount / totalErrors) * 100 : 0;
        bucket.isAnomalous = bucket.errorCount > anomalyThreshold;
      });
      
      return hourBuckets;
      
    } catch (error) {
      log.error('Error detecting time patterns', error);
      throw error;
    }
  }
  
  /**
   * Detect correlations between errors (error A often followed by error B).
   * Uses sliding time window to find temporal relationships.
   * 
   * @param windowMinutes - Time window to detect correlations (default: 5)
   * @param minOccurrences - Minimum occurrences to consider correlation (default: 3)
   * @returns Correlated error pairs with strength scores
   */
  async detectCorrelations(
    windowMinutes: number = 5,
    minOccurrences: number = 3
  ): Promise<ErrorCorrelation[]> {
    try {
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Last 7 days
      const windowMs = windowMinutes * 60 * 1000;
      
      // Get all errors sorted by time
      const errors = await prisma.errorLog.findMany({
        where: { lastSeen: { gte: startDate } },
        orderBy: { lastSeen: 'asc' },
        select: {
          fingerprint: true,
          lastSeen: true,
          errorName: true,
        },
      });
      
      // Find correlations using sliding window
      const correlationMap = new Map<string, {
        secondary: string;
        timeDeltaSum: number;
        occurrences: number;
      }>();
      
      for (let i = 0; i < errors.length - 1; i++) {
        const primary = errors[i];
        
        // Look ahead within time window
        for (let j = i + 1; j < errors.length; j++) {
          const secondary = errors[j];
          const timeDelta = new Date(secondary.lastSeen).getTime() - new Date(primary.lastSeen).getTime();
          
          // Outside window, stop looking
          if (timeDelta > windowMs) break;
          
          // Different errors within window = potential correlation
          if (primary.fingerprint !== secondary.fingerprint) {
            const key = `${primary.fingerprint}→${secondary.fingerprint}`;
            const existing = correlationMap.get(key);
            
            if (existing) {
              existing.timeDeltaSum += timeDelta;
              existing.occurrences++;
            } else {
              correlationMap.set(key, {
                secondary: secondary.fingerprint,
                timeDeltaSum: timeDelta,
                occurrences: 1,
              });
            }
          }
        }
      }
      
      // Build correlation results
      const correlations: ErrorCorrelation[] = [];
      
      for (const [key, data] of correlationMap.entries()) {
        if (data.occurrences >= minOccurrences) {
          const [primary, secondary] = key.split('→');
          
          // Calculate correlation strength (0-1)
          const primaryCount = errors.filter(e => e.fingerprint === primary).length;
          const strength = data.occurrences / primaryCount;
          
          // Confidence based on sample size
          const confidence = Math.min(data.occurrences / 10, 1); // 10+ occurrences = 100% confidence
          
          correlations.push({
            primaryFingerprint: primary,
            secondaryFingerprint: secondary,
            correlationStrength: strength,
            timeDeltaMs: data.timeDeltaSum / data.occurrences,
            occurrences: data.occurrences,
            confidence,
          });
        }
      }
      
      // Sort by correlation strength (strongest first)
      return correlations.sort((a, b) => b.correlationStrength - a.correlationStrength);
      
    } catch (error) {
      log.error('Error detecting correlations', error);
      throw error;
    }
  }
  
  /**
   * Detect error cascades (single root cause triggers multiple errors).
   * Identifies chains of related errors spreading through the system.
   * 
   * @param maxDepth - Maximum cascade depth to analyze (default: 3)
   * @returns Detected cascades with root causes
   */
  async detectCascades(maxDepth: number = 3): Promise<ErrorCascade[]> {
    try {
      // Get correlations first
      const correlations = await this.detectCorrelations(5, 2);
      
      // Build cascade chains from correlations
      const cascadeMap = new Map<string, {
        cascadedErrors: Set<string>;
        timeDeltaSum: number;
        cascadeCount: number;
      }>();
      
      // Find chains: A → B → C
      for (const corr of correlations) {
        const root = corr.primaryFingerprint;
        const child = corr.secondaryFingerprint;
        
        // Initialize or update cascade
        let cascade = cascadeMap.get(root);
        if (!cascade) {
          cascade = {
            cascadedErrors: new Set(),
            timeDeltaSum: 0,
            cascadeCount: 0,
          };
          cascadeMap.set(root, cascade);
        }
        
        cascade.cascadedErrors.add(child);
        cascade.timeDeltaSum += corr.timeDeltaMs;
        cascade.cascadeCount++;
        
        // Check if child is also a root (multi-level cascade)
        const childCorrelations = correlations.filter(c => c.primaryFingerprint === child);
        if (childCorrelations.length > 0) {
          childCorrelations.forEach(cc => {
            cascade!.cascadedErrors.add(cc.secondaryFingerprint);
            cascade!.timeDeltaSum += cc.timeDeltaMs;
            cascade!.cascadeCount++;
          });
        }
      }
      
      // Build cascade results
      const cascades: ErrorCascade[] = [];
      
      for (const [root, data] of cascadeMap.entries()) {
        if (data.cascadedErrors.size >= 2) { // At least 2 cascaded errors
          const depth = Math.min(data.cascadedErrors.size, maxDepth);
          const confidence = Math.min(data.cascadeCount / 5, 1); // 5+ observations = 100% confidence
          
          cascades.push({
            rootCauseFingerprint: root,
            cascadedErrors: Array.from(data.cascadedErrors),
            cascadeDepth: depth,
            totalImpact: data.cascadedErrors.size + 1, // +1 for root
            averageTimeToSpread: data.timeDeltaSum / data.cascadeCount,
            confidence,
          });
        }
      }
      
      // Sort by total impact (most impactful first)
      return cascades.sort((a, b) => b.totalImpact - a.totalImpact);
      
    } catch (error) {
      log.error('Error detecting cascades', error);
      throw error;
    }
  }
  
  /**
   * Predict impact of an error based on historical patterns.
   * Estimates which features will be affected and how many users impacted.
   * 
   * @param errorName - Name of the error
   * @param category - Error category
   * @param context - Additional context data
   * @returns Impact prediction with confidence score
   */
  async predictImpact(
    errorName: string,
    category: string,
    _context: Record<string, unknown> = {}
  ): Promise<ImpactPrediction> {
    try {
      // Find similar historical errors
      const historicalErrors = await prisma.errorLog.findMany({
        where: {
          OR: [
            { errorName },
            { category },
          ],
        },
        select: {
          impactedFeatures: true,
          estimatedUserImpact: true,
          severity: true,
          occurrenceCount: true,
        },
        orderBy: { occurrenceCount: 'desc' },
        take: 20,
      });
      
      if (historicalErrors.length === 0) {
        // No historical data, use conservative prediction
        return {
          predictedFeatures: [],
          predictedSeverity: 'MEDIUM',
          predictedUserImpact: 0,
          confidence: 0.1,
          reasoning: ['No historical data available', 'Conservative prediction based on category'],
        };
      }
      
      // Aggregate features from historical errors
      const featureCount = new Map<string, number>();
      let totalUserImpact = 0;
      const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      
      historicalErrors.forEach(err => {
        // Count feature occurrences
        (err.impactedFeatures || []).forEach((feature: string) => {
          featureCount.set(feature, (featureCount.get(feature) || 0) + 1);
        });
        
        // Sum user impact
        totalUserImpact += err.estimatedUserImpact || 0;
        
        // Count severity occurrences
        if (err.severity in severityCounts) {
          severityCounts[err.severity as keyof typeof severityCounts]++;
        }
      });
      
      // Predict features (appearing in >30% of cases)
      const threshold = historicalErrors.length * 0.3;
      const predictedFeatures = Array.from(featureCount.entries())
        .filter(([, count]) => count >= threshold)
        .sort((a, b) => b[1] - a[1])
        .map(([feature]) => feature);
      
      // Predict severity (most common)
      const predictedSeverity = (Object.entries(severityCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'MEDIUM') as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      
      // Predict user impact (average)
      const predictedUserImpact = Math.round(totalUserImpact / historicalErrors.length);
      
      // Calculate confidence based on sample size
      const confidence = Math.min(historicalErrors.length / 10, 1); // 10+ samples = 100% confidence
      
      // Build reasoning
      const reasoning = [
        `Based on ${historicalErrors.length} similar historical errors`,
        `Features affected in >${Math.round(threshold)}/${historicalErrors.length} cases`,
        `Severity pattern: ${predictedSeverity} (${severityCounts[predictedSeverity as keyof typeof severityCounts]} occurrences)`,
        `Average user impact: ${predictedUserImpact} users`,
      ];
      
      return {
        predictedFeatures,
        predictedSeverity,
        predictedUserImpact,
        confidence,
        reasoning,
      };
      
    } catch (error) {
      log.error('Error predicting impact', error);
      throw error;
    }
  }
  
  /**
   * Suggest mitigation strategies based on historical recovery success rates.
   * Recommends the most effective recovery approach for a given error.
   * 
   * @param errorName - Name of the error
   * @param category - Error category
   * @returns Recommended recovery strategies with effectiveness scores
   */
  async suggestMitigation(
    errorName: string,
    category: string
  ): Promise<RecoveryStrategy[]> {
    try {
      // Find historical errors with recovery attempts
      const historicalErrors = await prisma.errorLog.findMany({
        where: {
          OR: [
            { errorName },
            { category },
          ],
          recoveryAttempted: { gt: 0 },
        },
        select: {
          recoveryAttempted: true,
          recoverySuccess: true,
          learningMetadata: true,
          lastSeen: true,
        },
      });
      
      if (historicalErrors.length === 0) {
        // No recovery data, return generic strategies
        return this.getGenericStrategies(category);
      }
      
      // Extract recovery strategies from learning metadata
      const strategyMap = new Map<string, {
        successCount: number;
        attemptCount: number;
        totalRecoveryTime: number;
        lastUsed: Date;
      }>();
      
      historicalErrors.forEach(err => {
        const metadata = err.learningMetadata as any;
        const strategies = metadata?.recoveryStrategies || [];
        
        strategies.forEach((strategy: any) => {
          const existing = strategyMap.get(strategy.strategyName);
          if (existing) {
            existing.successCount += strategy.successCount || 0;
            existing.attemptCount += strategy.attemptCount || 0;
            existing.totalRecoveryTime += strategy.recoveryTime || 0;
            if (new Date(strategy.lastUsed) > existing.lastUsed) {
              existing.lastUsed = new Date(strategy.lastUsed);
            }
          } else {
            strategyMap.set(strategy.strategyName, {
              successCount: strategy.successCount || 0,
              attemptCount: strategy.attemptCount || 0,
              totalRecoveryTime: strategy.recoveryTime || 0,
              lastUsed: new Date(strategy.lastUsed || err.lastSeen),
            });
          }
        });
      });
      
      // Build recovery strategy results
      const strategies: RecoveryStrategy[] = [];
      
      for (const [name, data] of strategyMap.entries()) {
        const successRate = data.attemptCount > 0 ? data.successCount / data.attemptCount : 0;
        const averageRecoveryTime = data.successCount > 0 ? data.totalRecoveryTime / data.successCount : 0;
        
        let effectiveness: 'HIGH' | 'MEDIUM' | 'LOW';
        if (successRate >= 0.8) effectiveness = 'HIGH';
        else if (successRate >= 0.5) effectiveness = 'MEDIUM';
        else effectiveness = 'LOW';
        
        strategies.push({
          strategyName: name,
          errorCategory: category,
          successRate,
          averageRecoveryTime,
          applicableCount: data.attemptCount,
          lastUsed: data.lastUsed,
          effectiveness,
        });
      }
      
      // Sort by effectiveness and success rate
      return strategies.sort((a, b) => {
        const effectivenessScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const aScore = effectivenessScore[a.effectiveness];
        const bScore = effectivenessScore[b.effectiveness];
        if (aScore !== bScore) return bScore - aScore;
        return b.successRate - a.successRate;
      });
      
    } catch (error) {
      log.error('Error suggesting mitigation', error);
      throw error;
    }
  }
  
  /**
   * Get generic recovery strategies when no historical data available.
   * @param category - Error category
   * @returns Generic strategies for category
   */
  private getGenericStrategies(category: string): RecoveryStrategy[] {
    const now = new Date();
    
    const strategies: Record<string, RecoveryStrategy[]> = {
      DATABASE: [
        {
          strategyName: 'exponential-backoff-retry',
          errorCategory: 'DATABASE',
          successRate: 0.7,
          averageRecoveryTime: 5000,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'HIGH',
        },
        {
          strategyName: 'connection-pool-reset',
          errorCategory: 'DATABASE',
          successRate: 0.6,
          averageRecoveryTime: 2000,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'MEDIUM',
        },
      ],
      DISCORD: [
        {
          strategyName: 'rate-limit-queue',
          errorCategory: 'DISCORD',
          successRate: 0.9,
          averageRecoveryTime: 1000,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'HIGH',
        },
        {
          strategyName: 'permission-validation',
          errorCategory: 'DISCORD',
          successRate: 0.5,
          averageRecoveryTime: 0,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'MEDIUM',
        },
      ],
      WORKER: [
        {
          strategyName: 'worker-restart',
          errorCategory: 'WORKER',
          successRate: 0.8,
          averageRecoveryTime: 3000,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'HIGH',
        },
        {
          strategyName: 'task-queue-clear',
          errorCategory: 'WORKER',
          successRate: 0.6,
          averageRecoveryTime: 1000,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'MEDIUM',
        },
      ],
      CACHE: [
        {
          strategyName: 'cache-rebuild',
          errorCategory: 'CACHE',
          successRate: 0.85,
          averageRecoveryTime: 10000,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'HIGH',
        },
        {
          strategyName: 'cache-clear',
          errorCategory: 'CACHE',
          successRate: 0.7,
          averageRecoveryTime: 500,
          applicableCount: 0,
          lastUsed: now,
          effectiveness: 'MEDIUM',
        },
      ],
    };
    
    return strategies[category] || [];
  }
  
  /**
   * Update knowledge base with learning from new errors.
   * Runs periodically to analyze error patterns and update ErrorLog.learningMetadata.
   * 
   * @param forceUpdate - Force update even if analysis recently completed
   * @returns Number of errors updated with new learning data
   */
  async updateKnowledgeBase(forceUpdate: boolean = false): Promise<number> {
    if (this.analysisInProgress && !forceUpdate) {
      log.info('Error learning analysis already in progress, skipping');
      return 0;
    }
    
    try {
      this.analysisInProgress = true;
      log.info('Starting error learning knowledge base update');
      
      // Detect patterns
      const _timePatterns = await this.detectTimePatterns(null, 7);
      const correlations = await this.detectCorrelations(5, 3);
      const cascades = await this.detectCascades(3);
      
      // Get all unique errors for metadata update
      const errors = await prisma.errorLog.findMany({
        select: {
          errorId: true,
          fingerprint: true,
          errorName: true,
          category: true,
          learningMetadata: true,
        },
      });
      
      let updateCount = 0;
      
      // Update each error with relevant learning data
      for (const error of errors) {
        // Find relevant time patterns
        const errorTimePatterns = await this.detectTimePatterns(error.fingerprint, 7);
        
        // Find correlations where this error is involved
        const relevantCorrelations = correlations.filter(
          c => c.primaryFingerprint === error.fingerprint || c.secondaryFingerprint === error.fingerprint
        );
        
        // Find cascades where this error is root or cascaded
        const relevantCascades = cascades.filter(
          c => c.rootCauseFingerprint === error.fingerprint || c.cascadedErrors.includes(error.fingerprint)
        );
        
        // Get recovery strategies
        const strategies = await this.suggestMitigation(error.errorName, error.category);
        
        // Build learning metadata
        const learningMetadata: LearningMetadata = {
          timePatterns: errorTimePatterns,
          correlations: relevantCorrelations,
          cascades: relevantCascades,
          recoveryStrategies: strategies,
          lastAnalyzed: new Date(),
          nextAnalysisDue: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        };
        
        // Update error with learning metadata
        await prisma.errorLog.update({
          where: { errorId: error.errorId },
          data: {
            learningMetadata: learningMetadata as any,
          },
        });
        
        updateCount++;
      }
      
      log.info(`Error learning knowledge base updated: ${updateCount} errors analyzed`);
      return updateCount;
      
    } catch (error) {
      log.error('Error updating knowledge base', error);
      throw error;
    } finally {
      this.analysisInProgress = false;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const errorLearning = new ErrorLearningService();
