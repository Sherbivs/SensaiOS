/**
 * Kernel Types — Root Observer Type Definitions
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THE KERNEL IS THE ROOT OF ALL OBSERVATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This file defines all types used by the kernel layer. The kernel sits ABOVE
 * all other systems and has visibility into everything. These types are the
 * contract for how application systems communicate with the kernel.
 * 
 * @module kernel/types
 */

// ============================================================================
// LIFECYCLE PHASES
// ============================================================================

/**
 * Application lifecycle phases (kernel tracks progression)
 */
export type LifecyclePhase = 
  | 'PRE_BOOT'      // Before any code runs (kernel init)
  | 'MODULE_LOAD'   // Importing modules
  | 'INIT'          // Service initialization
  | 'RUNTIME'       // Normal operation
  | 'SHUTDOWN';     // Graceful shutdown

// ============================================================================
// SYSTEM REGISTRATION
// ============================================================================

/**
 * System types that can register with the kernel
 */
export type SystemType = 
  | 'LOGGER'          // Logging systems (logger.ts, intelligent-logger)
  | 'ERROR_TRACKER'   // Error tracking systems (error-tracker.ts)
  | 'SERVICE'         // Service Registry services
  | 'EVENT_BUS'       // Event bus
  | 'DATABASE'        // Database connections
  | 'DISCORD'         // Discord clients
  | 'WORKER'          // Background workers
  | 'CACHE'           // Cache systems
  | 'INTELLIGENCE'    // Intelligence/analytics systems (ErrorBrain, PatternDetector)
  | 'OBSERVABILITY'   // Observability layer (ObservabilityHub, backends)
  | 'CUSTOM';         // User-defined systems

/**
 * Registration info for a system hooking into kernel
 */
export interface SystemRegistration {
  id: string;                    // Unique identifier
  type: SystemType;              // Category
  name: string;                  // Human-readable name
  version?: string;              // Optional version
  registeredAt: number;          // Uptime ms when registered
  metadata?: Record<string, unknown>;
}

// ============================================================================
// OBSERVATION EVENTS
// ============================================================================

/**
 * Log observation from application loggers
 */
export interface LogObservation {
  source: string;                // Which logger (shared/logger, utils/logger, etc.)
  level: string;                 // Log level (debug, info, warn, error, etc.)
  component: string;             // Component that logged
  operation: string;             // Operation context
  message: string;               // Log message
  timestamp: Date;               // When it was logged
  uptimeMs: number;              // Kernel uptime when observed
  correlationId?: string;        // Correlation ID if present
  metadata?: Record<string, unknown>;
}

/**
 * Error observation from application error systems
 */
export interface ErrorObservation {
  source: string;                // Which error system (error-tracker, etc.)
  errorId: string;               // Unique error ID
  fingerprint: string;           // Error fingerprint for dedup
  category: string;              // Error category
  severity: string;              // Error severity
  name: string;                  // Error name
  message: string;               // Error message
  stack?: string;                // Stack trace
  timestamp: Date;               // When error occurred
  uptimeMs: number;              // Kernel uptime when observed
  context?: Record<string, unknown>;
}

/**
 * Service lifecycle observation
 */
export interface ServiceObservation {
  service: string;               // Service name
  event: 'REGISTERED' | 'INITIALIZING' | 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'SHUTDOWN';
  previousState?: string;        // Previous state if transition
  timestamp: Date;
  uptimeMs: number;
  metadata?: Record<string, unknown>;
}

/**
 * Event bus observation
 */
export interface EventObservation {
  topic: string;                 // Event topic
  correlationId: string;         // Event correlation ID
  emitter?: string;              // Who emitted
  timestamp: Date;
  uptimeMs: number;
  payloadSize: number;           // Size of payload in bytes
  metadata?: Record<string, unknown>;
}

// ============================================================================
// KERNEL HOOKS (Observer Callbacks)
// ============================================================================

/**
 * Hook that receives log observations
 */
export type LogHook = (observation: LogObservation) => void;

/**
 * Hook that receives error observations
 */
export type ErrorHook = (observation: ErrorObservation) => void;

/**
 * Hook that receives service observations
 */
export type ServiceHook = (observation: ServiceObservation) => void;

/**
 * Hook that receives event observations
 */
export type EventHook = (observation: EventObservation) => void;

/**
 * Generic observation hook
 */
export type ObservationHook<T> = (observation: T) => void;

// ============================================================================
// METRICS & AGGREGATIONS
// ============================================================================

/**
 * Kernel metrics (aggregated view of entire system)
 */
export interface KernelMetrics {
  // Timing
  uptimeMs: number;
  bootTimeMs: number;
  
  // Phases
  currentPhase: LifecyclePhase;
  phaseHistory: Array<{ phase: LifecyclePhase; at: number }>;
  
  // Systems
  registeredSystems: number;
  systemsByType: Record<SystemType, number>;
  
