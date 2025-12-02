/**
 * Core types and interfaces for centralized database worker architecture.
 * 
 * This file defines the contracts that all database workers must implement,
 * ensuring consistent behavior across PROD PostgreSQL, TimescaleDB, Engine Read-DB,
 * and Engine Write-DB workers.
 * 
 * @module workers/database/types
 */

// ============================================================================
// Worker Health and Status
// ============================================================================

/**
 * Worker health status levels.
 * 
 * - healthy: Worker operating normally, all metrics within thresholds
 * - degraded: Worker operational but experiencing issues (high latency, backpressure, etc.)
 * - unhealthy: Worker non-functional, requires intervention
 */
export type WorkerHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Comprehensive worker health information.
 * Returned by healthCheck() method on all workers.
 */
export interface WorkerHealth {
  /** Current health status */
  status: WorkerHealthStatus;
  
  /** Average latency of recent operations (milliseconds) */
  latencyMs: number;
  
  /** Number of errors in last hour */
  errorCount: number;
  
  /** Most recent error message (null if no errors) */
  lastError: string | null;
  
  /** Worker uptime in milliseconds */
  uptimeMs: number;
  
  /** Last successful operation timestamp */
  lastOperationAt: Date | null;
  
  /** Worker-specific details (cache hit rate, buffer size, etc.) */
  details: Record<string, unknown>;
}

/**
 * Worker performance metrics for monitoring dashboards.
 */
export interface WorkerMetrics {
  /** Total number of operations executed */
  operationCount: number;
  
  /** Number of successful operations */
  successCount: number;
  
  /** Number of failed operations */
  failureCount: number;
  
  /** Average operation latency (milliseconds) */
  avgLatencyMs: number;
  
  /** Peak operation latency (milliseconds) */
  peakLatencyMs: number;
  
  /** Operations per second (current throughput) */
  throughput: number;
  
  /** Error rate (failures / total operations) */
  errorRate: number;
  
  /** Timestamp of last metrics update */
  lastUpdatedAt: Date;
}

// ============================================================================
// Cache Strategy
// ============================================================================

/**
 * Cache eviction policies.
 * 
 * - lru: Least Recently Used (evict oldest accessed entry)
 * - ttl: Time To Live (evict entries older than TTL)
 * - lfu: Least Frequently Used (evict least accessed entry)
 * - hybrid: Combination of LRU and TTL
 */
export type CacheEvictionPolicy = 'lru' | 'ttl' | 'lfu' | 'hybrid';

/**
 * Cache configuration for workers that support query caching.
 */
export interface CacheConfig {
  /** Enable/disable caching */
  enabled: boolean;
  
  /** Eviction policy */
  evictionPolicy: CacheEvictionPolicy;
  
  /** Time-to-live for cached entries (milliseconds) */
  ttlMs: number;
  
  /** Maximum cache size (bytes) */
  maxSizeBytes: number;
  
  /** Maximum number of entries */
  maxEntries: number;
  
  /** Prefetch strategy (load frequently accessed data proactively) */
  prefetch: boolean;
}

/**
 * Cache statistics for monitoring.
 */
export interface CacheStats {
  /** Total number of cache lookups */
  hitCount: number;
  
  /** Number of successful cache hits */
  missCount: number;
  
  /** Cache hit rate (hits / total lookups) */
  hitRate: number;
  
  /** Current cache size (bytes) */
  sizeBytes: number;
  
  /** Current number of entries */
  entryCount: number;
  
  /** Number of evictions */
  evictionCount: number;
  
  /** Memory utilization percentage */
  utilizationPercent: number;
}

// ============================================================================
// Write Buffer Strategy
// ============================================================================

/**
 * Write buffer flush triggers.
 * 
 * - time: Flush after X milliseconds
 * - size: Flush after X entries
 * - hybrid: Flush on whichever comes first (time OR size)
 */
