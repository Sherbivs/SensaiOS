/**
 * Strategy implementations for caching, write buffering, and error recovery.
 * 
 * These strategies are used by database workers to implement intelligent
 * caching, batch processing, and fault tolerance.
 * 
 * @module workers/database/strategies
 */

import type {
  CacheConfig,
  CacheStats,
  WriteBufferConfig,
  BufferStats,
  ErrorRecoveryConfig,
  ErrorRecoveryStats,
  WorkerEventEmitter,
} from './types.js';

// ============================================================================
// Cache Strategy Interface
// ============================================================================

/**
 * Cache entry with metadata.
 */
export interface CacheEntry<T = unknown> {
  /** Cached value */
  value: T;
  
  /** Entry creation timestamp */
  createdAt: Date;
  
  /** Last access timestamp */
  lastAccessedAt: Date;
  
  /** Access count (for LFU eviction) */
  accessCount: number;
  
  /** Time-to-live (milliseconds, null = no expiration) */
  ttlMs: number | null;
  
  /** Entry size (bytes, for memory tracking) */
  sizeBytes: number;
}

/**
 * Cache strategy interface.
 * Implementations handle different eviction policies (LRU, TTL, LFU, Hybrid).
 */
export interface CacheStrategy<K = string, V = unknown> {
  /** Initialize cache with configuration */
  initialize(config: CacheConfig): void;
  
  /** Get cached value (returns undefined if not found or expired) */
  get(key: K): V | undefined;
  
  /** Set cached value */
  set(key: K, value: V, ttlMs?: number): void;
  
  /** Check if key exists in cache (without updating access time) */
  has(key: K): boolean;
  
  /** Delete entry from cache */
  delete(key: K): boolean;
  
  /** Clear entire cache */
  clear(): void;
  
  /** Get cache statistics */
  getStats(): CacheStats;
  
  /** Trigger eviction (called periodically or when size exceeds limit) */
  evict(): number;
}

// ============================================================================
// LRU Cache Strategy
// ============================================================================

/**
 * Least Recently Used (LRU) cache implementation.
 * Evicts oldest accessed entries when size limit reached.
 */
export class LRUCacheStrategy<K = string, V = unknown> implements CacheStrategy<K, V> {
  private cache: Map<K, CacheEntry<V>> = new Map();
  private config!: CacheConfig;
  private stats: CacheStats = {
    hitCount: 0,
    missCount: 0,
    hitRate: 0,
    sizeBytes: 0,
    entryCount: 0,
    evictionCount: 0,
    utilizationPercent: 0,
  };

  initialize(config: CacheConfig): void {
    this.config = config;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.missCount++;
      this.updateHitRate();
      return undefined;
    }
    
    // Update access metadata
    entry.lastAccessedAt = new Date();
    entry.accessCount++;
    
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hitCount++;
    this.updateHitRate();
    
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const sizeBytes = this.estimateSize(value);
    
    // Evict if adding this entry would exceed limits
    while (
      (this.stats.sizeBytes + sizeBytes > this.config.maxSizeBytes ||
       this.cache.size >= this.config.maxEntries) &&
      this.cache.size > 0
    ) {
      this.evictOne();
    }
    
    const entry: CacheEntry<V> = {
      value,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      ttlMs: ttlMs ?? this.config.ttlMs,
      sizeBytes,
    };
    
    // Remove old entry if exists
    const oldEntry = this.cache.get(key);
    if (oldEntry) {
      this.stats.sizeBytes -= oldEntry.sizeBytes;
    }
    
    this.cache.set(key, entry);
    this.stats.sizeBytes += sizeBytes;
    this.stats.entryCount = this.cache.size;
    this.updateUtilization();
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    this.cache.delete(key);
    this.stats.sizeBytes -= entry.sizeBytes;
    this.stats.entryCount = this.cache.size;
    this.updateUtilization();
    
