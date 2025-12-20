/**
 * Consolidated Legacy Stub Hub — Single Source of Truth
 *
 * PURPOSE: Centralize ALL legacy logging API compatibility in one place.
 * All legacy logger modules (utils/logger.js, shared/log.ts, intelligent-logger.ts,
 * ai-log-*.js, log-ingestion-worker.ts) delegate here.
 *
 * ARCHITECTURE:
 *   Legacy Code → Legacy Module → THIS HUB → src/shared/logger.ts → TimescaleDB
 *
 * This design:
 *   1. Eliminates duplicate inference/mapping logic
 *   2. Provides single point for logging policy changes
 *   3. Maintains strict API compatibility with zero runtime overhead
 *
 * PERFORMANCE OPTIMIZATIONS:
 *   - Cached logger instance (avoids repeated getLogger() calls)
 *   - Frozen level/operation maps (V8 optimization)
 *   - Minimal object allocations in hot paths
 *   - Short-circuit evaluation for optional context
 *
 * @module shared/legacy-stubs
 * @see src/shared/logger.ts — Core DB-First logger
 */
import { getLogger } from './logger.js';
// =============================================================================
// PERFORMANCE: Cached Logger Instance
// =============================================================================
/** Cached logger instance — avoids repeated getLogger() calls in hot paths */
let cachedLogger = null;
/** Get or create cached logger instance */
function getCachedLogger() {
    return cachedLogger ??= getLogger();
}
/** All valid legacy log level values (for runtime validation) */
export const LEGACY_LOG_LEVELS = [
    'trace', 'debug', 'info', 'notice', 'warn', 'error', 'critical', 'fatal', 'success', 'detail'
];
// =============================================================================
// CORE MAPPING FUNCTIONS — Optimized with frozen lookup tables
// =============================================================================
/** Level mapping table (frozen for V8 optimization) */
const LEVEL_MAP = Object.freeze({
    trace: 'debug', debug: 'debug', detail: 'debug',
    info: 'info', notice: 'info', success: 'info',
    warn: 'warn',
    error: 'error', critical: 'error', fatal: 'error',
});
/** Map any legacy level to core logger level */
export function mapLevel(level) {
    return LEVEL_MAP[level] ?? 'info';
}
/** Infer component from legacy context */
export function inferComponent(ctx) {
    if (!ctx)
        return 'app';
    if (ctx.component)
        return String(ctx.component);
    if (ctx.service)
        return String(ctx.service);
    if (ctx.worker)
        return `worker.${ctx.worker}`;
    if (ctx.category)
        return String(ctx.category).toLowerCase();
    if (ctx.guild || ctx.guildId)
        return 'bot';
    if (ctx.database || ctx.db)
        return 'database';
    if (ctx.cache)
        return 'cache';
    if (ctx.battle)
        return 'battle';
    return 'app';
}
/** Infer operation from message content */
export function inferOperation(msg, ctx) {
    // Fast path: explicit operation/action in context
    if (ctx?.operation)
        return String(ctx.operation);
    if (ctx?.action)
        return String(ctx.action);
    // Infer from message keywords (ordered by frequency)
    const lower = msg?.toLowerCase() ?? '';
    if (lower.includes('error') || lower.includes('fail'))
        return 'error';
    if (lower.includes('start'))
        return 'start';
    if (lower.includes('connect'))
        return 'connect';
    if (lower.includes('initializ'))
        return 'initialize';
    if (lower.includes('query'))
        return 'query';
    if (lower.includes('stop') || lower.includes('shutdown'))
        return 'shutdown';
    if (lower.includes('register'))
        return 'register';
    if (lower.includes('health'))
        return 'health-check';
    return 'operation';
}
/** Keys to exclude from metadata extraction */
const INTERNAL_KEYS = new Set([
    'component', 'service', 'worker', 'operation',
    'action', 'category', 'correlationId', 'error',
    'context', 'data'
]);
/** Build core LogContext from legacy options (optimized) */
export function buildContext(opts, err) {
    // Fast path: no options and no error
    if (!opts && !err)
        return undefined;
    const ctx = {};
    if (opts) {
        // Extract metadata, excluding internal keys
        const meta = {};
        for (const key of Object.keys(opts)) {
            if (!INTERNAL_KEYS.has(key)) {
                meta[key] = opts[key];
            }
        }
        // Merge nested context/data
        if (opts.context && typeof opts.context === 'object') {
            Object.assign(meta, opts.context);
        }
        if (opts.data && typeof opts.data === 'object') {
            Object.assign(meta, opts.data);
        }
        if (Object.keys(meta).length > 0) {
            ctx.metadata = meta;
        }
        if (opts.correlationId) {
            ctx.correlationId = String(opts.correlationId);
        }
    }
    // Handle error object
    const errorObj = err ?? opts?.error;
    if (errorObj) {
        if (errorObj instanceof Error) {
            ctx.error = {
                name: errorObj.name,
                message: errorObj.message,
                stack: errorObj.stack,
            };
        }
        else if (typeof errorObj === 'object') {
            ctx.error = {
                name: 'UnknownError',
                message: String(errorObj),
            };
        }
    }
    return Object.keys(ctx).length > 0 ? ctx : undefined;
}
// =============================================================================
// UNIFIED LOG FUNCTION — Core delegation point (hot path optimized)
// =============================================================================
/**
 * Unified log function that all legacy modules delegate to.
 * Uses cached logger instance for minimal overhead.
 */