export type BufferFlushTrigger = 'time' | 'size' | 'hybrid';

/**
 * Write buffer configuration for workers that batch writes.
 */
export interface WriteBufferConfig {
  /** Enable/disable write buffering */
  enabled: boolean;
  
  /** Flush trigger strategy */
  flushTrigger: BufferFlushTrigger;
  
  /** Flush interval (milliseconds, for time-based or hybrid) */
  flushIntervalMs: number;
  
  /** Flush threshold (entry count, for size-based or hybrid) */
  flushThresholdEntries: number;
  
  /** Maximum buffer size before rejecting writes (backpressure) */
  maxBufferSize: number;
  
  /** Backpressure warning threshold (percentage of max size) */
  backpressureWarnPercent: number;
  
  /** Backpressure critical threshold (percentage of max size) */
  backpressureCriticalPercent: number;
}

/**
 * Write buffer statistics for monitoring.
 */
export interface BufferStats {
  /** Current number of buffered entries */
  entryCount: number;
  
  /** Maximum buffer capacity */
  maxCapacity: number;
  
  /** Buffer utilization percentage */
  utilizationPercent: number;
  
  /** Backpressure active (rejecting new writes) */
  isBackpressureActive: boolean;
  
  /** Number of flushes executed */
  flushCount: number;
  
  /** Number of writes rejected due to backpressure */
  rejectedWriteCount: number;
  
  /** Last flush timestamp */
  lastFlushAt: Date | null;
  
  /** Average flush duration (milliseconds) */
  avgFlushDurationMs: number;
}

// ============================================================================
// Error Recovery Strategy
// ============================================================================

/**
 * Error recovery policies.
 * 
 * - retry: Retry failed operation with exponential backoff
 * - circuit-breaker: Stop attempting after N consecutive failures
 * - fail-fast: Immediately propagate errors to caller
 * - graceful-degradation: Continue with reduced functionality
 */
export type ErrorRecoveryPolicy = 'retry' | 'circuit-breaker' | 'fail-fast' | 'graceful-degradation';

/**
 * Error recovery configuration.
 */
export interface ErrorRecoveryConfig {
  /** Recovery policy */
  policy: ErrorRecoveryPolicy;
  
  /** Maximum retry attempts (for retry policy) */
  maxRetries: number;
  
  /** Initial retry delay (milliseconds) */
  initialRetryDelayMs: number;
  
  /** Maximum retry delay (milliseconds) */
  maxRetryDelayMs: number;
  
  /** Exponential backoff multiplier */
  backoffMultiplier: number;
  
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold: number;
  
  /** Circuit breaker reset timeout (milliseconds) */
  circuitBreakerResetMs: number;
}

/**
 * Error recovery statistics.
 */
export interface ErrorRecoveryStats {
  /** Total number of errors encountered */
  totalErrors: number;
  
  /** Number of successful recoveries */
  recoverySuccessCount: number;
  
  /** Number of failed recoveries */
  recoveryFailureCount: number;
  
  /** Circuit breaker state (open = blocking calls, closed = allowing calls) */
  circuitBreakerState: 'open' | 'closed' | 'half-open';
  
  /** Consecutive failure count (for circuit breaker) */
  consecutiveFailures: number;
  
  /** Last error timestamp */
  lastErrorAt: Date | null;
  
  /** Last recovery attempt timestamp */
  lastRecoveryAt: Date | null;
}

// ============================================================================
// Database Worker Interface
// ============================================================================

/**
 * Base interface that all database workers must implement.
 * Ensures consistent lifecycle management, health monitoring, and observability.
 */
export interface DatabaseWorker {
  /** Unique worker identifier (e.g., 'prod-postgres', 'timescaledb', 'engine-read') */
  readonly id: string;
  
  /** Human-readable worker name */
  readonly name: string;
  
  /** Worker type (for categorization in dashboards) */
  readonly type: 'postgres' | 'timescaledb' | 'sqlite-read' | 'sqlite-write';
  
