# 02 — Export Envelope Design

**Component:** ExportEnvelope  
**Status:** SPECIFICATION  
**Created:** 2025-12-28

---

## Overview

ExportEnvelope extends the existing UniversalEnvelope with a **mandatory** TenantScope. This ensures all observability data is properly scoped for multi-tenant environments and can be exported to various destinations with full context.

---

## Design Principles

### 1. **Extends, Doesn't Replace**
ExportEnvelope builds on UniversalEnvelope — existing code continues to work.

### 2. **Scope is Mandatory**
Unlike UniversalEnvelope where context is optional, ExportEnvelope requires scope.

### 3. **Export-Ready**
Includes metadata for serialization and transmission to external systems.

### 4. **Type-Safe**
Full TypeScript support with generics for payload typing.

---

## Type Definition

```typescript
import type { UniversalEnvelope, EnvelopeSource, EnvelopeCorrelation } from '../../observability/envelope/types.js';
import type { TenantScope } from './tenant-scope.js';

/**
 * Export format options
 */
export type ExportFormat = 'json' | 'jsonl' | 'pretty' | 'csv' | 'logfmt';

/**
 * Export destination types
 */
export type ExportDestination = 
  | 'console'
  | 'file'
  | 'database'
  | 'loki'
  | 'discord'
  | 'webhook'
  | 'buffer';

/**
 * Export metadata
 */
export interface ExportMeta {
  /** Serialization format */
  format: ExportFormat;
  
  /** Target destination */
  destination: ExportDestination;
  
  /** When the envelope was prepared for export */
  exportedAt: string;
  
  /** Batch ID if part of a batch */
  batchId?: string;
  
  /** Sequence number within batch */
  sequence?: number;
  
  /** TTL in seconds (for retention) */
  ttlSeconds?: number;
}

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
    typeof obj.export === 'object' &&
    typeof obj.message === 'string'
  );
}
```

---

## Factory Functions

### Create Export Envelope

```typescript
import { ulid } from 'ulid';

/**
 * Create an ExportEnvelope from components
 */
export function createExportEnvelope<T = unknown>(
  params: CreateExportEnvelopeParams<T>
): ExportEnvelope<T> {
  const now = new Date().toISOString();
  
  return {
    // Identity
    id: params.id ?? ulid(),
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
      id: params.correlationId ?? ulid(),
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

interface CreateExportEnvelopeParams<T> {
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
```

### Convert UniversalEnvelope to ExportEnvelope

```typescript
/**
 * Convert a UniversalEnvelope to ExportEnvelope by adding scope
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
```

### Quick Logging Helpers

```typescript
/**
 * Create a log ExportEnvelope
 */
export function createLog<T = unknown>(
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
 * Convenience methods
 */
export const LogEnvelope = {
  debug: <T>(scope: TenantScope, msg: string, data?: T, cid?: string) => 
    createLog(scope, 'debug', msg, data, cid),
    
  info: <T>(scope: TenantScope, msg: string, data?: T, cid?: string) => 
    createLog(scope, 'info', msg, data, cid),
    
  warn: <T>(scope: TenantScope, msg: string, data?: T, cid?: string) => 
    createLog(scope, 'warn', msg, data, cid),
    
  error: <T>(scope: TenantScope, msg: string, data?: T, cid?: string) => 
    createLog(scope, 'error', msg, data, cid),
    
  fatal: <T>(scope: TenantScope, msg: string, data?: T, cid?: string) => 
    createLog(scope, 'fatal', msg, data, cid),
};
```

---

## Serialization

### To JSON

```typescript
/**
 * Serialize to JSON string
 */
export function toJson<T>(envelope: ExportEnvelope<T>): string {
  return JSON.stringify(envelope);
}

/**
 * Serialize to JSONL (newline-delimited)
 */
export function toJsonl<T>(envelope: ExportEnvelope<T>): string {
  return JSON.stringify(envelope) + '\n';
}
```

### To Pretty String

```typescript
/**
 * Serialize to human-readable format
 */
export function toPretty<T>(envelope: ExportEnvelope<T>): string {
  const prefix = `[${envelope.scope.environment}:${envelope.scope.tenant}]`;
  const level = envelope.level.toUpperCase().padEnd(5);
  const component = envelope.source.component;
  const operation = envelope.source.operation;
  
  let line = `${envelope.timestamp} ${prefix} ${level} [${component}:${operation}] ${envelope.message}`;
  
  if (envelope.data && Object.keys(envelope.data as object).length > 0) {
    line += ` ${JSON.stringify(envelope.data)}`;
  }
  
  if (envelope.error) {
    line += `\n  Error: ${envelope.error.name}: ${envelope.error.message}`;
    if (envelope.error.stack) {
      line += `\n  ${envelope.error.stack.split('\n').slice(1, 4).join('\n  ')}`;
    }
  }
  
  return line;
}
```

### To Loki Format

