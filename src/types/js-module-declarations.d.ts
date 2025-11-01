declare module "./services/cache.js" {
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
  export const MAX_CACHE_FILE_AGE_MS: number;
  export function getCacheBudget(): CacheBudget;

  const cacheService: {
    CACHE_DIR: typeof CACHE_DIR;
    readCache: typeof readCache;
    writeCache: typeof writeCache;
    pruneCache: typeof pruneCache;
    cleanOldCache: typeof cleanOldCache;
    getCacheSize: typeof getCacheSize;
    getCacheSnapshot: typeof getCacheSnapshot;
    MAX_CACHE_PERCENT: typeof MAX_CACHE_PERCENT;
    MAX_CACHE_FILE_AGE_MS: typeof MAX_CACHE_FILE_AGE_MS;
    getCacheBudget: typeof getCacheBudget;
  };

  export default cacheService;
}

declare module "../cache.js" {
  export * from "./services/cache.js";
  import cacheService from "./services/cache.js";
  export default cacheService;
}

declare module "./bot/main.js" {
  import type { Client } from "discord.js";

  export declare const client: Client;

  export declare function startSecurityBot(options?: { token?: string }): Promise<Client | void>;

  const securityBot: {
    startSecurityBot: typeof startSecurityBot;
    client: typeof client;
  };

  export default securityBot;
}
