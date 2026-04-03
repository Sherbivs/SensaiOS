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

import { getErrorMessage } from '../shared/utils/error-utils.js';

/**
 * Minimal interface for the Redis client methods used by this module.
 * Defined locally so that 'ioredis' is an optional runtime dependency —
 * it is imported dynamically only when REDIS_URL is explicitly configured.
 */
interface IRedisClient {
  set(key: string, value: string, expireMode: 'EX', ttl: number, setMode: 'NX'): Promise<string | null>;
  eval(script: string, numkeys: number, ...args: string[]): Promise<unknown>;
  quit(): Promise<string>;
  on(event: 'connect' | 'error' | 'close', listener: (...args: unknown[]) => void): this;
}

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
let redisClient: IRedisClient | null = null;
/** Promise cache — prevents concurrent initializations racing each other. */
let redisInitPromise: Promise<IRedisClient | null> | null = null;
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
 *
 * Only activates when REDIS_URL is explicitly set in the environment.
 * 'ioredis' is imported dynamically so it is never a required build-time
 * dependency — the module loads cleanly even when ioredis is not installed.
 */
async function initializeRedis(): Promise<IRedisClient | null> {
  // Return already-initialized client immediately.
  if (redisClient) return redisClient;
  // Return in-flight promise to prevent concurrent initializations.
  if (redisInitPromise) return redisInitPromise;

  const redisUrl = process.env['REDIS_URL'];
  const redisEnabled = process.env['REDIS_ENABLED'] !== 'false';

  // Only attempt Redis when REDIS_URL is explicitly configured.
  if (!redisUrl || !redisEnabled) {
    if (!redisEnabled) {
      logger.warn('distributed-lock', 'init', 'Redis explicitly disabled - using in-memory fallback', {
        metadata: { mode: 'in-memory-only' },
      });
    }
    redisInitPromise = Promise.resolve(null);
    return null;
  }

  redisInitPromise = (async (): Promise<IRedisClient | null> => {
    try {
      // Dynamic import — only executed when REDIS_URL is present.
      // Cast through unknown to satisfy the local IRedisClient interface.
      // @ts-expect-error — ioredis is an optional runtime dependency; not installed by default.
      // Install it with: npm install ioredis  (only needed when REDIS_URL is configured)
      const { default: RedisModule } = await import('ioredis');
      const client = new RedisModule(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        retryStrategy(times: number) {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        reconnectOnError(err: Error) {
          if (err.message.includes('READONLY')) return true;
          return false;
        },
      }) as unknown as IRedisClient;

      client.on('connect', () => {
        redisAvailable = true;
        logger.info('distributed-lock', 'connect', 'Redis connected', {
          metadata: { url: redisUrl.replace(/:[^:@]+@/, ':***@') },
        });
      });

      client.on('error', (err: unknown) => {
        redisAvailable = false;
        const e = err as Error;
        lockStats.lastError = {
          message: e.message,
          timestamp: new Date().toISOString(),
        };
        logger.error('distributed-lock', 'error', 'Redis error - falling back to in-memory', {
          error: { name: e.name, message: e.message },
        });
      });

      client.on('close', () => {
        redisAvailable = false;
        logger.warn('distributed-lock', 'close', 'Redis connection closed', {
          metadata: { mode: 'fallback-active' },
        });
      });

      // Start in-memory lock cleanup (runs every 10 seconds).
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
        cleanupInterval.unref();
      }

      redisClient = client;
      return client;
    } catch (err) {
      const message = getErrorMessage(err);
      const isNotFound =
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND';
      if (isNotFound) {
        logger.warn('distributed-lock', 'init', 'ioredis not installed - using in-memory fallback', {
          metadata: { hint: 'Run: npm install ioredis' },
        });
      } else {
        logger.error('distributed-lock', 'init', 'Failed to initialize Redis', {
          metadata: { fallback: 'in-memory', errorMsg: message },
        });
      }
      lockStats.lastError = { message, timestamp: new Date().toISOString() };
      return null;
    }
  })();

  return redisInitPromise;
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

        logger.debug('distributed-lock', 'release', 'Lock released (Redis)', {
          metadata: { key: lockKey.replace('lock:', ''), success: true },
        });
        return true;
      } else {
        logger.warn('distributed-lock', 'release', 'Lock release failed (Redis) - not owned or expired', {
          metadata: { key: lockKey.replace('lock:', ''), reason: 'ownership_mismatch' },
        });
        return false;
      }
    } catch (err) {
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
export async function acquireLock(key: string, ttlMs = 5000): Promise<Lock | null> {
  if (!key || typeof key !== 'string') {
    logger.error('distributed-lock', 'acquire', 'Invalid lock key', { metadata: { key: String(key) } });
    return null;
  }

  const lockKey = `lock:${key}`;
  const lockValue = `${process.pid}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  // Try Redis first
  const redis = await initializeRedis();
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
    } catch (err) {
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
      logger.info('distributed-lock', 'shutdown', 'Redis connection closed gracefully', {
        metadata: { finalStats: getLockStatistics() },
      });
    } catch (err) {
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
export async function releaseLock(lock: Lock | null): Promise<boolean> {
  if (!lock) {
    return false;
  }
  return await lock.release();
}
