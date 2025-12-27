/**
 * Kernel Logger — Synchronous Pre-Boot Logging with Queue
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * BOOT ORDER: This module MUST load before ALL other application code.
 * No dependencies on other application modules allowed.
 * 
 * MIGRATION (2025-12-27): File logging disabled (Database-First Architecture)
 * - Ring buffer + console output retained (synchronous, zero-dependency)
 * - Use kernel.exportLogs() to persist to database after boot
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Provides synchronous, dependency-free logging that works from the very
 * first moment of execution. Similar to kernel ring buffer (dmesg) in Linux.
 * 
 * NEW: Pre-Boot Queue System (KERNEL.LOGGING.PREBOOT_QUEUE)
 * - Logs captured BEFORE boot() complete are queued with console fallback
 * - Queue replayed after boot() to ensure no logs are lost
 * - MAX_PREBOOT_ENTRIES prevents memory exhaustion if boot fails
 * - Any module can import and log immediately, logs are never lost
 * 
 * Features:
 * - Synchronous writes (no async, no promises)
 * - Zero external dependencies
 * - Pre-boot queue with automatic replay
 * - Ring buffer for memory-bounded storage
 * - Console output for crash recovery
 * - Structured JSON entries with timestamps
 * - Severity levels (KERNEL, CRITICAL, ERROR, WARN, INFO, DEBUG, TRACE)
 * 
 * @module kernel/kernel-logger
 */

const writeStdout = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const writeStderr = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

// NOTE: File system imports removed - Database-First Architecture (2025-12-27)
// Ring buffer + console is sufficient for pre-boot logging
// File persistence replaced with database export after boot

// ============================================================================
// TYPES
// ============================================================================

export type KernelLogLevel = 
  | 'KERNEL'   // Boot/shutdown events, system-level
  | 'CRITICAL' // System cannot continue
  | 'ERROR'    // Operation failed
  | 'WARN'     // Potential issue
  | 'INFO'     // Normal operation
  | 'DEBUG'    // Detailed information
  | 'TRACE';   // Very detailed tracing

export interface KernelLogEntry {
  timestamp: string;
  uptimeMs: number;
  level: KernelLogLevel;
  component: string;
  message: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  /** Marker for entries that were queued during pre-boot */
  preBoot?: boolean;
}

export interface KernelLogStats {
  totalEntries: number;
  entriesByLevel: Record<KernelLogLevel, number>;
  firstEntry: string | null;
  lastEntry: string | null;
  bufferUsage: number;
  bufferCapacity: number;
  flushedToFile: boolean;
  persistPath: string | null;
}

/**
 * Pre-boot queue statistics
 */
export interface PreBootStats {
  /** Whether boot has completed */
  booted: boolean;
  /** Number of entries currently in pre-boot queue */
  queuedEntries: number;
  /** Maximum allowed entries in pre-boot queue */
  maxEntries: number;
  /** Number of entries dropped due to queue overflow */
  droppedEntries: number;
  /** Number of entries replayed after boot */
  replayedEntries: number;
  /** Whether replay has occurred */
  replayed: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BOOT_TIME = Date.now();
const RING_BUFFER_SIZE = 10000; // Max entries in memory
const MAX_PREBOOT_ENTRIES = 1000; // Max entries before boot (prevents memory exhaustion)
// File logging disabled - Database-First Architecture (2025-12-27);

// Level priorities for filtering
const LEVEL_PRIORITY: Record<KernelLogLevel, number> = {
  KERNEL: 0,
  CRITICAL: 1,
  ERROR: 2,
  WARN: 3,
  INFO: 4,
  DEBUG: 5,
  TRACE: 6,
};

// ============================================================================
// STATE
// ============================================================================

const ringBuffer: KernelLogEntry[] = [];
let currentLogLevel: KernelLogLevel = 'INFO';
// File logging disabled - Database-First Architecture (2025-12-27)
const persistPath: string | null = null;
const fileHandle: number | null = null;
let initialized = false;
let shuttingDown = false;
let entriesByLevel: Record<KernelLogLevel, number> = {
  KERNEL: 0,
  CRITICAL: 0,
  ERROR: 0,
  WARN: 0,
  INFO: 0,
  DEBUG: 0,
  TRACE: 0,
};

// ============================================================================
// PRE-BOOT QUEUE STATE
// ============================================================================

/**
 * Pre-boot queue: Stores logs before boot() is called.
 * - Logs are echoed to console immediately for visibility
 * - After boot(), queue is replayed to main ring buffer + file
 * - Queue has size limit to prevent memory exhaustion on boot failure
 */
const preBootQueue: KernelLogEntry[] = [];
let booted = false;
let preBootDroppedCount = 0;
let preBootReplayedCount = 0;
let preBootReplayed = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize kernel logger (called automatically on first use)
 * Database-First Architecture (2025-12-27): File logging disabled
 * Uses ring buffer + console output only
 */
function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;
  
