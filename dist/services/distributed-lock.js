/**
 * Distributed Lock Service
 * @module services/distributed-lock
 *
 * Redis-backed distributed locking for race condition protection.
 *
 * CRITICAL SECURITY FIX:
 * Prevents race conditions in role assignments when multiple concurrent events fire.
 *
 * FEATURES:
 *   - Atomic lock acquisition (SET NX EX)
 *   - Auto-release with TTL (prevents deadlock)
 *   - Lua script for safe release (prevents releasing other process's lock)
 *   - Graceful fallback to in-memory locks if Redis unavailable
 *   - Comprehensive logging and metrics
 */
// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../shared/logging/index.js';
const logger = getLogger();
import RedisModule from 'ioredis';
import { getErrorMessage } from '../shared/utils/error-utils.js';
// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Redis client singleton.
 * Configured via REDIS_URL environment variable.
 * Falls back to localhost:6379 if not specified.
 */
let redisClient = null;
let redisAvailable = false;
/**
 * In-memory fallback for when Redis is unavailable.
 */
const inMemoryLocks = new Map();
/**
 * Cleanup interval for expired in-memory locks.
 */
let cleanupInterval = null;
/**
 * Lock statistics for monitoring.
 */
const lockStats = {
    totalAcquired: 0,
    totalReleased: 0,
    totalFailed: 0,
    totalFallback: 0,
    currentLocks: 0,
    lastError: null,
};
// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Initialize Redis connection.
 * Called automatically on first lock attempt.
 */
function initializeRedis() {
    if (redisClient) {
        return redisClient;
    }
    const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
    const redisEnabled = process.env['REDIS_ENABLED'] !== 'false'; // Default: enabled
    if (!redisEnabled) {
        logger.warn('distributed-lock', 'init', 'Redis explicitly disabled - using in-memory fallback', {
            metadata: { mode: 'in-memory-only' },
        });
        return null;
    }
    try {
        redisClient = new RedisModule(redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            reconnectOnError(err) {
                const targetError = 'READONLY';
                if (err.message.includes(targetError)) {
                    // Reconnect on READONLY errors
                    return true;
                }
                return false;
            },
        });
        redisClient.on('connect', () => {
            redisAvailable = true;
            logger.info('distributed-lock', 'connect', 'Redis connected', {
                metadata: { url: redisUrl.replace(/:[^:@]+@/, ':***@') },
            });
        });
        redisClient.on('error', (err) => {
            redisAvailable = false;
            lockStats.lastError = {
                message: err.message,
                timestamp: new Date().toISOString(),
            };
            logger.error('distributed-lock', 'error', 'Redis error - falling back to in-memory', {
                error: { name: err.name, message: err.message },
            });
        });
        redisClient.on('close', () => {
            redisAvailable = false;
            logger.warn('distributed-lock', 'close', 'Redis connection closed', {
                metadata: { mode: 'fallback-active' },
            });
        });
        // Start in-memory lock cleanup (runs every 10 seconds)
        if (!cleanupInterval) {
            cleanupInterval = setInterval(() => {
                const now = Date.now();
                let cleaned = 0;
                for (const [key, lock] of inMemoryLocks.entries()) {
                    if (lock.expiresAt < now) {
                        inMemoryLocks.delete(key);
                        cleaned++;
                    }
                }
                if (cleaned > 0) {
                    logger.debug('distributed-lock', 'cleanup', 'Cleaned expired in-memory locks', {
                        metadata: { cleaned, remaining: inMemoryLocks.size },
                    });
                }
            }, 10000);
            // Prevent process from staying alive just for cleanup
            cleanupInterval.unref();
        }
        return redisClient;
    }
    catch (err) {
        const message = getErrorMessage(err);
        logger.error('distributed-lock', 'init', 'Failed to initialize Redis', {
            metadata: { fallback: 'in-memory', errorMsg: message },
        });
        lockStats.lastError = {
            message,
            timestamp: new Date().toISOString(),
        };
        return null;
    }
}
/**
 * Release distributed lock (internal implementation).
 * Uses Lua script to ensure atomic check-and-delete (only release if we own the lock).
 */
