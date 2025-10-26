import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChatInputCommandInteraction } from "discord.js";
import { handleDailyClaim } from "../src/bot/daily/claim.js";

type MockPrisma = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  cooldown: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function makeInteraction(): ChatInputCommandInteraction {
  return {
    user: { id: "discord-1" },
    reply: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction;
}

describe("handleDailyClaim", () => {
  let prisma: MockPrisma;
  let now: Date;

  beforeEach(() => {
    now = new Date("2025-10-26T12:00:00Z");
    prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "user-1", coins: 200 }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ coins: 300 }),
      },
      cooldown: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
        create: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it("claims daily reward, updates streak, and sets cooldown", async () => {
    const interaction = makeInteraction();
    const completion = vi.fn().mockResolvedValue({ streak: 5 });

    await handleDailyClaim(interaction, {
      prisma: prisma as any,
      rewardCoins: 75,
      now,
      recordCompletion: completion,
    });

    expect(prisma.cooldown.create).toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: { coins: { increment: 75 } },
      })
    );
    expect(completion).toHaveBeenCalledWith({ userId: "user-1", prisma: prisma as any, completedAt: now });
    expect((interaction.reply as any).mock.calls[0][0].content).toContain("Daily quest claimed!");
  });

  it("blocks when cooldown is active", async () => {
    const interaction = makeInteraction();
    prisma.cooldown.findFirst.mockResolvedValue({ id: "cd-1", readyAt: new Date(now.getTime() + 60 * 60 * 1000) });

    await handleDailyClaim(interaction, { prisma: prisma as any, now });

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect((interaction.reply as any).mock.calls[0][0].content).toMatch(/Try again/);
  });
});