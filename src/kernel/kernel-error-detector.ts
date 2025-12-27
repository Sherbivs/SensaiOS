/**
 * Kernel Error Detector — Early Error Capture and Pattern Learning
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * BOOT ORDER: Loads immediately after kernel-logger.
 * Only depends on kernel-logger (no other application modules).
 * 
 * MIGRATION (2025-12-27): Moved from /Store/kernel-logs to PostgreSQL
 * Storage: CacheEntry table with namespace 'kernel-errors'
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Captures all errors from the very first moment of execution:
 * - Uncaught exceptions
 * - Unhandled promise rejections
 * - Module load failures
 * - Initialization errors
 * 
 * Features:
 * - Error fingerprinting (deduplicate similar errors)
 * - Pattern detection (recurring errors, time clusters)
 * - Crash detection (rapid error sequences)
 * - Learning from error history
 * - Export for AI/ML analysis
 * 
 * @module kernel/kernel-error-detector
 */

import crypto from 'node:crypto';
import { kernel, klog } from './kernel-logger.js';
import { prisma } from '../shared/prisma.js';

// ============================================================================
// TYPES
// ============================================================================

export type ErrorSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type ErrorPhase = 
  | 'PRE_BOOT'      // Before any app code runs
  | 'MODULE_LOAD'   // During module imports
  | 'INIT'          // During initialization
  | 'RUNTIME'       // Normal operation
  | 'SHUTDOWN';     // During shutdown

export interface KernelError {
  id: string;
  fingerprint: string;
  timestamp: string;
  uptimeMs: number;
  phase: ErrorPhase;
  severity: ErrorSeverity;
  name: string;
  message: string;
  stack?: string;
  source: 'uncaughtException' | 'unhandledRejection' | 'explicit' | 'import';
  context?: Record<string, unknown>;
  // Learning metadata
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  rapidFire: boolean; // True if part of error burst
}

export interface ErrorPattern {
  fingerprint: string;
  name: string;
  message: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  avgIntervalMs: number;
  phases: ErrorPhase[];
  severity: ErrorSeverity;
  isRecurring: boolean;
  isCrashPattern: boolean;
}

export interface CrashDetection {
  detected: boolean;
  errorCount: number;
  windowMs: number;
  fingerprints: string[];
  recommendation: 'CONTINUE' | 'WARN' | 'HALT';
}

