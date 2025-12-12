/* eslint-disable no-console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { getFilesafeTimestamp } from '../../shared/utils/index.js';

// ============================================================================
// AI-OPTIMIZED HARD LOGGING SYSTEM
// ============================================================================
// Purpose: Create structured, machine-readable logs for AI analysis
// Storage: /Store/ai-logs/ (persistent disk)
// Format: Newline-delimited JSON (NDJSON) for streaming analysis
// Rotation: Auto-rotate by size (10MB) and time (24 hours)
// Compression: Auto-compress old logs to save space
// Features: Correlation IDs, stack traces, context capture, error codes
// ============================================================================

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Storage paths
  baseDir: process.env.IS_RENDER ? '/Store/ai-logs' : path.resolve(process.cwd(), 'Store/ai-logs'),
  
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
  
  // Rotation settings
  rotation: {
    maxSize: 10 * 1024 * 1024, // 10MB per file
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    maxFiles: 200, // Keep last 200 log files (48+ hours at high volume)
    compressAfter: 60 * 60 * 1000, // Compress after 1 hour
  },
  
  // Categories for log organization
  categories: {
    SYSTEM: 'system',           // System-level events (startup, shutdown, config)
    DATABASE: 'database',       // Database operations (queries, connections, migrations)
    DISCORD: 'discord',         // Discord API interactions
    GAME_ENGINE: 'game-engine', // Game engine operations (battles, calculations)
    SECURITY: 'security',       // Security events (auth, permissions, threats)
    PERFORMANCE: 'performance', // Performance metrics and profiling
    ERROR: 'error',             // Error tracking and recovery
    RESOURCE: 'resource',       // Resource management (memory, CPU, connections)
    USER_ACTION: 'user-action', // User-initiated actions
    INTEGRATION: 'integration', // External integrations (APIs, webhooks)
  },
  
  // Minimum log level to write (configurable)
  minLevel: process.env.AI_LOG_LEVEL || 'INFO',
  
  // Flush settings
  autoFlush: true,
  flushInterval: 5000, // Flush every 5 seconds
};

// ============================================================================
// State Management
// ============================================================================

let currentLogStream = null;
let currentLogFile = null;
let currentLogSize = 0;
let currentLogStartTime = Date.now();
let flushInterval = null;
let isShuttingDown = false;
let logBuffer = [];
let correlationIdCounter = 0;

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

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate correlation ID for tracking related log entries.
 * Format: {timestamp}-{counter}-{random}
 * @returns {string} Correlation ID
 */
