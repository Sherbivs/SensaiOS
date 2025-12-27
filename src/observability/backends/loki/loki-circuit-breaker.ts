/**
 * Loki Circuit Breaker
 * ====================
 *
 * Hystrix-style circuit breaker to prevent hammering a dead Loki endpoint.
 *
 * State Machine:
 * - CLOSED (normal): Requests flow through, failures counted
 * - OPEN (bypass): Requests skipped, timer runs
 * - HALF_OPEN (probe): Single request allowed to test recovery
 *
 * @module observability/backends/loki/loki-circuit-breaker
 * @since 2025-12-20
 */

import type { CircuitState, CircuitBreakerStats } from './loki-types.js';

// ============================================================================
// Circuit Breaker Class
// ============================================================================

/**
 * Circuit breaker for Loki endpoint protection.
 */
export class LokiCircuitBreaker {
  /** Current circuit state */
  private state: CircuitState = 'CLOSED';

  /** Consecutive failure count */
  private failures = 0;

  /** Failure threshold before opening */
  private readonly threshold: number;

  /** Reset time in milliseconds */
  private readonly resetTimeMs: number;

  /** Timestamp when circuit opened */
  private openedAt: Date | null = null;

  /** Last state transition timestamp */
  private lastTransition: Date | null = null;

  /**
   * Create a new circuit breaker.
   * @param threshold - Consecutive failures before opening (default: 3)
   * @param resetTimeMs - Time before circuit re-probes (default: 60000)
   */
  constructor(threshold = 3, resetTimeMs = 60_000) {
    this.threshold = threshold;
    this.resetTimeMs = resetTimeMs;
  }

  // --------------------------------------------------------------------------
  // State Queries
  // --------------------------------------------------------------------------

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    // Check if we should transition OPEN → HALF_OPEN
    if (this.state === 'OPEN' && this.shouldAttemptReset()) {
      this.transitionTo('HALF_OPEN');
    }
    return this.state;
  }

  /**
   * Check if requests should be allowed through.
   */
  allowRequest(): boolean {
    const state = this.getState();
    return state === 'CLOSED' || state === 'HALF_OPEN';
  }

  /**
   * Check if circuit is open (blocking requests).
   */
  isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  // --------------------------------------------------------------------------
  // State Transitions
  // --------------------------------------------------------------------------

  /**
   * Record a successful request.
   * Resets failure count and closes circuit if half-open.
   */
  recordSuccess(): void {
    this.failures = 0;

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
  }

  /**
   * Record a failed request.
   * Increments failure count and opens circuit if threshold reached.
   */
  recordFailure(): void {
    this.failures++;

    if (this.state === 'HALF_OPEN') {
      // Probe failed, re-open circuit
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.threshold) {
      // Threshold reached, open circuit
      this.transitionTo('OPEN');
    }
  }

  /**
   * Force the circuit to a specific state (for testing/recovery).
   * @param state - Target state
   */
  forceState(state: CircuitState): void {
    this.transitionTo(state);
    if (state === 'CLOSED') {
      this.failures = 0;
    }
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  /**
   * Check if enough time has passed to attempt reset.
   * @private
   */
  private shouldAttemptReset(): boolean {
    if (!this.openedAt) return false;
    const elapsed = Date.now() - this.openedAt.getTime();
    return elapsed >= this.resetTimeMs;
  }

  /**
   * Transition to a new state.
   * @private
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastTransition = new Date();

    if (newState === 'OPEN') {
      this.openedAt = new Date();
    } else if (newState === 'CLOSED') {
      this.openedAt = null;
    }

    // Only log CLOSED transitions (recovery success) to reduce noise
    // OPEN/HALF_OPEN transitions are noisy when Loki is down and add no value
    if (newState === 'CLOSED' || (oldState === 'HALF_OPEN' && newState === 'OPEN')) {
      // eslint-disable-next-line no-console
      console.info(`[LokiCircuitBreaker] ${oldState} → ${newState}`);
    }
  }

  // --------------------------------------------------------------------------
  // Status
  // --------------------------------------------------------------------------

  /**
   * Get circuit breaker statistics.
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.getState(),
      failures: this.failures,
      threshold: this.threshold,
      resetTimeMs: this.resetTimeMs,
      lastTransition: this.lastTransition,
    };
  }
}
