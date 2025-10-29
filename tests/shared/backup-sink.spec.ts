import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { storeBackup, resetBackupSinkForTests } from "../../src/shared/storage/backup-sink.js";
import { resetConfigCacheForTests } from "../../src/shared/config.js";

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

describe("backup sink", () => {
  beforeEach(() => {
    resetBackupSinkForTests();
    resetConfigCacheForTests();
  });

  afterEach(async () => {
    restoreEnv();
    resetBackupSinkForTests();
    resetConfigCacheForTests();
  });

  it("no-op provider resolves without writing", async () => {
    process.env.BACKUP_STORAGE_PROVIDER = "none";
    const result = await storeBackup({
      id: "abc",
      topic: "test.topic",
      payload: { foo: "bar" },
      createdAt: new Date("2025-01-01T00:00:00Z"),
      processedAt: "2025-01-01T00:00:01Z",
    });

    expect(result.provider).toBe("none");
    expect(result.location).toBeUndefined();
  });

  it("writes payloads to local filesystem when provider=local", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "backup-sink-test-"));
    process.env.BACKUP_STORAGE_PROVIDER = "local";
    process.env.BACKUP_STORAGE_LOCAL_DIR = tmpDir;
    process.env.BACKUP_STORAGE_PREFIX = "events";

    const result = await storeBackup({
      id: "xyz",
      topic: "pokemon.caught",
      payload: { trainerId: "123", pokemonId: "999" },
      createdAt: new Date("2025-02-01T00:00:00Z"),
      processedAt: "2025-02-01T00:00:05Z",
    });

    expect(result.provider).toBe("local");
    expect(result.location).toMatch(/^file:\/\//);

    const filePath = result.location?.replace(/^file:\/\//, "");
    expect(filePath).toBeTruthy();
    if (!filePath) return;

    const contents = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(contents.id).toBe("xyz");
    expect(contents.topic).toBe("pokemon.caught");
    expect(contents.payload).toEqual({ trainerId: "123", pokemonId: "999" });

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});
