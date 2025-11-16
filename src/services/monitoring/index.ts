/**
 * Monitoring Services Barrel Export
 * 
 * Centralized exports for all monitoring-related services:
 * - errorTracker: Error logging and tracking system
 * - errorLearning: Pattern detection and error analysis
 * - resourceMonitor: Resource monitoring with memory guardian
 * - resourceManager: Resource lifecycle management and cleanup
 * 
 * Service Dependencies:
 * - resource-manager: Foundation service (no dependencies)
 * - resource-monitor: Standalone monitoring
 * - error-tracker: Depends on resource-manager
 * - error-learning: Depends on error-tracker
 * 
 * Usage:
 * ```typescript
 * import { errorTracker, resourceManager } from '../services/monitoring';
 * import * as errorLearning from '../services/monitoring/error-learning';
 * 
 * await errorTracker.captureError(error, { category: 'DATABASE', severity: 'HIGH' });
 * ```
 */

// Resource Management (default export + types)
export { resourceManager } from './resource-manager.js';
export type { 
  ResourceStats, 
  ResourceType, 
  ResourceHandle,
  TimerHandle,
  ListenerHandle,
  ConnectionHandle,
  DiskCacheHandle,
  DiskBufferHandle,
  DiskLogHandle,
  ResourceLimits
} from './resource-manager.js';

// Error Tracking (default export + types)
export { errorTracker } from './error-tracker.js';
export type { ErrorTracker, ErrorCategory, ErrorSeverity, ErrorContext } from './error-tracker.js';

// Error Learning (namespace export to avoid name collisions)
export * as errorLearning from './error-learning.js';

// Resource Monitoring (default export + types)
export { resourceMonitor } from './resource-monitor.js';
export type { IPrunableCache, MemoryPressureLevel } from './resource-monitor.js';
