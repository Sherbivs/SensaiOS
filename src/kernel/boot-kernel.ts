/**
 * Boot Kernel — System Bootstrap Entry Point (Root Observer Layer)
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS IS THE FIRST CODE THAT RUNS — THE ROOT OF ALL OBSERVATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module initializes the complete kernel system that sits ABOVE all other
 * application code. Like an operating system kernel, it:
 * 
 * 1. Starts FIRST — Before any application modules load
 * 2. Sees EVERYTHING — Observes all logs, errors, events, and service states
 * 3. Stops LAST — Exports all data before final process exit
 * 4. Never Interferes — Passive observation, never modifies application state
 * 
 * KERNEL ARCHITECTURE:
 * 
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                         KERNEL LAYER (ROOT)                           │
 *   │                                                                       │
 *   │  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
 *   │  │ Kernel Logger  │  │ Error Detector  │  │   Kernel Observer     │  │
 *   │  │ (Ring Buffer)  │  │ (Fingerprint)   │  │ (System Registration) │  │
 *   │  └────────────────┘  └─────────────────┘  └───────────────────────┘  │
 *   │                                                                       │
 *   │  ┌────────────────┐  ┌─────────────────┐  ┌───────────────────────┐  │
 *   │  │ Kernel Metrics │  │  Kernel Hooks   │  │   Export/Persist      │  │
 *   │  │ (Aggregation)  │  │ (System Bridge) │  │   (JSON/Disk)         │  │
 *   │  └────────────────┘  └─────────────────┘  └───────────────────────┘  │
 *   └───────────────────────────────────────────────────────────────────────┘
 *                    ↑ Observes ↓ ALL Systems Below
 *   ┌───────────────────────────────────────────────────────────────────────┐
 *   │                      APPLICATION LAYER                                 │
 *   │  ┌─────────┐ ┌──────────────┐ ┌────────────────┐ ┌─────────────────┐  │
 *   │  │ Logger  │ │ Error Tracker│ │ Service Registry│ │    Event Bus   │  │
 *   │  └─────────┘ └──────────────┘ └────────────────┘ └─────────────────┘  │
 *   │  ┌─────────┐ ┌──────────────┐ ┌────────────────┐ ┌─────────────────┐  │
 *   │  │ Discord │ │   Database   │ │     Cache      │ │    Workers      │  │
 *   │  └─────────┘ └──────────────┘ └────────────────┘ └─────────────────┘  │
 *   └───────────────────────────────────────────────────────────────────────┘
 * 
 * IMPORT ORDER MATTERS:
 * 1. boot-kernel.ts (this file) — MUST be first import in index.ts
 * 2. Kernel systems initialize (logger, error detector, observer)
 * 3. All other application imports proceed
 * 4. Application systems hook into kernel via kernel-hooks.ts
 * 
 * @module kernel/boot-kernel
 */

// ============================================================================
// KERNEL INITIALIZATION (synchronous, no external deps)
// ============================================================================

// Capture absolute start time FIRST
const _KERNEL_ABSOLUTE_START = Date.now(); // Wall-clock epoch; reserved for future telemetry labels
const KERNEL_START_TIME = process.hrtime.bigint();

// Step 1: Initialize kernel logger (creates log file, ring buffer)
import {
  kernel,
  klog,
  setKernelLogLevel,
  getKernelLogLevel,
  getKernelLogs,
  getKernelLogStats,
  getKernelUptime,
  getRecentErrors as getRecentLogErrors,
  shutdownKernelLogger,
  exportKernelLogs,
  // Pre-boot queue API
  markBooted,
  isBooted,
  getPreBootStats,
  getPreBootQueue,
  type KernelLogLevel,
  type KernelLogEntry,
  type KernelLogStats,
  type PreBootStats as _PreBootStats,
} from './kernel-logger.js';

// Step 1.5: Install Render-safe output interceptor (BEFORE any other output)
// This prevents Render's log viewer from false-positively highlighting
// normal status messages (like "0 errors") in red.
import { installRenderSafeOutput } from '../shared/logging/render-safe.js';
installRenderSafeOutput();

