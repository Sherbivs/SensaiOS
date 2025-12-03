/* eslint-disable no-console */
/**
 * Standardized Logger — DB-First Logging System
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE: Database-First Logging
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ALL logs are written to the database FIRST. Console output in production
 * is handled by the ConsoleRenderer which polls the database and outputs
 * to Render's built-in console.
 * 
 * Data Flow:
 *   1. Application calls logger.info/warn/error/debug
 *   2. Logger writes to TimescaleDB (log_entries table) 
 *   3. ConsoleRenderer polls database for new entries
 *   4. Renderer outputs to Render console (stdout/stderr)
 * 
 * Why DB-First?
 *   - Single source of truth (database = authoritative)
 *   - Console is just a VIEW of database state
 *   - Survives restarts, deployments
 *   - Queryable history
 *   - Consistent across all services
 * 
 * Console Modes:
 *   - PRODUCTION: Console output DISABLED here (ConsoleRenderer handles it)
 *   - DEVELOPMENT: Console output ENABLED (immediate feedback)
 *   - FALLBACK: If DB unavailable, falls back to console
 * 
 * @module shared/logger
 */

// ═══════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Log severity levels (4-tier canonical system)
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Top-level components (subsystems)
 */
export type LogComponent = 
  // Core Systems
  | 'bot'
  | 'battle'
  | 'encounter'
  | 'database'
  | 'cache'
  | 'worker'
  // Infrastructure
  | 'http'
  | 'security'
  | 'event-bus'
  | 'logger'
  // Integration
  | 'discord-api'
  | 'pokemon-api'
  | 'render'
  // Subcomponents (dot notation allowed)
  | `database.${string}`
  | `bot.${string}`
  | `battle.${string}`
  | `worker.${string}`
  | string; // Fallback for runtime flexibility

/**
 * Standardized operations (verbs)
 */
export type LogOperation =
  // Lifecycle
  | 'initialize'
  | 'start'
  | 'stop'
  | 'shutdown'
  | 'restart'
  // Data Operations
  | 'query'
  | 'insert'
  | 'update'
  | 'delete'
  | 'flush'
  | 'sync'
  // Network Operations
  | 'request'
  | 'response'
  | 'timeout'
  | 'retry'
  // Cache Operations
  | 'cache-hit'
  | 'cache-miss'
  | 'cache-evict'
  | 'cache-clear'
  // Game Operations
  | 'spawn'
  | 'catch'
  | 'battle-start'
  | 'battle-end'
  | 'move-execute'
  | 'heal'
  // Error Handling
  | 'error'
  | 'recovery'
  | 'fallback'
  | 'circuit-break'
  | string; // Fallback for runtime flexibility

/**
 * Log context (optional fields)
 */
export interface LogContext {
  // Discord context
  userId?: string;
  guildId?: string;
  channelId?: string;
  
  // Correlation tracking
  correlationId?: string;
  parentCorrelationId?: string;
  
  // Performance metrics
  durationMs?: number;
  latencyMs?: number;
  
  // Error details (required for level='error')
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  
  // Arbitrary metadata (flexible)
  metadata?: Record<string, unknown>;
}

/**
 * Complete log entry structure (database schema)
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  operation: string;
  message: string;
  
  // Context fields
  userId?: string;
  guildId?: string;
  channelId?: string;
  correlationId?: string;
  parentCorrelationId?: string;
  
  // Performance fields
  durationMs?: number;
  latencyMs?: number;
  
  // Error fields
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  errorCode?: string;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

/**
 * Logger interface (public API)
 */