  /**
   * Initialize worker (establish connections, load config, prepare caches).
   * Called once during application startup.
   * 
   * @throws Error if initialization fails
   */
  initialize(): Promise<void>;
  
  /**
   * Start worker (begin background tasks, activate monitoring).
   * Called after initialize() completes successfully.
   * 
   * @throws Error if worker already started or not initialized
   */
  start(): Promise<void>;
  
  /**
   * Stop worker (halt background tasks, flush buffers, close connections).
   * Called during graceful shutdown.
   * 
   * @param timeoutMs Maximum time to wait for graceful shutdown (default: 30000ms)
   * @returns true if shutdown completed within timeout, false otherwise
   */
  stop(timeoutMs?: number): Promise<boolean>;
  
  /**
   * Check worker health (connectivity, latency, error rate).
   * Called periodically by WorkerManager for monitoring.
   * 
   * @returns Current health status and metrics
   */
  healthCheck(): Promise<WorkerHealth>;
  
  /**
   * Get worker performance metrics (throughput, latency, error rate).
   * Called by monitoring dashboards and observability tools.
   * 
   * @returns Current performance metrics
   */
  getMetrics(): WorkerMetrics;
  
  /**
   * Reset worker metrics (useful for testing or after maintenance).
   * Does not affect operational state, only metric counters.
   */
  resetMetrics(): void;
}

// ============================================================================
// Queryable Worker Interface (Extends DatabaseWorker)
// ============================================================================

/**
 * Interface for workers that support querying (PROD PostgreSQL, TimescaleDB, Engine Read-DB).
 */
export interface QueryableWorker extends DatabaseWorker {
  /**
   * Execute raw SQL query with caching support.
   * 
   * @param sql SQL query string (can include placeholders like $1, $2)
   * @param params Query parameters (positional)
   * @returns Array of result rows
   * @throws Error if query execution fails
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  
  /**
   * Execute query expecting single result (or null).
   * Convenience wrapper around query() that returns first row.
   * 
   * @param sql SQL query string
   * @param params Query parameters
   * @returns Single result row or null if no results
   * @throws Error if query execution fails
   */
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  
  /**
   * Get cache statistics (if worker supports caching).
   * Returns null if caching not enabled.
   * 
   * @returns Cache statistics or null
   */
  getCacheStats(): CacheStats | null;
  
  /**
   * Clear query cache (useful for testing or after data changes).
   * No-op if caching not enabled.
   */
  clearCache(): void;
}

// ============================================================================
// Writable Worker Interface (Extends DatabaseWorker)
// ============================================================================

/**
 * Interface for workers that support writing (PROD PostgreSQL, TimescaleDB, Engine Write-DB).
 */
export interface WritableWorker extends DatabaseWorker {
  /**
   * Insert data into table (buffered write).
   * Returns immediately, actual write happens during next flush.
   * 
   * @param table Table name
   * @param data Row data (keys = column names)
   * @throws Error if buffer full (backpressure)
   */
  insert(table: string, data: Record<string, unknown>): Promise<void>;
  
  /**
   * Update data in table (buffered write).
   * Returns immediately, actual write happens during next flush.
   * 
   * @param table Table name
   * @param data Updated values (keys = column names)
   * @param where Filter conditions (keys = column names)
   * @throws Error if buffer full (backpressure)
   */
  update(table: string, data: Record<string, unknown>, where: Record<string, unknown>): Promise<void>;
  
  /**
   * Delete data from table (buffered write).
   * Returns immediately, actual write happens during next flush.
   * 
   * @param table Table name
   * @param where Filter conditions (keys = column names)
   * @throws Error if buffer full (backpressure)
   */
  delete(table: string, where: Record<string, unknown>): Promise<void>;
  
