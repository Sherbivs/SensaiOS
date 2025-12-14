/**
 * Strategy implementations for caching, write buffering, and error recovery.
 *
 * These strategies are used by database workers to implement intelligent
 * caching, batch processing, and fault tolerance.
 *
 * @module workers/database/strategies
 */
// ============================================================================
// LRU Cache Strategy
// ============================================================================
/**
 * Least Recently Used (LRU) cache implementation.
 * Evicts oldest accessed entries when size limit reached.
 */
export class LRUCacheStrategy {
    cache = new Map();
    config;
    stats = {
        hitCount: 0,
        missCount: 0,
        hitRate: 0,
        sizeBytes: 0,
        entryCount: 0,
        evictionCount: 0,
        utilizationPercent: 0,
    };
    initialize(config) {
        this.config = config;
    }
    get(key) {
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
    set(key, value, ttlMs) {
        const sizeBytes = this.estimateSize(value);
        // Evict if adding this entry would exceed limits
        while ((this.stats.sizeBytes + sizeBytes > this.config.maxSizeBytes ||
            this.cache.size >= this.config.maxEntries) &&
            this.cache.size > 0) {
            this.evictOne();
        }
        const entry = {
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
    has(key) {
        return this.cache.has(key);
    }
    delete(key) {
        const entry = this.cache.get(key);
        if (!entry)
            return false;
        this.cache.delete(key);
        this.stats.sizeBytes -= entry.sizeBytes;
        this.stats.entryCount = this.cache.size;
        this.updateUtilization();
        return true;
    }
    clear() {
        this.cache.clear();
        this.stats.sizeBytes = 0;
        this.stats.entryCount = 0;
        this.updateUtilization();
    }
    getStats() {
        return { ...this.stats };
    }
    evict() {
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
    evictOne() {
        // Evict first entry (least recently used)
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
            const entry = this.cache.get(firstKey);
            this.cache.delete(firstKey);
            this.stats.sizeBytes -= entry.sizeBytes;
        }
    }
    estimateSize(value) {
        // Rough size estimation (JSON serialization)
        try {
            return JSON.stringify(value).length * 2; // *2 for UTF-16 encoding
        }
        catch {
            return 1024; // Default 1KB if serialization fails
        }
    }
    updateHitRate() {
        const total = this.stats.hitCount + this.stats.missCount;
        this.stats.hitRate = total > 0 ? this.stats.hitCount / total : 0;
    }
    updateUtilization() {
        this.stats.utilizationPercent = (this.stats.sizeBytes / this.config.maxSizeBytes) * 100;
    }
}
// ============================================================================
// Hybrid Write Buffer Strategy
// ============================================================================
/**
 * Hybrid write buffer implementation.
 * Flushes on whichever comes first: time interval OR size threshold.
 */
export class HybridWriteBufferStrategy {
    buffer = [];
    config;
    eventEmitter;
    flushTimer;
    lastFlushAt = null;
    stats = {
        entryCount: 0,
        maxCapacity: 0,
        utilizationPercent: 0,
        isBackpressureActive: false,
        flushCount: 0,
        rejectedWriteCount: 0,
        lastFlushAt: null,
        avgFlushDurationMs: 0,
    };
    flushDurations = [];
    initialize(config, eventEmitter) {
        this.config = config;
        this.eventEmitter = eventEmitter;
        this.stats.maxCapacity = config.maxBufferSize;
    }
    add(write) {
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
    getAll() {
        return [...this.buffer];
    }
    clear() {
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
    getStats() {
        return { ...this.stats };
    }
    shouldFlush() {
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
    start() {
        if (this.flushTimer)
            return;
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
    stop() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = undefined;
        }
    }
    recordFlushDuration(durationMs) {
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
// Circuit Breaker Error Recovery Strategy
// ============================================================================
/**
 * Circuit breaker error recovery implementation.
 * Stops attempting operations after N consecutive failures,
 * enters half-open state after timeout, resumes if recovery successful.
 */
export class CircuitBreakerStrategy {
    config;
    logger;
    stats = {
        totalErrors: 0,
        recoverySuccessCount: 0,
        recoveryFailureCount: 0,
        circuitBreakerState: 'closed',
        consecutiveFailures: 0,
        lastErrorAt: null,
        lastRecoveryAt: null,
    };
    halfOpenTimeout;
    initialize(config, logger) {
        this.config = config;
        this.logger = logger;
    }
    async execute(operation) {
        // Check circuit breaker state
        if (this.stats.circuitBreakerState === 'open') {
            throw new Error('Circuit breaker OPEN. Operation blocked to prevent cascade failures.');
        }
        try {
            const result = await this.retryWithBackoff(operation);
            this.recordSuccess();
            return result;
        }
        catch (error) {
            this.recordFailure(error);
            throw error;
        }
    }
    async retryWithBackoff(operation) {
        let lastError;
        let delayMs = this.config.initialRetryDelayMs;
        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                return await operation();
            }
            catch (error) {
                lastError = error;
                if (attempt < this.config.maxRetries) {
                    // Wait before retry (exponential backoff)
                    await this.sleep(delayMs);
                    delayMs = Math.min(delayMs * this.config.backoffMultiplier, this.config.maxRetryDelayMs);
                }
            }
        }
        throw lastError;
    }
    recordSuccess() {
        this.stats.recoverySuccessCount++;
        this.stats.consecutiveFailures = 0;
        this.stats.lastRecoveryAt = new Date();
        // Close circuit breaker if half-open
        if (this.stats.circuitBreakerState === 'half-open') {
            this.stats.circuitBreakerState = 'closed';
            this.logger?.('[CircuitBreaker] State changed: HALF-OPEN → CLOSED (recovery successful)', 'info');
        }
    }
    recordFailure(error) {
        this.stats.totalErrors++;
        this.stats.recoveryFailureCount++;
        this.stats.consecutiveFailures++;
        this.stats.lastErrorAt = new Date();
        // Open circuit breaker if threshold reached
        if (this.stats.consecutiveFailures >= this.config.circuitBreakerThreshold &&
            this.stats.circuitBreakerState === 'closed') {
            this.stats.circuitBreakerState = 'open';
            this.logger?.(`[CircuitBreaker] State changed: CLOSED → OPEN (${this.stats.consecutiveFailures} consecutive failures)`, 'error');
            this.logger?.(`[CircuitBreaker] Last error: ${error.message}`, 'error');
            // Schedule transition to half-open
            this.scheduleHalfOpen();
        }
    }
    getStats() {
        return { ...this.stats };
    }
    reset() {
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
    scheduleHalfOpen() {
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
