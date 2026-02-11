/**
 * Cache Service - Database-Backed Caching
 * @module services/cache
 *
 * Provides persistent caching utilities for the security role-healing bot.
 * 
 * MIGRATION (2025-12-27): Moved from /Store/discord-cache to PostgreSQL
 * Reference: docs/projects/STORE-WRITE-ELIMINATION.md
 * 
 * Features:
 *   - Database-backed persistence via cache_entries table
 *   - Automatic TTL-based cleanup
 *   - Memory-efficient with LRU eviction
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../shared/logging/index.js';
const logger = getLogger();

import { getErrorMessage } from '../shared/utils/index.js';
import { CACHE_CONSTANTS } from '../shared/constants.js';
import { prisma } from '../shared/prisma.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DiskStats {
  free: number;
  total: number;
}

interface _CacheEntry {
  key: string;
  mtime: number;
  size: number;
}

interface CacheSnapshot {
  timestamp: number;
  sizeBytes: number;
  entryCount: number;
  oldestEntryMs: number | null;
  newestEntryMs: number | null;
}

interface CacheBudget {
  approxBytes: number;
  maxAllowedBytes: number;
  percent: number;
  diskFreeBytes: number;
  diskTotalBytes: number;
  workspaceLimitBytes: number;
}

interface LogMeta {
  key?: string;
  namespace?: string;
  error?: unknown;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const { MAX_CACHE_PERCENT, MAX_CACHE_FILE_AGE_MS, MAX_WORKSPACE_BYTES } = CACHE_CONSTANTS;

// Namespace for security bot cache entries
const CACHE_NAMESPACE = 'discord-cache';

// In-memory LRU cache for hot data
const memoryCache = new Map<string, { value: unknown; expiresAt: number }>();
const MAX_MEMORY_ENTRIES = 1000;

// Default TTL: 24 hours (in ms)
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

// Legacy constant for backward compatibility
const CACHE_DIR = 'postgresql://cache_entries';

// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Log cache-related issues with consistent formatting.
 */
