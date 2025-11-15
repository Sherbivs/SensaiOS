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
