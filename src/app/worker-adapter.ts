/**
 * Worker Adapter — Application Layer Facade for Background Workers
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ISOLATES WORKERS FROM DIRECT KERNEL IMPORTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides application-level abstractions for worker systems.
 * Workers are background processes that run independently of the Discord bot.
 * 
 * WORKER TYPES:
 * - **Engine Workers** — Cache refresh, buffer flush, DB sync, validation
 * - **Service Workers** — Outbox delivery, cache maintenance, data pipeline
 * - **Scheduled Workers** — Cron jobs, periodic tasks
 * 
 * @module app/worker-adapter
 * @since 2025-12-30
 */

// ============================================================================
// WORKER HOOKS RE-EXPORT
// ============================================================================

export {
  createWorkerHook,
  type WorkerHook,
} from '../kernel/kernel-hooks.js';

// ============================================================================
// WORKER TRACE HELPERS
// ============================================================================

export {
  startWorkerTrace,
  startWorkerTraceAsync,
  generateCorrelationId,
  getCurrentCorrelationId,
} from '../kernel/correlation.js';

// ============================================================================
// WORKER LOGGING
// ============================================================================

import { kernel } from '../kernel/boot-kernel.js';
import { getCurrentCorrelationId } from '../kernel/correlation.js';

/**
 * Worker-specific logging facade
 * 
 * Automatically attaches correlation ID and worker context.
 * 
 * @example
 * ```typescript
 * import { workerLog } from '../app/worker-adapter.js';
 * 
 * workerLog.info('cache-refresh', 'Starting cache refresh', { entries: 100 });
 * workerLog.error('cache-refresh', 'Refresh failed', { error: err.message });
 * ```
 */
export const workerLog = {
  /**
   * Debug-level log (development only)
   */
  debug: (worker: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.debug(worker, message, { ...data, correlationId, workerContext: true });
  },

  /**
   * Info-level log (normal operations)
   */
  info: (worker: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.info(worker, message, { ...data, correlationId, workerContext: true });
  },

  /**
   * Warning-level log (potential issues)
   */
  warn: (worker: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.warn(worker, message, { ...data, correlationId, workerContext: true });
  },

  /**
   * Error-level log (failures)
   */
  error: (worker: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.error(worker, message, { ...data, correlationId, workerContext: true });
  },
};

// ============================================================================
// WORKER EXECUTION WRAPPER
// ============================================================================

import { startWorkerTraceAsync } from '../kernel/correlation.js';

/**
 * Options for worker execution
 */
export interface WorkerExecutionOptions {
  /** Worker name */
  workerName: string;
  /** Optional job ID */
  jobId?: string;
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
}

/**
 * Wrap worker execution with tracing and error handling
 * 
 * @example
 * ```typescript
 * await executeWorker(
 *   { workerName: 'cache-refresh', jobId: 'job-123' },
 *   async () => {
 *     workerLog.info('cache-refresh', 'Starting refresh');
 *     await refreshCache();
 *   }
 * );
 * ```
 */
export async function executeWorker<T>(
  options: WorkerExecutionOptions,
  callback: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  
  return startWorkerTraceAsync(
    options.workerName,
    options.jobId,
    async () => {
      try {
        workerLog.info(options.workerName, 'Worker execution started');
        const result = await callback();
        const durationMs = Date.now() - startTime;
        workerLog.info(options.workerName, 'Worker execution completed', { durationMs });
        return result;
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const message = error instanceof Error ? error.message : String(error);
        workerLog.error(options.workerName, 'Worker execution failed', { 
          durationMs, 
          error: message,
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw error;
      }
    }
  );
}
