import { describe, expect, it, vi } from "vitest";
import type { ChatInputCommandInteraction, ButtonInteraction } from "discord.js";
import { __testing, handleBattleChallengeButton, handleBattleChallengeCommand } from "../src/bot/battle/challenge.js";
import type { ArenaThreadContext } from "../src/bot/arena/thread.js";

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
  it("creates a pending battle and DM challenge", async () => {
    const dmSend = vi.fn();
    const opponent = {
      id: "opponent",
      tag: "Gary#0002",
      createDM: vi.fn().mockResolvedValue({ send: dmSend }),
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
    expect(opponent.createDM).toHaveBeenCalled();
    expect(dmSend).toHaveBeenCalled();
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
    const userDmSend = vi.fn();
    const usersFetch = vi
      .fn()
      .mockImplementation(async (id: string) => ({ id, createDM: vi.fn().mockResolvedValue({ send: userDmSend }) }));

    const interaction: ButtonInteraction = {
      customId,
      user: { id: "opponent", tag: "Gary#0002" } as any,
      reply: reply as any,
      update: update as any,
      client: { channels: { fetch: channelFetch }, users: { fetch: usersFetch } } as any,
    } as ButtonInteraction;

    return { interaction, reply, update, channelFetch, usersFetch, userDmSend };
  }

  it("declines a challenge and notifies challenger", async () => {
    const { interaction, reply, update, usersFetch, userDmSend } = createInteraction("BATTLE_DECLINE_abc");

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
    expect(userDmSend).toHaveBeenCalled();
  });

  it("accepts a challenge, creates arena thread, and notifies players", async () => {
    const { interaction, reply, update, channelFetch, usersFetch, userDmSend } = createInteraction(
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
    expect(userDmSend).toHaveBeenCalled();
  });
});
