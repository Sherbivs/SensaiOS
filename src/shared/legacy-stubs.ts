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
 * @module shared/legacy-stubs
 */

import { getLogger, type LogLevel as CoreLogLevel, type LogContext } from './logger.js';

// =============================================================================
// SHARED TYPES — Used by multiple legacy modules
// =============================================================================

/** Legacy log levels (superset of all legacy systems) */
export type LegacyLogLevel = 
  | 'trace' | 'debug' | 'info' | 'notice' | 'warn' | 'error' | 'critical' | 'fatal'
  | 'success' | 'detail'; // Old logger.js levels

/** Legacy categories (case-insensitive via union) */
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
  | string; // Extensible

/** Legacy log options (union of all legacy interfaces) */
export interface LegacyLogOptions {
  category?: LegacyCategory;
  correlationId?: string;
  context?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: Error;
  component?: string;
  service?: string;
  worker?: string;
  operation?: string;
  action?: string;
  [key: string]: unknown;
}

/** Legacy log entry structure */
export interface LegacyLogEntry {
  timestamp: Date;
  level: LegacyLogLevel;
  category?: LegacyCategory;
  message: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  stackTrace?: string;
}

/** Buffered log entry (for shared/log.ts compatibility) */
export interface BufferedLogEntry {
  level: LegacyLogLevel;
  message: string;
  context?: Record<string, unknown>;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

// =============================================================================
// CORE MAPPING FUNCTIONS — Single implementation for all legacy modules
// =============================================================================

/** Map any legacy level to core logger level */
export function mapLevel(level: LegacyLogLevel | string): CoreLogLevel {
  const map: Record<string, CoreLogLevel> = {
    trace: 'debug', debug: 'debug', detail: 'debug',
    info: 'info', notice: 'info', success: 'info',
    warn: 'warn',
    error: 'error', critical: 'error', fatal: 'error',
  };
  return map[level] || 'info';
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
  if (ctx?.operation) return String(ctx.operation);
  if (ctx?.action) return String(ctx.action);
  
  const lower = (msg || '').toLowerCase();
  if (lower.includes('initializ')) return 'initialize';
  if (lower.includes('start')) return 'start';
  if (lower.includes('stop') || lower.includes('shutdown')) return 'shutdown';
  if (lower.includes('connect')) return 'connect';
  if (lower.includes('query')) return 'query';
  if (lower.includes('error') || lower.includes('fail')) return 'error';
  if (lower.includes('register')) return 'register';
  if (lower.includes('health')) return 'health-check';
  return 'operation';
}

/** Build core LogContext from legacy options */
export function buildContext(
  opts?: LegacyLogOptions | Record<string, unknown>,
  err?: unknown
): LogContext | undefined {
  const ctx: LogContext = {};
  
  if (opts) {
    // Extract metadata, excluding internal keys
    const meta = { ...opts };
    delete meta.component;
    delete meta.service;
    delete meta.worker;
    delete meta.operation;
    delete meta.action;
    delete meta.category;
    delete meta.correlationId;
    delete meta.error;
    
    // Merge context/data into metadata
    if (opts.context) Object.assign(meta, opts.context);
    if (opts.data) Object.assign(meta, opts.data);
    
    if (Object.keys(meta).length > 0) {
      ctx.metadata = meta;
    }
    
    if (opts.correlationId) {
      ctx.correlationId = String(opts.correlationId);
    }
  }
  
  // Handle error object
  const errorObj = err || opts?.error;
  if (errorObj instanceof Error) {
    ctx.error = {
      name: errorObj.name,
      message: errorObj.message,
      stack: errorObj.stack,
    };
  } else if (errorObj && typeof errorObj === 'object') {
    ctx.error = {
      name: 'UnknownError',
      message: String(errorObj),
    };
  }
  
  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

// =============================================================================
// UNIFIED LOG FUNCTION — Core delegation point
// =============================================================================

/**
 * Unified log function that all legacy modules can use
 */
export function legacyLog(
  level: LegacyLogLevel | string,
  message: string,
  opts?: LegacyLogOptions | Record<string, unknown>,
  err?: unknown
): void {
  const logger = getLogger();
  const coreLevel = mapLevel(level);
  const component = inferComponent(opts);
  const operation = inferOperation(message, opts);
  const context = buildContext(opts, err);
  
  logger[coreLevel](component, operation, message, context);
}

// =============================================================================
// AI LOG WRITER COMPATIBILITY
// =============================================================================

/** Category constants for ai-log-writer.js */
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

/** AI logger stub functions */
export const aiLoggerStubs = {
  CONFIG: { categories: AI_LOG_CATEGORIES },
  initialize: async (_opts?: unknown) => {},
  shutdown: async () => {},
  log: (cat: string, msg: string, opts?: unknown) => legacyLog('info', msg, { category: cat, ...opts as object }),
  trace: (cat: string, msg: string, opts?: unknown) => legacyLog('trace', msg, { category: cat, ...opts as object }),
  debug: (cat: string, msg: string, opts?: unknown) => legacyLog('debug', msg, { category: cat, ...opts as object }),
  info: (cat: string, msg: string, opts?: unknown) => legacyLog('info', msg, { category: cat, ...opts as object }),
  notice: (cat: string, msg: string, opts?: unknown) => legacyLog('info', msg, { category: cat, ...opts as object }),
  warn: (cat: string, msg: string, opts?: unknown) => legacyLog('warn', msg, { category: cat, ...opts as object }),
  error: (cat: string, msg: string, opts?: unknown) => legacyLog('error', msg, { category: cat, ...opts as object }),
  critical: (cat: string, msg: string, opts?: unknown) => legacyLog('error', msg, { category: cat, ...opts as object }),
  fatal: (cat: string, msg: string, opts?: unknown) => legacyLog('fatal', msg, { category: cat, ...opts as object }),
  flush: async () => {},
  getStats: () => ({ logsWritten: 0, currentFile: null }),
  generateCorrelationId: () => `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
};

// =============================================================================
// AI LOG ANALYZER COMPATIBILITY
// =============================================================================

export const aiAnalyzerStubs = {
  initialize: async () => {},
  shutdown: async () => {},
  analyze: () => ({ patterns: [], anomalies: [], recommendations: [] }),
  getRecentErrors: () => [],
  getPerformanceMetrics: () => ({}),
};

// =============================================================================
// AI LOG INTEGRATIONS COMPATIBILITY
// =============================================================================

export const aiIntegrationsStubs = {
  integrateAll: async (_opts?: unknown) => {},
  integrateErrorTracker: () => {},
  integrateEventBus: () => {},
};

// =============================================================================
// LOG INGESTION WORKER COMPATIBILITY
// =============================================================================

export const logIngestionStubs = {
  startLogIngestionWorker: async (): Promise<void> => {},
  stopLogIngestionWorker: async (): Promise<void> => {},
};

// =============================================================================
// INTELLIGENT LOGGER CLASS COMPATIBILITY
// =============================================================================

/**
 * IntelligentLogger stub class — delegates to unified log function
 */
export class IntelligentLogger {
  log(level: LegacyLogLevel, message: string, opts?: LegacyLogOptions): void {
    legacyLog(level, message, opts);
  }

  trace(message: string, opts?: LegacyLogOptions): void {
    legacyLog('trace', message, opts);
  }

  debug(message: string, opts?: LegacyLogOptions): void {
    legacyLog('debug', message, opts);
  }

  info(message: string, opts?: LegacyLogOptions): void {
    legacyLog('info', message, opts);
  }

  warn(message: string, opts?: LegacyLogOptions): void {
    legacyLog('warn', message, opts);
  }

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

  fatal(message: string, opts?: LegacyLogOptions): void {
    legacyLog('fatal', message, opts);
  }

  getStats() {
    return {
      entriesLogged: 0,
      duplicatesFiltered: 0,
      bufferSize: 0,
      lastFlush: null,
    };
  }

  async shutdown(): Promise<void> {}
}

// =============================================================================
// LEGACY LOGGER.JS COMPATIBILITY
// =============================================================================

export const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR',
});

/** Legacy log() function with attached methods */
export function legacyLogFunction(
  level: string,
  message: string,
  context?: Record<string, unknown>
): void {
  legacyLog(level, message, context);
}

// Attach convenience methods
legacyLogFunction.info = (msg: string, ctx?: Record<string, unknown>) => legacyLog('info', msg, ctx);
legacyLogFunction.warn = (msg: string, ctx?: Record<string, unknown>) => legacyLog('warn', msg, ctx);
legacyLogFunction.error = (msg: string, ctx?: Record<string, unknown>) => legacyLog('error', msg, ctx);
legacyLogFunction.success = (msg: string, ctx?: Record<string, unknown>) => legacyLog('info', msg, ctx);
legacyLogFunction.detail = (msg: string, ctx?: Record<string, unknown>) => legacyLog('debug', msg, ctx);

/** Legacy report function */
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

/** Structured log object for shared/log.ts */
export const structuredLog = {
  setLevel: (_level: string): void => {},
  debug: (msg: string, meta?: Record<string, unknown>) => legacyLog('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => legacyLog('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => legacyLog('warn', msg, meta),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => legacyLog('error', msg, meta, err),
  _format: (level: string, msg: string, err?: unknown, meta?: Record<string, unknown>) => ({
    t: '<iso>',
    level,
    msg,
    ...(meta || {}),
    ...(err ? { err: { message: String(err) } } : {}),
  }),
};

/** Flush buffered logs (no-op) */
export function flushBufferedLogs(_entries: BufferedLogEntry[]): void {}

// =============================================================================
// NO-OP STUBS
// =============================================================================

export function startAutoRefresh(): void {}
export function stopAutoRefresh(): void {}
export function getFormattedStats(): { message: string } {
  return { message: 'Use observability system' };
}