// Step 2: Initialize error detector (installs global handlers)
import {
  installErrorHandlers,
  captureError,
  setPhase,
  getPhase,
  detectCrash,
  getErrorStats,
  getErrors,
  getPatterns,
  exportErrorData,
  getLearnings,
  shutdownErrorDetector,
  type ErrorSeverity,
  type ErrorPhase,
  type KernelError,
  type ErrorPattern,
  type CrashDetection,
  type KernelErrorStats,
} from './kernel-error-detector.js';

// Step 3: Initialize kernel observer (system registration and observation)
import {
  registerSystem,
  unregisterSystem,
  getRegisteredSystems,
  observeLog,
  observeError,
  observeService,
  observeEvent,
  onLog,
  onError,
  onService,
  onEvent,
  getMetrics as _getObserverMetrics,
  getSystemHealth,
  getRecentLogs,
  getRecentErrors,
  getRecentServices,
  getRecentEvents,
  getAuditTrail,
  exportKernelState,
  signalBootComplete,
  shutdownObserver,
} from './kernel-observer.js';

// Step 4: Initialize kernel metrics (aggregation and anomaly detection)
import {
  getDashboard,
  recordMetric,
  getMetricTrend,
  getAllTrends,
  checkForAnomalies,
  getAnomalies,
  getActiveAnomalies,
  clearAnomalies,
  getOverallHealth,
  exportMetrics,
  recordBootTime,
  type KernelDashboard,
  type MetricTrend,
  type SystemAnomaly,
} from './kernel-metrics.js';

// Step 5: Import persistence layer
import {
  initializePersistence,
  saveSnapshot,
  saveCrashReport,
  exportFullState,
  exportMetricsHistory,
  registerDatabaseHook,
  unregisterDatabaseHook,
  cleanupOldFiles,
  listSnapshots,
  getPersistenceStats,
  shutdownPersistence,
  createPrismaHook,
  type PersistenceConfig,
  type KernelSnapshot,
  type DatabaseExportHook,
} from './kernel-persistence.js';

// Step 6: Import output plugin system
import {
  registerOutputPlugin,
  unregisterOutputPlugin,
  getPlugin,
  getAllPlugins,
  setPluginEnabled,
  dispatchToPlugins,
  dispatchToPluginsSync,
  initializePluginSystem,
  flushAllPlugins,
  shutdownPluginSystem,
  getPluginSystemState,
  isPluginSystemReady,
  createConsolePlugin,
  createBufferedPlugin,
  createFilteredPlugin,
} from './kernel-output-plugins.js';

import {
  scrubEntry,
  getScrubConfig,
  configureScrubber,
  resetScrubConfig,
} from './kernel-scrubber.js';

export type {
  KernelOutputPlugin,
  PluginStats,
  PluginRegistration,
  OutputPluginManagerState,
} from './kernel-output-plugins.js';

export type {
  ScrubConfig,
  ScrubPattern,
  ScrubField,
} from './kernel-scrubber.js';

// Step 7: Import correlation ID tracking
import {
  generateCorrelationId,
  generateShortCorrelationId,
  getCurrentContext,
  getCurrentCorrelationId,
  getParentCorrelationId,
  getRootCorrelationId,
  isInTrace,
  startTrace,
  startTraceAsync,
  continueTrace,
  continueTraceAsync,
  withCorrelation,
  startDiscordTrace,
  startDiscordTraceAsync,
  startWorkerTrace,
  startWorkerTraceAsync,
  enrichWithCorrelation,
  getCorrelationStats,
  getActiveTraces,
  getTraceById,
  resetCorrelationStats,
  getCorrelationData,
  type CorrelationContext,
  type TraceSource,
  type TraceMetadata,
  type StartTraceOptions,
  type CorrelationStats,
} from './correlation.js';

