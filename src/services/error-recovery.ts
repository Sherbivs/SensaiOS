/**
 * Error Recovery Automation Service
 * Purpose: Automated recovery strategies for known error patterns
 * Tracks recovery attempts, success rates, and learns from outcomes
 * 
 * @module services/error-recovery
 */

import type { ErrorLog } from '@prisma/client';
import { prisma } from '../shared/prisma.js';
import type { ErrorCategory } from './error-tracker.js';
import { log } from '../utils/logger.js';

/// ---- Recovery Strategy Types ----

export type RecoveryStrategy =
  | 'exponential-backoff-retry'
  | 'rate-limit-queue'
  | 'increase-timeout'
  | 'rebuild-cache'
  | 'restart-worker'
  | 'reconnect-database'
  | 'clear-corrupted-state'
  | 'no-recovery-available';

export interface RecoveryAttempt {
  errorId: string;
  fingerprint: string;
  strategy: RecoveryStrategy;
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface RecoveryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  timeoutIncreaseMs: number;
  workerRestartMaxAttempts: number;
}

const DEFAULT_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,        // 1 second
  maxDelayMs: 30000,        // 30 seconds
  backoffMultiplier: 2,     // Exponential: 1s, 2s, 4s, 8s...
  timeoutIncreaseMs: 5000,  // Increase timeout by 5s on TimeoutError
  workerRestartMaxAttempts: 3,
};

/// ---- Recovery State Tracking ----

interface RecoveryState {
  activeRecoveries: Map<string, RecoveryAttempt>; // fingerprint → attempt
  rateLimitQueue: Array<{ fn: () => Promise<any>; addedAt: Date }>;
  workerRestartCounts: Map<string, number>; // workerName → restartCount
}

const recoveryState: RecoveryState = {
  activeRecoveries: new Map(),
  rateLimitQueue: [],
  workerRestartCounts: new Map(),
};

/// ---- Public API ----

/**
 * Attempt automated recovery for an error
 * Returns true if recovery succeeded, false if failed or not applicable
 */
export async function attemptRecovery(
  error: ErrorLog,
  config: Partial<RecoveryConfig> = {}
): Promise<boolean> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Determine recovery strategy based on error characteristics
  const strategy = selectRecoveryStrategy(error);
  
  if (strategy === 'no-recovery-available') {
    log('info', 'error-recovery: No recovery strategy available', {
      fingerprint: error.fingerprint,
      category: error.category,
    });
    return false;
  }
  
  // Check if recovery already in progress for this error
  if (recoveryState.activeRecoveries.has(error.fingerprint)) {
    log('info', 'error-recovery: Recovery already in progress', {
      fingerprint: error.fingerprint,
      strategy,
    });
    return false;
  }
  
  // Start recovery attempt
  const attempt: RecoveryAttempt = {
    errorId: error.errorId,
    fingerprint: error.fingerprint,
    strategy,
    attemptNumber: (error.recoveryAttempted || 0) + 1,
    startedAt: new Date(),
    success: false,
  };
  
  recoveryState.activeRecoveries.set(error.fingerprint, attempt);
  
  log('info', 'error-recovery: Starting recovery attempt', {
    fingerprint: error.fingerprint,
    strategy,
    attemptNumber: attempt.attemptNumber,
  });
  
  try {
    // Execute recovery strategy
    let success = false;
    
    switch (strategy) {
      case 'exponential-backoff-retry':
        success = await recoverWithExponentialBackoff(error, attempt, fullConfig);
        break;
      case 'rate-limit-queue':
        success = await recoverWithRateLimitQueue(error, attempt);
        break;
      case 'increase-timeout':
        success = await recoverWithTimeoutIncrease(error, attempt, fullConfig);
        break;
      case 'rebuild-cache':
        success = await recoverWithCacheRebuild(error, attempt);
        break;
      case 'restart-worker':
        success = await recoverWithWorkerRestart(error, attempt, fullConfig);
        break;
      case 'reconnect-database':
        success = await recoverWithDatabaseReconnect(error, attempt, fullConfig);
        break;
      case 'clear-corrupted-state':
        success = await recoverWithStateClear(error, attempt);
        break;
      default:
        log('warn', 'error-recovery: Unknown strategy', { strategy });
        success = false;
    }
    
    attempt.success = success;
    attempt.completedAt = new Date();
    
    // Update error log with recovery outcome
    await updateRecoveryStats(error, attempt);
    
    log('info', 'error-recovery: Recovery attempt completed', {
      fingerprint: error.fingerprint,
      strategy,
      success,
      durationMs: attempt.completedAt.getTime() - attempt.startedAt.getTime(),
    });
    
    return success;
  } catch (err) {
    attempt.success = false;
    attempt.completedAt = new Date();
    attempt.error = err instanceof Error ? err.message : String(err);
    
    log('error', 'error-recovery: Recovery attempt failed', {
      fingerprint: error.fingerprint,
      strategy,
      error: attempt.error,
    });
    
    await updateRecoveryStats(error, attempt);
    return false;
  } finally {
    recoveryState.activeRecoveries.delete(error.fingerprint);
  }
}