export interface Logger {
  error(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void;
  warn(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void;
  info(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void;
  debug(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void;
  
  /** Set minimum log level (filter out lower severity) */
  setLevel(level: LogLevel): void;
  
  /** Get current log level */
  getLevel(): LogLevel;
  
  /** Enable/disable console output (fallback) */
  setConsoleOutput(enabled: boolean): void;
  
  /** 
   * Enable DB-first mode (production)
   * When enabled, logger writes to DB only; ConsoleRenderer handles console output
   */
  setDbFirstMode(enabled: boolean): void;
  
  /** Check if DB-first mode is enabled */
  isDbFirstMode(): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Logger Implementation
// ═══════════════════════════════════════════════════════════════════════════

class StandardizedLogger implements Logger {
  private level: LogLevel = 'info';
  private consoleOutput = true;
  private dbFirstMode = false; // DB-first mode (console via ConsoleRenderer)
  private timescaleWorker: any = null; // Lazy-loaded to avoid circular deps
  
  /**
   * Log an error (system failures, exceptions, critical issues)
   */
  error(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void {
    this.log('error', component, operation, message, context);
  }
  
  /**
   * Log a warning (degraded state, potential issues, fallbacks)
   */
  warn(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      this.log('warn', component, operation, message, context);
    }
  }
  
  /**
   * Log info (normal operations, state changes, milestones)
   */
  info(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.log('info', component, operation, message, context);
    }
  }
  
  /**
   * Log debug (detailed diagnostics, development traces)
   */
  debug(component: LogComponent, operation: LogOperation, message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.log('debug', component, operation, message, context);
    }
  }
  
  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }
  
  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }
  
  /**
   * Enable/disable console output
   */
  setConsoleOutput(enabled: boolean): void {
    this.consoleOutput = enabled;
  }
  
  /**
   * Enable DB-first mode (production)
   * When enabled, logger writes to DB only; ConsoleRenderer handles console output
   */
  setDbFirstMode(enabled: boolean): void {
    this.dbFirstMode = enabled;
  }
  
  /**
   * Check if DB-first mode is enabled
   */
  isDbFirstMode(): boolean {
    return this.dbFirstMode;
  }
  
  /**
   * Core logging function (private)
   * 
   * DB-First Architecture:
   * - In production (dbFirstMode=true): Write to DB only, ConsoleRenderer handles display
   * - In development: Write to DB AND console (immediate feedback)
   * - On DB failure: Always fallback to console (safety)
   */
  private log(
    level: LogLevel,
    component: LogComponent,
    operation: LogOperation,
    message: string,
    context?: LogContext
  ): void {
    // Build structured log entry
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component,
      operation,
      message,
      ...context,
      errorName: context?.error?.name,
      errorMessage: context?.error?.message,
      errorStack: context?.error?.stack,
      errorCode: context?.error?.code,
    };
    
    // Send to TimescaleDB (async, non-blocking)
    // This is the PRIMARY destination - database is source of truth
    this.sendToDatabase(entry).catch(err => {
      // DB write failed - ALWAYS fallback to console (safety)
      console.error('[Logger] Database write failed, falling back to console:', err);
      this.logToConsole(entry);
    });
    
    // Console output logic:
    // - dbFirstMode=true (production): Don't output here, ConsoleRenderer handles it
    // - dbFirstMode=false (development): Output immediately for feedback
    if (this.consoleOutput && !this.dbFirstMode) {
      this.logToConsole(entry);
    }
  }
  
  /**
   * Check if log level should be emitted
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
    const currentIndex = levels.indexOf(this.level);
    const targetIndex = levels.indexOf(level);
    return targetIndex <= currentIndex;
  }
  
  /**
   * Send log entry to TimescaleDB (async)
   */
  private async sendToDatabase(entry: LogEntry): Promise<void> {
    // Lazy-load TimescaleDB worker to avoid circular dependencies
    if (!this.timescaleWorker) {
      try {
        const { getTimescaleDBWorker } = await import('../workers/database/index.js');
        this.timescaleWorker = getTimescaleDBWorker();
      } catch {
        // Worker not available yet (during startup), skip database write
        return;
      }
    }
    
    // Transform to LogEvent format expected by TimescaleDBWorker
    const logEvent = {
      timestamp: entry.timestamp,
      level: entry.level,
      category: entry.component, // Map component → category
      message: `[${entry.operation}] ${entry.message}`,
      metadata: {
        operation: entry.operation,
        userId: entry.userId,
        guildId: entry.guildId,
        channelId: entry.channelId,
        durationMs: entry.durationMs,
        latencyMs: entry.latencyMs,
        errorName: entry.errorName,
        errorMessage: entry.errorMessage,
        errorStack: entry.errorStack,
        errorCode: entry.errorCode,
        ...entry.metadata,
      },
      correlationId: entry.correlationId,
      serviceName: 'infinity-gauntlet',
      userId: entry.userId,
      traceContext: entry.parentCorrelationId,
    };
    
    // Enqueue for batched write (non-blocking)
    await this.timescaleWorker.ingestLogs([logEvent]);
  }
  
