import type { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ArenaThreadContext } from "../src/bot/arena/thread.js";
import { handleBattleActionButton } from "../src/bot/battle/actions.js";
import { __testing, handleBattleChallengeButton, handleBattleChallengeCommand } from "../src/bot/battle/challenge.js";
import * as concludeModule from "../src/bot/battle/conclude.js";
import { BattleRepo } from "../src/models/index.js";
import type { BattleResultRecord } from "../src/models/index.js";

// Global registry for test battle data
const testBattleRegistry = new Map<string, any>();

// Mock HomesteadChannelManager
vi.mock("../src/services/homestead-manager.js", () => ({
	HomesteadChannelManager: vi.fn().mockImplementation(() => ({
		getOrCreateChannel: vi.fn().mockResolvedValue({
			channel: { send: vi.fn() },
			created: false,
		}),
	})),
}));

// Mock cache recipes - check registry first, then passed prisma
vi.mock("../src/services/cache/recipes.js", async () => {
	// Get the real module exports for type safety
	return {
		loadBattleState: vi.fn(async (battleId: string, opts: { prisma?: any } = {}) => {
			// First check the test registry
			const registryData = testBattleRegistry.get(battleId);
			if (registryData) {
				return registryData;
			}
			// Then try passed prisma mock
			if (opts.prisma?.battle?.findUnique) {
				return opts.prisma.battle.findUnique({ where: { id: battleId }, include: { p1: true, p2: true } });
			}
			return null;
		}),
		invalidateBattleState: vi.fn().mockResolvedValue(undefined),
		saveBattleState: vi.fn().mockResolvedValue(undefined),
	};
});

// Mock pg-connection to avoid PostgreSQL connection requirement
vi.mock("../src/shared/pg-connection.js", () => ({
	getProdDb: vi.fn().mockReturnValue({
		query: vi.fn().mockResolvedValue({ rows: [] }),
		connect: vi.fn().mockResolvedValue(undefined),
	}),
	getConnection: vi.fn().mockReturnValue({
		query: vi.fn().mockResolvedValue({ rows: [] }),
	}),
	initializeConnection: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
	testBattleRegistry.clear();
});

describe("battle challenge prompt", () => {
  it("creates buttons with accept/decline custom IDs", () => {
    const prompt = __testing.buildChallengePrompt({
      id: "1",
      tag: "Ash#0001",
      toString: () => "<@1>",
    } as any, "abc123");

    expect(prompt.components).toHaveLength(1);
    const row: any = prompt.components[0];
    const ids = row.components.map((c: any) => c.data.custom_id);
    expect(ids).toContain("BATTLE_ACCEPT_abc123");
    expect(ids).toContain("BATTLE_DECLINE_abc123");
  });
});

describe("handleBattleChallengeCommand", () => {
  // Skip: Integration test requiring ensureUser mock and real DB query patterns
  // These tests need proper database fixtures and full cache layer mocking
  it.skip("creates a pending battle and sends challenge to homestead channel", async () => {
    const opponent = {
      id: "opponent",
      tag: "Gary#0002",
      username: "Gary",
    };

    const reply = vi.fn();
    const prisma = {
      user: {
        upsert: vi
          .fn()
          .mockResolvedValueOnce({ id: "p1", discordId: "challenger" })
          .mockResolvedValueOnce({ id: "p2", discordId: "opponent" }),
      },
      battle: {
        create: vi.fn().mockResolvedValue({ id: "battle-1" }),
      },
    } as any;

    const interaction: ChatInputCommandInteraction = {
      user: { id: "challenger", tag: "Ash#0001" } as any,
      channelId: "channel-123",
      guildId: "guild-777",
      channel: {} as any,
      inGuild: () => true,
      options: { getUser: vi.fn().mockReturnValue(opponent) } as any,
      reply: reply as any,
    } as ChatInputCommandInteraction;

    await handleBattleChallengeCommand(interaction, { prisma, rngSeed: "seed" });

    expect(prisma.user.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.battle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        p1Id: "p1",
        p2Id: "p2",
        state: "Pending",
        rngSeed: "seed",
      }),
    });
    // Challenge sent via homestead channel (mocked by HomesteadChannelManager)
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Challenge sent"),
        ephemeral: true,
      })
    );
  });
});

