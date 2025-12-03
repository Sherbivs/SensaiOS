/**
 * Legacy Structured Logger Shim — Compatibility Layer
 * 
 * PURPOSE: Provide backwards-compatible API for files using log.info/warn/error
 * while delegating to the new standardized logger system.
 * 
 * This is a THIN WRAPPER, not deprecated code. All actual logging logic
 * lives in src/shared/logger.ts which implements DB-First architecture.
 * 
 * @module shared/log
 */

import { getLogger, type LogLevel as NewLogLevel, type LogContext } from './logger.js';

// Re-export types for compatibility
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Buffered log entry type for compatibility
 */
export interface BufferedLogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

/**
 * Map old levels to new logger levels
 */
function _mapLevel(level: LogLevel): NewLogLevel {
  return level === 'debug' ? 'debug' : level;
}

/**
 * Infer component from context
 */
function inferComponent(context?: Record<string, unknown>): string {
  if (!context) return 'app';
  if (context.component) return String(context.component);
  if (context.service) return String(context.service);
  if (context.worker) return `worker.${context.worker}`;
  return 'app';
}

/**
 * Infer operation from message
 */
function inferOperation(msg: string): string {
  const lower = msg.toLowerCase();
  if (lower.includes('start')) return 'start';
  if (lower.includes('stop')) return 'stop';
  if (lower.includes('init')) return 'initialize';
  if (lower.includes('connect')) return 'connect';
  if (lower.includes('error') || lower.includes('fail')) return 'error';
  return 'operation';
}

/**
 * Build context for new logger
 */
function buildContext(meta?: Record<string, unknown>, err?: unknown): LogContext | undefined {
  const ctx: LogContext = {};
  
  if (meta) {
    ctx.metadata = { ...meta };
    delete ctx.metadata.component;
    delete ctx.metadata.service;
    delete ctx.metadata.worker;
  }
  
  if (err && err instanceof Error) {
    ctx.error = {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  
  return Object.keys(ctx).length > 0 ? ctx : undefined;
}

/**
 * Flush buffered logs (no-op - new logger handles buffering internally)
 */
export function flushBufferedLogs(_entries: BufferedLogEntry[]): void {
  // No-op: New logger handles buffering via ConsoleRenderer
}

/**
 * Structured log object with debug/info/warn/error methods
 */
export const log = {
  setLevel(_level: LogLevel): void {
    // Level is controlled by new logger via environment
  },

  debug(msg: string, meta?: Record<string, unknown>): void {
    const logger = getLogger();
    const component = inferComponent(meta);
    const operation = inferOperation(msg);
    logger.debug(component, operation, msg, buildContext(meta));
  },

  info(msg: string, meta?: Record<string, unknown>): void {
    const logger = getLogger();
    const component = inferComponent(meta);
    const operation = inferOperation(msg);
    logger.info(component, operation, msg, buildContext(meta));
  },

  warn(msg: string, meta?: Record<string, unknown>): void {
    const logger = getLogger();
    const component = inferComponent(meta);
    const operation = inferOperation(msg);
    logger.warn(component, operation, msg, buildContext(meta));
  },

  error(msg: string, err?: unknown, meta?: Record<string, unknown>): void {
    const logger = getLogger();
    const component = inferComponent(meta);
    const operation = inferOperation(msg);
    logger.error(component, operation, msg, buildContext(meta, err));
  },

  // For unit tests: produce formatted object
  _format(level: LogLevel, msg: string, err?: unknown, meta?: Record<string, unknown>) {
    return { 
      t: '<iso>', 
      level, 
      msg, 
      ...(meta || {}),
      ...(err ? { err: { message: String(err) } } : {}),
    };
  },
};
