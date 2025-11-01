import type { PrismaClient, Encounter } from "@prisma/client";

import {
  prisma as prismaClient,
  recordDailyQuestCompletion,
  type BattleWithPlayers,
  type DailyQuestStreakStatus,
} from "../../models/index.js";
import { log } from "../../shared/log.js";

import { getOrHydrate, evict, type CacheHydrateContext } from "./facade.js";

const BATTLE_NAMESPACE = "battle-state";
const ENCOUNTER_NAMESPACE = "encounter-state";
const QUEST_NAMESPACE = "quest-reward";

const DEFAULT_BATTLE_TTL_MS = 15_000;
const DEFAULT_ENCOUNTER_TTL_MS = 5_000;
const DEFAULT_QUEST_TTL_MS = 1_000;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_STARTER_COINS = 500;

type PrismaLike = PrismaClient;

type ErrMeta = { message: string; name?: string };

type BattleCacheValue = BattleWithPlayers | null;
type EncounterCacheValue = Encounter | null;

export type QuestClaimSuccess = {
  kind: "awarded";
  rewardCoins: number;
  balance: number;
  streak: DailyQuestStreakStatus | null;
  readyAt: string;
  grantedAt: string;
};

export type QuestClaimCooldown = {
  kind: "cooldown";
  streak: DailyQuestStreakStatus | null;
  readyAt: string;
  grantedAt: string;
};

export type QuestClaimResult = QuestClaimSuccess | QuestClaimCooldown;

export type QuestClaimContext = {
  discordId: string;
  prisma?: PrismaLike;
  rewardCoins?: number;
  now?: Date;
  recordCompletion?: typeof recordDailyQuestCompletion;
};

function meta(namespace: string, key: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return { namespace, key, ...(extra ?? {}) };
}

function normalizeError(err: unknown): ErrMeta {
  if (err instanceof Error) {
    return { message: err.message, name: err.name };
  }
  return { message: String(err) };
}

function reviveDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed;
    }
  }
  return new Date();
}

function reviveBattle(value: BattleCacheValue): BattleCacheValue {
  if (!value) return null;
  return {
    ...value,
    startedAt: reviveDate(value.startedAt),
    endedAt: value.endedAt ? reviveDate(value.endedAt) : value.endedAt,
    updatedAt: reviveDate(value.updatedAt),
    p1: {
      ...value.p1,
      createdAt: reviveDate(value.p1.createdAt),
      updatedAt: reviveDate(value.p1.updatedAt),
    },
    p2: {
      ...value.p2,
      createdAt: reviveDate(value.p2.createdAt),
      updatedAt: reviveDate(value.p2.updatedAt),
    },
  };
}

function reviveEncounter(value: EncounterCacheValue): EncounterCacheValue {
  if (!value) return null;
  return {
    ...value,
    startedAt: reviveDate(value.startedAt),
    expiresAt: value.expiresAt ? reviveDate(value.expiresAt) : value.expiresAt,
  };
}

function reviveQuest(result: QuestClaimResult): QuestClaimResult {
  return {
    ...result,
    readyAt: reviveDate(result.readyAt).toISOString(),
    grantedAt: reviveDate(result.grantedAt).toISOString(),
  };
}

export async function loadBattleState(
  battleId: string,
  opts: { prisma?: PrismaLike; ttlMs?: number } = {}
): Promise<BattleWithPlayers | null> {
  const prisma = opts.prisma ?? prismaClient;
  const ttlMs = opts.ttlMs ?? DEFAULT_BATTLE_TTL_MS;
  const descriptor = { namespace: BATTLE_NAMESPACE, key: battleId } as const;

  const hydrate = async ({ lastValue }: CacheHydrateContext<BattleCacheValue>): Promise<BattleCacheValue> => {
    if (lastValue) {
      log.debug("cache.stale", meta(BATTLE_NAMESPACE, battleId, { reason: "battle-state" }));
    }
    const record = (await prisma.battle.findUnique({
      where: { id: battleId },
      include: { p1: true, p2: true },
    })) as BattleWithPlayers | null;
    log.debug("cache.recover", meta(BATTLE_NAMESPACE, battleId, { source: "prisma", hit: Boolean(record) }));
    return record;
  };

  try {
    const value = await getOrHydrate({ ...descriptor, ttlMs }, hydrate);
    return reviveBattle(value);
  } catch (err) {
    log.warn("cache.recover", meta(BATTLE_NAMESPACE, battleId, { recovery: "direct", err: normalizeError(err) }));
    const fallback = (await prisma.battle.findUnique({
      where: { id: battleId },
      include: { p1: true, p2: true },
    })) as BattleWithPlayers | null;
    return reviveBattle(fallback);
  }
}

export async function invalidateBattleState(battleId: string): Promise<void> {
  await evict({ namespace: BATTLE_NAMESPACE, key: battleId });
}

