/**
 * Observability Layer — Kernel-Level Monitoring Gateway
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS IS THE OBSERVABILITY LAYER ENTRY POINT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * The Observability Layer sits PARALLEL to the Application Layer, both above
 * the kernel. This is where monitoring services (backends) are installed.
 * 
 * ARCHITECTURE:
 * 
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                         KERNEL LAYER (Infrastructure)                 │
 *   │  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
 *   │  │ Kernel Logger  │  │   Correlation   │  │   Kernel Observer     │  │
 *   │  │ (Ring Buffer)  │  │   (Tracing)     │  │   (System Watch)      │  │
 *   │  └────────────────┘  └─────────────────┘  └───────────────────────┘  │
 *   └───────────────────────────────────────────────────────────────────────┘
 *                    ↑                                    ↑
 *                    │                                    │
 *   ┌────────────────┴───────────────┐  ┌────────────────┴───────────────┐
 *   │     APPLICATION LAYER          │  │     OBSERVABILITY LAYER        │
 *   │         (src/app/)             │  │    (src/observability/layer/)  │
 *   │                                │  │                                │
 *   │  ┌──────────────────────────┐  │  │  ┌──────────────────────────┐  │
 *   │  │ Discord, Worker, Infra   │  │  │  │ Hub, Backends, Envelope  │  │
 *   │  │ Adapters for App Code    │  │  │  │ Adapters for Monitoring  │  │
 *   │  └──────────────────────────┘  │  │  └──────────────────────────┘  │
 *   └────────────────────────────────┘  └────────────────────────────────┘
 *                    ↑                                    ↑
 *                    │                                    │
 *   ┌────────────────┴────────────────────────────────────┴──────────────┐
 *   │                    APPLICATION SYSTEMS (Consumers)                  │
 *   │  ┌─────────┐ ┌────────────┐ ┌─────────────┐ ┌───────────────────┐  │
 *   │  │ Discord │ │   Workers  │ │   Shared    │ │      Services     │  │
 *   │  │   Bot   │ │ (Engine)   │ │   (Logger)  │ │ (Event Bus, etc.) │  │
 *   │  └─────────┘ └────────────┘ └─────────────┘ └───────────────────┘  │
 *   └────────────────────────────────────────────────────────────────────┘
 * 
 * WHY PARALLEL LAYERS?
 * 
 * 1. **Separation of Concerns** — Business logic (app) vs monitoring (observability)
 * 2. **Independent Evolution** — Backends can be added/removed without app changes
 * 3. **Kernel Access** — Both layers need direct kernel access for their domain
 * 4. **Installation Point** — Hub is where backends "install" like OS services
 * 
 * OBSERVABILITY SERVICES (Installable Backends):
 * - Loki Backend — Log aggregation to Grafana Loki
 * - (Future) Prometheus Backend — Metrics scraping
 * - (Future) Datadog Backend — APM integration
 * - (Future) OpenTelemetry Backend — Distributed tracing
 * 
 * @module observability/layer
 * @since 2025-12-30
 */

// ============================================================================
// KERNEL ACCESS — Direct import as a peer layer to Application Layer
// ============================================================================
// The Observability Layer imports from kernel directly because it is a
// sibling layer to Application, not a child of it.

export {
  // Observability hook for registering monitoring systems
  createObservabilityHook,
  type ObservabilityHook,
  
  // Subscription APIs for real-time observation
  subscribeToLogs,
  subscribeToErrors,
  subscribeToServices,
  subscribeToEvents,
  
  // Query API for reading kernel state
  queryKernel,
  
  // Quick log helpers
  kernelLog,
} from '../../kernel/kernel-hooks.js';

// Correlation tracking for distributed traces
export {
  getCurrentCorrelationId,
  getParentCorrelationId,
  getRootCorrelationId,
  generateCorrelationId,
  getCurrentContext,
  isInTrace,
  type CorrelationContext,
} from '../../kernel/correlation.js';

// ============================================================================
// OBSERVABILITY HUB — Central Service Installation Point
// ============================================================================
// The Hub is where observability backends "install" themselves, similar to
// how an OS has a service manager where daemons register.

export { ObservabilityHub, observabilityHub } from '../hub/observability-hub.js';
export { isHubEnabled, OBSERVABILITY_CONFIG } from '../hub/observability-config.js';
export type {
  ObservabilityEvent,
  ObservabilityLevel,
  IObservabilityBackend,
  HubStatus,
  BackendStatus,
} from '../hub/observability-types.js';

// ============================================================================
// INSTALLABLE BACKENDS — Monitoring Services
// ============================================================================
// These are the "services" that can be installed into the Observability Hub.
// Each backend handles a specific monitoring concern.

// Loki Backend — Log aggregation
export { lokiBackend, LokiBackend } from '../backends/loki/index.js';
export type { LokiBackendStatus, LokiLogEntry } from '../backends/loki/loki-types.js';

// ============================================================================
// ENVELOPE SYSTEM — Standardized Event Format
// ============================================================================
// The envelope system provides a universal format for all observability data.

export {
  // Factory functions
  createLog,
  createMetric,
  createEvent,
  createTrace,
  createAlert,
  createOutput,
  
  // Serialization
  serialize,
  deserialize,
  
  // Types
  type UniversalEnvelope,
  type LogEnvelope,
  type MetricEnvelope,
  type EventEnvelope,
  type TraceEnvelope,
  type AlertEnvelope,
} from '../envelope/index.js';

// Console logging (safe, no circular deps)
export { scopedLogger } from '../envelope/console.js';

// ============================================================================
// SUITE LIFECYCLE — Start/Stop All Observability
// ============================================================================

export {
  startObservabilitySuite,
  stopObservabilitySuite,
  getObservabilitySuiteStatus,
} from '../index.js';
