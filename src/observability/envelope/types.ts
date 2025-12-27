/**
 * Universal Envelope — The Foundation of All Observability
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTENDS existing systems, doesn't replace them
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides CONVERTERS and a UNIFIED type that bridges:
 *   - Kernel types (LogObservation, ErrorObservation) — kernel layer
 *   - ObservabilityEvent — hub layer for backends
 *   - LogEntry — shared/logger.ts database schema
 * 
 * The UniversalEnvelope is a SUPERSET that can:
 *   1. Accept data FROM any existing format
 *   2. Convert TO any existing format
 *   3. Be used directly for new code
 * 
 * Benefits:
 *   - Parse ANY output with ONE parser
 *   - Filter by any field (level, component, correlation, etc.)
 *   - Aggregate across services
 *   - Export to any format (JSON, CSV, NDJSON, etc.)
 *   - Machine-readable AND human-readable
 *   - BACKWARDS COMPATIBLE with existing systems
 * 
 * @module observability/envelope/types
 * @version 1.0.0
 * @since 2025-12-27
 */

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT EXISTING TYPES — We extend, not replace
// ═══════════════════════════════════════════════════════════════════════════

// Kernel types (root observer layer)
import type {
  LogObservation,
  ErrorObservation,
  ServiceObservation,
  EventObservation,
} from '../../kernel/kernel-types.js';

// Observability hub types (backend layer)
import type {
  ObservabilityEvent,
  ObservabilityLevel,
} from '../hub/observability-types.js';

// Re-export for convenience
export type { LogObservation, ErrorObservation, ServiceObservation, EventObservation };
export type { ObservabilityEvent, ObservabilityLevel };

// ═══════════════════════════════════════════════════════════════════════════
// CORE ENUMS — Canonical values for classification
// ═══════════════════════════════════════════════════════════════════════════

/**
 * What kind of observation is this?
 */
export const ObservationKind = {
  LOG: 'log',           // Application log message
  METRIC: 'metric',     // Numeric measurement
  EVENT: 'event',       // Discrete occurrence (user action, system event)
  TRACE: 'trace',       // Distributed trace span
  ALERT: 'alert',       // Actionable notification
  OUTPUT: 'output',     // CLI command output
} as const;

export type ObservationKindType = typeof ObservationKind[keyof typeof ObservationKind];

/**
 * Severity levels (4-tier canonical system + fatal for crashes)
 */
export const LogLevel = {
  DEBUG: 'debug',       // Development details
  INFO: 'info',         // Normal operations
  WARN: 'warn',         // Potential issues
  ERROR: 'error',       // Failures (recoverable)
  FATAL: 'fatal',       // Crashes (unrecoverable)
} as const;

export type LogLevelType = typeof LogLevel[keyof typeof LogLevel];

/**
 * Alert severity for actionable notifications
 */
export const AlertSeverity = {
  LOW: 'low',           // FYI, no action needed
  MEDIUM: 'medium',     // Should investigate
  HIGH: 'high',         // Needs attention soon
  CRITICAL: 'critical', // Immediate action required
} as const;

export type AlertSeverityType = typeof AlertSeverity[keyof typeof AlertSeverity];

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE — Where did this observation come from?
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Source identification for any observation
 */
export interface EnvelopeSource {
  /** Service name (e.g., 'infinity-gauntlet', 'security-bot') */
  service: string;
  
  /** Component within service (e.g., 'battle-engine', 'homestead', 'database') */
  component: string;
  
  /** Operation being performed (e.g., 'spawn', 'catch', 'query', 'heal') */
  operation: string;
  
  /** Service version (semver) */
  version?: string;
  
  /** Hostname or container ID */
  host?: string;
  
  /** Process ID */
  pid?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORRELATION — How do observations relate to each other?
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Correlation IDs for tracing and grouping
 */
export interface EnvelopeCorrelation {
  /** Primary correlation ID (request/operation scoped) */
  id: string;
  
