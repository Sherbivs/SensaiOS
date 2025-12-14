/**
 * Token Bucket Rate Limiter
 *
 * @module src/shared/rate-limiter
 * @description RFC 6585 compliant rate limiting with token bucket algorithm.
 * Provides smooth rate limiting that allows controlled bursts while enforcing
 * long-term rate limits.
 *
 * @security Prevents abuse through configurable rate limits with retry-after headers
 * @reference https://datatracker.ietf.org/doc/html/rfc6585 (HTTP 429 Too Many Requests)
 * @research R2 - Token Bucket Rate Limiting (FINAL-REVIEW.md)
 *
 * @example
 * ```typescript
 * import { RateLimiter, createRateLimiter } from '../shared/rate-limiter.js';
 *
 * // Create a rate limiter: 10 requests per minute with burst of 3
 * const limiter = createRateLimiter({
 *   tokensPerInterval: 10,
 *   interval: 60000, // 1 minute
 *   maxBurst: 3
 * });
 *
 * // Check if request is allowed
 * const result = limiter.consume('user-123');
 * if (!result.allowed) {
 *   res.status(429)
 *     .header('Retry-After', String(result.retryAfterSeconds))
 *     .json({ error: 'Rate limit exceeded' });
 * }
 * ```
 *
 * @author Security Specialist (Sprint 1)
 * @since 2025-01-XX
 */
// ============================================================================
// Token Bucket Rate Limiter Class
// ============================================================================
/**
 * Token Bucket Rate Limiter
 *
 * @description Implements the token bucket algorithm for rate limiting.
 * Tokens are added at a fixed rate up to a maximum capacity (burst limit).
 * Each request consumes one token. If no tokens available, request is denied.
 *
 * Algorithm:
 * 1. Calculate elapsed time since last refill
 * 2. Add tokens based on elapsed time (up to maxBurst)
 * 3. If tokens >= 1, allow request and decrement
 * 4. If tokens < 1, deny request and calculate retry-after
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   tokensPerInterval: 100,   // 100 requests per interval
 *   interval: 60000,          // 1 minute
 *   maxBurst: 10              // Allow burst of 10 rapid requests
 * });
 *
 * // Per-user rate limiting
 * const result = limiter.consume(`user:${userId}`);
 *
 * // Per-IP rate limiting
 * const result = limiter.consume(`ip:${clientIp}`);
 *
 * // Per-endpoint rate limiting
 * const result = limiter.consume(`endpoint:/api/search`);
 * ```
 */