```typescript
/**
 * Serialize for Grafana Loki ingestion
 */
export function toLoki<T>(envelopes: ExportEnvelope<T>[]): LokiPushRequest {
  // Group by scope (same labels)
  const streams = new Map<string, LokiStream>();
  
  for (const envelope of envelopes) {
    const labels = `{tenant="${envelope.scope.tenant}",env="${envelope.scope.environment}",service="${envelope.scope.service}",component="${envelope.scope.component}",level="${envelope.level}"}`;
    
    if (!streams.has(labels)) {
      streams.set(labels, { stream: JSON.parse(labelsToObject(labels)), values: [] });
    }
    
    const timestamp = new Date(envelope.timestamp).getTime() * 1_000_000; // nanoseconds
    streams.get(labels)!.values.push([timestamp.toString(), toJson(envelope)]);
  }
  
  return { streams: Array.from(streams.values()) };
}

interface LokiStream {
  stream: Record<string, string>;
  values: [string, string][];
}

interface LokiPushRequest {
  streams: LokiStream[];
}
```

---

## Batching

```typescript
/**
 * Batch envelopes for efficient transmission
 */
export class EnvelopeBatcher<T = unknown> {
  private buffer: ExportEnvelope<T>[] = [];
  private batchId: string;
  private sequence = 0;
  
  constructor(
    private readonly maxSize: number = 100,
    private readonly maxWaitMs: number = 5000,
    private readonly onFlush: (batch: ExportEnvelope<T>[]) => Promise<void>
  ) {
    this.batchId = ulid();
    this.startTimer();
  }
  
  push(envelope: ExportEnvelope<T>): void {
    envelope.export.batchId = this.batchId;
    envelope.export.sequence = this.sequence++;
    
    this.buffer.push(envelope);
    
    if (this.buffer.length >= this.maxSize) {
      this.flush();
    }
  }
  
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const batch = this.buffer;
    this.buffer = [];
    this.batchId = ulid();
    this.sequence = 0;
    
    await this.onFlush(batch);
  }
  
  private startTimer(): void {
    setInterval(() => this.flush(), this.maxWaitMs);
  }
}
```

---

## Integration with Existing Systems

### With scopedLogger

```typescript
import { scopedLogger } from '../../observability/envelope/console.js';
import type { TenantScope } from './tenant-scope.js';

/**
 * Create a scoped logger that produces ExportEnvelopes
 */
export function createTenantLogger(scope: TenantScope) {
  const baseLogger = scopedLogger(scope.component);
  
  return {
    debug: (op: string, msg: string, data?: unknown) => {
      baseLogger.debug(op, msg, data);
      emitEnvelope(LogEnvelope.debug(scope, msg, data));
    },
    
    info: (op: string, msg: string, data?: unknown) => {
      baseLogger.info(op, msg, data);
      emitEnvelope(LogEnvelope.info(scope, msg, data));
    },
    
    warn: (op: string, msg: string, data?: unknown) => {
      baseLogger.warn(op, msg, data);
      emitEnvelope(LogEnvelope.warn(scope, msg, data));
    },
    
    error: (op: string, msg: string, data?: unknown) => {
      baseLogger.error(op, msg, data);
      emitEnvelope(LogEnvelope.error(scope, msg, data));
    },
  };
}
```

### With Event Bus

```typescript
import { eventBus } from '../../shared/event-bus.js';

function emitEnvelope<T>(envelope: ExportEnvelope<T>): void {
  eventBus.emit('envelope.created', {
    correlationId: envelope.correlation.id,
    payload: envelope,
  });
}
```

---

## Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('ExportEnvelope', () => {
  const testScope: TenantScope = {
    tenant: 'test-guild',
    environment: 'development',
    service: 'test-service',
    component: 'test-component',
  };

  it('should create envelope with scope', () => {
    const envelope = createExportEnvelope({
      scope: testScope,
      message: 'Test message',
    });
    
    expect(envelope.scope).toEqual(testScope);
    expect(envelope.message).toBe('Test message');
    expect(envelope.id).toBeDefined();
    expect(envelope.timestamp).toBeDefined();
  });

  it('should convert UniversalEnvelope to ExportEnvelope', () => {
    const universal: UniversalEnvelope = {
      id: 'test-id',
      timestamp: '2025-12-28T00:00:00Z',
      kind: 'log',
      level: 'info',
      source: { service: 's', component: 'c', operation: 'o' },
      correlation: { id: 'cid' },
      message: 'Test',
    };
    
    const exported = toExportEnvelope(universal, testScope);
    
    expect(exported.scope).toEqual(testScope);
    expect(exported.export.format).toBe('json');
  });

  it('should serialize to pretty format', () => {
    const envelope = LogEnvelope.info(testScope, 'Test message', { key: 'value' });
    const pretty = toPretty(envelope);
    
    expect(pretty).toContain('[development:test-guild]');
    expect(pretty).toContain('INFO');
    expect(pretty).toContain('Test message');
  });
});
```

---

## Next Steps

→ Continue to [03-error-detection.md](./03-error-detection.md) for error subsystem design.
