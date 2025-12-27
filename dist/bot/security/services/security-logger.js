/**
 * Security Logger — Structured Logging Service
 * =============================================
 *
 * Provides structured JSON logging with correlation ID tracking for security
 * operations. Designed for OpenTelemetry alignment and SOC 2 audit requirements.
 *
 * @module security/services/security-logger
 * @task R11 (Structured Logging - OpenTelemetry Alignment)
 * @compliance SOC 2 Type II - CC7.2 (System Monitoring)
 * @compliance CWE-778 - Insufficient Logging
 * @compliance OpenTelemetry Semantic Conventions for Logs
 *
 * Features:
 * - Structured JSON log format
 * - Correlation ID propagation (trace/span context)
 * - Log levels with filtering
 * - Context inheritance for nested operations
 * - Security-specific log categories
 * - Sensitive data redaction
 * - Performance metrics in log entries
 *
 * @example
 * ```typescript
 * import { SecurityLogger, createCorrelation } from './security-logger';
 *
 * const logger = new SecurityLogger({
 *   serviceName: 'security-bot',
 *   environment: 'production',
 * });
 *
 * // Create correlation for request
 * const correlation = createCorrelation();
 *
 * // Log with correlation
 * logger.security('Role change detected', {
 *   correlation,
 *   category: 'role-audit',
 *   guildId: '123',
 *   action: 'role-change',
 * });
 *
 * // Child logger with inherited context
 * const childLogger = logger.child({ guildId: '123' });
 * childLogger.info('Processing guild events');
 * ```
 *
 * @author Security Specialist (Sprint 1)
 * @since 2025-01-XX
 */
import crypto from 'crypto';
const writeStdout = (line) => {
    process.stdout.write(`${line}\n`);
};
const writeStderr = (line) => {
    process.stderr.write(`${line}\n`);
};
// ============================================================================
// Types
// ============================================================================
/**
 * Log levels (aligned with OpenTelemetry severity)
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["TRACE"] = 1] = "TRACE";
    LogLevel[LogLevel["DEBUG"] = 5] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 9] = "INFO";
    LogLevel[LogLevel["WARN"] = 13] = "WARN";
    LogLevel[LogLevel["ERROR"] = 17] = "ERROR";
    LogLevel[LogLevel["FATAL"] = 21] = "FATAL";
})(LogLevel || (LogLevel = {}));
/**
 * Security-specific log categories
 */
export var SecurityCategory;
(function (SecurityCategory) {
    SecurityCategory["AUTHENTICATION"] = "authentication";
    SecurityCategory["AUTHORIZATION"] = "authorization";
    SecurityCategory["ROLE_AUDIT"] = "role-audit";
    SecurityCategory["THREAT_DETECTION"] = "threat-detection";
    SecurityCategory["DATA_ACCESS"] = "data-access";
    SecurityCategory["ENCRYPTION"] = "encryption";
    SecurityCategory["KEY_ROTATION"] = "key-rotation";
    SecurityCategory["INTEGRITY_CHECK"] = "integrity-check";
    SecurityCategory["PERMISSION_CHANGE"] = "permission-change";
    SecurityCategory["AUDIT_TRAIL"] = "audit-trail";
})(SecurityCategory || (SecurityCategory = {}));
/**
 * Sensitive field patterns for redaction
 */
const SENSITIVE_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /apikey/i,
    /api_key/i,
    /authorization/i,
    /bearer/i,
    /credential/i,
    /private/i,
];
// ============================================================================
// Console Output (Default)
// ============================================================================
/**
 * Console log output implementation
 */
export class ConsoleLogOutput {
    pretty;
    constructor(options) {
        this.pretty = options?.pretty ?? process.env.NODE_ENV !== 'production';
    }
    write(entry) {
        const output = this.pretty
            ? JSON.stringify(entry, null, 2)
            : JSON.stringify(entry);
        // Use appropriate console method based on severity
        if (entry.severityNumber >= LogLevel.ERROR) {
            writeStderr(output);
        }
        else if (entry.severityNumber >= LogLevel.WARN) {
            writeStderr(output);
        }
        else {
            writeStdout(output);
        }
    }
}
// ============================================================================
// Correlation Utilities
// ============================================================================
/**
 * Generate a new correlation context
 */
