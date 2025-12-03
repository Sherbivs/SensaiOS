/* eslint-disable no-console */
/**
 * Metrics Collector — Worker Performance Telemetry
 * 
 * Purpose:
 * - Collect health metrics from all database workers periodically
 * - Store in worker_metrics table for monitoring and analytics
 * - Provide real-time health dashboard data
 * 
 * Architecture:
 * - Runs on configurable interval (default 15 seconds)
 * - Non-blocking collection (errors in one worker don't block others)
 * - Graceful shutdown with final metrics flush
 * 
 * Integration:
 * - Start after WorkerManager initializes all workers
 * - Stop before workers shutdown
 * 
 * @module shared/metrics-collector
 */

// ============================================================================
// Types
// ============================================================================

interface WorkerMetricsEntry {
  workerId: string;
  workerName: string;
  operationCount: bigint;
  successCount: bigint;
  failureCount: bigint;
  avgLatencyMs: number | null;
  peakLatencyMs: number | null;
  throughput: number | null;
  bufferSize: number | null;
  bufferUtilizationPct: number | null;
  flushCount: number | null;
  backpressureEvents: number | null;
  memoryUsedBytes: bigint | null;
  cpuPercent: number | null;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | null;
  lastError: string | null;
}

interface CollectionStats {
  isRunning: boolean;
  collectionCount: number;
  lastCollectionAt: Date | null;
  errorCount: number;
  lastError: string | null;
  intervalMs: number;
  workersTracked: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_INTERVAL_MS = 15000; // 15 seconds
const COLLECTION_TIMEOUT_MS = 5000; // 5 second timeout per worker

// ============================================================================
// State
// ============================================================================

let collectionTimer: NodeJS.Timeout | null = null;
let isCollecting = false;
let intervalMs = DEFAULT_INTERVAL_MS;

// Statistics tracking
let collectionCount = 0;
let lastCollectionAt: Date | null = null;
let errorCount = 0;
let lastError: string | null = null;
let workersTracked: string[] = [];

// ============================================================================
// Collection Logic
// ============================================================================

/**
 * Collect metrics from a single worker with timeout
 */
async function collectWorkerMetrics(
  workerId: string,
  worker: unknown
): Promise<WorkerMetricsEntry | null> {
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), COLLECTION_TIMEOUT_MS);
  });

  try {
    const collectionPromise = (async (): Promise<WorkerMetricsEntry | null> => {
      // Check if worker has required methods
      if (typeof (worker as Record<string, unknown>).healthCheck !== 'function') {
        return null;
      }

      const typedWorker = worker as {
        name?: string;
        healthCheck: () => Promise<{
          status: 'healthy' | 'degraded' | 'unhealthy';
          latencyMs: number;
          errorCount: number;
          lastError: string | null;
          uptimeMs: number;
          details: Record<string, unknown>;
        }>;
        getBufferStats?: () => {
          entryCount: number;
          utilizationPercent: number;
          flushCount: number;
          backpressureEventCount?: number;
        };
        getMetrics?: () => {
          operationCount: number;
          successCount: number;
          failureCount: number;
          avgLatencyMs: number;
          peakLatencyMs: number;
          throughput: number;
        };
      };

      const health = await typedWorker.healthCheck();
      const bufferStats = typedWorker.getBufferStats?.();
      const metrics = typedWorker.getMetrics?.();

      return {
        workerId,
        workerName: typedWorker.name || workerId,
        operationCount: BigInt(metrics?.operationCount ?? (health.details.operationCount as number) ?? 0),
        successCount: BigInt(metrics?.successCount ?? (health.details.successCount as number) ?? 0),
        failureCount: BigInt(health.errorCount),
        avgLatencyMs: metrics?.avgLatencyMs ?? health.latencyMs ?? null,
        peakLatencyMs: metrics?.peakLatencyMs ?? (health.details.peakLatencyMs as number | undefined) ?? null,
        throughput: metrics?.throughput ?? (health.details.throughput as number | undefined) ?? null,
        bufferSize: bufferStats?.entryCount ?? null,
        bufferUtilizationPct: bufferStats?.utilizationPercent ?? null,
        flushCount: bufferStats?.flushCount ?? null,
        backpressureEvents: bufferStats?.backpressureEventCount ?? null,
        memoryUsedBytes: null, // TODO: Add memory tracking per worker
        cpuPercent: null, // TODO: Add CPU tracking
        healthStatus: health.status,
        lastError: health.lastError,
      };
    })();

    return await Promise.race([collectionPromise, timeoutPromise]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      workerId,
      workerName: workerId,
      operationCount: BigInt(0),
      successCount: BigInt(0),
      failureCount: BigInt(0),
      avgLatencyMs: null,
      peakLatencyMs: null,
      throughput: null,
      bufferSize: null,
      bufferUtilizationPct: null,
      flushCount: null,
      backpressureEvents: null,
      memoryUsedBytes: null,
      cpuPercent: null,
      healthStatus: 'unhealthy',
      lastError: `Collection failed: ${errorMessage}`,
    };
  }
}

