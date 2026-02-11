/**
 * AI-Optimized Hard Logging System
 * @module services/ai/ai-log-writer
 * 
 * Purpose: Create structured, machine-readable logs for AI analysis
 * Storage: PostgreSQL CacheEntry table (Database-First Architecture 2025-12-27)
 * Format: JSON structured entries in database
 * Retention: Auto-cleanup entries older than 7 days
 * Features: Correlation IDs, stack traces, context capture, error codes
 */

import { scopedLogger } from '../../observability/envelope/console.js';
import { prisma } from '../../shared/prisma.js';
import { getFilesafeTimestamp } from '../../shared/utils/index.js';

/** Scoped logger for AI log writer */
const consoleLog = scopedLogger('ai-log-writer');

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type LogLevel = 
  | 'TRACE'
  | 'DEBUG'
  | 'INFO'
  | 'NOTICE'
  | 'WARN'
  | 'ERROR'
  | 'CRITICAL'
  | 'FATAL';

export type LogCategory =
  | 'system'
  | 'database'
  | 'discord'
  | 'game-engine'
  | 'security'
  | 'performance'
  | 'error'
  | 'resource'
  | 'user-action'
  | 'integration'
  | 'general';

interface LogLevels {
  TRACE: number;
  DEBUG: number;
  INFO: number;
  NOTICE: number;
  WARN: number;
  ERROR: number;
  CRITICAL: number;
  FATAL: number;
}

interface LogCategories {
  SYSTEM: 'system';
  DATABASE: 'database';
  DISCORD: 'discord';
  GAME_ENGINE: 'game-engine';
  SECURITY: 'security';
  PERFORMANCE: 'performance';
  ERROR: 'error';
  RESOURCE: 'resource';
  USER_ACTION: 'user-action';
  INTEGRATION: 'integration';
}

interface RotationConfig {
  maxSize: number;
  maxAge: number;
  maxFiles: number;
  compressAfter: number;
}

export interface LogConfig {
  baseDir: string;
  levels: LogLevels;
  rotation: RotationConfig;
  categories: LogCategories;
  minLevel: string;
  autoFlush: boolean;
  flushInterval: number;
}

interface ExecutionContext {
  function: string;
  file: string;
  line: number | null;
  column: number | null;
  stack: string[];
}

interface ErrorMetadata {
  name: string;
  message: string;
  code: string | null;
  syscall: string | null;
  errno: number | null;
  stack: string[];
  cause: ErrorMetadata | null;
}

interface ProcessInfo {
  pid: number;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  hostname: string;
}

export interface LogEntry {
  timestamp: string;
  timestampMs: number;
  level: LogLevel;
  category: LogCategory;
  correlationId: string;
  message: string;
  context: {
    file: string;
    line: number | null;
    function: string;
    stack: string[];
  };
  process: ProcessInfo;
  data: Record<string, unknown>;
  tags: string[];
  error?: ErrorMetadata;
  user?: { userId: string };
  guild?: { guildId: string };
}

interface _LogFileMetadata {
  _type: 'log_file_metadata';
  version: string;
  created: string;
  category: string;
  pid: number;
  hostname: string;
  nodeVersion: string;
}

export interface LogOptions {
  data?: Record<string, unknown>;
  error?: Error | null;
  correlationId?: string | null;
  userId?: string | null;
  guildId?: string | null;
  tags?: string | string[];
  context?: ExecutionContext | null;
}

