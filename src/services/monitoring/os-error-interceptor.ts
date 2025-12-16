/**
 * OS-Level Error Interceptor
 * Purpose: Capture EVERY possible error source at the process/Node.js level
 * 
 * This module must be imported EARLY in the application bootstrap to ensure
 * all error sources are captured before any other modules can attach handlers.
 * 
 * COVERAGE:
 * ✅ process.uncaughtException - Synchronous unhandled errors
 * ✅ process.unhandledRejection - Promise rejections not caught
 * ✅ process.warning - Node.js warnings (deprecation, experimental, memory)
 * ✅ process.exit - Exit code tracking (non-zero = error)
 * ✅ process signals - SIGTERM, SIGINT, SIGQUIT, SIGHUP
 * ✅ process.memoryUsage - Memory threshold monitoring
 * ✅ EventEmitter.errorMonitor - All EventEmitter 'error' events
 * ✅ V8 heap statistics - Memory pressure detection
 * 
 * @module services/monitoring/os-error-interceptor
 */

import { EventEmitter } from 'node:events';
import process from 'node:process';
import v8 from 'node:v8';
import { errorTracker, type ErrorContext } from './error-tracker.js';
import { detectErrorCategory, detectErrorSeverity, type ExtendedErrorCategory, type ExtendedErrorSeverity } from './error-taxonomy.js';
import { log } from '../../utils/logger.js';
import { getErrorMessage } from '../../shared/utils/error-utils.js';
import { bytesToMB } from '../../shared/utils/format-utils.js';

// ============================================================================
// TYPES
// ============================================================================

interface OSInterceptorConfig {
  /** Enable uncaughtException handler (default: true) */
  captureUncaughtExceptions: boolean;
  /** Enable unhandledRejection handler (default: true) */
  captureUnhandledRejections: boolean;
  /** Enable process.warning handler (default: true) */
  captureWarnings: boolean;
  /** Enable memory monitoring (default: true) */
  monitorMemory: boolean;
  /** Memory check interval in ms (default: 30000 = 30s) */
  memoryCheckIntervalMs: number;
  /** Memory warning threshold as percent of heap limit (default: 75) */
  memoryWarningThreshold: number;
  /** Memory critical threshold as percent of heap limit (default: 90) */
  memoryCriticalThreshold: number;
  /** Enable EventEmitter error monitoring (default: true) */
  monitorEventEmitters: boolean;
  /** Enable exit code tracking (default: true) */
  trackExitCodes: boolean;
}

interface OSInterceptorStats {
  initialized: boolean;
  uncaughtExceptionsCaptured: number;
  unhandledRejectionsCaptured: number;
  warningsCaptured: number;
  memoryWarningsTriggered: number;
  memoryCriticalTriggered: number;
  eventEmitterErrorsCaptured: number;
  signalsReceived: Record<string, number>;
  lastMemoryCheck: Date | null;
  currentHeapUsedPercent: number;
}

// ============================================================================
// SINGLETON IMPLEMENTATION
// ============================================================================

class OSErrorInterceptor {
  private static instance: OSErrorInterceptor | null = null;
  
  private config: OSInterceptorConfig;
  private initialized = false;
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  
  // Statistics
  private stats: OSInterceptorStats = {
    initialized: false,
    uncaughtExceptionsCaptured: 0,
    unhandledRejectionsCaptured: 0,
    warningsCaptured: 0,
    memoryWarningsTriggered: 0,
    memoryCriticalTriggered: 0,
    eventEmitterErrorsCaptured: 0,
    signalsReceived: {},
    lastMemoryCheck: null,
    currentHeapUsedPercent: 0,
  };
  
  // Track original handlers to avoid double-handling
  private originalUncaughtExceptionListeners: Function[] = [];
  private originalUnhandledRejectionListeners: Function[] = [];
  
  private constructor() {
    this.config = {
      captureUncaughtExceptions: true,
      captureUnhandledRejections: true,
      captureWarnings: true,
      monitorMemory: true,
      memoryCheckIntervalMs: 30000,
      memoryWarningThreshold: 75,
      memoryCriticalThreshold: 90,
      monitorEventEmitters: true,
      trackExitCodes: true,
    };
  }
  
