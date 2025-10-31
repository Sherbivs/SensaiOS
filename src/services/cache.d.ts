export interface CacheSnapshot {
  timestamp: number;
  sizeBytes: number;
  entryCount: number;
  oldestEntryMs: number | null;
  newestEntryMs: number | null;
}

export interface CacheBudget {
  approxBytes: number;
  maxAllowedBytes: number;
  percent: number;
  diskFreeBytes: number;
  diskTotalBytes: number;
  workspaceLimitBytes: number;
}

export const CACHE_DIR: string;

export function readCache<T = unknown>(key: string): T | null;
export function writeCache<T = unknown>(key: string, data: T): void;
export function pruneCache(): void;
export function cleanOldCache(): void;
export function getCacheSize(): number;
export function getCacheSnapshot(): CacheSnapshot;
export const MAX_CACHE_PERCENT: number;
export function getCacheBudget(): CacheBudget;

declare const cacheService: {
  CACHE_DIR: typeof CACHE_DIR;
  readCache: typeof readCache;
  writeCache: typeof writeCache;
  pruneCache: typeof pruneCache;
  cleanOldCache: typeof cleanOldCache;
  getCacheSize: typeof getCacheSize;
  getCacheSnapshot: typeof getCacheSnapshot;
  MAX_CACHE_PERCENT: typeof MAX_CACHE_PERCENT;
  getCacheBudget: typeof getCacheBudget;
};

export default cacheService;
