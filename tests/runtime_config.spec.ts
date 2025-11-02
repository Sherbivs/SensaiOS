import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/config/env.js", () => ({}));

type ConfigModule = typeof import("../src/shared/config.js");

async function loadConfigModule(): Promise<ConfigModule> {
  vi.resetModules();
  return import("../src/shared/config.js");
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_INTERNAL_URL;
  delete process.env.DATABASE_DIRECT_URL;
  delete process.env.DATABASE_POOL_URL;
  delete process.env.DATABASE_EXTERNAL_URL;
  delete process.env.DATABASE_PUBLIC_URL;
  delete process.env.DATABASE_ACCELERATE_URL;
  delete process.env.PRISMA_ACCELERATE_URL;
  delete process.env.PRISMA_DATA_PROXY_URL;
  delete process.env.OPTIMIZE_API_KEY;
  delete process.env.OPTIMIZE_API_URL;
  delete process.env.OPTIMIZE_API_ENDPOINT;
  delete process.env.CACHE_TTL_MS;
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("loadConfig", () => {
  it("falls back to DATABASE_INTERNAL_URL when DATABASE_URL is missing", async () => {
    process.env.DATABASE_INTERNAL_URL = "postgres://render.internal/app";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    process.env.DATABASE_URL = "";
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgres://render.internal/app");
    expect(process.env.DATABASE_URL).toBe("postgres://render.internal/app");
  });

  it("throws in production when DATABASE_URL points to localhost", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://localhost/db";
    await expect(loadConfigModule()).rejects.toThrow(/cannot point to localhost/i);
  });

  it("keeps DATABASE_URL when provided and exposes defaults", async () => {
    process.env.DATABASE_URL = "postgres://example.com/prod";
    delete process.env.CACHE_TTL_MS;
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgres://example.com/prod");
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.redisUrl).toBeNull();
  });

  it("prefers Accelerate URLs when available but retains direct fallbacks", async () => {
    process.env.DATABASE_POOL_URL = "prisma+postgres://accelerate.example/primary";
    process.env.DATABASE_DIRECT_URL = "postgresql://render-direct.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("prisma+postgres://accelerate.example/primary");
    const directCandidate = config.databaseCandidates.find((candidate) => candidate.source === "direct");
    expect(directCandidate?.isFallback).toBe(true);
  });

  it("uses a direct PostgreSQL URL when Accelerate endpoints are absent", async () => {
    process.env.DATABASE_DIRECT_URL = "postgresql://render-direct.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://render-direct.example/infinity_gauntlet");
    expect(config.databaseCandidates.some((candidate) => candidate.source === "direct")).toBe(true);
    expect(["direct", "env"]).toContain(config.databaseUrlSource);
  });

  it("falls back to pooled PostgreSQL URLs when direct URLs are missing", async () => {
    process.env.DATABASE_POOL_URL = "postgresql://render-pool.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://render-pool.example/infinity_gauntlet");
    expect(config.databaseCandidates.some((candidate) => candidate.source === "pool")).toBe(true);
    expect(["pool", "env"]).toContain(config.databaseUrlSource);
  });
});