  /**
   * Manually flush write buffer (execute all pending writes).
   * Normally called automatically by background flush worker.
   * 
   * @returns Number of entries written
   * @throws Error if flush fails
   */
  flush(): Promise<number>;
  
  /**
   * Get write buffer statistics (utilization, backpressure status, etc.).
   * 
   * @returns Buffer statistics
   */
  getBufferStats(): BufferStats;
}

// ============================================================================
// Transaction Support (Optional Extension)
// ============================================================================

/**
 * Interface for workers that support transactions (PROD PostgreSQL, TimescaleDB).
 */
export interface TransactionalWorker extends QueryableWorker, WritableWorker {
  /**
   * Execute operations within a transaction.
   * Automatically commits on success, rolls back on error.
   * 
   * @param fn Transaction function receiving isolated client
   * @returns Result from transaction function
   * @throws Error if transaction fails or is rolled back
   */
  transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

/**
 * Transaction context providing isolated database access.
 */
export interface TransactionContext {
  /** Execute query within transaction */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  
  /** Execute single-result query within transaction */
  queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null>;
  
  /** Insert within transaction (immediate, not buffered) */
  insert(table: string, data: Record<string, unknown>): Promise<void>;
  
  /** Update within transaction (immediate, not buffered) */
  update(table: string, data: Record<string, unknown>, where: Record<string, unknown>): Promise<void>;
  
  /** Delete within transaction (immediate, not buffered) */
  delete(table: string, where: Record<string, unknown>): Promise<void>;
}

// ============================================================================
// Worker Configuration
// ============================================================================

/**
 * Common configuration for all database workers.
 */
export interface WorkerConfig {
  /** Worker identifier */
  id: string;
  
  /** Worker name */
  name: string;
  
  /** Enable/disable worker */
  enabled: boolean;
  
  /** Cache configuration (optional, for queryable workers) */
  cache?: CacheConfig;
  
  /** Write buffer configuration (optional, for writable workers) */
  writeBuffer?: WriteBufferConfig;
  
  /** Error recovery configuration */
  errorRecovery: ErrorRecoveryConfig;
  
  /** Health check interval (milliseconds) */
  healthCheckIntervalMs: number;
  
  /** Metrics collection interval (milliseconds) */
  metricsIntervalMs: number;
}

// ============================================================================
// Worker Events
// ============================================================================

/**
 * Worker lifecycle events for monitoring and debugging.
 */
export type WorkerEvent =
  | { type: 'initialized'; workerId: string; timestamp: Date }
  | { type: 'started'; workerId: string; timestamp: Date }
  | { type: 'stopped'; workerId: string; timestamp: Date; reason: string }
  | { type: 'health-check'; workerId: string; health: WorkerHealth; timestamp: Date }
  | { type: 'error'; workerId: string; error: Error; timestamp: Date }
  | { type: 'recovery-success'; workerId: string; timestamp: Date }
  | { type: 'recovery-failure'; workerId: string; error: Error; timestamp: Date }
  | { type: 'cache-hit'; workerId: string; key: string; timestamp: Date }
  | { type: 'cache-miss'; workerId: string; key: string; timestamp: Date }
  | { type: 'cache-eviction'; workerId: string; key: string; timestamp: Date }
  | { type: 'buffer-flush'; workerId: string; entriesWritten: number; durationMs: number; timestamp: Date }
  | { type: 'backpressure-activated'; workerId: string; utilizationPercent: number; timestamp: Date }
  | { type: 'backpressure-deactivated'; workerId: string; utilizationPercent: number; timestamp: Date };

/**
 * Worker event listener function type.
 */
export type WorkerEventListener = (event: WorkerEvent) => void;

/**
 * Worker event emitter interface (for monitoring integration).
 */
export interface WorkerEventEmitter {
  /** Subscribe to worker events */
  on(listener: WorkerEventListener): () => void;
  
  /** Emit worker event */
  emit(event: WorkerEvent): void;
}
