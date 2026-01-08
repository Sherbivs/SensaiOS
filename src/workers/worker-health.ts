/**
 * Worker Health Monitoring — Heartbeat & Liveness Probes (v1.1.2 Enhancement)
 *
 * Implements the OS Architecture Review recommendation for worker supervision:
 * - Heartbeat pattern for all workers
 * - Liveness probes with configurable thresholds
 * - Dead worker detection and restart signaling
 * - Health metrics aggregation
 *
 * @module workers/worker-health
 * @since 2026-01-06
 */

import { scopedLogger } from '../observability/envelope/console.js';

const log = scopedLogger('worker-health');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Health status for a single worker
 */
export interface WorkerHealth {
  /** Worker identifier */
  workerId: string;

  /** Worker type/name */
  workerType: string;

  /** Last heartbeat timestamp */
  lastHeartbeat: Date;

  /** Total items processed since start */
  processedCount: number;

  /** Error count since last health check */
  errorCount: number;

  /** Average latency in milliseconds */
  avgLatencyMs: number;

  /** Current worker status */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'dead';

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Heartbeat update from a worker
 */
export interface HeartbeatUpdate {
  /** Worker identifier */
  workerId: string;

  /** Items processed in this period */
  processedInPeriod: number;

  /** Errors in this period */
  errorsInPeriod: number;

  /** Average latency for this period */
  periodLatencyMs: number;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Health monitor configuration
 */
export interface HealthMonitorConfig {
  /** Heartbeat expected interval (ms) - default 30s */
  heartbeatIntervalMs: number;

  /** Degraded threshold - no heartbeat for this long (ms) - default 60s */
  degradedThresholdMs: number;

  /** Unhealthy threshold - no heartbeat for this long (ms) - default 90s */
  unhealthyThresholdMs: number;

  /** Dead threshold - no heartbeat for this long (ms) - default 120s */
  deadThresholdMs: number;

  /** Error rate threshold for degraded status (errors per period) */
  errorRateThreshold: number;

  /** Check interval for supervisor (ms) - default 30s */
  checkIntervalMs: number;
}

/**
 * Callback for worker status changes
 */
export type StatusChangeCallback = (
  workerId: string,
  oldStatus: WorkerHealth['status'],
  newStatus: WorkerHealth['status'],
  health: WorkerHealth
) => void | Promise<void>;

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: HealthMonitorConfig = {
  heartbeatIntervalMs: 30_000, // 30 seconds
  degradedThresholdMs: 60_000, // 1 minute
  unhealthyThresholdMs: 90_000, // 1.5 minutes
  deadThresholdMs: 120_000, // 2 minutes
  errorRateThreshold: 5, // 5 errors per period
  checkIntervalMs: 30_000, // Check every 30 seconds
};

// ============================================================================
// WORKER HEALTH MONITOR
// ============================================================================

/**
 * WorkerHealthMonitor — Tracks health of all workers via heartbeats
 *
 * Usage:
 * 1. Create monitor: `const monitor = new WorkerHealthMonitor()`
 * 2. Register workers: `monitor.registerWorker('prod-postgres', 'ProdPostgresWorker')`
 * 3. Workers send heartbeats: `monitor.heartbeat({ workerId, processedInPeriod, ... })`
 * 4. Start supervisor: `monitor.startSupervisor()`
 * 5. Check health: `monitor.getHealth('prod-postgres')`
 */
export class WorkerHealthMonitor {
  /** Health state per worker */
  private readonly healthMap = new Map<string, WorkerHealth>();

  /** Configuration */
  private readonly config: HealthMonitorConfig;

  /** Supervisor interval handle */
  private supervisorInterval: ReturnType<typeof setInterval> | null = null;

  /** Status change callbacks */
  private readonly statusCallbacks: StatusChangeCallback[] = [];

  /** Monitor start time */
  private readonly startTime = Date.now();

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info('init', 'WorkerHealthMonitor initialized', {
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      deadThresholdMs: this.config.deadThresholdMs,
    });
  }

