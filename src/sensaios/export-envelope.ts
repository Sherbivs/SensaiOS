/**
 * SensaiOS Export Envelope — Scoped Envelope for Multi-Tenant Export
 * 
 * ExportEnvelope extends the existing UniversalEnvelope with a MANDATORY
 * TenantScope. This ensures all observability data is properly scoped for
 * multi-tenant environments and can be exported to various destinations.
 * 
 * @module sensaios/export-envelope
 * @since 2025-12-28
 */

import { randomUUID } from 'node:crypto';
import type {
  UniversalEnvelope,
  ObservationKindType,
  LogLevelType,
  EnvelopeContext,
  EnvelopeMetrics,
  EnvelopeError,
} from '../observability/envelope/types.js';
import type { TenantScope } from './tenant-scope.js';
import type { ExportFormat, ExportDestination, ExportMeta } from './types.js';

// Re-export for convenience
export type { UniversalEnvelope, TenantScope, ExportMeta };

// ============================================================================
// EXPORT ENVELOPE TYPE
// ============================================================================

/**
 * ExportEnvelope — UniversalEnvelope with mandatory scope
 * 
 * Use this type when:
 * - Creating logs for multi-tenant systems
 * - Exporting to external observability platforms
 * - Ensuring tenant isolation in log queries
 * 
 * @template T - Type of the data payload
 */
export interface ExportEnvelope<T = unknown> extends UniversalEnvelope<T> {
  /**
   * REQUIRED: Tenant scope for multi-tenancy
   * 
   * Every ExportEnvelope MUST have a scope. This is the key
   * difference from UniversalEnvelope.
   */
  scope: TenantScope;

  /**
   * Export metadata
   * 
   * Information about how/where this envelope will be exported.
   */
  export: ExportMeta;
}

// ============================================================================
// TYPE GUARD
// ============================================================================

/**
 * Type guard for ExportEnvelope
 */
export function isExportEnvelope(value: unknown): value is ExportEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.timestamp === 'string' &&
    typeof obj.scope === 'object' &&
    obj.scope !== null &&
    typeof obj.export === 'object' &&
    obj.export !== null &&
    typeof obj.message === 'string'
  );
}

// ============================================================================
// FACTORY PARAMETERS
// ============================================================================

/**
 * Parameters for creating an ExportEnvelope
 */
export interface CreateExportEnvelopeParams<T = unknown> {
  // Required
  scope: TenantScope;
  message: string;

  // Optional identity
  id?: string;
  timestamp?: string;

  // Optional classification
  kind?: ObservationKindType;
  level?: LogLevelType;

  // Optional source
  operation?: string;
  version?: string;
  host?: string;
  pid?: number;

  // Optional correlation
  correlationId?: string;
  parentCorrelationId?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;

  // Optional payload
  data?: T;
  context?: EnvelopeContext;
  metrics?: EnvelopeMetrics;
  error?: EnvelopeError;
  tags?: string[];