  /** Parent correlation (for hierarchical traces) */
  parent?: string;
  
  /** User session ID */
  session?: string;
  
  /** Distributed trace ID (for cross-service tracing) */
  trace?: string;
  
  /** Span ID within a trace */
  span?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTEXT — Domain-specific metadata
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Discord context (game-specific)
 */
export interface DiscordContext {
  userId?: string;
  guildId?: string;
  channelId?: string;
  messageId?: string;
  interactionId?: string;
}

/**
 * Game context (Pokemon-specific)
 */
export interface GameContext {
  trainerId?: string;
  pokemonId?: string;
  battleId?: string;
  encounterId?: string;
}

/**
 * Database context
 */
export interface DatabaseContext {
  database?: string;
  table?: string;
  operation?: 'select' | 'insert' | 'update' | 'delete' | 'transaction';
  rowsAffected?: number;
}

/**
 * HTTP context
 */
export interface HttpContext {
  method?: string;
  path?: string;
  statusCode?: number;
  userAgent?: string;
  ip?: string;
}

/**
 * Combined context (flexible, extensible)
 */
export interface EnvelopeContext {
  /** Environment (production, development, test) */
  environment?: string;
  
  /** Discord-specific context */
  discord?: DiscordContext;
  
  /** Game-specific context */
  game?: GameContext;
  
  /** Database-specific context */
  database?: DatabaseContext;
  
  /** HTTP-specific context */
  http?: HttpContext;
  
