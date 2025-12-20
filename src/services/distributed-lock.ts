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

import RedisModule from 'ioredis';
import type { Redis as RedisType } from 'ioredis';
import { log } from '../utils/logger.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface InMemoryLock {
  value: string;
  expiresAt: number;
}

export interface LockError {
  message: string;
  timestamp: string;
}

export interface LockStats {
  totalAcquired: number;
  totalReleased: number;
  totalFailed: number;
  totalFallback: number;
  currentLocks: number;
  lastError: LockError | null;
}

export interface LockStatistics extends LockStats {
  redisAvailable: boolean;
  inMemoryLocksCount: number;
}

export interface Lock {
  key: string;
  value: string;
  backend: 'redis' | 'in-memory';
  release: () => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Redis client singleton.
 * Configured via REDIS_URL environment variable.
 * Falls back to localhost:6379 if not specified.
 */
let redisClient: RedisType | null = null;
let redisAvailable = false;

/**
 * In-memory fallback for when Redis is unavailable.
 */
const inMemoryLocks = new Map<string, InMemoryLock>();

/**
 * Cleanup interval for expired in-memory locks.
 */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Lock statistics for monitoring.
 */
const lockStats: LockStats = {
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
function initializeRedis(): RedisType | null {
  if (redisClient) {
    return redisClient;
  }

  const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
  const redisEnabled = process.env['REDIS_ENABLED'] !== 'false'; // Default: enabled

  if (!redisEnabled) {
    log('warn', '[DistributedLock] Redis explicitly disabled - using in-memory fallback', {
      mode: 'in-memory-only',
    });
    return null;
  }

  try {
    redisClient = new RedisModule(redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err: Error) {
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
      log('success', '[DistributedLock] Redis connected', {
        url: redisUrl.replace(/:[^:@]+@/, ':***@'), // Hide password in logs
      });
    });

    redisClient.on('error', (err: Error) => {
      redisAvailable = false;
      lockStats.lastError = {
        message: err.message,
        timestamp: new Date().toISOString(),
      };
      log('error', '[DistributedLock] Redis error - falling back to in-memory', {
        error: err.message,
      });
    });

    redisClient.on('close', () => {
      redisAvailable = false;
      log('warn', '[DistributedLock] Redis connection closed', {
        mode: 'fallback-active',
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
          log('detail', '[DistributedLock] Cleaned expired in-memory locks', {
            cleaned,
            remaining: inMemoryLocks.size,
          });
        }
      }, 10000);

      // Prevent process from staying alive just for cleanup
      cleanupInterval.unref();
    }

    return redisClient;
  } catch (err) {
    const message = getErrorMessage(err);
    log('error', '[DistributedLock] Failed to initialize Redis', {
      error: message,
      fallback: 'in-memory',
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
async function releaseLockInternal(
  lockKey: string,
  lockValue: string,
  backend: 'redis' | 'in-memory'
): Promise<boolean> {
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

        log('detail', '[DistributedLock] Lock released (Redis)', {
          key: lockKey.replace('lock:', ''),
          success: true,
        });
        return true;
      } else {
        log('warn', '[DistributedLock] Lock release failed (Redis) - not owned or expired', {
          key: lockKey.replace('lock:', ''),
          reason: 'ownership_mismatch',
        });
        return false;
      }
    } catch (err) {
      const message = getErrorMessage(err);
      log('error', '[DistributedLock] Failed to release Redis lock', {
        key: lockKey.replace('lock:', ''),
        error: message,
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

    log('detail', '[DistributedLock] Lock released (in-memory)', {
      key: lockKey.replace('lock:', ''),
      success: true,
    });
    return true;
  }

  log('warn', '[DistributedLock] Lock release failed (in-memory) - not owned or expired', {
    key: lockKey.replace('lock:', ''),
    reason: 'ownership_mismatch',
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
export async function acquireLock(key: string, ttlMs = 5000): Promise<Lock | null> {
  if (!key || typeof key !== 'string') {
    log('error', '[DistributedLock] Invalid lock key', { key: String(key) });
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

        log('detail', '[DistributedLock] Lock acquired (Redis)', {
          key,
          ttlMs,
          lockValue: lockValue.substring(0, 16) + '...',
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
      log('detail', '[DistributedLock] Lock acquisition failed (Redis) - already held', {
        key,
        reason: 'lock_exists',
      });
      return null;
    } catch (err) {
      const message = getErrorMessage(err);
      log('warn', '[DistributedLock] Redis lock failed - falling back to in-memory', {
        key,
        error: message,
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
    log('detail', '[DistributedLock] Lock acquisition failed (in-memory) - already held', {
      key,
      reason: 'lock_exists',
      expiresIn: existing.expiresAt - now,
    });
    return null;
  }

  // Acquire lock
  inMemoryLocks.set(lockKey, { value: lockValue, expiresAt });
  lockStats.totalAcquired++;
  lockStats.currentLocks++;

  log('detail', '[DistributedLock] Lock acquired (in-memory)', {
    key,
    ttlMs,
    warning: 'Using fallback - not distributed across processes!',
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
export function getLockStatistics(): LockStatistics {
  return {
    ...lockStats,
    redisAvailable,
    inMemoryLocksCount: inMemoryLocks.size,
  };
}

/**
 * Graceful shutdown - close Redis connection.
 */
export async function shutdownDistributedLock(): Promise<void> {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  if (redisClient) {
    try {
      await redisClient.quit();
      log('info', '[DistributedLock] Redis connection closed gracefully', {
        finalStats: getLockStatistics(),
      });
    } catch (err) {
      const message = getErrorMessage(err);
      log('warn', '[DistributedLock] Error closing Redis connection', {
        error: message,
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
export async function releaseLock(lock: Lock | null): Promise<boolean> {
  if (!lock) {
    return false;
  }
  return await lock.release();
}
