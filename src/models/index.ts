// Prisma client singleton and simple repository helpers

import { Prisma } from "@prisma/client";
import type { Battle, Cooldown, PrismaClient, User as PrismaUser } from "@prisma/client";

import { ensurePrisma, prisma } from "../shared/prisma.js";

export async function initPrisma(): Promise<void> {
  await ensurePrisma();
}

export { prisma };

// Example: lightweight repo helpers (expand later)
export const UserRepo = {
  upsertByDiscordId: async (discordId: string, client: PrismaClient = prisma) =>
    client.user.upsert({
      where: { discordId },
      update: {},
      create: { discordId, coins: 0 },
    }),
};

export type TrainerCooldown = Pick<Cooldown, "id" | "kind" | "readyAt">;

export type TrainerHomePokemon = {
  id: string;
  speciesId: number | null;
  speciesName: string | null;
  nickname: string | null;
  level: number | null;
  hp: number | null;
  maxHp: number | null;
  isShiny: boolean;
  status: string | null;
  boxSlot: number | null;
  createdAt: Date | null;
};

export type TrainerPartySlot = {
  slot: number;
  pokemon: TrainerHomePokemon | null;
};

export type TrainerHomeSnapshot = {
  user: Pick<PrismaUser, "id" | "discordId" | "coins" | "dailyQuestStreak" | "dailyQuestLastCompleted" | "dailyQuestLastReset" | "createdAt">;
  party: TrainerPartySlot[];
  box: TrainerHomePokemon[];
  cooldowns: TrainerCooldown[];
};

const POKEMON_SUMMARY_SELECT = {
  id: true,
  speciesId: true,
  nickname: true,
  level: true,
  hp: true,
  maxHp: true,
  isShiny: true,
  status: true,
  boxSlot: true,
  createdAt: true,
  species: {
    select: {
      name: true,
    },
  },
} satisfies Prisma.PokemonInstanceSelect;

type PokemonSummary = Prisma.PokemonInstanceGetPayload<{ select: typeof POKEMON_SUMMARY_SELECT }>;

function mapPokemonSummary(mon: PokemonSummary | null): TrainerHomePokemon | null {
  if (!mon) return null;
  return {
    id: mon.id,
    speciesId: typeof mon.speciesId === "number" ? mon.speciesId : null,
    speciesName: typeof mon.species?.name === "string" ? mon.species.name : null,
    nickname: mon.nickname ?? null,
    level: typeof mon.level === "number" ? mon.level : null,
    hp: typeof mon.hp === "number" ? mon.hp : null,
    maxHp: typeof mon.maxHp === "number" ? mon.maxHp : null,
    isShiny: Boolean(mon.isShiny),
    status: mon.status ?? null,
    boxSlot: typeof mon.boxSlot === "number" ? mon.boxSlot : null,
    createdAt: mon.createdAt instanceof Date && !Number.isNaN(mon.createdAt.valueOf()) ? mon.createdAt : null,
  } satisfies TrainerHomePokemon;
}

async function ensurePrimaryParty(ownerId: string, client: PrismaClient = prisma) {
  return client.party.upsert({
    where: { ownerId },
    update: {},
    create: { ownerId },
    include: {
      slots: {
        include: {
          pokemon: {
            select: POKEMON_SUMMARY_SELECT,
          },
        },
        orderBy: { slot: "asc" },
      },
    },
  });
}

export const DMHomeRepo = {
  async loadTrainerHomeSnapshot(
    discordId: string,
    client: PrismaClient = prisma
  ): Promise<TrainerHomeSnapshot> {
    const user = await UserRepo.upsertByDiscordId(discordId, client);

    const party = await ensurePrimaryParty(user.id, client);

    const [cooldownsRaw, boxRaw] = await Promise.all([
      client.cooldown.findMany({
        where: { ownerId: user.id },
        select: { id: true, kind: true, readyAt: true },
        orderBy: { readyAt: "desc" },
      }),
      client.pokemonInstance.findMany({
        where: {
          ownerId: user.id,
          partySlots: party?.id ? { none: { partyId: party.id } } : undefined,
        },
        select: POKEMON_SUMMARY_SELECT,
        orderBy: [
          { boxSlot: "asc" as const },
          { createdAt: "asc" as const },
        ],
      }),
    ]);

    const box = boxRaw
      .map((instance) => mapPokemonSummary(instance))
      .filter((instance): instance is TrainerHomePokemon => Boolean(instance));

    const partySlots: TrainerPartySlot[] = (party?.slots ?? []).map((slot): TrainerPartySlot => ({
      slot: slot.slot ?? 0,
      pokemon: slot.pokemon ? mapPokemonSummary(slot.pokemon) : null,
    }));

    return {
      user: {
        id: user.id,
        discordId: user.discordId,
        coins: user.coins,
        dailyQuestStreak: user.dailyQuestStreak,
        dailyQuestLastCompleted: user.dailyQuestLastCompleted,
        dailyQuestLastReset: user.dailyQuestLastReset,
        createdAt: user.createdAt,
      },
      party: partySlots,
      box,
      cooldowns: cooldownsRaw.map((cd) => ({ id: cd.id, kind: cd.kind, readyAt: cd.readyAt })),
    } satisfies TrainerHomeSnapshot;
  },
};