/**
 * Get recovery statistics for monitoring
 */
export function getRecoveryStats(): {
  activeRecoveries: number;
  queuedOperations: number;
  workerRestartCounts: Record<string, number>;
  totalRecoveryAttempts: number;
} {
  return {
    activeRecoveries: recoveryState.activeRecoveries.size,
    queuedOperations: recoveryState.rateLimitQueue.length,
    workerRestartCounts: Object.fromEntries(recoveryState.workerRestartCounts),
    totalRecoveryAttempts: Array.from(recoveryState.activeRecoveries.values())
      .reduce((sum, attempt) => sum + attempt.attemptNumber, 0),
  };
}

/**
 * Clear recovery state (useful for testing or manual reset)
 */
export function clearRecoveryState(): void {
  recoveryState.activeRecoveries.clear();
  recoveryState.rateLimitQueue = [];
  recoveryState.workerRestartCounts.clear();
  log('info', 'error-recovery: Recovery state cleared');
}

/// ---- Strategy Selection ----

/**
 * Select appropriate recovery strategy based on error characteristics
 */
function selectRecoveryStrategy(error: ErrorLog): RecoveryStrategy {
  const errorName = error.errorName.toLowerCase();
  const message = error.errorMessage?.toLowerCase() || '';
  const category = error.category as ErrorCategory;
  
  // Database connection errors → reconnect with exponential backoff
  if (
    category === 'DATABASE' &&
    (errorName.includes('connection') ||
     message.includes('econnrefused') ||
     message.includes('connection refused') ||
     message.includes('connection closed'))
  ) {
    return 'reconnect-database';
  }
  
  // Discord rate limit errors → queue operations
  if (
    category === 'DISCORD' &&
    (errorName.includes('ratelimit') ||
     message.includes('429') ||
     message.includes('rate limit'))
  ) {
    return 'rate-limit-queue';
  }
  
  // Timeout errors → increase timeout configuration
  if (
    errorName.includes('timeout') ||
    message.includes('timeout') ||
    message.includes('timed out')
  ) {
    return 'increase-timeout';
  }
  
  // Cache corruption → rebuild cache
  if (
    category === 'CACHE' &&
    (errorName.includes('corruption') ||
     message.includes('corrupt') ||
     message.includes('invalid cache'))
  ) {
    return 'rebuild-cache';
  }
  
  // Worker crashes → restart worker
  if (
    category === 'WORKER' &&
    (errorName.includes('crash') ||
     message.includes('worker failed') ||
     message.includes('worker stopped'))
  ) {
    return 'restart-worker';
  }
  
  // State corruption → clear corrupted state
  if (
    message.includes('invalid state') ||
    message.includes('state corruption') ||
    message.includes('corrupted state')
  ) {
    return 'clear-corrupted-state';
  }
  
  // Network errors → retry with exponential backoff
  if (
    category === 'NETWORK' ||
    errorName.includes('network') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  ) {
    return 'exponential-backoff-retry';
  }
  
  // No applicable recovery strategy
  return 'no-recovery-available';
}

/// ---- Recovery Strategy Implementations ----

/**
 * Strategy: Exponential Backoff Retry
 * Used for: Network errors, transient failures
 */
