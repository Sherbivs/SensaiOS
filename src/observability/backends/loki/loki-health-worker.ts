/**
 * Loki Health Worker
 * ==================
 *
 * Probes Loki endpoint for circuit breaker recovery.
 * Only active when circuit is OPEN (waiting for reset timeout).
 *
 * Interval: 60 seconds (configurable)
 *
 * @module observability/backends/loki/loki-health-worker
 * @since 2025-12-20
 */
/* eslint-disable no-console */

import type { LokiCircuitBreaker } from './loki-circuit-breaker.js';
import type { LokiHttpTransport } from './loki-http-transport.js';

// ============================================================================
// Health Worker Class
// ============================================================================

/**
 * Worker that periodically probes Loki for circuit recovery.
 */
export class LokiHealthWorker {
  readonly name = 'loki-health';

  /** Interval handle */
  private intervalId: NodeJS.Timeout | null = null;

  /** Running state */
  private running = false;

  /** Tick counter */
  private tickCount = 0;

  /** Last tick timestamp */
  private lastTickAt: Date | null = null;

  /** Last health check result */
  private lastHealthy: boolean | null = null;

  /**
   * Create a new health worker.
   */
  constructor(
    private readonly transport: LokiHttpTransport,
    private readonly circuitBreaker: LokiCircuitBreaker,
    private readonly intervalMs = 60_000
  ) {}

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start the worker.
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.intervalId = setInterval(() => this.tick(), this.intervalMs);
    console.info(`[LokiHealthWorker] Started (interval: ${this.intervalMs}ms)`);
  }

  /**
   * Stop the worker.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    console.info('[LokiHealthWorker] Stopped');
  }

  // --------------------------------------------------------------------------
  // Tick
  // --------------------------------------------------------------------------

  /**
   * Perform a health check tick.
   * @private
   */
  private async tick(): Promise<void> {
    this.tickCount++;
    this.lastTickAt = new Date();

    try {
      const healthy = await this.transport.healthCheck();
      this.lastHealthy = healthy;

      if (healthy) {
        // If circuit is open and Loki is healthy, record success to trigger HALF_OPEN
        if (this.circuitBreaker.isOpen()) {
          console.info('[LokiHealthWorker] Loki healthy, circuit may recover');
        }
      }
    } catch (error) {
      this.lastHealthy = false;
      console.warn('[LokiHealthWorker] Health check failed:', error);
    }
  }

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  /**
   * Get worker status.
   */
  getStatus() {
    return {
      running: this.running,
      tickCount: this.tickCount,
      lastTickAt: this.lastTickAt,
      lastHealthy: this.lastHealthy,
    };
  }
}
