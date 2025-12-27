/**
 * Loki Backend
 * ============
 *
 * Loki observability backend implementing IObservabilityBackend.
 * Converts ObservabilityEvent → LokiLogEntry and manages Loki-specific
 * infrastructure (queue, circuit breaker, workers).
 *
 * @module observability/backends/loki/loki-backend
 * @since 2025-12-20
 */

// KERNEL FIRST — Must be first import to monitor other system initialization
import {
  createObservabilityHook,
  type ObservabilityHook,
} from '../../../kernel/kernel-hooks.js';

import { scopedLogger } from '../../envelope/console.js';

import type {
  IObservabilityBackend,
  ObservabilityEvent,
  BackendStatus,
} from '../../hub/observability-types.js';
import type { LokiLogEntry, LokiBackendStatus } from './loki-types.js';
import { LOKI_CONFIG, isLokiEnabled, hasLokiEndpoint } from './loki-config.js';
import { LokiQueue } from './loki-queue.js';
import { LokiCircuitBreaker } from './loki-circuit-breaker.js';
import { LokiHttpTransport } from './loki-http-transport.js';
import { LokiFlushWorker } from './loki-flush-worker.js';
import { LokiHealthWorker } from './loki-health-worker.js';

// ==================== KERNEL INTEGRATION ====================

/** Lazy-initialized kernel hook for Loki backend */
let kernelHook: ObservabilityHook | null = null;

/**
 * Get or create kernel hook for Loki backend observability.
 * Uses lazy initialization to avoid startup dependencies.
 */
function getLokiKernelHook(): ObservabilityHook | null {
  if (!kernelHook) {
    try {
      kernelHook = createObservabilityHook('loki-backend');
    } catch {
      // Kernel not available, silently skip
    }
  }
  return kernelHook;
}

/** Scoped logger for Loki backend */
const log = scopedLogger('loki-backend');

// ============================================================================
// Loki Backend Class
// ============================================================================

/**
 * Loki backend implementing IObservabilityBackend.
 * Converts ObservabilityEvent → LokiLogEntry and manages Loki infrastructure.
 */
export class LokiBackend implements IObservabilityBackend {
  readonly name = 'loki';
  enabled = true;

  /** Queue for pending entries */
  private queue: LokiQueue | null = null;

  /** Circuit breaker for endpoint protection */
  private circuitBreaker: LokiCircuitBreaker | null = null;

  /** HTTP transport for Loki API */
  private transport: LokiHttpTransport | null = null;

  /** Flush worker (drains queue periodically) */
  private flushWorker: LokiFlushWorker | null = null;

  /** Health worker (probes endpoint for recovery) */
  private healthWorker: LokiHealthWorker | null = null;
  
  /** Event counter for kernel sampling */
  private receiveCount = 0;

  // --------------------------------------------------------------------------
  // IObservabilityBackend: receive
  // --------------------------------------------------------------------------

  /**
   * Receive event from Hub (fire-and-forget).
   * Converts to LokiLogEntry and queues for flush.
   */
  receive(event: ObservabilityEvent): void {
    if (!this.queue || !this.enabled) return;

    // Convert to Loki entry
    const lokiEntry: LokiLogEntry = {
      timestamp: event.timestamp,
      level: event.level,
      service: event.service,
      topic: event.topic,
      message: event.topic, // Topic as message, data has details
      data: {
        ...event.payload,
        ...(event.correlationId && { correlationId: event.correlationId }),
        ...(event.parentCorrelationId && { parentCorrelationId: event.parentCorrelationId }),
      },
    };

    // Fire-and-forget enqueue (never blocks)
    this.queue.push(lokiEntry);
    this.receiveCount++;
    
    // Report queue state to kernel (sample: every 200th event)
    if (this.receiveCount % 200 === 0) {
      try {
        const stats = this.queue.getStats();
        const backpressure = stats.backpressureLevel === 'CRITICAL' || stats.backpressureLevel === 'FULL' ? 'critical' 
          : stats.backpressureLevel === 'WARNING' ? 'warn' 
          : 'normal';
        getLokiKernelHook()?.queue(stats.depth, stats.capacity, backpressure, {
          droppedTotal: stats.droppedTotal,
          sampledTotal: stats.sampledTotal,
        });
      } catch {
        // Kernel failure should never affect Loki operation
      }
    }
  }

  // --------------------------------------------------------------------------
  // IObservabilityBackend: start
  // --------------------------------------------------------------------------

