/**
 * Query Result Cache — Intelligent caching layer for database queries
 * 
 * P2-002: Query Result Caching (Database-Centric Development Plan Sprint 3)
 * 
 * Features:
 * - Tag-based cache invalidation
 * - TTL-based expiration
 * - LRU eviction when at capacity
 * - Cache warmup support
 * - Prometheus metrics integration
 * 
 * Design Principles:
 * - Cache only read queries (never writes)
 * - Short TTL for frequently changing data (30s-2min)
 * - Longer TTL for reference data (5min-1hr)
 * - Invalidate by tags when writes occur
 * 
 * @module services/query-cache
 */

import { Counter, Gauge, Histogram, register } from 'prom-client';
import { log } from "../shared/logger.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  data: T;
  createdAt: number;
  expiresAt: number;
  tags: string[];
  accessCount: number;
  lastAccessedAt: number;
  sizeBytes: number;
}

/**
 * Cache key generation options
 */
export interface CacheKeyOptions {
  /** Operation name (e.g., 'findTrainerByDiscordId') */
  operation: string;
  /** Operation arguments that affect the result */
  args: Record<string, unknown>;
  /** Include user context in key (for RLS-aware caching) */
  userId?: string;
}

/**
 * Cache configuration
 */
export interface QueryCacheConfig {
  /** Maximum entries in cache */
  maxEntries: number;
  /** Maximum memory usage in bytes */
  maxSizeBytes: number;
  /** Default TTL in milliseconds */
  defaultTtlMs: number;
  /** Enable cache statistics logging */
  enableLogging: boolean;
  /** Stats log interval in ms */
  statsLogIntervalMs: number;
}

/**
 * Cache warmup configuration
 */
export interface WarmupConfig {
  /** Warmup function that returns data to cache */
  loader: () => Promise<unknown>;
  /** Cache key for the warmed data */
  key: string;
  /** Tags for invalidation */
  tags: string[];
  /** TTL for warmed data */
  ttlMs?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  entries: number;
  sizeBytes: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
  invalidations: number;
  warmups: number;
}

const DEFAULT_CONFIG: QueryCacheConfig = {
  maxEntries: 1000,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  defaultTtlMs: 60_000, // 1 minute
  enableLogging: true,
  statsLogIntervalMs: 60_000, // Log stats every minute
};

// ============================================================================
// Prometheus Metrics
// ============================================================================

const PREFIX = 'infinity_gauntlet_query_cache_';

const cacheHitsCounter = new Counter({
  name: `${PREFIX}hits_total`,
  help: 'Total cache hits',
  labelNames: ['operation'],
  registers: [register],
});

const cacheMissesCounter = new Counter({
  name: `${PREFIX}misses_total`,
  help: 'Total cache misses',
  labelNames: ['operation'],
  registers: [register],
});

const cacheEvictionsCounter = new Counter({
  name: `${PREFIX}evictions_total`,
  help: 'Total cache evictions',
  labelNames: ['reason'],
  registers: [register],
});

const cacheInvalidationsCounter = new Counter({
  name: `${PREFIX}invalidations_total`,
  help: 'Total cache invalidations',
  labelNames: ['tag'],
  registers: [register],
});

const cacheEntriesGauge = new Gauge({
  name: `${PREFIX}entries`,
  help: 'Current number of cache entries',
  registers: [register],
});

const cacheSizeBytesGauge = new Gauge({
  name: `${PREFIX}size_bytes`,
  help: 'Current cache size in bytes',
  registers: [register],
});

const cacheHitRateGauge = new Gauge({
  name: `${PREFIX}hit_rate`,
  help: 'Cache hit rate (0-1)',
  registers: [register],
});