export class RateLimiter {
    config;
    buckets;
    startTime;
    totalRequests;
    allowedRequests;
    deniedRequests;
    cleanupInterval;
    /**
     * Create a new rate limiter
     * @param config - Rate limiter configuration
     */
    constructor(config) {
        // Validate config
        if (config.tokensPerInterval <= 0) {
            throw new Error('tokensPerInterval must be positive');
        }
        if (config.interval <= 0) {
            throw new Error('interval must be positive');
        }
        const maxBurst = config.maxBurst ?? config.tokensPerInterval;
        this.config = {
            tokensPerInterval: config.tokensPerInterval,
            interval: config.interval,
            maxBurst,
            initialTokens: config.initialTokens ?? maxBurst,
            keyPrefix: config.keyPrefix ?? 'rl',
            enableLogging: config.enableLogging ?? false,
        };
        this.buckets = new Map();
        this.startTime = Date.now();
        this.totalRequests = 0;
        this.allowedRequests = 0;
        this.deniedRequests = 0;
        this.cleanupInterval = null;
        // Start automatic cleanup of stale buckets
        this.startCleanup();
    }
    /**
     * Attempt to consume a token for the given key
     *
     * @param key - Unique identifier for rate limiting (user ID, IP, etc.)
     * @param tokensToConsume - Number of tokens to consume (default: 1)
     * @returns Rate limit result with allowed status and metadata
     *
     * @example
     * ```typescript
     * const result = limiter.consume('user-123');
     * if (!result.allowed) {
     *   // Return 429 with Retry-After header
     *   res.setHeader('Retry-After', result.retryAfterSeconds);
     *   res.setHeader('X-RateLimit-Limit', result.limit);
     *   res.setHeader('X-RateLimit-Remaining', result.remaining);
     *   res.setHeader('X-RateLimit-Reset', Math.floor(Date.now()/1000) + result.resetSeconds);
     * }
     * ```
     */
    consume(key, tokensToConsume = 1) {
        const fullKey = `${this.config.keyPrefix}:${key}`;
        const now = Date.now();
        // Get or create bucket
        let bucket = this.buckets.get(fullKey);
        if (!bucket) {
            bucket = {
                tokens: this.config.initialTokens,
                lastRefill: now,
                requestCount: 0,
                deniedCount: 0,
            };
            this.buckets.set(fullKey, bucket);
        }
        // Refill tokens based on elapsed time
        const elapsed = now - bucket.lastRefill;
        const tokensToAdd = (elapsed / this.config.interval) * this.config.tokensPerInterval;
        bucket.tokens = Math.min(this.config.maxBurst, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
        // Track current tokens before consumption attempt
        const currentTokens = bucket.tokens;
        // Attempt to consume
        this.totalRequests++;
        bucket.requestCount++;
        const allowed = bucket.tokens >= tokensToConsume;
        if (allowed) {
            bucket.tokens -= tokensToConsume;
            this.allowedRequests++;
        }
        else {
            bucket.deniedCount++;
            this.deniedRequests++;
        }
        // Calculate reset time (time until fully refilled)
        const tokensNeeded = this.config.maxBurst - bucket.tokens;
        const resetSeconds = Math.ceil((tokensNeeded / this.config.tokensPerInterval) * (this.config.interval / 1000));
        // Calculate retry-after (time until at least one token available)
        let retryAfterSeconds;
        if (!allowed) {
            const tokensNeededForOne = tokensToConsume - bucket.tokens;
            retryAfterSeconds = Math.ceil((tokensNeededForOne / this.config.tokensPerInterval) * (this.config.interval / 1000));
            // Ensure at least 1 second
            retryAfterSeconds = Math.max(1, retryAfterSeconds);
        }
        return {
            allowed,
            remaining: Math.floor(bucket.tokens),
            limit: this.config.maxBurst,
            resetSeconds,
            retryAfterSeconds,
            currentTokens: Math.floor(currentTokens),
        };
    }
    /**
     * Check rate limit without consuming a token
     *
     * @param key - Unique identifier for rate limiting
     * @returns Current rate limit status
     */
    peek(key) {
        const fullKey = `${this.config.keyPrefix}:${key}`;
        const bucket = this.buckets.get(fullKey);
        if (!bucket) {
            return {
                allowed: true,
                remaining: this.config.maxBurst,
                limit: this.config.maxBurst,
                resetSeconds: 0,
                currentTokens: this.config.maxBurst,
            };
        }
        // Calculate current tokens without modifying
        const now = Date.now();
        const elapsed = now - bucket.lastRefill;
        const tokensToAdd = (elapsed / this.config.interval) * this.config.tokensPerInterval;
        const currentTokens = Math.min(this.config.maxBurst, bucket.tokens + tokensToAdd);
        const allowed = currentTokens >= 1;
        const tokensNeeded = this.config.maxBurst - currentTokens;
        const resetSeconds = Math.ceil((tokensNeeded / this.config.tokensPerInterval) * (this.config.interval / 1000));
        let retryAfterSeconds;
        if (!allowed) {
            const tokensNeededForOne = 1 - currentTokens;
            retryAfterSeconds = Math.ceil((tokensNeededForOne / this.config.tokensPerInterval) * (this.config.interval / 1000));
            retryAfterSeconds = Math.max(1, retryAfterSeconds);
        }
        return {
            allowed,
            remaining: Math.floor(currentTokens),
            limit: this.config.maxBurst,
            resetSeconds,
            retryAfterSeconds,
            currentTokens: Math.floor(currentTokens),
        };
    }
    /**
     * Reset rate limit for a specific key
     *
     * @param key - Key to reset
     * @returns True if key existed and was reset
     */
    reset(key) {
        const fullKey = `${this.config.keyPrefix}:${key}`;
        const existed = this.buckets.has(fullKey);
        this.buckets.delete(fullKey);
        return existed;
    }
    /**
     * Clear all rate limit buckets
     */
    clear() {
        this.buckets.clear();
    }
    /**
     * Get statistics for this rate limiter
     */
    getStats() {
        // Estimate memory usage (rough calculation)
        // Each bucket: ~100 bytes (key avg 30 bytes + bucket object)
        const memoryUsageBytes = this.buckets.size * 100;
        return {
            totalRequests: this.totalRequests,
            allowedRequests: this.allowedRequests,
            deniedRequests: this.deniedRequests,
            activeKeys: this.buckets.size,
            memoryUsageBytes,
            uptimeMs: Date.now() - this.startTime,
        };
    }
    /**
     * Get detailed statistics for a specific key
     *
     * @param key - Key to get stats for
     * @returns Bucket stats or null if not found
     */
    getKeyStats(key) {
        const fullKey = `${this.config.keyPrefix}:${key}`;
        const bucket = this.buckets.get(fullKey);
        if (!bucket) {
            return null;
        }
        // Calculate current tokens
        const now = Date.now();
        const elapsed = now - bucket.lastRefill;
        const tokensToAdd = (elapsed / this.config.interval) * this.config.tokensPerInterval;
        const currentTokens = Math.min(this.config.maxBurst, bucket.tokens + tokensToAdd);
        return {
            requestCount: bucket.requestCount,
            deniedCount: bucket.deniedCount,
            currentTokens: Math.floor(currentTokens),
        };
    }
    /**
     * Start automatic cleanup of stale buckets
     * Removes buckets that are fully refilled and haven't been used recently
     */
    startCleanup() {
        // Cleanup every interval * 10 (or at least every 5 minutes)
        const cleanupMs = Math.max(this.config.interval * 10, 5 * 60 * 1000);
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const staleThreshold = this.config.interval * 10; // 10x interval
            for (const [key, bucket] of this.buckets.entries()) {
                const elapsed = now - bucket.lastRefill;
                if (elapsed > staleThreshold && bucket.tokens >= this.config.maxBurst) {
                    this.buckets.delete(key);
                }
            }
        }, cleanupMs);
        // Don't prevent process exit
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }
    /**
     * Stop the rate limiter and cleanup resources
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.buckets.clear();
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
/**
 * Create a new rate limiter with the given configuration
 *
 * @param config - Rate limiter configuration
 * @returns Configured rate limiter instance
 *
 * @example
 * ```typescript
 * // 100 requests per minute with burst of 10
 * const apiLimiter = createRateLimiter({
 *   tokensPerInterval: 100,
 *   interval: 60000,
 *   maxBurst: 10
 * });
 *
 * // 5 requests per second with burst of 2
 * const strictLimiter = createRateLimiter({
 *   tokensPerInterval: 5,
 *   interval: 1000,
 *   maxBurst: 2
 * });
 * ```
 */
