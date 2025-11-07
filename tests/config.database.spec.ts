import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadConfig,
  recordDatabaseConnectionSuccess,
  resetConfigCacheForTests,
  type DatabaseCandidate,
} from "../src/shared/config";

describe("database connection preference", () => {
  let tempDir: string;
  const trackedEnvKeys = [
    "DATABASE_CONNECTION_STATE_DIR",
    "DATABASE_CONNECTION_MODE",
    "RENDER_DB_EXTERNAL_URL",
    "RENDER_DB_INTERNAL_URL",
    "DATABASE_INTERNAL_URL",
    "DATABASE_LOCAL_URL",
    "DATABASE_URL",
    "NODE_ENV",
  ] as const;
  const previousEnv: Partial<Record<(typeof trackedEnvKeys)[number], string | undefined>> = {};

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ig-db-pref-"));
    for (const key of trackedEnvKeys) {
      previousEnv[key] = process.env[key];
    }
    process.env.DATABASE_CONNECTION_STATE_DIR = tempDir;
    process.env.NODE_ENV = "development";
  process.env.DATABASE_CONNECTION_MODE = "auto";
    process.env.RENDER_DB_EXTERNAL_URL = "postgresql://external.example/db";
    process.env.DATABASE_INTERNAL_URL = "postgresql://internal.example/db";
    delete process.env.RENDER_DB_INTERNAL_URL;
    delete process.env.DATABASE_LOCAL_URL;
    delete process.env.DATABASE_URL;
    resetConfigCacheForTests();
  });

  afterEach(() => {
    resetConfigCacheForTests();
    for (const key of trackedEnvKeys) {
      const value = previousEnv[key];
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("prefers the saved internal source after a successful connection", () => {
    const initial = loadConfig();
    expect(initial.databaseCandidates[0]?.source).toBe("external");

    recordDatabaseConnectionSuccess("internal");
    resetConfigCacheForTests();

    const updated = loadConfig();
    const sources = updated.databaseCandidates.map((candidate: DatabaseCandidate) => candidate.source);
    expect(sources[0]).toBe("internal");
  });
});
