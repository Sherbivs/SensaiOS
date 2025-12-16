/* eslint-disable no-console */
/**
 * Console Interceptor — Capture and Store Console Outputs
 * 
 * Purpose:
 * - Intercept all console.log, console.warn, console.error calls
 * - Parse structured data from console output patterns
 * - Store in console_outputs table for querying and analytics
 * 
 * Architecture:
 * - Non-blocking async writes (fire-and-forget)
 * - Buffered batch inserts (100 entries / 10 seconds)
 * - Fallback to original console on database errors
 * 
 * Integration:
 * - Install at startup in src/index.ts after workers initialize
 * - Uses TimescaleDBWorker for batched writes
 * 
 * @module shared/console-interceptor
 */

// ============================================================================
// Types
// ============================================================================

interface ParsedOutput {
  type: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  data: Record<string, unknown>;
}

interface ConsoleOutputEntry {
  serviceName: string;
  outputType: string;
  outputLevel: string;
  rawOutput: string;
  parsedData: Record<string, unknown> | null;
  correlationId?: string;
  sessionId?: string;
}

// ============================================================================
// Constants
// ============================================================================

const BUFFER_CONFIG = {
  maxSize: 500,
  flushIntervalMs: 10000, // 10 seconds
  batchSize: 100,
};

// Common console output patterns
const PATTERNS = {
  // [Component] Message
  component: /^\[([^\]]+)\]\s*(.*)$/,
  // [Component] [Step] Message (e.g., [WorkerManager] [1/4] Initializing...)
  componentStep: /^\[([^\]]+)\]\s*\[(\d+\/\d+)\]\s*(.*)$/,
  // Timestamp prefix
  timestamp: /^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]\s*(.*)$/,
  // Level prefix [INFO] [WARN] [ERROR]
  level: /^\[(INFO|WARN|ERROR|DEBUG)\]\s*(.*)$/i,
  // Duration marker (123ms, 1.5s)
  duration: /(\d+(?:\.\d+)?(?:ms|s))/,
  // Key=Value pairs
  keyValue: /(\w+)=([^\s,]+)/g,
};

// Common status emojis for detection
const STATUS_EMOJIS: Record<string, string> = {
  '✅': 'success',
  '❌': 'error',
  '⚠️': 'warning',
  '🔄': 'progress',
  '📦': 'package',
  '🔥': 'hot',
  '💾': 'storage',
  '⏱️': 'timer',
  '🎯': 'target',
};

// ============================================================================
// State
// ============================================================================

let isInstalled = false;
let serviceName = 'unknown';
let sessionId: string | undefined;
let buffer: ConsoleOutputEntry[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Original console methods (saved before interception)
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
  info: console.info.bind(console),
};

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse console output and extract structured data
 */
function parseConsoleOutput(raw: string, level: 'debug' | 'info' | 'warn' | 'error'): ParsedOutput {
  const data: Record<string, unknown> = {};
  let outputType = 'generic';
  
  // Try component + step pattern first (most specific)
  const componentStepMatch = raw.match(PATTERNS.componentStep);
  if (componentStepMatch) {
    data.component = componentStepMatch[1];
    data.step = componentStepMatch[2];
    data.message = componentStepMatch[3];
    outputType = 'progress';
    return { type: outputType, level, data };
  }
  
  // Try component pattern
  const componentMatch = raw.match(PATTERNS.component);
  if (componentMatch) {
    data.component = componentMatch[1];
    data.message = componentMatch[2];
    outputType = 'component';
  }
  
  // Check for emoji prefix
  const firstChar = raw.charAt(0);
  if (STATUS_EMOJIS[firstChar]) {
    data.emoji = firstChar;
    data.hasEmoji = true;
    outputType = 'status';
    data.status = STATUS_EMOJIS[firstChar];
  }
  
  // Check for level prefix
  const levelMatch = raw.match(PATTERNS.level);
  if (levelMatch) {
    data.declaredLevel = levelMatch[1].toLowerCase();
    outputType = 'structured';
  }
  
  // Extract duration if present
  const durationMatch = raw.match(PATTERNS.duration);
  if (durationMatch) {
    const durStr = durationMatch[1];
    if (durStr.endsWith('ms')) {
      data.durationMs = parseFloat(durStr);
    } else if (durStr.endsWith('s')) {
      data.durationMs = parseFloat(durStr) * 1000;
    }
  }
  
  // Extract key=value pairs
  const kvMatches = raw.matchAll(PATTERNS.keyValue);
  for (const match of kvMatches) {
    const key = match[1];
    const value = match[2];
    // Try to parse as number
    const numValue = parseFloat(value);
    data[key] = isNaN(numValue) ? value : numValue;
  }
  
  // Detect telemetry output
  if (raw.includes('TELEMETRY') || raw.includes('Stats:') || raw.includes('Metrics:')) {
    outputType = 'telemetry';
  }
  
  // Detect section headers (═══ or === or ---)
  if (raw.includes('═══') || raw.includes('===') || raw.includes('---')) {
    outputType = 'section';
  }
  
  // Detect banner/startup messages
  if (raw.includes('Starting') || raw.includes('Initialized') || raw.includes('Ready')) {
    outputType = 'lifecycle';
  }
  
  return { type: outputType, level, data };
}

