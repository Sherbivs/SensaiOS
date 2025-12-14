/**
 * Centralized Log Buffer
 *
 * Collects logs in memory and flushes them at configurable intervals.
 * Reduces console noise by consolidating frequent log messages.
 *
 * Features:
 * - Deduplication: Identical messages are counted instead of repeated
 * - Aggregation: Similar messages are grouped together
 * - Priority: Error/warn logs can bypass buffering for immediate visibility
 * - Scalable: Bounded memory usage with automatic buffer overflow handling
 */
const DEFAULT_CONFIG = {
    flushIntervalMs: 10_000, // 10 seconds (unchanged for balanced flush frequency)
    maxBufferSize: 200, // Reduced from 1000 (5x reduction for memory optimization)
    bypassCritical: true,
    enabled: true,
};
/**
 * Create a simple hash for deduplication
 */
function createHash(level, message, context) {
    const contextStr = context ? JSON.stringify(sortObject(context)) : "";
    return `${level}:${message}:${contextStr}`;
}
/**
 * Sort object keys for consistent hashing
 */
function sortObject(obj) {
    const sorted = {};
    for (const key of Object.keys(obj).sort()) {
        const value = obj[key];
        if (value && typeof value === "object" && !Array.isArray(value)) {
            sorted[key] = sortObject(value);
        }
        else {
            sorted[key] = value;
        }
    }
    return sorted;
}
export class LogBuffer {
    buffer = new Map();
    config;
    flushTimer = null;
    flushCallback;
    paused = false;
    constructor(flushCallback, config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.flushCallback = flushCallback;
        if (this.config.enabled && this.config.flushIntervalMs > 0) {
            this.startFlushTimer();
        }
    }
    /**
     * Add a log entry to the buffer
     */
    add(level, message, context) {
        if (!this.config.enabled || this.paused) {
            // Buffer disabled or paused - flush immediately
            this.flushCallback([{
                    level,
                    message,
                    context,
                    count: 1,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    hash: createHash(level, message, context),
                }]);
            return;
        }
        // Bypass buffer for critical logs if configured
        if (this.config.bypassCritical && (level === "error" || level === "warn")) {
            this.flushCallback([{
                    level,
                    message,
                    context,
                    count: 1,
                    firstSeen: Date.now(),
                    lastSeen: Date.now(),
                    hash: createHash(level, message, context),
                }]);
            return;
        }
        const hash = createHash(level, message, context);
        const now = Date.now();
        const existing = this.buffer.get(hash);
        if (existing) {
            // Deduplicate: increment count and update timestamp
            existing.count++;
            existing.lastSeen = now;
            // Merge context if present (keep first values, add new unique keys)
            if (context && existing.context) {
                existing.context = { ...existing.context, ...context };
            }
        }
        else {
            // New entry
            this.buffer.set(hash, {
                level,
                message,
                context: context ? { ...context } : undefined,
                count: 1,
                firstSeen: now,
                lastSeen: now,
                hash,
            });
        }
        // Force flush if buffer exceeds max size
        if (this.buffer.size >= this.config.maxBufferSize) {
            this.flush();
        }
    }
    /**
     * Manually flush all buffered logs
     */
    flush() {
        if (this.buffer.size === 0)
            return;
        const entries = Array.from(this.buffer.values());
        // Sort by: level (error first), then by first seen time
        const levelOrder = { error: 0, warn: 1, info: 2, debug: 3 };
        entries.sort((a, b) => {
            const levelDiff = levelOrder[a.level] - levelOrder[b.level];
            if (levelDiff !== 0)
                return levelDiff;
            return a.firstSeen - b.firstSeen;
        });
        this.flushCallback(entries);
        this.buffer.clear();
    }
    /**
     * Start automatic flush timer
     */
    startFlushTimer() {
        if (this.flushTimer)
            return;
        this.flushTimer = setInterval(() => {
            this.flush();
        }, this.config.flushIntervalMs);
        // Prevent timer from keeping process alive
        this.flushTimer.unref();
    }
    /**
     * Stop automatic flush timer
     */
    stopFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
    /**
     * Pause buffering (flush immediately)
     */
    pause() {
        this.paused = true;
        this.flush();
    }
    /**
     * Resume buffering
     */
    resume() {
        this.paused = false;
    }
    /**
     * Update configuration
     */
    configure(newConfig) {
        const oldFlushInterval = this.config.flushIntervalMs;
        this.config = { ...this.config, ...newConfig };
        // Restart timer if interval changed
        if (this.config.flushIntervalMs !== oldFlushInterval) {
            this.stopFlushTimer();
            if (this.config.enabled && this.config.flushIntervalMs > 0) {
                this.startFlushTimer();
            }
        }
    }
    /**
     * Get current buffer size
     */
    size() {
        return this.buffer.size;
    }
    /**
     * Shutdown and cleanup
     */
    destroy() {
        this.stopFlushTimer();
        this.flush(); // Final flush before shutdown
        this.buffer.clear();
    }
    /**
     * Get buffer statistics
     */
    getStats() {
        let totalMessages = 0;
        for (const entry of this.buffer.values()) {
            totalMessages += entry.count;
        }
        return {
            buffered: this.buffer.size,
            totalMessages,
        };
    }
}
// Global singleton instance
let globalBuffer = null;
/**
 * Initialize the global log buffer
 */
export function initLogBuffer(flushCallback, config = {}) {
    if (globalBuffer) {
        globalBuffer.destroy();
    }
    globalBuffer = new LogBuffer(flushCallback, config);
    return globalBuffer;
}
/**
 * Get the global log buffer instance
 */
export function getLogBuffer() {
    return globalBuffer;
}
/**
 * Destroy the global log buffer
 */
export function destroyLogBuffer() {
    if (globalBuffer) {
        globalBuffer.destroy();
        globalBuffer = null;
    }
}