  // Observations
  totalLogObservations: number;
  totalErrorObservations: number;
  totalServiceObservations: number;
  totalEventObservations: number;
  
  // Kernel internals
  kernelLogEntries: number;
  kernelErrorEntries: number;
  ringBufferUtilization: number;  // 0-1
  
  // Performance
  observationsPerSecond: number;
  peakObservationsPerSecond: number;
}

/**
 * System health from kernel perspective
 */
export interface SystemHealth {
  id: string;
  type: SystemType;
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'ERROR' | 'UNKNOWN';
  lastSeen: number;              // Uptime ms when last observed
  observationCount: number;
  errorCount: number;
}

// ============================================================================
// EXPORT STRUCTURES
// ============================================================================

/**
 * Complete kernel state export (for debugging/analysis)
 */
export interface KernelStateExport {
  exportedAt: string;            // ISO timestamp
  uptimeMs: number;
  phase: LifecyclePhase;
  metrics: KernelMetrics;
  systems: SystemRegistration[];
  systemHealth: SystemHealth[];
  recentLogs: LogObservation[];
  recentErrors: ErrorObservation[];
  recentServices: ServiceObservation[];
  recentEvents: EventObservation[];
}

/**
 * Kernel audit trail entry
 */
export interface KernelAuditEntry {
  uptimeMs: number;
  event: string;
  category: 'LIFECYCLE' | 'SYSTEM' | 'OBSERVATION' | 'ERROR' | 'CONFIG' | 'METRIC';
  details: Record<string, unknown>;
}

// ============================================================================
// INFRASTRUCTURE METRICS (Kernel-Level Resource Tracking)
// ============================================================================

/**
 * Resource metric observation from infrastructure monitors
 */
export interface ResourceMetricObservation {
  source: string;                // Which monitor (resource-monitor, prometheus, etc.)
  category: MetricCategory;      // Category of metric
  name: string;                  // Metric name
  value: number;                 // Current value
  unit: MetricUnit;              // Unit of measurement
  timestamp: Date;               // When measured
  uptimeMs: number;              // Kernel uptime when observed
  labels?: Record<string, string>;  // Prometheus-style labels
  metadata?: Record<string, unknown>;
}

/**
 * Metric categories for infrastructure monitoring
 */
export type MetricCategory = 
  | 'MEMORY'        // RAM, heap, buffers
  | 'CPU'           // CPU usage, load
  | 'DISK'          // Disk I/O, storage
  | 'NETWORK'       // Network I/O, connections
  | 'DATABASE'      // Query times, connections
  | 'CACHE'         // Hit rates, sizes
  | 'WORKER'        // Task durations, queue sizes
  | 'DISCORD'       // API latency, shard status
  | 'GAME'          // Battle durations, encounters
  | 'SYSTEM';       // Generic system metrics

/**
 * Metric units for values
 */
export type MetricUnit = 
  | 'bytes'         // Memory, disk
  | 'percent'       // CPU, utilization
  | 'count'         // Counters
  | 'milliseconds'  // Latency, duration
  | 'seconds'       // Uptime
  | 'rate'          // Per-second rates
  | 'ratio'         // Hit ratios (0-1)
  | 'gauge';        // Point-in-time values

/**
 * Metric type (Prometheus-style)
 */
export type MetricType = 
  | 'counter'       // Only increases
  | 'gauge'         // Can go up/down
  | 'histogram'     // Distribution buckets
  | 'summary';      // Percentiles

/**
 * Hook for metric observations
 */
export type MetricHook = (observation: ResourceMetricObservation) => void;

/**
 * Infrastructure metrics summary
 */
export interface InfrastructureMetrics {
  // Memory (RAM)
  memoryRssMB: number;
  memoryHeapUsedMB: number;
  memoryHeapTotalMB: number;
  memoryExternalMB: number;
  memoryUtilizationPercent: number;
  
  // CPU
  cpuUsagePercent: number;
  eventLoopLagMs: number;
  
  // Storage  
  diskUsedMB: number;
  diskFreeMB: number;
  diskUtilizationPercent: number;
  
  // Database
  dbConnectionsActive: number;
  dbQueryLatencyMs: number;
  dbQueryCount: number;
  
  // Cache
  cacheHitRate: number;
  cacheSizeMB: number;
  cacheEntryCount: number;
  
  // Workers
  workersActive: number;
  workersIdle: number;
  workerTasksCompleted: number;
  workerTasksFailed: number;
  
  // Discord
  discordLatencyMs: number;
  discordGatewayStatus: string;
  
  // Aggregated
  healthScore: number;          // 0-100 overall health
  alertLevel: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  lastUpdated: Date;
}

/**
 * Metric definition for registration
 */
export interface MetricDefinition {
  name: string;
  category: MetricCategory;
  type: MetricType;
  unit: MetricUnit;
  description: string;
  labels?: string[];
}
