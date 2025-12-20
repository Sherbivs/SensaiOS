/**
 * Loki Backend — Public Exports
 * =============================
 *
 * Re-exports Loki backend components for external use.
 *
 * @module observability/backends/loki
 * @since 2025-12-20
 */

// Types
export type {
  LokiLogEntry,
  LokiLevel,
  LokiQueueStats,
  BackpressureLevel,
  PushResult,
  CircuitState,
  CircuitBreakerStats,
  LokiBackendStatus,
  LokiPushPayload,
  LokiStream,
  LokiTransportConfig,
} from './loki-types.js';

// Config
export { LOKI_CONFIG, isLokiEnabled, hasLokiEndpoint } from './loki-config.js';

// Components
export { LokiQueue } from './loki-queue.js';
export { LokiCircuitBreaker } from './loki-circuit-breaker.js';
export { LokiHttpTransport } from './loki-http-transport.js';
export { LokiFlushWorker } from './loki-flush-worker.js';
export { LokiHealthWorker } from './loki-health-worker.js';

// Backend
export { LokiBackend, lokiBackend } from './loki-backend.js';