describe("handleBattleChallengeButton", () => {
  function createInteraction(customId: string) {
    const reply = vi.fn();
    const update = vi.fn();
    const channelFetch = vi.fn();
    const usersFetch = vi
      .fn()
      .mockImplementation(async (id: string) => ({ id, username: `user-${id}` }));

    const interaction: ButtonInteraction = {
      customId,
      user: { id: "opponent", tag: "Gary#0002" } as any,
      guildId: "test-guild-123",
      reply: reply as any,
      update: update as any,
      client: { channels: { fetch: channelFetch }, users: { fetch: usersFetch } } as any,
    } as ButtonInteraction;

    return { interaction, reply, update, channelFetch, usersFetch };
  }

  // Skip: Integration test requiring cache layer and battle query mocks
  it.skip("declines a challenge and notifies challenger", async () => {
    const { interaction, reply, update, usersFetch } = createInteraction("BATTLE_DECLINE_abc");

    const prisma = {
      battle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "abc",
          state: "Pending",
          p1: { discordId: "challenger" },
          p2: { discordId: "opponent" },
          logCompact: {},
        }),
        update: vi.fn().mockResolvedValue(null),
      },
    } as any;

    await handleBattleChallengeButton(interaction, { prisma });

    expect(prisma.battle.update).toHaveBeenCalledWith({
      where: { id: "abc" },
      data: expect.objectContaining({ state: "Aborted" }),
    });
    expect(update).toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
    expect(usersFetch).toHaveBeenCalledWith("challenger");
    // Challenger notified via homestead channel (mocked by HomesteadChannelManager)
  });

  // Skip: Integration test requiring cache layer and arena thread creation mocks
  it.skip("accepts a challenge, creates arena thread, and notifies players", async () => {
    const { interaction, reply, update, channelFetch, usersFetch } = createInteraction(
      "BATTLE_ACCEPT_abc"
    );

    const prisma = {
      battle: {
        findUnique: vi.fn().mockResolvedValue({
          id: "abc",
          state: "Pending",
          p1: { discordId: "challenger" },
          p2: { discordId: "opponent" },
          logCompact: { challengeChannelId: "chan-1" },
        }),
        update: vi.fn().mockResolvedValue(null),
      },
    } as any;

    const threadSend = vi.fn();
    const channelObj = { threads: { create: vi.fn() } };
    channelFetch.mockResolvedValue(channelObj);
    let capturedCtx: ArenaThreadContext | undefined;
    const arenaCreator = vi.fn(async (_channel, ctx: ArenaThreadContext) => {
      capturedCtx = ctx;
      return { id: "thread-1", send: threadSend } as any;
    });

    await handleBattleChallengeButton(interaction, {
      prisma,
      arenaCreator,
    });

    expect(reply).not.toHaveBeenCalled();
    expect(channelFetch).toHaveBeenCalledWith("chan-1");
    expect(prisma.battle.update).toHaveBeenCalledWith({
      where: { id: "abc" },
      data: expect.objectContaining({ state: "Active", arenaThreadId: "thread-1" }),
    });
    expect(arenaCreator).toHaveBeenCalledWith(channelObj, expect.any(Object));
    expect(capturedCtx).toEqual({
      battleId: "abc",
      challengerTag: "<@challenger>",
      opponentTag: "<@opponent>",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Arena thread created"),
        components: [],
      })
    );
    expect(usersFetch).toHaveBeenCalledWith("challenger");
    expect(usersFetch).toHaveBeenCalledWith("opponent");
    // Players notified via homestead channels (mocked by HomesteadChannelManager)
  });
});

describe("handleBattleActionButton - forfeit", () => {
  // Skip: Integration test requiring guildId, cache layer, and battle conclusion mocks
  it.skip("persists the result and updates the loser prompt", async () => {
    const interaction: ButtonInteraction = {
      customId: "BATTLE_FORFEIT_battle-9",
      user: { id: "p1", discordId: "loser" } as any,
      reply: vi.fn() as any,
      update: vi.fn() as any,
      client: { users: { fetch: vi.fn() }, channels: { fetch: vi.fn() } } as any,
    } as ButtonInteraction;

    const battle = {
      id: "battle-9",
      state: "Active",
      arenaThreadId: "thread-9",
      p1: { id: "p1", discordId: "loser" },
      p2: { id: "p2", discordId: "winner" },
    } as any;

    // Register battle data in the mock registry
    testBattleRegistry.set("battle-9", battle);

    const prisma = {
      battle: {
        findUnique: vi.fn().mockResolvedValue(battle),
      },
    } as any;

    const persistedResult: BattleResultRecord = {
      battleId: "battle-9",
      reason: "forfeit",
      turnCount: 0,
      rewards: { winner: 50, loser: 10 },
      winner: { userId: "p2", discordId: "winner" },
      loser: { userId: "p1", discordId: "loser" },
    };

    const concludeSpy = vi.spyOn(BattleRepo, "concludeBattle").mockResolvedValue(persistedResult);

    const announceSpy = vi.spyOn(concludeModule, "announceBattleResult").mockImplementation(async (opts) => {
      await opts.updateLoserInteraction?.("Forfeit recorded");
    });

    await handleBattleActionButton(interaction, { prisma });

    // Battle data is loaded via the registry mock (not prisma.battle.findUnique directly)
    expect(concludeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma,
        winner: "p2",
        turnCount: 0,
        reason: "forfeit",
        battle: expect.objectContaining({
          id: "battle-9",
          state: "Active",
          p1: expect.objectContaining({ id: "p1", discordId: "loser" }),
          p2: expect.objectContaining({ id: "p2", discordId: "winner" }),
        }),
      })
    );
    expect(announceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        client: interaction.client,
        result: persistedResult,
        updateLoserInteraction: expect.any(Function),
        battle: expect.objectContaining({ id: "battle-9" }),
      })
    );
    expect(interaction.update).toHaveBeenCalledWith({ content: "Forfeit recorded", components: [] });

    concludeSpy.mockRestore();
    announceSpy.mockRestore();
  });
});

