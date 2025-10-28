export type CacheInitResult = {
  total: number;
  lastFetchedAt: Date | null;
};

export type CacheRefreshResult = {
  total: number;
  lastFetchedAt: Date | null;
};

export type CacheMetadata = {
  cacheFile: string;
  total: number;
  lastFetchedAt: Date | null;
  lastFetchAttemptAt: Date | null;
  cron: string;
  timezone: string;
};

export function initializePokemonCache(): Promise<CacheInitResult>;
export function refreshPokemonCache(options?: { reason?: string }): Promise<CacheRefreshResult>;
export function getCacheMetadata(): CacheMetadata;