const cacheLookupDuration = new Histogram({
  name: `${PREFIX}lookup_duration_ms`,
  help: 'Cache lookup duration in milliseconds',
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

// ============================================================================
// Query Cache Class
// ============================================================================

export class QueryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private tagIndex: Map<string, Set<string>> = new Map(); // tag -> keys
  private config: QueryCacheConfig;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
    warmups: 0,
  };
  private totalSizeBytes = 0;
  private statsLogInterval: NodeJS.Timeout | null = null;
  private static instance: QueryCache | null = null;

  private constructor(config: Partial<QueryCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (this.config.enableLogging) {
      this.startStatsLogging();
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<QueryCacheConfig>): QueryCache {
    if (!QueryCache.instance) {
      QueryCache.instance = new QueryCache(config);
    }
    return QueryCache.instance;
  }

  /**
   * Generate cache key from options
   */
  generateKey(options: CacheKeyOptions): string {
    const sortedArgs = Object.keys(options.args)
      .sort()
      .reduce((acc, key) => {
        acc[key] = options.args[key];
        return acc;
      }, {} as Record<string, unknown>);

    const keyParts = [
      options.operation,
      JSON.stringify(sortedArgs),
    ];

    if (options.userId) {
      keyParts.push(`user:${options.userId}`);
    }

    return keyParts.join(':');
  }

  /**
   * Get cached value
   */
  get<T>(key: string): T | undefined {
    const startTime = performance.now();
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      cacheMissesCounter.inc({ operation: this.extractOperation(key) });
      cacheLookupDuration.observe(performance.now() - startTime);
      return undefined;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.delete(key);
      this.stats.misses++;
      cacheMissesCounter.inc({ operation: this.extractOperation(key) });
      cacheEvictionsCounter.inc({ reason: 'expired' });
      cacheLookupDuration.observe(performance.now() - startTime);
      return undefined;
    }

    // Update access metadata
    entry.accessCount++;
    entry.lastAccessedAt = Date.now();

    this.stats.hits++;
    cacheHitsCounter.inc({ operation: this.extractOperation(key) });
    cacheLookupDuration.observe(performance.now() - startTime);
    this.updateHitRate();

    return entry.data as T;
  }

  /**
   * Set cached value
   */
  set<T>(
    key: string,
    data: T,
    options: {
      ttlMs?: number;
      tags?: string[];
    } = {}
  ): void {
    const ttlMs = options.ttlMs ?? this.config.defaultTtlMs;
    const tags = options.tags ?? [];
    const now = Date.now();

    // Calculate size (rough estimate)
    const sizeBytes = this.estimateSize(data);

    // Check if we need to evict
    this.ensureCapacity(sizeBytes);

    // Create entry
    const entry: CacheEntry<T> = {
      data,
      createdAt: now,
      expiresAt: now + ttlMs,
      tags,
      accessCount: 0,
      lastAccessedAt: now,
      sizeBytes,
    };

    // If key exists, adjust size tracking
    const existing = this.cache.get(key);
    if (existing) {
      this.totalSizeBytes -= existing.sizeBytes;
      // Remove from old tag indexes
      for (const tag of existing.tags) {
        this.tagIndex.get(tag)?.delete(key);
      }
    }

    // Store entry
    this.cache.set(key, entry);
    this.totalSizeBytes += sizeBytes;

    // Update tag index
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }

    // Update metrics
    cacheEntriesGauge.set(this.cache.size);
    cacheSizeBytesGauge.set(this.totalSizeBytes);
  }

  /**
   * Delete cached value
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Remove from tag indexes
    for (const tag of entry.tags) {
      this.tagIndex.get(tag)?.delete(key);
    }

    this.totalSizeBytes -= entry.sizeBytes;
    this.cache.delete(key);

    // Update metrics
    cacheEntriesGauge.set(this.cache.size);
    cacheSizeBytesGauge.set(this.totalSizeBytes);

    return true;
  }

  /**
   * Invalidate all entries with given tag
   */
  invalidateByTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys || keys.size === 0) return 0;

    let count = 0;
    for (const key of keys) {
      if (this.delete(key)) {
        count++;
      }
    }

    this.tagIndex.delete(tag);
    this.stats.invalidations += count;
    cacheInvalidationsCounter.inc({ tag }, count);

    if (this.config.enableLogging) {
      log.info('Cache invalidated by tag', { tag, entriesRemoved: count });
    }

    return count;
  }

  /**
   * Invalidate all entries matching a tag pattern
   */
  invalidateByPattern(pattern: RegExp): number {
    let count = 0;
    const tagsToInvalidate: string[] = [];

    for (const tag of this.tagIndex.keys()) {
      if (pattern.test(tag)) {
        tagsToInvalidate.push(tag);
      }
    }

    for (const tag of tagsToInvalidate) {
      count += this.invalidateByTag(tag);
    }

    return count;
  }

  /**
   * Warm up cache with pre-loaded data
   */
  async warmup(configs: WarmupConfig[]): Promise<number> {
    let warmedCount = 0;

    for (const config of configs) {
      try {
        const data = await config.loader();
        this.set(config.key, data, {
          ttlMs: config.ttlMs,
          tags: config.tags,
        });
        warmedCount++;
        this.stats.warmups++;
        // Debug logging controlled by config.enableLogging
      } catch (error) {
        log.warn('Cache warmup failed', { key: config.key, error: String(error) });
      }
    }

    log.info('Cache warmup complete', { warmed: warmedCount, total: configs.length });
    return warmedCount;
  }

  /**
   * Get or fetch pattern — returns cached value or fetches and caches
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: {
      ttlMs?: number;
      tags?: string[];
    } = {}
  ): Promise<T> {
    // Try cache first
    const cached = this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch and cache
    const data = await fetcher();
    this.set(key, data, options);
    return data;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    const count = this.cache.size;
    this.cache.clear();
    this.tagIndex.clear();
    this.totalSizeBytes = 0;

    cacheEntriesGauge.set(0);
    cacheSizeBytesGauge.set(0);

    log.info('Cache cleared', { entriesRemoved: count });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      entries: this.cache.size,
      sizeBytes: this.totalSizeBytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      evictions: this.stats.evictions,
      invalidations: this.stats.invalidations,
      warmups: this.stats.warmups,
    };
  }

  /**
   * Shutdown cache (clear intervals, etc.)
   */
  shutdown(): void {
    if (this.statsLogInterval) {
      clearInterval(this.statsLogInterval);
      this.statsLogInterval = null;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Ensure we have capacity for new entry
   */
  private ensureCapacity(newEntrySize: number): void {
    // Check entry count limit
    while (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    // Check size limit
    while (this.totalSizeBytes + newEntrySize > this.config.maxSizeBytes && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldestAccess) {
        oldestAccess = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.stats.evictions++;
      cacheEvictionsCounter.inc({ reason: 'lru' });
    }
  }

  /**
   * Estimate memory size of data
   */
  private estimateSize(data: unknown): number {
    try {
      const json = JSON.stringify(data);
      // Rough estimate: 2 bytes per character + overhead
      return json.length * 2 + 100;
    } catch {
      // If not serializable, estimate based on type
      return 1000;
    }
  }

  /**
   * Extract operation name from cache key
   */
  private extractOperation(key: string): string {
    return key.split(':')[0] ?? 'unknown';
  }

  /**
   * Update hit rate gauge
   */
  private updateHitRate(): void {
    const stats = this.getStats();
    cacheHitRateGauge.set(stats.hitRate);
  }

  /**
   * Start periodic stats logging
   */
  private startStatsLogging(): void {
    this.statsLogInterval = setInterval(() => {
      const stats = this.getStats();
      if (stats.entries > 0 || stats.hits > 0 || stats.misses > 0) {
        log.info('Query cache stats', {
          entries: stats.entries,
          sizeMB: (stats.sizeBytes / 1024 / 1024).toFixed(2),
          hitRate: (stats.hitRate * 100).toFixed(1) + '%',
          hits: stats.hits,
          misses: stats.misses,
        });
      }
    }, this.config.statsLogIntervalMs);
  }
}

// ============================================================================
// Pre-defined Tag Constants
// ============================================================================

/**
 * Standard cache tags for consistent invalidation
 */
export const CacheTags = {
  // Entity types
  TRAINER: (id: string) => `trainer:${id}`,
  TRAINER_ALL: 'trainers',
  POKEMON: (id: string) => `pokemon:${id}`,
  POKEMON_BY_OWNER: (ownerId: string) => `pokemon:owner:${ownerId}`,
  POKEMON_ALL: 'pokemon',
  BATTLE: (id: string) => `battle:${id}`,
  BATTLE_ACTIVE: 'battles:active',
  ENCOUNTER: (id: string) => `encounter:${id}`,
  ENCOUNTER_ACTIVE: 'encounters:active',

  // Reference data
  SPECIES: 'species',
  MOVES: 'moves',
  ITEMS: 'items',

  // Aggregates
  STATS: (type: string) => `stats:${type}`,
  LEADERBOARD: (type: string) => `leaderboard:${type}`,
} as const;

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get singleton cache instance
 */
export function getQueryCache(config?: Partial<QueryCacheConfig>): QueryCache {
  return QueryCache.getInstance(config);
}

/**
 * Invalidate cache by tag (convenience function)
 */
export function invalidateCache(tag: string): number {
  return getQueryCache().invalidateByTag(tag);
}

/**
 * Get or fetch with caching (convenience function)
 */
export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlMs?: number; tags?: string[] }
): Promise<T> {
  return getQueryCache().getOrFetch(key, fetcher, options);
}

// ============================================================================
// Export
// ============================================================================

export default {
  QueryCache,
  CacheTags,
  getQueryCache,
  invalidateCache,
  cachedQuery,
};

