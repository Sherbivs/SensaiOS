/**
 * Kernel Observer — Root Observation Layer
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ALL-SEEING EYE OF THE SYSTEM
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides the root observation layer that sits ABOVE all other
 * systems. It receives observations from:
 * 
 * - Application loggers (shared/logger.ts, utils/logger.ts)
 * - Error tracking (error-tracker.ts, error-learning.ts)
 * - Service registry (service-registry.ts)
 * - Event bus (event-bus.ts)
 * - Database connections
 * - Discord clients
 * - All workers and services
 * 
 * The observer is PASSIVE — it only watches and records. It never interferes
 * with the systems it observes.
 * 
 * @module kernel/observer
 */

import { kernel, getKernelUptime } from './kernel-logger.js';
import { captureError, getPhase } from './kernel-error-detector.js';
import type {
  SystemType,
  SystemRegistration,
  LogObservation,
  ErrorObservation,
  ServiceObservation,
  EventObservation,
  LogHook,
  ErrorHook,
  ServiceHook,
  EventHook,
  KernelMetrics,
  SystemHealth,
  KernelStateExport,
  KernelAuditEntry,
} from './kernel-types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_OBSERVATION_BUFFER = 1000;   // Recent observations to keep
const MAX_AUDIT_ENTRIES = 500;         // Audit trail entries
const METRICS_WINDOW_MS = 60_000;      // 1 minute window for rate calculations

// ============================================================================
// STATE
// ============================================================================

// Registered systems
const registeredSystems = new Map<string, SystemRegistration>();

// Observation buffers (ring buffers)
const logObservations: LogObservation[] = [];
const errorObservations: ErrorObservation[] = [];
const serviceObservations: ServiceObservation[] = [];
const eventObservations: EventObservation[] = [];

// Audit trail
const auditTrail: KernelAuditEntry[] = [];

// Observation hooks (for real-time forwarding)
const logHooks: LogHook[] = [];
const errorHooks: ErrorHook[] = [];
const serviceHooks: ServiceHook[] = [];
const eventHooks: EventHook[] = [];

// Counters
let totalLogObservations = 0;
let totalErrorObservations = 0;
let totalServiceObservations = 0;
let totalEventObservations = 0;

// Rate tracking
const observationTimestamps: number[] = [];
let peakObservationsPerSecond = 0;

// Boot timing
let bootStartTime = Date.now();
let bootCompleteTime = 0;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the kernel observer
 * Called automatically when module loads
 */
export function initializeObserver(): void {
  bootStartTime = Date.now();
  kernel.boot('observer', 'Kernel Observer initialized — root observation layer active');
  addAuditEntry('LIFECYCLE', 'Observer initialized', { bootStartTime });
}

// Auto-initialize
initializeObserver();

// ============================================================================
// SYSTEM REGISTRATION
// ============================================================================

/**
 * Register a system with the kernel observer
 * 
 * Systems MUST register to be observed. This creates the connection between
 * application-level systems and the kernel observation layer.
 * 
 * @param type - System type category
 * @param name - Human-readable name
 * @param metadata - Optional metadata
 * @returns System ID for future reference
 */
export function registerSystem(
  type: SystemType,
  name: string,
  metadata?: Record<string, unknown>
): string {
  const id = `${type.toLowerCase()}-${name.toLowerCase()}-${Date.now().toString(36)}`;
  
  const registration: SystemRegistration = {
    id,
    type,
    name,
    registeredAt: getKernelUptime(),
    metadata,
  };
  
  registeredSystems.set(id, registration);
  
  kernel.info('observer', `System registered: [${type}] ${name}`, { id });
  addAuditEntry('SYSTEM', `System registered: ${name}`, { id, type, name });
  
  return id;
}

/**
 * Unregister a system (during shutdown)
 */
export function unregisterSystem(id: string): void {
  const system = registeredSystems.get(id);
  if (system) {
    registeredSystems.delete(id);
    kernel.info('observer', `System unregistered: [${system.type}] ${system.name}`);
    addAuditEntry('SYSTEM', `System unregistered: ${system.name}`, { id });
  }
}