async function recoverWithExponentialBackoff(
  error: ErrorLog,
  attempt: RecoveryAttempt,
  config: RecoveryConfig
): Promise<boolean> {
  const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } = config;
  
  if (attempt.attemptNumber > maxRetries) {
    log('warn', 'error-recovery: Max retries exceeded for exponential backoff', {
      fingerprint: error.fingerprint,
      attempts: attempt.attemptNumber,
    });
    return false;
  }
  
  // Calculate delay with exponential backoff
  const delay = Math.min(
    baseDelayMs * Math.pow(backoffMultiplier, attempt.attemptNumber - 1),
    maxDelayMs
  );
  
  log('info', 'error-recovery: Waiting before retry', {
    fingerprint: error.fingerprint,
    delayMs: delay,
    attemptNumber: attempt.attemptNumber,
  });
  
  await sleep(delay);
  
  attempt.metadata = { delayMs: delay, maxRetries };
  
  // Recovery is "successful" if we completed the backoff
  // Actual operation retry happens at caller level
  return true;
}

/**
 * Strategy: Rate Limit Queue
 * Used for: Discord API 429 errors, rate limit violations
 */
async function recoverWithRateLimitQueue(
  error: ErrorLog,
  attempt: RecoveryAttempt
): Promise<boolean> {
  // Add operation to queue (actual operation would be provided by caller)
  const queuedOperation = {
    fn: async () => {
      log('info', 'error-recovery: Executing queued operation', {
        fingerprint: error.fingerprint,
      });
      // Placeholder - actual operation retry would happen here
      return true;
    },
    addedAt: new Date(),
  };
  
  recoveryState.rateLimitQueue.push(queuedOperation);
  
  log('info', 'error-recovery: Operation queued for rate limit', {
    fingerprint: error.fingerprint,
    queueLength: recoveryState.rateLimitQueue.length,
  });
  
  attempt.metadata = {
    queueLength: recoveryState.rateLimitQueue.length,
    queuedAt: queuedOperation.addedAt.toISOString(),
  };
  
  // Start queue processor if not already running
  processRateLimitQueue();
  
  return true;
}

/**
 * Strategy: Increase Timeout
 * Used for: Timeout errors, slow operations
 */
async function recoverWithTimeoutIncrease(
  error: ErrorLog,
  attempt: RecoveryAttempt,
  config: RecoveryConfig
): Promise<boolean> {
  const { timeoutIncreaseMs } = config;
  
  // Extract current timeout from context if available
  const contextData = error.contextData as any;
  const currentTimeout = contextData?.timeout || contextData?.timeoutMs || 5000;
  const newTimeout = currentTimeout + timeoutIncreaseMs;
  
  log('info', 'error-recovery: Increasing timeout', {
    fingerprint: error.fingerprint,
    currentTimeout,
    newTimeout,
  });
  
  attempt.metadata = {
    oldTimeout: currentTimeout,
    newTimeout,
    increaseMs: timeoutIncreaseMs,
  };
  
  // TODO: Persist timeout increase to configuration
  // This would require updating the config store or database
  // For now, we just log the recommendation
  
  return true;
}

/**
 * Strategy: Rebuild Cache
 * Used for: Cache corruption, invalid cache data
 */
