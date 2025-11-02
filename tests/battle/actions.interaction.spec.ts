import type { ButtonInteraction } from "discord.js";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  prisma: {},
  ensurePrisma: vi.fn(),
}));

vi.mock("../../src/shared/prisma.js", () => prismaMock);

vi.mock("../../src/shared/config.js", () => {
  const runtimeConfig = {
    nodeEnv: "test",
    serviceName: "test-service",
    databaseUrl: "prisma://accelerate.invalid/placeholder",
    databaseConnectionMode: "auto",
    databaseUrlSource: "accelerate",
    databaseCandidates: [],
    databasePreferenceSource: null,
    redisUrl: null,
    cacheTtlMs: 60_000,
    backupStorage: { provider: "none", prefix: "outbox" },
  } as const;
  return {
    loadConfig: () => runtimeConfig,
    config: runtimeConfig,
    recordDatabaseConnectionSuccess: vi.fn(),
    resetConfigCacheForTests: vi.fn(),
  };
});

type BattleActionsModule = typeof import("../../src/bot/battle/actions.js");
let handleBattleActionButton: BattleActionsModule["handleBattleActionButton"];
let MOVE_PREFIX: BattleActionsModule["MOVE_PREFIX"];
let SWITCH_PREFIX: BattleActionsModule["SWITCH_PREFIX"];

import * as cacheRecipes from "../../src/services/cache/recipes.js";
import { __testing as turnTesting } from "../../src/core/battle/turn-manager.js";

beforeAll(async () => {
  const mod = await import("../../src/bot/battle/actions.js");
  handleBattleActionButton = mod.handleBattleActionButton;
  MOVE_PREFIX = mod.MOVE_PREFIX;
  SWITCH_PREFIX = mod.SWITCH_PREFIX;
});

type MockPrisma = {
  party: {
    findUnique: ReturnType<typeof vi.fn>;
  };
};

function buildPokemon(overrides: Record<string, unknown>) {
  return {
    id: overrides.id ?? `pkm-${Math.random().toString(36).slice(2, 8)}`,
    nickname: "",
    level: 10,
    speciesId: 1,
    hp: 20,
    maxHp: 20,
    movesJson: [
      { id: "tackle", name: "Tackle", pp: 35, maxPP: 35 },
      { id: "ember", name: "Ember", pp: 25, maxPP: 25 },
    ],
    ...overrides,
  } satisfies Record<string, unknown>;
}

function buildPrisma(parties: Record<string, any>): MockPrisma {
  return {
    party: {
      findUnique: vi.fn(async ({ where }: { where: { ownerId: string } }) => parties[where.ownerId] ?? null),
    },
  } satisfies MockPrisma;
}

function createInteraction(config: {
  customId: string;
  userId: string;
  selectId: string;
  selection: string;
}) {
  const replies: any[] = [];
  const reply = vi.fn(async (payload: any) => {
    replies.push(payload);
    return { awaitMessageComponent };
  });
  const followUps: any[] = [];
  const followUp = vi.fn(async (payload: any) => {
    followUps.push(payload);
  });
  const updates: any[] = [];
  const update = vi.fn(async (payload: any) => {
    updates.push(payload);
  });
  const edits: any[] = [];
  const editReply = vi.fn(async (payload: any) => {
    edits.push(payload);
  });
  const awaitMessageComponent = vi.fn(async () => ({
    values: [config.selection],
    customId: config.selectId,
    user: { id: config.userId },
    update,
  }));
  const client = { users: { fetch: vi.fn(async () => ({ createDM: vi.fn() })) } } as any;

  const interaction = {
    customId: config.customId,
    user: { id: config.userId },
    reply,
    followUp,
    awaitMessageComponent,
    editReply,
    client,
  } as unknown as ButtonInteraction;

  return { interaction, replies, updates, followUps, edits, awaitMessageComponent };
}

