/**
 * SensaiOS GameServer Rate Limiter — Sliding Window Rate Limiting
 * 
 * This module provides a sliding window rate limiter for the GameServerAPI.
 * It prevents abuse while allowing burst traffic within defined limits.
 * 
 * ## Algorithm
 * 
 * Uses a sliding window with sub-windows (buckets) for smooth rate limiting:
 * 
 * 1. Time is divided into fixed windows (e.g., 60 seconds)
 * 2. Each window is subdivided into buckets (e.g., 6 x 10-second buckets)
 * 3. When checking a request, we sum counts from all buckets in the sliding window
 * 4. Old buckets are pruned on access to prevent memory growth
 * 
 * This approach is more accurate than fixed windows and prevents the "boundary
 * burst" problem where users can make 2x requests at window boundaries.
 * 
 * @module sensaios/gameserver/rate-limiter
 * @since 2026-01-03
 */

import type { RateLimitConfig, RateLimitKeyType } from './types.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Number of buckets per window (more = smoother limiting, more memory)
 */
const BUCKETS_PER_WINDOW = 6;

/**
 * How often to prune old entries (in milliseconds)
 */
const PRUNE_INTERVAL_MS = 60_000;

/**
 * Maximum entries before forcing a prune (memory safety)
 */
const MAX_ENTRIES_BEFORE_FORCE_PRUNE = 10_000;

// ============================================================================
// TYPES
// ============================================================================

/**
 * A single bucket in the sliding window
 */
interface Bucket {
  /** Start time of this bucket */
  timestamp: number;
  
  /** Number of requests in this bucket */
  count: number;
}

/**
 * Entry for a rate limit key
 */
interface RateLimitEntry {
  /** Buckets for this key */
  buckets: Bucket[];
  
  /** When this entry was last accessed */
  lastAccess: number;
}

// ============================================================================
// SLIDING WINDOW RATE LIMITER
// ============================================================================

/**
 * Sliding window rate limiter with memory-bounded storage
 * 
 * Features:
 * - Smooth rate limiting across window boundaries
 * - Automatic pruning of old entries
 * - Memory-bounded storage
 * - Per-key rate limiting
 * 
 * @example
 * ```ts
 * const limiter = new SlidingWindowRateLimiter();
 * 
 * // Check if request is allowed
 * const isAllowed = limiter.checkLimit('user:123:battles.create', {
 *   maxRequests: 1,
 *   windowMs: 60_000,
 *   keyType: 'user',
 * });
 * 
 * if (!isAllowed) {
 *   const retryAfterMs = limiter.getRetryAfter('user:123:battles.create', config);
 *   throw new RateLimitError('Rate limit exceeded', retryAfterMs, config);
 * }
 * ```
 */
export class SlidingWindowRateLimiter {
  /**
   * Storage for rate limit entries
   * Key format: `{appId}:{method}:{rateLimitKey}`
   */
  private readonly entries: Map<string, RateLimitEntry> = new Map();
  
  /**
   * Last prune timestamp
   */
  private lastPruneTime: number = Date.now();
  
  /**
   * Check if a request is allowed under the rate limit
   * 
   * If allowed, the request is counted. If not allowed, the request is NOT counted.
   * 
   * @param key - Composite key for rate limiting (e.g., "app:method:userId")
   * @param config - Rate limit configuration
   * @returns true if request is allowed, false if rate limited
   */
  checkLimit(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    
    // Maybe prune old entries
    this.maybePrune(now);
    
    // Get or create entry
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { buckets: [], lastAccess: now };
      this.entries.set(key, entry);
    }
    
    // Update last access time
    entry.lastAccess = now;
    
    // Calculate bucket size
    const bucketSizeMs = Math.floor(config.windowMs / BUCKETS_PER_WINDOW);
    
    // Prune old buckets from this entry
    const windowStart = now - config.windowMs;
    entry.buckets = entry.buckets.filter(b => b.timestamp >= windowStart);
    
    // Count requests in current window
    const currentCount = entry.buckets.reduce((sum, b) => sum + b.count, 0);
    
    // Check if under limit
    if (currentCount >= config.maxRequests) {
      return false;
    }
    
    // Find or create current bucket
    const currentBucketStart = Math.floor(now / bucketSizeMs) * bucketSizeMs;
    let currentBucket = entry.buckets.find(b => b.timestamp === currentBucketStart);
    
    if (!currentBucket) {
      currentBucket = { timestamp: currentBucketStart, count: 0 };
      entry.buckets.push(currentBucket);
    }
    
    // Increment count
    currentBucket.count++;
    
