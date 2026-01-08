/**
 * SensaiOS Lock Manager — Deadlock Prevention & Detection
 * 
 * Centralized advisory lock management with:
 * - Configurable timeouts (prevents deadlocks)
 * - Victim selection (when timeout reached)
 * - Lock monitoring and metrics
 * - Transaction-scoped vs session-scoped locks
 * 
 * @module sensaios/concurrency/lock-manager
 * @version 1.0.0
 */

import type { PrismaClient } from '../../generated/prisma/client.js';
import { scopedLogger } from '../../observability/envelope/console.js';

/** Scoped logger for lock operations */
const log = scopedLogger('sensaios-locks');

// ============================================================================
// TYPES
// ============================================================================

/**
 * Lock scope determines when lock is released
 */
export type LockScope = 
  | 'transaction'  // Released when transaction commits/rollbacks
  | 'session';     // Released when connection closes

/**
 * Lock domain for namespacing locks
 */
export type LockDomain = 
  | 'battle'       // Battle engine locks
  | 'encounter'    // Encounter flow locks  
  | 'trainer'      // Trainer state locks
  | 'guild'        // Guild config locks
  | 'component';   // Component lifecycle locks

/**
 * Lock request with timeout configuration
 */
export interface LockRequest {
  /** Lock domain (namespaces the lock) */
  domain: LockDomain;

  /** Resource ID within domain */
  resourceId: string;

  /** Lock scope (transaction vs session) */
  scope: LockScope;

  /** Timeout in milliseconds (0 = no wait) */
  timeoutMs: number;

  /** Optional reason for audit */
  reason?: string;

  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Active lock information
 */
export interface ActiveLock {
  /** Lock key (domain:resourceId hash) */
  key: bigint;

  /** Lock domain */
  domain: LockDomain;

  /** Resource ID */
  resourceId: string;

  /** Lock scope */
  scope: LockScope;

  /** When lock was acquired */
  acquiredAt: Date;

  /** Lock reason */
  reason?: string;

  /** Correlation ID */
  correlationId?: string;

  /** Timeout (for monitoring) */
  timeoutMs: number;
}

/**
 * Lock acquisition result
 */
export interface LockResult {
  /** Whether lock was acquired */
  acquired: boolean;

  /** Lock key if acquired */
  key?: bigint;

  /** Time waited in ms */
  waitTimeMs: number;

  /** Reason if not acquired */
  reason?: 'timeout' | 'deadlock' | 'error';

  /** Error details */
  error?: string;
}

/**
 * Lock manager statistics
 */
export interface LockStats {
  /** Total lock attempts */
  attempts: number;

  /** Successful acquisitions */
  acquired: number;

  /** Lock timeouts */
  timeouts: number;

  /** Deadlocks detected */
  deadlocks: number;

  /** Currently held locks */
  active: number;

  /** Average wait time (ms) */
  avgWaitTimeMs: number;

  /** Max wait time seen (ms) */
  maxWaitTimeMs: number;
}

/**
 * Lock configuration
 */
export interface LockConfig {
  /** Default timeout for locks (ms) */
  defaultTimeoutMs: number;

  /** Maximum allowed timeout (ms) */
  maxTimeoutMs: number;

  /** Enable lock monitoring */
  monitoringEnabled: boolean;

  /** Warn if lock held longer than (ms) */
  holdTimeWarningMs: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default lock configuration */
const DEFAULT_CONFIG: LockConfig = {
  defaultTimeoutMs: 5_000,      // 5 seconds
  maxTimeoutMs: 60_000,         // 1 minute max
  monitoringEnabled: true,
  holdTimeWarningMs: 10_000,    // Warn after 10s
};

/** Domain to numeric namespace (for pg_advisory_lock key generation) */
const DOMAIN_NAMESPACE: Record<LockDomain, number> = {
  battle: 1,
  encounter: 2,
  trainer: 3,
  guild: 4,
  component: 5,
};

// ============================================================================
// LOCK MANAGER
// ============================================================================

/**
 * LockManager — Centralized advisory lock management
 * 
 * Uses PostgreSQL advisory locks with configurable timeouts.
 * 
 * Key features:
 * - **Timeout-based deadlock prevention**: Locks auto-fail after timeout
 * - **Victim selection**: Newest waiter is the victim (FIFO fairness)
 * - **Monitoring**: Track lock contention and hold times
 * - **Audit trail**: Log lock operations with correlation IDs
 * 
 * @example
 * ```ts
 * const lockManager = getLockManager();
 * 
 * // Try to acquire battle lock
 * const result = await lockManager.withLock(prisma, {
 *   domain: 'battle',
 *   resourceId: battleId,
 *   scope: 'transaction',
 *   timeoutMs: 5000,
 * }, async () => {
 *   // Critical section - exclusive access to battle
 *   await resolveTurn(battleId);
 * });
 * 
 * if (!result.acquired) {
 *   throw new Error(`Could not acquire battle lock: ${result.reason}`);
 * }
 * ```
 */
export class LockManager {
  private config: LockConfig;
  private activeLocks = new Map<string, ActiveLock>();
  private stats: LockStats = {
    attempts: 0,
    acquired: 0,
    timeouts: 0,
    deadlocks: 0,
    active: 0,
    avgWaitTimeMs: 0,
    maxWaitTimeMs: 0,
  };
  private totalWaitTimeMs = 0;