describe("handleBattleActionButton interactions", () => {
  const battle = {
    id: "battle-1",
    state: "Active",
    p1: { id: "p1", discordId: "trainer-1" },
    p2: { id: "p2", discordId: "trainer-2" },
  };

  beforeEach(() => {
    turnTesting.clear();
    vi.restoreAllMocks();
  });

  it("surfaces move choices and queues the action", async () => {
    const p1Active = buildPokemon({ id: "pkm-1", nickname: "Blaze" });
    const p1Bench = buildPokemon({ id: "pkm-2", nickname: "Leaf", hp: 18, maxHp: 22 });
    const p2Active = buildPokemon({ id: "pkm-3", nickname: "Splash" });

    const prisma = buildPrisma({
      p1: { slots: [{ slot: 1, pokemon: p1Active }, { slot: 2, pokemon: p1Bench }] },
      p2: { slots: [{ slot: 1, pokemon: p2Active }] },
    });

    vi.spyOn(cacheRecipes, "loadBattleState").mockResolvedValue(battle as any);
    const invalidateSpy = vi.spyOn(cacheRecipes, "invalidateBattleState").mockResolvedValue();

    const dmDispatcher = vi.fn().mockResolvedValue(undefined);

    const { interaction, replies, updates } = createInteraction({
      customId: `${MOVE_PREFIX}${battle.id}`,
      userId: "trainer-1",
      selectId: `${MOVE_PREFIX}SELECT_${battle.id}`,
      selection: "ember",
    });

    await handleBattleActionButton(interaction, { prisma: prisma as any, openActionDmHandler: dmDispatcher });

    expect(replies[0]?.ephemeral).toBe(true);
    const row = replies[0]?.components?.[0];
    expect(typeof row?.toJSON).toBe("function");
    const json = row.toJSON();
    expect(json.components[0].options.map((opt: any) => opt.value)).toContain("ember");
    expect(updates).toHaveLength(1);

    const runtime = turnTesting.getRuntime(battle.id);
    expect(runtime?.pending?.p1?.type).toBe("move");
    expect(dmDispatcher).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("advances the turn and re-prompts once both players choose moves", async () => {
    const p1Active = buildPokemon({ id: "pkm-1", nickname: "Blaze" });
    const p2Active = buildPokemon({
      id: "pkm-3",
      nickname: "Aqua",
      movesJson: [
        { id: "splash", name: "Splash", pp: 40, maxPP: 40 },
        { id: "water-gun", name: "Water Gun", pp: 25, maxPP: 25 },
      ],
    });

    const prisma = buildPrisma({
      p1: { slots: [{ slot: 1, pokemon: p1Active }] },
      p2: { slots: [{ slot: 1, pokemon: p2Active }] },
    });

    vi.spyOn(cacheRecipes, "loadBattleState").mockResolvedValue(battle as any);
    const invalidateSpy = vi.spyOn(cacheRecipes, "invalidateBattleState").mockResolvedValue();
    const dmDispatcher = vi.fn().mockResolvedValue(undefined);

    const interactionP1 = createInteraction({
      customId: `${MOVE_PREFIX}${battle.id}`,
      userId: "trainer-1",
      selectId: `${MOVE_PREFIX}SELECT_${battle.id}`,
      selection: "ember",
    });
    await handleBattleActionButton(interactionP1.interaction, {
      prisma: prisma as any,
      openActionDmHandler: dmDispatcher,
    });

    const interactionP2 = createInteraction({
      customId: `${MOVE_PREFIX}${battle.id}`,
      userId: "trainer-2",
      selectId: `${MOVE_PREFIX}SELECT_${battle.id}`,
      selection: "water-gun",
    });
    await handleBattleActionButton(interactionP2.interaction, {
      prisma: prisma as any,
      openActionDmHandler: dmDispatcher,
    });

    expect(dmDispatcher).toHaveBeenCalledWith(battle.id, expect.any(Function));
    expect(invalidateSpy).toHaveBeenCalled();
    const runtime = turnTesting.getRuntime(battle.id);
    expect(runtime?.history?.length).toBeGreaterThan(0);
  });

  it("lists healthy switch targets and queues the swap", async () => {
    const p1Active = buildPokemon({ id: "pkm-1", nickname: "Blaze" });
    const healthyBench = buildPokemon({ id: "pkm-2", nickname: "Leaf", hp: 18, maxHp: 22 });
    const faintedBench = buildPokemon({ id: "pkm-4", nickname: "Fainted", hp: 0, maxHp: 20 });

    const prisma = buildPrisma({
      p1: {
        slots: [
          { slot: 1, pokemon: p1Active },
          { slot: 2, pokemon: healthyBench },
          { slot: 3, pokemon: faintedBench },
        ],
      },
      p2: { slots: [{ slot: 1, pokemon: buildPokemon({ id: "pkm-3" }) }] },
    });

    vi.spyOn(cacheRecipes, "loadBattleState").mockResolvedValue(battle as any);
    const invalidateSpy = vi.spyOn(cacheRecipes, "invalidateBattleState").mockResolvedValue();

    const dmDispatcher = vi.fn().mockResolvedValue(undefined);

    const { interaction, replies } = createInteraction({
      customId: `${SWITCH_PREFIX}${battle.id}`,
      userId: "trainer-1",
      selectId: `${SWITCH_PREFIX}SELECT_${battle.id}`,
      selection: "pkm-2",
    });

    await handleBattleActionButton(interaction, { prisma: prisma as any, openActionDmHandler: dmDispatcher });

    const row = replies[0]?.components?.[0];
    const json = row.toJSON();
    const values = json.components[0].options.map((opt: any) => opt.value);
    expect(values).toContain("pkm-2");
    expect(values).not.toContain("pkm-4");

    const runtime = turnTesting.getRuntime(battle.id);
    expect(runtime?.pending?.p1?.type).toBe("switch");
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
