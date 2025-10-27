import { loadConfig } from "../config.js";

type CacheRecord = {
  value: unknown;
  expiresAt: number;
};

class MemoryCache {
  #store = new Map<string, CacheRecord>();
  #defaultTtl: number;

  constructor(defaultTtl: number) {
    this.#defaultTtl = defaultTtl;
  }

  get<T>(key: string): T | null {
    const record = this.#store.get(key);
    if (!record) {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      this.#store.delete(key);
      return null;
    }

    return record.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    const ttl = typeof ttlMs === "number" && ttlMs > 0 ? ttlMs : this.#defaultTtl;
    this.#store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  del(key: string): void {
    this.#store.delete(key);
  }

  clear(): void {
    this.#store.clear();
  }

  get size(): number {
    this.#evictExpired();
    return this.#store.size;
  }

  #evictExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.#store.entries()) {
      if (record.expiresAt <= now) {
        this.#store.delete(key);
      }
    }
  }
}

const { cacheTtlMs } = loadConfig();

export const cache = new MemoryCache(cacheTtlMs);
export { MemoryCache };