  // File logging disabled - ring buffer + console is sufficient for pre-boot
  // Use kernel.exportLogs() to persist to database after boot completes
}

// ============================================================================
// CORE LOGGING
// ============================================================================

/**
 * Output a log entry to console with colors
 */
function outputToConsole(entry: KernelLogEntry, isPreBoot: boolean): void {
  const prefix = isPreBoot
    ? `[PRE-BOOT] [${entry.uptimeMs.toString().padStart(8, ' ')}ms] [${entry.level.padEnd(8)}] [${entry.component}]`
    : `[${entry.uptimeMs.toString().padStart(8, ' ')}ms] [${entry.level.padEnd(8)}] [${entry.component}]`;
  const line = `${prefix} ${entry.message}`;
  const coloredLine = colorize(entry.level, line);
  
  if (entry.level === 'KERNEL' || entry.level === 'CRITICAL' || entry.level === 'ERROR') {
    writeStderr(coloredLine);
  } else if (entry.level === 'WARN') {
    writeStderr(coloredLine);
  } else if (entry.level === 'DEBUG' || entry.level === 'TRACE') {
    if (process.env.KERNEL_VERBOSE === 'true') {
      writeStdout(coloredLine);
    }
  } else {
    writeStdout(coloredLine);
  }
}

/**
 * Output a log entry to file (DISABLED - Database-First Architecture 2025-12-27)
 * File logging removed, ring buffer + console is retained
 */
function outputToFile(_entry: KernelLogEntry): void {
  // File logging disabled - use kernel.exportLogs() for database persistence
}

/**
 * Process a log entry (add to ring buffer + output)
 * Called for normal logs and replayed pre-boot logs
 */
function processLogEntry(entry: KernelLogEntry): void {
  // Add to ring buffer (evict oldest if full)
  if (ringBuffer.length >= RING_BUFFER_SIZE) {
    ringBuffer.shift();
  }
  ringBuffer.push(entry);
  entriesByLevel[entry.level]++;
  
  // Output to console (skip if replaying - already output during pre-boot)
  if (!entry.preBoot) {
    outputToConsole(entry, false);
  }
  
  // Output to file (disabled)
  outputToFile(entry);
}

/**
 * Write a kernel log entry (synchronous)
 * 
 * PRE-BOOT BEHAVIOR:
 * - If boot() hasn't been called yet, entries are queued
 * - Console output happens immediately (visibility)
 * - Queue is replayed after boot() to ensure persistence
 * 
 * POST-BOOT BEHAVIOR:
 * - Entries go directly to ring buffer + file
 */
export function klog(
  level: KernelLogLevel,
  component: string,
  message: string,
  data?: Record<string, unknown>,
  error?: Error
): void {
  // Skip if below current log level
  if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[currentLogLevel]) {
    return;
  }
  
  const uptimeMs = Date.now() - BOOT_TIME;
  
  const entry: KernelLogEntry = {
    timestamp: new Date().toISOString(),
    uptimeMs,
    level,
    component,
    message,
    data,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : undefined,
  };
  
  // PRE-BOOT: Queue the entry with console fallback
  if (!booted) {
    // Enforce queue size limit
    if (preBootQueue.length >= MAX_PREBOOT_ENTRIES) {
      // Drop oldest entry to make room
      preBootQueue.shift();
      preBootDroppedCount++;
      
      // Log warning once when first drop occurs
      if (preBootDroppedCount === 1) {
        const warnEntry: KernelLogEntry = {
          timestamp: new Date().toISOString(),
          uptimeMs: Date.now() - BOOT_TIME,
          level: 'WARN',
          component: 'kernel-logger',
          message: `Pre-boot queue limit (${MAX_PREBOOT_ENTRIES}) reached, dropping oldest entries`,
          preBoot: true,
        };
        outputToConsole(warnEntry, true);
        // This warning will be replayed after boot
        preBootQueue.push(warnEntry);
        preBootQueue.shift(); // Make room for the actual entry
      }
    }
    
    // Mark as pre-boot entry
    entry.preBoot = true;
    preBootQueue.push(entry);
    
    // Console output immediately for visibility
    outputToConsole(entry, true);
    return;
  }
  
  // POST-BOOT: Auto-initialize file logger if needed
  if (!initialized) {
    ensureInitialized();
  }
  
  // Process normally
  processLogEntry(entry);
}