export function createCorrelation(parentSpanId) {
    return {
        traceId: crypto.randomBytes(16).toString('hex'),
        spanId: crypto.randomBytes(8).toString('hex'),
        parentSpanId,
        traceFlags: 1, // Sampled
    };
}
/**
 * Create a child correlation (new span in same trace)
 */
export function childCorrelation(parent) {
    return {
        traceId: parent.traceId,
        spanId: crypto.randomBytes(8).toString('hex'),
        parentSpanId: parent.spanId,
        traceFlags: parent.traceFlags,
    };
}
/**
 * Parse correlation from W3C traceparent header
 */
export function parseTraceparent(header) {
    const parts = header.split('-');
    if (parts.length !== 4 || parts[0] !== '00') {
        return null;
    }
    return {
        traceId: parts[1],
        spanId: parts[2],
        traceFlags: parseInt(parts[3], 16),
    };
}
/**
 * Format correlation as W3C traceparent header
 */
export function formatTraceparent(correlation) {
    const flags = (correlation.traceFlags ?? 0).toString(16).padStart(2, '0');
    return `00-${correlation.traceId}-${correlation.spanId}-${flags}`;
}
// ============================================================================
// Security Logger Implementation
// ============================================================================
/**
 * Security Logger
 *
 * Structured JSON logger with correlation tracking and security-specific
 * features for SOC 2 compliance and OpenTelemetry alignment.
 */