  /** Additional custom fields */
  [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICS — Numeric measurements
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Standard metrics that can be attached to any observation
 */
export interface EnvelopeMetrics {
  /** Operation duration in milliseconds */
  durationMs?: number;
  
  /** Network latency in milliseconds */
  latencyMs?: number;
  
  /** Count of items/operations */
  count?: number;
  
  /** Size in bytes */
  sizeBytes?: number;
  
  /** Percentage (0-100) */
  percentage?: number;
  
  /** Custom numeric metrics */
  [key: string]: number | undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR — Error details for error-level observations
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structured error information
 */
export interface EnvelopeError {
  /** Error class name (e.g., 'TypeError', 'PrismaClientError') */
  name: string;
  
  /** Error message */
  message: string;
  
  /** Error code (e.g., 'P2002', 'ECONNREFUSED') */
  code?: string;
  
  /** Stack trace (sanitized, no secrets) */
  stack?: string;
  
  /** Error fingerprint for deduplication */
  fingerprint?: string;
  
  /** Cause chain (for wrapped errors) */
  cause?: EnvelopeError;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE UNIVERSAL ENVELOPE — The main type
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Universal Envelope — ONE schema for ALL observations
 * 
 * @template T - Type of the `data` payload
 * 
 * @example
 * // Log message
 * const logEnvelope: UniversalEnvelope<{ query: string }> = {
 *   id: '01JFZX...',
 *   timestamp: '2025-12-27T14:30:00.000Z',
 *   kind: 'log',
 *   level: 'info',
 *   source: { service: 'infinity-gauntlet', component: 'database', operation: 'query' },
 *   correlation: { id: 'abc123' },
 *   message: 'Query executed successfully',
 *   data: { query: 'SELECT * FROM users' },
 *   metrics: { durationMs: 12 }
 * };
 */
export interface UniversalEnvelope<T = unknown> {
  // ─── IDENTITY ─────────────────────────────────────────────────────────────
  
  /** Unique identifier (ULID or UUID) */
  id: string;
  
  /** ISO-8601 timestamp with timezone */
  timestamp: string;
  
  // ─── CLASSIFICATION ───────────────────────────────────────────────────────
  
  /** Type of observation */
  kind: ObservationKind;
  
  /** Severity level */
  level: LogLevel;
  
  // ─── SOURCE ───────────────────────────────────────────────────────────────
  
  /** Where this observation originated */
  source: EnvelopeSource;
  
  // ─── CORRELATION ──────────────────────────────────────────────────────────
  
  /** IDs for tracing and grouping */
  correlation: EnvelopeCorrelation;
  
  // ─── PAYLOAD ──────────────────────────────────────────────────────────────
  
  /** Human-readable message */
  message: string;
  
  /** Structured data payload (type-safe) */
  data?: T;
  
  // ─── OPTIONAL EXTENSIONS ──────────────────────────────────────────────────
  
  /** Domain-specific context */
  context?: EnvelopeContext;
  
  /** Numeric measurements */
  metrics?: EnvelopeMetrics;
  
  /** Error details (if level is error/fatal) */
  error?: EnvelopeError;
  
  /** Tags for filtering/grouping */
  tags?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED ENVELOPES — Type-safe variants
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log-specific envelope
 */
export interface LogEnvelope<T = unknown> extends UniversalEnvelope<T> {
  kind: typeof ObservationKind.LOG;
}

/**
 * Metric-specific envelope
 */
export interface MetricEnvelope extends UniversalEnvelope<Record<string, number>> {
  kind: typeof ObservationKind.METRIC;
  metrics: EnvelopeMetrics;
}

/**
 * Event-specific envelope
 */
export interface EventEnvelope<T = unknown> extends UniversalEnvelope<T> {
  kind: typeof ObservationKind.EVENT;
}

/**
 * Trace span envelope
 */
export interface TraceEnvelope<T = unknown> extends UniversalEnvelope<T> {
  kind: typeof ObservationKind.TRACE;
  correlation: EnvelopeCorrelation & {
    span: string;      // Required for traces
    parent?: string;   // Optional parent span
  };
  metrics: EnvelopeMetrics & {
    durationMs: number; // Required for traces
  };
}

/**
 * Alert envelope
 */
export interface AlertEnvelope<T = unknown> extends UniversalEnvelope<T> {
  kind: typeof ObservationKind.ALERT;
  /** Alert-specific severity */
  alertSeverity: AlertSeverity;
  /** Has this alert been acknowledged? */
  acknowledged?: boolean;
  /** When was it acknowledged? */
  acknowledgedAt?: string;
  /** Who acknowledged it? */
  acknowledgedBy?: string;
}

/**
 * CLI output envelope
 */
export interface OutputEnvelope<T = unknown> extends UniversalEnvelope<T> {
  kind: typeof ObservationKind.OUTPUT;
  /** Command that produced this output */
  command: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Human-readable status */
  status: 'success' | 'failure' | 'partial';
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS — Runtime type checking
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type guard for UniversalEnvelope
 */
export function isEnvelope(value: unknown): value is UniversalEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.timestamp === 'string' &&
    typeof obj.kind === 'string' &&
    typeof obj.level === 'string' &&
    typeof obj.source === 'object' &&
    typeof obj.correlation === 'object' &&
    typeof obj.message === 'string'
  );
}

/**
 * Type guard for LogEnvelope
 */
export function isLogEnvelope(value: unknown): value is LogEnvelope {
  return isEnvelope(value) && value.kind === ObservationKind.LOG;
}

/**
 * Type guard for MetricEnvelope
 */
export function isMetricEnvelope(value: unknown): value is MetricEnvelope {
  return isEnvelope(value) && value.kind === ObservationKind.METRIC;
}

/**
 * Type guard for AlertEnvelope
 */
export function isAlertEnvelope(value: unknown): value is AlertEnvelope {
  return isEnvelope(value) && value.kind === ObservationKind.ALERT;
}

/**
 * Type guard for OutputEnvelope
 */
export function isOutputEnvelope(value: unknown): value is OutputEnvelope {
  return isEnvelope(value) && value.kind === ObservationKind.OUTPUT;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERTERS — Bridge existing formats to UniversalEnvelope
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert a Kernel LogObservation to UniversalEnvelope
 * 
 * @example
 * const envelope = fromLogObservation(kernelLogObs);
 */
export function fromLogObservation(obs: LogObservation): UniversalEnvelope {
  return {
    id: `log-${obs.uptimeMs}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: obs.timestamp.toISOString(),
    kind: ObservationKind.LOG,
    level: normalizeLevel(obs.level),
    source: {
      service: obs.source,
      component: obs.component,
      operation: obs.operation,
    },
    correlation: {
      id: obs.correlationId || `kernel-${obs.uptimeMs}`,
    },
    message: obs.message,
    data: obs.metadata,
    metrics: {
      uptimeMs: obs.uptimeMs,
    },
  };
}

/**
 * Convert a Kernel ErrorObservation to UniversalEnvelope
 */
export function fromErrorObservation(obs: ErrorObservation): UniversalEnvelope {
  return {
    id: obs.errorId,
    timestamp: obs.timestamp.toISOString(),
    kind: ObservationKind.LOG,
    level: LogLevel.ERROR,
    source: {
      service: obs.source,
      component: obs.category,
      operation: 'error',
    },
    correlation: {
      id: obs.fingerprint,
    },
    message: obs.message,
    data: obs.context,
    error: {
      name: obs.name,
      message: obs.message,
      stack: obs.stack,
      fingerprint: obs.fingerprint,
    },
    metrics: {
      uptimeMs: obs.uptimeMs,
    },
  };
}

/**
 * Convert an ObservabilityEvent (hub format) to UniversalEnvelope
 */
export function fromObservabilityEvent(event: ObservabilityEvent): UniversalEnvelope {
  return {
    id: `obs-${event.timestamp.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: event.timestamp.toISOString(),
    kind: ObservationKind.EVENT,
    level: normalizeLevel(event.level),
    source: {
      service: event.service,
      component: event.topic.split('.')[0] || 'unknown',
      operation: event.topic.split('.').slice(1).join('.') || event.topic,
    },
    correlation: {
      id: event.correlationId || `hub-${event.timestamp.getTime()}`,
      parent: event.parentCorrelationId,
    },
    message: event.topic,
    data: event.payload,
  };
}

/**
 * Convert UniversalEnvelope TO ObservabilityEvent (for hub/backends)
 */
export function toObservabilityEvent(envelope: UniversalEnvelope): ObservabilityEvent {
  return {
    timestamp: new Date(envelope.timestamp),
    topic: `${envelope.source.component}.${envelope.source.operation}`,
    level: envelope.level as ObservabilityLevel,
    service: envelope.source.service,
    payload: {
      id: envelope.id,
      message: envelope.message,
      data: envelope.data,
      metrics: envelope.metrics,
      error: envelope.error,
      context: envelope.context,
      tags: envelope.tags,
    },
    correlationId: envelope.correlation.id,
    parentCorrelationId: envelope.correlation.parent,
  };
}

/**
 * Convert UniversalEnvelope TO LogObservation (for kernel)
 */
export function toLogObservation(envelope: UniversalEnvelope, uptimeMs: number): LogObservation {
  return {
    source: envelope.source.service,
    level: envelope.level,
    component: envelope.source.component,
    operation: envelope.source.operation,
    message: envelope.message,
    timestamp: new Date(envelope.timestamp),
    uptimeMs,
    correlationId: envelope.correlation.id,
    metadata: envelope.data as Record<string, unknown> | undefined,
  };
}

/**
 * Normalize various level strings to our canonical LogLevel
 */
function normalizeLevel(level: string): LogLevel {
  const normalized = level.toLowerCase();
  switch (normalized) {
    case 'debug':
    case 'trace':
    case 'verbose':
      return LogLevel.DEBUG;
    case 'info':
    case 'log':
    case 'success':
    case 'detail':
      return LogLevel.INFO;
    case 'warn':
    case 'warning':
      return LogLevel.WARN;
    case 'error':
    case 'err':
      return LogLevel.ERROR;
    case 'fatal':
    case 'critical':
    case 'emergency':
      return LogLevel.FATAL;
    default:
      return LogLevel.INFO;
  }
}

