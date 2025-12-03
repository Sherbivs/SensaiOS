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

import { getLogger, type LogLevel as CoreLogLevel, type LogContext } from './logger.js';

// =============================================================================
// PERFORMANCE: Cached Logger Instance
// =============================================================================

/** Cached logger instance — avoids repeated getLogger() calls in hot paths */
let cachedLogger: ReturnType<typeof getLogger> | null = null;

/** Get or create cached logger instance */
function getCachedLogger(): ReturnType<typeof getLogger> {
  return cachedLogger ??= getLogger();
}

// =============================================================================
// SHARED TYPES — Strict type definitions for legacy API compatibility
// =============================================================================

/** 
 * Legacy log levels (superset of all legacy systems)
 * @remarks Mapped to core 4-tier system: debug | info | warn | error
 */
export type LegacyLogLevel = 
  | 'trace' | 'debug' | 'info' | 'notice' | 'warn' | 'error' | 'critical' | 'fatal'
  | 'success' | 'detail';

/** All valid legacy log level values (for runtime validation) */
export const LEGACY_LOG_LEVELS = [
  'trace', 'debug', 'info', 'notice', 'warn', 'error', 'critical', 'fatal', 'success', 'detail'
] as const satisfies readonly LegacyLogLevel[];

/** 
 * Legacy categories (case-insensitive via union)
 * @remarks Both kebab-case and SCREAMING_SNAKE accepted for compatibility
 */
export type LegacyCategory = 
  | 'system' | 'SYSTEM'
  | 'database' | 'DATABASE'
  | 'discord' | 'DISCORD'
  | 'cache' | 'CACHE'
  | 'game-engine' | 'GAME_ENGINE'
  | 'security' | 'SECURITY'
  | 'performance' | 'PERFORMANCE'
  | 'alert' | 'ALERT'
  | 'resource' | 'RESOURCE'
  | 'error' | 'ERROR'
  | 'user-action' | 'USER_ACTION'
  | 'integration' | 'INTEGRATION'
  | (string & {}); // Extensible but preserves autocomplete

/** 
 * Legacy log options (union of all legacy interfaces)
 * @remarks Accepts arbitrary keys for backwards compatibility via index signature
 */
export interface LegacyLogOptions {
  readonly category?: LegacyCategory;
  readonly correlationId?: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly error?: Error;
  readonly component?: string;
  readonly service?: string;
  readonly worker?: string;
  readonly operation?: string;
  readonly action?: string;
  readonly [key: string]: unknown;
}

/** 
 * Legacy log entry structure (read-only for safety)
 */
export interface LegacyLogEntry {
  readonly timestamp: Date;
  readonly level: LegacyLogLevel;
  readonly category?: LegacyCategory;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly correlationId?: string;
  readonly stackTrace?: string;
}

/** 
 * Buffered log entry (for shared/log.ts compatibility)
 */
export interface BufferedLogEntry {
  readonly level: LegacyLogLevel;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly count: number;
  readonly firstSeen: number;
  readonly lastSeen: number;
}

// =============================================================================
// CORE MAPPING FUNCTIONS — Optimized with frozen lookup tables
// =============================================================================

/** Level mapping table (frozen for V8 optimization) */
const LEVEL_MAP: Readonly<Record<string, CoreLogLevel>> = Object.freeze({
  trace: 'debug', debug: 'debug', detail: 'debug',
  info: 'info', notice: 'info', success: 'info',
  warn: 'warn',
  error: 'error', critical: 'error', fatal: 'error',
});

/** Map any legacy level to core logger level */
export function mapLevel(level: LegacyLogLevel | string): CoreLogLevel {
  return LEVEL_MAP[level] ?? 'info';
}

/** Infer component from legacy context */
export function inferComponent(ctx?: LegacyLogOptions | Record<string, unknown>): string {
  if (!ctx) return 'app';
  if (ctx.component) return String(ctx.component);
  if (ctx.service) return String(ctx.service);
  if (ctx.worker) return `worker.${ctx.worker}`;
  if (ctx.category) return String(ctx.category).toLowerCase();
  if (ctx.guild || ctx.guildId) return 'bot';
  if (ctx.database || ctx.db) return 'database';
  if (ctx.cache) return 'cache';
  if (ctx.battle) return 'battle';
  return 'app';
}

