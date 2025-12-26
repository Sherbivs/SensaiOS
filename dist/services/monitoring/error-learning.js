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
 * PHASE 2A INTEGRATION (2025-12-21):
 * - Now uses ErrorResolution table for strategy effectiveness tracking
 * - getLearnedStrategies() queries real resolution history
 * - suggestMitigation() now returns learned strategies first, then generic fallbacks
 *
 * PHASE 2B INTEGRATION (2025-12-21):
 * - Now uses ErrorDependency table for cascade persistence
 * - persistCascade() saves detected cascades with statistical tracking
 * - getCascadeRisk() predicts downstream impact from learned cascades
 * - findRootCause() traces back from child error to root cause
 * - detectCascades() auto-persists discovered cascades to database
 *
 * PHASE 2C INTEGRATION (2025-12-21):
 * - Now uses ErrorKnowledge table for pattern persistence
 * - persistTimePattern() saves time-of-day spike patterns
 * - persistCorrelationPattern() saves error correlation patterns
 * - getKnowledge() queries learned patterns by type/confidence/fingerprint
 * - updateKnowledgeBase() auto-persists discovered patterns to database
 *
 * Referenced By: docs/error-detection-system.md (Learning Engine section)
 *                docs/error-monitoring-logger-integration.md (Next Steps)
 *
 * @module services/error-learning
 */
// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../../shared/logging/index.js';
const logger = getLogger();
import { prisma } from '../../shared/prisma.js';
import { daysAgo } from '../../shared/utils/date-utils.js';
// ============================================================================
// Error Learning Service
// ============================================================================
export class ErrorLearningService {
    analysisInProgress = false;
    /**
     * Detect time-of-day patterns in error occurrence.
     * Identifies hours when errors spike.
     *
     * @param fingerprint - Optional: analyze specific error, or all errors if null
     * @param dayRange - Number of days to analyze (default: 7)
     * @returns Time patterns with anomaly detection
     */
    async detectTimePatterns(fingerprint = null, dayRange = 7) {
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
        }
        catch (error) {
            logger.error('error-learning', 'time-patterns', 'Error detecting time patterns', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
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
    async detectCorrelations(windowMinutes = 5, minOccurrences = 3) {
        try {
            const startDate = daysAgo(7); // Last 7 days
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
            const correlationMap = new Map();
            for (let i = 0; i < errors.length - 1; i++) {
                const primary = errors[i];
                // Look ahead within time window
                for (let j = i + 1; j < errors.length; j++) {
                    const secondary = errors[j];
                    const timeDelta = new Date(secondary.lastSeen).getTime() - new Date(primary.lastSeen).getTime();
                    // Outside window, stop looking
                    if (timeDelta > windowMs)
                        break;
                    // Different errors within window = potential correlation
                    if (primary.fingerprint !== secondary.fingerprint) {
                        const key = `${primary.fingerprint}→${secondary.fingerprint}`;
                        const existing = correlationMap.get(key);
                        if (existing) {
                            existing.timeDeltaSum += timeDelta;
                            existing.occurrences++;
                        }
                        else {
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
            const correlations = [];
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
        }
        catch (error) {
            logger.error('error-learning', 'correlations', 'Error detecting correlations', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * Detect error cascades (single root cause triggers multiple errors).
     * Identifies chains of related errors spreading through the system.
     * PHASE 2B: Now auto-persists discovered cascades to ErrorDependency table.
     *
     * @param maxDepth - Maximum cascade depth to analyze (default: 3)
     * @param persistToDb - Whether to save cascades to database (default: true)
     * @returns Detected cascades with root causes
     */
    async detectCascades(maxDepth = 3, persistToDb = true) {
        try {
            // Get correlations first
            const correlations = await this.detectCorrelations(5, 2);
            // PHASE 2B: Auto-persist cascade relationships to database
            if (persistToDb && correlations.length > 0) {
                const persisted = await this.persistCascadesFromCorrelations(correlations);
                if (persisted > 0) {
                    logger.info('error-learning', 'cascades', `Auto-persisted ${persisted} cascade relationships to ErrorDependency table`);
                }
            }
            // Build cascade chains from correlations
            const cascadeMap = new Map();
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
                        cascade.cascadedErrors.add(cc.secondaryFingerprint);
                        cascade.timeDeltaSum += cc.timeDeltaMs;
                        cascade.cascadeCount++;
                    });
                }
            }
            // Build cascade results
            const cascades = [];
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
        }
        catch (error) {
            logger.error('error-learning', 'cascades', 'Error detecting cascades', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    // ============================================================================
    // PHASE 2B: ErrorDependency Integration — Cascade Persistence & Prediction
    // ============================================================================
    /**
     * PHASE 2B: Persist a detected cascade relationship to ErrorDependency table.
     * Updates statistics if relationship already exists (upsert pattern).
     *
     * @param parentErrorId - The root cause error ID
     * @param childErrorId - The cascaded error ID
     * @param timeDeltaMs - Time between parent and child occurrence
     * @returns Created or updated dependency record ID
     */
    async persistCascade(parentErrorId, childErrorId, timeDeltaMs) {
        try {
            // Check if this dependency already exists
            const existing = await prisma.errorDependency.findFirst({
                where: {
                    parentErrorId,
                    childErrorId,
                },
            });
            if (existing) {
                // Update existing: increment count, update rolling average, boost confidence
                const newCount = existing.observedCount + 1;
                const newAvgTimeDelta = ((existing.avgTimeDeltaMs * existing.observedCount) + timeDeltaMs) / newCount;
                // Confidence increases with observations: 1→0.2, 3→0.6, 5+→1.0
                const newConfidence = Math.min(newCount / 5, 1.0);
                await prisma.errorDependency.update({
                    where: { dependencyId: existing.dependencyId },
                    data: {
                        observedCount: newCount,
                        avgTimeDeltaMs: newAvgTimeDelta,
                        confidence: newConfidence,
                        lastObserved: new Date(),
                    },
                });
                logger.debug('error-learning', 'persist-cascade', `Updated cascade dependency: ${parentErrorId} → ${childErrorId} (count: ${newCount}, conf: ${newConfidence.toFixed(2)})`);
                return existing.dependencyId;
            }
            else {
                // Create new dependency relationship
                const newDependency = await prisma.errorDependency.create({
                    data: {
                        parentErrorId,
                        childErrorId,
                        observedCount: 1,
                        avgTimeDeltaMs: timeDeltaMs,
                        confidence: 0.2, // Initial confidence (1 observation)
                        firstObserved: new Date(),
                        lastObserved: new Date(),
                    },
                });
                logger.info('error-learning', 'persist-cascade', `Created cascade dependency: ${parentErrorId} → ${childErrorId}`);
                return newDependency.dependencyId;
            }
        }
        catch (error) {
            logger.error('error-learning', 'persist-cascade', 'Error persisting cascade dependency', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2B: Get cascade risk for an error fingerprint.
     * Predicts downstream impact based on learned cascade patterns.
     *
     * @param fingerprint - Error fingerprint to assess
     * @returns Cascade risk prediction with recommended action
     */
    async getCascadeRisk(fingerprint) {
        try {
            // Find the error by fingerprint
            const error = await prisma.errorLog.findFirst({
                where: { fingerprint },
                select: { errorId: true },
            });
            if (!error) {
                return {
                    triggerFingerprint: fingerprint,
                    predictedChildren: [],
                    totalRisk: 0,
                    worstCaseImpact: 1,
                    recommendation: 'IGNORE',
                };
            }
            // Find all dependencies where this error is the parent
            const dependencies = await prisma.errorDependency.findMany({
                where: { parentErrorId: error.errorId },
                include: {
                    childError: {
                        select: { fingerprint: true, errorName: true },
                    },
                },
                orderBy: { confidence: 'desc' },
            });
            if (dependencies.length === 0) {
                return {
                    triggerFingerprint: fingerprint,
                    predictedChildren: [],
                    totalRisk: 0,
                    worstCaseImpact: 1,
                    recommendation: 'IGNORE',
                };
            }
            // Build predicted children list
            const predictedChildren = dependencies.map(dep => ({
                fingerprint: dep.childError.fingerprint,
                probability: dep.confidence,
                expectedDelayMs: dep.avgTimeDeltaMs,
            }));
            // Calculate total risk (weighted average of child probabilities)
            const totalRisk = predictedChildren.reduce((sum, child) => sum + child.probability, 0) / predictedChildren.length;
            // Worst case = all children trigger + potential second-level cascades
            const worstCaseImpact = 1 + predictedChildren.length * 2; // Conservative estimate
            // Determine recommendation based on risk
            let recommendation;
            if (totalRisk >= 0.8 && predictedChildren.length >= 3) {
                recommendation = 'BLOCK'; // High risk, many children
            }
            else if (totalRisk >= 0.6 || predictedChildren.length >= 2) {
                recommendation = 'WARN'; // Medium risk
            }
            else if (totalRisk >= 0.3) {
                recommendation = 'MONITOR'; // Low but notable risk
            }
            else {
                recommendation = 'IGNORE'; // Minimal risk
            }
            return {
                triggerFingerprint: fingerprint,
                predictedChildren,
                totalRisk,
                worstCaseImpact,
                recommendation,
            };
        }
        catch (error) {
            logger.error('error-learning', 'cascade-risk', 'Error calculating cascade risk', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2B: Find root cause by tracing back from a child error.
     * Walks the ErrorDependency chain to find the original trigger.
     *
     * @param childFingerprint - Fingerprint of the error to trace
     * @param maxDepth - Maximum chain length to trace (default: 5)
     * @returns Root cause trace with confidence score
     */
    async findRootCause(childFingerprint, maxDepth = 5) {
        try {
            // Find the error by fingerprint
            const error = await prisma.errorLog.findFirst({
                where: { fingerprint: childFingerprint },
                select: { errorId: true, fingerprint: true },
            });
            if (!error) {
                return null;
            }
            // Walk up the dependency chain
            const chain = [];
            let currentErrorId = error.errorId;
            let _currentFingerprint = childFingerprint; // Tracked for debugging but not used in loop logic
            let depth = 0;
            let overallConfidence = 1.0;
            while (depth < maxDepth) {
                // Find parent dependency (highest confidence)
                const parentDep = await prisma.errorDependency.findFirst({
                    where: { childErrorId: currentErrorId },
                    include: {
                        parentError: {
                            select: { errorId: true, fingerprint: true },
                        },
                    },
                    orderBy: { confidence: 'desc' },
                });
                if (!parentDep) {
                    // No parent found — current error is the root cause
                    break;
                }
                // Add to chain
                chain.push({
                    fingerprint: parentDep.parentError.fingerprint,
                    confidence: parentDep.confidence,
                    timeDeltaMs: parentDep.avgTimeDeltaMs,
                });
                // Update confidence (multiplicative)
                overallConfidence *= parentDep.confidence;
                // Move up the chain
                currentErrorId = parentDep.parentErrorId;
                _currentFingerprint = parentDep.parentError.fingerprint;
                depth++;
            }
            if (chain.length === 0) {
                // This error IS the root cause (no parents)
                return {
                    childFingerprint,
                    rootCauseFingerprint: childFingerprint,
                    chainLength: 0,
                    chain: [],
                    confidence: 1.0,
                };
            }
            // Root cause is the last item in the chain
            const rootCause = chain[chain.length - 1];
            return {
                childFingerprint,
                rootCauseFingerprint: rootCause.fingerprint,
                chainLength: chain.length,
                chain,
                confidence: overallConfidence,
            };
        }
        catch (error) {
            logger.error('error-learning', 'root-cause', 'Error finding root cause', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2B: Auto-persist cascades from correlation data.
     * Called internally by detectCascades() to save discovered patterns.
     *
     * @param correlations - Correlation data from detectCorrelations()
     * @returns Number of cascade relationships persisted
     */
    async persistCascadesFromCorrelations(correlations) {
        let persistedCount = 0;
        for (const corr of correlations) {
            try {
                // Find parent and child errors by fingerprint
                const [parentError, childError] = await Promise.all([
                    prisma.errorLog.findFirst({
                        where: { fingerprint: corr.primaryFingerprint },
                        select: { errorId: true },
                    }),
                    prisma.errorLog.findFirst({
                        where: { fingerprint: corr.secondaryFingerprint },
                        select: { errorId: true },
                    }),
                ]);
                if (parentError && childError) {
                    await this.persistCascade(parentError.errorId, childError.errorId, corr.timeDeltaMs);
                    persistedCount++;
                }
            }
            catch (err) {
                // Log but don't fail entire batch
                logger.warn('error-learning', 'persist-cascade', `Failed to persist cascade for correlation: ${corr.primaryFingerprint} → ${corr.secondaryFingerprint}`, {
                    metadata: { error: err instanceof Error ? err.message : String(err) }
                });
            }
        }
        return persistedCount;
    }
    // ============================================================================
    // PHASE 2C: ErrorKnowledge Integration — Pattern Persistence & Retrieval
    // ============================================================================
    /**
     * PHASE 2C: Persist a time-of-day pattern to ErrorKnowledge table.
     * Patterns expire after 7 days and need refresh.
     *
     * @param pattern - Time pattern to persist
     * @param fingerprint - Optional related error fingerprint
     * @returns Created knowledge entry ID
     */
    async persistTimePattern(pattern, fingerprint) {
        try {
            // Check for existing pattern for same hour
            const existing = await prisma.errorKnowledge.findFirst({
                where: {
                    patternType: 'TIME_CLUSTER',
                    patternData: {
                        path: ['hour'],
                        equals: pattern.hour,
                    },
                },
            });
            if (existing) {
                // Update existing pattern
                const newObservedCount = existing.observedCount + 1;
                const newConfidence = Math.min((existing.confidence * existing.observedCount + pattern.percentOfTotal) / newObservedCount, 1.0);
                await prisma.errorKnowledge.update({
                    where: { knowledgeId: existing.knowledgeId },
                    data: {
                        patternData: JSON.parse(JSON.stringify(pattern)),
                        confidence: newConfidence,
                        observedCount: newObservedCount,
                        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        relatedFingerprints: fingerprint
                            ? [...new Set([...existing.relatedFingerprints, fingerprint])]
                            : existing.relatedFingerprints,
                    },
                });
                logger.debug('error-learning', 'time-pattern', `Updated time pattern for hour ${pattern.hour} (obs: ${newObservedCount})`);
                return existing.knowledgeId;
            }
            else {
                // Create new pattern
                const created = await prisma.errorKnowledge.create({
                    data: {
                        patternType: 'TIME_CLUSTER',
                        patternData: JSON.parse(JSON.stringify(pattern)),
                        confidence: pattern.isAnomalous ? 0.8 : 0.5, // Higher initial confidence for anomalies
                        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        observedCount: 1,
                        relatedFingerprints: fingerprint ? [fingerprint] : [],
                    },
                });
                logger.info('error-learning', 'time-pattern', `Created time pattern for hour ${pattern.hour} (anomalous: ${pattern.isAnomalous})`);
                return created.knowledgeId;
            }
        }
        catch (error) {
            logger.error('error-learning', 'time-pattern', 'Error persisting time pattern', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2C: Persist a correlation pattern to ErrorKnowledge table.
     *
     * @param correlation - Correlation pattern to persist
     * @returns Created knowledge entry ID
     */
    async persistCorrelationPattern(correlation) {
        try {
            // Check for existing correlation between these fingerprints
            const existing = await prisma.errorKnowledge.findFirst({
                where: {
                    patternType: 'CORRELATION',
                    relatedFingerprints: {
                        hasEvery: [correlation.primaryFingerprint, correlation.secondaryFingerprint],
                    },
                },
            });
            if (existing) {
                // Update existing correlation
                const newObservedCount = existing.observedCount + correlation.occurrences;
                const newConfidence = Math.min((existing.confidence + correlation.confidence) / 2, 1.0);
                await prisma.errorKnowledge.update({
                    where: { knowledgeId: existing.knowledgeId },
                    data: {
                        patternData: JSON.parse(JSON.stringify(correlation)),
                        confidence: newConfidence,
                        observedCount: newObservedCount,
                        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    },
                });
                logger.debug('error-learning', 'correlation-pattern', `Updated correlation pattern: ${correlation.primaryFingerprint} → ${correlation.secondaryFingerprint}`);
                return existing.knowledgeId;
            }
            else {
                // Create new correlation pattern
                const created = await prisma.errorKnowledge.create({
                    data: {
                        patternType: 'CORRELATION',
                        patternData: JSON.parse(JSON.stringify(correlation)),
                        confidence: correlation.confidence,
                        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        observedCount: correlation.occurrences,
                        relatedFingerprints: [correlation.primaryFingerprint, correlation.secondaryFingerprint],
                    },
                });
                logger.info('error-learning', 'correlation-pattern', `Created correlation pattern: ${correlation.primaryFingerprint} → ${correlation.secondaryFingerprint}`);
                return created.knowledgeId;
            }
        }
        catch (error) {
            logger.error('error-learning', 'correlation-pattern', 'Error persisting correlation pattern', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2C: Persist a cascade pattern to ErrorKnowledge table.
     *
     * @param cascade - Cascade pattern to persist
     * @returns Created knowledge entry ID
     */
    async persistCascadePattern(cascade) {
        try {
            // Check for existing cascade from this root
            const existing = await prisma.errorKnowledge.findFirst({
                where: {
                    patternType: 'CASCADE',
                    relatedFingerprints: {
                        has: cascade.rootCauseFingerprint,
                    },
                },
            });
            if (existing) {
                // Update existing cascade
                const newObservedCount = existing.observedCount + 1;
                const newConfidence = Math.min((existing.confidence + cascade.confidence) / 2, 1.0);
                // Merge cascaded errors
                const existingData = existing.patternData;
                const mergedCascadedErrors = [
                    ...new Set([...existingData.cascadedErrors, ...cascade.cascadedErrors])
                ];
                await prisma.errorKnowledge.update({
                    where: { knowledgeId: existing.knowledgeId },
                    data: {
                        patternData: JSON.parse(JSON.stringify({
                            ...cascade,
                            cascadedErrors: mergedCascadedErrors,
                        })),
                        confidence: newConfidence,
                        observedCount: newObservedCount,
                        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        relatedFingerprints: [cascade.rootCauseFingerprint, ...mergedCascadedErrors],
                    },
                });
                logger.debug('error-learning', 'cascade-pattern', `Updated cascade pattern from ${cascade.rootCauseFingerprint} (depth: ${cascade.cascadeDepth})`);
                return existing.knowledgeId;
            }
            else {
                // Create new cascade pattern
                const created = await prisma.errorKnowledge.create({
                    data: {
                        patternType: 'CASCADE',
                        patternData: JSON.parse(JSON.stringify(cascade)),
                        confidence: cascade.confidence,
                        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                        observedCount: 1,
                        relatedFingerprints: [cascade.rootCauseFingerprint, ...cascade.cascadedErrors],
                    },
                });
                logger.info('error-learning', 'cascade-pattern', `Created cascade pattern from ${cascade.rootCauseFingerprint} (impact: ${cascade.totalImpact})`);
                return created.knowledgeId;
            }
        }
        catch (error) {
            logger.error('error-learning', 'cascade-pattern', 'Error persisting cascade pattern', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2C: Query learned patterns from ErrorKnowledge table.
     *
     * @param query - Query options (patternType, minConfidence, fingerprint, includeExpired)
     * @returns Array of stored knowledge entries
     */
    async getKnowledge(query = {}) {
        try {
            const whereClause = {};
            if (query.patternType) {
                whereClause.patternType = query.patternType;
            }
            if (query.minConfidence !== undefined) {
                whereClause.confidence = { gte: query.minConfidence };
            }
            if (query.fingerprint) {
                whereClause.relatedFingerprints = { has: query.fingerprint };
            }
            if (!query.includeExpired) {
                whereClause.validUntil = { gte: new Date() };
            }
            const results = await prisma.errorKnowledge.findMany({
                where: whereClause,
                orderBy: [
                    { confidence: 'desc' },
                    { observedCount: 'desc' },
                ],
            });
            return results.map(r => ({
                knowledgeId: r.knowledgeId,
                patternType: r.patternType,
                patternData: r.patternData,
                confidence: r.confidence,
                validUntil: r.validUntil,
                observedCount: r.observedCount,
                relatedFingerprints: r.relatedFingerprints,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            }));
        }
        catch (error) {
            logger.error('error-learning', 'query-knowledge', 'Error querying knowledge', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2C: Get time patterns that indicate anomalous hours.
     * Returns hours where error rate is significantly above average.
     *
     * @param minConfidence - Minimum confidence threshold (default: 0.6)
     * @returns Array of anomalous time patterns
     */
    async getAnomalousTimePatterns(minConfidence = 0.6) {
        const knowledge = await this.getKnowledge({
            patternType: 'TIME_CLUSTER',
            minConfidence,
        });
        return knowledge
            .map(k => k.patternData)
            .filter(p => p.isAnomalous);
    }
    /**
     * PHASE 2C: Get high-confidence correlation patterns.
     * Returns error pairs that frequently occur together.
     *
     * @param minConfidence - Minimum confidence threshold (default: 0.7)
     * @returns Array of correlation patterns
     */
    async getHighConfidenceCorrelations(minConfidence = 0.7) {
        const knowledge = await this.getKnowledge({
            patternType: 'CORRELATION',
            minConfidence,
        });
        return knowledge.map(k => k.patternData);
    }
    /**
     * PHASE 2C: Cleanup expired knowledge entries.
     * Called periodically to prune stale patterns.
     *
     * @returns Number of entries deleted
     */
    async cleanupExpiredKnowledge() {
        try {
            const result = await prisma.errorKnowledge.deleteMany({
                where: {
                    validUntil: { lt: new Date() },
                },
            });
            if (result.count > 0) {
                logger.info('error-learning', 'cleanup', `Cleaned up ${result.count} expired knowledge entries`);
            }
            return result.count;
        }
        catch (error) {
            logger.error('error-learning', 'cleanup', 'Error cleaning up expired knowledge', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
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
    async predictImpact(errorName, category, _context = {}) {
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
            const featureCount = new Map();
            let totalUserImpact = 0;
            const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
            historicalErrors.forEach(err => {
                // Count feature occurrences
                (err.impactedFeatures || []).forEach((feature) => {
                    featureCount.set(feature, (featureCount.get(feature) || 0) + 1);
                });
                // Sum user impact
                totalUserImpact += err.estimatedUserImpact || 0;
                // Count severity occurrences
                if (err.severity in severityCounts) {
                    severityCounts[err.severity]++;
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
                .sort((a, b) => b[1] - a[1])[0]?.[0] || 'MEDIUM');
            // Predict user impact (average)
            const predictedUserImpact = Math.round(totalUserImpact / historicalErrors.length);
            // Calculate confidence based on sample size
            const confidence = Math.min(historicalErrors.length / 10, 1); // 10+ samples = 100% confidence
            // Build reasoning
            const reasoning = [
                `Based on ${historicalErrors.length} similar historical errors`,
                `Features affected in >${Math.round(threshold)}/${historicalErrors.length} cases`,
                `Severity pattern: ${predictedSeverity} (${severityCounts[predictedSeverity]} occurrences)`,
                `Average user impact: ${predictedUserImpact} users`,
            ];
            return {
                predictedFeatures,
                predictedSeverity,
                predictedUserImpact,
                confidence,
                reasoning,
            };
        }
        catch (error) {
            logger.error('error-learning', 'predict-impact', 'Error predicting impact', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * Suggest mitigation strategies based on historical recovery success rates.
     * Recommends the most effective recovery approach for a given error.
     *
     * PHASE 2A ENHANCEMENT: Now queries ErrorResolution table first for learned strategies,
     * then falls back to learningMetadata JSONB, then generic strategies.
     *
     * @param errorName - Name of the error
     * @param category - Error category
     * @returns Recommended recovery strategies with effectiveness scores
     */
    async suggestMitigation(errorName, category) {
        try {
            // PHASE 2A: First try to get strategies from ErrorResolution table
            const learnedStrategies = await this.getLearnedStrategiesFromResolutions(errorName, category);
            if (learnedStrategies.length > 0) {
                logger.info('error-learning', 'mitigation', `[ErrorLearning] Using ${learnedStrategies.length} learned strategies from ErrorResolution`);
                return learnedStrategies;
            }
            // LEGACY FALLBACK: Query learningMetadata JSONB for backwards compatibility
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
            // Extract recovery strategies from learning metadata (legacy JSONB path)
            const strategyMap = new Map();
            historicalErrors.forEach(err => {
                const metadata = err.learningMetadata;
                const strategies = metadata?.recoveryStrategies || [];
                strategies.forEach((strategy) => {
                    const existing = strategyMap.get(strategy.strategyName);
                    if (existing) {
                        existing.successCount += strategy.successCount || 0;
                        existing.attemptCount += strategy.attemptCount || 0;
                        existing.totalRecoveryTime += strategy.recoveryTime || 0;
                        if (new Date(strategy.lastUsed) > existing.lastUsed) {
                            existing.lastUsed = new Date(strategy.lastUsed);
                        }
                    }
                    else {
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
            const strategies = [];
            for (const [name, data] of strategyMap.entries()) {
                const successRate = data.attemptCount > 0 ? data.successCount / data.attemptCount : 0;
                const averageRecoveryTime = data.successCount > 0 ? data.totalRecoveryTime / data.successCount : 0;
                let effectiveness;
                if (successRate >= 0.8)
                    effectiveness = 'HIGH';
                else if (successRate >= 0.5)
                    effectiveness = 'MEDIUM';
                else
                    effectiveness = 'LOW';
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
                if (aScore !== bScore)
                    return bScore - aScore;
                return b.successRate - a.successRate;
            });
        }
        catch (error) {
            logger.error('error-learning', 'mitigation', 'Error suggesting mitigation', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
    }
    /**
     * PHASE 2A: Get learned strategies from ErrorResolution table.
     * Queries actual resolution history to determine which strategies work best.
     *
     * @param errorName - Name of the error
     * @param category - Error category
     * @returns Strategies with learned effectiveness from real resolution data
     */
    async getLearnedStrategiesFromResolutions(errorName, category) {
        try {
            // Find errors matching name or category
            const matchingErrors = await prisma.errorLog.findMany({
                where: {
                    OR: [
                        { errorName },
                        { category },
                    ],
                },
                select: { errorId: true },
                take: 100,
            });
            if (matchingErrors.length === 0) {
                return [];
            }
            // Get all resolutions for these errors
            const resolutions = await prisma.errorResolution.findMany({
                where: {
                    errorId: { in: matchingErrors.map(e => e.errorId) },
                },
                select: {
                    strategy: true,
                    outcome: true,
                    durationMs: true,
                    attempted: true,
                },
            });
            if (resolutions.length === 0) {
                return [];
            }
            // Aggregate by strategy
            const strategyMap = new Map();
            for (const r of resolutions) {
                const isSuccess = r.outcome === 'SUCCESS' || r.outcome === 'PARTIAL';
                const existing = strategyMap.get(r.strategy);
                if (existing) {
                    existing.totalCount++;
                    if (isSuccess)
                        existing.successCount++;
                    existing.totalDurationMs += r.durationMs ?? 0;
                    if (r.attempted > existing.lastUsed) {
                        existing.lastUsed = r.attempted;
                    }
                }
                else {
                    strategyMap.set(r.strategy, {
                        successCount: isSuccess ? 1 : 0,
                        totalCount: 1,
                        totalDurationMs: r.durationMs ?? 0,
                        lastUsed: r.attempted,
                    });
                }
            }
            // Build RecoveryStrategy results
            const strategies = [];
            for (const [strategyName, data] of strategyMap.entries()) {
                const successRate = data.successCount / data.totalCount;
                const averageRecoveryTime = data.totalCount > 0 ? data.totalDurationMs / data.totalCount : 0;
                let effectiveness;
                if (successRate >= 0.8 && data.totalCount >= 3) {
                    effectiveness = 'HIGH';
                }
                else if (successRate >= 0.5) {
                    effectiveness = 'MEDIUM';
                }
                else {
                    effectiveness = 'LOW';
                }
                strategies.push({
                    strategyName,
                    errorCategory: category,
                    successRate,
                    averageRecoveryTime,
                    applicableCount: data.totalCount,
                    lastUsed: data.lastUsed,
                    effectiveness,
                });
            }
            // Sort by effectiveness then success rate
            return strategies.sort((a, b) => {
                const effectivenessScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
                const aScore = effectivenessScore[a.effectiveness];
                const bScore = effectivenessScore[b.effectiveness];
                if (aScore !== bScore)
                    return bScore - aScore;
                return b.successRate - a.successRate;
            });
        }
        catch (error) {
            logger.error('error-learning', 'learned-strategies', '[ErrorLearning] Failed to get learned strategies from resolutions', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            return []; // Return empty on error, will fall back to legacy path
        }
    }
    /**
     * Get generic recovery strategies when no historical data available.
     * @param category - Error category
     * @returns Generic strategies for category
     */
    getGenericStrategies(category) {
        const now = new Date();
        const strategies = {
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
     * PHASE 2C: Now also persists patterns to ErrorKnowledge table.
     *
     * @param forceUpdate - Force update even if analysis recently completed
     * @returns Number of errors updated with new learning data
     */
    async updateKnowledgeBase(forceUpdate = false) {
        if (this.analysisInProgress && !forceUpdate) {
            logger.info('error-learning', 'update-knowledge', 'Error learning analysis already in progress, skipping');
            return 0;
        }
        try {
            this.analysisInProgress = true;
            logger.info('error-learning', 'update-knowledge', 'Starting error learning knowledge base update');
            // Detect patterns
            const timePatterns = await this.detectTimePatterns(null, 7);
            const correlations = await this.detectCorrelations(5, 3);
            const cascades = await this.detectCascades(3); // This already persists to ErrorDependency (Phase 2B)
            // PHASE 2C: Persist patterns to ErrorKnowledge table
            let persistedPatterns = 0;
            // Persist anomalous time patterns
            for (const tp of timePatterns.filter(p => p.isAnomalous)) {
                try {
                    await this.persistTimePattern(tp);
                    persistedPatterns++;
                }
                catch (err) {
                    logger.warn('error-learning', 'update-knowledge', 'Failed to persist time pattern', { metadata: { hour: tp.hour, error: err instanceof Error ? err.message : String(err) } });
                }
            }
            // Persist high-confidence correlations
            for (const corr of correlations.filter(c => c.confidence >= 0.5)) {
                try {
                    await this.persistCorrelationPattern(corr);
                    persistedPatterns++;
                }
                catch (err) {
                    logger.warn('error-learning', 'update-knowledge', 'Failed to persist correlation pattern', { metadata: { error: err instanceof Error ? err.message : String(err) } });
                }
            }
            // Persist cascades to ErrorKnowledge (in addition to ErrorDependency)
            for (const cascade of cascades.filter(c => c.confidence >= 0.5)) {
                try {
                    await this.persistCascadePattern(cascade);
                    persistedPatterns++;
                }
                catch (err) {
                    logger.warn('error-learning', 'update-knowledge', 'Failed to persist cascade pattern', { metadata: { error: err instanceof Error ? err.message : String(err) } });
                }
            }
            if (persistedPatterns > 0) {
                logger.info('error-learning', 'update-knowledge', `Persisted ${persistedPatterns} patterns to ErrorKnowledge table`);
            }
            // Cleanup expired knowledge
            await this.cleanupExpiredKnowledge();
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
                const relevantCorrelations = correlations.filter(c => c.primaryFingerprint === error.fingerprint || c.secondaryFingerprint === error.fingerprint);
                // Find cascades where this error is root or cascaded
                const relevantCascades = cascades.filter(c => c.rootCauseFingerprint === error.fingerprint || c.cascadedErrors.includes(error.fingerprint));
                // Get recovery strategies
                const strategies = await this.suggestMitigation(error.errorName, error.category);
                // Build learning metadata
                const learningMetadata = {
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
                        learningMetadata: learningMetadata,
                    },
                });
                updateCount++;
            }
            logger.info('error-learning', 'update-knowledge', `Error learning knowledge base updated: ${updateCount} errors analyzed`);
            return updateCount;
        }
        catch (error) {
            logger.error('error-learning', 'update-knowledge', 'Error updating knowledge base', { error: error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError', message: String(error) } });
            throw error;
        }
        finally {
            this.analysisInProgress = false;
        }
    }
}
// ============================================================================
// Singleton Export
// ============================================================================
export const errorLearning = new ErrorLearningService();