/**
 * Add ANSI color codes based on log level
 */
function colorize(level: KernelLogLevel, text: string): string {
  const colors: Record<KernelLogLevel, string> = {
    KERNEL: '\x1b[35m',   // Magenta
    CRITICAL: '\x1b[31m', // Red
    ERROR: '\x1b[31m',    // Red
    WARN: '\x1b[33m',     // Yellow
    INFO: '\x1b[36m',     // Cyan
    DEBUG: '\x1b[90m',    // Gray
    TRACE: '\x1b[90m',    // Gray
  };
  const reset = '\x1b[0m';
  return `${colors[level]}${text}${reset}`;
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

export const kernel = {
  /**
   * Boot/shutdown system-level events
   */
  boot: (component: string, message: string, data?: Record<string, unknown>) =>
    klog('KERNEL', component, message, data),
  
  /**
   * System cannot continue
   */
  critical: (component: string, message: string, data?: Record<string, unknown>, error?: Error) =>
    klog('CRITICAL', component, message, data, error),
  
  /**
   * Operation failed
   */
  error: (component: string, message: string, data?: Record<string, unknown>, error?: Error) =>
    klog('ERROR', component, message, data, error),
  
  /**
   * Potential issue
   */
  warn: (component: string, message: string, data?: Record<string, unknown>) =>
    klog('WARN', component, message, data),
  
  /**
   * Normal operation
   */
  info: (component: string, message: string, data?: Record<string, unknown>) =>
    klog('INFO', component, message, data),
  
  /**
   * Detailed information
   */
  debug: (component: string, message: string, data?: Record<string, unknown>) =>
    klog('DEBUG', component, message, data),
  
  /**
   * Very detailed tracing
   */
  trace: (component: string, message: string, data?: Record<string, unknown>) =>
    klog('TRACE', component, message, data),
};

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Set minimum log level for filtering
 */
export function setKernelLogLevel(level: KernelLogLevel): void {
  currentLogLevel = level;
  klog('KERNEL', 'kernel-logger', `Log level set to ${level}`);
}

/**
 * Get current log level
 */
export function getKernelLogLevel(): KernelLogLevel {
  return currentLogLevel;
}

/**
 * Get kernel uptime in milliseconds (since boot)
 */
export function getKernelUptime(): number {
  return Date.now() - BOOT_TIME;
}

/**
 * Get kernel boot timestamp
 */
export function getKernelBootTime(): number {
  return BOOT_TIME;
}

// ============================================================================
// PRE-BOOT QUEUE API
// ============================================================================

/**
 * Mark the kernel as booted and replay pre-boot queue.
 * 
 * This should be called once during application startup after
 * file logging is initialized. It:
 * 1. Initializes file logging if not already done
 * 2. Replays all queued pre-boot logs to the ring buffer + file
 * 3. Marks the kernel as booted (future logs go directly)
 * 
 * @returns Number of entries replayed
 */
export function markBooted(): number {
  if (booted) {
    klog('WARN', 'kernel-logger', 'markBooted() called but already booted');
    return 0;
  }
  
  // Initialize file logging before replaying
  if (!initialized) {
    ensureInitialized();
  }
  
  booted = true;
  
  // Log boot marker
  klog('KERNEL', 'kernel-logger', 'Kernel boot complete, replaying pre-boot queue', {
    queuedEntries: preBootQueue.length,
    droppedEntries: preBootDroppedCount,
  });
  
  // Replay pre-boot queue to ring buffer + file
  // Note: Console output already happened during pre-boot
  let replayed = 0;
  while (preBootQueue.length > 0) {
    const entry = preBootQueue.shift()!;
    processLogEntry(entry);
    replayed++;
  }
  
  preBootReplayedCount = replayed;
  preBootReplayed = true;
  
  klog('KERNEL', 'kernel-logger', `Pre-boot queue replayed: ${replayed} entries`, {
    replayed,
    dropped: preBootDroppedCount,
  });
  
  return replayed;
}

/**
 * Check if kernel has been marked as booted
 */
export function isBooted(): boolean {
  return booted;
}

/**
 * Get pre-boot queue statistics
 */
export function getPreBootStats(): PreBootStats {
  return {
    booted,
    queuedEntries: preBootQueue.length,
    maxEntries: MAX_PREBOOT_ENTRIES,
    droppedEntries: preBootDroppedCount,
    replayedEntries: preBootReplayedCount,
    replayed: preBootReplayed,
  };
}

/**
 * Get the current pre-boot queue (for debugging/testing)
 * Returns a copy to prevent mutation
 */
export function getPreBootQueue(): KernelLogEntry[] {
  return [...preBootQueue];
}

// ============================================================================
// BUFFER ACCESS
// ============================================================================

/**
 * Get all entries from ring buffer
 */
export function getKernelLogs(filters?: {
  level?: KernelLogLevel;
  component?: string;
  since?: number; // uptimeMs
  limit?: number;
}): KernelLogEntry[] {
  let entries = [...ringBuffer];
  
  if (filters?.level) {
    const minPriority = LEVEL_PRIORITY[filters.level];
    entries = entries.filter(e => LEVEL_PRIORITY[e.level] <= minPriority);
  }
  
  if (filters?.component) {
    entries = entries.filter(e => e.component === filters.component);
  }
  
  if (filters?.since !== undefined) {
    const sinceMs = filters.since;
    entries = entries.filter(e => e.uptimeMs >= sinceMs);
  }
  
  if (filters?.limit) {
    entries = entries.slice(-filters.limit);
  }
  
  return entries;
}

/**
 * Get kernel log statistics
 */
export function getKernelLogStats(): KernelLogStats {
  return {
    totalEntries: ringBuffer.length,
    entriesByLevel: { ...entriesByLevel },
    firstEntry: ringBuffer.length > 0 ? ringBuffer[0].timestamp : null,
    lastEntry: ringBuffer.length > 0 ? ringBuffer[ringBuffer.length - 1].timestamp : null,
    bufferUsage: ringBuffer.length,
    bufferCapacity: RING_BUFFER_SIZE,
    flushedToFile: fileHandle !== null,
    persistPath,
  };
}

/**
 * Get recent errors (last N entries with ERROR or CRITICAL level)
 */
export function getRecentErrors(limit = 50): KernelLogEntry[] {
  return ringBuffer
    .filter(e => e.level === 'ERROR' || e.level === 'CRITICAL')
    .slice(-limit);
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Flush and close kernel logger (call on process exit)
 * Database-First Architecture (2025-12-27): File handle cleanup removed
 */
export function shutdownKernelLogger(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  
  klog('KERNEL', 'kernel-logger', 'Kernel logger shutting down', {
    totalEntries: ringBuffer.length,
    uptimeMs: Date.now() - BOOT_TIME,
  });
  
  // File logging disabled - ring buffer persists until process exit
  // Use kernel.exportLogs() to persist to database if needed
}

// ============================================================================
// EXPORT FOR ANALYSIS
// ============================================================================

/**
 * Export kernel logs as JSON for external analysis
 */
export function exportKernelLogs(): {
  metadata: {
    exportTime: string;
    bootTime: string;
    uptimeMs: number;
    nodeVersion: string;
    platform: string;
    logFile: string | null;
  };
  stats: KernelLogStats;
  entries: KernelLogEntry[];
} {
  return {
    metadata: {
      exportTime: new Date().toISOString(),
      bootTime: new Date(BOOT_TIME).toISOString(),
      uptimeMs: Date.now() - BOOT_TIME,
      nodeVersion: process.version,
      platform: `${process.platform}/${process.arch}`,
      logFile: persistPath,
    },
    stats: getKernelLogStats(),
    entries: [...ringBuffer],
  };
}

// ============================================================================
// MODULE INITIALIZATION
// ============================================================================

/**
 * NOTE: We do NOT auto-initialize file logging when the module loads.
 * 
 * PRE-BOOT QUEUE PATTERN:
 * 1. Any module can import kernel-logger and call klog() immediately
 * 2. Before markBooted() is called, logs go to pre-boot queue + console
 * 3. Application calls markBooted() after file system is ready
 * 4. Pre-boot queue is replayed to ring buffer + file
 * 
 * This ensures NO logs are lost, even if code logs before boot completes.
 */

// Log that the module has been loaded (will be in pre-boot queue)
klog('KERNEL', 'kernel-logger', 'Kernel logger module loaded', {
  platform: process.platform,
  nodeVersion: process.version,
  pid: process.pid,
});
