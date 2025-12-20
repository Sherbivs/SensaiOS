/**
 * Loki Queue
 * ==========
 *
 * Bounded queue for Loki log entries with backpressure handling.
 * ISOLATED from Event Bus and application queues.
 *
 * Backpressure Levels:
 * - 0-75%: NORMAL — Accept all entries
 * - 75-95%: WARNING — Accept with internal warning
 * - 95-100%: CRITICAL — Sample at 10%, drop 90%
 * - 100%: FULL — Drop all new entries silently
 *
 * @module observability/backends/loki/loki-queue
 * @since 2025-12-20
 */

import type {
  LokiLogEntry,
  LokiQueueStats,
  BackpressureLevel,
  PushResult,
} from './loki-types.js';

// ============================================================================
// Constants
// ============================================================================

/** Threshold for WARNING backpressure (75%) */
const WARNING_THRESHOLD = 0.75;

/** Threshold for CRITICAL backpressure (95%) */
const CRITICAL_THRESHOLD = 0.95;

/** Sampling rate when in CRITICAL state (10%) */
const CRITICAL_SAMPLE_RATE = 0.1;

// ============================================================================
// Loki Queue Class
// ============================================================================

/**
 * Bounded queue with backpressure handling.
 * Entries exceeding capacity are dropped/sampled, NEVER blocking.
 */
export class LokiQueue {
  /** Internal queue storage */
  private queue: LokiLogEntry[] = [];

  /** Maximum queue size */
  private readonly maxSize: number;

  /** Total entries dropped (all-time) */
  private droppedTotal = 0;

  /** Total entries sampled (all-time) */
  private sampledTotal = 0;

  /**
   * Create a new LokiQueue.
   * @param maxSize - Maximum queue capacity (default: 10000)
   */
  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  // --------------------------------------------------------------------------
  // Push Operation
  // --------------------------------------------------------------------------

  /**
   * Push an entry to the queue.
   * Handles backpressure based on current depth.
   *
   * @param entry - Log entry to queue
   * @returns Push result indicating what happened
   */
  push(entry: LokiLogEntry): PushResult {
    const utilization = this.queue.length / this.maxSize;

    // FULL (100%) — Drop silently
    if (this.queue.length >= this.maxSize) {
      this.droppedTotal++;
      return 'DROPPED';
    }

    // CRITICAL (95-100%) — Sample at 10%
    if (utilization >= CRITICAL_THRESHOLD) {
      if (Math.random() > CRITICAL_SAMPLE_RATE) {
        this.droppedTotal++;
        return 'DROPPED';
      }
      this.sampledTotal++;
      this.queue.push(entry);
      return 'SAMPLED';
    }

    // WARNING (75-95%) — Accept with warning
    if (utilization >= WARNING_THRESHOLD) {
      this.queue.push(entry);
      return 'WARNING';
    }

    // NORMAL (0-75%) — Accept
    this.queue.push(entry);
    return 'ACCEPTED';
  }

  // --------------------------------------------------------------------------
  // Drain Operation
  // --------------------------------------------------------------------------

  /**
   * Drain entries from the queue (up to limit).
   * @param limit - Maximum entries to drain
   * @returns Array of drained entries
   */
  drain(limit: number): LokiLogEntry[] {
    const count = Math.min(limit, this.queue.length);
    return this.queue.splice(0, count);
  }

  /**
   * Drain all entries from the queue.
   * @returns Array of all entries
   */
  drainAll(): LokiLogEntry[] {
    const entries = this.queue;
    this.queue = [];
    return entries;
  }

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  /**
   * Get current backpressure level.
   */
  getBackpressureLevel(): BackpressureLevel {
    const utilization = this.queue.length / this.maxSize;

    if (utilization >= 1) return 'FULL';
    if (utilization >= CRITICAL_THRESHOLD) return 'CRITICAL';
    if (utilization >= WARNING_THRESHOLD) return 'WARNING';
    return 'NORMAL';
  }

  /**
   * Get queue statistics snapshot.
   */
  getStats(): LokiQueueStats {
    return {
      depth: this.queue.length,
      capacity: this.maxSize,
      backpressureLevel: this.getBackpressureLevel(),
      droppedTotal: this.droppedTotal,
      sampledTotal: this.sampledTotal,
    };
  }

  /**
   * Check if queue is empty.
   */
  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get current queue depth.
   */
  get depth(): number {
    return this.queue.length;
  }
}