  constructor(config: Partial<LockConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    log.info('init', 'Lock manager initialized', this.config);
  }

  // ==========================================================================
  // LOCK KEY GENERATION
  // ==========================================================================

  /**
   * Generate advisory lock key from domain + resourceId
   * 
   * Uses two 32-bit integers combined into 64-bit key:
   * - High 32 bits: domain namespace
   * - Low 32 bits: hash of resourceId
   */
  generateKey(domain: LockDomain, resourceId: string): bigint {
    const namespace = DOMAIN_NAMESPACE[domain];
    
    // Simple string hash for resourceId (FNV-1a inspired)
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < resourceId.length; i++) {
      hash ^= resourceId.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
      hash = hash >>> 0; // Keep as 32-bit unsigned
    }

    // Combine: namespace (high 32) + hash (low 32)
    return BigInt(namespace) << 32n | BigInt(hash >>> 0);
  }

  // ==========================================================================
  // LOCK OPERATIONS
  // ==========================================================================

  /**
   * Try to acquire a lock with timeout
   * 
   * @param prisma - Prisma client (or transaction)
   * @param request - Lock request
   * @returns Lock result
   */
  async acquire(prisma: PrismaClient, request: LockRequest): Promise<LockResult> {
    const startTime = Date.now();
    this.stats.attempts++;

    const key = this.generateKey(request.domain, request.resourceId);
    const timeoutMs = Math.min(request.timeoutMs || this.config.defaultTimeoutMs, this.config.maxTimeoutMs);

    log.debug('acquire', 'Attempting lock', {
      domain: request.domain,
      resourceId: request.resourceId.slice(0, 12),
      key: key.toString().slice(0, 12),
      timeoutMs,
      correlationId: request.correlationId,
    });

    try {
      // Set statement timeout for this operation
      await prisma.$executeRawUnsafe(`SET LOCAL statement_timeout = ${timeoutMs}`);

      // Try to acquire advisory lock
      if (request.scope === 'transaction') {
        // Transaction-scoped: pg_advisory_xact_lock
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${key})`);
      } else {
        // Session-scoped: pg_advisory_lock
        await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${key})`);
      }

      const waitTimeMs = Date.now() - startTime;
      this.recordSuccess(key, request, waitTimeMs);

