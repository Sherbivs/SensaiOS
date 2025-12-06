import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

vi.mock("../src/config/env.js", () => ({}));

type ConfigModule = typeof import("../src/shared/config.js");

async function loadConfigModule(): Promise<ConfigModule> {
  vi.resetModules();
  return import("../src/shared/config.js");
}

const ORIGINAL_ENV = { ...process.env };
let tempDir: string;

beforeEach(() => {
  // Create isolated temp directory to avoid reading real preference files
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-config-test-"));
  
  process.env = { ...ORIGINAL_ENV };
  delete process.env.DATABASE_URL;
  delete process.env.PROD_DATABASE_URL;
  delete process.env.RENDER_DB_INTERNAL_URL;
  delete process.env.RENDER_DB_EXTERNAL_URL;
  delete process.env.DATABASE_ONPREMISE_DEV_PRIMARY;
  delete process.env.CACHE_TTL_MS;
  // Use isolated temp dir to avoid reading real preference file
  process.env.DATABASE_CONNECTION_STATE_DIR = tempDir;
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  // Clean up temp directory
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("loadConfig", () => {
  it("falls back to RENDER_DB_INTERNAL_URL when PROD_DATABASE_URL is missing", async () => {
    process.env.RENDER_DB_INTERNAL_URL = "postgres://render.internal/app";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgres://render.internal/app");
    expect(process.env.DATABASE_URL).toBe("postgres://render.internal/app");
  });

  it("throws when no database URLs are configured", async () => {
    // All database env vars are deleted in beforeEach
    // Should fail because no valid database URL is available
    await expect(loadConfigModule()).rejects.toThrow(/No database URL found/i);
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

  it("prefers PROD_DATABASE_URL over RENDER_DB_EXTERNAL_URL in production mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.PROD_DATABASE_URL = "postgresql://postgres@prod.example/infinity_gauntlet_db";
    process.env.RENDER_DB_EXTERNAL_URL = "postgresql://external-fallback.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://postgres@prod.example/infinity_gauntlet_db");
    expect(config.databaseUrlSource).toBe("env");
  });

  it("falls back to RENDER_DB_EXTERNAL_URL when PROD_DATABASE_URL is missing", async () => {
    process.env.RENDER_DB_EXTERNAL_URL = "postgresql://render-db.example/infinity_gauntlet";
    const { loadConfig, resetConfigCacheForTests } = await loadConfigModule();
    resetConfigCacheForTests();
    const config = loadConfig();
    expect(config.databaseUrl).toBe("postgresql://render-db.example/infinity_gauntlet");
    expect(config.databaseCandidates.some((candidate) => candidate.source === "external")).toBe(true);
    expect(["external"]).toContain(config.databaseUrlSource);
  });
});