// Step 8: Import log sampling (volume control)
import {
  configureSampling,
  removeSamplingConfig,
  setDefaultSamplingConfig,
  getSamplingConfig,
  setSamplingEnabled,
  isSamplingEnabled,
  shouldLog,
  createSampledLogger,
  getSamplingStats,
  getComponentSamplingStats,
  resetSamplingStats,
  clearSamplingConfigs,
  SamplingPresets,
  type SamplingStrategy,
  type SamplingConfig,
  type SamplingDecision,
  type SamplingStats,
  type ComponentSamplingStats,
  type SampledLogger,
} from './log-sampling.js';

// Step 9.5: Import Database Resource Manager (intelligent DB monitoring)
import {
  startDatabaseResourceManager,
  stopDatabaseResourceManager,
  getDatabaseHealthReport,
  getGrowthTrend,
  getEffectiveRetentionDays,
  getActiveAnomalies as getDbAnomalies,
  forceProbe,
  formatHealthSummary,
  type DbHealthReport,
  type DbHealthLevel,
  type GrowthTrend,
  type DbAnomaly,
  type NamespaceUsage,
} from './database-resource-manager.js';

// Step 10: Import hooks for application systems (lazy - no init)
// These are used by application code to connect to kernel
import type {
  LoggerHook,
  ErrorTrackerHook,
  ServiceRegistryHook,
  EventBusHook,
  DatabaseHook,
  DiscordHook,
  WorkerHook,
  CacheHook,
  CustomHook,
} from './kernel-hooks.js';

// ============================================================================
// BOOT SEQUENCE
// ============================================================================

kernel.boot('boot-kernel', '▸ INFINITY GAUNTLET — Kernel v2.0');
kernel.boot('boot-kernel', `  PID ${process.pid} | ${process.version} | ${process.platform}/${process.arch} | ${process.env.NODE_ENV || 'development'}${process.env.RENDER ? ' | Render' : ''}`);

// Install error handlers EARLY (captures ALL uncaught errors)
installErrorHandlers();

// Initialize persistence layer
initializePersistence();

// Start Database Resource Manager (intelligent DB size monitoring, trends, anomalies)
startDatabaseResourceManager();

// Initialize output plugin system (wires dispatch into kernel-logger pipeline)
initializePluginSystem();

// Set initial phase
setPhase('MODULE_LOAD');

// Record kernel boot time
const kernelBootMs = Number(process.hrtime.bigint() - KERNEL_START_TIME) / 1_000_000;
kernel.boot('boot-kernel', `  Subsystems ready in ${kernelBootMs.toFixed(2)}ms`);

// ============================================================================
// LIFECYCLE HOOKS
// ============================================================================

/**
 * Signal that module loading is complete, entering initialization phase
 * Also marks the kernel as booted and replays the pre-boot queue.
 */
export function signalModulesLoaded(): void {
  setPhase('INIT');
  
  // Mark kernel as booted - this replays the pre-boot queue to file
  const preBootStats = getPreBootStats();
  if (!isBooted()) {
    const replayed = markBooted();
    if (preBootStats.droppedEntries > 0) {
      kernel.warn('boot-kernel', `Pre-boot queue: ${replayed} replayed, ${preBootStats.droppedEntries} dropped`);
    }
  }
  
  const stats = getKernelLogStats();
  kernel.boot('boot-kernel', `▸ Modules loaded (${stats.totalEntries} log entries)`);
}

/**
 * Signal that initialization is complete, entering runtime phase
 */
export function signalRuntimeReady(): void {
  const bootMs = getKernelUptime();  // Capture boot time before phase change
  recordBootTime(bootMs);            // Record it for dashboard
  
  setPhase('RUNTIME');
  signalBootComplete();  // Notify observer for boot time tracking
  
  const dashboard = getDashboard();
  const health = getOverallHealth();
  kernel.boot('boot-kernel', `✓ RUNTIME READY — Boot: ${bootMs}ms | Entries: ${dashboard.kernelLogEntries} | Errors: ${dashboard.kernelErrors} | Health: ${health.status}`);
}

