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
  category: 'LIFECYCLE' | 'SYSTEM' | 'OBSERVATION' | 'ERROR' | 'CONFIG';
  details: Record<string, unknown>;
}
