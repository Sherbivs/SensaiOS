/**
 * Kernel Correlation ID Tracking
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * REQUEST TRACING ACROSS SERVICE BOUNDARIES
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Provides correlation ID generation and context propagation for distributed
 * tracing across Discord commands, workers, and async operations.
 * 
 * FEATURES:
 * - Unique correlation ID generation (UUIDv4-based)
 * - Async context propagation (AsyncLocalStorage)
 * - Parent-child correlation tracking
 * - Automatic attachment to kernel log entries
 * - Discord interaction ID integration
 * 
 * USAGE PATTERNS:
 * 
 * 1. Start a new trace (e.g., on Discord command):
 *    const ctx = startTrace({ source: 'discord', interactionId: interaction.id });
 *    // All logs within this context automatically get correlationId
 * 
 * 2. Continue a trace (e.g., in async worker):
 *    withCorrelation(parentCorrelationId, async () => {
 *      // Logs get parentCorrelationId + new child correlationId
 *    });
 * 
 * 3. Manual attachment:
 *    kernel.info('component', 'message', { correlationId: getCurrentCorrelationId() });
 * 
 * @module kernel/correlation
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Correlation context stored in AsyncLocalStorage
 */
export interface CorrelationContext {
  /** Primary correlation ID for this trace */
  correlationId: string;
  
  /** Parent correlation ID (for nested/child traces) */
  parentCorrelationId?: string;
  
  /** Root correlation ID (original trace start) */
  rootCorrelationId: string;
  
  /** Trace depth (0 = root, 1+ = child) */
  depth: number;
  
  /** Source of the trace (discord, worker, cron, api, etc.) */
  source: TraceSource;
  
  /** Trace start time */
  startTime: number;
  
  /** Optional metadata */
  metadata?: TraceMetadata;
}

/**
 * Trace source identifier
 */
export type TraceSource = 
  | 'discord'      // Discord interaction
  | 'worker'       // Background worker
  | 'cron'         // Scheduled job
  | 'api'          // HTTP API request
  | 'database'     // Database operation
  | 'internal'     // Internal system call
  | 'test'         // Test execution
  | 'unknown';     // Fallback

/**
 * Optional trace metadata
 */
export interface TraceMetadata {
  /** Discord interaction ID */
  interactionId?: string;
  
  /** Discord user ID */
  userId?: string;
  
  /** Discord guild ID */
  guildId?: string;
  
  /** Command or operation name */
  operation?: string;
  
  /** Worker name */
  workerName?: string;
  
  /** HTTP request ID */
  requestId?: string;
  
  /** Custom metadata */
  [key: string]: unknown;
}

/**
 * Options for starting a new trace
 */
export interface StartTraceOptions {
  /** Trace source */
  source: TraceSource;
  
  /** Parent correlation ID (for child traces) */
  parentCorrelationId?: string;
  
  /** Custom correlation ID (normally auto-generated) */
  correlationId?: string;
  
  /** Optional metadata */
  metadata?: TraceMetadata;
}

/**
 * Trace statistics
 */
export interface CorrelationStats {
  /** Total traces started */
  tracesStarted: number;
  
  /** Currently active traces */
  activeTraces: number;
  
  /** Traces by source */
  tracesBySource: Record<TraceSource, number>;
  
  /** Maximum depth seen */
  maxDepthSeen: number;
  
  /** Orphaned child traces (parent not found) */
  orphanedTraces: number;
}

// ============================================================================
// ASYNC LOCAL STORAGE
// ============================================================================

/** AsyncLocalStorage for correlation context propagation */
const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

// ============================================================================
// STATISTICS
// ============================================================================

const stats: CorrelationStats = {
  tracesStarted: 0,
  activeTraces: 0,
  tracesBySource: {
    discord: 0,
    worker: 0,
    cron: 0,
    api: 0,
    database: 0,
    internal: 0,
    test: 0,
    unknown: 0,
  },
  maxDepthSeen: 0,
  orphanedTraces: 0,
};

// Active traces for tracking
const activeTraces = new Map<string, CorrelationContext>();

// ============================================================================
// CORRELATION ID GENERATION
// ============================================================================

/**
 * Generate a new correlation ID
 * Format: 8-4-4-4-12 UUID (standard UUIDv4)
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Generate a short correlation ID (for logging display)
 * Format: 8 chars (first segment of UUID)
 */
