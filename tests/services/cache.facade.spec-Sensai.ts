import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
