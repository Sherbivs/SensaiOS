/**
 * Loki Flush Worker
 * =================
 *
 * Drains queue and pushes batches to Loki.
 * Respects circuit breaker state.
 *
 * Interval: 5 seconds (configurable)
 * Batch size: 100 entries (configurable)
 *
 * @module observability/backends/loki/loki-flush-worker
 * @since 2025-12-20
 */
/* eslint-disable no-console */

import type { LokiQueue } from './loki-queue.js';
import type { LokiCircuitBreaker } from './loki-circuit-breaker.js';
import type { LokiHttpTransport } from './loki-http-transport.js';

// ============================================================================
// Flush Worker Class
// ============================================================================

/**
 * Worker that periodically flushes queue to Loki.
 */
export class LokiFlushWorker {
  readonly name = 'loki-flush';

  /** Interval handle */
  private intervalId: NodeJS.Timeout | null = null;

  /** Running state */
  private running = false;

  /** Tick counter */
  private tickCount = 0;

  /** Last tick timestamp */
  private lastTickAt: Date | null = null;

  /** Last error (for diagnostics) */
  private lastError: Error | null = null;

  /**
   * Create a new flush worker.
   */
  constructor(
    private readonly queue: LokiQueue,
    private readonly transport: LokiHttpTransport,
    private readonly circuitBreaker: LokiCircuitBreaker,
    private readonly intervalMs = 5_000,
    private readonly batchSize = 100
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
    console.info(`[LokiFlushWorker] Started (interval: ${this.intervalMs}ms, batch: ${this.batchSize})`);
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
    console.info('[LokiFlushWorker] Stopped');
  }

  // --------------------------------------------------------------------------
  // Tick
  // --------------------------------------------------------------------------

  /**
   * Perform a flush tick.
   * @private
   */
  private async tick(): Promise<void> {
    this.tickCount++;
    this.lastTickAt = new Date();

    // Skip if circuit is open
    if (!this.circuitBreaker.allowRequest()) {
      return;
    }

    // Skip if queue is empty
    if (this.queue.isEmpty()) {
      return;
    }

    // Drain batch
    const entries = this.queue.drain(this.batchSize);
    if (entries.length === 0) return;

    // Push to Loki
    try {
      await this.transport.push(entries);
      this.circuitBreaker.recordSuccess();
      this.lastError = null;
    } catch (error) {
      this.circuitBreaker.recordFailure();
      this.lastError = error instanceof Error ? error : new Error(String(error));
      console.error('[LokiFlushWorker] Push failed:', this.lastError.message);

      // Note: entries are lost on failure (by design — no retry/requeue)
      // This is acceptable for observability data
    }
  }

  // --------------------------------------------------------------------------
  // Emergency Flush
  // --------------------------------------------------------------------------

  /**
   * Emergency flush (for shutdown).
   * Attempts to flush all remaining entries.
   */
  async emergencyFlush(): Promise<void> {
    if (this.queue.isEmpty()) return;

    console.info('[LokiFlushWorker] Emergency flush starting...');

    const entries = this.queue.drainAll();
    if (entries.length === 0) return;

    try {
      await this.transport.push(entries);
      console.info(`[LokiFlushWorker] Emergency flush complete: ${entries.length} entries`);
    } catch (error) {
      console.error('[LokiFlushWorker] Emergency flush failed:', error);
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
      lastError: this.lastError?.message ?? null,
    };
  }
}