type PrismaLike = PrismaClient;
export type BattleWithPlayers = Battle & { p1: PrismaUser; p2: PrismaUser };
export type BattleResultReason = "forfeit" | "victory";

export type BattleResultRecord = {
  battleId: string;
  reason: BattleResultReason;
  turnCount: number;
  rewards: { winner: number; loser: number };
  winner: { userId: string; discordId: string };
  loser: { userId: string; discordId: string };
};

const DEFAULT_REWARDS = Object.freeze({ winner: 50, loser: 10 });

function clampTurns(turnCount: number) {
  if (!Number.isFinite(turnCount)) return 0;
  return Math.max(0, Math.min(Math.floor(turnCount), 40));
}

function describeResultSummary(reason: BattleResultReason) {
  return reason === "forfeit" ? "by forfeit" : "with a decisive victory";
}

function normalizeLogCompact(existing: Prisma.JsonValue, summary: BattleResultRecord): Prisma.JsonObject {
  const base = (typeof existing === "object" && existing !== null ? (existing as Prisma.JsonObject) : {});
  return {
    ...base,
    result: {
      reason: summary.reason,
      turnCount: summary.turnCount,
      rewards: summary.rewards,
      winnerDiscordId: summary.winner.discordId,
      loserDiscordId: summary.loser.discordId,
      note: `${summary.winner.discordId} ${describeResultSummary(summary.reason)} over ${summary.loser.discordId}`,
    },
  } satisfies Prisma.JsonObject;
}

export const BattleRepo = {
  defaultRewards(turnCount: number) {
    const turns = clampTurns(turnCount);
    const winnerBonus = turns * 3;
    const loserBonus = Math.floor(turns / 2) * 2;
    return {
      winner: DEFAULT_REWARDS.winner + winnerBonus,
      loser: DEFAULT_REWARDS.loser + loserBonus,
    };
  },

  async concludeBattle(opts: {
    battle: BattleWithPlayers;
    winner: "p1" | "p2";
    turnCount: number;
    reason: BattleResultReason;
    rewards?: { winner: number; loser: number };
    prisma?: PrismaLike;
    logFull?: string[];
  }): Promise<BattleResultRecord> {
    const client = opts.prisma ?? prisma;
    const winnerUser = opts.winner === "p1" ? opts.battle.p1 : opts.battle.p2;
    const loserUser = opts.winner === "p1" ? opts.battle.p2 : opts.battle.p1;
    const rewards = opts.rewards ?? BattleRepo.defaultRewards(opts.turnCount);

    const result: BattleResultRecord = {
      battleId: opts.battle.id,
      reason: opts.reason,
      turnCount: opts.turnCount,
      rewards,
      winner: { userId: winnerUser.id, discordId: winnerUser.discordId },
      loser: { userId: loserUser.id, discordId: loserUser.discordId },
    };

    const recordedAt = new Date().toISOString();
    const resultJson: Prisma.JsonObject = {
      battleId: result.battleId,
      reason: result.reason,
      turnCount: result.turnCount,
      rewards: result.rewards,
      winner: result.winner,
      loser: result.loser,
      recordedAt,
      winnerDiscordId: result.winner.discordId,
      loserDiscordId: result.loser.discordId,
    } satisfies Prisma.JsonObject;

  const logFull = opts.logFull ?? (opts.battle.logFull as unknown as string[] | undefined);
  const logCompact = normalizeLogCompact(opts.battle.logCompact, result);

    const updates = [
      client.user.update({
        where: { id: winnerUser.id },
        data: { coins: { increment: rewards.winner } },
      }),
      client.user.update({
        where: { id: loserUser.id },
        data: { coins: { increment: rewards.loser } },
      }),
      client.battle.update({
        where: { id: opts.battle.id },
        data: {
          state: "Finished",
          endedAt: new Date(),
          resultJson,
          logCompact,
          logFull: (logFull ? (logFull as Prisma.JsonValue) : Prisma.JsonNull) as Prisma.NullableJsonNullValueInput,
        },
      }),
    ];

    await client.$transaction(updates);

    return result;
  },
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.valueOf()) ? null : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? null : parsed;
  }
  return null;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function diffInUtcDays(a: Date, b: Date): number {
  const startA = startOfUtcDay(a).getTime();
  const startB = startOfUtcDay(b).getTime();
  return Math.floor((startA - startB) / MS_PER_DAY);
}

