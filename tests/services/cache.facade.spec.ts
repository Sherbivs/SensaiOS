import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cacheEntryStore = new Map<string, {
  key: string;
  namespace?: string;
  value: object;
  sizeBytes?: number;
  accessCount?: number;
  lastAccessedAt?: Date;
  expiresAt?: Date;
}>();

vi.mock("../../src/shared/prisma.js", () => ({
  prisma: {
    cacheEntry: {
      findUnique: vi.fn(async ({ where: { key } }: { where: { key: string } }) => {
        return cacheEntryStore.get(key) ?? null;
      }),
      findMany: vi.fn(async ({ orderBy, take }: { orderBy?: { lastAccessedAt: 'asc' | 'desc' }; take?: number }) => {
        const entries = Array.from(cacheEntryStore.values());
        if (orderBy?.lastAccessedAt) {
          entries.sort((a, b) => {
            const aTime = a.lastAccessedAt?.getTime?.() ?? 0;
            const bTime = b.lastAccessedAt?.getTime?.() ?? 0;
            return orderBy.lastAccessedAt === 'asc' ? aTime - bTime : bTime - aTime;
          });
        }
        const sliced = typeof take === 'number' ? entries.slice(0, take) : entries;
        return sliced.map((entry) => ({ key: entry.key, sizeBytes: entry.sizeBytes ?? 0 }));
      }),
      upsert: vi.fn(async ({ where: { key }, create, update }: { where: { key: string }; create: object; update: object }) => {
        const existing = cacheEntryStore.get(key);
        const entry = existing ? { ...existing, ...update, key } : { ...create, key };
        cacheEntryStore.set(key, entry as { key: string; value: object });
        return entry;
      }),
      aggregate: vi.fn(async () => {
        const entries = Array.from(cacheEntryStore.values());
        const sizeBytes = entries.reduce((sum, entry) => sum + (entry.sizeBytes ?? 0), 0);
        const accessTimes = entries
          .map((entry) => entry.lastAccessedAt)
          .filter((value): value is Date => value instanceof Date);
        const min = accessTimes.length ? new Date(Math.min(...accessTimes.map((d) => d.getTime()))) : null;
        const max = accessTimes.length ? new Date(Math.max(...accessTimes.map((d) => d.getTime()))) : null;
        return {
          _sum: { sizeBytes },
          _count: entries.length,
          _min: { lastAccessedAt: min },
          _max: { lastAccessedAt: max },
        };
      }),
      delete: vi.fn(async ({ where: { key } }: { where: { key: string } }) => {
        cacheEntryStore.delete(key);
      }),
      deleteMany: vi.fn(async ({ where }: { where?: { namespace?: string; expiresAt?: { lt?: Date } } } = {}) => {
        let count = 0;
        const namespace = where?.namespace;
        const expiresBefore = where?.expiresAt?.lt;
        for (const [key, entry] of cacheEntryStore.entries()) {
          if (namespace && entry.namespace !== namespace) {
            continue;
          }
          if (expiresBefore && entry.expiresAt instanceof Date && entry.expiresAt >= expiresBefore) {
            continue;
          }
          count += 1;
          cacheEntryStore.delete(key);
        }
        return { count };
      }),
    },
  },
}));

import {
  cacheRoot,
  collectCacheMetrics,
  configureCacheFacade,
  evict,
  getOrHydrate,
  peek,
  resetCacheMetrics,
  runCacheMaintenanceNow,
  stopCacheMaintenanceScheduler,
  touch,
  type CacheReadOptions,
} from "../../src/services/cache/facade";