/**
 * Format arguments to string
 */
function formatArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

// ============================================================================
// Buffer Management
// ============================================================================

/**
 * Add entry to buffer and trigger flush if needed
 */
function bufferEntry(entry: ConsoleOutputEntry): void {
  buffer.push(entry);
  
  // Flush if buffer is full
  if (buffer.length >= BUFFER_CONFIG.maxSize) {
    void flushBuffer();
  }
}

/**
 * Flush buffer to database
 */
async function flushBuffer(): Promise<void> {
  if (buffer.length === 0) return;
  
  // Take snapshot of buffer and clear
  const entries = buffer.splice(0, buffer.length);
  
  try {
    // Lazy-load TimescaleDB worker to avoid circular dependencies
    const { getTimescaleDBWorker } = await import('../../workers/database/index.js');
    const worker = getTimescaleDBWorker();
    
    // Batch insert entries
    for (const entry of entries) {
      await worker.insert('consoleOutput', {
        serviceName: entry.serviceName,
        outputType: entry.outputType,
        outputLevel: entry.outputLevel,
        rawOutput: entry.rawOutput,
        parsedData: entry.parsedData,
        correlationId: entry.correlationId,
        sessionId: entry.sessionId,
      });
    }
  } catch (error) {
    // On error, log to original console (don't re-intercept)
    originalConsole.error('[ConsoleInterceptor] Failed to flush buffer:', error);
    
    // Optionally restore entries to buffer (with limit to prevent memory leak)
    if (buffer.length + entries.length < BUFFER_CONFIG.maxSize * 2) {
      buffer.unshift(...entries);
    }
  }
}

/**
 * Start flush timer
 */
function startFlushTimer(): void {
  if (flushTimer) return;
  
  flushTimer = setInterval(() => {
    void flushBuffer();
  }, BUFFER_CONFIG.flushIntervalMs);
}

/**
 * Stop flush timer
 */
function stopFlushTimer(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

// ============================================================================
// Capture Function
// ============================================================================

/**
 * Capture console output and add to buffer
 */
function captureConsoleOutput(
  level: 'debug' | 'info' | 'warn' | 'error',
  args: unknown[]
): void {
  const rawOutput = formatArgs(args);
  const parsed = parseConsoleOutput(rawOutput, level);
  
  const entry: ConsoleOutputEntry = {
    serviceName,
    outputType: parsed.type,
    outputLevel: level,
    rawOutput,
    parsedData: Object.keys(parsed.data).length > 0 ? parsed.data : null,
    sessionId,
  };
  
  bufferEntry(entry);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Install console interceptor
 * 
 * @param serviceNameParam - Service identifier (e.g., 'infinity-gauntlet')
 * @param sessionIdParam - Optional session/deploy ID
 */
export function installConsoleInterceptor(
  serviceNameParam: string,
  sessionIdParam?: string
): void {
  if (isInstalled) {
    originalConsole.warn('[ConsoleInterceptor] Already installed');
    return;
  }
  
  serviceName = serviceNameParam;
  sessionId = sessionIdParam || process.env.RENDER_SERVICE_ID || undefined;
  
  // Override console methods
  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    captureConsoleOutput('info', args);
  };
  
  console.info = (...args: unknown[]) => {
    originalConsole.info(...args);
    captureConsoleOutput('info', args);
  };
  
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    captureConsoleOutput('warn', args);
  };
  
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    captureConsoleOutput('error', args);
  };
  
  console.debug = (...args: unknown[]) => {
    originalConsole.debug(...args);
    captureConsoleOutput('debug', args);
  };
  
  // Start periodic flush
  startFlushTimer();
  
  isInstalled = true;
  originalConsole.log('[ConsoleInterceptor] Installed for service:', serviceName);
}

/**
 * Uninstall console interceptor and restore original methods
 */
export async function uninstallConsoleInterceptor(): Promise<void> {
  if (!isInstalled) return;
  
  // Stop flush timer
  stopFlushTimer();
  
  // Final flush
  await flushBuffer();
  
  // Restore original console methods
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
  
  isInstalled = false;
  originalConsole.log('[ConsoleInterceptor] Uninstalled');
}

/**
 * Get interceptor statistics
 */
export function getConsoleInterceptorStats(): {
  isInstalled: boolean;
  serviceName: string;
  bufferSize: number;
  sessionId?: string;
} {
  return {
    isInstalled,
    serviceName,
    bufferSize: buffer.length,
    sessionId,
  };
}

/**
 * Force flush buffer (for testing or shutdown)
 */
export async function forceFlush(): Promise<void> {
  await flushBuffer();
}

/**
 * Get original console methods (for bypassing interception)
 */
export function getOriginalConsole(): typeof originalConsole {
  return originalConsole;
}
