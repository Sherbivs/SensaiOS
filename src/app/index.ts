/**
 * Application Layer — Kernel Isolation Entry Point
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS IS THE APPLICATION LAYER ENTRY POINT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * The application layer sits BETWEEN the kernel (observability infrastructure)
 * and all application code. This isolation provides:
 * 
 * 1. **Clean Separation** — Application code never imports from kernel directly
 * 2. **Testability** — Application facades can be mocked independently
 * 3. **Flexibility** — Kernel implementation can change without affecting apps
 * 4. **Security** — Kernel access is auditable through this single entry point
 * 
 * ARCHITECTURE:
 * 
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                         KERNEL LAYER (Infrastructure)                 │
 *   │  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
 *   │  │ Kernel Logger  │  │   Correlation   │  │   Kernel Observer     │  │
 *   │  │ (Ring Buffer)  │  │   (Tracing)     │  │   (System Watch)      │  │
 *   │  └────────────────┘  └─────────────────┘  └───────────────────────┘  │
 *   │  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
 *   │  │ Error Detector │  │  Kernel Hooks   │  │    Kernel Metrics     │  │
 *   │  │ (Fingerprint)  │  │ (System Bridge) │  │    (Aggregation)      │  │
 *   │  └────────────────┘  └─────────────────┘  └───────────────────────┘  │
 *   └───────────────────────────────────────────────────────────────────────┘
 *                              ↑ Exports ↓
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                    APPLICATION LAYER (This Module)                    │
 *   │  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
 *   │  │ Discord Adapter│  │ Worker Adapter  │  │ Infrastructure Adapter│  │
 *   │  │ (Bot Facade)   │  │ (Job Facade)    │  │ (Hook Re-exports)     │  │
 *   │  └────────────────┘  └─────────────────┘  └───────────────────────┘  │
 *   └───────────────────────────────────────────────────────────────────────┘
 *                              ↑ Imports ↓
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                    APPLICATION SYSTEMS (Consumers)                    │
 *   │  ┌─────────┐ ┌────────────┐ ┌─────────────┐ ┌───────────────────────┐│
 *   │  │ Discord │ │   Workers  │ │   Shared    │ │      Services         ││
 *   │  │   Bot   │ │ (Engine)   │ │   (Logger)  │ │   (Event Bus, etc.)   ││
 *   │  └─────────┘ └────────────┘ └─────────────┘ └───────────────────────┘│
 *   └───────────────────────────────────────────────────────────────────────┘
 * 
 * ADAPTER MODULES:
 * - discord-adapter.ts — Discord bot specific facades (appLog, withDiscordTrace)
 * - worker-adapter.ts — Background worker facades (workerLog, executeWorker)
 * - infrastructure-adapter.ts — Kernel hooks re-exports for system infrastructure
 * 
 * @module app
 * @since 2025-12-30
 */

// ============================================================================
// RE-EXPORTS FROM DISCORD ADAPTER
// ============================================================================

export {
  // Logging facade
  appLog,
  
  // Trace helpers (Discord-specific)
  withDiscordTrace,
  withWorkerTrace,
  
  // Correlation utilities
  getCorrelationId,
  
  // Scope helpers
  scopeFromInteraction,
  scopeFromGuild,
  
  // Handler wrapper (for runGuarded pattern)
  createHandler,
  
  // Types
  type AppLogLevel,
  type DiscordTraceOptions,
  type WorkerTraceOptions,
  type HandlerContext,
} from './discord-adapter.js';

// ============================================================================
// RE-EXPORTS FROM WORKER ADAPTER
// ============================================================================

export {
  // Worker logging facade
  workerLog,
  
  // Worker execution wrapper
  executeWorker,
  type WorkerExecutionOptions,
  
  // Worker hook (for kernel integration)
  createWorkerHook,
  type WorkerHook,
  
  // Worker tracing
  startWorkerTrace,
  startWorkerTraceAsync,
} from './worker-adapter.js';

// ============================================================================
// RE-EXPORTS FROM INFRASTRUCTURE ADAPTER
// ============================================================================

export {
  // System hooks for kernel integration
  createLoggerHook,
  createErrorTrackerHook,
  createServiceRegistryHook,
  createEventBusHook,
  createDatabaseHook,
  createDiscordHook,
  createCacheHook,
  createIntelligenceHook,
  createCustomHook,
  createObservabilityHook,
  createInfrastructureHook,
  
  // Hook types
  type LoggerHook,
  type ErrorTrackerHook,
  type ServiceRegistryHook,
  type EventBusHook,
  type DatabaseHook,
  type DiscordHook,
  type CacheHook,
  type IntelligenceHook,
  type CustomHook,
  type ObservabilityHook,
  type InfrastructureHook,
  
  // Correlation (for infrastructure systems)
  getCurrentCorrelationId,
  getParentCorrelationId,
  getRootCorrelationId,
  getCurrentContext,
  isInTrace,
  generateCorrelationId,
  generateShortCorrelationId,
  startTrace,
  startTraceAsync,
  continueTrace,
  continueTraceAsync,
  withCorrelation,
  
  // Correlation types
  type CorrelationContext,
  type TraceSource,
  type TraceMetadata,
  type StartTraceOptions,
  type CorrelationStats,
  
  // Kernel query API
  queryKernel,
  kernelLog,
  subscribeToLogs,
  subscribeToErrors,
  subscribeToServices,
  subscribeToEvents,
  subscribeToMetrics,
  
  // Infrastructure metrics
  getDashboard,
  getOverallHealth,
  exportMetrics,
  observeInfraMetric,
  observeInfraMetrics,
  onInfraMetric,
  getRecentInfraMetrics,
  getInfraMetricsByCategory,
  getLatestInfraMetric,
  getAllLatestInfraMetrics,
  getInfrastructureMetrics,
  getInfraMetricStats,
  registerMetricDefinition,
  getMetricDefinitions,
  recordMetric,
  getMetricTrend,
  getAllTrends,
  checkForAnomalies,
  getAnomalies,
  getActiveAnomalies,
  clearAnomalies,
  
  // Infrastructure metric types
  type KernelDashboard,
  type MetricTrend,
  type SystemAnomaly,
  type MetricCategory,
  type MetricUnit,
  type MetricType,
  type MetricHook,
  type ResourceMetricObservation,
  type InfrastructureMetrics,
  type MetricDefinition,
} from './infrastructure-adapter.js';

// ============================================================================
// RE-EXPORTS FROM SENSAIOS (Application-relevant)
// ============================================================================

// Re-export TenantScope for handler typing
export type { TenantScope } from '../sensaios/tenant-scope.js';
export { systemScope, workerScope } from '../sensaios/tenant-scope.js';

// Re-export runGuarded for handlers that need full control
export { runGuarded, runGuardedSafe, getCorrelationId as getSensaiCorrelationId } from '../sensaios/run-guarded.js';

// Re-export error types from sensaios/types.js (the source)
export type { ErrorCategory, ErrorSeverity } from '../sensaios/types.js';
export type { CanonicalError } from '../sensaios/canonical-error.js';
export { toCanonicalError } from '../sensaios/canonical-error.js';