/** Infer operation from message content */
export function inferOperation(msg: string, ctx?: LegacyLogOptions | Record<string, unknown>): string {
  // Fast path: explicit operation/action in context
  if (ctx?.operation) return String(ctx.operation);
  if (ctx?.action) return String(ctx.action);
  
  // Infer from message keywords (ordered by frequency)
  const lower = msg?.toLowerCase() ?? '';
  if (lower.includes('error') || lower.includes('fail')) return 'error';
  if (lower.includes('start')) return 'start';
  if (lower.includes('connect')) return 'connect';
  if (lower.includes('initializ')) return 'initialize';
  if (lower.includes('query')) return 'query';
  if (lower.includes('stop') || lower.includes('shutdown')) return 'shutdown';
  if (lower.includes('register')) return 'register';
  if (lower.includes('health')) return 'health-check';
  return 'operation';
}

/** Keys to exclude from metadata extraction */
const INTERNAL_KEYS = new Set([
  'component', 'service', 'worker', 'operation', 
  'action', 'category', 'correlationId', 'error',
  'context', 'data'
]);

/** Build core LogContext from legacy options (optimized) */
export function buildContext(
  opts?: LegacyLogOptions | Record<string, unknown>,
  err?: unknown
): LogContext | undefined {
  // Fast path: no options and no error
  if (!opts && !err) return undefined;
  
  const ctx: LogContext = {};
  
  if (opts) {
    // Extract metadata, excluding internal keys
    const meta: Record<string, unknown> = {};
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
    } else if (typeof errorObj === 'object') {
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
export function legacyLog(
  level: LegacyLogLevel | string,
  message: string,
  opts?: LegacyLogOptions | Record<string, unknown>,
  err?: unknown
): void {
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
} as const);

/** Type for AI log category keys */
export type AILogCategory = typeof AI_LOG_CATEGORIES[keyof typeof AI_LOG_CATEGORIES];

/** Helper: Create category-prefixed log function */
const categoryLog = (level: LegacyLogLevel) => 
  (cat: string, msg: string, opts?: unknown) => 
    legacyLog(level, msg, { category: cat, ...(opts as object) });

/** AI logger stub functions (consolidated factory pattern) */
export const aiLoggerStubs = Object.freeze({
  CONFIG: Object.freeze({ categories: AI_LOG_CATEGORIES }),
  initialize: async (_opts?: unknown): Promise<void> => {},
  shutdown: async (): Promise<void> => {},
  log: categoryLog('info'),
  trace: categoryLog('trace'),
  debug: categoryLog('debug'),
  info: categoryLog('info'),
  notice: categoryLog('info'),
  warn: categoryLog('warn'),
  error: categoryLog('error'),
  critical: categoryLog('error'),
  fatal: categoryLog('fatal'),
  flush: async (): Promise<void> => {},
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
  initialize: async (): Promise<void> => {},
  shutdown: async (): Promise<void> => {},
  analyze: () => EMPTY_ANALYSIS,
  getRecentErrors: (): readonly never[] => [],
  getPerformanceMetrics: () => Object.freeze({}),
});

// =============================================================================
// AI LOG INTEGRATIONS COMPATIBILITY
// =============================================================================

/** AI integrations stub functions (frozen) */
export const aiIntegrationsStubs = Object.freeze({
  integrateAll: async (_opts?: unknown): Promise<void> => {},
  integrateErrorTracker: (): void => {},
  integrateEventBus: (): void => {},
});

// =============================================================================
// LOG INGESTION WORKER COMPATIBILITY
// =============================================================================

/** Log ingestion worker stub functions (frozen) */
export const logIngestionStubs = Object.freeze({
  startLogIngestionWorker: async (): Promise<void> => {},
  stopLogIngestionWorker: async (): Promise<void> => {},
});

// =============================================================================
// INTELLIGENT LOGGER CLASS COMPATIBILITY
// =============================================================================

/** Empty stats object (frozen singleton) */
const EMPTY_STATS = Object.freeze({
  entriesLogged: 0,
  duplicatesFiltered: 0,
  bufferSize: 0,
  lastFlush: null as Date | null,
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
  log(level: LegacyLogLevel, message: string, opts?: LegacyLogOptions): void {
    legacyLog(level, message, opts);
  }

  /** Log trace-level message (maps to debug) */
  trace(message: string, opts?: LegacyLogOptions): void {
    legacyLog('trace', message, opts);
  }

  /** Log debug-level message */
  debug(message: string, opts?: LegacyLogOptions): void {
    legacyLog('debug', message, opts);
  }

  /** Log info-level message */
  info(message: string, opts?: LegacyLogOptions): void {
    legacyLog('info', message, opts);
  }

  /** Log warning-level message */
  warn(message: string, opts?: LegacyLogOptions): void {
    legacyLog('warn', message, opts);
  }

  /** 
   * Log error-level message with optional error object
   * @param message - Error description
   * @param errOrOpts - Error object or options
   * @param opts - Additional options (when errOrOpts is Error)
   */
  error(message: string, errOrOpts?: unknown, opts?: LegacyLogOptions): void {
    if (errOrOpts instanceof Error) {
      legacyLog('error', message, opts, errOrOpts);
    } else if (errOrOpts && typeof errOrOpts === 'object' && 'category' in errOrOpts) {
      legacyLog('error', message, errOrOpts as LegacyLogOptions);
    } else if (errOrOpts) {
      legacyLog('error', message, opts, errOrOpts);
    } else {
      legacyLog('error', message, opts);
    }
  }

  /** Log fatal-level message (maps to error) */
  fatal(message: string, opts?: LegacyLogOptions): void {
    legacyLog('fatal', message, opts);
  }

  /** Get logger statistics (returns frozen empty stats) */
  getStats(): Readonly<typeof EMPTY_STATS> {
    return EMPTY_STATS;
  }

  /** Graceful shutdown (no-op, handled by DB-First logger) */
  async shutdown(): Promise<void> {}
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
} as const);

/** Type for log label keys */
export type LogLabelKey = keyof typeof LOG_LABEL;

/** 
 * Legacy log() function with attached convenience methods
 * @example
 * log('info', 'User logged in', { userId: 123 });
 * log.info('Server started');
 * log.error('Connection failed', { error: err.message });
 */
export function legacyLogFunction(
  level: string,
  message: string,
  context?: Record<string, unknown>
): void {
  legacyLog(level, message, context);
}

// Attach convenience methods (matches legacy logger.js API)
legacyLogFunction.info = (msg: string, ctx?: Record<string, unknown>): void => legacyLog('info', msg, ctx);
legacyLogFunction.warn = (msg: string, ctx?: Record<string, unknown>): void => legacyLog('warn', msg, ctx);
legacyLogFunction.error = (msg: string, ctx?: Record<string, unknown>): void => legacyLog('error', msg, ctx);
legacyLogFunction.success = (msg: string, ctx?: Record<string, unknown>): void => legacyLog('info', msg, ctx);
legacyLogFunction.detail = (msg: string, ctx?: Record<string, unknown>): void => legacyLog('debug', msg, ctx);

/** 
 * Legacy report function for structured logging
 * @example
 * report('Database Migration', { tables: 5, duration: '2.3s' });
 */
export function legacyReport(
  title: string,
  meta: Record<string, unknown> = {},
  level = 'info'
): void {
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
  setLevel: (_level: string): void => {},
  debug: (msg: string, meta?: Record<string, unknown>): void => legacyLog('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>): void => legacyLog('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>): void => legacyLog('warn', msg, meta),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>): void => legacyLog('error', msg, meta, err),
  _format: (level: string, msg: string, err?: unknown, meta?: Record<string, unknown>) => ({
    t: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
    ...(err ? { err: { message: String(err) } } : {}),
  }),
});

/** Flush buffered logs (no-op for compatibility) */
export function flushBufferedLogs(_entries: readonly BufferedLogEntry[]): void {}

// =============================================================================
// NO-OP STUBS — Auto-refresh & stats (handled by observability system)
// =============================================================================

/** @deprecated Use observability system instead */
export function startAutoRefresh(): void {}

/** @deprecated Use observability system instead */
export function stopAutoRefresh(): void {}

/** @deprecated Use observability system instead */
export function getFormattedStats(): Readonly<{ message: string }> {
  return Object.freeze({ message: 'Use observability system' });
}
