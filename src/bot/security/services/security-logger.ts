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

// ============================================================================
// Types
// ============================================================================

/**
 * Log levels (aligned with OpenTelemetry severity)
 */
export enum LogLevel {
  TRACE = 1,
  DEBUG = 5,
  INFO = 9,
  WARN = 13,
  ERROR = 17,
  FATAL = 21,
}

/**
 * Log level names
 */
export type LogLevelName = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Security-specific log categories
 */
export enum SecurityCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  ROLE_AUDIT = 'role-audit',
  THREAT_DETECTION = 'threat-detection',
  DATA_ACCESS = 'data-access',
  ENCRYPTION = 'encryption',
  KEY_ROTATION = 'key-rotation',
  INTEGRITY_CHECK = 'integrity-check',
  PERMISSION_CHANGE = 'permission-change',
  AUDIT_TRAIL = 'audit-trail',
}

/**
 * Correlation context for distributed tracing
 */
export interface CorrelationContext {
  /** Unique trace ID (32 hex chars, W3C trace context) */
  traceId: string;
  /** Unique span ID (16 hex chars, W3C trace context) */
  spanId: string;
  /** Parent span ID (for nested operations) */
  parentSpanId?: string;
  /** Trace flags (sampled, etc.) */
  traceFlags?: number;
}

/**
 * Security logger configuration
 */
export interface SecurityLoggerConfig {
  /** Service name for log attribution */
  serviceName: string;
  /** Environment (development, staging, production) */
  environment?: string;
  /** Minimum log level to emit */
  minLevel?: LogLevel;
  /** Whether to redact sensitive data */
  redactSensitive?: boolean;
  /** Custom output handler (default: console) */
  output?: LogOutput;
  /** Additional context to include in all logs */
  defaultContext?: Record<string, unknown>;
}

/**
 * Log entry structure (OpenTelemetry aligned)
 */
export interface LogEntry {
  /** Timestamp in ISO 8601 format */
  timestamp: string;
  /** Observed timestamp (when log was recorded) */
  observedTimestamp: string;
  /** Log severity level */
  severityNumber: LogLevel;
  /** Log severity name */
  severityText: LogLevelName;
  /** Log message body */
  body: string;
  /** Resource attributes (service info) */
  resource: {
    'service.name': string;
    'deployment.environment'?: string;
  };
  /** Log attributes */
  attributes: Record<string, unknown>;
  /** Trace context */
  traceId?: string;
  spanId?: string;
  traceFlags?: number;
}

/**
 * Security log attributes
 */
export interface SecurityLogAttributes {
  /** Correlation context */
  correlation?: CorrelationContext;
  /** Security category */
  category?: SecurityCategory | string;
  /** Discord guild ID */
  guildId?: string;
  /** Discord user ID */
  userId?: string;
  /** Target of the action */
  target?: string;
  /** Action being performed */
  action?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Success/failure indicator */
  success?: boolean;
  /** Error details */
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  /** Additional custom attributes */
  [key: string]: unknown;
}

/**
 * Log output interface
 */
export interface LogOutput {
  /** Write log entry */
  write(entry: LogEntry): void;
}

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
export class ConsoleLogOutput implements LogOutput {
  private readonly pretty: boolean;

  constructor(options?: { pretty?: boolean }) {
    this.pretty = options?.pretty ?? process.env.NODE_ENV !== 'production';
  }

  write(entry: LogEntry): void {
    const output = this.pretty
      ? JSON.stringify(entry, null, 2)
      : JSON.stringify(entry);

    // Use appropriate console method based on severity
    if (entry.severityNumber >= LogLevel.ERROR) {
      // eslint-disable-next-line no-console
      console.error(output);
    } else if (entry.severityNumber >= LogLevel.WARN) {
      // eslint-disable-next-line no-console
      console.warn(output);
    } else {
      // eslint-disable-next-line no-console
      console.log(output);
    }
  }
}

// ============================================================================
// Correlation Utilities
// ============================================================================

/**
 * Generate a new correlation context
 */
