import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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
  delete process.env.CACHE_TTL_MS;
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("loadConfig", () => {
  it("falls back to DATABASE_INTERNAL_URL when DATABASE_URL is missing", async () => {
    process.env.DATABASE_INTERNAL_URL = "postgres://render.internal/app";
    const { loadConfig } = await loadConfigModule();
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
    const { loadConfig } = await loadConfigModule();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgres://example.com/prod");
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.redisUrl).toBeNull();
  });
});
