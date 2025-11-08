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
  delete process.env.DEV_DATABASE_URL;
  delete process.env.RENDER_DB_INTERNAL_URL;
  delete process.env.RENDER_DB_EXTERNAL_URL;
  delete process.env.DATABASE_LOCAL_URL;
  delete process.env.CACHE_TTL_MS;
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
    process.env.DATABASE_URL = "";
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgres://render.internal/app");
    expect(process.env.DATABASE_URL).toBe("postgres://render.internal/app");
  });

  it("throws in production when DATABASE_URL points to localhost (unless using PROD_DATABASE_URL)", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://localhost/db";
    // Should fail because DATABASE_URL is localhost but not PROD_DATABASE_URL
    await expect(loadConfigModule()).rejects.toThrow(/cannot point to localhost/i);
  });

  it("allows localhost in production when using PROD_DATABASE_URL", async () => {
    process.env.NODE_ENV = "production";
    process.env.PROD_DATABASE_URL = "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db");
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

  it("prefers DEV_DATABASE_URL in development mode", async () => {
    process.env.NODE_ENV = "development";
    process.env.DEV_DATABASE_URL = "postgresql://dev-master.example/infinity_gauntlet";
    process.env.PROD_DATABASE_URL = "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://dev-master.example/infinity_gauntlet");
    expect(config.databaseUrlSource).toBe("external");
  });

  it("prefers PROD_DATABASE_URL in production mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.PROD_DATABASE_URL = "postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db";
    process.env.DEV_DATABASE_URL = "postgresql://dev-master.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://postgres@127.0.0.1:55433/infinity_gauntlet_db");
    expect(config.databaseUrlSource).toBe("env");
  });

  it("falls back to DATABASE_URL when direct URLs are missing", async () => {
    process.env.DATABASE_URL = "postgresql://render-db.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://render-db.example/infinity_gauntlet");
    expect(config.databaseCandidates.some((candidate) => candidate.source === "env")).toBe(true);
    expect(["env"]).toContain(config.databaseUrlSource);
  });
});