export function createCorrelation(parentSpanId?: string): CorrelationContext {
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
export function childCorrelation(parent: CorrelationContext): CorrelationContext {
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
export function parseTraceparent(header: string): CorrelationContext | null {
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
export function formatTraceparent(correlation: CorrelationContext): string {
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
  private readonly serviceName: string;
  private readonly environment: string;
  private readonly minLevel: LogLevel;
  private readonly redactSensitive: boolean;
  private readonly output: LogOutput;
  private readonly defaultContext: Record<string, unknown>;

  /**
   * Create a new Security Logger
   */
  constructor(config: SecurityLoggerConfig) {
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
  trace(message: string, attributes?: SecurityLogAttributes): void {
    this.log(LogLevel.TRACE, 'trace', message, attributes);
  }

  /**
   * Log at DEBUG level
   */
  debug(message: string, attributes?: SecurityLogAttributes): void {
    this.log(LogLevel.DEBUG, 'debug', message, attributes);
  }

  /**
   * Log at INFO level
   */
  info(message: string, attributes?: SecurityLogAttributes): void {
    this.log(LogLevel.INFO, 'info', message, attributes);
  }

  /**
   * Log at WARN level
   */
  warn(message: string, attributes?: SecurityLogAttributes): void {
    this.log(LogLevel.WARN, 'warn', message, attributes);
  }

  /**
   * Log at ERROR level
   */
  error(message: string, attributes?: SecurityLogAttributes): void {
    this.log(LogLevel.ERROR, 'error', message, attributes);
  }

  /**
   * Log at FATAL level
   */
  fatal(message: string, attributes?: SecurityLogAttributes): void {
    this.log(LogLevel.FATAL, 'fatal', message, attributes);
  }

  // ==========================================================================
  // Security-Specific Log Methods
  // ==========================================================================

  /**
   * Log a security event (INFO level with security category)
   */
  security(message: string, attributes: SecurityLogAttributes): void {
    this.log(LogLevel.INFO, 'info', message, {
      ...attributes,
      'security.event': true,
    });
  }

  /**
   * Log a threat detection event (WARN level)
   */
  threat(message: string, attributes: SecurityLogAttributes): void {
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
  audit(message: string, attributes: SecurityLogAttributes): void {
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
  securityError(message: string, error: Error, attributes?: SecurityLogAttributes): void {
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
  startTimer(): { end: () => number } {
    const start = performance.now();
    return {
      end: () => performance.now() - start,
    };
  }

  /**
   * Log with automatic duration calculation
   */
  async withTiming<T>(
    message: string,
    operation: () => Promise<T>,
    attributes?: SecurityLogAttributes
  ): Promise<T> {
    const timer = this.startTimer();
    try {
      const result = await operation();
      this.info(message, {
        ...attributes,
        durationMs: timer.end(),
        success: true,
      });
      return result;
    } catch (error) {
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
  child(additionalContext: Record<string, unknown>): SecurityLogger {
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
  withCorrelation(correlation: CorrelationContext): SecurityLogger {
    return this.child({ correlation });
  }

  // ==========================================================================
  // Core Logging
  // ==========================================================================

  /**
   * Core logging method
   */
  private log(
    severityNumber: LogLevel,
    severityText: LogLevelName,
    message: string,
    attributes?: SecurityLogAttributes
  ): void {
    // Check minimum level
    if (severityNumber < this.minLevel) {
      return;
    }

    const now = new Date();
    const correlation = attributes?.correlation ?? (this.defaultContext.correlation as CorrelationContext | undefined);

    // Merge attributes
    const mergedAttributes: Record<string, unknown> = {
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
    const entry: LogEntry = {
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
  private redactSensitiveFields(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
        result[key] = '[REDACTED]';
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.redactSensitiveFields(value as Record<string, unknown>);
      } else {
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
  getMinLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * Check if a level would be logged
   */
  isLevelEnabled(level: LogLevel): boolean {
    return level >= this.minLevel;
  }

  /**
   * Get service name
   */
  getServiceName(): string {
    return this.serviceName;
  }

  /**
   * Get environment
   */
  getEnvironment(): string {
    return this.environment;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Security Logger with environment-based configuration
 */
export function createSecurityLogger(
  overrides?: Partial<SecurityLoggerConfig>
): SecurityLogger {
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
export function parseLogLevel(level: string): LogLevel {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case 'trace': return LogLevel.TRACE;
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': case 'warning': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    case 'fatal': return LogLevel.FATAL;
    default: return LogLevel.INFO;
  }
}

// ============================================================================
// Exports
// ============================================================================

export default SecurityLogger;
