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
/* eslint-disable no-console */

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
      console.info('[LokiBackend] Disabled via LOKI_ENABLED=false');
      this.enabled = false;
      return;
    }

    // Check endpoint configuration
    if (!hasLokiEndpoint()) {
      console.warn('[LokiBackend] No LOKI_ENDPOINT configured, disabling');
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

    console.info(`[LokiBackend] Started (endpoint: ${LOKI_CONFIG.endpoint})`);
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

    console.info('[LokiBackend] Stopped');
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