export function createRateLimiter(config) {
    return new RateLimiter(config);
}
// ============================================================================
// Preset Rate Limiters
// ============================================================================
/**
 * Preset rate limiter configurations for common use cases
 */
export const RateLimitPresets = {
    /**
     * Standard API rate limit: 100 requests/minute, burst of 10
     */
    STANDARD_API: {
        tokensPerInterval: 100,
        interval: 60 * 1000,
        maxBurst: 10,
    },
    /**
     * Strict API rate limit: 30 requests/minute, burst of 5
     */
    STRICT_API: {
        tokensPerInterval: 30,
        interval: 60 * 1000,
        maxBurst: 5,
    },
    /**
     * Generous API rate limit: 1000 requests/minute, burst of 50
     */
    GENEROUS_API: {
        tokensPerInterval: 1000,
        interval: 60 * 1000,
        maxBurst: 50,
    },
    /**
     * Authentication attempts: 5 attempts per 15 minutes
     */
    AUTH_ATTEMPTS: {
        tokensPerInterval: 5,
        interval: 15 * 60 * 1000,
        maxBurst: 5,
    },
    /**
     * Password reset: 3 requests per hour
     */
    PASSWORD_RESET: {
        tokensPerInterval: 3,
        interval: 60 * 60 * 1000,
        maxBurst: 3,
    },
    /**
     * Discord command: 5 commands per 10 seconds per user
     */
    DISCORD_COMMAND: {
        tokensPerInterval: 5,
        interval: 10 * 1000,
        maxBurst: 3,
    },
    /**
     * Discord battle actions: 2 actions per 3 seconds
     */
    DISCORD_BATTLE: {
        tokensPerInterval: 2,
        interval: 3 * 1000,
        maxBurst: 2,
    },
    /**
     * Search/expensive operations: 10 per minute
     */
    EXPENSIVE_OPERATION: {
        tokensPerInterval: 10,
        interval: 60 * 1000,
        maxBurst: 3,
    },
};
// ============================================================================
// Middleware Helpers
// ============================================================================
/**
 * Create HTTP response headers for rate limit result
 *
 * @param result - Rate limit check result
 * @returns Headers object for response
 *
 * @example
 * ```typescript
 * const result = limiter.consume(userId);
 * const headers = createRateLimitHeaders(result);
 *
 * // Set headers on response
 * Object.entries(headers).forEach(([key, value]) => {
 *   res.setHeader(key, value);
 * });
 * ```
 */
