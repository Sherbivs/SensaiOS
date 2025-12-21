/**
 * Loki Backend Types
 * ==================
 *
 * Type definitions specific to the Loki observability backend.
 *
 * @module observability/backends/loki/loki-types
 * @since 2025-12-20
 */

// ============================================================================
// Log Entry Types
// ============================================================================

/**
 * Log level for Loki entries.
 */
export type LokiLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Internal log entry format for the Loki backend.
 * Converted from ObservabilityEvent before queueing.
 */
export interface LokiLogEntry {
  /** Timestamp (converted to nanoseconds for Loki) */
  timestamp: Date;

  /** Log level (used as Loki label) */
  level: LokiLevel;

  /** Source service (used as Loki label) */
  service: string;

  /** Event topic (used as Loki label) */
  topic: string;

  /** Log message (typically topic or extracted from payload) */
  message: string;

  /** Additional structured data (JSON stringified in log line) */
  data?: Record<string, unknown>;
}

// ============================================================================
// Queue Types
// ============================================================================

/**
 * Backpressure level for the queue.
 */
export type BackpressureLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'FULL';

/**
 * Result of pushing an entry to the queue.
 */
export type PushResult = 'ACCEPTED' | 'WARNING' | 'SAMPLED' | 'DROPPED';

/**
 * Queue statistics snapshot.
 */
export interface LokiQueueStats {
  /** Current queue depth */
  depth: number;

  /** Maximum queue capacity */
  capacity: number;

  /** Current backpressure level */
  backpressureLevel: BackpressureLevel;

  /** Total entries dropped (all-time) */
  droppedTotal: number;

  /** Total entries sampled (all-time) */
  sampledTotal: number;
}

// ============================================================================
// Circuit Breaker Types
// ============================================================================

/**
 * Circuit breaker state.
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker statistics.
 */
export interface CircuitBreakerStats {
  /** Current state */
  state: CircuitState;

  /** Consecutive failures count */
  failures: number;

  /** Failure threshold before opening */
  threshold: number;

  /** Time until circuit can try half-open (if OPEN) */
  resetTimeMs: number;

  /** Last state transition timestamp */
  lastTransition: Date | null;
}

// ============================================================================
// Backend Status Types
// ============================================================================

/**
 * Comprehensive Loki backend status.
 */
export interface LokiBackendStatus {
  /** Backend enabled flag */
  enabled: boolean;

  /** Loki endpoint URL */
  endpoint: string;

  /** Queue statistics */
  queue: LokiQueueStats;

  /** Circuit breaker statistics */
  circuitBreaker: CircuitBreakerStats;

  /** Flush worker status */
  flushWorker: {
    running: boolean;
    tickCount: number;
    lastTickAt: Date | null;
  };

  /** Health worker status */
  healthWorker: {
    running: boolean;
    tickCount: number;
    lastTickAt: Date | null;
  };
}

// ============================================================================
// HTTP Transport Types
// ============================================================================

/**
 * Loki push payload (Grafana Loki API format).
 */
export interface LokiPushPayload {
  streams: LokiStream[];
}

/**
 * A single log stream (grouped by labels).
 */
export interface LokiStream {
  /** Label set as key-value object */
  stream: Record<string, string>;

  /** Array of [timestamp_ns, log_line] tuples */
  values: [string, string][];
}

/**
 * HTTP transport configuration.
 */
export interface LokiTransportConfig {
  /** Loki push endpoint URL */
  endpoint: string;

  /** Request timeout in milliseconds */
  timeoutMs: number;

  /** Grafana Cloud instance ID (optional, for basic auth) */
  username?: string;

  /** Grafana Cloud API key (optional, for basic auth) */
  password?: string;
}