function generateCorrelationId() {
  const timestamp = Date.now().toString(36);
  const counter = (correlationIdCounter++).toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${counter}-${random}`;
}

/**
 * Capture current execution context (stack trace, file, line).
 * @param {number} stackDepth - How many levels up to capture (default: 3)
 * @returns {object} Context object with file, line, function, stack
 */
function captureContext(stackDepth = 3) {
  const err = new Error();
  Error.captureStackTrace(err);
  
  const stack = err.stack.split('\n').slice(2); // Skip Error and captureContext lines
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
 * @param {Error} error - Error object
 * @returns {object} Error metadata
 */
function extractErrorMetadata(error) {
  if (!error || !(error instanceof Error)) {
    return null;
  }
  
  return {
    name: error.name,
    message: error.message,
    code: error.code || null,
    syscall: error.syscall || null,
    errno: error.errno || null,
    stack: error.stack?.split('\n').map(line => line.trim()) || [],
    cause: error.cause ? extractErrorMetadata(error.cause) : null,
  };
}

/**
 * Sanitize sensitive data from log entries.
 * @param {any} value - Value to sanitize
 * @returns {any} Sanitized value
 */
function sanitize(value) {
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
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
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

// ============================================================================
// File Management
// ============================================================================

/**
 * Ensure log directory exists.
 * @returns {Promise<void>}
 */
async function ensureLogDirectory() {
  try {
    await fs.mkdir(CONFIG.baseDir, { recursive: true });
    await fs.mkdir(path.join(CONFIG.baseDir, 'compressed'), { recursive: true });
  } catch (error) {
    console.error('[ai-log-writer] Failed to create log directory:', error);
    throw error;
  }
}

/**
 * Generate log filename based on timestamp and category.
 * @param {string} category - Log category
 * @returns {string} Filename
 */
function generateLogFilename(category = 'general') {
  const timestamp = getFilesafeTimestamp();
  return `${category}-${timestamp}.ndjson`;
}

/**
 * Open new log file for writing.
 * @param {string} category - Log category
 * @returns {Promise<void>}
 */
async function openLogFile(category = 'general') {
  // Close existing stream
  if (currentLogStream) {
    await closeLogFile();
  }
  
  const filename = generateLogFilename(category);
  const filepath = path.join(CONFIG.baseDir, filename);
  
  currentLogFile = filepath;
  currentLogStream = createWriteStream(filepath, { flags: 'a' });
  currentLogSize = 0;
  currentLogStartTime = Date.now();
  
  // Write metadata header
  const metadata = {
    _type: 'log_file_metadata',
    version: '1.0.0',
    created: new Date().toISOString(),
    category,
    pid: process.pid,
    hostname: process.env.RENDER_SERVICE_NAME || process.env.HOSTNAME || 'unknown',
    nodeVersion: process.version,
  };
  
  currentLogStream.write(JSON.stringify(metadata) + '\n');
}

/**
 * Close current log file.
 * @returns {Promise<void>}
 */
async function closeLogFile() {
  if (!currentLogStream) return;
  
  return new Promise((resolve, reject) => {
    currentLogStream.end(() => {
      currentLogStream = null;
      currentLogFile = null;
      resolve();
    });
    
    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('Log file close timeout')), 5000);
  });
}

/**
 * Check if log rotation is needed.
 * @returns {boolean} True if rotation needed
 */
function needsRotation() {
  // Rotate if file too large
  if (currentLogSize >= CONFIG.rotation.maxSize) {
    return true;
  }
  
  // Rotate if file too old
  const age = Date.now() - currentLogStartTime;
  if (age >= CONFIG.rotation.maxAge) {
    return true;
  }
  
  return false;
}

/**
 * Rotate log files (close current, open new).
 * @param {string} category - Log category
 * @returns {Promise<void>}
 */
async function rotateLogFile(category = 'general') {
  await closeLogFile();
  await openLogFile(category);
  stats.rotationsPerformed++;
}

/**
 * Compress old log files.
 * @returns {Promise<void>}
 */
async function compressOldLogs() {
  try {
    const files = await fs.readdir(CONFIG.baseDir);
    const now = Date.now();
    
    for (const file of files) {
      if (!file.endsWith('.ndjson')) continue;
      if (file === path.basename(currentLogFile)) continue; // Skip current file
      
      const filepath = path.join(CONFIG.baseDir, file);
      const stat = await fs.stat(filepath);
      const age = now - stat.mtimeMs;
      
      // Compress if older than threshold
      if (age >= CONFIG.rotation.compressAfter) {
        const compressedPath = path.join(CONFIG.baseDir, 'compressed', `${file}.gz`);
        
        await new Promise((resolve, reject) => {
          const readStream = fs.createReadStream(filepath);
          const writeStream = createWriteStream(compressedPath);
          const gzip = createGzip();
          
          readStream.pipe(gzip).pipe(writeStream);
          
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          readStream.on('error', reject);
        });
        
        // Delete original after successful compression
        await fs.unlink(filepath);
        stats.compressionsPerformed++;
      }
    }
  } catch (error) {
    console.error('[ai-log-writer] Failed to compress old logs:', error);
  }
}

/**
 * Clean up old compressed logs (keep only maxFiles).
 * @returns {Promise<void>}
 */
async function cleanupOldLogs() {
  try {
    const compressedDir = path.join(CONFIG.baseDir, 'compressed');
    const files = await fs.readdir(compressedDir);
    
    // Sort by modification time (oldest first)
    const filesWithStats = await Promise.all(
      files.map(async file => {
        const filepath = path.join(compressedDir, file);
        const stat = await fs.stat(filepath);
        return { file, filepath, mtime: stat.mtimeMs };
      })
    );
    
    filesWithStats.sort((a, b) => a.mtime - b.mtime);
    
    // Delete oldest files if over limit
    const toDelete = filesWithStats.slice(0, Math.max(0, filesWithStats.length - CONFIG.rotation.maxFiles));
    
    for (const { filepath } of toDelete) {
      await fs.unlink(filepath);
    }
  } catch (error) {
    console.error('[ai-log-writer] Failed to cleanup old logs:', error);
  }
}

// ============================================================================
// Log Writing
// ============================================================================

/**
 * Write log entry to file.
 * @param {object} entry - Log entry object
 * @returns {Promise<void>}
 */
async function writeLogEntry(entry) {
  if (isShuttingDown) return;
  
  try {
    // Ensure log file is open
    if (!currentLogStream) {
      await openLogFile(entry.category);
    }
    
    // Check rotation
    if (needsRotation()) {
      await rotateLogFile(entry.category);
    }
    
    // Serialize entry
    const line = JSON.stringify(entry) + '\n';
    const bytes = Buffer.byteLength(line);
    
    // Write to stream
    const written = currentLogStream.write(line);
    
    currentLogSize += bytes;
    stats.logsWritten++;
    stats.bytesWritten += bytes;
    
    // Handle backpressure
    if (!written) {
      await new Promise(resolve => currentLogStream.once('drain', resolve));
    }
  } catch (error) {
    stats.errorsEncountered++;
    console.error('[ai-log-writer] Failed to write log entry:', error);
  }
}

/**
 * Flush buffered log entries to disk.
 * @returns {Promise<void>}
 */
async function flush() {
  if (logBuffer.length === 0) return;
  
  const entries = logBuffer.splice(0, logBuffer.length);
  
  for (const entry of entries) {
    await writeLogEntry(entry);
  }
  
  stats.flushesPerformed++;
}

/**
 * Create structured log entry.
 * @param {object} params - Log parameters
 * @returns {object} Structured log entry
 */
function createLogEntry({
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
}) {
  // Auto-capture context if not provided
  if (!context) {
    context = captureContext(4); // Skip createLogEntry + log() + caller
  }
  
  // Base entry
  const entry = {
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
      file: context.file,
      line: context.line,
      function: context.function,
      stack: context.stack,
    },
    
    // Process info
    process: {
      pid: process.pid,
      uptime: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      hostname: process.env.RENDER_SERVICE_NAME || process.env.HOSTNAME || 'unknown',
    },
    
    // Data payload (sanitized)
    data: sanitize(data),
    
    // Tags for filtering
    tags: Array.isArray(tags) ? tags : [tags],
  };
  
  // Add error metadata if present
  if (error) {
    entry.error = extractErrorMetadata(error);
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

// ============================================================================
// Public API
// ============================================================================

/**
 * Log a message at specified level.
 * @param {string} level - Log level (TRACE, DEBUG, INFO, etc.)
 * @param {string} category - Log category
 * @param {string} message - Log message
 * @param {object} options - Additional options
 * @returns {string} Correlation ID for this log entry
 */
function log(level, category, message, options = {}) {
  // Check minimum level
  const levelPriority = CONFIG.levels[level] || CONFIG.levels.INFO;
  const minPriority = CONFIG.levels[CONFIG.minLevel] || CONFIG.levels.INFO;
  
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
    flush().catch(err => console.error('[ai-log-writer] Flush failed:', err));
  }
  
  return entry.correlationId;
}

/**
 * Convenience methods for each log level.
 */
const trace = (category, message, options) => log('TRACE', category, message, options);
const debug = (category, message, options) => log('DEBUG', category, message, options);
const info = (category, message, options) => log('INFO', category, message, options);
const notice = (category, message, options) => log('NOTICE', category, message, options);
const warn = (category, message, options) => log('WARN', category, message, options);
const error = (category, message, options) => log('ERROR', category, message, options);
const critical = (category, message, options) => log('CRITICAL', category, message, options);
const fatal = (category, message, options) => log('FATAL', category, message, options);

/**
 * Initialize the AI log writer.
 * @returns {Promise<void>}
 */
async function initialize() {
  try {
    await ensureLogDirectory();
    await openLogFile('general');
    
    // Start auto-flush interval
    if (CONFIG.autoFlush) {
      flushInterval = setInterval(() => {
        flush().catch(err => console.error('[ai-log-writer] Auto-flush failed:', err));
      }, CONFIG.flushInterval);
      
      // Allow process to exit
      if (flushInterval.unref) {
        flushInterval.unref();
      }
    }
    
    // Start compression/cleanup tasks (every hour)
    const maintenanceInterval = setInterval(() => {
      compressOldLogs().catch(err => console.error('[ai-log-writer] Compression failed:', err));
      cleanupOldLogs().catch(err => console.error('[ai-log-writer] Cleanup failed:', err));
    }, 60 * 60 * 1000);
    
    if (maintenanceInterval.unref) {
      maintenanceInterval.unref();
    }
    
    // Log initialization
    info(CONFIG.categories.SYSTEM, 'AI Log Writer initialized', {
      data: {
        baseDir: CONFIG.baseDir,
        minLevel: CONFIG.minLevel,
        categories: Object.keys(CONFIG.categories).length,
      },
    });
    
    console.log('[ai-log-writer] Initialized successfully');
  } catch (error) {
    console.error('[ai-log-writer] Initialization failed:', error);
    throw error;
  }
}

/**
 * Shutdown the AI log writer gracefully.
 * @returns {Promise<void>}
 */
async function shutdown() {
  isShuttingDown = true;
  
  // Stop auto-flush
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
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
        rotationsPerformed: stats.rotationsPerformed,
        compressionsPerformed: stats.compressionsPerformed,
        flushesPerformed: stats.flushesPerformed,
        uptime: Math.floor((Date.now() - stats.startTime) / 1000),
      },
    },
  });
  
  await flush();
  await closeLogFile();
  
  console.log('[ai-log-writer] Shutdown complete');
}

/**
 * Get current statistics.
 * @returns {object} Statistics object
 */
function getStats() {
  return {
    ...stats,
    uptime: Math.floor((Date.now() - stats.startTime) / 1000),
    currentLogFile,
    currentLogSize,
    bufferSize: logBuffer.length,
  };
}

// ============================================================================
// Exports
// ============================================================================

export {
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
