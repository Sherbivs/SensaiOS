/* eslint-disable no-console */
/**
 * Standardized Logger — DB-First Logging System
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE: Database-First Logging with Kernel Integration
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ALL logs are written to the database FIRST. Console output in production
 * is handled by the ConsoleRenderer which polls the database and outputs
 * to Render's built-in console.
 *
 * Data Flow:
 *   1. Application calls logger.info/warn/error/debug
 *   2. Logger writes to TimescaleDB (log_entries table)
 *   3. Logger ALSO reports to Kernel (unified observation layer)
 *   4. ConsoleRenderer polls database for new entries
 *   5. Renderer outputs to Render console (stdout/stderr)
 *
 * Why DB-First?
 *   - Single source of truth (database = authoritative)
 *   - Console is just a VIEW of database state
 *   - Survives restarts, deployments
 *   - Queryable history
 *   - Consistent across all services
 *
 * Kernel Integration (2025-12-26):
 *   - Logger reports all entries UP to kernel observation layer
 *   - Kernel provides unified correlation IDs across all systems
 *   - Kernel tracks metrics, anomalies, patterns across all logging
 *   - Logger continues full DB/Loki functionality (kernel is observer)
 *
 * Console Modes:
 *   - PRODUCTION: Console output DISABLED here (ConsoleRenderer handles it)
 *   - DEVELOPMENT: Console output ENABLED (immediate feedback)
 *   - FALLBACK: If DB unavailable, falls back to console
 *
 * @module shared/logger
 */
