/**
 * Intelligent Logger Stub
 * 
 * This functionality has been migrated to:
 * - src/shared/logger.ts (standardized logging)
 * - src/shared/event-bus.ts (event routing)
 * 
 * These stub types and functions maintain API compatibility.
 * 
 * @module utils/intelligent-logger
 */

import { getLogger } from '../shared/logger.js';

// Type exports for compatibility
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export type LogCategory =
  | 'system' | 'SYSTEM'
  | 'database' | 'DATABASE'
  | 'cache' | 'CACHE'
  | 'game-engine' | 'GAME_ENGINE'
  | 'security' | 'SECURITY'
  | 'performance' | 'PERFORMANCE'
  | 'alert' | 'ALERT'
  | 'resource' | 'RESOURCE'
  | 'error' | 'ERROR'
  | 'discord' | 'DISCORD'
  | 'user-action' | 'USER_ACTION'
  | 'integration' | 'INTEGRATION'
  | string; // Allow any string for flexibility

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  category?: LogCategory;
  message: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  stackTrace?: string;
}

export interface LogOptions {
  category?: LogCategory;
  correlationId?: string;
  context?: Record<string, unknown>;
  data?: Record<string, unknown>;
  error?: Error;
  [key: string]: unknown;
}

/**
 * IntelligentLogger stub class that delegates to standardized logger
 */
class IntelligentLogger {
  private logger = getLogger();

  log(level: LogLevel, message: string, options?: LogOptions): void {
    const component = options?.category || 'app';
    const ctx = options?.context || options?.data ? { metadata: options?.context || options?.data } : undefined;
    
    switch (level) {
      case 'trace':
      case 'debug':
        this.logger.debug(component, 'operation', message, ctx);
        break;
      case 'info':
        this.logger.info(component, 'operation', message, ctx);
        break;
      case 'warn':
        this.logger.warn(component, 'operation', message, ctx);
        break;
      case 'error':
      case 'fatal':
        this.logger.error(component, 'operation', message, ctx);
        break;
    }
  }

  trace(message: string, options?: LogOptions): void {
    this.log('trace', message, options);
  }

  debug(message: string, options?: LogOptions): void {
    this.log('debug', message, options);
  }

  info(message: string, options?: LogOptions): void {
    this.log('info', message, options);
  }

  warn(message: string, options?: LogOptions): void {
    this.log('warn', message, options);
  }

  error(message: string, errorOrOptions?: unknown, options?: LogOptions): void {
    // Handle overloaded signatures: error(msg, opts) or error(msg, err, opts)
    if (errorOrOptions instanceof Error) {
      this.log('error', message, { ...options, error: errorOrOptions });
    } else if (errorOrOptions && typeof errorOrOptions === 'object' && !('category' in errorOrOptions)) {
      // Likely an error-like object
      this.log('error', message, options);
    } else {
      this.log('error', message, errorOrOptions as LogOptions);
    }
  }

  fatal(message: string, options?: LogOptions): void {
    this.log('fatal', message, options);
  }

  getStats() {
    return {
      entriesLogged: 0,
      duplicatesFiltered: 0,
      bufferSize: 0,
      lastFlush: null,
    };
  }

  async shutdown(): Promise<void> {
    // No-op: Migrated to logger.ts
  }
}

export { IntelligentLogger };

export const logger = new IntelligentLogger();

export default logger;