  // Optional export
  format?: ExportFormat;
  destination?: ExportDestination;
  batchId?: string;
  sequence?: number;
  ttlSeconds?: number;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Generate a unique ID (UUID v4)
 */
function generateId(): string {
  return randomUUID();
}

/**
 * Create an ExportEnvelope from components
 * 
 * @param params - Creation parameters
 * @returns Fully populated ExportEnvelope
 */
export function createExportEnvelope<T = unknown>(
  params: CreateExportEnvelopeParams<T>
): ExportEnvelope<T> {
  const now = new Date().toISOString();

  return {
    // Identity
    id: params.id ?? generateId(),
    timestamp: params.timestamp ?? now,

    // Classification
    kind: params.kind ?? 'log',
    level: params.level ?? 'info',

    // Source
    source: {
      service: params.scope.service,
      component: params.scope.component,
      operation: params.operation ?? 'unknown',
      version: params.version,
      host: params.host,
      pid: params.pid ?? process.pid,
    },

    // Correlation
    correlation: {
      id: params.correlationId ?? generateId(),
      parent: params.parentCorrelationId,
      session: params.sessionId,
      trace: params.traceId,
      span: params.spanId,
    },

    // Payload
    message: params.message,
    data: params.data,

    // Extensions
    context: params.context,
    metrics: params.metrics,
    error: params.error,
    tags: params.tags,

    // SensaiOS additions
    scope: params.scope,
    export: {
      format: params.format ?? 'json',
      destination: params.destination ?? 'buffer',
      exportedAt: now,
      batchId: params.batchId,
      sequence: params.sequence,
      ttlSeconds: params.ttlSeconds,
    },
  };
}

/**
 * Convert a UniversalEnvelope to ExportEnvelope by adding scope
 * 
 * @param envelope - Existing UniversalEnvelope
 * @param scope - TenantScope to add
 * @param exportMeta - Optional export metadata overrides
 * @returns ExportEnvelope with scope
 */
export function toExportEnvelope<T>(
  envelope: UniversalEnvelope<T>,
  scope: TenantScope,
  exportMeta?: Partial<ExportMeta>
): ExportEnvelope<T> {
  return {
    ...envelope,
    scope,
    export: {
      format: exportMeta?.format ?? 'json',
      destination: exportMeta?.destination ?? 'buffer',
      exportedAt: new Date().toISOString(),
      batchId: exportMeta?.batchId,
      sequence: exportMeta?.sequence,
      ttlSeconds: exportMeta?.ttlSeconds,
    },
  };
}

// ============================================================================
// LOGGING HELPERS
// ============================================================================

/**
 * Create a log ExportEnvelope
 */
function createLog<T = unknown>(
  scope: TenantScope,
  level: LogLevelType,
  message: string,
  data?: T,
  correlationId?: string
): ExportEnvelope<T> {
  return createExportEnvelope({
    scope,
    kind: 'log',
    level,
    message,
    data,
    correlationId,
  });
}

/**
 * Convenience methods for creating log envelopes at different levels
 */
export const LogEnvelope = {
  /**
   * Create a DEBUG level log envelope
   */
  debug: <T = unknown>(
    scope: TenantScope,
    message: string,
    data?: T,
    correlationId?: string
  ): ExportEnvelope<T> => createLog(scope, 'debug', message, data, correlationId),

  /**
   * Create an INFO level log envelope
   */
  info: <T = unknown>(
    scope: TenantScope,
    message: string,
    data?: T,
    correlationId?: string
  ): ExportEnvelope<T> => createLog(scope, 'info', message, data, correlationId),

  /**
   * Create a WARN level log envelope
   */
  warn: <T = unknown>(
    scope: TenantScope,
    message: string,
    data?: T,
    correlationId?: string
  ): ExportEnvelope<T> => createLog(scope, 'warn', message, data, correlationId),

  /**
   * Create an ERROR level log envelope
   */
  error: <T = unknown>(
    scope: TenantScope,
    message: string,
    data?: T,
    correlationId?: string
  ): ExportEnvelope<T> => createLog(scope, 'error', message, data, correlationId),

  /**
   * Create a FATAL level log envelope
   */
  fatal: <T = unknown>(
    scope: TenantScope,
    message: string,
    data?: T,
    correlationId?: string
  ): ExportEnvelope<T> => createLog(scope, 'fatal', message, data, correlationId),
};

// ============================================================================
// SERIALIZATION
// ============================================================================

/**
 * Serialize envelope to JSON string
 */
export function toJson<T>(envelope: ExportEnvelope<T>): string {
  return JSON.stringify(envelope);
}

/**
 * Serialize envelope to JSONL (newline-delimited JSON)
 */
export function toJsonl<T>(envelope: ExportEnvelope<T>): string {
  return JSON.stringify(envelope) + '\n';
}

/**
 * Serialize envelope to human-readable pretty format
 */
export function toPretty<T>(envelope: ExportEnvelope<T>): string {
  const prefix = `[${envelope.scope.environment}:${envelope.scope.tenant}]`;
  const level = envelope.level.toUpperCase().padEnd(5);
  const component = envelope.source.component;
  const operation = envelope.source.operation;

  let line = `${envelope.timestamp} ${prefix} ${level} [${component}:${operation}] ${envelope.message}`;

  if (envelope.data && typeof envelope.data === 'object' && Object.keys(envelope.data as object).length > 0) {
    line += ` ${JSON.stringify(envelope.data)}`;
  }

  if (envelope.error) {
    line += `\n  Error: ${envelope.error.name}: ${envelope.error.message}`;
    if (envelope.error.stack) {
      const stackLines = envelope.error.stack.split('\n').slice(1, 4);
      line += `\n  ${stackLines.join('\n  ')}`;
    }
  }

  return line;
}

// ============================================================================
// LOKI SERIALIZATION
// ============================================================================

/**
 * Loki stream format
 */
export interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

/**
 * Loki push request format
 */
export interface LokiPushRequest {
  streams: LokiStream[];
}

/**
 * Serialize envelopes for Grafana Loki ingestion
 * 
 * Groups envelopes by scope (same labels go in same stream)
 */
export function toLoki<T>(envelopes: ExportEnvelope<T>[]): LokiPushRequest {
  const streams = new Map<string, LokiStream>();

  for (const envelope of envelopes) {
    // Create label set
    const labels: Record<string, string> = {
      tenant: envelope.scope.tenant,
      env: envelope.scope.environment,
      service: envelope.scope.service,
      component: envelope.scope.component,
      level: envelope.level,
    };

    // Create label key for grouping
    const labelKey = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');

    if (!streams.has(labelKey)) {
      streams.set(labelKey, { stream: labels, values: [] });
    }

    // Loki expects nanosecond timestamps
    const timestampNs = (new Date(envelope.timestamp).getTime() * 1_000_000).toString();
    streams.get(labelKey)!.values.push([timestampNs, toJson(envelope)]);
  }

  return { streams: Array.from(streams.values()) };
}

// ============================================================================
// BATCHING
// ============================================================================

/**
 * Envelope batcher for efficient transmission
 */
export class EnvelopeBatcher<T = unknown> {
  private buffer: ExportEnvelope<T>[] = [];
  private batchId: string;
  private sequence = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly maxSize: number = 100,
    private readonly maxWaitMs: number = 5000,
    private readonly onFlush: (batch: ExportEnvelope<T>[]) => Promise<void>
  ) {
    this.batchId = generateId();
    this.startTimer();
  }

  /**
   * Push an envelope to the batch
   */
  push(envelope: ExportEnvelope<T>): void {
    envelope.export.batchId = this.batchId;
    envelope.export.sequence = this.sequence++;

    this.buffer.push(envelope);

    if (this.buffer.length >= this.maxSize) {
      void this.flush();
    }
  }

  /**
   * Flush the current batch
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const batch = this.buffer;
    this.buffer = [];
    this.batchId = generateId();
    this.sequence = 0;

    await this.onFlush(batch);
  }

  /**
   * Stop the batcher and flush remaining
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  /**
   * Get current buffer size
   */
  get size(): number {
    return this.buffer.length;
  }

  private startTimer(): void {
    this.timer = setInterval(() => {
      void this.flush();
    }, this.maxWaitMs);
  }
}