export interface KernelErrorStats {
  totalErrors: number;
  uniqueErrors: number;
  bySeverity: Record<ErrorSeverity, number>;
  byPhase: Record<ErrorPhase, number>;
  bySource: Record<string, number>;
  crashDetected: boolean;
  patterns: ErrorPattern[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BOOT_TIME = Date.now();
const ERROR_BUFFER_SIZE = 1000;
const PATTERN_MAP_SIZE = 500;
const CRASH_WINDOW_MS = 10000; // 10 seconds
const CRASH_THRESHOLD = 5; // 5 errors in window = crash
const KERNEL_ERRORS_NAMESPACE = 'kernel-errors';

// ============================================================================
// STATE
// ============================================================================

const errorBuffer: KernelError[] = [];
const patternMap = new Map<string, ErrorPattern>();
const recentErrors: { timestamp: number; fingerprint: string }[] = [];
let currentPhase: ErrorPhase = 'PRE_BOOT';
let handlersInstalled = false;
let crashMode = false;

// ============================================================================
// FINGERPRINTING
// ============================================================================

/**
 * Generate a stable fingerprint for error deduplication
 */
function generateFingerprint(error: Error): string {
  // Use error name + first line of message + first stack frame
  const messagePart = error.message.split('\n')[0].substring(0, 100);
  const stackPart = error.stack?.split('\n')[1]?.trim().substring(0, 100) || '';
  
  const raw = `${error.name}:${messagePart}:${stackPart}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
}

/**
 * Classify error severity based on type and context
 */
function classifySeverity(error: Error, phase: ErrorPhase): ErrorSeverity {
  // Critical: boot-phase errors, OOM, system errors
  if (phase === 'PRE_BOOT' || phase === 'MODULE_LOAD') {
    return 'CRITICAL';
  }
  
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  
  // Critical patterns
  if (
    name.includes('fatal') ||
    message.includes('out of memory') ||
    message.includes('cannot allocate') ||
    message.includes('enospc') ||
    message.includes('database') && message.includes('connection')
  ) {
    return 'CRITICAL';
  }
  
  // High severity
  if (
    name.includes('typeerror') ||
    name.includes('referenceerror') ||
    message.includes('prisma') ||
    message.includes('discord')
  ) {
    return 'HIGH';
  }
  
  // Medium severity
  if (
    name.includes('syntaxerror') ||
    message.includes('timeout') ||
    message.includes('rate limit')
  ) {
    return 'MEDIUM';
  }
  
  return 'LOW';
}

// ============================================================================
// CORE ERROR CAPTURE
// ============================================================================

/**
 * Capture and process an error
 */
export function captureError(
  error: Error,
  source: KernelError['source'],
  context?: Record<string, unknown>
): KernelError {
  const uptimeMs = Date.now() - BOOT_TIME;
  const fingerprint = generateFingerprint(error);
  const severity = classifySeverity(error, currentPhase);
  const timestamp = new Date().toISOString();
  
  // Check for rapid-fire errors (crash detection)
  const now = Date.now();
  recentErrors.push({ timestamp: now, fingerprint });
  
  // Clean old entries from recent window
  while (recentErrors.length > 0 && now - recentErrors[0].timestamp > CRASH_WINDOW_MS) {
    recentErrors.shift();
  }
  
  const rapidFire = recentErrors.length >= CRASH_THRESHOLD;
  if (rapidFire && !crashMode) {
    crashMode = true;
    kernel.critical('kernel-error', 'CRASH PATTERN DETECTED - Rapid error sequence', {
      errorCount: recentErrors.length,
      windowMs: CRASH_WINDOW_MS,
      fingerprints: [...new Set(recentErrors.map(e => e.fingerprint))],
    });
  }
  
  // Check/update pattern
  let pattern = patternMap.get(fingerprint);
  if (pattern) {
    pattern.occurrences++;
    pattern.lastSeen = timestamp;
    pattern.avgIntervalMs = uptimeMs / pattern.occurrences;
    if (!pattern.phases.includes(currentPhase)) {
      pattern.phases.push(currentPhase);
    }
    pattern.isRecurring = pattern.occurrences >= 3;
    pattern.isCrashPattern = pattern.occurrences >= CRASH_THRESHOLD;
  } else {
    // New pattern
    if (patternMap.size >= PATTERN_MAP_SIZE) {
      // Evict oldest pattern
      const oldestKey = patternMap.keys().next().value;
      if (oldestKey) patternMap.delete(oldestKey);
    }
    
    pattern = {
      fingerprint,
      name: error.name,
      message: error.message.substring(0, 200),
      occurrences: 1,
      firstSeen: timestamp,
      lastSeen: timestamp,
      avgIntervalMs: 0,
      phases: [currentPhase],
      severity,
      isRecurring: false,
      isCrashPattern: false,
    };
    patternMap.set(fingerprint, pattern);
  }
  
  // Create error entry
  const kernelError: KernelError = {
    id: crypto.randomUUID(),
    fingerprint,
    timestamp,
    uptimeMs,
    phase: currentPhase,
    severity,
    name: error.name,
    message: error.message,
    stack: error.stack,
    source,
    context,
    firstSeen: pattern.firstSeen,
    lastSeen: pattern.lastSeen,
    occurrences: pattern.occurrences,
    rapidFire,
  };
  
  // Add to buffer (evict oldest if full)
  if (errorBuffer.length >= ERROR_BUFFER_SIZE) {
    errorBuffer.shift();
  }
  errorBuffer.push(kernelError);
  
  // Log to kernel logger
  const logLevel = severity === 'CRITICAL' ? 'CRITICAL' : 
                   severity === 'HIGH' ? 'ERROR' : 
                   severity === 'MEDIUM' ? 'WARN' : 'INFO';
  
  klog(logLevel, 'kernel-error', `[${source}] ${error.name}: ${error.message}`, {
    fingerprint,
    phase: currentPhase,
    occurrences: pattern.occurrences,
    rapidFire,
    ...context,
  }, error);
  
  return kernelError;
}

// ============================================================================
// GLOBAL ERROR HANDLERS
// ============================================================================

/**
 * Install global error handlers (call ONCE at very start)
 */
export function installErrorHandlers(): void {
  if (handlersInstalled) {
    kernel.warn('kernel-error', 'Error handlers already installed, skipping');
    return;
  }
  
  handlersInstalled = true;
  kernel.boot('kernel-error', 'Installing global error handlers');
  
  // Uncaught exceptions
  process.on('uncaughtException', (error: Error, origin: string) => {
    captureError(error, 'uncaughtException', { origin });
    
    // In crash mode or during pre-boot, exit immediately
    if (crashMode || currentPhase === 'PRE_BOOT') {
      kernel.critical('kernel-error', 'Fatal error during boot - exiting', {
        phase: currentPhase,
        crashMode,
      });
      
      // Persist crash report before exit
      persistCrashReport();
      process.exit(1);
    }
  });
  
  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    captureError(error, 'unhandledRejection', { 
      promiseInfo: String(promise).substring(0, 200),
    });
  });
  
  // Process warnings
  process.on('warning', (warning: Error) => {
    kernel.warn('kernel-error', `Process warning: ${warning.message}`, {
      name: warning.name,
      stack: warning.stack?.split('\n').slice(0, 3).join('\n'),
    });
  });
  
  kernel.boot('kernel-error', 'Global error handlers installed');
}

// ============================================================================
// PHASE MANAGEMENT
// ============================================================================

/**
 * Set current execution phase (affects error classification)
 */
export function setPhase(phase: ErrorPhase): void {
  const previousPhase = currentPhase;
  currentPhase = phase;
  kernel.boot('kernel-error', `Phase transition: ${previousPhase} → ${phase}`);
}

/**
 * Get current phase
 */
export function getPhase(): ErrorPhase {
  return currentPhase;
}

// ============================================================================
// CRASH DETECTION
// ============================================================================

/**
 * Check for crash patterns
 */
export function detectCrash(): CrashDetection {
  const now = Date.now();
  const windowErrors = recentErrors.filter(e => now - e.timestamp < CRASH_WINDOW_MS);
  const uniqueFingerprints = [...new Set(windowErrors.map(e => e.fingerprint))];
  
  let recommendation: CrashDetection['recommendation'] = 'CONTINUE';
  if (windowErrors.length >= CRASH_THRESHOLD * 2) {
    recommendation = 'HALT';
  } else if (windowErrors.length >= CRASH_THRESHOLD) {
    recommendation = 'WARN';
  }
  
  return {
    detected: crashMode,
    errorCount: windowErrors.length,
    windowMs: CRASH_WINDOW_MS,
    fingerprints: uniqueFingerprints,
    recommendation,
  };
}

/**
 * Persist crash report to database (fire-and-forget for crash safety)
 */
function persistCrashReport(): void {
  const crashReport = {
    timestamp: new Date().toISOString(),
    uptimeMs: Date.now() - BOOT_TIME,
    phase: currentPhase,
    stats: getErrorStats(),
    recentErrors: errorBuffer.slice(-100),
    patterns: Array.from(patternMap.values()),
    crashDetection: detectCrash(),
  };
  
  const key = `${KERNEL_ERRORS_NAMESPACE}:crash-${Date.now()}`;
  
  // Fire-and-forget database write
  prisma.cacheEntry.create({
    data: {
      key,
      namespace: KERNEL_ERRORS_NAMESPACE,
      value: JSON.parse(JSON.stringify(crashReport)),
    },
  }).then(() => {
    kernel.critical('kernel-error', `Crash report saved: ${key}`);
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[KERNEL-ERROR] Failed to persist crash report:', error);
  });
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get error statistics
 */
export function getErrorStats(): KernelErrorStats {
  const bySeverity: Record<ErrorSeverity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };
  
  const byPhase: Record<ErrorPhase, number> = {
    PRE_BOOT: 0,
    MODULE_LOAD: 0,
    INIT: 0,
    RUNTIME: 0,
    SHUTDOWN: 0,
  };
  
  const bySource: Record<string, number> = {};
  
  for (const error of errorBuffer) {
    bySeverity[error.severity]++;
    byPhase[error.phase]++;
    bySource[error.source] = (bySource[error.source] || 0) + 1;
  }
  
  return {
    totalErrors: errorBuffer.length,
    uniqueErrors: patternMap.size,
    bySeverity,
    byPhase,
    bySource,
    crashDetected: crashMode,
    patterns: Array.from(patternMap.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 20),
  };
}

/**
 * Get errors matching criteria
 */
export function getErrors(filters?: {
  severity?: ErrorSeverity;
  phase?: ErrorPhase;
  since?: number; // uptimeMs
  limit?: number;
}): KernelError[] {
  let errors = [...errorBuffer];
  
  if (filters?.severity) {
    errors = errors.filter(e => e.severity === filters.severity);
  }
  
  if (filters?.phase) {
    errors = errors.filter(e => e.phase === filters.phase);
  }
  
  if (filters?.since !== undefined) {
    const sinceMs = filters.since;
    errors = errors.filter(e => e.uptimeMs >= sinceMs);
  }
  
  if (filters?.limit) {
    errors = errors.slice(-filters.limit);
  }
  
  return errors;
}

/**
 * Get error patterns sorted by frequency
 */
export function getPatterns(): ErrorPattern[] {
  return Array.from(patternMap.values())
    .sort((a, b) => b.occurrences - a.occurrences);
}

// ============================================================================
// LEARNING & EXPORT
// ============================================================================

/**
 * Export error data for AI/ML analysis
 */
export function exportErrorData(): {
  metadata: {
    exportTime: string;
    bootTime: string;
    uptimeMs: number;
    phase: ErrorPhase;
    crashMode: boolean;
  };
  stats: KernelErrorStats;
  patterns: ErrorPattern[];
  errors: KernelError[];
} {
  return {
    metadata: {
      exportTime: new Date().toISOString(),
      bootTime: new Date(BOOT_TIME).toISOString(),
      uptimeMs: Date.now() - BOOT_TIME,
      phase: currentPhase,
      crashMode,
    },
    stats: getErrorStats(),
    patterns: getPatterns(),
    errors: [...errorBuffer],
  };
}

/**
 * Get learnings from error patterns (for AI suggestions)
 */
export function getLearnings(): {
  recurringErrors: ErrorPattern[];
  crashPatterns: ErrorPattern[];
  recommendations: string[];
} {
  const patterns = getPatterns();
  const recurringErrors = patterns.filter(p => p.isRecurring);
  const crashPatterns = patterns.filter(p => p.isCrashPattern);
  
  const recommendations: string[] = [];
  
  // Generate recommendations based on patterns
  for (const pattern of crashPatterns) {
    recommendations.push(
      `CRITICAL: Error "${pattern.name}" has occurred ${pattern.occurrences} times - investigate root cause`
    );
  }
  
  if (recurringErrors.length > 5) {
    recommendations.push(
      `${recurringErrors.length} recurring error patterns detected - consider systematic review`
    );
  }
  
  const bootErrors = patterns.filter(p => p.phases.includes('MODULE_LOAD') || p.phases.includes('PRE_BOOT'));
  if (bootErrors.length > 0) {
    recommendations.push(
      `${bootErrors.length} errors occurred during boot - may indicate missing dependencies or configuration issues`
    );
  }
  
  return {
    recurringErrors,
    crashPatterns,
    recommendations,
  };
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Shutdown error detector (persist final state to database)
 */
export function shutdownErrorDetector(): void {
  setPhase('SHUTDOWN');
  
  const stats = getErrorStats();
  kernel.boot('kernel-error', 'Kernel error detector shutting down', {
    totalErrors: stats.totalErrors,
    uniqueErrors: stats.uniqueErrors,
    crashDetected: stats.crashDetected,
  });
  
  // Persist final error log if there were errors
  if (errorBuffer.length > 0) {
    const report = exportErrorData();
    const key = `${KERNEL_ERRORS_NAMESPACE}:errors-${Date.now()}`;
    
    // Fire-and-forget to database
    prisma.cacheEntry.create({
      data: {
        key,
        namespace: KERNEL_ERRORS_NAMESPACE,
        value: JSON.parse(JSON.stringify(report)),
      },
    }).then(() => {
      kernel.info('kernel-error', `Error report saved: ${key}`);
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('[KERNEL-ERROR] Failed to persist error report:', error);
    });
  }
}