// KERNEL FIRST — Must be first import to monitor other system initialization
import { createLoggerHook } from '../kernel/kernel-hooks.js';
import { getCurrentCorrelationId, getParentCorrelationId } from '../kernel/correlation.js';
import { lokiTransport } from './logging/loki-transport.js';
// ═══════════════════════════════════════════════════════════════════════════
// Kernel Integration — Reports UP to observation layer
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Kernel hook for reporting logs to the observation layer
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
        kernelHook = createLoggerHook('shared-logger');
        return kernelHook;
    }
    catch {
        // Kernel not ready yet (during early boot), will retry on next log
        return null;
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Logger Implementation
// ═══════════════════════════════════════════════════════════════════════════
class StandardizedLogger {
    level = 'info';
    consoleOutput = true;
    dbFirstMode = false; // DB-first mode (console via ConsoleRenderer)
    timescaleWorker = null; // Lazy-loaded to avoid circular deps
    /**
     * Log an error (system failures, exceptions, critical issues)
     */
    error(component, operation, message, context) {
        this.log('error', component, operation, message, context);
    }
    /**
     * Log a warning (degraded state, potential issues, fallbacks)
     */
    warn(component, operation, message, context) {
        if (this.shouldLog('warn')) {
            this.log('warn', component, operation, message, context);
        }
    }
    /**
     * Log info (normal operations, state changes, milestones)
     */
    info(component, operation, message, context) {
        if (this.shouldLog('info')) {
            this.log('info', component, operation, message, context);
        }
    }
    /**
     * Log debug (detailed diagnostics, development traces)
     */
    debug(component, operation, message, context) {
        if (this.shouldLog('debug')) {
            this.log('debug', component, operation, message, context);
        }
    }
    /**
     * Set minimum log level
     */
    setLevel(level) {
        this.level = level;
    }
    /**
     * Get current log level
     */
    getLevel() {
        return this.level;
    }
    /**
     * Enable/disable console output
     */
    setConsoleOutput(enabled) {
        this.consoleOutput = enabled;
    }
    /**
     * Enable DB-first mode (production)
     * When enabled, logger writes to DB only; ConsoleRenderer handles console output
     */
    setDbFirstMode(enabled) {
        this.dbFirstMode = enabled;
    }
    /**
     * Check if DB-first mode is enabled
     */
    isDbFirstMode() {
        return this.dbFirstMode;
    }
    /**
     * Core logging function (private)
     *
     * DB-First Architecture with Kernel Integration:
     * - In production (dbFirstMode=true): Write to DB only, ConsoleRenderer handles display
     * - In development: Write to DB AND console (immediate feedback)
     * - On DB failure: Always fallback to console (safety)
     * - ALWAYS: Report UP to kernel observation layer (non-blocking)
     */
    log(level, component, operation, message, context) {
        // Inject kernel correlation IDs if available (unified tracing)
        // This ensures logs from this system participate in kernel traces
        const kernelCorrelationId = getCurrentCorrelationId();
        const kernelParentCorrelationId = getParentCorrelationId();
        // Build structured log entry
        const entry = {
            timestamp: new Date(),
            level,
            component,
            operation,
            message,
            ...context,
            // Use kernel correlation if in a trace, otherwise use provided/none
            correlationId: context?.correlationId ?? kernelCorrelationId,
            parentCorrelationId: context?.parentCorrelationId ?? kernelParentCorrelationId,
            errorName: context?.error?.name,
            errorMessage: context?.error?.message,
            errorStack: context?.error?.stack,
            errorCode: context?.error?.code,
        };
        // ═══════════════════════════════════════════════════════════════════════
        // KERNEL INTEGRATION — Report UP to observation layer (non-blocking)
        // ═══════════════════════════════════════════════════════════════════════
        // The kernel observes this log but doesn't interfere with our DB/Loki flow
        const hook = getKernelHook();
        if (hook) {
            hook.log(level, component, operation, message, {
                correlationId: entry.correlationId,
                parentCorrelationId: entry.parentCorrelationId,
                userId: entry.userId,
                guildId: entry.guildId,
                channelId: entry.channelId,
                durationMs: entry.durationMs,
                errorName: entry.errorName,
                errorMessage: entry.errorMessage,
                ...entry.metadata,
            });
        }
        // Send to TimescaleDB (async, non-blocking)
        // This is the PRIMARY destination - database is source of truth
        this.sendToDatabase(entry).catch(err => {
            // DB write failed - ALWAYS fallback to console (safety)
            console.error('[Logger] Database write failed, falling back to console:', err);
            this.logToConsole(entry);
        });
        // Console output logic:
        // - dbFirstMode=true (production): Don't output here, ConsoleRenderer handles it
        // - dbFirstMode=false (development): Output immediately for feedback
        if (this.consoleOutput && !this.dbFirstMode) {
            this.logToConsole(entry);
        }
    }
    /**
     * Check if log level should be emitted
     */
    shouldLog(level) {
        const levels = ['error', 'warn', 'info', 'debug'];
        const currentIndex = levels.indexOf(this.level);
        const targetIndex = levels.indexOf(level);
        return targetIndex <= currentIndex;
    }
    /**
     * Send log entry to TimescaleDB (async)
     */
    async sendToDatabase(entry) {
        // Lazy-load TimescaleDB worker to avoid circular dependencies
        if (!this.timescaleWorker) {
            try {
                const { getTimescaleDBWorker } = await import('../workers/database/index.js');
                this.timescaleWorker = getTimescaleDBWorker();
            }
            catch {
                // Worker not available yet (during startup), skip database write
                return;
            }
        }
        // Transform to LogEvent format expected by TimescaleDBWorker
        const logEvent = {
            timestamp: entry.timestamp,
            level: entry.level,
            category: entry.component, // Map component → category
            message: `[${entry.operation}] ${entry.message}`,
            metadata: {
                operation: entry.operation,
                userId: entry.userId,
                guildId: entry.guildId,
                channelId: entry.channelId,
                durationMs: entry.durationMs,
                latencyMs: entry.latencyMs,
                errorName: entry.errorName,
                errorMessage: entry.errorMessage,
                errorStack: entry.errorStack,
                errorCode: entry.errorCode,
                ...entry.metadata,
            },
            correlationId: entry.correlationId,
            serviceName: 'infinity-gauntlet',
            userId: entry.userId,
            traceContext: entry.parentCorrelationId,
        };
        // Enqueue for batched write (non-blocking)
        await this.timescaleWorker.ingestLogs([logEvent]);
        // Forward to Loki if enabled
        this.forwardToLoki(entry);
    }
    /**
     * Forward log entry to Loki transport
     */
    forwardToLoki(entry) {
        try {
            lokiTransport.push({
                level: entry.level,
                message: entry.message,
                timestamp: entry.timestamp.toISOString(),
                service: entry.component,
                correlationId: entry.correlationId,
                data: {
                    operation: entry.operation,
                    userId: entry.userId,
                    guildId: entry.guildId,
                    channelId: entry.channelId,
                    durationMs: entry.durationMs,
                    latencyMs: entry.latencyMs,
                    errorName: entry.errorName,
                    errorMessage: entry.errorMessage,
                    errorCode: entry.errorCode,
                    metadata: entry.metadata,
                },
            });
        }
        catch {
            // Graceful degradation - Loki not available
        }
    }
    /**
     * Output to console (fallback/development)
     */
    logToConsole(entry) {
        const timestamp = entry.timestamp.toISOString();
        const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.component}:${entry.operation}]`;
        const contextParts = [];
        if (entry.correlationId)
            contextParts.push(`corr=${entry.correlationId}`);
        if (entry.userId)
            contextParts.push(`user=${entry.userId}`);
        if (entry.durationMs !== undefined)
            contextParts.push(`dur=${entry.durationMs}ms`);
        const contextStr = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
        const logFn = entry.level === 'error' ? console.error :
            entry.level === 'warn' ? console.warn :
                console.log;
        logFn(`${prefix} ${entry.message}${contextStr}`);
        // Print error details if present
        if (entry.errorName) {
            logFn(`  Error: ${entry.errorName}: ${entry.errorMessage}`);
            if (entry.errorStack) {
                logFn(`  Stack: ${entry.errorStack}`);
            }
        }
        // Print metadata if present
        if (entry.metadata && Object.keys(entry.metadata).length > 0) {
            logFn(`  Metadata:`, entry.metadata);
        }
    }
}
// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════
let loggerInstance = null;
/**
 * Get singleton logger instance
 *
 * Production (DB-First Mode):
 *   - Console output disabled here
 *   - ConsoleRenderer polls DB and outputs to Render console
 *   - All logs flow: App → Logger → DB → ConsoleRenderer → Console
 *
 * Development:
 *   - Console output enabled for immediate feedback
 *   - Logs flow: App → Logger → DB + Console (parallel)
 */
export function getLogger() {
    if (!loggerInstance) {
        const instance = new StandardizedLogger();
        // Set log level from environment variable
        const envLevel = process.env.LOG_LEVEL?.toLowerCase();
        if (envLevel && ['error', 'warn', 'info', 'debug'].includes(envLevel)) {
            instance.setLevel(envLevel);
        }
        // Production: Enable DB-first mode (ConsoleRenderer handles console output)
        // Console output is still available as fallback if DB fails
        if (process.env.NODE_ENV === 'production') {
            instance.setDbFirstMode(true);
            // Keep console enabled for fallback, but dbFirstMode prevents normal console output
            instance.setConsoleOutput(true);
        }
        loggerInstance = instance;
    }
    return loggerInstance;
}
/**
 * Reset logger instance (useful for testing)
 */
export function resetLogger() {
    loggerInstance = null;
}
// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Generate correlation ID for request tracking
 */
export function generateCorrelationId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
/**
 * Extract error context for logging
 */
export function errorContext(error) {
    return {
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack,
            code: error.code, // Some errors have code property
        },
    };
}
/**
 * Measure operation duration and log result
 */
export async function measureOperation(component, operation, description, fn, context) {
    const logger = getLogger();
    const startTime = Date.now();
    const correlationId = context?.correlationId ?? generateCorrelationId();
    logger.debug(component, operation, `Starting: ${description}`, { ...context, correlationId });
    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;
        logger.info(component, operation, `Completed: ${description}`, {
            ...context,
            correlationId,
            durationMs,
        });
        return result;
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        logger.error(component, operation, `Failed: ${description}`, {
            ...context,
            correlationId,
            durationMs,
            ...errorContext(error),
        });
        throw error;
    }
}
const LOG_LABEL = {
    success: 'SUCCESS',
    info: 'INFO',
    warn: 'WARN',
    detail: 'DETAIL',
    error: 'ERROR',
};
/**
 * Legacy-compatible log function (from utils/logger.js)
 *
 * @deprecated Use getLogger() for new code. This exists only for migration.
 *
 * @param level - Log level (info, warn, error, success, detail)
 * @param message - Log message
 * @param context - Optional context (any value accepted for legacy compat)
 */
function logLegacy(level, message, context) {
    const label = LOG_LABEL[level] || LOG_LABEL.info;
    console.log(`[${label}] ${message}`);
    if (context && typeof context === 'object') {
        const keys = Object.keys(context);
        if (keys.length > 0) {
            for (const key of keys) {
                console.log(`  ${key}: ${JSON.stringify(context[key])}`);
            }
        }
    }
}
// Attach convenience methods for log.info(), log.warn(), etc.
logLegacy.info = (message, context) => logLegacy('info', message, context);
logLegacy.warn = (message, context) => logLegacy('warn', message, context);
logLegacy.error = (message, context) => logLegacy('error', message, context);
logLegacy.success = (message, context) => logLegacy('success', message, context);
logLegacy.detail = (message, context) => logLegacy('detail', message, context);
logLegacy.debug = (message, context) => logLegacy('detail', message, context); // Map debug → detail
/**
 * Legacy-compatible log export
 * @deprecated Use getLogger() for new code
 */
export const log = logLegacy;