export type DailyQuestStreakStatus = {
  streak: number;
  status: "fresh" | "locked" | "due" | "reset";
  atRisk: boolean;
  lost: boolean;
  lastCompleted: Date | null;
  lastReset: Date | null;
  nextDue: Date | null;
  daysSinceCompletion: number | null;
  message: string;
};

export type DailyQuestStateInput = {
  streak?: number | null;
  lastCompleted?: Date | string | null;
  lastReset?: Date | string | null;
  now?: Date;
};

export function evaluateDailyQuestStreak(input: DailyQuestStateInput): DailyQuestStreakStatus {
  const streak = Number.isFinite(input?.streak) ? Math.max(0, Math.floor(input?.streak ?? 0)) : 0;
  const lastCompleted = toDate(input?.lastCompleted ?? null);
  const lastReset = toDate(input?.lastReset ?? null);
  const now = input?.now instanceof Date ? input.now : new Date();

  if (!lastCompleted || streak === 0) {
    const message = lastReset
      ? "Your streak reset. Complete today's quest to start a new run."
      : "Complete today's quest to begin your streak.";
    return {
      streak: 0,
      status: lastReset ? "reset" : "fresh",
      atRisk: false,
      lost: Boolean(lastReset),
      lastCompleted: null,
      lastReset,
      nextDue: null,
      daysSinceCompletion: null,
      message,
    };
  }

  const gap = diffInUtcDays(now, lastCompleted);

  if (gap <= 0) {
    const nextDue = new Date(lastCompleted.getTime() + MS_PER_DAY);
    return {
      streak,
      status: "locked",
      atRisk: false,
      lost: false,
      lastCompleted,
      lastReset,
      nextDue,
      daysSinceCompletion: 0,
      message: `On a ${streak}-day streak! Next quest unlocks ${nextDue.toISOString()}.`,
    };
  }

  if (gap === 1) {
    return {
      streak,
      status: "due",
      atRisk: true,
      lost: false,
      lastCompleted,
      lastReset,
      nextDue: null,
      daysSinceCompletion: 1,
      message: `Maintain your ${streak}-day streak by completing today's quest.`,
    };
  }

  return {
    streak: 0,
    status: "reset",
    atRisk: false,
    lost: true,
    lastCompleted,
    lastReset: now,
    nextDue: null,
    daysSinceCompletion: gap,
    message: "Your streak reset after missing a day. Complete today's quest to start over.",
  };
}

export type DailyQuestProjectionInput = {
  previousStreak?: number | null;
  lastCompleted?: Date | string | null;
  completedAt: Date;
};

export type DailyQuestCompletionProjection = {
  newStreak: number;
  reset: boolean;
  repeated: boolean;
  gap: number | null;
};

export function projectDailyQuestCompletion(input: DailyQuestProjectionInput): DailyQuestCompletionProjection {
  const previous = Number.isFinite(input.previousStreak) ? Math.max(0, Math.floor(input.previousStreak ?? 0)) : 0;
  const lastCompleted = toDate(input.lastCompleted ?? null);
  const completedAt = input.completedAt instanceof Date ? input.completedAt : new Date(input.completedAt);
  const safeCompletedAt = Number.isNaN(completedAt.valueOf()) ? new Date() : completedAt;

  if (!lastCompleted || previous === 0) {
    return { newStreak: 1, reset: previous > 0, repeated: false, gap: lastCompleted ? diffInUtcDays(safeCompletedAt, lastCompleted) : null };
  }

  const gap = diffInUtcDays(safeCompletedAt, lastCompleted);
  if (gap <= 0) {
    return { newStreak: previous, reset: false, repeated: true, gap };
  }
  if (gap === 1) {
    return { newStreak: previous + 1, reset: false, repeated: false, gap };
  }
  return { newStreak: 1, reset: true, repeated: false, gap };
}