export function createRateLimitHeaders(result) {
    const headers = {
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + result.resetSeconds),
    };
    if (result.retryAfterSeconds !== undefined) {
        headers['Retry-After'] = String(result.retryAfterSeconds);
    }
    return headers;
}
/**
 * Create rate limit error response body
 *
 * @param result - Rate limit check result
 * @returns Error response object
 */
export function createRateLimitErrorBody(result) {
    return {
        error: 'rate_limit_exceeded',
        message: `Rate limit exceeded. Please retry after ${result.retryAfterSeconds} seconds.`,
        retryAfter: result.retryAfterSeconds ?? 1,
        limit: result.limit,
        remaining: result.remaining,
    };
}
// ============================================================================
// Composite Rate Limiter
// ============================================================================
/**
 * Composite rate limiter that combines multiple limiters
 * Useful for applying multiple rate limits (e.g., per-user AND per-IP)
 */
export class CompositeRateLimiter {
    limiters;
    constructor() {
        this.limiters = new Map();
    }
    /**
     * Add a named rate limiter
     *
     * @param name - Limiter name (e.g., 'user', 'ip', 'global')
     * @param config - Rate limiter configuration
     */
    addLimiter(name, config) {
        this.limiters.set(name, new RateLimiter(config));
    }
    /**
     * Check all limiters for the given keys
     *
     * @param keys - Map of limiter name to key (e.g., { user: 'user-123', ip: '1.2.3.4' })
     * @returns Combined result (denied if ANY limiter denies)
     */
    consume(keys) {
        let mostRestrictive = {
            allowed: true,
            remaining: Infinity,
            limit: Infinity,
            resetSeconds: 0,
            currentTokens: Infinity,
        };
        for (const [name, key] of Object.entries(keys)) {
            const limiter = this.limiters.get(name);
            if (!limiter)
                continue;
            const result = limiter.consume(key);
            // Track most restrictive result
            if (!result.allowed) {
                mostRestrictive = { ...result, deniedBy: name };
                break; // Stop on first denial
            }
            if (result.remaining < mostRestrictive.remaining) {
                mostRestrictive = result;
            }
        }
        return mostRestrictive;
    }
    /**
     * Shutdown all limiters
     */
    shutdown() {
        for (const limiter of this.limiters.values()) {
            limiter.shutdown();
        }
        this.limiters.clear();
    }
}
/**
 * Sliding Window Rate Limiter
 *
 * @description Alternative to token bucket that provides more predictable
 * rate limiting using a sliding time window. Better for strict limits.
 *
 * @example
 * ```typescript
 * const limiter = new SlidingWindowLimiter({
 *   maxRequests: 100,
 *   windowMs: 60000 // 100 requests per minute
 * });
 * ```
 */