export class SecurityLogger {
    serviceName;
    environment;
    minLevel;
    redactSensitive;
    output;
    defaultContext;
    /**
     * Create a new Security Logger
     */
    constructor(config) {
        this.serviceName = config.serviceName;
        this.environment = config.environment ?? process.env.NODE_ENV ?? 'development';
        this.minLevel = config.minLevel ?? LogLevel.INFO;
        this.redactSensitive = config.redactSensitive ?? true;
        this.output = config.output ?? new ConsoleLogOutput();
        this.defaultContext = config.defaultContext ?? {};
    }
    // ==========================================================================
    // Log Level Methods
    // ==========================================================================
    /**
     * Log at TRACE level
     */
    trace(message, attributes) {
        this.log(LogLevel.TRACE, 'trace', message, attributes);
    }
    /**
     * Log at DEBUG level
     */
    debug(message, attributes) {
        this.log(LogLevel.DEBUG, 'debug', message, attributes);
    }
    /**
     * Log at INFO level
     */
    info(message, attributes) {
        this.log(LogLevel.INFO, 'info', message, attributes);
    }
    /**
     * Log at WARN level
     */
    warn(message, attributes) {
        this.log(LogLevel.WARN, 'warn', message, attributes);
    }
    /**
     * Log at ERROR level
     */
    error(message, attributes) {
        this.log(LogLevel.ERROR, 'error', message, attributes);
    }
    /**
     * Log at FATAL level
     */
    fatal(message, attributes) {
        this.log(LogLevel.FATAL, 'fatal', message, attributes);
    }
    // ==========================================================================
    // Security-Specific Log Methods
    // ==========================================================================
    /**
     * Log a security event (INFO level with security category)
     */
    security(message, attributes) {
        this.log(LogLevel.INFO, 'info', message, {
            ...attributes,
            'security.event': true,
        });
    }
    /**
     * Log a threat detection event (WARN level)
     */
    threat(message, attributes) {
        this.log(LogLevel.WARN, 'warn', message, {
            ...attributes,
            category: attributes.category ?? SecurityCategory.THREAT_DETECTION,
            'security.event': true,
            'security.threat': true,
        });
    }
    /**
     * Log an audit trail event (INFO level)
     */
    audit(message, attributes) {
        this.log(LogLevel.INFO, 'info', message, {
            ...attributes,
            category: attributes.category ?? SecurityCategory.AUDIT_TRAIL,
            'security.event': true,
            'security.audit': true,
        });
    }
    /**
     * Log a security error (ERROR level)
     */
    securityError(message, error, attributes) {
        this.log(LogLevel.ERROR, 'error', message, {
            ...attributes,
            'security.event': true,
            error: {
                type: error.name,
                message: error.message,
                stack: error.stack,
            },
        });
    }
    // ==========================================================================
    // Timed Operations
    // ==========================================================================
    /**
     * Start a timed operation
     */
    startTimer() {
        const start = performance.now();
        return {
            end: () => performance.now() - start,
        };
    }
    /**
     * Log with automatic duration calculation
     */
    async withTiming(message, operation, attributes) {
        const timer = this.startTimer();
        try {
            const result = await operation();
            this.info(message, {
                ...attributes,
                durationMs: timer.end(),
                success: true,
            });
            return result;
        }
        catch (error) {
            this.error(message, {
                ...attributes,
                durationMs: timer.end(),
                success: false,
                error: error instanceof Error
                    ? { type: error.name, message: error.message, stack: error.stack }
                    : { type: 'Unknown', message: String(error) },
            });
            throw error;
        }
    }
    // ==========================================================================
    // Child Logger
    // ==========================================================================
    /**
     * Create a child logger with inherited context
     */
    child(additionalContext) {
        return new SecurityLogger({
            serviceName: this.serviceName,
            environment: this.environment,
            minLevel: this.minLevel,
            redactSensitive: this.redactSensitive,
            output: this.output,
            defaultContext: {
                ...this.defaultContext,
                ...additionalContext,
            },
        });
    }
    /**
     * Create a child logger with correlation context
     */
    withCorrelation(correlation) {
        return this.child({ correlation });
    }
    // ==========================================================================
    // Core Logging
    // ==========================================================================
    /**
     * Core logging method
     */
    log(severityNumber, severityText, message, attributes) {
        // Check minimum level
        if (severityNumber < this.minLevel) {
            return;
        }
        const now = new Date();
        const correlation = attributes?.correlation ?? this.defaultContext.correlation;
        // Merge attributes
        const mergedAttributes = {
            ...this.defaultContext,
            ...attributes,
        };
        // Remove correlation from attributes (it goes to top-level fields)
        delete mergedAttributes.correlation;
        // Redact sensitive fields if enabled
        const safeAttributes = this.redactSensitive
            ? this.redactSensitiveFields(mergedAttributes)
            : mergedAttributes;
        // Build log entry
        const entry = {
            timestamp: now.toISOString(),
            observedTimestamp: now.toISOString(),
            severityNumber,
            severityText,
            body: message,
            resource: {
                'service.name': this.serviceName,
                'deployment.environment': this.environment,
            },
            attributes: safeAttributes,
            traceId: correlation?.traceId,
            spanId: correlation?.spanId,
            traceFlags: correlation?.traceFlags,
        };
        // Output
        this.output.write(entry);
    }
    /**
     * Redact sensitive fields from attributes
     */
    redactSensitiveFields(obj) {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
            if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
                result[key] = '[REDACTED]';
            }
            else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                result[key] = this.redactSensitiveFields(value);
            }
            else {
                result[key] = value;
            }
        }
        return result;
    }
    // ==========================================================================
    // Configuration
    // ==========================================================================
    /**
     * Get current minimum log level
     */
    getMinLevel() {
        return this.minLevel;
    }
    /**
     * Check if a level would be logged
     */
    isLevelEnabled(level) {
        return level >= this.minLevel;
    }
    /**
     * Get service name
     */
    getServiceName() {
        return this.serviceName;
    }
    /**
     * Get environment
     */
    getEnvironment() {
        return this.environment;
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Create a Security Logger with environment-based configuration
 */
export function createSecurityLogger(overrides) {
    const serviceName = overrides?.serviceName ?? process.env.SERVICE_NAME ?? 'security-bot';
    return new SecurityLogger({
        serviceName,
        environment: overrides?.environment ?? process.env.NODE_ENV ?? 'development',
        minLevel: overrides?.minLevel ?? (process.env.LOG_LEVEL ? parseLogLevel(process.env.LOG_LEVEL) : LogLevel.INFO),
        redactSensitive: overrides?.redactSensitive ?? process.env.REDACT_SENSITIVE !== 'false',
        output: overrides?.output,
        defaultContext: overrides?.defaultContext,
    });
}
/**
 * Parse log level from string
 */
export function parseLogLevel(level) {
    const normalized = level.toLowerCase();
    switch (normalized) {
        case 'trace': return LogLevel.TRACE;
        case 'debug': return LogLevel.DEBUG;
        case 'info': return LogLevel.INFO;
        case 'warn':
        case 'warning': return LogLevel.WARN;
        case 'error': return LogLevel.ERROR;
        case 'fatal': return LogLevel.FATAL;
        default: return LogLevel.INFO;
    }
}
// ============================================================================
// Exports
// ============================================================================
export default SecurityLogger;