/**
 * Get all registered systems
 */
export function getRegisteredSystems(): SystemRegistration[] {
  return Array.from(registeredSystems.values());
}

// ============================================================================
// OBSERVATION RECEIVERS
// ============================================================================

/**
 * Receive a log observation from an application logger
 * 
 * Application loggers call this to notify kernel of every log entry.
 * The kernel records it and forwards to any registered hooks.
 */
export function observeLog(observation: Omit<LogObservation, 'uptimeMs'>): void {
  const fullObservation: LogObservation = {
    ...observation,
    uptimeMs: getKernelUptime(),
  };
  
  // Add to buffer (ring buffer behavior)
  logObservations.push(fullObservation);
  if (logObservations.length > MAX_OBSERVATION_BUFFER) {
    logObservations.shift();
  }
  
  totalLogObservations++;
  trackObservationRate();
  
  // Forward to hooks
  for (const hook of logHooks) {
    try {
      hook(fullObservation);
    } catch (error) {
      captureError(
        error instanceof Error ? error : new Error(String(error)),
        'explicit',
        { component: 'observer', operation: 'log-hook' }
      );
    }
  }
}

/**
 * Receive an error observation from application error systems
 */
export function observeError(observation: Omit<ErrorObservation, 'uptimeMs'>): void {
  const fullObservation: ErrorObservation = {
    ...observation,
    uptimeMs: getKernelUptime(),
  };
  
  // Add to buffer
  errorObservations.push(fullObservation);
  if (errorObservations.length > MAX_OBSERVATION_BUFFER) {
    errorObservations.shift();
  }
  
  totalErrorObservations++;
  trackObservationRate();
  
  // Also capture in kernel error detector (for kernel-level tracking)
  // This ensures errors are tracked even if the application error system fails
  captureError(
    new Error(`[${observation.category}] ${observation.message}`),
    'explicit',
    {
      component: 'observed-error',
      operation: observation.source,
      metadata: {
        originalId: observation.errorId,
        fingerprint: observation.fingerprint,
        severity: observation.severity,
      },
    }
  );
  
  // Forward to hooks
  for (const hook of errorHooks) {
    try {
      hook(fullObservation);
    } catch (error) {
      // Don't recurse — just log to kernel
      kernel.error('observer', `Error hook failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Receive a service lifecycle observation
 */
export function observeService(observation: Omit<ServiceObservation, 'uptimeMs'>): void {
  const fullObservation: ServiceObservation = {
    ...observation,
    uptimeMs: getKernelUptime(),
  };
  
  // Add to buffer
  serviceObservations.push(fullObservation);
  if (serviceObservations.length > MAX_OBSERVATION_BUFFER) {
    serviceObservations.shift();
  }
  
  totalServiceObservations++;
  trackObservationRate();
  
  // Log significant events at kernel level
  if (observation.event === 'ERROR' || observation.event === 'SHUTDOWN') {
    kernel.warn('observer', `Service ${observation.event}: ${observation.service}`);
  } else {
    kernel.debug('observer', `Service ${observation.event}: ${observation.service}`);
  }
  
  // Forward to hooks
  for (const hook of serviceHooks) {
    try {
      hook(fullObservation);
    } catch (error) {
      captureError(
        error instanceof Error ? error : new Error(String(error)),
        'explicit',
        { component: 'observer', operation: 'service-hook' }
      );
    }
  }
}

/**
 * Receive an event bus observation
 */
export function observeEvent(observation: Omit<EventObservation, 'uptimeMs'>): void {
  const fullObservation: EventObservation = {
    ...observation,
    uptimeMs: getKernelUptime(),
  };
  
  // Add to buffer
  eventObservations.push(fullObservation);
  if (eventObservations.length > MAX_OBSERVATION_BUFFER) {
    eventObservations.shift();
  }
  
  totalEventObservations++;
  trackObservationRate();
  
  // Forward to hooks
  for (const hook of eventHooks) {
    try {
      hook(fullObservation);
    } catch (error) {
      captureError(
        error instanceof Error ? error : new Error(String(error)),
        'explicit',
        { component: 'observer', operation: 'event-hook' }
      );
    }
  }
}

// ============================================================================
// HOOK REGISTRATION
// ============================================================================

/**
 * Register a hook to receive log observations in real-time
 */
export function onLog(hook: LogHook): () => void {
  logHooks.push(hook);
  kernel.debug('observer', 'Log hook registered');
  return () => {
    const index = logHooks.indexOf(hook);
    if (index >= 0) logHooks.splice(index, 1);
  };
}

/**
 * Register a hook to receive error observations in real-time
 */
export function onError(hook: ErrorHook): () => void {
  errorHooks.push(hook);
  kernel.debug('observer', 'Error hook registered');
  return () => {
    const index = errorHooks.indexOf(hook);
    if (index >= 0) errorHooks.splice(index, 1);
  };
}

/**
 * Register a hook to receive service observations in real-time
 */
export function onService(hook: ServiceHook): () => void {
  serviceHooks.push(hook);
  kernel.debug('observer', 'Service hook registered');
  return () => {
    const index = serviceHooks.indexOf(hook);
    if (index >= 0) serviceHooks.splice(index, 1);
  };
}

/**
 * Register a hook to receive event observations in real-time
 */
export function onEvent(hook: EventHook): () => void {
  eventHooks.push(hook);
  kernel.debug('observer', 'Event hook registered');
  return () => {
    const index = eventHooks.indexOf(hook);
    if (index >= 0) eventHooks.splice(index, 1);
  };
}

// ============================================================================
// METRICS & QUERIES
// ============================================================================

/**
 * Track observation rate for metrics
 */
function trackObservationRate(): void {
  const now = Date.now();
  observationTimestamps.push(now);
  
  // Clean old timestamps (outside window)
  const cutoff = now - METRICS_WINDOW_MS;
  while (observationTimestamps.length > 0 && observationTimestamps[0] < cutoff) {
    observationTimestamps.shift();
  }
  
  // Calculate current rate
  const rate = observationTimestamps.length / (METRICS_WINDOW_MS / 1000);
  if (rate > peakObservationsPerSecond) {
    peakObservationsPerSecond = rate;
  }
}

/**
 * Get kernel metrics
 */
export function getMetrics(): KernelMetrics {
  const now = Date.now();
  const uptimeMs = getKernelUptime();
  
  // Calculate observations per second
  const recentTimestamps = observationTimestamps.filter(t => t > now - METRICS_WINDOW_MS);
  const observationsPerSecond = recentTimestamps.length / (METRICS_WINDOW_MS / 1000);
  
  // Count systems by type
  const systemsByType: Record<SystemType, number> = {
    LOGGER: 0,
    ERROR_TRACKER: 0,
    SERVICE: 0,
    EVENT_BUS: 0,
    DATABASE: 0,
    DISCORD: 0,
    WORKER: 0,
    CACHE: 0,
    INTELLIGENCE: 0,
    OBSERVABILITY: 0,
    CUSTOM: 0,
  };
  
  for (const system of registeredSystems.values()) {
    systemsByType[system.type]++;
  }
  
  // Get kernel internal stats
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getKernelLogStats } = require('./kernel-logger.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getErrorStats } = require('./kernel-error-detector.js');
  const logStats = getKernelLogStats();
  const errorStats = getErrorStats();
  
  return {
    uptimeMs,
    bootTimeMs: bootCompleteTime > 0 ? bootCompleteTime - bootStartTime : 0,
    currentPhase: getPhase(),
    phaseHistory: [], // TODO: Track phase transitions
    registeredSystems: registeredSystems.size,
    systemsByType,
    totalLogObservations,
    totalErrorObservations,
    totalServiceObservations,
    totalEventObservations,
    kernelLogEntries: logStats.totalEntries,
    kernelErrorEntries: errorStats.totalCaptured,
    ringBufferUtilization: logStats.totalEntries / 10000, // Assuming 10k buffer
    observationsPerSecond,
    peakObservationsPerSecond,
  };
}

/**
 * Get health status for all registered systems
 */
export function getSystemHealth(): SystemHealth[] {
  const health: SystemHealth[] = [];
  const now = getKernelUptime();
  
  for (const system of registeredSystems.values()) {
    // Count observations for this system
    const logCount = logObservations.filter(o => o.source === system.name).length;
    const errorCount = errorObservations.filter(o => o.source === system.name).length;
    
    // Find last observation
    let lastSeen = system.registeredAt;
    for (const o of logObservations) {
      if (o.source === system.name && o.uptimeMs > lastSeen) lastSeen = o.uptimeMs;
    }
    for (const o of errorObservations) {
      if (o.source === system.name && o.uptimeMs > lastSeen) lastSeen = o.uptimeMs;
    }
    
    // Determine status
    let status: SystemHealth['status'] = 'HEALTHY';
    if (errorCount > 10) status = 'ERROR';
    else if (errorCount > 3) status = 'DEGRADED';
    else if (now - lastSeen > 300_000) status = 'UNKNOWN'; // 5 min silence
    
    health.push({
      id: system.id,
      type: system.type,
      name: system.name,
      status,
      lastSeen,
      observationCount: logCount,
      errorCount,
    });
  }
  
  return health;
}

/**
 * Get recent log observations
 */
export function getRecentLogs(limit = 100): LogObservation[] {
  return logObservations.slice(-limit);
}

/**
 * Get recent error observations
 */
export function getRecentErrors(limit = 100): ErrorObservation[] {
  return errorObservations.slice(-limit);
}

/**
 * Get recent service observations
 */
export function getRecentServices(limit = 100): ServiceObservation[] {
  return serviceObservations.slice(-limit);
}

/**
 * Get recent event observations
 */
export function getRecentEvents(limit = 100): EventObservation[] {
  return eventObservations.slice(-limit);
}

// ============================================================================
// AUDIT TRAIL
// ============================================================================

/**
 * Add an entry to the kernel audit trail
 */
function addAuditEntry(
  category: KernelAuditEntry['category'],
  event: string,
  details: Record<string, unknown>
): void {
  const entry: KernelAuditEntry = {
    uptimeMs: getKernelUptime(),
    event,
    category,
    details,
  };
  
  auditTrail.push(entry);
  if (auditTrail.length > MAX_AUDIT_ENTRIES) {
    auditTrail.shift();
  }
}

/**
 * Get audit trail
 */
export function getAuditTrail(limit = 100): KernelAuditEntry[] {
  return auditTrail.slice(-limit);
}

// ============================================================================
// EXPORT
// ============================================================================

/**
 * Export complete kernel state
 */
export function exportKernelState(): KernelStateExport {
  return {
    exportedAt: new Date().toISOString(),
    uptimeMs: getKernelUptime(),
    phase: getPhase(),
    metrics: getMetrics(),
    systems: getRegisteredSystems(),
    systemHealth: getSystemHealth(),
    recentLogs: getRecentLogs(500),
    recentErrors: getRecentErrors(500),
    recentServices: getRecentServices(100),
    recentEvents: getRecentEvents(100),
  };
}

/**
 * Signal that boot is complete (for boot time tracking)
 */
export function signalBootComplete(): void {
  bootCompleteTime = Date.now();
  kernel.boot('observer', `Boot complete in ${bootCompleteTime - bootStartTime}ms`);
  addAuditEntry('LIFECYCLE', 'Boot complete', { 
    bootTimeMs: bootCompleteTime - bootStartTime 
  });
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Shutdown the observer (final cleanup)
 */
export function shutdownObserver(): void {
  kernel.boot('observer', 'Kernel Observer shutting down');
  addAuditEntry('LIFECYCLE', 'Observer shutdown', {
    totalLogObservations,
    totalErrorObservations,
    totalServiceObservations,
    totalEventObservations,
    registeredSystems: registeredSystems.size,
  });
  
  // Clear hooks (prevent memory leaks)
  logHooks.length = 0;
  errorHooks.length = 0;
  serviceHooks.length = 0;
  eventHooks.length = 0;
}