async function releaseLockInternal(lockKey, lockValue, backend) {
    if (backend === 'redis' && redisClient && redisAvailable) {
        try {
            // Lua script ensures atomic check-and-delete
            // Only delete if the value matches (prevents releasing another process's lock)
            const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
            const result = await redisClient.eval(script, 1, lockKey, lockValue);
            if (result === 1) {
                lockStats.totalReleased++;
                lockStats.currentLocks = Math.max(0, lockStats.currentLocks - 1);
                logger.debug('distributed-lock', 'release', 'Lock released (Redis)', {
                    metadata: { key: lockKey.replace('lock:', ''), success: true },
                });
                return true;
            }
            else {
                logger.warn('distributed-lock', 'release', 'Lock release failed (Redis) - not owned or expired', {
                    metadata: { key: lockKey.replace('lock:', ''), reason: 'ownership_mismatch' },
                });
                return false;
            }
        }
        catch (err) {
            const message = getErrorMessage(err);
            logger.error('distributed-lock', 'release', 'Failed to release Redis lock', {
                metadata: { key: lockKey.replace('lock:', ''), errorMsg: message },
            });
            return false;
        }
    }
    // In-memory release
    const existing = inMemoryLocks.get(lockKey);
    if (existing && existing.value === lockValue) {
        inMemoryLocks.delete(lockKey);
        lockStats.totalReleased++;
        lockStats.currentLocks = Math.max(0, lockStats.currentLocks - 1);
        logger.debug('distributed-lock', 'release', 'Lock released (in-memory)', {
            metadata: { key: lockKey.replace('lock:', ''), success: true },
        });
        return true;
    }
    logger.warn('distributed-lock', 'release', 'Lock release failed (in-memory) - not owned or expired', {
        metadata: { key: lockKey.replace('lock:', ''), reason: 'ownership_mismatch' },
    });
    return false;
}
// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Acquire distributed lock.
 *
 * @param key - Lock key (e.g., 'assign:guild123:user456:role789')
 * @param ttlMs - Lock time-to-live in milliseconds (default: 5000)
 * @returns Lock object with release() method, or null if failed
 *
 * @example
 * const lock = await acquireLock('assign:123:456', 5000);
 * if (!lock) {
 *   console.log('Lock acquisition failed - operation already in progress');
 *   return;
 * }
 *
 * try {
 *   // Perform critical section work
 *   await member.roles.add(role);
 * } finally {
 *   await lock.release();
 * }
 */
export async function acquireLock(key, ttlMs = 5000) {
    if (!key || typeof key !== 'string') {
        logger.error('distributed-lock', 'acquire', 'Invalid lock key', { metadata: { key: String(key) } });
        return null;
    }
    const lockKey = `lock:${key}`;
    const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    const ttlSeconds = Math.ceil(ttlMs / 1000);
    // Try Redis first
    const redis = initializeRedis();
    if (redis && redisAvailable) {
        try {
            // SET NX EX - atomic operation
            // NX = only set if not exists
            // EX = set expiry in seconds
            const result = await redis.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');
            if (result === 'OK') {
                lockStats.totalAcquired++;
                lockStats.currentLocks++;
                logger.debug('distributed-lock', 'acquire', 'Lock acquired (Redis)', {
                    metadata: { key, ttlMs, lockValue: lockValue.substring(0, 16) + '...' },
                });
                return {
                    key: lockKey,
                    value: lockValue,
                    backend: 'redis',
                    release: async () => await releaseLockInternal(lockKey, lockValue, 'redis'),
                };
            }
            // Lock already held by another process
            lockStats.totalFailed++;
            logger.debug('distributed-lock', 'acquire', 'Lock acquisition failed (Redis) - already held', {
                metadata: { key, reason: 'lock_exists' },
            });
            return null;
        }
        catch (err) {
            const message = getErrorMessage(err);
            logger.warn('distributed-lock', 'acquire', 'Redis lock failed - falling back to in-memory', {
                metadata: { key, errorMsg: message },
            });
            // Fall through to in-memory fallback
        }
    }
    // In-memory fallback
    lockStats.totalFallback++;
    const now = Date.now();
    const expiresAt = now + ttlMs;
    // Check if lock already exists and not expired
    const existing = inMemoryLocks.get(lockKey);
    if (existing && existing.expiresAt > now) {
        lockStats.totalFailed++;
        logger.debug('distributed-lock', 'acquire', 'Lock acquisition failed (in-memory) - already held', {
            metadata: { key, reason: 'lock_exists', expiresIn: existing.expiresAt - now },
        });
        return null;
    }
    // Acquire lock
    inMemoryLocks.set(lockKey, { value: lockValue, expiresAt });
    lockStats.totalAcquired++;
    lockStats.currentLocks++;
    logger.debug('distributed-lock', 'acquire', 'Lock acquired (in-memory)', {
        metadata: { key, ttlMs, warning: 'Using fallback - not distributed across processes!' },
    });
    return {
        key: lockKey,
        value: lockValue,
        backend: 'in-memory',
        release: async () => await releaseLockInternal(lockKey, lockValue, 'in-memory'),
    };
}
/**
 * Get lock statistics for monitoring/debugging.
 */
export function getLockStatistics() {
    return {
        ...lockStats,
        redisAvailable,
        inMemoryLocksCount: inMemoryLocks.size,
    };
}
/**
 * Graceful shutdown - close Redis connection.
 */
export async function shutdownDistributedLock() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    if (redisClient) {
        try {
            await redisClient.quit();
            logger.info('distributed-lock', 'shutdown', 'Redis connection closed gracefully', {
                metadata: { finalStats: getLockStatistics() },
            });
        }
        catch (err) {
            const message = getErrorMessage(err);
            logger.warn('distributed-lock', 'shutdown', 'Error closing Redis connection', {
                metadata: { errorMsg: message },
            });
        }
        redisClient = null;
        redisAvailable = false;
    }
    inMemoryLocks.clear();
}
/**
 * Release a lock obtained from acquireLock().
 * Convenience wrapper that calls lock.release() internally.
 *
 * @param lock - Lock object from acquireLock()
 * @returns true if lock was released successfully
 */
export async function releaseLock(lock) {
    if (!lock) {
        return false;
    }
    return await lock.release();
}
