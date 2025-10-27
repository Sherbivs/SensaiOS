import { describe, it, expect, vi, beforeEach } from "vitest";

type OpsModule = typeof import("../src/bot/ops/admin.ts");

async function loadOpsModule(): Promise<OpsModule> {
  vi.resetModules();
  return import("../src/bot/ops/admin.ts");
}

type Interaction = {
  options: any;
  member: any;
  user: { id: string };
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
};

function createInteraction(): Interaction {
  const options = {
    getSubcommand: vi.fn(() => "stats"),
    getSubcommandGroup: vi.fn(() => null),
    getInteger: vi.fn(() => null),
    getString: vi.fn(() => null),
  };

  return {
    options,
    member: { permissions: { has: vi.fn(() => true) } },
    user: { id: "42" },
    deferReply: vi.fn(() => Promise.resolve()),
    editReply: vi.fn(() => Promise.resolve()),
    reply: vi.fn(() => Promise.resolve()),
  };
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://render.example/db";
  process.env.NODE_ENV = "development";
  process.env.SERVICE_NAME = "ops-test";
});

describe("/ops stats", () => {
  it("reports runtime diagnostics when database is unavailable", async () => {
    const { handleOpsCommand } = await loadOpsModule();
    const interaction = createInteraction();
    await handleOpsCommand(interaction as any, {
      prismaFactory: async () => null,
    });

    expect(interaction.deferReply).toHaveBeenCalled();
    const message = interaction.editReply.mock.calls[0][0].content as string;
    expect(message).toContain("Runtime:");
    expect(message).toContain("Database:");
    expect(message).toContain("Cache:");
    expect(message).toContain("Outbox:");
    expect(message).toContain("Pending: n/a");
  });

  it("includes outbox stats when database is connected", async () => {
    const { handleOpsCommand } = await loadOpsModule();
    const interaction = createInteraction();
    const processedAt = new Date("2025-10-26T00:00:00Z");

    const prisma = {
      user: { count: vi.fn(() => Promise.resolve(10)) },
      encounter: { count: vi.fn(() => Promise.resolve(2)) },
      battle: {
        count: vi
          .fn(() => Promise.resolve(0))
          .mockImplementationOnce(() => Promise.resolve(1))
          .mockImplementationOnce(() => Promise.resolve(3)),
        findMany: vi.fn(() =>
          Promise.resolve([
            {
              id: "battle-1",
              endedAt: processedAt,
              resultJson: JSON.stringify({
                winner: { discordId: "111" },
                loser: { discordId: "222" },
                rewards: { winner: 50, loser: 25 },
                reason: "victory",
                turnCount: 12,
              }),
              p1: { discordId: "111" },
              p2: { discordId: "222" },
            },
          ]),
        ),
      },
      cooldown: { count: vi.fn(() => Promise.resolve(4)) },
      outboxMessage: {
        count: vi.fn(() => Promise.resolve(2)),
        findFirst: vi.fn(() => Promise.resolve({ processedAt })),
      },
      $disconnect: vi.fn(() => Promise.resolve()),
    };

    await handleOpsCommand(interaction as any, {
      prismaFactory: async () => prisma as any,
    });

    const message = interaction.editReply.mock.calls[0][0].content as string;
    expect(message).toContain("Pending: 2");
    expect(message).toContain("Last processed: 2025-10-26T00:00:00.000Z");
    expect(message).toContain("battle-1");
  });
});