    return true;
  }
  
  /**
   * Get the count of requests in the current window
   * 
   * @param key - Composite key for rate limiting
   * @param config - Rate limit configuration
   * @returns Number of requests in the current window
   */
  getCount(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const entry = this.entries.get(key);
    
    if (!entry) {
      return 0;
    }
    
    // Count requests in current window
    const windowStart = now - config.windowMs;
    return entry.buckets
      .filter(b => b.timestamp >= windowStart)
      .reduce((sum, b) => sum + b.count, 0);
  }
  
  /**
   * Get remaining requests in the current window
   * 
   * @param key - Composite key for rate limiting
   * @param config - Rate limit configuration
   * @returns Number of remaining requests allowed
   */
  getRemaining(key: string, config: RateLimitConfig): number {
    const count = this.getCount(key, config);
    return Math.max(0, config.maxRequests - count);
  }
  
  /**
   * Get milliseconds until rate limit resets (can make another request)
   * 
   * @param key - Composite key for rate limiting
   * @param config - Rate limit configuration
   * @returns Milliseconds until a request can be made, 0 if not rate limited
   */
  getRetryAfter(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const entry = this.entries.get(key);
    
    if (!entry || entry.buckets.length === 0) {
      return 0;
    }
    
    // Find the oldest bucket in the window
    const windowStart = now - config.windowMs;
    const bucketsInWindow = entry.buckets.filter(b => b.timestamp >= windowStart);
    
    if (bucketsInWindow.length === 0) {
      return 0;
    }
    
    // Count requests in current window
    const currentCount = bucketsInWindow.reduce((sum, b) => sum + b.count, 0);
    
    if (currentCount < config.maxRequests) {
      return 0;
    }
    
    // Find when the oldest bucket will expire
    const oldestBucket = bucketsInWindow.reduce(
      (oldest, b) => (b.timestamp < oldest.timestamp ? b : oldest),
      bucketsInWindow[0],
    );
    
    const expiresAt = oldestBucket.timestamp + config.windowMs;
    return Math.max(0, expiresAt - now);
  }
  
  /**
   * Reset the rate limit for a specific key
   * 
   * Use this for testing or manual override scenarios.
   * 
   * @param key - Composite key to reset
   */
  reset(key: string): void {
    this.entries.delete(key);
  }
  
  /**
   * Clear all rate limit entries
   * 
   * Use this for testing or shutdown scenarios.
   */
  clear(): void {
    this.entries.clear();
    this.lastPruneTime = Date.now();
  }
  
  /**
   * Get statistics about the rate limiter
   * 
   * @returns Object with entry count and memory estimate
   */
  getStats(): RateLimiterStats {
    let totalBuckets = 0;
    let oldestAccess = Date.now();
    let newestAccess = 0;
    
    for (const entry of this.entries.values()) {
      totalBuckets += entry.buckets.length;
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
      }
      if (entry.lastAccess > newestAccess) {
        newestAccess = entry.lastAccess;
      }
    }
    
    // Rough memory estimate:
    // - Each entry: ~100 bytes base + key length + buckets
    // - Each bucket: ~24 bytes
    const estimatedMemoryBytes = 
      this.entries.size * 100 + 
      totalBuckets * 24;
    
    return {
      entryCount: this.entries.size,
      totalBuckets,
      estimatedMemoryBytes,
      oldestAccessMs: this.entries.size > 0 ? Date.now() - oldestAccess : 0,
      newestAccessMs: this.entries.size > 0 ? Date.now() - newestAccess : 0,
      lastPruneMs: Date.now() - this.lastPruneTime,
    };
  }
  
  /**
   * Prune old entries if needed
   * 
   * @param now - Current timestamp
   */
  private maybePrune(now: number): void {
    // Check if we need to prune
    const shouldPrune = 
      now - this.lastPruneTime > PRUNE_INTERVAL_MS ||
      this.entries.size > MAX_ENTRIES_BEFORE_FORCE_PRUNE;
    
    if (!shouldPrune) {
      return;
    }
    
    this.prune(now);
  }
  
  /**
   * Prune old entries
   * 
   * @param now - Current timestamp
   */
  private prune(now: number): void {
    // Remove entries that haven't been accessed in 5 minutes
    const staleThreshold = now - 5 * 60_000;
    
    for (const [key, entry] of this.entries.entries()) {
      // Remove stale entries
      if (entry.lastAccess < staleThreshold) {
        this.entries.delete(key);
        continue;
      }
      
      // Remove entries with no buckets
      if (entry.buckets.length === 0) {
        this.entries.delete(key);
      }
    }
    
    this.lastPruneTime = now;
  }
}

// ============================================================================
// STATS TYPE
// ============================================================================

/**
 * Statistics about the rate limiter
 */
export interface RateLimiterStats {
  /** Number of rate limit entries (unique keys) */
  entryCount: number;
  
  /** Total number of buckets across all entries */
  totalBuckets: number;
  
  /** Estimated memory usage in bytes */
  estimatedMemoryBytes: number;
  
  /** Milliseconds since oldest entry was accessed */
  oldestAccessMs: number;
  
  /** Milliseconds since newest entry was accessed */
  newestAccessMs: number;
  
  /** Milliseconds since last prune */
  lastPruneMs: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a rate limit key based on key type
 * 
 * @param keyType - Type of rate limit key
 * @param userId - User ID (for 'user' type)
 * @param channelId - Channel ID (for 'channel' type)
 * @param guildId - Guild ID (for 'guild' type)
 * @returns Generated key string
 */
export function generateRateLimitKey(
  keyType: RateLimitKeyType,
  userId?: string,
  channelId?: string,
  guildId?: string,
): string {
  switch (keyType) {
    case 'user':
      if (!userId) throw new Error('userId required for user rate limit key');
      return `user:${userId}`;
    case 'channel':
      if (!channelId) throw new Error('channelId required for channel rate limit key');
      return `channel:${channelId}`;
    case 'guild':
      if (!guildId) throw new Error('guildId required for guild rate limit key');
      return `guild:${guildId}`;
    case 'global':
      return 'global';
    default:
      throw new Error(`Unknown rate limit key type: ${keyType}`);
  }
}

/**
 * Create a composite rate limit key for the API
 * 
 * @param appId - Application ID
 * @param method - API method name (e.g., "battles.create")
 * @param rateLimitKey - Rate limit key (from generateRateLimitKey)
 * @returns Composite key for rate limiting
 */
export function createCompositeKey(
  appId: string,
  method: string,
  rateLimitKey: string,
): string {
  return `${appId}:${method}:${rateLimitKey}`;
}