export interface LogStats {
  logsWritten: number;
  bytesWritten: number;
  errorsEncountered: number;
  rotationsPerformed: number;
  compressionsPerformed: number;
  flushesPerformed: number;
  startTime: number;
  uptime: number;
  currentLogFile: string | null;
  currentLogSize: number;
  bufferSize: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG: LogConfig = {
  // Storage namespace (database)
  baseDir: 'ai-logs', // Database namespace, not filesystem path
  
  // Log levels with priority
  levels: {
    TRACE: 0,    // Extremely detailed execution flow
    DEBUG: 1,    // Detailed debug information
    INFO: 2,     // General informational messages
    NOTICE: 3,   // Notable events (user actions, state changes)
    WARN: 4,     // Warning conditions (degraded performance, deprecated usage)
    ERROR: 5,    // Error conditions (handled errors, retries)
    CRITICAL: 6, // Critical errors (system instability, data loss risk)
    FATAL: 7,    // Fatal errors (system shutdown, unrecoverable)
  },
  
  // Retention settings (replaces rotation)
  rotation: {
    maxSize: 10 * 1024 * 1024, // 10MB per batch (for stats)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days retention
    maxFiles: 200, // Max entries per batch flush
    compressAfter: 60 * 60 * 1000, // N/A for database
  },
  
  // Categories for log organization
  categories: {
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
  },
  
  // Minimum log level to write (configurable)
  minLevel: process.env.AI_LOG_LEVEL || 'INFO',
  
  // Flush settings
  autoFlush: true,
  flushInterval: 5000, // Flush every 5 seconds
};

// ─────────────────────────────────────────────────────────────────────────────
// State Management
// ─────────────────────────────────────────────────────────────────────────────

// Database namespace for AI logs
const AI_LOG_NAMESPACE = 'ai-logs';

let flushIntervalHandle: ReturnType<typeof setInterval> | null = null;
let _isShuttingDown = false;
const logBuffer: LogEntry[] = [];
let correlationIdCounter = 0;
let batchCounter = 0;

// Statistics for self-monitoring
const stats = {
  logsWritten: 0,
  bytesWritten: 0,
  errorsEncountered: 0,
  rotationsPerformed: 0,
  compressionsPerformed: 0,
  flushesPerformed: 0,
  startTime: Date.now(),
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate correlation ID for tracking related log entries.
 * Format: {timestamp}-{counter}-{random}
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (correlationIdCounter++).toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${counter}-${random}`;
}

/**
 * Capture current execution context (stack trace, file, line).
 */
function captureContext(stackDepth = 3): ExecutionContext {
  const err = new Error();
  Error.captureStackTrace(err);
  
  const stack = err.stack?.split('\n').slice(2) || []; // Skip Error and captureContext lines
  const relevantStack = stack.slice(0, stackDepth);
  
  // Parse first stack frame for file/line info
  const firstFrame = relevantStack[0] || '';
  const match = firstFrame.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
  
  return {
    function: match?.[1]?.trim() || '<anonymous>',
    file: match?.[2] || '<unknown>',
    line: match?.[3] ? parseInt(match[3], 10) : null,
    column: match?.[4] ? parseInt(match[4], 10) : null,
    stack: relevantStack.map(line => line.trim()),
  };
}

/**
 * Extract error metadata for AI analysis.
 */
function extractErrorMetadata(error: unknown): ErrorMetadata | null {
  if (!error || !(error instanceof Error)) {
    return null;
  }
  
  const nodeError = error as NodeJS.ErrnoException;
  
  return {
    name: error.name,
    message: error.message,
    code: nodeError.code || null,
    syscall: nodeError.syscall || null,
    errno: nodeError.errno ?? null,
    stack: error.stack?.split('\n').map(line => line.trim()) || [],
    cause: error.cause ? extractErrorMetadata(error.cause) : null,
  };
}

/**
 * Sanitize sensitive data from log entries.
 */
function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    // Redact tokens, passwords, API keys
    return value
      .replace(/\b(token|password|apikey|api_key|secret)\s*[:=]\s*[\w-]+/gi, '$1=<redacted>')
      .replace(/Bearer\s+[\w-]+/gi, 'Bearer <redacted>')
      .replace(/postgresql:\/\/[^@]+@/g, 'postgresql://<redacted>@');
  }
  
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (/token|password|apikey|api_key|secret/i.test(key)) {
        sanitized[key] = '<redacted>';
      } else {
        sanitized[key] = sanitize(val);
      }
    }
    return sanitized;
  }
  
  return value;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Management (Database-First Architecture 2025-12-27)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate batch key for database storage
 */
function generateBatchKey(category = 'general'): string {
  const timestamp = getFilesafeTimestamp();
  return `ai-log:${category}:${timestamp}:${batchCounter++}`;
}

/**
 * Write log entries batch to database
 */
async function writeBatchToDatabase(entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  
  try {
    // Group entries by category for efficient storage
    const byCategory = new Map<string, LogEntry[]>();
    for (const entry of entries) {
      const cat = entry.category || 'general';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(entry);
    }
    
    // Write each category batch
    for (const [category, categoryEntries] of byCategory) {
      const batchKey = generateBatchKey(category);
      const batchData = {
        _type: 'ai_log_batch',
        version: '1.0.0',
        created: new Date().toISOString(),
        category,
        pid: process.pid,
        hostname: process.env.RENDER_SERVICE_NAME || process.env.HOSTNAME || 'unknown',
        nodeVersion: process.version,
        entryCount: categoryEntries.length,
        entries: categoryEntries,
      };
      
      const jsonData = JSON.stringify(batchData);
      
      await prisma.cacheEntry.create({
        data: {
          key: batchKey,
          namespace: AI_LOG_NAMESPACE,
          value: batchData as object,
          sizeBytes: jsonData.length,
          expiresAt: new Date(Date.now() + CONFIG.rotation.maxAge), // 7 days retention
        },
      });
      
      stats.logsWritten += categoryEntries.length;
      stats.bytesWritten += jsonData.length;
    }
    
    stats.flushesPerformed++;
  } catch (error) {
    stats.errorsEncountered++;
    consoleLog.error('flush', 'Failed to write log batch to database', { error: String(error) });
  }
}

/**
 * Clean up old log entries from database
 */
async function cleanupOldLogs(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - CONFIG.rotation.maxAge);
    const result = await prisma.cacheEntry.deleteMany({
      where: {
        namespace: AI_LOG_NAMESPACE,
        createdAt: { lt: cutoff },
      },
    });
    
    if (result.count > 0) {
      consoleLog.info('cleanup', 'Cleaned up old log batches', { count: result.count });
    }
  } catch (error) {
    consoleLog.error('cleanup', 'Failed to cleanup old logs', { error: String(error) });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Log Writing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flush buffered log entries to database.
 */
export async function flush(): Promise<void> {
  if (logBuffer.length === 0) return;
  
  const entries = logBuffer.splice(0, logBuffer.length);
  await writeBatchToDatabase(entries);
}

/**
 * Create structured log entry.
 */
function createLogEntry(params: {
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
  error?: Error | null;
  correlationId?: string | null;
  userId?: string | null;
  guildId?: string | null;
  tags?: string | string[];
  context?: ExecutionContext | null;
}): LogEntry {
  const {
    level,
    category,
    message,
    data = {},
    error = null,
    correlationId = null,
    userId = null,
    guildId = null,
    tags = [],
    context = null,
  } = params;
  
  // Auto-capture context if not provided
  const ctx = context || captureContext(4); // Skip createLogEntry + log() + caller
  
  // Base entry
  const entry: LogEntry = {
    // Metadata
    timestamp: new Date().toISOString(),
    timestampMs: Date.now(),
    level,
    category,
    correlationId: correlationId || generateCorrelationId(),
    
    // Message
    message,
    
    // Context
    context: {
      file: ctx.file,
      line: ctx.line,
      function: ctx.function,
      stack: ctx.stack,
    },
    
    // Process info
    process: {
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      hostname: process.env.RENDER_SERVICE_NAME || process.env.HOSTNAME || 'unknown',
    },
    
    // Data payload (sanitized)
    data: sanitize(data) as Record<string, unknown>,
    
    // Tags for filtering
    tags: Array.isArray(tags) ? tags : [tags],
  };
  
  // Add error metadata if present
  if (error) {
    const errorMeta = extractErrorMetadata(error);
    if (errorMeta) {
      entry.error = errorMeta;
    }
  }
  
  // Add user context if present
  if (userId) {
    entry.user = { userId };
  }
  
  if (guildId) {
    entry.guild = { guildId };
  }
  
  return entry;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log a message at specified level.
 * @returns Correlation ID for this log entry or null if filtered
 */
export function log(
  level: LogLevel, 
  category: LogCategory, 
  message: string, 
  options: LogOptions = {}
): string | null {
  // Check minimum level
  const levelPriority = CONFIG.levels[level] || CONFIG.levels.INFO;
  const minPriority = CONFIG.levels[CONFIG.minLevel as LogLevel] || CONFIG.levels.INFO;
  
  if (levelPriority < minPriority) {
    return null; // Skip logs below minimum level
  }
  
  const entry = createLogEntry({
    level,
    category,
    message,
    ...options,
  });
  
  // Buffer log entry
  logBuffer.push(entry);
  
  // Auto-flush if buffer too large
  if (logBuffer.length >= 100) {
    flush().catch(err => consoleLog.error('autoFlush', 'Flush failed', { error: String(err) }));
  }
  
  return entry.correlationId;
}

/**
 * Convenience methods for each log level.
 */
export const trace = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('TRACE', category, message, options);

export const debug = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('DEBUG', category, message, options);

export const info = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('INFO', category, message, options);

export const notice = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('NOTICE', category, message, options);

export const warn = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('WARN', category, message, options);

export const error = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('ERROR', category, message, options);

export const critical = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('CRITICAL', category, message, options);

export const fatal = (category: LogCategory, message: string, options?: LogOptions): string | null => 
  log('FATAL', category, message, options);

/**
 * Initialize the AI log writer (Database-First Architecture).
 */
export async function initialize(): Promise<void> {
  try {
    // Start auto-flush interval
    if (CONFIG.autoFlush) {
      flushIntervalHandle = setInterval(() => {
        flush().catch(err => consoleLog.error('autoFlush', 'Auto-flush failed', { error: String(err) }));
      }, CONFIG.flushInterval);
      
      // Allow process to exit
      if (flushIntervalHandle.unref) {
        flushIntervalHandle.unref();
      }
    }
    
    // Start cleanup task (every hour)
    const maintenanceInterval = setInterval(() => {
      cleanupOldLogs().catch(err => consoleLog.error('maintenance', 'Cleanup failed', { error: String(err) }));
    }, 60 * 60 * 1000);
    
    if (maintenanceInterval.unref) {
      maintenanceInterval.unref();
    }
    
    // Log initialization
    info(CONFIG.categories.SYSTEM, 'AI Log Writer initialized (database-first)', {
      data: {
        namespace: AI_LOG_NAMESPACE,
        minLevel: CONFIG.minLevel,
        categories: Object.keys(CONFIG.categories).length,
        storage: 'PostgreSQL',
      },
    });
    
    consoleLog.info('init', 'Initialized successfully (database-first)');
  } catch (err) {
    consoleLog.error('init', 'Initialization failed', { error: String(err) });
    throw err;
  }
}

/**
 * Shutdown the AI log writer gracefully.
 */
export async function shutdown(): Promise<void> {
  _isShuttingDown = true;
  
  // Stop auto-flush
  if (flushIntervalHandle) {
    clearInterval(flushIntervalHandle);
    flushIntervalHandle = null;
  }
  
  // Final flush
  await flush();
  
  // Log shutdown
  info(CONFIG.categories.SYSTEM, 'AI Log Writer shutting down', {
    data: {
      stats: {
        logsWritten: stats.logsWritten,
        bytesWritten: stats.bytesWritten,
        errorsEncountered: stats.errorsEncountered,
        flushesPerformed: stats.flushesPerformed,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      },
    },
  });
  
  await flush();
  
  consoleLog.info('shutdown', 'Shutdown complete');
}

/**
 * Get current statistics.
 */
export function getStats(): LogStats {
  return {
    ...stats,
    uptime: Math.floor((Date.now() - stats.startTime) / 1000),
    currentLogFile: `db:${AI_LOG_NAMESPACE}`,
    currentLogSize: stats.bytesWritten,
    bufferSize: logBuffer.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export default {
  initialize,
  shutdown,
  log,
  trace,
  debug,
  info,
  notice,
  warn,
  error,
  critical,
  fatal,
  flush,
  getStats,
  generateCorrelationId,
  CONFIG,
};