      return {
        acquired: true,
        key,
        waitTimeMs,
      };

    } catch (error) {
      const waitTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a timeout
      if (errorMessage.includes('statement timeout') || errorMessage.includes('canceling statement')) {
        this.stats.timeouts++;
        log.warn('acquire', 'Lock timeout', {
          domain: request.domain,
          resourceId: request.resourceId.slice(0, 12),
          waitTimeMs,
        });

        return {
          acquired: false,
          waitTimeMs,
          reason: 'timeout',
          error: `Lock acquisition timed out after ${waitTimeMs}ms`,
        };
      }

      // Check for deadlock
      if (errorMessage.includes('deadlock')) {
        this.stats.deadlocks++;
        log.error('acquire', 'Deadlock detected', {
          domain: request.domain,
          resourceId: request.resourceId.slice(0, 12),
        });

        return {
          acquired: false,
          waitTimeMs,
          reason: 'deadlock',
          error: 'Deadlock detected - this transaction was chosen as victim',
        };
      }

      // Other error
      log.error('acquire', 'Lock error', {
        domain: request.domain,
        error: errorMessage,
      });

      return {
        acquired: false,
        waitTimeMs,
        reason: 'error',
        error: errorMessage,
      };
    }
  }

  /**
   * Release a session-scoped lock
   * 
   * Transaction-scoped locks are auto-released on commit/rollback.
   * 
   * @param prisma - Prisma client
   * @param domain - Lock domain
   * @param resourceId - Resource ID
   */
  async release(prisma: PrismaClient, domain: LockDomain, resourceId: string): Promise<void> {
    const key = this.generateKey(domain, resourceId);
    const keyStr = `${domain}:${resourceId}`;

    try {
      await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${key})`);
      
      const lock = this.activeLocks.get(keyStr);
      if (lock) {
        const holdTime = Date.now() - lock.acquiredAt.getTime();
        this.activeLocks.delete(keyStr);
        this.stats.active--;

        if (this.config.monitoringEnabled && holdTime > this.config.holdTimeWarningMs) {
          log.warn('release', 'Lock held too long', {
            domain,
            resourceId: resourceId.slice(0, 12),
            holdTimeMs: holdTime,
          });
        }
      }

      log.debug('release', 'Lock released', { domain, resourceId: resourceId.slice(0, 12) });

    } catch (error) {
      log.error('release', 'Failed to release lock', {
        domain,
        resourceId: resourceId.slice(0, 12),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Execute function with lock held
   * 
   * Acquires lock, executes function, releases lock (if session-scoped).
   * 
   * @param prisma - Prisma client or transaction
   * @param request - Lock request
   * @param fn - Function to execute with lock held
   * @returns Lock result with function result
   */
  async withLock<T>(
    prisma: PrismaClient,
    request: LockRequest,
    fn: () => Promise<T>
  ): Promise<LockResult & { result?: T }> {
    const lockResult = await this.acquire(prisma, request);

    if (!lockResult.acquired) {
      return lockResult;
    }

    try {
      const result = await fn();
      return { ...lockResult, result };

    } finally {
      // Only release session-scoped locks
      // Transaction-scoped are auto-released
      if (request.scope === 'session') {
        await this.release(prisma, request.domain, request.resourceId);
      } else {
        // Mark transaction lock as released (will be auto-released on commit)
        const keyStr = `${request.domain}:${request.resourceId}`;
        this.activeLocks.delete(keyStr);
        this.stats.active--;
      }
    }
  }

  // ==========================================================================
  // MONITORING
  // ==========================================================================

  /**
   * Get active locks
   */
  getActiveLocks(): ActiveLock[] {
    return Array.from(this.activeLocks.values());
  }

  /**
   * Get lock statistics
   */
  getStats(): LockStats {
    return {
      ...this.stats,
      avgWaitTimeMs: this.stats.acquired > 0 
        ? Math.round(this.totalWaitTimeMs / this.stats.acquired)
        : 0,
    };
  }

  /**
   * Check for stale locks (monitoring)
   * 
   * @returns Locks held longer than holdTimeWarningMs
   */
  getStaleLocks(): ActiveLock[] {
    const now = Date.now();
    return this.getActiveLocks().filter(
      lock => now - lock.acquiredAt.getTime() > this.config.holdTimeWarningMs
    );
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private recordSuccess(key: bigint, request: LockRequest, waitTimeMs: number): void {
    const keyStr = `${request.domain}:${request.resourceId}`;

    this.stats.acquired++;
    this.stats.active++;
    this.totalWaitTimeMs += waitTimeMs;
    this.stats.maxWaitTimeMs = Math.max(this.stats.maxWaitTimeMs, waitTimeMs);

    this.activeLocks.set(keyStr, {
      key,
      domain: request.domain,
      resourceId: request.resourceId,
      scope: request.scope,
      acquiredAt: new Date(),
      reason: request.reason,
      correlationId: request.correlationId,
      timeoutMs: request.timeoutMs,
    });

    log.debug('acquire', 'Lock acquired', {
      domain: request.domain,
      resourceId: request.resourceId.slice(0, 12),
      waitTimeMs,
    });
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats(): void {
    this.stats = {
      attempts: 0,
      acquired: 0,
      timeouts: 0,
      deadlocks: 0,
      active: this.activeLocks.size,
      avgWaitTimeMs: 0,
      maxWaitTimeMs: 0,
    };
    this.totalWaitTimeMs = 0;
  }

  /**
   * Clear all tracking (for testing)
   */
  clear(): void {
    this.activeLocks.clear();
    this.resetStats();
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/** Default lock manager instance */
let lockManagerInstance: LockManager | null = null;

/**
 * Get the singleton lock manager
 */
export function getLockManager(config?: Partial<LockConfig>): LockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new LockManager(config);
  }
  return lockManagerInstance;
}

/**
 * Shutdown lock manager
 */
export function shutdownLockManager(): void {
  if (lockManagerInstance) {
    lockManagerInstance.clear();
    lockManagerInstance = null;
    log.info('shutdown', 'Lock manager shutdown');
  }
}
