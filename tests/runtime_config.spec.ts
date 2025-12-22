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
  delete process.env.PROD_DATABASE_URL;
  delete process.env.RENDER_DB_INTERNAL_URL;
  delete process.env.RENDER_DB_EXTERNAL_URL;
  delete process.env.DATABASE_ONPREMISE_DEV_PRIMARY;
  delete process.env.CACHE_TTL_MS;
  // Disable preference file to prevent test pollution
  process.env.DATABASE_CONNECTION_STATE_DIR = "Store/test/db-connection-state";
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("loadConfig", () => {
  it("falls back to RENDER_DB_INTERNAL_URL when DATABASE_URL is missing", async () => {
    process.env.RENDER_DB_INTERNAL_URL = "postgres://render.internal/app";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgres://render.internal/app");
    expect(process.env.DATABASE_URL).toBe("postgres://render.internal/app");
  });

  it("throws when no direct PostgreSQL URLs are available", async () => {
    // In unified architecture, DATABASE_URL alone is not enough - direct URLs (PROD/RENDER/LOCAL) are required
    process.env.NODE_ENV = "production";
    // All direct URLs are deleted in beforeEach, so this should throw
    await expect(loadConfigModule()).rejects.toThrow(/No database URL found/);
  });

  it("allows localhost in production when using PROD_DATABASE_URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.PROD_DATABASE_URL = "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db");
  });

  it("uses PROD_DATABASE_URL and exposes defaults", async () => {
    // In unified architecture, use PROD_DATABASE_URL instead of deprecated DATABASE_URL
    process.env.PROD_DATABASE_URL = "postgres://example.com/prod";
    delete process.env.CACHE_TTL_MS;
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgres://example.com/prod");
    expect(config.cacheTtlMs).toBe(60_000);
    expect(config.redisUrl).toBeNull();
  });

  it("prefers PROD_DATABASE_URL in all environments (unified architecture)", async () => {
    process.env.NODE_ENV = "development";
    process.env.PROD_DATABASE_URL = "postgresql://render-managed.example/infinity_gauntlet";
    process.env.RENDER_DB_EXTERNAL_URL = "postgresql://external-fallback.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://render-managed.example/infinity_gauntlet");
    expect(config.databaseUrlSource).toBe("env");
  });

  it("prefers PROD_DATABASE_URL in production mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.PROD_DATABASE_URL = "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db";
    process.env.RENDER_DB_EXTERNAL_URL = "postgresql://external-fallback.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    // PROD_DATABASE_URL takes priority in unified architecture
    expect(config.databaseUrl).toBe("postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db");
    expect(config.databaseUrlSource).toBe("env");
  });

  it("throws when no direct PostgreSQL URLs are available (unified architecture)", async () => {
    // Clear all direct URLs (done in beforeEach)
    // DATABASE_URL alone is not used in unified architecture
    const configPromise = loadConfigModule().then(async ({ loadConfig, resetConfigCacheForTests }) => {
      resetConfigCacheForTests();
      return loadConfig();
    });
    await expect(configPromise).rejects.toThrow(/No database URL found/);
  });
});