describe("cache facade", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ig-cache-facade-"));
    stopCacheMaintenanceScheduler();
    resetCacheMetrics();
    cacheEntryStore.clear();
    configureCacheFacade({ rootDir: tempDir, maxMemoryBytes: 1024 * 1024, maxMemoryItems: 32 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterEach(async () => {
    stopCacheMaintenanceScheduler();
    resetCacheMetrics();
    vi.useRealTimers();
    await fsPromises.rm(tempDir, { recursive: true, force: true });
  });

  const baseOptions: CacheReadOptions = {
    namespace: "battle-state",
    shard: "alpha",
    key: "match-001",
    ttlMs: 1_000,
  };

  it("hydrates once and serves memory hits", async () => {
    const hydrate = vi.fn().mockResolvedValue({ round: 1 });

    const first = await getOrHydrate(baseOptions, hydrate);
    const second = await getOrHydrate(baseOptions, hydrate);

    expect(first).toEqual({ round: 1 });
    expect(second).toEqual(first);
    expect(hydrate).toHaveBeenCalledTimes(1);
    expect(cacheRoot()).toBe(tempDir);
  });

  it("re-hydrates after TTL expiry", async () => {
    const hydrate = vi
      .fn()
      .mockResolvedValueOnce({ round: 1 })
      .mockResolvedValueOnce({ round: 2 });

    await getOrHydrate(baseOptions, hydrate);
    vi.advanceTimersByTime(1_500);
    const refreshed = await getOrHydrate(baseOptions, hydrate);

    expect(refreshed).toEqual({ round: 2 });
    expect(hydrate).toHaveBeenCalledTimes(2);
  });

  it("reads persisted values from disk when memory is cold", async () => {
    const hydrate = vi.fn().mockResolvedValue({ round: 3 });

    await getOrHydrate(baseOptions, hydrate);
    expect(hydrate).toHaveBeenCalledTimes(1);

    configureCacheFacade({ rootDir: tempDir, maxMemoryBytes: 1024 * 1024, maxMemoryItems: 32 });

    const diskHydrate = vi.fn().mockResolvedValue({ round: 4 });
    const value = await getOrHydrate(baseOptions, diskHydrate);

    expect(value).toEqual({ round: 3 });
    expect(diskHydrate).not.toHaveBeenCalled();
  });

  it("extends TTL when touched", async () => {
    const hydrate = vi.fn().mockResolvedValue({ round: 5 });
    await getOrHydrate(baseOptions, hydrate);
    vi.advanceTimersByTime(900);

    const touched = await touch({ ...baseOptions, ttlMs: 1_000 });
    expect(touched).toBe(true);

    vi.advanceTimersByTime(900);
    const value = await getOrHydrate(baseOptions, hydrate);
    expect(value).toEqual({ round: 5 });
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it("evicts records from memory and disk", async () => {
    const hydrate = vi.fn().mockResolvedValue({ round: 6 });
    await getOrHydrate(baseOptions, hydrate);

    await evict(baseOptions);

    const peeked = await peek(baseOptions);
    expect(peeked).toBeNull();

    const rehydrated = await getOrHydrate(baseOptions, hydrate);
    expect(rehydrated).toEqual({ round: 6 });
    expect(hydrate).toHaveBeenCalledTimes(2);
  });

  it("collects namespace metrics and maintenance state", async () => {
    const hydrate = vi.fn().mockResolvedValue({ round: 7 });

    await getOrHydrate(baseOptions, hydrate); // miss + hydration
    await getOrHydrate(baseOptions, hydrate); // memory hit

    configureCacheFacade({ rootDir: tempDir, maxMemoryBytes: 1024 * 1024, maxMemoryItems: 32 });

    const diskHydrate = vi.fn().mockResolvedValue({ round: 8 });
    await getOrHydrate(baseOptions, diskHydrate); // disk hit after memory reset
    expect(diskHydrate).not.toHaveBeenCalled();

    await runCacheMaintenanceNow("manual");
    const snapshot = await collectCacheMetrics({ maintenanceReason: "snapshot" });

    expect(snapshot.memory.items).toBeGreaterThan(0);
    expect(snapshot.disk.entries).toBeGreaterThan(0);
    expect(snapshot.maintenance.runs).toBeGreaterThan(0);
    expect(snapshot.maintenance.lastReason).toBe("manual");

    const ns = snapshot.namespaces.find((entry) => entry.namespace === baseOptions.namespace);
    expect(ns).toBeDefined();
    expect(ns?.memoryHits).toBe(1);
    expect(ns?.diskHits).toBe(1);
    expect(ns?.misses).toBe(1);
    expect(ns?.hydrations).toBe(1);
    expect(ns?.diskEntries).toBeGreaterThan(0);
  });
});