    return true;
  }

  clear(): void {
    this.cache.clear();
    this.stats.sizeBytes = 0;
    this.stats.entryCount = 0;
    this.updateUtilization();
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  evict(): number {
    let evictedCount = 0;
    
    // Evict expired entries
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.ttlMs && now - entry.createdAt.getTime() > entry.ttlMs) {
        this.cache.delete(key);
        this.stats.sizeBytes -= entry.sizeBytes;
        evictedCount++;
      }
    }
    
    // Evict LRU entries if still over limit
    while (this.stats.sizeBytes > this.config.maxSizeBytes && this.cache.size > 0) {
      this.evictOne();
      evictedCount++;
    }
    
    this.stats.evictionCount += evictedCount;
    this.stats.entryCount = this.cache.size;
    this.updateUtilization();
    
    return evictedCount;
  }

  private evictOne(): void {
    // Evict first entry (least recently used)
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      const entry = this.cache.get(firstKey)!;
      this.cache.delete(firstKey);
      this.stats.sizeBytes -= entry.sizeBytes;
    }
  }

  private estimateSize(value: V): number {
    // Rough size estimation (JSON serialization)
    try {
      return JSON.stringify(value).length * 2; // *2 for UTF-16 encoding
    } catch {
      return 1024; // Default 1KB if serialization fails
    }
  }

  private updateHitRate(): void {
    const total = this.stats.hitCount + this.stats.missCount;
    this.stats.hitRate = total > 0 ? this.stats.hitCount / total : 0;
  }

  private updateUtilization(): void {
    this.stats.utilizationPercent = (this.stats.sizeBytes / this.config.maxSizeBytes) * 100;
  }
}

// ============================================================================
// Write Buffer Strategy Interface
// ============================================================================

/**
 * Buffered write entry.
 */
export interface BufferedWrite {
  /** Write operation type */
  operation: 'insert' | 'update' | 'delete';
  
  /** Target table */
  table: string;
  
  /** Data to write */
  data: Record<string, unknown>;
  
  /** Filter conditions (for update/delete) */
  where?: Record<string, unknown>;
  
  /** Entry creation timestamp */
  timestamp: Date;
}

/**
 * Write buffer strategy interface.
 * Implementations handle different flush triggers (time-based, size-based, hybrid).
 */
export interface WriteBufferStrategy {
  /** Initialize buffer with configuration */
  initialize(config: WriteBufferConfig, eventEmitter?: WorkerEventEmitter): void;
  
  /** Add write to buffer */
  add(write: BufferedWrite): void;
  
  /** Get all buffered writes (for flushing) */
  getAll(): BufferedWrite[];
  
  /** Clear buffer after successful flush */
  clear(): void;
  
  /** Get buffer statistics */
  getStats(): BufferStats;
  
  /** Check if flush should be triggered */
  shouldFlush(): boolean;
  
  /** Start background flush timer (for time-based trigger) */
  start(): void;
  
  /** Stop background flush timer */
  stop(): void;
}

// ============================================================================
// Hybrid Write Buffer Strategy
// ============================================================================

/**
 * Hybrid write buffer implementation.
 * Flushes on whichever comes first: time interval OR size threshold.
 */
export class HybridWriteBufferStrategy implements WriteBufferStrategy {
  private buffer: BufferedWrite[] = [];
  private config!: WriteBufferConfig;
  private eventEmitter?: WorkerEventEmitter;
  private flushTimer?: NodeJS.Timeout;
  private lastFlushAt: Date | null = null;
  private stats: BufferStats = {
    entryCount: 0,
    maxCapacity: 0,
    utilizationPercent: 0,
    isBackpressureActive: false,
    flushCount: 0,
    rejectedWriteCount: 0,
    lastFlushAt: null,
    avgFlushDurationMs: 0,
  };
  private flushDurations: number[] = [];

  initialize(config: WriteBufferConfig, eventEmitter?: WorkerEventEmitter): void {
    this.config = config;
    this.eventEmitter = eventEmitter;
    this.stats.maxCapacity = config.maxBufferSize;
  }