function logCacheIssue(
  level: 'warn' | 'error',
  tag: string,
  err: unknown,
  meta: LogMeta = {}
): void {
  const contextParts = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`);
  const message = getErrorMessage(err);
  const prefix = contextParts.length ? `${contextParts.join(' ')} ` : '';
  const fullMessage = `[CACHE ${tag}] ${prefix}${message}`;

  if (level === 'warn') {
    logger.warn('cache', tag, fullMessage, { metadata: { error: err, ...meta } });
  } else {
    logger.error('cache', tag, fullMessage, { metadata: { error: err, ...meta } });
  }
}

/**
 * Generate cache key with namespace.
 */
function getFullKey(key: string): string {
  const safe = key.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  return `${CACHE_NAMESPACE}:${safe}`;
}

/**
 * Evict oldest entries from memory cache if over limit.
 */
function evictMemoryCache(): void {
  if (memoryCache.size <= MAX_MEMORY_ENTRIES) return;
  
  // Remove expired entries first
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
    }
  }
  
  // If still over limit, remove oldest entries
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    if (firstKey) memoryCache.delete(firstKey);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read a value from the cache (sync wrapper).
 * Checks memory cache first, falls back to database.
 */
function readCache<T = unknown>(key: string): T | null {
  const fullKey = getFullKey(key);
  
  // Check memory cache first
  const memEntry = memoryCache.get(fullKey);
  if (memEntry && memEntry.expiresAt > Date.now()) {
    return memEntry.value as T;
  }
  
  // Memory miss - return null synchronously, trigger async DB read
  // This maintains backward compatibility with sync API
  void readCacheAsync<T>(key).then(value => {
    if (value !== null) {
      memoryCache.set(fullKey, { value, expiresAt: Date.now() + DEFAULT_TTL_MS });
      evictMemoryCache();
    }
  }).catch(() => {
    // Ignore - sync read returns null
  });
  
  return null;
}

/**
 * Read a value from the cache (async).
 */
async function readCacheAsync<T = unknown>(key: string): Promise<T | null> {
  const fullKey = getFullKey(key);
  
  // Check memory cache first
  const memEntry = memoryCache.get(fullKey);
  if (memEntry && memEntry.expiresAt > Date.now()) {
    return memEntry.value as T;
  }
  
  try {
    const entry = await prisma.cacheEntry.findUnique({
      where: { key: fullKey },
    });
    
    if (!entry) return null;
    
    // Check if expired
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      // Delete expired entry in background
      void prisma.cacheEntry.delete({ where: { key: fullKey } }).catch(() => {});
      return null;
    }
    
    const value = entry.value as T;
    
    // Populate memory cache
    memoryCache.set(fullKey, { 
      value, 
      expiresAt: entry.expiresAt?.getTime() ?? Date.now() + DEFAULT_TTL_MS 
    });
    evictMemoryCache();
    
    return value;
  } catch (err) {
    logCacheIssue('error', 'READ', err, { key });
    return null;
  }
}

/**
 * Write a value to the cache (sync wrapper - fires async write).
 */
function writeCache(key: string, data: unknown): void {
  const fullKey = getFullKey(key);
  const expiresAt = Date.now() + DEFAULT_TTL_MS;
  
  // Write to memory immediately
  memoryCache.set(fullKey, { value: data, expiresAt });
  evictMemoryCache();
  
  // Fire async database write
  void writeCacheAsync(key, data).catch(err => {
    logCacheIssue('error', 'WRITE', err, { key });
  });
}

/**
 * Write a value to the cache (async).
 */
async function writeCacheAsync(key: string, data: unknown, ttlMs: number = DEFAULT_TTL_MS): Promise<void> {
  const fullKey = getFullKey(key);
  const expiresAt = new Date(Date.now() + ttlMs);
  
  try {
    const dataStr = JSON.stringify(data);
    const sizeBytes = Buffer.byteLength(dataStr, 'utf8');
    // Cast to object for Prisma Json field compatibility
    const jsonValue = JSON.parse(dataStr) as object;
    
    await prisma.cacheEntry.upsert({
      where: { key: fullKey },
      update: {
        value: jsonValue,
        expiresAt,
        sizeBytes,
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
      create: {
        key: fullKey,
        namespace: CACHE_NAMESPACE,
        value: jsonValue,
        expiresAt,
        sizeBytes,
        accessCount: 1,
        lastAccessedAt: new Date(),
      },
    });
    
    // Update memory cache
    memoryCache.set(fullKey, { value: data, expiresAt: expiresAt.getTime() });
    evictMemoryCache();
    
    // Trigger pruning in background
    void pruneCache();
  } catch (err) {
    logCacheIssue('error', 'WRITE', err, { key });
  }
}

/**
 * Get the total size of the cache in bytes.
 */
function getCacheSize(): number {
  // Return cached estimate, trigger async update
  void getCacheSizeAsync().catch(() => {});
  
  // Return in-memory estimate
  let size = 0;
  for (const [, entry] of memoryCache.entries()) {
    size += JSON.stringify(entry.value).length;
  }
  return size;
}

/**
 * Get the total size of the cache in bytes (async).
 */
async function getCacheSizeAsync(): Promise<number> {
  try {
    const result = await prisma.cacheEntry.aggregate({
      where: { namespace: CACHE_NAMESPACE },
      _sum: { sizeBytes: true },
    });
    return result._sum.sizeBytes ?? 0;
  } catch (err) {
    logCacheIssue('warn', 'SIZE', err, { namespace: CACHE_NAMESPACE });
    return 0;
  }
}

/**
 * Get a snapshot of the cache state.
 */
function getCacheSnapshot(): CacheSnapshot {
  const now = Date.now();
  const snapshot: CacheSnapshot = {
    timestamp: now,
    sizeBytes: 0,
    entryCount: memoryCache.size,
    oldestEntryMs: null,
    newestEntryMs: null,
  };

  // Calculate from memory cache
  for (const [, entry] of memoryCache.entries()) {
    snapshot.sizeBytes += JSON.stringify(entry.value).length;
  }

  // Trigger async database snapshot in background
  void getCacheSnapshotAsync().then(dbSnapshot => {
    // Log if significant difference
    if (Math.abs(dbSnapshot.entryCount - snapshot.entryCount) > 10) {
      logger.debug('cache', 'snapshot-drift', 'Memory and DB cache counts differ', {
        metadata: { memory: snapshot.entryCount, database: dbSnapshot.entryCount },
      });
    }
  }).catch(() => {});

  return snapshot;
}

/**
 * Get a snapshot of the cache state (async - from database).
 */
async function getCacheSnapshotAsync(): Promise<CacheSnapshot> {
  const now = Date.now();
  
  try {
    const [aggregate, oldest, newest] = await Promise.all([
      prisma.cacheEntry.aggregate({
        where: { namespace: CACHE_NAMESPACE },
        _sum: { sizeBytes: true },
        _count: true,
      }),
      prisma.cacheEntry.findFirst({
        where: { namespace: CACHE_NAMESPACE },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.cacheEntry.findFirst({
        where: { namespace: CACHE_NAMESPACE },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    
    return {
      timestamp: now,
      sizeBytes: aggregate._sum.sizeBytes ?? 0,
      entryCount: aggregate._count,
      oldestEntryMs: oldest?.createdAt.getTime() ?? null,
      newestEntryMs: newest?.createdAt.getTime() ?? null,
    };
  } catch (err) {
    logCacheIssue('warn', 'SNAPSHOT', err, { namespace: CACHE_NAMESPACE });
    return {
      timestamp: now,
      sizeBytes: 0,
      entryCount: 0,
      oldestEntryMs: null,
      newestEntryMs: null,
    };
  }
}

/**
 * Get the cache budget and disk statistics.
 * Note: With database backing, disk stats are less relevant.
 */
function getCacheBudget(): CacheBudget {
  // Database doesn't have traditional disk limits, but we maintain API compatibility
  const maxAllowedBytes = Math.floor(MAX_WORKSPACE_BYTES * MAX_CACHE_PERCENT);
  return {
    approxBytes: maxAllowedBytes,
    maxAllowedBytes,
    percent: MAX_CACHE_PERCENT,
    diskFreeBytes: maxAllowedBytes, // No disk concept with DB
    diskTotalBytes: MAX_WORKSPACE_BYTES,
    workspaceLimitBytes: MAX_WORKSPACE_BYTES,
  };
}

/**
 * Prune cache entries to stay within budget (async).
 */
async function pruneCache(): Promise<void> {
  try {
    const budget = getCacheBudget();
    const currentSize = await getCacheSizeAsync();
    
    if (currentSize <= budget.maxAllowedBytes) {
      return;
    }
    
    // Delete oldest entries until within budget
    const entriesToDelete = await prisma.cacheEntry.findMany({
      where: { namespace: CACHE_NAMESPACE },
      orderBy: { lastAccessedAt: 'asc' },
      take: 100, // Delete in batches
      select: { key: true },
    });
    
    if (entriesToDelete.length > 0) {
      const keys = entriesToDelete.map(e => e.key);
      await prisma.cacheEntry.deleteMany({
        where: { key: { in: keys } },
      });
      
      // Also remove from memory cache
      for (const key of keys) {
        memoryCache.delete(key);
      }
      
      logger.info('cache', 'prune', `Pruned ${keys.length} cache entries`, {
        metadata: { count: keys.length, currentSize, maxAllowed: budget.maxAllowedBytes },
      });
    }
  } catch (err) {
    logCacheIssue('warn', 'PRUNE', err, { namespace: CACHE_NAMESPACE });
  }
}

/**
 * Clean cache entries older than MAX_CACHE_FILE_AGE_MS.
 */
async function cleanOldCache(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MAX_CACHE_FILE_AGE_MS);
    
    // Delete expired entries
    const expiredResult = await prisma.cacheEntry.deleteMany({
      where: {
        namespace: CACHE_NAMESPACE,
        OR: [
          { expiresAt: { lt: new Date() } },
          { lastAccessedAt: { lt: cutoff } },
        ],
      },
    });
    
    // Clear memory cache entries too
    const now = Date.now();
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.expiresAt < now) {
        memoryCache.delete(key);
      }
    }
    
    if (expiredResult.count > 0) {
      logger.info('cache', 'cleanup', `Cleaned ${expiredResult.count} old cache entries`, {
        metadata: { count: expiredResult.count },
      });
    }
  } catch (err) {
    logCacheIssue('warn', 'CLEAN', err, { namespace: CACHE_NAMESPACE });
  }
}

// Sync wrapper for backward compatibility
function cleanOldCacheSync(): void {
  void cleanOldCache().catch(() => {});
}

// Sync wrapper for backward compatibility
function pruneCacheSync(): void {
  void pruneCache().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
  CACHE_DIR,
  readCache,
  readCacheAsync,
  writeCache,
  writeCacheAsync,
  pruneCacheSync as pruneCache,
  cleanOldCacheSync as cleanOldCache,
  getCacheSize,
  getCacheSizeAsync,
  getCacheSnapshot,
  getCacheSnapshotAsync,
  MAX_CACHE_PERCENT,
  MAX_CACHE_FILE_AGE_MS,
  getCacheBudget,
};

export type { CacheSnapshot, CacheBudget, DiskStats };

export default {
  CACHE_DIR,
  readCache,
  readCacheAsync,
  writeCache,
  writeCacheAsync,
  pruneCache: pruneCacheSync,
  cleanOldCache: cleanOldCacheSync,
  getCacheSize,
  getCacheSizeAsync,
  getCacheSnapshot,
  getCacheSnapshotAsync,
  MAX_CACHE_PERCENT,
  MAX_CACHE_FILE_AGE_MS,
  getCacheBudget,
};
