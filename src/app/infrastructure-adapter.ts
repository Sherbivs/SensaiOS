/**
 * Infrastructure Adapter — Application Layer Facade for System Infrastructure
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ISOLATES INFRASTRUCTURE FROM DIRECT KERNEL IMPORTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides application-level abstractions over kernel hooks for
 * infrastructure systems (logger, event-bus, service-registry, cache, database).
 * 
 * DESIGN PRINCIPLES:
 * 1. **Single Import Point** — All kernel hooks flow through here
 * 2. **Fail-Safe** — Hooks already catch errors internally (kernel never crashes app)
 * 3. **Type Re-export** — Types available without touching kernel
 * 4. **Future Extensibility** — Can add app-specific behavior without kernel changes
 * 
 * WHY THIS EXISTS:
 * The kernel's kernel-hooks.ts is the official bridge between application and
 * kernel. This adapter ensures:
 * - Application code never imports from `../kernel/*` directly
 * - All kernel access is centralized in `src/app/`
 * - Easy to audit what the application layer exposes
 * 
 * @module app/infrastructure-adapter
 * @since 2025-12-30
 */

// ============================================================================
// KERNEL HOOKS RE-EXPORTS
// ============================================================================
// These are the official integration points for infrastructure systems.
// Each hook provides a safe, fail-safe connection to the kernel observer.

export {
  // Logger system hook
  createLoggerHook,
  type LoggerHook,
  
  // Error tracker hook
  createErrorTrackerHook,
  type ErrorTrackerHook,
  
  // Service registry hook
  createServiceRegistryHook,
  type ServiceRegistryHook,
  
  // Event bus hook
  createEventBusHook,
  type EventBusHook,
  
  // Database hook
  createDatabaseHook,
  type DatabaseHook,
  
  // Discord hook
  createDiscordHook,
  type DiscordHook,
  
  // Worker hook
  createWorkerHook,
  type WorkerHook,
  
  // Cache hook
  createCacheHook,
  type CacheHook,
  
  // Intelligence hook (AI/ML pattern detection)
  createIntelligenceHook,
  type IntelligenceHook,
  
  // Custom hook (extensibility)
  createCustomHook,
  type CustomHook,
  
  // Observability hook (metrics, observability systems)
  createObservabilityHook,
  type ObservabilityHook,
  
  // Infrastructure hook (resource monitoring, metrics collection)
  createInfrastructureHook,
  type InfrastructureHook,
} from '../kernel/kernel-hooks.js';

// ============================================================================
// CORRELATION TRACKING RE-EXPORTS
// ============================================================================
// Correlation utilities for distributed tracing across infrastructure.

export {
  // Context retrieval
  getCurrentCorrelationId,
  getParentCorrelationId,
  getRootCorrelationId,
  getCurrentContext,
  isInTrace,
  
  // ID generation
  generateCorrelationId,
  generateShortCorrelationId,
  
  // Trace management
  startTrace,
  startTraceAsync,
  continueTrace,
  continueTraceAsync,
  withCorrelation,
  
  // Worker-specific tracing
  startWorkerTrace,
  startWorkerTraceAsync,
  
  // Types
  type CorrelationContext,
  type TraceSource,
  type TraceMetadata,
  type StartTraceOptions,
  type CorrelationStats,
} from '../kernel/correlation.js';

// ============================================================================
// KERNEL QUERY API
// ============================================================================
// Read-only access to kernel state for monitoring and debugging.

export {
  // Query interface for reading kernel state
  queryKernel,
  
  // Quick log helpers (for systems that don't need full hooks)
  kernelLog,
  
  // Real-time observation subscriptions
  subscribeToLogs,
  subscribeToErrors,
  subscribeToServices,
  subscribeToEvents,
  subscribeToMetrics,
} from '../kernel/kernel-hooks.js';

// ============================================================================
// INFRASTRUCTURE METRICS
// ============================================================================
// Direct access to kernel-level infrastructure metrics system.

export {
  // Dashboard and health overview
  getDashboard,
  getOverallHealth,
  exportMetrics,
  
  // Metric observation
  observeInfraMetric,
  observeInfraMetrics,
  onInfraMetric,
  
  // Metric queries
  getRecentInfraMetrics,
  getInfraMetricsByCategory,
  getLatestInfraMetric,
  getAllLatestInfraMetrics,
  getInfrastructureMetrics,
  getInfraMetricStats,
  
  // Metric definitions
  registerMetricDefinition,
  getMetricDefinitions,
  
  // Trend analysis
  recordMetric,
  getMetricTrend,
  getAllTrends,
  
  // Anomaly detection
  checkForAnomalies,
  getAnomalies,
  getActiveAnomalies,
  clearAnomalies,
  
  // Types
  type KernelDashboard,
  type MetricTrend,
  type SystemAnomaly,
} from '../kernel/kernel-metrics.js';

// Re-export infrastructure metric types from kernel-types
export type {
  MetricCategory,
  MetricUnit,
  MetricType,
  MetricHook,
  ResourceMetricObservation,
  InfrastructureMetrics,
  MetricDefinition,
} from '../kernel/kernel-types.js';