export async function loadEncounter(
  encounterId: string,
  opts: { prisma?: PrismaLike; ttlMs?: number } = {}
): Promise<Encounter | null> {
  const prisma = opts.prisma ?? prismaClient;
  const ttlMs = opts.ttlMs ?? DEFAULT_ENCOUNTER_TTL_MS;
  const descriptor = { namespace: ENCOUNTER_NAMESPACE, key: encounterId } as const;

  const hydrate = async ({ lastValue }: CacheHydrateContext<EncounterCacheValue>): Promise<EncounterCacheValue> => {
    if (lastValue) {
      log.debug("cache.stale", meta(ENCOUNTER_NAMESPACE, encounterId, { reason: "encounter-state" }));
    }
    const record = (await prisma.encounter.findUnique({ where: { id: encounterId } })) as Encounter | null;
    log.debug("cache.recover", meta(ENCOUNTER_NAMESPACE, encounterId, { source: "prisma", hit: Boolean(record) }));
    return record;
  };

  try {
    const value = await getOrHydrate({ ...descriptor, ttlMs }, hydrate);
    return reviveEncounter(value);
  } catch (err) {
    log.warn("cache.recover", meta(ENCOUNTER_NAMESPACE, encounterId, { recovery: "direct", err: normalizeError(err) }));
    const fallback = (await prisma.encounter.findUnique({ where: { id: encounterId } })) as Encounter | null;
    return reviveEncounter(fallback);
  }
}

export async function invalidateEncounter(encounterId: string): Promise<void> {
  await evict({ namespace: ENCOUNTER_NAMESPACE, key: encounterId });
}

async function ensureTrainer(prisma: PrismaLike, discordId: string) {
  const existing = await prisma.user.findUnique({ where: { discordId }, select: { id: true, coins: true } });
  if (existing) return existing;
  return prisma.user.create({
    data: { discordId, coins: DEFAULT_STARTER_COINS },
    select: { id: true, coins: true },
  });
}

type CooldownRecord = { id: string; readyAt: Date } | null;

async function getCooldown(prisma: PrismaLike, userId: string): Promise<CooldownRecord> {
  return prisma.cooldown.findFirst({
    where: { ownerId: userId, kind: "daily-quest" },
    select: { id: true, readyAt: true },
  });
}

async function saveCooldown(prisma: PrismaLike, userId: string, cooldown: CooldownRecord, readyAt: Date) {
  if (cooldown) {
    await prisma.cooldown.update({ where: { id: cooldown.id }, data: { readyAt } });
    return;
  }
  await prisma.cooldown.create({ data: { ownerId: userId, kind: "daily-quest", readyAt } });
}

export async function claimDailyQuestReward(context: QuestClaimContext): Promise<QuestClaimResult> {
  const prisma = context.prisma ?? prismaClient;
  const rewardCoins = typeof context.rewardCoins === "number" && context.rewardCoins > 0 ? context.rewardCoins : 100;
  const now = context.now instanceof Date ? context.now : new Date();
  const recordCompletionFn = context.recordCompletion ?? recordDailyQuestCompletion;

  const descriptor = { namespace: QUEST_NAMESPACE, key: context.discordId } as const;

  const performClaim = async (): Promise<QuestClaimResult> => {
    const trainer = await ensureTrainer(prisma, context.discordId);
    const cooldown = await getCooldown(prisma, trainer.id);

    if (cooldown?.readyAt && cooldown.readyAt.getTime() > now.getTime()) {
      return {
        kind: "cooldown",
        streak: null,
        readyAt: cooldown.readyAt.toISOString(),
        grantedAt: now.toISOString(),
      } satisfies QuestClaimCooldown;
    }

    const nextReadyAt = new Date(now.getTime() + DAILY_COOLDOWN_MS);
    const streakState = await recordCompletionFn({ userId: trainer.id, prisma, completedAt: now });
    const updated = await prisma.user.update({
      where: { id: trainer.id },
      data: { coins: { increment: rewardCoins } },
      select: { coins: true },
    });
    await saveCooldown(prisma, trainer.id, cooldown, nextReadyAt);

    const balance = updated?.coins ?? trainer.coins + rewardCoins;

    return {
      kind: "awarded",
      rewardCoins,
      balance,
      streak: streakState,
      readyAt: nextReadyAt.toISOString(),
      grantedAt: now.toISOString(),
    } satisfies QuestClaimSuccess;
  };

  const hydrate = async ({ lastValue }: CacheHydrateContext<QuestClaimResult>): Promise<QuestClaimResult> => {
    if (lastValue) {
      log.debug("cache.stale", meta(QUEST_NAMESPACE, context.discordId, { reason: "quest-reward" }));
    }
    const outcome = await performClaim();
    log.debug("cache.recover", meta(QUEST_NAMESPACE, context.discordId, { outcome: outcome.kind }));
    return outcome;
  };

  try {
    const result = await getOrHydrate({ ...descriptor, ttlMs: DEFAULT_QUEST_TTL_MS }, hydrate);
    return reviveQuest(result);
  } catch (err) {
    log.warn("cache.recover", meta(QUEST_NAMESPACE, context.discordId, { recovery: "direct", err: normalizeError(err) }));
    const fallback = await performClaim();
    return reviveQuest(fallback);
  }
}