export function generateShortCorrelationId(): string {
  return randomUUID().split('-')[0];
}

// ============================================================================
// CONTEXT API
// ============================================================================

/**
 * Get current correlation context from async storage
 */
export function getCurrentContext(): CorrelationContext | undefined {
  return correlationStorage.getStore();
}

/**
 * Get current correlation ID
 */
export function getCurrentCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

/**
 * Get current parent correlation ID
 */
export function getParentCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.parentCorrelationId;
}

/**
 * Get current root correlation ID
 */
export function getRootCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.rootCorrelationId;
}

/**
 * Check if we're inside a traced context
 */
export function isInTrace(): boolean {
  return correlationStorage.getStore() !== undefined;
}

// ============================================================================
// TRACE LIFECYCLE
// ============================================================================

/**
 * Start a new trace and run callback within its context
 * 
 * @param options - Trace options
 * @param callback - Function to run within trace context
 * @returns Result of callback
 */
export function startTrace<T>(
  options: StartTraceOptions,
  callback: () => T
): T {
  const parentContext = correlationStorage.getStore();
  
  const correlationId = options.correlationId ?? generateCorrelationId();
  const parentCorrelationId = options.parentCorrelationId ?? parentContext?.correlationId;
  const rootCorrelationId = parentContext?.rootCorrelationId ?? correlationId;
  const depth = parentContext ? parentContext.depth + 1 : 0;
  
  const context: CorrelationContext = {
    correlationId,
    parentCorrelationId,
    rootCorrelationId,
    depth,
    source: options.source,
    startTime: Date.now(),
    metadata: options.metadata,
  };
  
  // Update stats
  stats.tracesStarted++;
  stats.activeTraces++;
  stats.tracesBySource[options.source]++;
  if (depth > stats.maxDepthSeen) {
    stats.maxDepthSeen = depth;
  }
  
  // Track active trace
  activeTraces.set(correlationId, context);
  
  try {
    return correlationStorage.run(context, callback);
  } finally {
    stats.activeTraces--;
    activeTraces.delete(correlationId);
  }
}

/**
 * Start a new async trace and run callback within its context
 * 
 * @param options - Trace options
 * @param callback - Async function to run within trace context
 * @returns Promise of callback result
 */
export async function startTraceAsync<T>(
  options: StartTraceOptions,
  callback: () => Promise<T>
): Promise<T> {
  const parentContext = correlationStorage.getStore();
  
  const correlationId = options.correlationId ?? generateCorrelationId();
  const parentCorrelationId = options.parentCorrelationId ?? parentContext?.correlationId;
  const rootCorrelationId = parentContext?.rootCorrelationId ?? correlationId;
  const depth = parentContext ? parentContext.depth + 1 : 0;
  
  const context: CorrelationContext = {
    correlationId,
    parentCorrelationId,
    rootCorrelationId,
    depth,
    source: options.source,
    startTime: Date.now(),
    metadata: options.metadata,
  };
  
  // Update stats
  stats.tracesStarted++;
  stats.activeTraces++;
  stats.tracesBySource[options.source]++;
  if (depth > stats.maxDepthSeen) {
    stats.maxDepthSeen = depth;
  }
  
  // Track active trace
  activeTraces.set(correlationId, context);
  
  try {
    return await correlationStorage.run(context, callback);
  } finally {
    stats.activeTraces--;
    activeTraces.delete(correlationId);
  }
}

/**
 * Continue an existing trace (for cross-boundary propagation)
 * 
 * @param parentCorrelationId - Parent correlation ID to continue from
 * @param callback - Function to run within child trace context
 * @param source - Source of this continuation
 * @returns Result of callback
 */
export function continueTrace<T>(
  parentCorrelationId: string,
  source: TraceSource,
  callback: () => T
): T {
  return startTrace(
    { source, parentCorrelationId },
    callback
  );
}

/**
 * Continue an existing async trace
 */
export async function continueTraceAsync<T>(
  parentCorrelationId: string,
  source: TraceSource,
  callback: () => Promise<T>
): Promise<T> {
  return startTraceAsync(
    { source, parentCorrelationId },
    callback
  );
}

/**
 * Run callback with a specific correlation ID (manual injection)
 * Useful for detached operations that know their parent
 */
export function withCorrelation<T>(
  correlationId: string,
  callback: () => T,
  source: TraceSource = 'internal'
): T {
  return startTrace(
    { source, correlationId },
    callback
  );
}