export class SlidingWindowLimiter {
    config;
    windows;
    cleanupInterval;
    constructor(config) {
        if (config.maxRequests <= 0) {
            throw new Error('maxRequests must be positive');
        }
        if (config.windowMs <= 0) {
            throw new Error('windowMs must be positive');
        }
        this.config = {
            maxRequests: config.maxRequests,
            windowMs: config.windowMs,
            keyPrefix: config.keyPrefix ?? 'sw',
        };
        this.windows = new Map();
        this.cleanupInterval = null;
        this.startCleanup();
    }
    /**
     * Attempt to consume a request slot
     */
    consume(key) {
        const fullKey = `${this.config.keyPrefix}:${key}`;
        const now = Date.now();
        const windowStart = now - this.config.windowMs;
        // Get or create window
        let timestamps = this.windows.get(fullKey) ?? [];
        // Remove timestamps outside the window
        timestamps = timestamps.filter(ts => ts > windowStart);
        const currentCount = timestamps.length;
        const allowed = currentCount < this.config.maxRequests;
        if (allowed) {
            timestamps.push(now);
        }
        this.windows.set(fullKey, timestamps);
        // Calculate reset time
        const oldestTimestamp = timestamps[0] ?? now;
        const resetSeconds = Math.ceil((oldestTimestamp + this.config.windowMs - now) / 1000);
        // Calculate retry-after
        let retryAfterSeconds;
        if (!allowed && timestamps.length > 0) {
            const nextAvailable = timestamps[0] + this.config.windowMs;
            retryAfterSeconds = Math.max(1, Math.ceil((nextAvailable - now) / 1000));
        }
        return {
            allowed,
            remaining: Math.max(0, this.config.maxRequests - timestamps.length),
            limit: this.config.maxRequests,
            resetSeconds: Math.max(0, resetSeconds),
            retryAfterSeconds,
            currentTokens: this.config.maxRequests - currentCount,
        };
    }
    /**
     * Reset rate limit for a key
     */
    reset(key) {
        const fullKey = `${this.config.keyPrefix}:${key}`;
        const existed = this.windows.has(fullKey);
        this.windows.delete(fullKey);
        return existed;
    }
    /**
     * Clear all windows
     */
    clear() {
        this.windows.clear();
    }
    startCleanup() {
        // Cleanup every window duration
        this.cleanupInterval = setInterval(() => {
            const windowStart = Date.now() - this.config.windowMs;
            for (const [key, timestamps] of this.windows.entries()) {
                const filtered = timestamps.filter(ts => ts > windowStart);
                if (filtered.length === 0) {
                    this.windows.delete(key);
                }
                else {
                    this.windows.set(key, filtered);
                }
            }
        }, this.config.windowMs);
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }
    /**
     * Shutdown the limiter
     */
    shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.windows.clear();
    }
}
// ============================================================================
// Module Exports Summary
// ============================================================================
/**
 * Rate limiter module exports:
 *
 * Classes:
 * - RateLimiter - Token bucket rate limiter
 * - CompositeRateLimiter - Multiple limiters combined
 * - SlidingWindowLimiter - Alternative sliding window algorithm
 *
 * Factory Functions:
 * - createRateLimiter() - Create token bucket limiter
 *
 * Presets:
 * - RateLimitPresets - Common configurations (STANDARD_API, AUTH_ATTEMPTS, etc.)
 *
 * Helpers:
 * - createRateLimitHeaders() - RFC 6585 compliant headers
 * - createRateLimitErrorBody() - Standard error response
 *
 * Types:
 * - RateLimiterConfig
 * - RateLimitResult
 * - RateLimiterStats
 * - SlidingWindowConfig
 */