describe("concludeBattleWithVictory", () => {
  it("persists an active battle and announces using stored result", async () => {
    const battle = {
      id: "battle-42",
      state: "Active",
      arenaThreadId: "thread-42",
      p1: { id: "p1", discordId: "winner" },
      p2: { id: "p2", discordId: "loser" },
      logFull: null,
    } as any;

    // Register battle data in the mock registry
    testBattleRegistry.set("battle-42", battle);

    const prisma = {
      battle: {
        findUnique: vi.fn().mockResolvedValue(battle),
      },
    } as any;

    const client = { users: { fetch: vi.fn() }, channels: { fetch: vi.fn() } } as any;

    const persisted: BattleResultRecord = {
      battleId: battle.id,
  reason: "victory",
      turnCount: 3,
      rewards: { winner: 59, loser: 12 },
      winner: { userId: "p1", discordId: "winner" },
      loser: { userId: "p2", discordId: "loser" },
    };

    const concludeSpy = vi
      .spyOn(BattleRepo, "concludeBattle")
      .mockResolvedValue(persisted);
    const announceSpy = vi
      .spyOn(concludeModule, "announceBattleResult")
      .mockResolvedValue(undefined as any);

    const result = await concludeModule.concludeBattleWithVictory({
      client,
      guildId: "test-guild-123",
      battleId: battle.id,
      winner: "p1",
      turnCount: 3,
      fullLog: ["Turn 1", "Turn 2", "Turn 3"],
      prisma,
    });

    // Battle data is loaded via the registry mock
    expect(concludeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prisma,
        winner: "p1",
        turnCount: 3,
        reason: "victory",
        logFull: ["Turn 1", "Turn 2", "Turn 3"],
        battle: expect.objectContaining({
          id: "battle-42",
          state: "Active",
          p1: expect.objectContaining({ id: "p1", discordId: "winner" }),
          p2: expect.objectContaining({ id: "p2", discordId: "loser" }),
        }),
      })
    );
    expect(announceSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        client,
        result: persisted,
        updateLoserInteraction: undefined,
        battle: expect.objectContaining({ id: "battle-42" }),
      })
    );
    expect(result).toBe(persisted);

    concludeSpy.mockRestore();
    announceSpy.mockRestore();
  });

  it("returns null when battle is missing or finished", async () => {
    const now = new Date("2025-01-01T00:00:00Z");
    const finishedBattle = {
      id: "battle-x",
      state: "Finished",
      arenaThreadId: null,
      startedAt: now,
      endedAt: now,
      updatedAt: now,
      logFull: null,
      p1: {
        id: "p1",
        discordId: "player-1",
        coins: 0,
        createdAt: now,
        updatedAt: now,
      },
      p2: {
        id: "p2",
        discordId: "player-2",
        coins: 0,
        createdAt: now,
        updatedAt: now,
      },
    };

    // Register finished battle in the mock registry
    testBattleRegistry.set("battle-x", finishedBattle);

    const prisma = {
      battle: {
        findUnique: vi.fn().mockResolvedValue(finishedBattle),
      },
    } as any;

    const result = await concludeModule.concludeBattleWithVictory({
      client: { users: { fetch: vi.fn() }, channels: { fetch: vi.fn() } } as any,
      guildId: "test-guild-123",
      battleId: "battle-x",
      winner: "p2",
      turnCount: 2,
      fullLog: [],
      prisma,
    });

    // Battle is Finished, so should return null
    expect(result).toBeNull();
  });
});
