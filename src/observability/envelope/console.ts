/**
 * Console Bridge — Drop-in Replacement for console.* Calls
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * Provides console.log/warn/error style API that outputs structured envelopes
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Migration pattern:
 * ```typescript
 * // BEFORE (fragmented)
 * console.log('Query executed', { sql, duration });
 * 
 * // AFTER (structured)
 * import { log } from './observability/envelope/console.js';
 * log.info('database', 'query', 'Query executed', { sql, duration });
 * ```
 * 
 * Output adapts based on environment:
 * - Development: Pretty colored output
 * - Production: JSONL for Loki ingestion
 * - Test: Captured in buffer for assertions
 * 
 * @module observability/envelope/console
 */

import {
  createLog,
  createAlert as _createAlert,
  createMetric as _createMetric,
  debug as createDebug,
  info as createInfo,
  warn as createWarn,
  error as createError,
  fatal as createFatal,
} from './factory.js';

import {
  serialize,
  serializers as _serializers,
  type SerializeOptions,
} from './serializer.js';

import {
  type LogEnvelope,
  type AlertEnvelope as _AlertEnvelope,
  type MetricEnvelope as _MetricEnvelope,
  LogLevel,
  AlertSeverity as _AlertSeverity,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Console bridge configuration
 */
export interface ConsoleConfig {
  /** Output format based on environment */
  format: 'auto' | 'pretty' | 'compact' | 'jsonl' | 'structured';
  /** Enable colors (auto-detected by default) */
  colorize: boolean;
  /** Minimum log level to output */
  minLevel: keyof typeof LogLevel;
  /** Buffer logs instead of immediate output (for testing) */
  buffer: boolean;
  /** Custom output function (defaults to console methods) */
  output?: (level: string, message: string) => void;
}

/**
 * Log level priority for filtering
 */
const LEVEL_PRIORITY: Record<string, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

/**
 * Default configuration
 */
let config: ConsoleConfig = {
  format: 'auto',
  colorize: process.stdout.isTTY ?? false,
  minLevel: 'DEBUG',
  buffer: false,
};

/**
 * Log buffer for testing
 */
const logBuffer: LogEnvelope<unknown>[] = [];

/**
 * Configure the console bridge
 */
export function configureConsole(options: Partial<ConsoleConfig>): void {
  config = { ...config, ...options };
}

/**
 * Get current configuration
 */
export function getConsoleConfig(): Readonly<ConsoleConfig> {
  return config;
}

/**
 * Get and clear the log buffer
 */
export function flushBuffer(): LogEnvelope<unknown>[] {
  const logs = [...logBuffer];
  logBuffer.length = 0;
  return logs;
}

/**
 * Get buffer without clearing
 */
export function peekBuffer(): readonly LogEnvelope<unknown>[] {
  return logBuffer;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Detect appropriate format based on environment
 */
function detectFormat(): SerializeOptions {
  if (config.format !== 'auto') {
    return { format: config.format as SerializeOptions['format'], colorize: config.colorize };
  }
  
  // Production (Render) → JSONL for Loki
  if (process.env.RENDER || process.env.NODE_ENV === 'production') {
    return { format: 'jsonl', colorize: false };
  }
  
  // CI → Structured for easy parsing
  if (process.env.CI) {
    return { format: 'structured', colorize: false };
  }
  
  // TTY → Pretty with colors
  if (process.stdout.isTTY) {
    return { format: 'compact', colorize: true };
  }
  
  // Pipe/file → Compact without colors
  return { format: 'compact', colorize: false };
}

/**
 * Check if level should be output based on minimum level
 */
function shouldOutput(level: string): boolean {
  const levelPriority = LEVEL_PRIORITY[level] ?? 0;
  const minPriority = LEVEL_PRIORITY[LogLevel[config.minLevel as keyof typeof LogLevel]] ?? 0;
  return levelPriority >= minPriority;
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Output an envelope
 */
function output<T>(envelope: LogEnvelope<T>): void {
  // Check level filter
  if (!shouldOutput(envelope.level)) return;
  
  // Buffer mode (testing)
  if (config.buffer) {
    logBuffer.push(envelope as LogEnvelope<unknown>);
    return;
  }
  
  // Serialize
  const format = detectFormat();
  const message = serialize(envelope, format);
  
  // Output via custom function or console
  if (config.output) {
    config.output(envelope.level, message);
    return;
  }
  
  // Use appropriate console method - this IS the console output layer
  switch (envelope.level) {
    case LogLevel.DEBUG:
      globalThis.console.debug(message);
      break;
    case LogLevel.INFO:
      globalThis.console.info(message);
      break;
    case LogLevel.WARN:
      globalThis.console.warn(message);
      break;
    case LogLevel.ERROR:
    case LogLevel.FATAL:
      globalThis.console.error(message);
      break;
    default:
      globalThis.console.log(message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API — Matches console.* Style
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Structured console logger
 * 
 * @example
 * log.info('database', 'query', 'Query executed', { sql, duration });
 * log.error('bot', 'command', 'Command failed', { error: err.message });
 * log.debug('cache', 'hit', 'Cache hit', { key, ttl });
 */
export const log = {
  /**
   * Debug level log
   */
  debug: <T = unknown>(
    component: string,
    operation: string,
    message: string,
    data?: T
  ): void => {
    const envelope = createDebug(component, operation, message, data);
    output(envelope);
  },
  
  /**
   * Info level log
   */
  info: <T = unknown>(
    component: string,
    operation: string,
    message: string,
    data?: T
  ): void => {
    const envelope = createInfo(component, operation, message, data);
    output(envelope);
  },
  
  /**
   * Warning level log
   */
  warn: <T = unknown>(
    component: string,
    operation: string,
    message: string,
    data?: T
  ): void => {
    const envelope = createWarn(component, operation, message, data);
    output(envelope);
  },
  
  /**
   * Error level log
   */
  error: <T = unknown>(
    component: string,
    operation: string,
    message: string,
    data?: T
  ): void => {
    const envelope = createError(component, operation, message, data);
    output(envelope);
  },
  
  /**
   * Fatal level log
   */
  fatal: <T = unknown>(
    component: string,
    operation: string,
    message: string,
    data?: T
  ): void => {
    const envelope = createFatal(component, operation, message, data);
    output(envelope);
  },
  
  /**
   * Generic log with explicit level
   */
  log: <T = unknown>(
    level: keyof typeof LogLevel,
    component: string,
    operation: string,
    message: string,
    data?: T
  ): void => {
    const envelope = createLog(LogLevel[level], component, operation, message, data);
    output(envelope);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SHORTHAND EXPORTS (for destructuring)
// ═══════════════════════════════════════════════════════════════════════════

export const { debug, info, warn, error, fatal } = log;

// ═══════════════════════════════════════════════════════════════════════════
// SPECIALIZED LOGGERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a scoped logger for a specific component
 * 
 * @example
 * const dbLog = scopedLogger('database');
 * dbLog.info('query', 'Query executed', { sql });
 * dbLog.error('connection', 'Connection lost', { host });
 */
export function scopedLogger(component: string) {
  return {
    debug: <T>(operation: string, message: string, data?: T) =>
      log.debug(component, operation, message, data),
    
    info: <T>(operation: string, message: string, data?: T) =>
      log.info(component, operation, message, data),
    
    warn: <T>(operation: string, message: string, data?: T) =>
      log.warn(component, operation, message, data),
    
    error: <T>(operation: string, message: string, data?: T) =>
      log.error(component, operation, message, data),
    
    fatal: <T>(operation: string, message: string, data?: T) =>
      log.fatal(component, operation, message, data),
  };
}

/**
 * Pre-configured loggers for common subsystems
 */
export const loggers = {
  database: scopedLogger('database'),
  bot: scopedLogger('bot'),
  cache: scopedLogger('cache'),
  worker: scopedLogger('worker'),
  security: scopedLogger('security'),
  battle: scopedLogger('battle'),
  encounter: scopedLogger('encounter'),
  homestead: scopedLogger('homestead'),
};