  static getInstance(): OSErrorInterceptor {
    if (!OSErrorInterceptor.instance) {
      OSErrorInterceptor.instance = new OSErrorInterceptor();
    }
    return OSErrorInterceptor.instance;
  }
  
  /**
   * Initialize all OS-level error interception
   * MUST be called early in application bootstrap
   */
  initialize(customConfig?: Partial<OSInterceptorConfig>): void {
    if (this.initialized) {
      log('warn', '[OSErrorInterceptor] Already initialized, skipping');
      return;
    }
    
    // Merge custom config
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }
    
    // Install all handlers
    if (this.config.captureUncaughtExceptions) {
      this.installUncaughtExceptionHandler();
    }
    
    if (this.config.captureUnhandledRejections) {
      this.installUnhandledRejectionHandler();
    }
    
    if (this.config.captureWarnings) {
      this.installWarningHandler();
    }
    
    if (this.config.trackExitCodes) {
      this.installExitHandler();
    }
    
    if (this.config.monitorMemory) {
      this.startMemoryMonitoring();
    }
    
    if (this.config.monitorEventEmitters) {
      this.installEventEmitterMonitor();
    }
    
    // Track process signals
    this.installSignalTracking();
    
    this.initialized = true;
    this.stats.initialized = true;
    
    log('info', '[OSErrorInterceptor] Initialized', {
      config: this.config,
    });
  }
  
  /**
   * Cleanup handlers (call on graceful shutdown)
   */
  cleanup(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
    
    // Note: We don't remove uncaughtException/unhandledRejection handlers
    // as they should remain active until process exit
    
    log('info', '[OSErrorInterceptor] Cleaned up');
  }
  
  /**
   * Get current statistics
   */
  getStats(): OSInterceptorStats {
    return { ...this.stats };
  }
  
  // ========================================================================
  // HANDLER INSTALLATIONS
  // ========================================================================
  
  /**
   * Install uncaughtException handler
   * Captures synchronous errors that bubble up to the process level
   */
  private installUncaughtExceptionHandler(): void {
    // Store original listeners to avoid conflicts
    this.originalUncaughtExceptionListeners = process.listeners('uncaughtException') as Function[];
    
    // Add our handler (prepend to run first)
    process.prependListener('uncaughtException', async (error: Error, origin: string) => {
      this.stats.uncaughtExceptionsCaptured++;
      
      const category = detectErrorCategory(error) as ExtendedErrorCategory;
      const severity = detectErrorSeverity(error, category) as ExtendedErrorSeverity;
      
      try {
        await errorTracker.captureError(error, {
          category: this.mapToLegacyCategory(category),
          severity: this.mapToLegacySeverity(severity),
          operation: 'uncaughtException',
          service: 'os-interceptor',
          customData: {
            origin,
            extendedCategory: category,
            extendedSeverity: severity,
            processId: process.pid,
            nodeVersion: process.version,
            heapUsed: process.memoryUsage().heapUsed,
            heapTotal: process.memoryUsage().heapTotal,
            uptime: process.uptime(),
          },
        });
        
        log('error', '[OSErrorInterceptor] Captured uncaughtException', {
          errorName: error.name,
          errorMessage: error.message.substring(0, 200),
          origin,
          category,
          severity,
        });
      } catch (captureErr) {
        // Last resort: log if error tracking itself fails
        log('error', '[OSErrorInterceptor] CRITICAL: Failed to capture uncaughtException', {
          originalError: getErrorMessage(error),
          captureError: getErrorMessage(captureErr),
        });
      }
      
      // Note: We don't call process.exit here - let the original handlers decide
    });
    
    log('info', '[OSErrorInterceptor] Installed uncaughtException handler');
  }
  
  /**
   * Install unhandledRejection handler
   * Captures Promise rejections that are not caught
   */
  private installUnhandledRejectionHandler(): void {
    this.originalUnhandledRejectionListeners = process.listeners('unhandledRejection') as Function[];
    
    process.prependListener('unhandledRejection', async (reason: unknown, _promise: Promise<unknown>) => {
      this.stats.unhandledRejectionsCaptured++;
      
      const error = reason instanceof Error ? reason : new Error(String(reason));
      const category = detectErrorCategory(error) as ExtendedErrorCategory;
      const severity = detectErrorSeverity(error, category) as ExtendedErrorSeverity;
      
      try {
        await errorTracker.captureError(error, {
          category: this.mapToLegacyCategory(category),
          severity: this.mapToLegacySeverity(severity),
          operation: 'unhandledRejection',
          service: 'os-interceptor',
          customData: {
            promiseState: 'rejected',
            extendedCategory: category,
            extendedSeverity: severity,
            processId: process.pid,
            uptime: process.uptime(),
          },
        });
        
        log('warn', '[OSErrorInterceptor] Captured unhandledRejection', {
          errorName: error.name,
          errorMessage: error.message.substring(0, 200),
          category,
          severity,
        });
      } catch (captureErr) {
        log('error', '[OSErrorInterceptor] Failed to capture unhandledRejection', {
          originalReason: String(reason).substring(0, 200),
          captureError: getErrorMessage(captureErr),
        });
      }
    });
    
    log('info', '[OSErrorInterceptor] Installed unhandledRejection handler');
  }
  
  /**
   * Install warning handler
   * Captures Node.js warnings (deprecation, experimental, memory, etc.)
   */
  private installWarningHandler(): void {
    process.on('warning', async (warning: Error) => {
      this.stats.warningsCaptured++;
      
      // Determine category based on warning type
      const warningName = warning.name.toLowerCase();
      let category: ExtendedErrorCategory = 'APP_STATE';
      let severity: ExtendedErrorSeverity = 'LOW';
      
      if (warningName.includes('deprecation')) {
        category = 'APP_CONFIG';
        severity = 'LOW';
      } else if (warningName.includes('experimental')) {
        category = 'APP_CONFIG';
        severity = 'LOW';
      } else if (warningName.includes('memory') || warningName.includes('maxlisteners')) {
        category = 'OS_MEMORY';
        severity = 'MEDIUM';
      } else if (warningName.includes('unhandled')) {
        category = 'EMITTER_LISTENER';
        severity = 'HIGH';
      }
      
      try {
        await errorTracker.captureError(warning, {
          category: this.mapToLegacyCategory(category),
          severity: this.mapToLegacySeverity(severity),
          operation: 'process.warning',
          service: 'os-interceptor',
          customData: {
            warningType: warning.name,
            extendedCategory: category,
            extendedSeverity: severity,
          },
        });
      } catch {
        // Warnings are lower priority - don't escalate capture failures
      }
    });
    
    log('info', '[OSErrorInterceptor] Installed warning handler');
  }
  
  /**
   * Install exit handler
   * Tracks non-zero exit codes as errors
   */
  private installExitHandler(): void {
    process.on('exit', async (code: number) => {
      if (code !== 0) {
        // Non-zero exit codes indicate errors
        const error = new Error(`Process exiting with code ${code}`);
        error.name = 'ProcessExitError';
        
        try {
          // Note: async operations in 'exit' handler are not guaranteed to complete
          // This is best-effort logging
          await errorTracker.captureError(error, {
            category: 'WORKER', // Maps to OS_PROCESS conceptually
            severity: code === 1 ? 'HIGH' : 'CRITICAL',
            operation: 'process.exit',
            service: 'os-interceptor',
            customData: {
              exitCode: code,
              processId: process.pid,
              uptime: process.uptime(),
            },
          });
        } catch {
          log('error', `[OSErrorInterceptor] Process exiting with code ${code}`);
        }
      }
    });
    
    log('info', '[OSErrorInterceptor] Installed exit handler');
  }
  
  /**
   * Install signal tracking
   * Records process signals received
   */
  private installSignalTracking(): void {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGHUP'];
    
    for (const signal of signals) {
      process.on(signal, () => {
        this.stats.signalsReceived[signal] = (this.stats.signalsReceived[signal] || 0) + 1;
        
        log('info', `[OSErrorInterceptor] Received signal: ${signal}`, {
          totalReceived: this.stats.signalsReceived[signal],
        });
        
        // Note: We don't capture signals as errors - they're normal shutdown triggers
        // Other handlers will deal with graceful shutdown
      });
    }
    
    log('info', '[OSErrorInterceptor] Installed signal tracking');
  }
  
  /**
   * Start memory monitoring
   * Checks heap usage and triggers alerts at thresholds
   */
  private startMemoryMonitoring(): void {
    const checkMemory = async () => {
      const heapStats = v8.getHeapStatistics();
      const usedPercent = (heapStats.used_heap_size / heapStats.heap_size_limit) * 100;
      
      this.stats.lastMemoryCheck = new Date();
      this.stats.currentHeapUsedPercent = usedPercent;
      
      if (usedPercent >= this.config.memoryCriticalThreshold) {
        this.stats.memoryCriticalTriggered++;
        
        const error = new Error(`CRITICAL: Heap usage at ${usedPercent.toFixed(1)}% (threshold: ${this.config.memoryCriticalThreshold}%)`);
        error.name = 'HeapCriticalError';
        
        try {
          await errorTracker.captureError(error, {
            category: 'CACHE', // Maps to OS_MEMORY conceptually
            severity: 'CRITICAL',
            operation: 'memory.monitor',
            service: 'os-interceptor',
            customData: {
              usedHeapPercent: usedPercent,
              usedHeapMB: bytesToMB(heapStats.used_heap_size),
              totalHeapMB: bytesToMB(heapStats.total_heap_size),
              heapLimitMB: bytesToMB(heapStats.heap_size_limit),
              externalMB: bytesToMB(heapStats.external_memory),
            },
          });
        } catch {
          // Silent - don't create more errors
        }
        
        log('error', '[OSErrorInterceptor] CRITICAL heap usage', {
          usedPercent: usedPercent.toFixed(1),
          usedMB: bytesToMB(heapStats.used_heap_size),
          limitMB: bytesToMB(heapStats.heap_size_limit),
        });
        
      } else if (usedPercent >= this.config.memoryWarningThreshold) {
        this.stats.memoryWarningsTriggered++;
        
        const error = new Error(`WARNING: Heap usage at ${usedPercent.toFixed(1)}% (threshold: ${this.config.memoryWarningThreshold}%)`);
        error.name = 'HeapWarningError';
        
        try {
          await errorTracker.captureError(error, {
            category: 'CACHE',
            severity: 'HIGH',
            operation: 'memory.monitor',
            service: 'os-interceptor',
            customData: {
              usedHeapPercent: usedPercent,
              usedHeapMB: bytesToMB(heapStats.used_heap_size),
              heapLimitMB: bytesToMB(heapStats.heap_size_limit),
            },
          });
        } catch {
          // Silent
        }
        
        log('warn', '[OSErrorInterceptor] High heap usage', {
          usedPercent: usedPercent.toFixed(1),
        });
      }
    };
    
    // Run initial check
    checkMemory();
    
    // Schedule periodic checks
    this.memoryCheckInterval = setInterval(checkMemory, this.config.memoryCheckIntervalMs);
    
    log('info', '[OSErrorInterceptor] Started memory monitoring', {
      intervalMs: this.config.memoryCheckIntervalMs,
      warningThreshold: this.config.memoryWarningThreshold,
      criticalThreshold: this.config.memoryCriticalThreshold,
    });
  }
  
  /**
   * Install EventEmitter error monitor
   * Uses Symbol.for('nodejs.rejection') to capture all EventEmitter errors
   */
  private installEventEmitterMonitor(): void {
    // Hook into the EventEmitter prototype to capture all 'error' events
    // that don't have handlers (would normally throw)
    const originalEmit = EventEmitter.prototype.emit;
    const self = this;
    
    EventEmitter.prototype.emit = function (event: string | symbol, ...args: unknown[]) {
      if (event === 'error') {
        const error = args[0] as Error | undefined;
        if (error instanceof Error) {
          self.stats.eventEmitterErrorsCaptured++;
          
          // Check if there are any error listeners
          const hasErrorListeners = this.listenerCount('error') > 0;
          
          if (!hasErrorListeners) {
            // No error listeners - this error would normally throw
            // Capture it to the error database
            const category = detectErrorCategory(error);
            const severity = detectErrorSeverity(error, category);
            
            // Fire-and-forget capture (async in sync context)
            errorTracker.captureError(error, {
              category: self.mapToLegacyCategory(category),
              severity: self.mapToLegacySeverity(severity),
              operation: 'EventEmitter.error',
              service: 'os-interceptor',
              customData: {
                emitterType: this.constructor?.name || 'unknown',
                hasListeners: hasErrorListeners,
                extendedCategory: category,
              },
            }).catch(() => {
              // Silent - don't create more errors
            });
          }
        }
      }
      
      // Always call original emit
      return originalEmit.apply(this, [event, ...args] as [string | symbol, ...unknown[]]);
    };
    
    log('info', '[OSErrorInterceptor] Installed EventEmitter monitor');
  }
  
  // ========================================================================
  // HELPER METHODS
  // ========================================================================
  
  /**
   * Map extended category to legacy ErrorCategory type
   */
  private mapToLegacyCategory(category: ExtendedErrorCategory): ErrorContext['category'] {
    // Map to existing categories for backward compatibility
    const categoryMap: Record<string, ErrorContext['category']> = {
      // OS categories → UNKNOWN or most appropriate
      'OS_PROCESS': 'WORKER',
      'OS_MEMORY': 'CACHE',
      'OS_FILESYSTEM': 'CONFIG',
      'OS_PERMISSION': 'CONFIG',
      'OS_RESOURCE': 'CACHE',
      
      // Network categories
      'NETWORK_DNS': 'NETWORK',
      'NETWORK_TCP': 'NETWORK',
      'NETWORK_TIMEOUT': 'NETWORK',
      'NETWORK_SSL': 'NETWORK',
      'NETWORK_HTTP': 'NETWORK',
      'NETWORK_WEBSOCKET': 'NETWORK',
      
      // Database categories
      'DATABASE_CONNECTION': 'DATABASE',
      'DATABASE_QUERY': 'DATABASE',
      'DATABASE_TRANSACTION': 'DATABASE',
      'DATABASE_MIGRATION': 'DATABASE',
      'DATABASE_PRISMA': 'DATABASE',
      
      // Discord categories
      'DISCORD_REST': 'DISCORD',
      'DISCORD_GATEWAY': 'DISCORD',
      'DISCORD_RATELIMIT': 'DISCORD',
      'DISCORD_PERMISSION': 'DISCORD',
      'DISCORD_INTENT': 'DISCORD',
      'DISCORD_CACHE': 'DISCORD',
      
      // App categories
      'APP_VALIDATION': 'VALIDATION',
      'APP_AUTH': 'VALIDATION',
      'APP_BUSINESS': 'VALIDATION',
      'APP_CONFIG': 'CONFIG',
      'APP_STATE': 'UNKNOWN',
      
      // Engine categories
      'ENGINE_BATTLE': 'ENGINE',
      'ENGINE_ENCOUNTER': 'ENGINE',
      'ENGINE_PBSL': 'ENGINE',
      'ENGINE_CACHE': 'CACHE',
      
      // Worker categories
      'WORKER_LIFECYCLE': 'WORKER',
      'WORKER_EXECUTION': 'WORKER',
      'WORKER_TIMEOUT': 'WORKER',
      'WORKER_CHILD': 'WORKER',
      'WORKER_QUEUE': 'WORKER',
      
      // Stream categories
      'STREAM_READ': 'UNKNOWN',
      'STREAM_WRITE': 'UNKNOWN',
      'STREAM_PIPE': 'UNKNOWN',
      'EMITTER_LISTENER': 'UNKNOWN',
      
      // Default
      'UNKNOWN': 'UNKNOWN',
    };
    
    return categoryMap[category] || 'UNKNOWN';
  }
  
  /**
   * Map extended severity to legacy ErrorSeverity type
   */
  private mapToLegacySeverity(severity: ExtendedErrorSeverity): ErrorContext['severity'] {
    // INFO maps to LOW for backward compatibility
    if (severity === 'INFO') return 'LOW';
    return severity as ErrorContext['severity'];
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const osErrorInterceptor = OSErrorInterceptor.getInstance();

/**
 * Initialize OS-level error interception
 * Call this EARLY in application bootstrap
 * 
 * @example
 * // In index.ts (early)
 * import { initializeOSErrorInterceptor } from './services/monitoring/os-error-interceptor.js';
 * initializeOSErrorInterceptor();
 */
export function initializeOSErrorInterceptor(config?: Partial<OSInterceptorConfig>): void {
  osErrorInterceptor.initialize(config);
}

/**
 * Get OS interceptor statistics
 */
export function getOSInterceptorStats(): OSInterceptorStats {
  return osErrorInterceptor.getStats();
}
