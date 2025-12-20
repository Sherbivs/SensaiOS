/**
 * Observability Hub Types
 * =======================
 *
 * Core type definitions for the Observability Hub and its backends.
 * The Hub acts as a central intermediary between event sources and
 * observability backends (Loki, Prometheus, Datadog, etc.).
 *
 * @module observability/hub/observability-types
 * @since 2025-12-20
 */

// ============================================================================
// Event Types
// ============================================================================

/**
 * Log level for observability events.
 * Mapped to Loki's level label and filtered in Grafana.
 */
export type ObservabilityLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Standardized event format for the Observability Hub.
 * All backends receive events in this format.
 */
export interface ObservabilityEvent {
  /** ISO timestamp or Date object */
  timestamp: Date;

  /** Event topic (dot-separated, e.g., 'battle.started', 'security.sweep.completed') */
  topic: string;

  /** Log level derived from topic or payload */
  level: ObservabilityLevel;

  /** Source service/module that emitted the event */
  service: string;

  /** Event-specific payload data */
  payload: Record<string, unknown>;

  /** Correlation ID for distributed tracing (optional) */
  correlationId?: string;

  /** Parent correlation ID for event chains (optional) */
  parentCorrelationId?: string;
}

// ============================================================================
// Backend Interface
// ============================================================================

/**
 * Backend status for health checks and monitoring.
 */
export interface BackendStatus {
  /** Whether the backend considers itself healthy */
  healthy: boolean;

  /** Descriptive status message */
  message: string;

  /** Backend-specific details */
  details?: Record<string, unknown>;
}

/**
 * Interface for observability backends.
 * Implement this to add new backends (Loki, Prometheus, Datadog, etc.).
 */
export interface IObservabilityBackend {
  /** Unique backend name (e.g., 'loki', 'prometheus') */
  readonly name: string;

  /** Whether this backend is enabled */
  enabled: boolean;

  /**
   * Receive an event from the Hub (fire-and-forget).
   * MUST NOT throw — handle errors internally.
   */
  receive(event: ObservabilityEvent): void;

  /**
   * Start the backend (initialize workers, connections, etc.).
   */
  start(): Promise<void>;

  /**
   * Stop the backend gracefully (flush queues, close connections).
   */
  stop(): Promise<void>;

  /**
   * Get backend health status.
   */
  getStatus(): BackendStatus;
}

// ============================================================================
// Hub Status Types
// ============================================================================

/**
 * Observability Hub status snapshot.
 * Returned by `ObservabilityHub.getStatus()`.
 */
export interface HubStatus {
  /** Whether the hub is enabled via config */
  enabled: boolean;

  /** Whether the hub is currently running */
  running: boolean;

  /** Total events received from Event Bus subscription */
  eventBusEvents: number;

  /** Total events received via direct ingest() method */
  directIngestEvents: number;

  /** Number of registered backends */
  backendCount: number;

  /** Backend names currently registered */
  backends: string[];

  /** Event Bus subscription ID (if subscribed) */
  subscriptionId: string | null;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Hub configuration options.
 */
export interface HubConfig {
  /** Master enable/disable switch */
  enabled: boolean;
}