  add(write: BufferedWrite): void {
    // Check backpressure
    const utilizationPercent = (this.buffer.length / this.config.maxBufferSize) * 100;
    
    if (utilizationPercent >= this.config.backpressureCriticalPercent) {
      this.stats.rejectedWriteCount++;
      
      if (!this.stats.isBackpressureActive) {
        this.stats.isBackpressureActive = true;
        this.eventEmitter?.emit({
          type: 'backpressure-activated',
          workerId: 'write-buffer',
          utilizationPercent,
          timestamp: new Date(),
        });
      }
      
      throw new Error(`Write buffer full (${utilizationPercent.toFixed(1)}% utilization). Backpressure active.`);
    }
    
    // Warn on high utilization
    if (utilizationPercent >= this.config.backpressureWarnPercent && !this.stats.isBackpressureActive) {
      // Log warning to monitoring system
      this.eventEmitter?.emit({
        type: 'backpressure-activated',
        workerId: 'write-buffer',
        utilizationPercent,
        timestamp: new Date(),
      });
    }
    
    this.buffer.push(write);
    this.stats.entryCount = this.buffer.length;
    this.stats.utilizationPercent = utilizationPercent;
  }

  getAll(): BufferedWrite[] {
    return [...this.buffer];
  }

  clear(): void {
    this.buffer = [];
    this.stats.entryCount = 0;
    this.stats.utilizationPercent = 0;
    this.lastFlushAt = new Date();
    this.stats.lastFlushAt = this.lastFlushAt;
    this.stats.flushCount++;
    
    // Deactivate backpressure
    if (this.stats.isBackpressureActive) {
      this.stats.isBackpressureActive = false;
      this.eventEmitter?.emit({
        type: 'backpressure-deactivated',
        workerId: 'write-buffer',
        utilizationPercent: 0,
        timestamp: new Date(),
      });
    }
  }

  getStats(): BufferStats {
    return { ...this.stats };
  }

  shouldFlush(): boolean {
    // Size-based trigger
    if (this.buffer.length >= this.config.flushThresholdEntries) {
      return true;
    }
    
    // Time-based trigger
    if (this.lastFlushAt) {
      const elapsedMs = Date.now() - this.lastFlushAt.getTime();
      if (elapsedMs >= this.config.flushIntervalMs) {
        return true;
      }
    }
    
    return false;
  }

  start(): void {
    if (this.flushTimer) return;
    
    // Start background flush timer (check every second)
    this.flushTimer = setInterval(() => {
      if (this.shouldFlush() && this.buffer.length > 0) {
        // Emit event for external flush handler
        this.eventEmitter?.emit({
          type: 'buffer-flush',
          workerId: 'write-buffer',
          entriesWritten: this.buffer.length,
          durationMs: 0, // Updated after flush completes
          timestamp: new Date(),
        });
      }
    }, 1000);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  recordFlushDuration(durationMs: number): void {
    this.flushDurations.push(durationMs);
    
    // Keep last 100 durations
    if (this.flushDurations.length > 100) {
      this.flushDurations.shift();
    }
    
    // Update average
    const sum = this.flushDurations.reduce((a, b) => a + b, 0);
    this.stats.avgFlushDurationMs = sum / this.flushDurations.length;
  }
}

// ============================================================================
// Error Recovery Strategy Interface
// ============================================================================

/**
 * Error recovery strategy interface.
 * Implementations handle different recovery policies (retry, circuit breaker, etc.).
 */
export interface ErrorRecoveryStrategy {
  /** Initialize strategy with configuration */
  initialize(config: ErrorRecoveryConfig, logger?: (message: string, level: 'info' | 'error') => void): void;
  
  /** Execute operation with error recovery */
  execute<T>(operation: () => Promise<T>): Promise<T>;
  
  /** Record successful operation (resets failure counters) */
  recordSuccess(): void;
  
  /** Record failed operation (increments failure counters) */
  recordFailure(error: Error): void;
  
