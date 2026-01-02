/**
 * Error Tracking Service
 * Purpose: Centralized error capture, fingerprinting, deduplication, and persistence
 * Motto: "No Silent Errors" - Every error is captured, logged, and made visible
 *
 * CRITICAL GUARANTEES:
 * 1. LIVE DETECTION: No caching - every error immediately visible in console + database
 * 2. ZERO FALSE NEGATIVES: Even if database fails, error is logged to console + emergency file
 * 3. IMMEDIATE VISIBILITY: Console output before any async operations
 * 4. LIVE STREAM: Real-time event emission for logger integration
 * 5. KERNEL INTEGRATION: All errors report UP to kernel observation layer (2025-12-26)
 *
 * @module services/error-tracker
 */
// APP LAYER FIRST — Isolated access to kernel through application layer
import { createErrorTrackerHook, getCurrentCorrelationId } from '../../app/index.js';
// LOGGER SECOND — Must be early import to capture initialization errors
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();
import crypto from 'node:crypto';
import { toEasternLogFormat } from '../../shared/datetime.js';
import { EventBus } from '../../shared/event-bus.js';
import { prisma } from '../../shared/prisma.js';
import { daysAgo } from '../../shared/utils/date-utils.js';
import { parseStackTrace, enrichStackFramesWithSource, captureErrorContextSnapshot, formatErrorReportForAI, } from '../../utils/stack-trace-parser.js';
// Error Brain — Local intelligence system for error pattern detection
import * as ErrorBrain from '../error-brain/index.js';
// ═══════════════════════════════════════════════════════════════════════════
// Kernel Integration — Reports UP to observation layer
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Kernel hook for reporting errors to the observation layer
 * Initialized lazily to avoid circular dependency issues during boot
 */
let kernelHook = null;
/**
 * Get or create the kernel hook (lazy initialization)
 * Safe to call during boot - returns null if kernel not ready
 */
function getKernelHook() {
    if (kernelHook)
        return kernelHook;
    try {
        kernelHook = createErrorTrackerHook('error-tracker');
        return kernelHook;
    }
    catch {
        // Kernel not ready yet (during early boot), will retry on next error
        return null;
    }
}
/// ---- Error Fingerprinting ----
/**
 * Generate a unique fingerprint for an error
 * Same error (name + message + stack pattern + category) = same fingerprint
 * Line numbers are normalized to ensure code changes don't create new fingerprints
 */
export function generateFingerprint(error, category) {
    // Normalize stack trace: keep top 5 frames, remove line numbers
    const normalizedStack = error.stack
        ?.split('\n')
        .slice(0, 5)
        .map(frame => frame.replace(/:\d+:\d+/g, ':*:*'))
        .join('|') ?? '';
    const key = `${error.name}|${error.message}|${normalizedStack}|${category}`;
    return crypto.createHash('sha256').update(key).digest('hex');
}
/// ---- Severity Classification ----
/**
 * Auto-classify error severity based on error type and context
 */
export function classifySeverity(error, context) {
    // Explicit severity provided
    if (context.severity) {
        return context.severity;
    }
    const errorName = error.name.toLowerCase();
    const errorMessage = error.message.toLowerCase();
    // CRITICAL: Database connection errors, Prisma errors, process-level errors
    if (errorName.includes('prisma') ||
        errorName.includes('connection') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('database') && errorMessage.includes('unavailable') ||
        context.operation === 'uncaughtException') {
        return 'CRITICAL';
    }
    // HIGH: Discord API errors, command failures, worker crashes
    if (errorName.includes('discordapi') ||
        context.category === 'DISCORD' ||
        context.category === 'WORKER' ||
        context.operation === 'command' ||
        context.operation === 'interaction') {
        return 'HIGH';
    }
    // MEDIUM: Timeouts, cache errors, retry exhausted
    if (errorName.includes('timeout') ||
        errorMessage.includes('timeout') ||
        context.category === 'CACHE' ||
        errorMessage.includes('retry')) {
        return 'MEDIUM';
    }
    // LOW: Validation errors, user input errors
    if (context.category === 'VALIDATION' ||
        errorName.includes('validation') ||
        errorMessage.includes('invalid')) {
        return 'LOW';
    }
    // Default to MEDIUM for unknown errors
    return 'MEDIUM';
}
/// ---- Error Category Detection ----
/**
 * Auto-detect error category from error type and context
 */