  // ==========================================================================
  // REGISTRATION
  // ==========================================================================

  /**
   * Register a worker for health monitoring
   */
  registerWorker(workerId: string, workerType: string): void {
    if (this.healthMap.has(workerId)) {
      log.warn('register', `Worker ${workerId} already registered`, { workerId });
      return;
    }

    const health: WorkerHealth = {
      workerId,
      workerType,
      lastHeartbeat: new Date(),
      processedCount: 0,
      errorCount: 0,
      avgLatencyMs: 0,
      status: 'healthy',
    };

    this.healthMap.set(workerId, health);
    log.info('register', `Worker registered: ${workerId}`, { workerId, workerType });
  }

  /**
   * Unregister a worker (e.g., on shutdown)
   */
  unregisterWorker(workerId: string): void {
    this.healthMap.delete(workerId);
    log.info('unregister', `Worker unregistered: ${workerId}`, { workerId });
  }

  // ==========================================================================
  // HEARTBEAT
  // ==========================================================================

  /**
   * Record a heartbeat from a worker
   *
   * Workers should call this periodically (every heartbeatIntervalMs).
   */
  heartbeat(update: HeartbeatUpdate): void {
    const health = this.healthMap.get(update.workerId);

    if (!health) {
      log.warn('heartbeat', `Unknown worker: ${update.workerId}`, {
        workerId: update.workerId,
      });
      return;
    }

    const oldStatus = health.status;

    // Update health metrics
    health.lastHeartbeat = new Date();
    health.processedCount += update.processedInPeriod;
    health.errorCount += update.errorsInPeriod;

    // Calculate rolling average latency (exponential moving average)
    if (health.avgLatencyMs === 0) {
      health.avgLatencyMs = update.periodLatencyMs;
    } else {
      health.avgLatencyMs = health.avgLatencyMs * 0.7 + update.periodLatencyMs * 0.3;
    }

    // Store metadata
    if (update.metadata) {
      health.metadata = { ...health.metadata, ...update.metadata };
    }

    // Evaluate status based on error rate
    if (update.errorsInPeriod >= this.config.errorRateThreshold) {
      health.status = 'degraded';
    } else {
      health.status = 'healthy';
    }

    // Notify if status changed
    if (oldStatus !== health.status) {
      this.notifyStatusChange(update.workerId, oldStatus, health.status, health);
    }

    log.debug('heartbeat', `Heartbeat: ${update.workerId}`, {
      workerId: update.workerId,
      processedCount: health.processedCount,
      status: health.status,
    });
  }

  // ==========================================================================
  // SUPERVISOR
  // ==========================================================================

  /**
   * Start the supervisor that checks for dead workers
   */
  startSupervisor(): void {
    if (this.supervisorInterval) {
      log.warn('supervisor', 'Supervisor already running');
      return;
    }

    this.supervisorInterval = setInterval(() => {
      this.checkAllWorkers();
    }, this.config.checkIntervalMs);

    log.info('supervisor', 'Health supervisor started', {
      checkIntervalMs: this.config.checkIntervalMs,
      workerCount: this.healthMap.size,
    });
  }

  /**
   * Stop the supervisor
   */
  stopSupervisor(): void {
    if (this.supervisorInterval) {
      clearInterval(this.supervisorInterval);
      this.supervisorInterval = null;
      log.info('supervisor', 'Health supervisor stopped');
    }
  }

