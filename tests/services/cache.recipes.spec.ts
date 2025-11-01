import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureCacheFacade } from "../../src/services/cache/facade.js";
import { loadBattleState } from "../../src/services/cache/recipes.js";

describe("cache recipes", () => {
  let tempDir: string;

  function makeBattle() {
    const now = new Date("2025-01-01T00:00:00Z");
    return {
      id: "battle-1",
      p1Id: "p1-id",
      p2Id: "p2-id",
      arenaThreadId: null,
      state: "Pending",
      rngSeed: "seed",
      ruleset: "standard",
      logCompact: null,
      logFull: null,
      resultJson: null,
      startedAt: now,
      endedAt: null,
      updatedAt: now,
      p1: {
        id: "p1-id",
        discordId: "user-1",
        coins: 0,
        createdAt: now,
        updatedAt: now,
        settingsJson: null,
        dailyQuestStreak: 0,
        dailyQuestLastCompleted: null,
        dailyQuestLastReset: null,
      },
      p2: {
        id: "p2-id",
        discordId: "user-2",
        coins: 0,
        createdAt: now,
        updatedAt: now,
        settingsJson: null,
        dailyQuestStreak: 0,
        dailyQuestLastCompleted: null,
        dailyQuestLastReset: null,
      },
    } as const;
  }

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "ig-cache-recipes-"));
    configureCacheFacade({ rootDir: tempDir, maxMemoryBytes: 1024 * 1024, maxMemoryItems: 32 });
  });

  afterEach(async () => {
    await fsPromises.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("hydrates battle state once and serves cached value", async () => {
    const battle = makeBattle();
    const prisma = {
      battle: {
        findUnique: vi.fn().mockResolvedValue(battle),
      },
    };

    const first = await loadBattleState("battle-1", { prisma: prisma as any, ttlMs: 10_000 });
    const second = await loadBattleState("battle-1", { prisma: prisma as any, ttlMs: 10_000 });

    expect(first?.id).toBe("battle-1");
    expect(second).toEqual(first);
    expect(prisma.battle.findUnique).toHaveBeenCalledTimes(1);
    expect(first?.startedAt).toBeInstanceOf(Date);
    expect(first?.p1.createdAt).toBeInstanceOf(Date);
  });

  it("falls back to direct prisma query when hydration throws", async () => {
    const battle = makeBattle();
    const prisma = {
      battle: {
        findUnique: vi
          .fn()
          .mockRejectedValueOnce(new Error("db down"))
          .mockResolvedValueOnce(battle),
      },
    };

    const value = await loadBattleState("battle-err", { prisma: prisma as any, ttlMs: 10_000 });

    expect(value?.id).toBe("battle-1");
    expect(prisma.battle.findUnique).toHaveBeenCalledTimes(2);
    expect(value?.updatedAt).toBeInstanceOf(Date);
  });
});