/**
 * Begin shutdown sequence
 */
export function signalShutdown(reason?: string): void {
  setPhase('SHUTDOWN');
  kernel.boot('boot-kernel', `▸ Shutdown: ${reason ?? 'unknown'}`);
}

// ============================================================================
// SHUTDOWN HANDLING
// ============================================================================

/**
 * Shutdown kernel (call at very end of process)
 */
export function shutdownKernel(): void {
  const uptimeMs = getKernelUptime();
  const dashboard = getDashboard();
  const health = getOverallHealth();
  
  kernel.boot('boot-kernel', `✕ SHUTDOWN — Uptime: ${(uptimeMs / 1000).toFixed(2)}s | Logs: ${dashboard.kernelLogEntries} | Errors: ${dashboard.kernelErrors} | Systems: ${dashboard.totalSystems} | Health: ${health.status}`);
  
  // Stop DB Resource Manager BEFORE persistence shutdown
  stopDatabaseResourceManager();

  // Shutdown persistence (saves final snapshot)
  shutdownPersistence().catch(error => {
    kernel.error('boot-kernel', `Persistence shutdown error: ${error}`);
  });
  
  // Export state before shutdown (for post-mortem analysis)
  try {
    const state = exportKernelState();
    kernel.boot('boot-kernel', `  State exported: ${JSON.stringify(state).length} bytes`);
  } catch (error) {
    kernel.error('boot-kernel', `State export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  // Shutdown subsystems in reverse order
  shutdownObserver();
  shutdownErrorDetector();
  shutdownKernelLogger();
}

// Install shutdown hooks (but don't override if already installed)
let shutdownInstalled = false;
function installShutdownHooks() {
  if (shutdownInstalled) return;
  shutdownInstalled = true;
  
  // Graceful exit
  process.on('exit', () => {
    // Only shutdown if not already done
    if (getPhase() !== 'SHUTDOWN') {
      shutdownKernel();
    }
  });
  
  // Ctrl+C
  process.on('SIGINT', () => {
    signalShutdown('SIGINT');
    // Don't call shutdownKernel here - let the app handle it
  });
  
  // Docker/Render stop
  process.on('SIGTERM', () => {
    signalShutdown('SIGTERM');
    // Don't call shutdownKernel here - let the app handle it
  });
}

installShutdownHooks();

// ============================================================================
// RE-EXPORTS — Complete Kernel API
// ============================================================================

// Export everything needed for application integration

export {
  // ─── Kernel Logger ───────────────────────────────────────────────────────
  kernel,
  klog,
  setKernelLogLevel,
  getKernelLogLevel,
  getKernelLogs,
  getKernelLogStats,
  getKernelUptime,
  getRecentLogErrors,
  exportKernelLogs,
  
  // ─── Error Detector ──────────────────────────────────────────────────────
  captureError,
  setPhase,
  getPhase,
  detectCrash,
  getErrorStats,
  getErrors,
  getPatterns,
  exportErrorData,
  getLearnings,
  
  // ─── Observer ────────────────────────────────────────────────────────────
  registerSystem,
  unregisterSystem,
  getRegisteredSystems,
  observeLog,
  observeError,
  observeService,
  observeEvent,
  onLog,
  onError,
  onService,
  onEvent,
  getSystemHealth,
  getRecentLogs,
  getRecentErrors,
  getRecentServices,
  getRecentEvents,
  getAuditTrail,
  exportKernelState,
  
  // ─── Metrics ─────────────────────────────────────────────────────────────
  getDashboard,
  recordMetric,
  getMetricTrend,
  getAllTrends,
  checkForAnomalies,
  getAnomalies,
  getActiveAnomalies,
  clearAnomalies,
  getOverallHealth,
  exportMetrics,
  
  // ─── Types ───────────────────────────────────────────────────────────────
  type KernelLogLevel,
  type KernelLogEntry,
  type KernelLogStats,
  type ErrorSeverity,
  type ErrorPhase,
  type KernelError,
  type ErrorPattern,
  type CrashDetection,
  type KernelErrorStats,
  type KernelDashboard,
  type MetricTrend,
  type SystemAnomaly,
  
  // ─── Hook Types (for application integration) ────────────────────────────
  type LoggerHook,
  type ErrorTrackerHook,
  type ServiceRegistryHook,
  type EventBusHook,
  type DatabaseHook,
  type DiscordHook,
  type WorkerHook,
  type CacheHook,
  type CustomHook,
  
  // ─── Persistence Types ───────────────────────────────────────────────────
  type PersistenceConfig,
  type KernelSnapshot,
  type DatabaseExportHook,
  
  // ─── Correlation Types ───────────────────────────────────────────────────
  type CorrelationContext,
  type TraceSource,
  type TraceMetadata,
  type StartTraceOptions,
  type CorrelationStats,
  
  // ─── Sampling Types ──────────────────────────────────────────────────────
  type SamplingStrategy,
  type SamplingConfig,
  type SamplingDecision,
  type SamplingStats,
  type ComponentSamplingStats,
  type SampledLogger,

  // ─── DB Resource Manager ─────────────────────────────────────────────────
  getDatabaseHealthReport,
  getGrowthTrend,
  getEffectiveRetentionDays,
  getDbAnomalies,
  forceProbe,
  formatHealthSummary,
  type DbHealthReport,
  type DbHealthLevel,
  type GrowthTrend,
  type DbAnomaly,
  type NamespaceUsage,
};

// ============================================================================
// DEFAULT EXPORT — Unified Kernel Interface
// ============================================================================

/**
 * The Kernel — Root observer layer for the entire system
 * 
 * @example
 * import Kernel from './kernel/boot-kernel.js';
 * 
 * // Log to kernel (always works, even if app logger fails)
 * Kernel.log.info('myComponent', 'Something happened');
 * 
 * // Get system health
 * const health = Kernel.health();
 * 
 * // Export all kernel data
 * const data = Kernel.export();
 * 
 * // Persistence operations
 * Kernel.persist.saveSnapshot('MANUAL');
 * Kernel.persist.exportFullState('pre-deploy');
 */
const Kernel = {
  // ─── Logger API ──────────────────────────────────────────────────────────
  log: kernel,
  setLogLevel: setKernelLogLevel,
  getLogLevel: getKernelLogLevel,
  getLogs: getKernelLogs,
  getLogStats: getKernelLogStats,
  uptime: getKernelUptime,
  
  // ─── Pre-Boot Queue API ──────────────────────────────────────────────────
  preBoot: {
    isBooted,
    markBooted,
    getStats: getPreBootStats,
    getQueue: getPreBootQueue,
  },
  
  // ─── Error API ───────────────────────────────────────────────────────────
  captureError,
  getPhase,
  detectCrash,
  getErrorStats,
  getErrors,
  getPatterns,
  getLearnings,
  
  // ─── Observer API ────────────────────────────────────────────────────────
  registerSystem,
  unregisterSystem,
  getSystems: getRegisteredSystems,
  
  // ─── Observation Receivers (for hooks) ───────────────────────────────────
  observe: {
    log: observeLog,
    error: observeError,
    service: observeService,
    event: observeEvent,
  },
  
  // ─── Observation Subscriptions ───────────────────────────────────────────
  on: {
    log: onLog,
    error: onError,
    service: onService,
    event: onEvent,
  },
  
  // ─── Queries ─────────────────────────────────────────────────────────────
  recent: {
    logs: getRecentLogs,
    errors: getRecentErrors,
    services: getRecentServices,
    events: getRecentEvents,
  },
  
  // ─── Metrics API ─────────────────────────────────────────────────────────
  dashboard: getDashboard,
  health: getOverallHealth,
  systemHealth: getSystemHealth,
  anomalies: getActiveAnomalies,
  trends: getAllTrends,
  
  // ─── Lifecycle ───────────────────────────────────────────────────────────
  signalModulesLoaded,
  signalRuntimeReady,
  signalShutdown,
  shutdown: shutdownKernel,
  
  // ─── Export ──────────────────────────────────────────────────────────────
  export: {
    state: exportKernelState,
    logs: exportKernelLogs,
    errors: exportErrorData,
    metrics: exportMetrics,
    learnings: getLearnings,
  },
  
  // ─── Persistence API ─────────────────────────────────────────────────────
  persist: {
    saveSnapshot,
    saveCrashReport,
    exportFullState,
    exportMetricsHistory,
    registerDatabaseHook,
    unregisterDatabaseHook,
    cleanupOldFiles,
    listSnapshots,
    getStats: getPersistenceStats,
    createPrismaHook,
    // createFileDbHook removed — Database-First Architecture (2025-12-27)
  },
  
  // ─── Output Plugin API ───────────────────────────────────────────────────
  plugins: {
    register: registerOutputPlugin,
    unregister: unregisterOutputPlugin,
    get: getPlugin,
    getAll: getAllPlugins,
    setEnabled: setPluginEnabled,
    dispatch: dispatchToPlugins,
    dispatchSync: dispatchToPluginsSync,
    initialize: initializePluginSystem,
    flush: flushAllPlugins,
    shutdown: shutdownPluginSystem,
    getState: getPluginSystemState,
    isReady: isPluginSystemReady,
    // Plugin factories for common patterns
    createConsole: createConsolePlugin,
    createBuffered: createBufferedPlugin,
    createFiltered: createFilteredPlugin,
    scrubber: {
      scrubEntry,
      getConfig: getScrubConfig,
      configure: configureScrubber,
      reset: resetScrubConfig,
    },
  },
  
  // ─── Correlation ID Tracking API ─────────────────────────────────────────
  correlation: {
    // ID generation
    generate: generateCorrelationId,
    generateShort: generateShortCorrelationId,
    
    // Context access
    getContext: getCurrentContext,
    getId: getCurrentCorrelationId,
    getParentId: getParentCorrelationId,
    getRootId: getRootCorrelationId,
    isInTrace,
    
    // Trace lifecycle (sync)
    startTrace,
    continueTrace,
    withCorrelation,
    
    // Trace lifecycle (async)
    startTraceAsync,
    continueTraceAsync,
    
    // Discord helpers
    startDiscordTrace,
    startDiscordTraceAsync,
    
    // Worker helpers
    startWorkerTrace,
    startWorkerTraceAsync,
    
    // Log enrichment
    enrich: enrichWithCorrelation,
    getData: getCorrelationData,
    
    // Diagnostics
    getStats: getCorrelationStats,
    getActiveTraces,
    getTraceById,
    resetStats: resetCorrelationStats,
  },
  
  // ─── Log Sampling API ────────────────────────────────────────────────────
  sampling: {
    // Configuration
    configure: configureSampling,
    remove: removeSamplingConfig,
    setDefault: setDefaultSamplingConfig,
    getConfig: getSamplingConfig,
    
    // Global control
    setEnabled: setSamplingEnabled,
    isEnabled: isSamplingEnabled,
    
    // Core sampling check
    shouldLog,
    
    // Sampled logger wrapper
    createLogger: createSampledLogger,
    
    // Statistics
    getStats: getSamplingStats,
    getComponentStats: getComponentSamplingStats,
    resetStats: resetSamplingStats,
    clearConfigs: clearSamplingConfigs,
    
    // Presets
    presets: SamplingPresets,
  },
  
  // ─── Audit ───────────────────────────────────────────────────────────────
  audit: getAuditTrail,

  // ─── Database Resource Manager ───────────────────────────────────────────
  dbResource: {
    getHealthReport: getDatabaseHealthReport,
    getGrowthTrend,
    getEffectiveRetentionDays,
    getAnomalies: getDbAnomalies,
    forceProbe,
    formatHealthSummary,
  },
};

export default Kernel;
