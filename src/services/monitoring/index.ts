/**
 * Monitoring Services Barrel Export
 * 
 * Centralized exports for all monitoring-related services:
 * - errorTracker: Error logging and tracking system
 * - errorLearning: Pattern detection and error analysis
 * - resourceMonitor: Resource monitoring with memory guardian
 * - resourceManager: Resource lifecycle management and cleanup
 * - resilientWriteBuffer: Crash-safe database write operations
 * 
 * Service Dependencies:
 * - resource-manager: Foundation service (no dependencies)
 * - resource-monitor: Standalone monitoring
 * - error-tracker: Depends on resource-manager, resilient-write-buffer
 * - error-learning: Depends on error-tracker
 * - resilient-write-buffer: Depends on prisma
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

// Resilient Write Buffer (crash-safe database operations)
export {
  initializeWriteBuffer,
  shutdownWriteBuffer,
  queueWrite,
  executeResilientWrite,
  registerWriteExecutor,
  getBufferStats,
  flushBuffer,
  cleanupWriteBuffer,
} from './resilient-write-buffer.js';
export type { PendingWrite, BufferStats, WriteOperation } from './resilient-write-buffer.js';

// Error Learning (namespace export to avoid name collisions)
export * as errorLearning from './error-learning.js';

// Resource Monitoring (default export + types)
export { resourceMonitor, startResourceMonitoring, stopResourceMonitoring, getResourceHealth } from './resource-monitor.js';
export type { IPrunableCache, MemoryPressureLevel, DiskPressureLevel, MetricsSnapshotEvent } from './resource-monitor.js';

// Shared Utilities (performance-optimized helpers)
export {
  generateResourceId,
  generateFingerprint,
  formatTimestamp,
  calculateAge,
  calculateAgeHours,
  formatBytes,
  calculateMemoryPercent,
  calculatePercentile,
  calculateAverage,
  calculateStdDev,
  checkThreshold,
  deduplicateBy,
  groupBy,
  RateLimiter,
  clearAllCaches,
  getCacheStats,
} from './monitoring-utils.js';
export type {
  ThresholdResult,
  CacheStats,
} from './monitoring-utils.js';