export function detectCategory(error, context) {
    // Explicit category provided
    if (context.category) {
        return context.category;
    }
    const errorName = error.name.toLowerCase();
    const errorMessage = error.message.toLowerCase();
    if (errorName.includes('prisma') || errorMessage.includes('database')) {
        return 'DATABASE';
    }
    if (errorName.includes('discordapi') || errorMessage.includes('discord')) {
        return 'DISCORD';
    }
    if (errorMessage.includes('timeout')) {
        return 'NETWORK';
    }
    if (context.service === 'worker' || errorMessage.includes('worker')) {
        return 'WORKER';
    }
    if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
        return 'VALIDATION';
    }
    if (context.service === 'cache' || errorMessage.includes('cache')) {
        return 'CACHE';
    }
    if (errorMessage.includes('config') || errorMessage.includes('environment')) {
        return 'CONFIG';
    }
    return 'UNKNOWN';
}
/// ---- Error Tracker Service ----
export class ErrorTracker {
    /**
     * In-memory stats for synchronous health checks.
     * Updated on each captureError call.
     */
    _stats = {
        totalErrors: 0,
        queueSize: 0,
        lastCaptureTime: 0,
    };
    /**
     * Get synchronous stats for health checks.
     * Returns in-memory counters (non-blocking).
     *
     * Used by: errorTrackerHealthCheck in service-factories.ts
     */
    getStats() {
        return { ...this._stats };
    }
    /**
     * Stop error stream (graceful shutdown).
     * Clears any pending timers/listeners.
     */
    stopErrorStream() {
        // Currently a no-op - ErrorTracker doesn't use background timers
        // Reserved for future background processing features
    }
    /**
     * Capture an error and persist to database
     * Automatically deduplicates by fingerprint
     *
     * CRITICAL: This is a LIVE operation - NO CACHING, NO DELAYS
     * Every error must be captured immediately to ensure zero false negatives
     *
     * ENHANCED: Now includes advanced stack trace parsing with:
     * - File paths, line numbers, column numbers
     * - Source code snippets around error location
     * - Call chain reconstruction
     * - AI-optimized troubleshooting hints
     *
     * @returns errorId of created or updated ErrorLog entry
     */
    async captureError(error, context = {}) {
        // Update in-memory stats for health checks (synchronous, immediate)
        this._stats.totalErrors++;
        this._stats.lastCaptureTime = Date.now();
        // IMMEDIATE console output for live visibility (before any async operations)
        const timestamp = toEasternLogFormat();
        // Parse stack trace IMMEDIATELY (synchronous operation)
        const parsedStack = parseStackTrace(error);
        const topFrame = parsedStack.topFrame;
        // Enhanced logging output with source location
        logger.error('error-tracker', 'capture', `🚨 [ERROR CAPTURED] ${timestamp}`);
        logger.error('error-tracker', 'capture', `   Type: ${error.name}`);
        logger.error('error-tracker', 'capture', `   Message: ${error.message}`);
        if (topFrame?.relativeFilePath) {
            logger.error('error-tracker', 'capture', `   Location: ${topFrame.relativeFilePath}:${topFrame.lineNumber}:${topFrame.columnNumber}`);
            logger.error('error-tracker', 'capture', `   Function: ${topFrame.functionName || '<anonymous>'}`);
        }
        logger.error('error-tracker', 'capture', `   Call Chain: ${parsedStack.callChain.slice(0, 3).join(' → ')}`);
        logger.error('error-tracker', 'capture', `   Context: ${JSON.stringify({
            service: context.service,
            operation: context.operation,
            userId: context.userId,
            guildId: context.guildId,
            commandName: context.commandName,
        })}`);
        try {
            const category = detectCategory(error, context);
            const severity = classifySeverity(error, context);
            const fingerprint = generateFingerprint(error, category);
            // Enrich stack frames with source code snippets (async, but non-blocking)
            // Run in background to avoid blocking error capture
            enrichStackFramesWithSource(parsedStack.frames).then(enriched => {
                parsedStack.frames = enriched;
            }).catch(err => {
                // Source enrichment failed - not critical, continue
                logger.warn('error-tracker', 'enrich', '[ErrorTracker] Source enrichment failed: ' + err.message);
            });
            // Enrich context with automatic detection + stack trace metadata
            const enrichedContext = {
                ...context,
                category,
                severity,
                timestamp,
                nodeVersion: process.version,
                platform: process.platform,
                // Stack trace metadata for AI analysis
                stackMetadata: {
                    depth: parsedStack.depth,
                    topFrame: topFrame ? {
                        file: topFrame.relativeFilePath || topFrame.filePath,
                        line: topFrame.lineNumber,
                        column: topFrame.columnNumber,
                        function: topFrame.functionName,
                    } : null,
                    callChain: parsedStack.callChain,
                    userCodeFrames: parsedStack.userCodeFrames.length,
                },
            };
            // LIVE DATABASE WRITE - No caching layer, direct to PostgreSQL
            // Use upsert to avoid race conditions in high-frequency error scenarios
            const result = await prisma.errorLog.upsert({
                where: { fingerprint },
                update: {
                    lastSeen: new Date(),
                    occurrenceCount: { increment: 1 },
                    contextData: enrichedContext, // Store latest context with stack metadata
                },
                create: {
                    fingerprint,
                    category,
                    severity,
                    errorName: error.name,
                    errorMessage: error.message,
                    stackTrace: error.stack ?? null,
                    contextData: enrichedContext,
                    impactedFeatures: this.detectImpactedFeatures(error, context),
                    estimatedUserImpact: this.estimateUserImpact(error, context),
                },
            });
            // Emit to Event Bus for immediate logger visibility (with parsed stack)
            this.emitToEventBus({
                errorId: result.errorId,
                fingerprint,
                category,
                severity,
                errorName: error.name,
                errorMessage: error.message,
                timestamp,
                context: enrichedContext,
                // Enhanced fields for logger integration
                parsedStack,
                topFrame,
                sourceLocation: topFrame?.relativeFilePath ? {
                    file: topFrame.relativeFilePath,
                    line: topFrame.lineNumber,
                    column: topFrame.columnNumber,
                } : undefined,
                callChain: parsedStack.callChain,
            });
            // ═══════════════════════════════════════════════════════════════
            // KERNEL INTEGRATION — Report UP to observation layer
            // ═══════════════════════════════════════════════════════════════
            // Kernel observes all errors for unified metrics, patterns, anomalies
            // This doesn't replace our DB/EventBus flow - it ADDS visibility
            const hook = getKernelHook();
            if (hook) {
                hook.error({
                    errorId: result.errorId,
                    fingerprint,
                    category,
                    severity,
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date(),
                    context: {
                        correlationId: getCurrentCorrelationId(),
                        service: context.service,
                        operation: context.operation,
                        userId: context.userId,
                        guildId: context.guildId,
                        commandName: context.commandName,
                        sourceLocation: topFrame?.relativeFilePath ? `${topFrame.relativeFilePath}:${topFrame.lineNumber}` : undefined,
                        callChain: parsedStack.callChain.slice(0, 5),
                    },
                });
            }
            logger.error('error-tracker', 'persist', `   ✅ Persisted: ${result.errorId} (fingerprint: ${fingerprint.substring(0, 8)}...)`);
            // ============================================================
            // ERROR BRAIN INTEGRATION — Local Intelligence System
            // ============================================================
            // Feed error to Error Brain for pattern learning (async, non-blocking)
            // This enables: anomaly detection, cascade prediction, correlation analysis
            try {
                const severityLevel = severity === 'CRITICAL' ? 5 : severity === 'HIGH' ? 4 : severity === 'MEDIUM' ? 3 : 2;
                // Record error event for pattern learning
                ErrorBrain.recordError({
                    fingerprint,
                    timestamp: Date.now(),
                    severity: severityLevel,
                    correlationId: context.customData?.correlationId,
                    userId: context.userId,
                    component: context.service,
                });
                // Update impact weights for this error type
                ErrorBrain.updateImpactWeight(fingerprint, category, severity, this.estimateUserImpact(error, context) ?? 1, this.detectImpactedFeatures(error, context).length);
                // Check for anomalies (synchronous, <1μs)
                const anomaly = ErrorBrain.detectTimeAnomaly(fingerprint, result.occurrenceCount);
                if (anomaly.isAnomalous) {
                    logger.warn('error-tracker', 'anomaly', `   🧠 [ErrorBrain] ANOMALY DETECTED: ${fingerprint.substring(0, 8)}... (Z-score: ${anomaly.zScore.toFixed(2)})`);
                }
                // Check for cascade prediction (synchronous, <10μs)
                const cascade = ErrorBrain.predictCascade(fingerprint);
                if (cascade && cascade.probability > 0.5) {
                    logger.warn('error-tracker', 'cascade', `   🧠 [ErrorBrain] CASCADE RISK: ${(cascade.probability * 100).toFixed(0)}% chance of ${cascade.predictedChildren.length} downstream errors`);
                }
                // Log burst detection for high-frequency errors
                const burst = ErrorBrain.detectBurst({
                    fingerprint,
                    timestamp: Date.now(),
                    severity: severityLevel,
                });
                if (burst.isBurst) {
                    logger.warn('error-tracker', 'burst', `   🧠 [ErrorBrain] BURST DETECTED: ${burst.eventsPerSecond.toFixed(1)} errors/sec (${burst.burstMultiplier.toFixed(1)}x baseline)`);
                }
            }
            catch (brainError) {
                // Error Brain failures are non-critical — log and continue
                logger.warn('error-tracker', 'brain-error', '[ErrorTracker] Error Brain integration failed: ' + String(brainError));
            }
            // Generate AI-optimized error report (async, fire-and-forget)
            // Write to Store/error-reports/ for SSH analysis
            this.generateAndStoreAIReport(error, parsedStack, enrichedContext, fingerprint).catch((err) => {
                logger.warn('error-tracker', 'report', '[ErrorTracker] AI report generation failed: ' + err.message);
            });
            // PHASE 2D: Persist stack frames for debugging/hotspot detection (async, fire-and-forget)
            this.persistCodeContext(result.errorId, parsedStack.frames).catch((err) => {
                logger.warn('error-tracker', 'persist-context', '[ErrorTracker] Code context persistence failed: ' + err.message);
            });
            return result.errorId;
        }
        catch (captureError) {
            // CRITICAL: Even if database write fails, MUST log to console
            // This ensures ZERO false negatives - every error is visible somewhere
            logger.error('error-tracker', 'failure', '\n❌ [ERROR TRACKER FAILURE] Database write failed!');
            logger.error('error-tracker', 'failure', '   Capture Error: ' + String(captureError));
            logger.error('error-tracker', 'failure', '   Original Error: ' + String(error));
            logger.error('error-tracker', 'failure', '   Stack: ' + (error.stack || 'No stack trace'));
            logger.error('error-tracker', 'failure', '   Context: ' + JSON.stringify(context, null, 2));
            // Fallback: Write to emergency error log file (backup persistence)
            this.writeToEmergencyLog(error, context, captureError, parsedStack);
            return 'capture-failed';
        }
    }
    /**
     * Get error statistics for a time period
     */
    async getErrorStats(since) {
        const sinceDate = since ?? daysAgo(1); // Default: last 24h
        const errors = await prisma.errorLog.findMany({
            where: {
                lastSeen: { gte: sinceDate },
            },
            select: {
                errorId: true,
                category: true,
                severity: true,
                occurrenceCount: true,
            },
        });
        const stats = {
            totalUnique: errors.length,
            totalOccurrences: errors.reduce((sum, e) => sum + e.occurrenceCount, 0),
            bySeverity: {
                CRITICAL: 0,
                HIGH: 0,
                MEDIUM: 0,
                LOW: 0,
            },
            byCategory: {
                VALIDATION: 0,
                NETWORK: 0,
                DATABASE: 0,
                DISCORD: 0,
                ENGINE: 0,
                WORKER: 0,
                CONFIG: 0,
                CACHE: 0,
                UNKNOWN: 0,
            },
            criticalErrors: 0,
            errorRate: 0,
        };
        for (const error of errors) {
            stats.bySeverity[error.severity] += error.occurrenceCount;
            stats.byCategory[error.category] += error.occurrenceCount;
            if (error.severity === 'CRITICAL') {
                stats.criticalErrors += error.occurrenceCount;
            }
        }
        // Calculate error rate (errors per hour)
        const hoursSince = (Date.now() - sinceDate.getTime()) / (1000 * 60 * 60);
        stats.errorRate = stats.totalOccurrences / hoursSince;
        return stats;
    }
    /**
     * Get recent errors with optional filters
     */
    async getRecentErrors(limit = 10, filters = {}) {
        const where = {};
        if (filters.category) {
            where.category = filters.category;
        }
        if (filters.severity) {
            where.severity = filters.severity;
        }
        if (filters.since) {
            where.lastSeen = { gte: filters.since };
        }
        if (filters.fingerprint) {
            where.fingerprint = filters.fingerprint;
        }
        return prisma.errorLog.findMany({
            where,
            orderBy: { lastSeen: 'desc' },
            take: limit,
        });
    }
    /**
     * Get top errors by occurrence count
     */
    async getTopErrors(limit = 10, orderBy = 'count') {
        return prisma.errorLog.findMany({
            orderBy: orderBy === 'count'
                ? { occurrenceCount: 'desc' }
                : { lastSeen: 'desc' },
            take: limit,
        });
    }
    /**
     * Get error by fingerprint
     */
    async getErrorByFingerprint(fingerprint) {
        return prisma.errorLog.findUnique({
            where: { fingerprint },
            include: { alerts: true },
        });
    }
    /**
     * Record recovery attempt and outcome.
     * @deprecated Use recordResolution() for full tracking with ErrorResolution table.
     * This method only updates ErrorLog counters without creating a learning record.
     */
    async recordRecoveryAttempt(errorId, strategy, success) {
        await prisma.errorLog.update({
            where: { errorId },
            data: {
                recoveryAttempted: { increment: 1 },
                recoverySuccess: success ? { increment: 1 } : undefined,
                lastRecoveryStrategy: strategy,
                lastRecoveryOutcome: success ? 'success' : 'failed',
            },
        });
    }
    /**
     * Record a resolution attempt with full tracking to ErrorResolution table.
     * This creates a permanent learning record that enables strategy effectiveness analysis.
     *
     * LEARNING INTEGRATION: Creates ErrorResolution record that feeds into:
     * - getEffectiveStrategies() for ranking strategies by success rate
     * - suggestMitigation() in ErrorLearning for intelligent recommendations
     * - Auto-remediation engine for eligible errors
     *
     * @param params - Resolution parameters including strategy, outcome, timing
     * @returns The created ErrorResolution record ID
     */
    async recordResolution(params) {
        const { errorId, strategy, outcome, triggeredBy, durationMs, notes, contextData, } = params;
        try {
            // First verify the error exists
            const error = await prisma.errorLog.findUnique({
                where: { errorId },
                select: { errorId: true, fingerprint: true, category: true },
            });
            if (!error) {
                throw new Error(`Error not found: ${errorId}`);
            }
            const success = outcome === 'SUCCESS' || outcome === 'PARTIAL';
            // Create the resolution record
            const resolution = await prisma.errorResolution.create({
                data: {
                    errorId,
                    strategy,
                    outcome,
                    triggeredBy,
                    durationMs,
                    notes,
                    contextData: contextData ? JSON.parse(JSON.stringify(contextData)) : undefined,
                },
            });
            // Also update the ErrorLog counters for backwards compatibility
            await prisma.errorLog.update({
                where: { errorId },
                data: {
                    recoveryAttempted: { increment: 1 },
                    recoverySuccess: success ? { increment: 1 } : undefined,
                    lastRecoveryStrategy: strategy,
                    lastRecoveryOutcome: success ? 'success' : 'failed',
                },
            });
            // ============================================================
            // ERROR BRAIN INTEGRATION — Learn from resolution outcome
            // ============================================================
            try {
                ErrorBrain.recordRecoveryOutcome(error.fingerprint, strategy, success, durationMs);
                logger.info('error-tracker', 'recovery', `   🧠 [ErrorBrain] Recovery outcome recorded: ${strategy} (${outcome})`);
            }
            catch (brainError) {
                // Error Brain failures are non-critical
                logger.warn('error-tracker', 'recovery', '[ErrorTracker] Error Brain recovery learning failed: ' + String(brainError));
            }
            logger.info('error-tracker', 'resolution', `[ErrorTracker] Resolution recorded: ${strategy} (${outcome}) for ${errorId.substring(0, 8)}...`);
            return resolution.resolutionId;
        }
        catch (error) {
            logger.error('error-tracker', 'resolution', `[ErrorTracker] Failed to record resolution: ${error}`);
            throw error;
        }
    }
    /**
     * Get effective strategies for a fingerprint based on ErrorResolution history.
     * Queries all resolution attempts and calculates success rates, confidence scores.
     *
     * LEARNING OUTPUT: Returns strategies ranked by effectiveness:
     * - successRate: Historical success percentage
     * - confidence: Based on sample size (more data = higher confidence)
     * - recommendation: RECOMMENDED (>80% & >5 samples), CONSIDER (>50%), AVOID (<50%)
     *
     * @param fingerprint - Error fingerprint to analyze
     * @returns Strategies sorted by effectiveness (best first)
     */
    async getEffectiveStrategies(fingerprint) {
        try {
            // Get the error by fingerprint
            const error = await prisma.errorLog.findUnique({
                where: { fingerprint },
                select: { errorId: true, category: true },
            });
            if (!error) {
                return [];
            }
            // Get all resolutions for this error
            const resolutions = await prisma.errorResolution.findMany({
                where: { errorId: error.errorId },
                select: {
                    strategy: true,
                    outcome: true,
                    durationMs: true,
                    attempted: true,
                },
            });
            if (resolutions.length === 0) {
                // Also check for resolutions from errors with same category
                const categoryErrors = await prisma.errorLog.findMany({
                    where: { category: error.category },
                    select: { errorId: true },
                    take: 100,
                });
                const categoryResolutions = await prisma.errorResolution.findMany({
                    where: { errorId: { in: categoryErrors.map(e => e.errorId) } },
                    select: {
                        strategy: true,
                        outcome: true,
                        durationMs: true,
                        attempted: true,
                    },
                });
                if (categoryResolutions.length === 0) {
                    return [];
                }
                resolutions.push(...categoryResolutions);
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
            // Calculate effectiveness metrics
            const strategies = [];
            for (const [strategy, data] of strategyMap.entries()) {
                const successRate = data.successCount / data.totalCount;
                const avgExecutionMs = data.totalCount > 0 ? data.totalDurationMs / data.totalCount : 0;
                // Confidence based on sample size: 1 sample = 0.2, 5 samples = 1.0
                const confidence = Math.min(data.totalCount / 5, 1);
                // Recommendation based on success rate and confidence
                let recommendation;
                if (successRate >= 0.8 && data.totalCount >= 5) {
                    recommendation = 'RECOMMENDED';
                }
                else if (successRate >= 0.5) {
                    recommendation = 'CONSIDER';
                }
                else {
                    recommendation = 'AVOID';
                }
                strategies.push({
                    strategy,
                    successRate,
                    avgExecutionMs,
                    sampleSize: data.totalCount,
                    lastUsed: data.lastUsed,
                    confidence,
                    recommendation,
                });
            }
            // Sort by effectiveness score (success rate * confidence)
            return strategies.sort((a, b) => {
                const aScore = a.successRate * a.confidence;
                const bScore = b.successRate * b.confidence;
                return bScore - aScore;
            });
        }
        catch (error) {
            logger.error('error-tracker', 'strategies', `[ErrorTracker] Failed to get effective strategies: ${error}`);
            throw error;
        }
    }
    /**
     * Update learning metadata for an error
     */
    async updateLearningMetadata(errorId, metadata) {
        const existing = await prisma.errorLog.findUnique({
            where: { errorId },
            select: { learningMetadata: true },
        });
        const merged = {
            ...(existing?.learningMetadata ?? {}),
            ...metadata,
            lastAnalyzedAt: new Date().toISOString(),
        };
        await prisma.errorLog.update({
            where: { errorId },
            data: { learningMetadata: merged },
        });
    }
    /// ---- Impact Estimation (Private Helpers) ----
    detectImpactedFeatures(error, context) {
        const features = new Set();
        // Detect from context
        if (context.commandName) {
            features.add(`commands.${context.commandName}`);
        }
        if (context.service) {
            features.add(context.service);
        }
        if (context.operation) {
            features.add(context.operation);
        }
        // Detect from error message
        const message = error.message.toLowerCase();
        if (message.includes('battle'))
            features.add('battles');
        if (message.includes('encounter'))
            features.add('encounters');
        if (message.includes('trainer'))
            features.add('trainer-ops');
        if (message.includes('database'))
            features.add('ALL-DATABASE-OPERATIONS');
        if (message.includes('discord'))
            features.add('discord-interactions');
        if (message.includes('cache'))
            features.add('cache-operations');
        return Array.from(features);
    }
    estimateUserImpact(_error, _context) {
        // FUTURE: Implement user impact estimation when guild analytics are available.
        // Would require: active user counts per guild, feature usage tracking.
        // Currently returns null (unknown impact).
        return null;
    }
    /**
     * Emit error to Event Bus for immediate logger visibility
     * CRITICAL: This must be non-blocking and fault-tolerant
     *
     * Event routing: error.<severity> topics
     * - error.critical (CRITICAL errors)
     * - error.high (HIGH errors)
     * - error.medium (MEDIUM errors)
     * - error.low (LOW errors)
     *
     * Features:
     * - Correlation ID tracking (UUID v4)
     * - Parent correlation chaining (from context.correlationId)
     * - Event replay buffer (last 100 errors)
     * - Pattern-based subscriptions (error.** for all errors)
     */
    emitToEventBus(event) {
        try {
            const bus = EventBus.getInstance();
            // Emit to error.<severity> topic
            const topic = `error.${event.severity.toLowerCase()}`;
            const correlationId = bus.emit(topic, {
                errorId: event.errorId,
                fingerprint: event.fingerprint,
                category: event.category,
                severity: event.severity,
                errorName: event.errorName,
                errorMessage: event.errorMessage,
                timestamp: event.timestamp,
                context: event.context,
                parsedStack: event.parsedStack,
                topFrame: event.topFrame,
                sourceLocation: event.sourceLocation,
                callChain: event.callChain,
            }, {
                emitter: 'error-tracker',
                parentCorrelationId: event.context?.correlationId, // Chain if exists
            });
            // Log correlation ID for debugging (minimal output to avoid noise)
            if (process.env.NODE_ENV === 'development') {
                logger.error('error-tracker', 'event-bus', `   🔗 Correlation: ${correlationId.substring(0, 8)}... → ${topic}`);
            }
        }
        catch (emitError) {
            // MUST NOT throw - Event Bus emission is optional enhancement
            logger.error('error-tracker', 'event-bus', '[ErrorTracker] Failed to emit to Event Bus: ' + String(emitError));
        }
    }
    /**
     * Generate AI-optimized error report and store to database
     * Runs in background (fire-and-forget) to avoid blocking error capture
     */
    async generateAndStoreAIReport(error, parsedStack, context, fingerprint) {
        try {
            // Capture full error context snapshot
            const snapshot = await captureErrorContextSnapshot(error, {
                ...context,
                fingerprint,
            });
            // Generate AI-optimized report
            const report = formatErrorReportForAI(snapshot);
            // Store to database instead of /Store file
            const shortFingerprint = fingerprint.substring(0, 12);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const cacheKey = `error-report:${shortFingerprint}:${timestamp}`;
            await prisma.cacheEntry.upsert({
                where: { key: cacheKey },
                update: {
                    value: { report, fingerprint, context },
                    updatedAt: new Date(),
                },
                create: {
                    key: cacheKey,
                    namespace: 'error-reports',
                    value: { report, fingerprint, context },
                    sizeBytes: report.length,
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                },
            });
            logger.error('error-tracker', 'ai-report', `   📊 AI Report: db:error-reports/${cacheKey}`);
        }
        catch (reportError) {
            // Report generation failed - not critical
            logger.warn('error-tracker', 'ai-report', '[ErrorTracker] AI report generation failed: ' + String(reportError));
        }
    }
    // ============================================================================
    // PHASE 2D: ErrorCodeContext Integration — Stack Frame Persistence
    // ============================================================================
    /**
     * PHASE 2D: Persist stack frames to ErrorCodeContext table.
     * Enables "show me where this error occurred" queries and hotspot detection.
     *
     * @param errorId - The error ID to associate frames with
     * @param frames - Parsed stack frames from stack-trace-parser
     * @param maxFrames - Maximum frames to persist (default: 10)
     * @returns Number of frames persisted
     */
    async persistCodeContext(errorId, frames, maxFrames = 10) {
        try {
            // Filter to user code frames only (skip node_modules and native)
            const userFrames = frames
                .filter(f => !f.isNodeModule && !f.isNative && f.filePath)
                .slice(0, maxFrames);
            if (userFrames.length === 0) {
                return 0;
            }
            // Batch insert all frames
            const contextRecords = userFrames.map((frame, index) => ({
                errorId,
                frameIndex: index,
                filePath: frame.relativeFilePath || frame.filePath || '',
                lineNumber: frame.lineNumber || 0,
                columnNumber: frame.columnNumber,
                functionName: frame.functionName,
                codeSnippet: frame.sourceSnippet
                    ? `${frame.sourceSnippet.before || ''}\n>>> ${frame.sourceSnippet.errorLine || ''}\n${frame.sourceSnippet.after || ''}`
                    : null,
            }));
            await prisma.errorCodeContext.createMany({
                data: contextRecords,
                skipDuplicates: true,
            });
            logger.info('error-tracker', 'persist-context', `[ErrorTracker] Persisted ${contextRecords.length} stack frames for error ${errorId.substring(0, 8)}...`);
            return contextRecords.length;
        }
        catch (error) {
            logger.warn('error-tracker', 'persist-context', '[ErrorTracker] Failed to persist code context: ' + (error instanceof Error ? error.message : String(error)));
            return 0;
        }
    }
    /**
     * PHASE 2D: Get hotspots — files and lines with most errors.
     * Identifies error-prone code locations for refactoring priority.
     *
     * @param limit - Maximum hotspots to return (default: 20)
     * @param minOccurrences - Minimum occurrences to qualify (default: 2)
     * @returns Hotspot locations sorted by error count
     */
    async getHotspots(limit = 20, minOccurrences = 2) {
        try {
            // Group by file + line number
            const contexts = await prisma.errorCodeContext.findMany({
                where: {
                    frameIndex: 0, // Top of stack only (actual error location)
                },
                select: {
                    filePath: true,
                    lineNumber: true,
                    functionName: true,
                    errorId: true,
                },
            });
            // Aggregate by location
            const locationMap = new Map();
            for (const ctx of contexts) {
                const key = `${ctx.filePath}:${ctx.lineNumber}`;
                const existing = locationMap.get(key);
                if (existing) {
                    existing.errorIds.add(ctx.errorId);
                    // Keep first function name seen
                }
                else {
                    locationMap.set(key, {
                        filePath: ctx.filePath,
                        lineNumber: ctx.lineNumber,
                        functionName: ctx.functionName,
                        errorIds: new Set([ctx.errorId]),
                    });
                }
            }
            // Convert to array and filter by minOccurrences
            const hotspots = Array.from(locationMap.values())
                .filter(h => h.errorIds.size >= minOccurrences)
                .map(h => ({
                filePath: h.filePath,
                lineNumber: h.lineNumber,
                functionName: h.functionName,
                errorCount: h.errorIds.size,
                errorIds: Array.from(h.errorIds),
            }))
                .sort((a, b) => b.errorCount - a.errorCount)
                .slice(0, limit);
            return hotspots;
        }
        catch (error) {
            logger.error('error-tracker', 'hotspots', '[ErrorTracker] Failed to get hotspots: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
    /**
     * PHASE 2D: Get full call chain for an error.
     * Reconstructs the execution path that led to the error.
     *
     * @param errorId - The error ID to get call chain for
     * @returns Stack frames in order (0 = top of stack)
     */
    async getErrorCallChain(errorId) {
        try {
            const frames = await prisma.errorCodeContext.findMany({
                where: { errorId },
                orderBy: { frameIndex: 'asc' },
                select: {
                    frameIndex: true,
                    filePath: true,
                    lineNumber: true,
                    columnNumber: true,
                    functionName: true,
                    codeSnippet: true,
                },
            });
            return frames;
        }
        catch (error) {
            logger.error('error-tracker', 'call-chain', '[ErrorTracker] Failed to get call chain: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
    /**
     * PHASE 2D: Get errors by file path.
     * Find all errors that occurred in a specific file.
     *
     * @param filePath - File path to search (partial match supported)
     * @returns Error IDs and their locations in the file
     */
    async getErrorsByFile(filePath) {
        try {
            const contexts = await prisma.errorCodeContext.findMany({
                where: {
                    filePath: { contains: filePath },
                },
                select: {
                    errorId: true,
                    lineNumber: true,
                    functionName: true,
                    frameIndex: true,
                },
                orderBy: [
                    { lineNumber: 'asc' },
                    { frameIndex: 'asc' },
                ],
            });
            return contexts;
        }
        catch (error) {
            logger.error('error-tracker', 'errors-by-file', '[ErrorTracker] Failed to get errors by file: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
    /**
     * PHASE 2D: Get function error statistics.
     * Find functions that have the most errors.
     *
     * @param limit - Maximum functions to return (default: 20)
     * @returns Functions sorted by error count
     */
    async getFunctionErrorStats(limit = 20) {
        try {
            const contexts = await prisma.errorCodeContext.findMany({
                where: {
                    functionName: { not: null },
                    frameIndex: 0, // Top of stack only
                },
                select: {
                    functionName: true,
                    filePath: true,
                    errorId: true,
                },
            });
            // Aggregate by function name
            const functionMap = new Map();
            for (const ctx of contexts) {
                if (!ctx.functionName)
                    continue;
                const existing = functionMap.get(ctx.functionName);
                if (existing) {
                    existing.errorIds.add(ctx.errorId);
                    existing.filePaths.add(ctx.filePath);
                }
                else {
                    functionMap.set(ctx.functionName, {
                        errorIds: new Set([ctx.errorId]),
                        filePaths: new Set([ctx.filePath]),
                    });
                }
            }
            return Array.from(functionMap.entries())
                .map(([functionName, data]) => ({
                functionName,
                errorCount: data.errorIds.size,
                filePaths: Array.from(data.filePaths),
            }))
                .sort((a, b) => b.errorCount - a.errorCount)
                .slice(0, limit);
        }
        catch (error) {
            logger.error('error-tracker', 'function-stats', '[ErrorTracker] Failed to get function error stats: ' + (error instanceof Error ? error.message : String(error)));
            throw error;
        }
    }
    /**
     * Write error to emergency log as last-resort fallback
     * Stores to database - ensures ZERO false negatives even if main DB path fails
     */
    async writeToEmergencyLog(error, context, captureError, parsedStack) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const cacheKey = `emergency-error:${timestamp}`;
            const emergencyEntry = {
                timestamp: new Date().toISOString(),
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                },
                context,
                captureError: captureError instanceof Error ? {
                    name: captureError.name,
                    message: captureError.message,
                    stack: captureError.stack,
                } : String(captureError),
                nodeVersion: process.version,
                platform: process.platform,
                // Include parsed stack trace if available
                stackMetadata: parsedStack ? {
                    depth: parsedStack.depth,
                    topFrame: parsedStack.topFrame ? {
                        file: parsedStack.topFrame.relativeFilePath || parsedStack.topFrame.filePath,
                        line: parsedStack.topFrame.lineNumber,
                        column: parsedStack.topFrame.columnNumber,
                        function: parsedStack.topFrame.functionName,
                    } : null,
                    callChain: parsedStack.callChain,
                } : null,
            };
            await prisma.cacheEntry.create({
                data: {
                    key: cacheKey,
                    namespace: 'emergency-error-logs',
                    value: emergencyEntry,
                    sizeBytes: JSON.stringify(emergencyEntry).length,
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
                },
            });
            logger.error('error-tracker', 'emergency', `   📝 Emergency log written: db:emergency-error-logs/${cacheKey}`);
        }
        catch (fileError) {
            // Absolute last resort: just log to console
            logger.error('error-tracker', 'emergency', '[ErrorTracker] Emergency file write also failed: ' + String(fileError));
            logger.error('error-tracker', 'emergency', '[ErrorTracker] Error data: ' + JSON.stringify({
                error: { name: error.name, message: error.message },
                context,
            }, null, 2));
        }
    }
}
// Singleton instance
export const errorTracker = new ErrorTracker();