  /** Get error recovery statistics */
  getStats(): ErrorRecoveryStats;
  
  /** Reset error recovery state */
  reset(): void;
}

// ============================================================================
// Circuit Breaker Error Recovery Strategy
// ============================================================================

/**
 * Circuit breaker error recovery implementation.
 * Stops attempting operations after N consecutive failures,
 * enters half-open state after timeout, resumes if recovery successful.
 */
export class CircuitBreakerStrategy implements ErrorRecoveryStrategy {
  private config!: ErrorRecoveryConfig;
  private logger?: (message: string, level: 'info' | 'error') => void;
  private stats: ErrorRecoveryStats = {
    totalErrors: 0,
    recoverySuccessCount: 0,
    recoveryFailureCount: 0,
    circuitBreakerState: 'closed',
    consecutiveFailures: 0,
    lastErrorAt: null,
    lastRecoveryAt: null,
  };
  private halfOpenTimeout?: NodeJS.Timeout;

  initialize(config: ErrorRecoveryConfig, logger?: (message: string, level: 'info' | 'error') => void): void {
    this.config = config;
    this.logger = logger;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check circuit breaker state
    if (this.stats.circuitBreakerState === 'open') {
      throw new Error('Circuit breaker OPEN. Operation blocked to prevent cascade failures.');
    }
    
    try {
      const result = await this.retryWithBackoff(operation);
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error as Error);
      throw error;
    }
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    let delayMs = this.config.initialRetryDelayMs;
    
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.maxRetries) {
          // Wait before retry (exponential backoff)
          await this.sleep(delayMs);
          delayMs = Math.min(
            delayMs * this.config.backoffMultiplier,
            this.config.maxRetryDelayMs
          );
        }
      }
    }
    
    throw lastError;
  }

  recordSuccess(): void {
    this.stats.recoverySuccessCount++;
    this.stats.consecutiveFailures = 0;
    this.stats.lastRecoveryAt = new Date();
    
    // Close circuit breaker if half-open
    if (this.stats.circuitBreakerState === 'half-open') {
      this.stats.circuitBreakerState = 'closed';
      this.logger?.('[CircuitBreaker] State changed: HALF-OPEN → CLOSED (recovery successful)', 'info');
    }
  }

  recordFailure(error: Error): void {
    this.stats.totalErrors++;
    this.stats.recoveryFailureCount++;
    this.stats.consecutiveFailures++;
    this.stats.lastErrorAt = new Date();
    
    // Open circuit breaker if threshold reached
    if (
      this.stats.consecutiveFailures >= this.config.circuitBreakerThreshold &&
      this.stats.circuitBreakerState === 'closed'
    ) {
      this.stats.circuitBreakerState = 'open';
      this.logger?.(`[CircuitBreaker] State changed: CLOSED → OPEN (${this.stats.consecutiveFailures} consecutive failures)`, 'error');
      this.logger?.(`[CircuitBreaker] Last error: ${error.message}`, 'error');
      
      // Schedule transition to half-open
      this.scheduleHalfOpen();
    }
  }

  getStats(): ErrorRecoveryStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      totalErrors: 0,
      recoverySuccessCount: 0,
      recoveryFailureCount: 0,
      circuitBreakerState: 'closed',
      consecutiveFailures: 0,
      lastErrorAt: null,
      lastRecoveryAt: null,
    };
    
    if (this.halfOpenTimeout) {
      clearTimeout(this.halfOpenTimeout);
      this.halfOpenTimeout = undefined;
    }
  }

  private scheduleHalfOpen(): void {
    if (this.halfOpenTimeout) {
      clearTimeout(this.halfOpenTimeout);
    }
    
    this.halfOpenTimeout = setTimeout(() => {
      if (this.stats.circuitBreakerState === 'open') {
        this.stats.circuitBreakerState = 'half-open';
        this.logger?.('[CircuitBreaker] State changed: OPEN → HALF-OPEN (attempting recovery)', 'info');
      }
    }, this.config.circuitBreakerResetMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