  /**
   * Output to console (fallback/development)
   */
  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}] [${entry.component}:${entry.operation}]`;
    
    const contextParts: string[] = [];
    if (entry.correlationId) contextParts.push(`corr=${entry.correlationId}`);
    if (entry.userId) contextParts.push(`user=${entry.userId}`);
    if (entry.durationMs !== undefined) contextParts.push(`dur=${entry.durationMs}ms`);
    
    const contextStr = contextParts.length > 0 ? ` (${contextParts.join(', ')})` : '';
    
    const logFn = entry.level === 'error' ? console.error : 
                  entry.level === 'warn' ? console.warn : 
                  console.log;
    
    logFn(`${prefix} ${entry.message}${contextStr}`);
    
    // Print error details if present
    if (entry.errorName) {
      logFn(`  Error: ${entry.errorName}: ${entry.errorMessage}`);
      if (entry.errorStack) {
        logFn(`  Stack: ${entry.errorStack}`);
      }
    }
    
    // Print metadata if present
    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      logFn(`  Metadata:`, entry.metadata);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

let loggerInstance: Logger | null = null;

/**
 * Get singleton logger instance
 * 
 * Production (DB-First Mode):
 *   - Console output disabled here
 *   - ConsoleRenderer polls DB and outputs to Render console
 *   - All logs flow: App → Logger → DB → ConsoleRenderer → Console
 * 
 * Development:
 *   - Console output enabled for immediate feedback
 *   - Logs flow: App → Logger → DB + Console (parallel)
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    const instance = new StandardizedLogger();
    
    // Set log level from environment variable
    const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
    if (envLevel && ['error', 'warn', 'info', 'debug'].includes(envLevel)) {
      instance.setLevel(envLevel);
    }
    
    // Production: Enable DB-first mode (ConsoleRenderer handles console output)
    // Console output is still available as fallback if DB fails
    if (process.env.NODE_ENV === 'production') {
      instance.setDbFirstMode(true);
      // Keep console enabled for fallback, but dbFirstMode prevents normal console output
      instance.setConsoleOutput(true);
    }
    
    loggerInstance = instance;
  }
  
  return loggerInstance;
}

/**
 * Reset logger instance (useful for testing)
 */
export function resetLogger(): void {
  loggerInstance = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract error context for logging
 */
export function errorContext(error: Error): LogContext {
  return {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code, // Some errors have code property
    },
  };
}

/**
 * Measure operation duration and log result
 */
export async function measureOperation<T>(
  component: LogComponent,
  operation: LogOperation,
  description: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const logger = getLogger();
  const startTime = Date.now();
  const correlationId = context?.correlationId ?? generateCorrelationId();
  
  logger.debug(component, operation, `Starting: ${description}`, { ...context, correlationId });
  
  try {
    const result = await fn();
    const durationMs = Date.now() - startTime;
    
    logger.info(component, operation, `Completed: ${description}`, {
      ...context,
      correlationId,
      durationMs,
    });
    
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    logger.error(component, operation, `Failed: ${description}`, {
      ...context,
      correlationId,
      durationMs,
      ...errorContext(error as Error),
    });
    
    throw error;
  }
}