/**
 * Collect metrics from all workers and store in database
 */
async function collectAndStoreMetrics(): Promise<void> {
  if (isCollecting) {
    // Previous collection still running, skip
    return;
  }

  isCollecting = true;
  const startTime = Date.now();

  try {
    // Lazy-load WorkerManager and TimescaleDB worker
    const { getWorkerManager } = await import('../workers/worker-manager.js');
    const { getTimescaleDBWorker } = await import('../workers/database/index.js');

    const manager = getWorkerManager();
    const tsWorker = getTimescaleDBWorker();

    // Get all registered workers
    const workers = manager.getWorkers();
    workersTracked = Object.keys(workers);

    // Collect metrics from each worker in parallel
    const metricsPromises = Object.entries(workers).map(
      ([workerId, worker]) => collectWorkerMetrics(workerId, worker)
    );

    const metricsResults = await Promise.all(metricsPromises);

    // Store non-null results in database
    for (const metrics of metricsResults) {
      if (metrics) {
        try {
          await tsWorker.insert('workerMetrics', {
            workerId: metrics.workerId,
            workerName: metrics.workerName,
            operationCount: metrics.operationCount,
            successCount: metrics.successCount,
            failureCount: metrics.failureCount,
            avgLatencyMs: metrics.avgLatencyMs,
            peakLatencyMs: metrics.peakLatencyMs,
            throughput: metrics.throughput,
            bufferSize: metrics.bufferSize,
            bufferUtilizationPct: metrics.bufferUtilizationPct,
            flushCount: metrics.flushCount,
            backpressureEvents: metrics.backpressureEvents,
            memoryUsedBytes: metrics.memoryUsedBytes,
            cpuPercent: metrics.cpuPercent,
            healthStatus: metrics.healthStatus,
            lastError: metrics.lastError,
          });
        } catch (insertError) {
          // Log but don't fail entire collection
          const msg = insertError instanceof Error ? insertError.message : String(insertError);
          console.error(`[MetricsCollector] Failed to store metrics for ${metrics.workerId}:`, msg);
        }
      }
    }

    collectionCount++;
    lastCollectionAt = new Date();

    const duration = Date.now() - startTime;
    if (duration > intervalMs / 2) {
      console.warn(`[MetricsCollector] Slow collection: ${duration}ms (interval: ${intervalMs}ms)`);
    }
  } catch (error) {
    errorCount++;
    lastError = error instanceof Error ? error.message : String(error);
    console.error('[MetricsCollector] Collection failed:', lastError);
  } finally {
    isCollecting = false;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start metrics collection
 * 
 * @param options.intervalMs - Collection interval in milliseconds (default 15000)
 */
export function startMetricsCollection(options?: { intervalMs?: number }): void {
  if (collectionTimer) {
    console.warn('[MetricsCollector] Already running');
    return;
  }

  intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;

  // Initial collection after short delay
  setTimeout(() => {
    void collectAndStoreMetrics();
  }, 1000);

  // Start periodic collection
  collectionTimer = setInterval(() => {
    void collectAndStoreMetrics();
  }, intervalMs);

  console.log(`[MetricsCollector] Started (interval: ${intervalMs}ms)`);
}

/**
 * Stop metrics collection
 */
export async function stopMetricsCollection(): Promise<void> {
  if (!collectionTimer) {
    return;
  }

  clearInterval(collectionTimer);
  collectionTimer = null;

  // Wait for any in-progress collection
  let waitCount = 0;
  while (isCollecting && waitCount < 10) {
    await new Promise(resolve => setTimeout(resolve, 500));
    waitCount++;
  }

  console.log('[MetricsCollector] Stopped');
}

/**
 * Force immediate metrics collection
 */
export async function forceCollect(): Promise<void> {
  await collectAndStoreMetrics();
}

/**
 * Get collection statistics
 */
export function getCollectionStats(): CollectionStats {
  return {
    isRunning: collectionTimer !== null,
    collectionCount,
    lastCollectionAt,
    errorCount,
    lastError,
    intervalMs,
    workersTracked,
  };
}

/**
 * Set collection interval (requires restart)
 */
export function setCollectionInterval(newIntervalMs: number): void {
  intervalMs = newIntervalMs;
  
  if (collectionTimer) {
    // Restart with new interval
    clearInterval(collectionTimer);
    collectionTimer = setInterval(() => {
      void collectAndStoreMetrics();
    }, intervalMs);
    
    console.log(`[MetricsCollector] Interval updated to ${intervalMs}ms`);
  }
}

/**
 * Reset statistics (for testing)
 */
export function resetStats(): void {
  collectionCount = 0;
  lastCollectionAt = null;
  errorCount = 0;
  lastError = null;
  workersTracked = [];
}

// Export types
export type { CollectionStats };
