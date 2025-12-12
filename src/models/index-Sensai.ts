// Prisma dual client architecture (PROD + DEV) and repository helpers

import { Prisma } from "../generated/prisma/client.js";
import type { Battle, Cooldown, PrismaClient, User as PrismaUser } from "../generated/prisma/client.js";
import { toEasternString } from "../shared/datetime.js";
import { ensurePrisma, prisma } from "../shared/prisma.js";
import { clamp, toDate, diffInUtcDays } from "../shared/utils/index.js";

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

type PrismaTrainerProfileRecord = {
  userId: string;
  tagline: string | null;
  bio: string | null;
  favoriteSpeciesId: number | null;
  createdAt: Date;
  updatedAt: Date;
  favoriteSpecies?: { id: number; name: string | null; slug: string | null } | null;
};

export type TrainerProfileRecord = {
  tagline: string | null;
  bio: string | null;
  favoriteSpeciesId: number | null;
  favoriteSpeciesName: string | null;
  favoriteSpeciesSlug: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type TrainerProfileStats = {
  totalPokemon: number;
  partyCount: number;
  storageCount: number;
  uniqueSpecies: number;
  shinyCount: number;
  recentCaptures: Array<{
    id: string;
    speciesId: number | null;
    speciesName: string | null;
    nickname: string | null;
    isShiny: boolean;
    capturedAt: Date | null;
  }>;
};

export type TrainerBattleSummary = {
  total: number;
  wins: number;
  losses: number;
  forfeits: number;
  lastOutcome: "win" | "loss" | "forfeit" | "draw" | null;
  lastBattleAt: Date | null;
  recent: Array<{
    id: string;
    outcome: "win" | "loss" | "forfeit" | "draw";
    endedAt: Date | null;
    opponentDiscordId: string | null;
  }>;
};

export type TrainerProfileSummary = {
  user: {
    id: string;
    discordId: string;
    coins: number;
    createdAt: Date | null;
  };
  profile: TrainerProfileRecord;
  stats: TrainerProfileStats;
  battles: TrainerBattleSummary;
  quest: DailyQuestStreakStatus;
  dailyRewardReadyAt: Date | null;
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

export const DMHomeRepo = {
  async loadTrainerHomeSnapshot(
    discordId: string,
    client: PrismaClient = prisma
  ): Promise<TrainerHomeSnapshot> {
    // Optimized: User upsert, then party + cooldowns + box in parallel
    // Before: user → party → (cooldowns + box)  (3 sequential rounds)
    // After: user → (party + cooldowns + box)    (2 rounds, ~50-100ms savings)
    const user = await client.user.upsert({
      where: { discordId },
      update: {},
      create: { discordId, coins: 0 },
    });

    // Fetch party, cooldowns, and box in parallel (all depend on user.id)
    const [party, cooldownsRaw, boxRaw] = await Promise.all([
      client.party.upsert({
        where: { ownerId: user.id },
        update: {},
        create: { ownerId: user.id },
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
      }),
      client.cooldown.findMany({
        where: { ownerId: user.id },
        select: { id: true, kind: true, readyAt: true },
        orderBy: { readyAt: "desc" },
      }),
      // Box query: Find all Pokemon owned by user that aren't in any party
      // Note: We can't filter by specific party.id yet since party query is still pending
      // Solution: Fetch all non-party Pokemon, will be filtered correctly since party upsert
      // ensures party exists before this query resolves
      client.pokemonInstance.findMany({
        where: {
          ownerId: user.id,
          partySlots: { none: {} },  // Simplified: no Pokemon in ANY party (safe because user has max 1 party)
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

type TrainerProfileDelegate = {
  upsert(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  findUnique(args: unknown): Promise<unknown>;
};

function getTrainerProfileDelegate(client: PrismaClient): TrainerProfileDelegate {
  const delegate = (client as unknown as { trainerProfile?: TrainerProfileDelegate }).trainerProfile;
  if (!delegate) {
    throw new Error("TrainerProfile delegate unavailable. Run `npx prisma generate` to refresh types.");
  }
  return delegate;
}

type PokemonOutline = {
  id: string;
  speciesId: number | null;
  speciesName: string | null;
  nickname: string | null;
  isShiny: boolean;
  inParty: boolean;
  createdAt: Date | null;
};

function summarizePokemonRecords(records: PokemonOutline[]): TrainerProfileStats {
  const total = records.length;
  const partyCount = records.filter((record) => record.inParty).length;
  const storageCount = total - partyCount;
  const speciesIds = new Set(records.map((record) => record.speciesId).filter((id): id is number => typeof id === "number"));
  const shinyCount = records.filter((record) => record.isShiny).length;
  const recent = records
    .slice()
    .sort((a, b) => {
      const aTime = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const bTime = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 3)
    .map((record) => ({
      id: record.id,
      speciesId: record.speciesId,
      speciesName: record.speciesName,
      nickname: record.nickname,
      isShiny: record.isShiny,
      capturedAt: record.createdAt,
    }));

  return {
    totalPokemon: total,
    partyCount,
    storageCount,
    uniqueSpecies: speciesIds.size,
    shinyCount,
    recentCaptures: recent,
  } satisfies TrainerProfileStats;
}

type ParsedBattleResult = {
  winnerUserId: string | null;
  loserUserId: string | null;
  winnerDiscordId: string | null;
  loserDiscordId: string | null;
  reason: string | null;
};

function parseBattleResult(result: Prisma.JsonValue | null | undefined): ParsedBattleResult {
  if (!result || typeof result !== "object" || result === null) {
    return {
      winnerUserId: null,
      loserUserId: null,
      winnerDiscordId: null,
      loserDiscordId: null,
      reason: null,
    } satisfies ParsedBattleResult;
  }
  const container = result as Record<string, unknown>;
  const winner = typeof container.winner === "object" && container.winner !== null ? (container.winner as Record<string, unknown>) : null;
  const loser = typeof container.loser === "object" && container.loser !== null ? (container.loser as Record<string, unknown>) : null;
  return {
    winnerUserId: typeof winner?.userId === "string" ? winner.userId : null,
    loserUserId: typeof loser?.userId === "string" ? loser.userId : null,
    winnerDiscordId: typeof winner?.discordId === "string" ? winner.discordId : null,
    loserDiscordId: typeof loser?.discordId === "string" ? loser.discordId : null,
    reason: typeof container.reason === "string" ? container.reason : null,
  } satisfies ParsedBattleResult;
}

function determineBattleOutcome(userId: string, parsed: ParsedBattleResult): "win" | "loss" | "forfeit" | "draw" {
  if (parsed.winnerUserId === userId) {
    return "win";
  }
  if (parsed.loserUserId === userId) {
    return parsed.reason === "forfeit" ? "forfeit" : "loss";
  }
  return "draw";
}

type BattleRecord = {
  id: string;
  endedAt: Date | null;
  resultJson: Prisma.JsonValue | null;
};

function summarizeBattleRecords(records: BattleRecord[], userId: string): TrainerBattleSummary {
  const summary: TrainerBattleSummary = {
    total: records.length,
    wins: 0,
    losses: 0,
    forfeits: 0,
    lastOutcome: null,
    lastBattleAt: null,
    recent: [],
  };

  for (const record of records) {
    const parsed = parseBattleResult(record.resultJson);
    const outcome = determineBattleOutcome(userId, parsed);
    if (!summary.lastOutcome) {
      summary.lastOutcome = outcome;
      summary.lastBattleAt = record.endedAt ?? null;
    }
    switch (outcome) {
      case "win":
        summary.wins += 1;
        break;
      case "loss":
        summary.losses += 1;
        break;
      case "forfeit":
        summary.losses += 1;
        summary.forfeits += 1;
        break;
      default:
        break;
    }
    if (summary.recent.length < 3) {
      const opponentDiscordId = outcome === "win" ? parsed.loserDiscordId : parsed.winnerDiscordId;
      summary.recent.push({
        id: record.id,
        outcome,
        endedAt: record.endedAt ?? null,
        opponentDiscordId: opponentDiscordId ?? null,
      });
    }
  }

  return summary;
}

function mapTrainerProfileRecord(profile: PrismaTrainerProfileRecord | null | undefined): TrainerProfileRecord {
  if (!profile) {
    return {
      tagline: null,
      bio: null,
      favoriteSpeciesId: null,
      favoriteSpeciesName: null,
      favoriteSpeciesSlug: null,
      createdAt: null,
      updatedAt: null,
    } satisfies TrainerProfileRecord;
  }
  return {
    tagline: profile.tagline ?? null,
    bio: profile.bio ?? null,
    favoriteSpeciesId: typeof profile.favoriteSpeciesId === "number" ? profile.favoriteSpeciesId : null,
    favoriteSpeciesName: typeof profile.favoriteSpecies?.name === "string" ? profile.favoriteSpecies?.name ?? null : null,
    favoriteSpeciesSlug: typeof profile.favoriteSpecies?.slug === "string" ? profile.favoriteSpecies?.slug ?? null : null,
    createdAt: profile.createdAt instanceof Date ? profile.createdAt : null,
    updatedAt: profile.updatedAt instanceof Date ? profile.updatedAt : null,
  } satisfies TrainerProfileRecord;
}

async function ensureTrainerProfile(
  discordId: string,
  client: PrismaClient = prisma
): Promise<{ user: PrismaUser; profile: PrismaTrainerProfileRecord }> {
  const user = await UserRepo.upsertByDiscordId(discordId, client);
  const delegate = getTrainerProfileDelegate(client);
  const profile = (await delegate.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
    include: { favoriteSpecies: { select: { id: true, name: true, slug: true } } },
  })) as PrismaTrainerProfileRecord;
  return { user, profile };
}

async function fetchTrainerPokemon(client: PrismaClient, userId: string): Promise<PokemonOutline[]> {
  const records = await client.pokemonInstance.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      speciesId: true,
      nickname: true,
      isShiny: true,
      createdAt: true,
      species: { select: { name: true } },
      partySlots: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return records.map((record) => ({
    id: record.id,
    speciesId: typeof record.speciesId === "number" ? record.speciesId : null,
    speciesName: typeof record.species?.name === "string" ? record.species.name : null,
    nickname: record.nickname ?? null,
    isShiny: Boolean(record.isShiny),
    inParty: Array.isArray(record.partySlots) && record.partySlots.length > 0,
    createdAt: record.createdAt instanceof Date ? record.createdAt : null,
  }));
}

async function fetchTrainerBattles(client: PrismaClient, userId: string): Promise<BattleRecord[]> {
  const battles = await client.battle.findMany({
    where: {
      state: "Finished",
      OR: [{ p1Id: userId }, { p2Id: userId }],
    },
    select: { id: true, resultJson: true, endedAt: true },
    orderBy: { endedAt: "desc" },
    take: 10,
  });
  return battles.map((battle) => ({
    id: battle.id,
    resultJson: battle.resultJson ?? null,
    endedAt: battle.endedAt instanceof Date ? battle.endedAt : null,
  }));
}

async function fetchDailyRewardCooldown(client: PrismaClient, userId: string): Promise<Date | null> {
  const record = await client.cooldown.findFirst({
    where: { ownerId: userId, kind: { in: ["daily", "daily-quest"] } },
    orderBy: { readyAt: "desc" },
  });
  return record?.readyAt ?? null;
}

export async function loadTrainerProfileSummary(
  discordId: string,
  client: PrismaClient = prisma
): Promise<TrainerProfileSummary> {
  const { user, profile } = await ensureTrainerProfile(discordId, client);
  const [pokemon, battles, cooldownReadyAt] = await Promise.all([
    fetchTrainerPokemon(client, user.id),
    fetchTrainerBattles(client, user.id),
    fetchDailyRewardCooldown(client, user.id),
  ]);

  const stats = summarizePokemonRecords(pokemon);
  const battleSummary = summarizeBattleRecords(battles, user.id);
  const quest = evaluateDailyQuestStreak({
    streak: user.dailyQuestStreak,
    lastCompleted: user.dailyQuestLastCompleted,
    lastReset: user.dailyQuestLastReset,
  });

  return {
    user: {
      id: user.id,
      discordId: user.discordId,
      coins: user.coins,
      createdAt: user.createdAt,
    },
    profile: mapTrainerProfileRecord(profile),
    stats,
    battles: battleSummary,
    quest,
    dailyRewardReadyAt: cooldownReadyAt,
  } satisfies TrainerProfileSummary;
}

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
  return clamp(turnCount, 0, 40);
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
      message: `On a ${streak}-day streak! Next quest unlocks ${toEasternString(nextDue)}.`,
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
