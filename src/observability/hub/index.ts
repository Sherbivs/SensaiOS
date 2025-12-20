/**
 * Observability Hub — Public Exports
 * ===================================
 *
 * Re-exports hub components for external use.
 *
 * @module observability/hub
 * @since 2025-12-20
 */

// Types
export type {
  ObservabilityEvent,
  ObservabilityLevel,
  IObservabilityBackend,
  BackendStatus,
  HubStatus,
  HubConfig,
} from './observability-types.js';

// Config
export { OBSERVABILITY_CONFIG, isHubEnabled } from './observability-config.js';

// Hub
export { ObservabilityHub, observabilityHub } from './observability-hub.js';
