/**
 * Kernel Hooks — Integration Points for Application Systems
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BRIDGE BETWEEN APPLICATION AND KERNEL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides the hooks that application-level systems use to connect
 * to the kernel observer layer. Systems call these hooks to:
 * 
 * 1. Register themselves with the kernel
 * 2. Forward their logs/errors/events to the kernel
 * 3. Query kernel state and metrics
 * 
 * DESIGN PRINCIPLES:
 * - Zero dependencies on application code (kernel can't depend on what it observes)
 * - Fail-safe: if kernel fails, application continues normally
 * - Non-blocking: observations are queued, never block application flow
 * - Passive: kernel never modifies application state
 * 
 * @module kernel/hooks
 */

import {
  registerSystem,
  unregisterSystem,
  observeLog,
  observeError,
  observeService,
  observeEvent,
  onLog,
  onError,
  onService,
  onEvent,
  getMetrics,
  getSystemHealth,
  getRecentLogs,
  getRecentErrors,
  exportKernelState,
} from './kernel-observer.js';
import { kernel, getKernelUptime, getKernelLogs, exportKernelLogs } from './kernel-logger.js';
import { getErrors, getPatterns, getLearnings, exportErrorData } from './kernel-error-detector.js';
import type {
  SystemType as _SystemType,
  LogObservation as _LogObservation,
  ErrorObservation,
  ServiceObservation,
  EventObservation as _EventObservation,
  LogHook,
  ErrorHook,
  ServiceHook,
  EventHook,
  KernelMetrics as _KernelMetrics,
  SystemHealth as _SystemHealth,
  KernelStateExport as _KernelStateExport,
} from './kernel-types.js';
const writeHookError = (message: string, error: unknown): void => {
  const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message} ${details}\n`);
};

// ============================================================================
// HOOK FACADE — Safe wrappers that catch errors
// ============================================================================

/**
 * Wrap a function to catch errors (kernel should never crash the app)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safe<T extends (...args: any[]) => any>(fn: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((...args: any[]) => {
    try {
      return fn(...args);
    } catch (error) {
      // Log to console as fallback (kernel logger might be broken)
      writeHookError('[KERNEL HOOK ERROR]', error);
      return undefined;
    }
  }) as T;
}

// ============================================================================
// SYSTEM REGISTRATION HOOKS
// ============================================================================

/**
 * Create a hook for a logger system to connect to kernel
 * 
 * @example
 * // In shared/logger.ts
 * import { createLoggerHook } from '../kernel/hooks.js';
 * const kernelHook = createLoggerHook('shared-logger');
 * 
 * // On every log:
 * kernelHook.log('info', 'component', 'operation', 'message', metadata);
 */
export interface LoggerHook {
  systemId: string;
  log: (level: string, component: string, operation: string, message: string, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createLoggerHook = safe((name: string): LoggerHook => {
  const systemId = registerSystem('LOGGER', name);
  
  return {
    systemId,
    log: safe((level, component, operation, message, metadata) => {
      observeLog({
        source: name,
        level,
        component,
        operation,
        message,
        timestamp: new Date(),
        metadata,
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for an error tracking system to connect to kernel
 * 
 * @example
 * // In error-tracker.ts
 * import { createErrorTrackerHook } from '../kernel/hooks.js';
 * const kernelHook = createErrorTrackerHook('error-tracker');
 * 
 * // On every error:
 * kernelHook.error({ errorId, fingerprint, ... });
 */
export interface ErrorTrackerHook {
  systemId: string;
  error: (observation: Omit<ErrorObservation, 'uptimeMs' | 'source'>) => void;
  unregister: () => void;
}

export const createErrorTrackerHook = safe((name: string): ErrorTrackerHook => {
  const systemId = registerSystem('ERROR_TRACKER', name);
  
  return {
    systemId,
    error: safe((observation) => {
      observeError({
        ...observation,
        source: name,
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for the service registry to connect to kernel
 */
export interface ServiceRegistryHook {
  systemId: string;
  service: (serviceName: string, event: ServiceObservation['event'], previousState?: string, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createServiceRegistryHook = safe((name: string = 'service-registry'): ServiceRegistryHook => {
  const systemId = registerSystem('SERVICE', name);
  
  return {
    systemId,
    service: safe((serviceName, event, previousState, metadata) => {
      observeService({
        service: serviceName,
        event,
        previousState,
        timestamp: new Date(),
        metadata,
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for the event bus to connect to kernel
 */
export interface EventBusHook {
  systemId: string;
  event: (topic: string, correlationId: string, emitter?: string, payloadSize?: number, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createEventBusHook = safe((name: string = 'event-bus'): EventBusHook => {
  const systemId = registerSystem('EVENT_BUS', name);
  
  return {
    systemId,
    event: safe((topic, correlationId, emitter, payloadSize, metadata) => {
      observeEvent({
        topic,
        correlationId,
        emitter,
        timestamp: new Date(),
        payloadSize: payloadSize ?? 0,
        metadata,
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for database connections
 */
export interface DatabaseHook {
  systemId: string;
  query: (operation: string, durationMs: number, success: boolean, metadata?: Record<string, unknown>) => void;
  connection: (event: 'CONNECTED' | 'DISCONNECTED' | 'ERROR', metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createDatabaseHook = safe((name: string): DatabaseHook => {
  const systemId = registerSystem('DATABASE', name);
  
  return {
    systemId,
    query: safe((operation, durationMs, success, metadata) => {
      observeLog({
        source: name,
        level: success ? 'debug' : 'error',
        component: 'database',
        operation,
        message: `Query ${success ? 'completed' : 'failed'} in ${durationMs}ms`,
        timestamp: new Date(),
        metadata: { durationMs, success, ...metadata },
      });
    }),
    connection: safe((event, metadata) => {
      observeService({
        service: name,
        event: event === 'CONNECTED' ? 'HEALTHY' : event === 'DISCONNECTED' ? 'SHUTDOWN' : 'ERROR',
        timestamp: new Date(),
        metadata,
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for Discord clients
 */
export interface DiscordHook {
  systemId: string;
  status: (event: 'READY' | 'DISCONNECTED' | 'ERROR' | 'RECONNECTING', metadata?: Record<string, unknown>) => void;
  command: (commandName: string, userId: string, guildId?: string, success?: boolean) => void;
  unregister: () => void;
}

export const createDiscordHook = safe((name: string): DiscordHook => {
  const systemId = registerSystem('DISCORD', name);
  
  return {
    systemId,
    status: safe((event, metadata) => {
      const serviceEvent = event === 'READY' ? 'HEALTHY' 
        : event === 'DISCONNECTED' ? 'SHUTDOWN' 
        : event === 'ERROR' ? 'ERROR' 
        : 'DEGRADED';
      
      observeService({
        service: name,
        event: serviceEvent,
        timestamp: new Date(),
        metadata,
      });
    }),
    command: safe((commandName, userId, guildId, success = true) => {
      observeLog({
        source: name,
        level: success ? 'info' : 'warn',
        component: 'discord',
        operation: 'command',
        message: `Command /${commandName} ${success ? 'executed' : 'failed'}`,
        timestamp: new Date(),
        metadata: { commandName, userId, guildId, success },
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for workers
 */
export interface WorkerHook {
  systemId: string;
  status: (event: 'STARTED' | 'STOPPED' | 'ERROR' | 'EXECUTING', metadata?: Record<string, unknown>) => void;
  execution: (taskName: string, durationMs: number, success: boolean, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createWorkerHook = safe((name: string): WorkerHook => {
  const systemId = registerSystem('WORKER', name);
  
  return {
    systemId,
    status: safe((event, metadata) => {
      const serviceEvent = event === 'STARTED' ? 'HEALTHY' 
        : event === 'STOPPED' ? 'SHUTDOWN' 
        : event === 'ERROR' ? 'ERROR' 
        : 'HEALTHY';
      
      observeService({
        service: name,
        event: serviceEvent,
        timestamp: new Date(),
        metadata,
      });
    }),
    execution: safe((taskName, durationMs, success, metadata) => {
      observeLog({
        source: name,
        level: success ? 'debug' : 'error',
        component: 'worker',
        operation: taskName,
        message: `Task ${taskName} ${success ? 'completed' : 'failed'} in ${durationMs}ms`,
        timestamp: new Date(),
        metadata: { taskName, durationMs, success, ...metadata },
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for cache systems
 */
export interface CacheHook {
  systemId: string;
  hit: (key: string, metadata?: Record<string, unknown>) => void;
  miss: (key: string, metadata?: Record<string, unknown>) => void;
  eviction: (key: string, reason: string, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createCacheHook = safe((name: string): CacheHook => {
  const systemId = registerSystem('CACHE', name);
  
  return {
    systemId,
    hit: safe((key, metadata) => {
      observeLog({
        source: name,
        level: 'trace',
        component: 'cache',
        operation: 'hit',
        message: `Cache hit: ${key}`,
        timestamp: new Date(),
        metadata: { key, ...metadata },
      });
    }),
    miss: safe((key, metadata) => {
      observeLog({
        source: name,
        level: 'debug',
        component: 'cache',
        operation: 'miss',
        message: `Cache miss: ${key}`,
        timestamp: new Date(),
        metadata: { key, ...metadata },
      });
    }),
    eviction: safe((key, reason, metadata) => {
      observeLog({
        source: name,
        level: 'debug',
        component: 'cache',
        operation: 'eviction',
        message: `Cache eviction: ${key} (${reason})`,
        timestamp: new Date(),
        metadata: { key, reason, ...metadata },
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a custom hook for any system type
 */
export interface CustomHook {
  systemId: string;
  log: (level: string, component: string, operation: string, message: string, metadata?: Record<string, unknown>) => void;
  error: (observation: Omit<ErrorObservation, 'uptimeMs' | 'source'>) => void;
  unregister: () => void;
}

export const createCustomHook = safe((name: string): CustomHook => {
  const systemId = registerSystem('CUSTOM', name);
  
  return {
    systemId,
    log: safe((level, component, operation, message, metadata) => {
      observeLog({
        source: name,
        level,
        component,
        operation,
        message,
        timestamp: new Date(),
        metadata,
      });
    }),
    error: safe((observation) => {
      observeError({
        ...observation,
        source: name,
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for intelligence/analytics systems (ErrorBrain, PatternDetector, etc.)
 */
export interface IntelligenceHook {
  systemId: string;
  /** Report pattern detection (time anomaly, correlation, cascade) */
  pattern: (patternType: string, fingerprint: string, confidence: number, metadata?: Record<string, unknown>) => void;
  /** Report anomaly detection */
  anomaly: (metricName: string, actualValue: number, threshold: number, severity: string, metadata?: Record<string, unknown>) => void;
  /** Report cascade detection (root → children) */
  cascade: (rootFingerprint: string, childCount: number, depth: number, metadata?: Record<string, unknown>) => void;
  /** Report prediction made */
  prediction: (predictionType: string, confidence: number, metadata?: Record<string, unknown>) => void;
  /** Report learning update */
  learning: (learnType: string, fingerprint: string, metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createIntelligenceHook = safe((name: string): IntelligenceHook => {
  const systemId = registerSystem('INTELLIGENCE', name);
  
  return {
    systemId,
    pattern: safe((patternType, fingerprint, confidence, metadata) => {
      observeLog({
        source: name,
        level: 'info',
        component: 'intelligence',
        operation: 'pattern-detected',
        message: `Pattern ${patternType} detected for ${fingerprint} (confidence: ${confidence.toFixed(2)})`,
        timestamp: new Date(),
        metadata: { patternType, fingerprint, confidence, ...metadata },
      });
    }),
    anomaly: safe((metricName, actualValue, threshold, severity, metadata) => {
      observeLog({
        source: name,
        level: severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info',
        component: 'intelligence',
        operation: 'anomaly-detected',
        message: `Anomaly in ${metricName}: ${actualValue} (threshold: ${threshold})`,
        timestamp: new Date(),
        metadata: { metricName, actualValue, threshold, severity, ...metadata },
      });
    }),
    cascade: safe((rootFingerprint, childCount, depth, metadata) => {
      observeLog({
        source: name,
        level: 'warn',
        component: 'intelligence',
        operation: 'cascade-detected',
        message: `Cascade from ${rootFingerprint}: ${childCount} children, depth ${depth}`,
        timestamp: new Date(),
        metadata: { rootFingerprint, childCount, depth, ...metadata },
      });
    }),
    prediction: safe((predictionType, confidence, metadata) => {
      observeLog({
        source: name,
        level: 'info',
        component: 'intelligence',
        operation: 'prediction',
        message: `Prediction ${predictionType} (confidence: ${confidence.toFixed(2)})`,
        timestamp: new Date(),
        metadata: { predictionType, confidence, ...metadata },
      });
    }),
    learning: safe((learnType, fingerprint, metadata) => {
      observeLog({
        source: name,
        level: 'debug',
        component: 'intelligence',
        operation: 'learning-update',
        message: `Learning update: ${learnType} for ${fingerprint}`,
        timestamp: new Date(),
        metadata: { learnType, fingerprint, ...metadata },
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

/**
 * Create a hook for observability systems (ObservabilityHub, backends like Loki)
 */
export interface ObservabilityHook {
  systemId: string;
  /** Report backend registration/unregistration */
  backend: (action: 'register' | 'unregister', backendName: string, metadata?: Record<string, unknown>) => void;
  /** Report event received (from Event Bus or direct ingestion) */
  event: (source: 'eventbus' | 'direct', topic: string, metadata?: Record<string, unknown>) => void;
  /** Report batch flush (for backends like Loki) */
  batch: (batchSize: number, success: boolean, durationMs: number, metadata?: Record<string, unknown>) => void;
  /** Report failure (circuit breaker, queue overflow, etc.) */
  failure: (failureType: string, message: string, metadata?: Record<string, unknown>) => void;
  /** Report lifecycle change (start, stop) */
  lifecycle: (action: 'start' | 'stop', metadata?: Record<string, unknown>) => void;
  /** Report queue/buffer state */
  queue: (depth: number, capacity: number, backpressure: 'normal' | 'warn' | 'critical', metadata?: Record<string, unknown>) => void;
  unregister: () => void;
}

export const createObservabilityHook = safe((name: string): ObservabilityHook => {
  const systemId = registerSystem('OBSERVABILITY', name);
  
  return {
    systemId,
    backend: safe((action, backendName, metadata) => {
      observeLog({
        source: name,
        level: 'info',
        component: 'observability',
        operation: `backend-${action}`,
        message: `Backend ${backendName} ${action}ed`,
        timestamp: new Date(),
        metadata: { action, backendName, ...metadata },
      });
    }),
    event: safe((source, topic, metadata) => {
      observeLog({
        source: name,
        level: 'debug',
        component: 'observability',
        operation: 'event-received',
        message: `Event from ${source}: ${topic}`,
        timestamp: new Date(),
        metadata: { source, topic, ...metadata },
      });
    }),
    batch: safe((batchSize, success, durationMs, metadata) => {
      observeLog({
        source: name,
        level: success ? 'debug' : 'warn',
        component: 'observability',
        operation: 'batch-flush',
        message: `Batch flush: ${batchSize} entries, ${success ? 'success' : 'failed'}, ${durationMs}ms`,
        timestamp: new Date(),
        metadata: { batchSize, success, durationMs, ...metadata },
      });
    }),
    failure: safe((failureType, message, metadata) => {
      observeLog({
        source: name,
        level: 'error',
        component: 'observability',
        operation: 'failure',
        message: `${failureType}: ${message}`,
        timestamp: new Date(),
        metadata: { failureType, ...metadata },
      });
    }),
    lifecycle: safe((action, metadata) => {
      observeLog({
        source: name,
        level: 'info',
        component: 'observability',
        operation: `lifecycle-${action}`,
        message: `Observability system ${action}ed`,
        timestamp: new Date(),
        metadata: { action, ...metadata },
      });
    }),
    queue: safe((depth, capacity, backpressure, metadata) => {
      const level = backpressure === 'critical' ? 'warn' : backpressure === 'warn' ? 'info' : 'debug';
      observeLog({
        source: name,
        level,
        component: 'observability',
        operation: 'queue-state',
        message: `Queue: ${depth}/${capacity} (${backpressure})`,
        timestamp: new Date(),
        metadata: { depth, capacity, backpressure, ...metadata },
      });
    }),
    unregister: () => unregisterSystem(systemId),
  };
});

// ============================================================================
// REAL-TIME OBSERVATION SUBSCRIPTIONS
// ============================================================================

/**
 * Subscribe to real-time log observations
 */
export const subscribeToLogs = safe((hook: LogHook): (() => void) => {
  return onLog(hook);
});

/**
 * Subscribe to real-time error observations
 */
export const subscribeToErrors = safe((hook: ErrorHook): (() => void) => {
  return onError(hook);
});

/**
 * Subscribe to real-time service observations
 */
export const subscribeToServices = safe((hook: ServiceHook): (() => void) => {
  return onService(hook);
});

/**
 * Subscribe to real-time event observations
 */
export const subscribeToEvents = safe((hook: EventHook): (() => void) => {
  return onEvent(hook);
});

// ============================================================================
// QUERY API — Read kernel state
// ============================================================================

export const queryKernel = {
  /** Get kernel uptime in milliseconds */
  uptime: safe(getKernelUptime),
  
  /** Get kernel metrics */
  metrics: safe(getMetrics),
  
  /** Get health status of all systems */
  health: safe(getSystemHealth),
  
  /** Get recent logs (from kernel observation buffer) */
  recentLogs: safe((limit?: number) => getRecentLogs(limit ?? 100)),
  
  /** Get recent errors (from kernel observation buffer) */
  recentErrors: safe((limit?: number) => getRecentErrors(limit ?? 100)),
  
  /** Get kernel's own logs (from ring buffer) */
  kernelLogs: safe((options?: Parameters<typeof getKernelLogs>[0]) => getKernelLogs(options)),
  
  /** Get kernel's own captured errors */
  kernelErrors: safe((options?: Parameters<typeof getErrors>[0]) => getErrors(options)),
  
  /** Get error patterns detected by kernel */
  errorPatterns: safe(getPatterns),
  
  /** Get ML learnings from kernel error detector */
  learnings: safe(getLearnings),
  
  /** Export complete kernel state */
  exportState: safe(exportKernelState),
  
  /** Export kernel logs for archival */
  exportLogs: safe(exportKernelLogs),
  
  /** Export kernel error data */
  exportErrors: safe(exportErrorData),
};

// ============================================================================
// QUICK LOG HELPERS
// ============================================================================

/**
 * Quick log to kernel (for systems that don't need full hooks)
 */
export const kernelLog = {
  debug: safe((component: string, message: string, metadata?: Record<string, unknown>) => {
    kernel.debug(component, message, metadata);
  }),
  info: safe((component: string, message: string, metadata?: Record<string, unknown>) => {
    kernel.info(component, message, metadata);
  }),
  warn: safe((component: string, message: string, metadata?: Record<string, unknown>) => {
    kernel.warn(component, message, metadata);
  }),
  error: safe((component: string, message: string, metadata?: Record<string, unknown>) => {
    kernel.error(component, message, metadata);
  }),
  critical: safe((component: string, message: string, metadata?: Record<string, unknown>) => {
    kernel.critical(component, message, metadata);
  }),
};