// ============================================================================
// DISCORD INTEGRATION HELPERS
// ============================================================================

/**
 * Start a trace for a Discord interaction
 */
export function startDiscordTrace<T>(
  interactionId: string,
  userId: string,
  guildId: string | null,
  operation: string,
  callback: () => T
): T {
  return startTrace({
    source: 'discord',
    metadata: {
      interactionId,
      userId,
      guildId: guildId ?? undefined,
      operation,
    },
  }, callback);
}

/**
 * Start an async trace for a Discord interaction
 */
export async function startDiscordTraceAsync<T>(
  interactionId: string,
  userId: string,
  guildId: string | null,
  operation: string,
  callback: () => Promise<T>
): Promise<T> {
  return startTraceAsync({
    source: 'discord',
    metadata: {
      interactionId,
      userId,
      guildId: guildId ?? undefined,
      operation,
    },
  }, callback);
}

// ============================================================================
// WORKER INTEGRATION HELPERS
// ============================================================================

/**
 * Start a trace for a background worker job (synchronous)
 */
export function startWorkerTrace<T>(
  workerName: string,
  jobId?: string,
  callback?: () => T
): T | CorrelationContext {
  const context: StartTraceOptions = {
    source: 'worker',
    metadata: {
      workerName,
      requestId: jobId,
    },
  };
  
  if (callback) {
    return startTrace(context, callback);
  }
  
  // Return context for manual management
  const correlationId = generateCorrelationId();
  return {
    correlationId,
    rootCorrelationId: correlationId,
    depth: 0,
    source: 'worker',
    startTime: Date.now(),
    metadata: context.metadata,
  };
}

/**
 * Start an async trace for a background worker job (Phase 2)
 */
export async function startWorkerTraceAsync<T>(
  workerName: string,
  jobId: string | undefined,
  callback: () => Promise<T>
): Promise<T> {
  return startTraceAsync({
    source: 'worker',
    metadata: {
      workerName,
      requestId: jobId,
    },
  }, callback);
}

// ============================================================================
// LOG ENTRY ENRICHMENT
// ============================================================================

/**
 * Enrich a log entry with correlation data
 * Called by kernel-logger.ts to attach correlation IDs
 */
export function enrichWithCorrelation<T extends object>(data: T): T & {
  correlationId?: string;
  parentCorrelationId?: string;
  rootCorrelationId?: string;
  traceSource?: TraceSource;
  traceDepth?: number;
} {
  const context = correlationStorage.getStore();
  
  if (!context) {
    return data;
  }
  
  return {
    ...data,
    correlationId: context.correlationId,
    parentCorrelationId: context.parentCorrelationId,
    rootCorrelationId: context.rootCorrelationId,
    traceSource: context.source,
    traceDepth: context.depth,
  };
}

// ============================================================================
// DIAGNOSTICS
// ============================================================================

/**
 * Get correlation statistics
 */
export function getCorrelationStats(): CorrelationStats {
  return { ...stats };
}

/**
 * Get all active traces
 */
export function getActiveTraces(): CorrelationContext[] {
  return Array.from(activeTraces.values());
}

/**
 * Get trace by correlation ID
 */
export function getTraceById(correlationId: string): CorrelationContext | undefined {
  return activeTraces.get(correlationId);
}

/**
 * Reset correlation statistics
 */
export function resetCorrelationStats(): void {
  stats.tracesStarted = 0;
  stats.activeTraces = 0;
  stats.maxDepthSeen = 0;
  stats.orphanedTraces = 0;
  for (const key of Object.keys(stats.tracesBySource) as TraceSource[]) {
    stats.tracesBySource[key] = 0;
  }
}

// ============================================================================
// EXPORTS FOR KERNEL INTEGRATION
// ============================================================================

/**
 * Get correlation data for kernel log entry
 * Returns object to merge into log entry data
 */
export function getCorrelationData(): Record<string, unknown> | undefined {
  const context = correlationStorage.getStore();
  
  if (!context) {
    return undefined;
  }
  
  return {
    correlationId: context.correlationId,
    parentCorrelationId: context.parentCorrelationId,
    rootCorrelationId: context.rootCorrelationId,
    traceSource: context.source,
    traceDepth: context.depth,
    traceDuration: Date.now() - context.startTime,
  };
}