  /**
   * Check all workers for health issues
   */
  private checkAllWorkers(): void {
    const now = Date.now();

    for (const [workerId, health] of this.healthMap) {
      const timeSinceHeartbeat = now - health.lastHeartbeat.getTime();
      const oldStatus = health.status;
      let newStatus: WorkerHealth['status'] = 'healthy';

      // Determine status based on time since last heartbeat
      if (timeSinceHeartbeat >= this.config.deadThresholdMs) {
        newStatus = 'dead';
      } else if (timeSinceHeartbeat >= this.config.unhealthyThresholdMs) {
        newStatus = 'unhealthy';
      } else if (timeSinceHeartbeat >= this.config.degradedThresholdMs) {
        newStatus = 'degraded';
      } else if (health.status === 'degraded') {
        // Keep degraded if error rate was high (don't auto-promote)
        newStatus = 'degraded';
      }

      if (oldStatus !== newStatus) {
        health.status = newStatus;
        this.notifyStatusChange(workerId, oldStatus, newStatus, health);
      }
    }
  }

  // ==========================================================================
  // CALLBACKS
  // ==========================================================================

  /**
   * Register a callback for status changes
   */
  onStatusChange(callback: StatusChangeCallback): void {
    this.statusCallbacks.push(callback);
  }

  /**
   * Notify all callbacks of a status change
   */
  private notifyStatusChange(
    workerId: string,
    oldStatus: WorkerHealth['status'],
    newStatus: WorkerHealth['status'],
    health: WorkerHealth
  ): void {
    const logLevel = newStatus === 'dead' ? 'error' : newStatus === 'unhealthy' ? 'warn' : 'info';
    log[logLevel]('status-change', `Worker ${workerId}: ${oldStatus} → ${newStatus}`, {
      workerId,
      oldStatus,
      newStatus,
      lastHeartbeat: health.lastHeartbeat.toISOString(),
    });

    for (const callback of this.statusCallbacks) {
      try {
        const result = callback(workerId, oldStatus, newStatus, health);
        if (result instanceof Promise) {
          result.catch((err) => {
            log.error('callback', `Status callback error for ${workerId}`, {
              error: (err as Error).message,
            });
          });
        }
      } catch (err) {
        log.error('callback', `Status callback error for ${workerId}`, {
          error: (err as Error).message,
        });
      }
    }
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  /**
   * Get health for a specific worker
   */
  getHealth(workerId: string): WorkerHealth | undefined {
    return this.healthMap.get(workerId);
  }

  /**
   * Get health for all workers
   */
  getAllHealth(): WorkerHealth[] {
    return Array.from(this.healthMap.values());
  }

  /**
   * Get workers by status
   */
  getWorkersByStatus(status: WorkerHealth['status']): WorkerHealth[] {
    return this.getAllHealth().filter((h) => h.status === status);
  }

  /**
   * Get dead workers (need restart)
   */
  getDeadWorkers(): WorkerHealth[] {
    return this.getWorkersByStatus('dead');
  }

  /**
   * Get aggregate health summary
   */
  getSummary(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    dead: number;
    uptimeMs: number;
    totalProcessed: number;
    totalErrors: number;
  } {
    const all = this.getAllHealth();
    return {
      total: all.length,
      healthy: all.filter((h) => h.status === 'healthy').length,
      degraded: all.filter((h) => h.status === 'degraded').length,
      unhealthy: all.filter((h) => h.status === 'unhealthy').length,
      dead: all.filter((h) => h.status === 'dead').length,
      uptimeMs: Date.now() - this.startTime,
      totalProcessed: all.reduce((sum, h) => sum + h.processedCount, 0),
      totalErrors: all.reduce((sum, h) => sum + h.errorCount, 0),
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** Global worker health monitor instance */
let globalMonitor: WorkerHealthMonitor | null = null;

/**
 * Get the global worker health monitor (creates if needed)
 */
export function getWorkerHealthMonitor(config?: Partial<HealthMonitorConfig>): WorkerHealthMonitor {
  if (!globalMonitor) {
    globalMonitor = new WorkerHealthMonitor(config);
  }
  return globalMonitor;
}

/**
 * Shutdown the global monitor
 */
export function shutdownWorkerHealthMonitor(): void {
  if (globalMonitor) {
    globalMonitor.stopSupervisor();
    globalMonitor = null;
    log.info('shutdown', 'Global worker health monitor shutdown');
  }
}