  /**
   * Start Loki backend workers.
   */
  async start(): Promise<void> {
    // Check master switch
    if (!isLokiEnabled()) {
      log.info('start', 'Disabled via LOKI_ENABLED=false');
      this.enabled = false;
      return;
    }

    // Check endpoint configuration
    if (!hasLokiEndpoint()) {
      log.warn('start', 'No LOKI_ENDPOINT configured, disabling');
      this.enabled = false;
      return;
    }

    // Initialize components
    this.queue = new LokiQueue(LOKI_CONFIG.queueMaxSize);
    this.circuitBreaker = new LokiCircuitBreaker(
      LOKI_CONFIG.circuitBreaker.failureThreshold,
      LOKI_CONFIG.circuitBreaker.resetTimeMs
    );
    this.transport = new LokiHttpTransport({
      endpoint: LOKI_CONFIG.endpoint,
      timeoutMs: LOKI_CONFIG.timeoutMs,
    });

    // Start workers
    this.flushWorker = new LokiFlushWorker(
      this.queue,
      this.transport,
      this.circuitBreaker,
      LOKI_CONFIG.flushIntervalMs,
      LOKI_CONFIG.batchSize
    );
    this.healthWorker = new LokiHealthWorker(
      this.transport,
      this.circuitBreaker,
      LOKI_CONFIG.healthIntervalMs
    );

    this.flushWorker.start();
    this.healthWorker.start();

    log.info('start', 'Started', { endpoint: LOKI_CONFIG.endpoint });
    
    // Report lifecycle to kernel
    try {
      getLokiKernelHook()?.lifecycle('start', { 
        endpoint: LOKI_CONFIG.endpoint,
        batchSize: LOKI_CONFIG.batchSize,
        queueMaxSize: LOKI_CONFIG.queueMaxSize,
      });
    } catch {
      // Kernel failure should never affect Loki operation
    }
  }

  // --------------------------------------------------------------------------
  // IObservabilityBackend: stop
  // --------------------------------------------------------------------------

  /**
   * Stop Loki backend gracefully.
   */
  async stop(): Promise<void> {
    // Stop workers
    this.flushWorker?.stop();
    this.healthWorker?.stop();

    // Emergency flush attempt
    if (this.flushWorker && this.queue && !this.queue.isEmpty()) {
      await this.flushWorker.emergencyFlush();
    }

    log.info('stop', 'Stopped');
    
    // Report lifecycle to kernel
    try {
      const queueStats = this.queue?.getStats();
      getLokiKernelHook()?.lifecycle('stop', { 
        queueDepth: queueStats?.depth ?? 0,
        droppedTotal: queueStats?.droppedTotal ?? 0,
      });
    } catch {
      // Kernel failure should never affect Loki operation
    }
  }

  // --------------------------------------------------------------------------
  // IObservabilityBackend: getStatus
  // --------------------------------------------------------------------------

  /**
   * Get backend health status (simple form for Hub).
   */
  getStatus(): BackendStatus {
    const isHealthy = this.circuitBreaker?.getState() !== 'OPEN';

    return {
      healthy: this.enabled && isHealthy,
      message: this.enabled
        ? (isHealthy ? 'Loki backend operational' : 'Circuit breaker OPEN')
        : 'Loki backend disabled',
      details: {
        endpoint: LOKI_CONFIG.endpoint,
        circuitState: this.circuitBreaker?.getState() ?? 'N/A',
        queueDepth: this.queue?.depth ?? 0,
      },
    };
  }

  // --------------------------------------------------------------------------
  // Extended Status
  // --------------------------------------------------------------------------

  /**
   * Get detailed backend status (for /ops command).
   */
  getDetailedStatus(): LokiBackendStatus {
    return {
      enabled: this.enabled,
      endpoint: LOKI_CONFIG.endpoint,
      queue: this.queue?.getStats() ?? {
        depth: 0,
        capacity: LOKI_CONFIG.queueMaxSize,
        backpressureLevel: 'NORMAL',
        droppedTotal: 0,
        sampledTotal: 0,
      },
      circuitBreaker: this.circuitBreaker?.getStats() ?? {
        state: 'CLOSED',
        failures: 0,
        threshold: LOKI_CONFIG.circuitBreaker.failureThreshold,
        resetTimeMs: LOKI_CONFIG.circuitBreaker.resetTimeMs,
        lastTransition: null,
      },
      flushWorker: this.flushWorker?.getStatus() ?? {
        running: false,
        tickCount: 0,
        lastTickAt: null,
      },
      healthWorker: this.healthWorker?.getStatus() ?? {
        running: false,
        tickCount: 0,
        lastTickAt: null,
      },
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Singleton Loki backend instance.
 */
export const lokiBackend = new LokiBackend();