async function recoverWithCacheRebuild(
  error: ErrorLog,
  attempt: RecoveryAttempt
): Promise<boolean> {
  const contextData = error.contextData as any;
  const cacheKey = contextData?.cacheKey || contextData?.key;
  
  if (!cacheKey) {
    log('warn', 'error-recovery: Cannot rebuild cache, no cache key in context', {
      fingerprint: error.fingerprint,
    });
    return false;
  }
  
  log('info', 'error-recovery: Rebuilding cache', {
    fingerprint: error.fingerprint,
    cacheKey,
  });
  
  try {
    // Import cache facade dynamically to avoid circular dependencies
    const cacheModule = await import('./cache/facade.js');
    
    // Clear corrupted cache namespace (if method exists)
    if (typeof cacheModule.runCacheMaintenanceNow === 'function') {
      await cacheModule.runCacheMaintenanceNow('manual');
    }
    
    log('info', 'error-recovery: Cache maintenance triggered', {
      fingerprint: error.fingerprint,
      cacheKey,
    });
    
    attempt.metadata = { cacheKey, action: 'maintenance-triggered' };
    return true;
  } catch (err) {
    log('error', 'error-recovery: Failed to clear cache', {
      fingerprint: error.fingerprint,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Strategy: Restart Worker
 * Used for: Worker crashes, worker hangs
 */
async function recoverWithWorkerRestart(
  error: ErrorLog,
  attempt: RecoveryAttempt,
  config: RecoveryConfig
): Promise<boolean> {
  const contextData = error.contextData as any;
  const workerName = contextData?.workerName || contextData?.service || 'unknown';
  
  // Track restart attempts per worker
  const restartCount = recoveryState.workerRestartCounts.get(workerName) || 0;
  
  if (restartCount >= config.workerRestartMaxAttempts) {
    log('warn', 'error-recovery: Max worker restart attempts exceeded', {
      fingerprint: error.fingerprint,
      workerName,
      restartCount,
    });
    return false;
  }
  
  recoveryState.workerRestartCounts.set(workerName, restartCount + 1);
  
  log('info', 'error-recovery: Restarting worker', {
    fingerprint: error.fingerprint,
    workerName,
    restartAttempt: restartCount + 1,
  });
  
  // TODO: Implement actual worker restart logic
  // This would require integration with worker management system
  // For now, we just log the recommendation
  
  attempt.metadata = {
    workerName,
    restartAttempt: restartCount + 1,
    maxAttempts: config.workerRestartMaxAttempts,
  };
  
  return true;
}

/**
 * Strategy: Reconnect Database
 * Used for: Database connection failures, connection pool exhaustion
 */
async function recoverWithDatabaseReconnect(
  error: ErrorLog,
  attempt: RecoveryAttempt,
  config: RecoveryConfig
): Promise<boolean> {
  log('info', 'error-recovery: Attempting database reconnection', {
    fingerprint: error.fingerprint,
  });
  
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    
    log('info', 'error-recovery: Database connection restored', {
      fingerprint: error.fingerprint,
    });
    
    attempt.metadata = { action: 'connection-test-passed' };
    return true;
  } catch (err) {
    log('error', 'error-recovery: Database reconnection failed', {
      fingerprint: error.fingerprint,
      error: err instanceof Error ? err.message : String(err),
    });
    
    // Apply exponential backoff before next retry
    await recoverWithExponentialBackoff(error, attempt, config);
    
    return false;
  }
}

/**
 * Strategy: Clear Corrupted State
 * Used for: State corruption, invalid state errors
 */
async function recoverWithStateClear(
  error: ErrorLog,
  attempt: RecoveryAttempt
): Promise<boolean> {
  const contextData = error.contextData as any;
  const stateKey = contextData?.stateKey || contextData?.userId || contextData?.battleId;
  
  if (!stateKey) {
    log('warn', 'error-recovery: Cannot clear state, no state key in context', {
      fingerprint: error.fingerprint,
    });
    return false;
  }
  
  log('info', 'error-recovery: Clearing corrupted state', {
    fingerprint: error.fingerprint,
    stateKey,
  });
  
  // TODO: Implement state clearing logic
  // This would require integration with state management system
  // For now, we just log the recommendation
  
  attempt.metadata = { stateKey, action: 'clear-recommended' };
  return true;
}

/// ---- Helper Functions ----

/**
 * Update error log with recovery attempt statistics
 */
async function updateRecoveryStats(
  error: ErrorLog,
  attempt: RecoveryAttempt
): Promise<void> {
  try {
    await prisma.errorLog.update({
      where: { errorId: error.errorId },
      data: {
        recoveryAttempted: (error.recoveryAttempted || 0) + 1,
        recoverySuccess: attempt.success
          ? (error.recoverySuccess || 0) + 1
          : error.recoverySuccess,
        learningMetadata: {
          ...(error.learningMetadata as any),
          lastRecoveryAttempt: {
            strategy: attempt.strategy,
            success: attempt.success,
            attemptNumber: attempt.attemptNumber,
            timestamp: attempt.completedAt?.toISOString() || new Date().toISOString(),
            metadata: attempt.metadata,
          },
        },
      },
    });
  } catch (err) {
    log('error', 'error-recovery: Failed to update recovery stats', {
      errorId: error.errorId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Process rate limit queue with delays
 */
async function processRateLimitQueue(): Promise<void> {
  if (recoveryState.rateLimitQueue.length === 0) return;
  
  // Process one operation at a time with 1-second delay between operations
  const operation = recoveryState.rateLimitQueue.shift();
  if (!operation) return;
  
  try {
    await operation.fn();
  } catch (err) {
    log('error', 'error-recovery: Queued operation failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  
  // Schedule next operation processing
  if (recoveryState.rateLimitQueue.length > 0) {
    setTimeout(() => processRateLimitQueue(), 1000);
  }
}

/**
 * Sleep helper for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
