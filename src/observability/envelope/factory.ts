/**
 * Envelope Factory — Create Universal Envelopes easily
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * Factory functions for creating properly structured envelopes
 * USES existing kernel correlation system — no duplication
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Usage:
 * ```typescript
 * import { createLog, createMetric, createAlert } from './factory.js';
 * 
 * // Simple log
 * const log = createLog('info', 'database', 'query', 'Query executed', { sql: '...' });
 * 
 * // Metric
 * const metric = createMetric('database', 'query', { durationMs: 12, rowCount: 100 });
 * 
 * // Alert
 * const alert = createAlert('critical', 'Database connection lost', { host: '...' });
 * ```
 * 
 * @module observability/envelope/factory
 */

import { randomUUID } from 'node:crypto';

// USE existing kernel correlation — don't duplicate!
import {
  getCurrentCorrelationId,
  getParentCorrelationId,
  generateCorrelationId as kernelGenerateCorrelationId,
} from '../../kernel/correlation.js';

import {
  type UniversalEnvelope,
  type LogEnvelope,
  type MetricEnvelope,
  type EventEnvelope,
  type TraceEnvelope,
  type AlertEnvelope,
  type OutputEnvelope,
  type LogLevel,
  type AlertSeverity,
  type EnvelopeSource as _EnvelopeSource,
  type EnvelopeCorrelation,
  type EnvelopeContext,
  type EnvelopeMetrics,
  type EnvelopeError,
  ObservationKind,
  LogLevel as LogLevelEnum,
  AlertSeverity as AlertSeverityEnum,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION — Service defaults
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Factory configuration
 */
export interface FactoryConfig {
  /** Default service name */
  service: string;
  /** Default service version */
  version?: string;
  /** Default environment */
  environment?: string;
  /** Hostname */
  host?: string;
  /** Process ID */
  pid?: number;
}

/**
 * Global factory configuration
 */
let globalConfig: FactoryConfig = {
  service: 'infinity-gauntlet',
  version: process.env.npm_package_version || '0.0.0',
  environment: process.env.NODE_ENV || 'development',
  host: process.env.RENDER_SERVICE_ID || process.env.HOSTNAME || 'localhost',
  pid: process.pid,
};

/**
 * Configure the envelope factory
 */
export function configureFactory(config: Partial<FactoryConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Get current factory configuration
 */
export function getFactoryConfig(): Readonly<FactoryConfig> {
  return globalConfig;
}

// ═══════════════════════════════════════════════════════════════════════════
// ID GENERATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique ID for an envelope (UUID v4)
 * 
 * Uses the same crypto.randomUUID() as kernel for consistency.
 * Note: Not time-sortable like ULID, but universally unique.
 */
export function generateId(): string {
  return randomUUID();
}

/**
 * Generate a correlation ID — USES KERNEL SYSTEM
 * 
 * This bridges to the existing kernel correlation system:
 * - If in an active correlation context, gets the current correlation ID
 * - Otherwise generates a new one via the kernel
 */
export function generateCorrelationId(): string {
  // Try to get from existing kernel context
  const existing = getCurrentCorrelationId();
  if (existing) return existing;
  
  // Generate new via kernel (uses crypto.randomUUID)
  return kernelGenerateCorrelationId();
}

/**
 * Get correlation chain from kernel context
 * 
 * Returns correlation IDs from the async local storage context
 * when available, enabling proper trace propagation.
 */
export function getCorrelationChain(): Partial<EnvelopeCorrelation> {
  const correlationId = getCurrentCorrelationId();
  const parentId = getParentCorrelationId();
  
  return {
    id: correlationId || generateCorrelationId(),
    parent: parentId || undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BASE ENVELOPE CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options for creating an envelope
 */
export interface CreateEnvelopeOptions<T = unknown> {
  /** Override the generated ID */
  id?: string;
  /** Override timestamp (ISO string or Date) */
  timestamp?: string | Date;
  /** Correlation IDs */
  correlation?: Partial<EnvelopeCorrelation>;
  /** Context data */
  context?: EnvelopeContext;
  /** Metrics */
  metrics?: EnvelopeMetrics;
  /** Error details */
  error?: EnvelopeError;
  /** Tags */
  tags?: string[];
  /** Data payload */
  data?: T;
}

/**
 * Create the base envelope structure
 */
function createBaseEnvelope<T>(
  kind: typeof ObservationKind[keyof typeof ObservationKind],
  level: LogLevel,
  component: string,
  operation: string,
  message: string,
  options: CreateEnvelopeOptions<T> = {}
): UniversalEnvelope<T> {
  const now = options.timestamp
    ? (typeof options.timestamp === 'string' ? options.timestamp : options.timestamp.toISOString())
    : new Date().toISOString();

  return {
    id: options.id || generateId(),
    timestamp: now,
    kind,
    level,
    source: {
      service: globalConfig.service,
      component,
      operation,
      version: globalConfig.version,
      host: globalConfig.host,
      pid: globalConfig.pid,
    },
    // Correlation: uses kernel context when available, otherwise generates new
    correlation: {
      id: options.correlation?.id || getCorrelationChain().id || generateCorrelationId(),
      parent: options.correlation?.parent || getCorrelationChain().parent,
      session: options.correlation?.session,
      trace: options.correlation?.trace,
      span: options.correlation?.span,
    },
    message,
    data: options.data,
    context: options.context ? { environment: globalConfig.environment, ...options.context } : undefined,
    metrics: options.metrics,
    error: options.error,
    tags: options.tags,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LOG FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a log envelope
 * 
 * @example
 * createLog('info', 'database', 'query', 'Query executed', { sql: 'SELECT...' });
 * createLog('error', 'bot', 'command', 'Command failed', { error: err }, { metrics: { durationMs: 100 } });
 */
export function createLog<T = unknown>(
  level: LogLevel,
  component: string,
  operation: string,
  message: string,
  data?: T,
  options?: Omit<CreateEnvelopeOptions<T>, 'data'>
): LogEnvelope<T> {
  return {
    ...createBaseEnvelope(ObservationKind.LOG, level, component, operation, message, { ...options, data }),
    kind: ObservationKind.LOG,
  };
}

/**
 * Shorthand: Create debug log
 */
export function debug<T = unknown>(component: string, operation: string, message: string, data?: T, options?: Omit<CreateEnvelopeOptions<T>, 'data'>): LogEnvelope<T> {
  return createLog(LogLevelEnum.DEBUG, component, operation, message, data, options);
}

/**
 * Shorthand: Create info log
 */
export function info<T = unknown>(component: string, operation: string, message: string, data?: T, options?: Omit<CreateEnvelopeOptions<T>, 'data'>): LogEnvelope<T> {
  return createLog(LogLevelEnum.INFO, component, operation, message, data, options);
}

/**
 * Shorthand: Create warn log
 */
export function warn<T = unknown>(component: string, operation: string, message: string, data?: T, options?: Omit<CreateEnvelopeOptions<T>, 'data'>): LogEnvelope<T> {
  return createLog(LogLevelEnum.WARN, component, operation, message, data, options);
}

/**
 * Shorthand: Create error log
 */
export function error<T = unknown>(component: string, operation: string, message: string, data?: T, options?: Omit<CreateEnvelopeOptions<T>, 'data'>): LogEnvelope<T> {
  return createLog(LogLevelEnum.ERROR, component, operation, message, data, options);
}

/**
 * Shorthand: Create fatal log
 */
export function fatal<T = unknown>(component: string, operation: string, message: string, data?: T, options?: Omit<CreateEnvelopeOptions<T>, 'data'>): LogEnvelope<T> {
  return createLog(LogLevelEnum.FATAL, component, operation, message, data, options);
}

// ═══════════════════════════════════════════════════════════════════════════
// METRIC FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a metric envelope
 * 
 * @example
 * createMetric('database', 'query', { durationMs: 12, rowCount: 100 });
 */
export function createMetric(
  component: string,
  operation: string,
  metrics: EnvelopeMetrics,
  message?: string,
  options?: CreateEnvelopeOptions<Record<string, number>>
): MetricEnvelope {
  return {
    ...createBaseEnvelope(
      ObservationKind.METRIC,
      LogLevelEnum.INFO,
      component,
      operation,
      message || `${component}.${operation} metric`,
      { ...options, data: metrics as Record<string, number> }
    ),
    kind: ObservationKind.METRIC,
    metrics,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an event envelope
 * 
 * @example
 * createEvent('user', 'login', 'User logged in', { userId: '123' });
 */
export function createEvent<T = unknown>(
  component: string,
  operation: string,
  message: string,
  data?: T,
  options?: Omit<CreateEnvelopeOptions<T>, 'data'>
): EventEnvelope<T> {
  return {
    ...createBaseEnvelope(ObservationKind.EVENT, LogLevelEnum.INFO, component, operation, message, { ...options, data }),
    kind: ObservationKind.EVENT,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a trace span envelope
 * 
 * @example
 * const span = createTrace('battle', 'resolve-turn', 'Resolving turn', 45, { turn: 1 });
 */
export function createTrace<T = unknown>(
  component: string,
  operation: string,
  message: string,
  durationMs: number,
  data?: T,
  options?: Omit<CreateEnvelopeOptions<T>, 'data' | 'metrics'>
): TraceEnvelope<T> {
  const spanId = generateCorrelationId();
  
  return {
    ...createBaseEnvelope(
      ObservationKind.TRACE,
      LogLevelEnum.INFO,
      component,
      operation,
      message,
      {
        ...options,
        data,
        correlation: {
          ...options?.correlation,
          span: spanId,
        },
      }
    ),
    kind: ObservationKind.TRACE,
    correlation: {
      id: options?.correlation?.id || generateCorrelationId(),
      parent: options?.correlation?.parent,
      session: options?.correlation?.session,
      trace: options?.correlation?.trace || generateCorrelationId(),
      span: spanId,
    },
    metrics: {
      durationMs,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ALERT FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an alert envelope
 * 
 * @example
 * createAlert('critical', 'database', 'health-check', 'Database connection lost', { host: 'db.example.com' });
 */
export function createAlert<T = unknown>(
  severity: AlertSeverity,
  component: string,
  operation: string,
  message: string,
  data?: T,
  options?: Omit<CreateEnvelopeOptions<T>, 'data'>
): AlertEnvelope<T> {
  // Map alert severity to log level
  const levelMap: Record<AlertSeverity, LogLevel> = {
    [AlertSeverityEnum.LOW]: LogLevelEnum.INFO,
    [AlertSeverityEnum.MEDIUM]: LogLevelEnum.WARN,
    [AlertSeverityEnum.HIGH]: LogLevelEnum.ERROR,
    [AlertSeverityEnum.CRITICAL]: LogLevelEnum.FATAL,
  };

  return {
    ...createBaseEnvelope(ObservationKind.ALERT, levelMap[severity], component, operation, message, { ...options, data }),
    kind: ObservationKind.ALERT,
    alertSeverity: severity,
    acknowledged: false,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT FACTORY (CLI)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a CLI output envelope
 * 
 * @example
 * createOutput('db:status', 0, { status: 'connected', latencyMs: 12 });
 */
export function createOutput<T = unknown>(
  command: string,
  exitCode: number,
  data?: T,
  options?: Omit<CreateEnvelopeOptions<T>, 'data'>
): OutputEnvelope<T> {
  const status = exitCode === 0 ? 'success' : 'failure';
  
  return {
    ...createBaseEnvelope(
      ObservationKind.OUTPUT,
      exitCode === 0 ? LogLevelEnum.INFO : LogLevelEnum.ERROR,
      'cli',
      command,
      `Command ${command} ${status}`,
      { ...options, data }
    ),
    kind: ObservationKind.OUTPUT,
    command,
    exitCode,
    status,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR CONVERSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a JavaScript Error to EnvelopeError
 */
export function errorToEnvelopeError(err: Error): EnvelopeError {
  return {
    name: err.name,
    message: err.message,
    code: (err as Error & { code?: string }).code,
    stack: err.stack,
    fingerprint: `${err.name}:${err.message}`.slice(0, 100),
    cause: err.cause instanceof Error ? errorToEnvelopeError(err.cause) : undefined,
  };
}

/**
 * Create an error log from an Error object
 */
export function createErrorLog<T = unknown>(
  component: string,
  operation: string,
  err: Error,
  data?: T,
  options?: Omit<CreateEnvelopeOptions<T>, 'data' | 'error'>
): LogEnvelope<T> {
  return createLog(LogLevelEnum.ERROR, component, operation, err.message, data, {
    ...options,
    error: errorToEnvelopeError(err),
  });
}