export function legacyLog(level, message, opts, err) {
    const logger = getCachedLogger();
    const coreLevel = LEVEL_MAP[level] ?? 'info';
    const component = inferComponent(opts);
    const operation = inferOperation(message, opts);
    const context = buildContext(opts, err);
    logger[coreLevel](component, operation, message, context);
}
// =============================================================================
// AI LOG WRITER COMPATIBILITY
// =============================================================================
/** Category constants for ai-log-writer.js (frozen for safety) */
export const AI_LOG_CATEGORIES = Object.freeze({
    SYSTEM: 'system',
    DATABASE: 'database',
    DISCORD: 'discord',
    GAME_ENGINE: 'game-engine',
    SECURITY: 'security',
    PERFORMANCE: 'performance',
    ERROR: 'error',
    RESOURCE: 'resource',
    USER_ACTION: 'user-action',
    INTEGRATION: 'integration',
});
/** Helper: Create category-prefixed log function */
const categoryLog = (level) => (cat, msg, opts) => legacyLog(level, msg, { category: cat, ...opts });
/** AI logger stub functions (consolidated factory pattern) */
export const aiLoggerStubs = Object.freeze({
    CONFIG: Object.freeze({ categories: AI_LOG_CATEGORIES }),
    initialize: async (_opts) => { },
    shutdown: async () => { },
    log: categoryLog('info'),
    trace: categoryLog('trace'),
    debug: categoryLog('debug'),
    info: categoryLog('info'),
    notice: categoryLog('info'),
    warn: categoryLog('warn'),
    error: categoryLog('error'),
    critical: categoryLog('error'),
    fatal: categoryLog('fatal'),
    flush: async () => { },
    getStats: () => Object.freeze({ logsWritten: 0, currentFile: null }),
    generateCorrelationId: () => `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
});
// =============================================================================
// AI LOG ANALYZER COMPATIBILITY
// =============================================================================
/** Empty analysis result (frozen singleton) */
const EMPTY_ANALYSIS = Object.freeze({ patterns: [], anomalies: [], recommendations: [] });
/** AI analyzer stub functions (frozen) */
export const aiAnalyzerStubs = Object.freeze({
    initialize: async () => { },
    shutdown: async () => { },
    analyze: () => EMPTY_ANALYSIS,
    getRecentErrors: () => [],
    getPerformanceMetrics: () => Object.freeze({}),
});
// =============================================================================
// AI LOG INTEGRATIONS COMPATIBILITY
// =============================================================================
/** AI integrations stub functions (frozen) */
export const aiIntegrationsStubs = Object.freeze({
    integrateAll: async (_opts) => { },
    integrateErrorTracker: () => { },
    integrateEventBus: () => { },
});
// =============================================================================
// LOG INGESTION WORKER COMPATIBILITY — REMOVED 2025-12-20
// =============================================================================
// The logIngestionStubs export was removed in Dead Code Cleanup Meeting #5.
// The only consumer (log-ingestion-worker.ts) was also deleted.
// See cleanup meeting notes for details.
// =============================================================================
// INTELLIGENT LOGGER CLASS COMPATIBILITY
// =============================================================================
/** Empty stats object (frozen singleton) */
const EMPTY_STATS = Object.freeze({
    entriesLogged: 0,
    duplicatesFiltered: 0,
    bufferSize: 0,
    lastFlush: null,
});
/**
 * IntelligentLogger stub class — delegates to unified legacyLog function.
 *
 * @example
 * const logger = new IntelligentLogger();
 * logger.info('User logged in', { category: 'discord', userId: 123 });
 * logger.error('Database error', new Error('Connection refused'));
 *
 * @remarks
 * This class maintains API compatibility with the original IntelligentLogger
 * while routing all logs through the DB-First architecture.
 */
export class IntelligentLogger {
    /** Log at specified level */
    log(level, message, opts) {
        legacyLog(level, message, opts);
    }
    /** Log trace-level message (maps to debug) */
    trace(message, opts) {
        legacyLog('trace', message, opts);
    }
    /** Log debug-level message */
    debug(message, opts) {
        legacyLog('debug', message, opts);
    }
    /** Log info-level message */
    info(message, opts) {
        legacyLog('info', message, opts);
    }
    /** Log warning-level message */
    warn(message, opts) {
        legacyLog('warn', message, opts);
    }
    /**
     * Log error-level message with optional error object
     * @param message - Error description
     * @param errOrOpts - Error object or options
     * @param opts - Additional options (when errOrOpts is Error)
     */
    error(message, errOrOpts, opts) {
        if (errOrOpts instanceof Error) {
            legacyLog('error', message, opts, errOrOpts);
        }
        else if (errOrOpts && typeof errOrOpts === 'object' && 'category' in errOrOpts) {
            legacyLog('error', message, errOrOpts);
        }
        else if (errOrOpts) {
            legacyLog('error', message, opts, errOrOpts);
        }
        else {
            legacyLog('error', message, opts);
        }
    }
    /** Log fatal-level message (maps to error) */
    fatal(message, opts) {
        legacyLog('fatal', message, opts);
    }
    /** Get logger statistics (returns frozen empty stats) */
    getStats() {
        return EMPTY_STATS;
    }
    /** Graceful shutdown (no-op, handled by DB-First logger) */
    async shutdown() { }
}
// =============================================================================
// LEGACY LOGGER.JS COMPATIBILITY
// =============================================================================
/** Log label constants (frozen for safety) */
export const LOG_LABEL = Object.freeze({
    success: 'SUCCESS',
    info: 'INFO',
    warn: 'WARN',
    detail: 'DETAIL',
    error: 'ERROR',
});
/**
 * Legacy log() function with attached convenience methods
 * @example
 * log('info', 'User logged in', { userId: 123 });
 * log.info('Server started');
 * log.error('Connection failed', { error: err.message });
 */
export function legacyLogFunction(level, message, context) {
    legacyLog(level, message, context);
}
// Attach convenience methods (matches legacy logger.js API)
legacyLogFunction.info = (msg, ctx) => legacyLog('info', msg, ctx);
legacyLogFunction.warn = (msg, ctx) => legacyLog('warn', msg, ctx);
legacyLogFunction.error = (msg, ctx) => legacyLog('error', msg, ctx);
legacyLogFunction.success = (msg, ctx) => legacyLog('info', msg, ctx);
legacyLogFunction.detail = (msg, ctx) => legacyLog('debug', msg, ctx);
/**
 * Legacy report function for structured logging
 * @example
 * report('Database Migration', { tables: 5, duration: '2.3s' });
 */
export function legacyReport(title, meta = {}, level = 'info') {
    legacyLog(level, title, meta);
}
// =============================================================================
// SHARED/LOG.TS COMPATIBILITY
// =============================================================================
/**
 * Structured log object for shared/log.ts compatibility
 * @example
 * import { log } from './log.js';
 * log.info('Application started');
 * log.error('Failed to connect', new Error('timeout'));
 */
export const structuredLog = Object.freeze({
    setLevel: (_level) => { },
    debug: (msg, meta) => legacyLog('debug', msg, meta),
    info: (msg, meta) => legacyLog('info', msg, meta),
    warn: (msg, meta) => legacyLog('warn', msg, meta),
    error: (msg, err, meta) => legacyLog('error', msg, meta, err),
    _format: (level, msg, err, meta) => ({
        t: new Date().toISOString(),
        level,
        msg,
        ...(meta ?? {}),
        ...(err ? { err: { message: String(err) } } : {}),
    }),
});
/** Flush buffered logs (no-op for compatibility) */
export function flushBufferedLogs(_entries) { }
// =============================================================================
// NO-OP STUBS — Auto-refresh & stats (handled by observability system)
// =============================================================================
/** @deprecated Use observability system instead */
export function startAutoRefresh() { }
/** @deprecated Use observability system instead */
export function stopAutoRefresh() { }
/** @deprecated Use observability system instead */
export function getFormattedStats() {
    return Object.freeze({ message: 'Use observability system' });
}