export type EnsureDailyQuestOptions = {
  trainer: {
    id: string;
    dailyQuestStreak?: number | null;
    dailyQuestLastCompleted?: Date | string | null;
    dailyQuestLastReset?: Date | string | null;
  };
  prisma?: PrismaClient;
  now?: Date;
};

export async function ensureDailyQuestStreakFreshness(options: EnsureDailyQuestOptions) {
  const client = options.prisma ?? prisma;
  const now = options.now instanceof Date ? options.now : new Date();
  const state = evaluateDailyQuestStreak({
    streak: options.trainer.dailyQuestStreak ?? 0,
    lastCompleted: options.trainer.dailyQuestLastCompleted ?? null,
    lastReset: options.trainer.dailyQuestLastReset ?? null,
    now,
  });

  if (!state.lost || (options.trainer.dailyQuestStreak ?? 0) === 0) {
    return { trainer: options.trainer, state, updated: false };
  }

  const updated = await client.user.update({
    where: { id: options.trainer.id },
    data: {
      dailyQuestStreak: 0,
      dailyQuestLastReset: now,
    },
    select: {
      id: true,
      dailyQuestStreak: true,
      dailyQuestLastCompleted: true,
      dailyQuestLastReset: true,
    },
  });

  const merged = {
    ...options.trainer,
    dailyQuestStreak: updated.dailyQuestStreak,
    dailyQuestLastCompleted: updated.dailyQuestLastCompleted,
    dailyQuestLastReset: updated.dailyQuestLastReset,
  };

  const refreshed = evaluateDailyQuestStreak({
    streak: merged.dailyQuestStreak ?? 0,
    lastCompleted: merged.dailyQuestLastCompleted ?? null,
    lastReset: merged.dailyQuestLastReset ?? null,
    now,
  });

  return { trainer: merged, state: refreshed, updated: true };
}

export type RecordDailyQuestOptions = {
  userId?: string;
  discordId?: string;
  completedAt?: Date;
  prisma?: PrismaClient;
};

export async function recordDailyQuestCompletion(options: RecordDailyQuestOptions): Promise<DailyQuestStreakStatus> {
  const client = options.prisma ?? prisma;
  if (!options.userId && !options.discordId) {
    throw new Error("recordDailyQuestCompletion requires userId or discordId");
  }

  const where: Prisma.UserWhereUniqueInput = options.userId ? { id: options.userId } : { discordId: options.discordId! };

  const existing = await client.user.findUnique({
    where,
    select: {
      id: true,
      dailyQuestStreak: true,
      dailyQuestLastCompleted: true,
      dailyQuestLastReset: true,
    },
  });

  if (!existing) {
    throw new Error("Trainer not found for daily quest completion");
  }

  const completedAt = options.completedAt instanceof Date ? options.completedAt : new Date(options.completedAt ?? Date.now());
  const safeCompletedAt = Number.isNaN(completedAt.valueOf()) ? new Date() : completedAt;

  const projection = projectDailyQuestCompletion({
    previousStreak: existing.dailyQuestStreak ?? 0,
    lastCompleted: existing.dailyQuestLastCompleted ?? null,
    completedAt: safeCompletedAt,
  });

  const updateData: Prisma.UserUpdateInput = {
    dailyQuestStreak: projection.newStreak,
    dailyQuestLastCompleted: safeCompletedAt,
  };

  if (projection.reset) {
    updateData.dailyQuestLastReset = safeCompletedAt;
  }

  const updated = await client.user.update({
    where: { id: existing.id },
    data: updateData,
    select: {
      dailyQuestStreak: true,
      dailyQuestLastCompleted: true,
      dailyQuestLastReset: true,
    },
  });

  return evaluateDailyQuestStreak({
    streak: updated.dailyQuestStreak ?? 0,
    lastCompleted: updated.dailyQuestLastCompleted ?? null,
    lastReset: updated.dailyQuestLastReset ?? null,
    now: safeCompletedAt,
  });
}
