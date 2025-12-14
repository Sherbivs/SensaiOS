import { prisma as prismaClient, recordDailyQuestCompletion, loadTrainerProfileSummary, } from "../../models/index.js";
import { log } from "../../shared/log.js";
import { normalizeError } from "../../shared/utils/error-utils.js";
import { getOrHydrate, evict } from "./facade.js";
import { CACHE_CONSTANTS, GAME_CONSTANTS } from "../../shared/constants.js";
const BATTLE_NAMESPACE = "battle-state";
const ENCOUNTER_NAMESPACE = "encounter-state";
const QUEST_NAMESPACE = "quest-reward";
const PROFILE_NAMESPACE = "trainer-profile";
const { DEFAULT_BATTLE_TTL_MS, DEFAULT_ENCOUNTER_TTL_MS, DEFAULT_QUEST_TTL_MS, DEFAULT_PROFILE_TTL_MS, DAILY_COOLDOWN_MS } = CACHE_CONSTANTS;
const { DEFAULT_STARTER_COINS } = GAME_CONSTANTS;
function meta(namespace, key, extra) {
    return { namespace, key, ...(extra ?? {}) };
}
function reviveDate(value) {
    if (value instanceof Date)
        return value;
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.valueOf())) {
            return parsed;
        }
    }
    return new Date();
}
function reviveBattle(value) {
    if (!value)
        return null;
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
function reviveEncounter(value) {
    if (!value)
        return null;
    return {
        ...value,
        startedAt: reviveDate(value.startedAt),
        expiresAt: value.expiresAt ? reviveDate(value.expiresAt) : value.expiresAt,
    };
}
function reviveQuest(result) {
    return {
        ...result,
        readyAt: reviveDate(result.readyAt).toISOString(),
        grantedAt: reviveDate(result.grantedAt).toISOString(),
    };
}
export async function loadBattleState(battleId, opts = {}) {
    const prisma = opts.prisma ?? prismaClient;
    const ttlMs = opts.ttlMs ?? DEFAULT_BATTLE_TTL_MS;
    const descriptor = { namespace: BATTLE_NAMESPACE, key: battleId };
    const hydrate = async ({ lastValue }) => {
        if (lastValue) {
            log.debug("cache.stale", meta(BATTLE_NAMESPACE, battleId, { reason: "battle-state" }));
        }
        const record = (await prisma.battle.findUnique({
            where: { id: battleId },
            include: { p1: true, p2: true },
        }));
        log.debug("cache.recover", meta(BATTLE_NAMESPACE, battleId, { source: "prisma", hit: Boolean(record) }));
        return record;
    };
    try {
        const value = await getOrHydrate({ ...descriptor, ttlMs }, hydrate);
        return reviveBattle(value);
    }
    catch (err) {
        log.warn("cache.recover", meta(BATTLE_NAMESPACE, battleId, { recovery: "direct", err: normalizeError(err) }));
        const fallback = (await prisma.battle.findUnique({
            where: { id: battleId },
            include: { p1: true, p2: true },
        }));
        return reviveBattle(fallback);
    }
}
export async function invalidateBattleState(battleId) {
    await evict({ namespace: BATTLE_NAMESPACE, key: battleId });
}
export async function loadEncounter(encounterId, opts = {}) {
    const prisma = opts.prisma ?? prismaClient;
    const ttlMs = opts.ttlMs ?? DEFAULT_ENCOUNTER_TTL_MS;
    const descriptor = { namespace: ENCOUNTER_NAMESPACE, key: encounterId };
    const hydrate = async ({ lastValue }) => {
        if (lastValue) {
            log.debug("cache.stale", meta(ENCOUNTER_NAMESPACE, encounterId, { reason: "encounter-state" }));
        }
        const record = (await prisma.encounter.findUnique({ where: { id: encounterId } }));
        log.debug("cache.recover", meta(ENCOUNTER_NAMESPACE, encounterId, { source: "prisma", hit: Boolean(record) }));
        return record;
    };
    try {
        const value = await getOrHydrate({ ...descriptor, ttlMs }, hydrate);
        return reviveEncounter(value);
    }
    catch (err) {
        log.warn("cache.recover", meta(ENCOUNTER_NAMESPACE, encounterId, { recovery: "direct", err: normalizeError(err) }));
        const fallback = (await prisma.encounter.findUnique({ where: { id: encounterId } }));
        return reviveEncounter(fallback);
    }
}
export async function invalidateEncounter(encounterId) {
    await evict({ namespace: ENCOUNTER_NAMESPACE, key: encounterId });
}
export async function loadTrainerProfile(discordId, opts = {}) {
    const prisma = opts.prisma ?? prismaClient;
    const ttlMs = typeof opts.ttlMs === "number" && opts.ttlMs > 0 ? opts.ttlMs : DEFAULT_PROFILE_TTL_MS;
    const descriptor = { namespace: PROFILE_NAMESPACE, key: discordId };
    const hydrate = async ({ lastValue }) => {
        if (lastValue) {
            log.debug("cache.stale", meta(PROFILE_NAMESPACE, discordId, { reason: "trainer-profile" }));
        }
        const summary = await loadTrainerProfileSummary(discordId, prisma);
        log.debug("cache.recover", meta(PROFILE_NAMESPACE, discordId, { source: "prisma", hit: Boolean(summary) }));
        return summary;
    };
    try {
        return await getOrHydrate({ ...descriptor, ttlMs }, hydrate);
    }
    catch (err) {
        log.warn("cache.recover", meta(PROFILE_NAMESPACE, discordId, { recovery: "direct", err: normalizeError(err) }));
        return loadTrainerProfileSummary(discordId, prisma);
    }
}
export async function invalidateTrainerProfile(discordId) {
    await evict({ namespace: PROFILE_NAMESPACE, key: discordId });
}
async function ensureTrainer(prisma, discordId) {
    const existing = await prisma.user.findUnique({ where: { discordId }, select: { id: true, coins: true } });
    if (existing)
        return existing;
    return prisma.user.create({
        data: { discordId, coins: DEFAULT_STARTER_COINS },
        select: { id: true, coins: true },
    });
}
async function getCooldown(prisma, userId) {
    return prisma.cooldown.findFirst({
        where: { ownerId: userId, kind: "daily-quest" },
        select: { id: true, readyAt: true },
    });
}
async function saveCooldown(prisma, userId, cooldown, readyAt) {
    if (cooldown) {
        await prisma.cooldown.update({ where: { id: cooldown.id }, data: { readyAt } });
        return;
    }
    await prisma.cooldown.create({ data: { ownerId: userId, kind: "daily-quest", readyAt } });
}
export async function claimDailyQuestReward(context) {
    const prisma = context.prisma ?? prismaClient;
    const rewardCoins = typeof context.rewardCoins === "number" && context.rewardCoins > 0 ? context.rewardCoins : 100;
    const now = context.now instanceof Date ? context.now : new Date();
    const recordCompletionFn = context.recordCompletion ?? recordDailyQuestCompletion;
    const descriptor = { namespace: QUEST_NAMESPACE, key: context.discordId };
    const performClaim = async () => {
        const trainer = await ensureTrainer(prisma, context.discordId);
        const cooldown = await getCooldown(prisma, trainer.id);
        if (cooldown?.readyAt && cooldown.readyAt.getTime() > now.getTime()) {
            return {
                kind: "cooldown",
                streak: null,
                readyAt: cooldown.readyAt.toISOString(),
                grantedAt: now.toISOString(),
            };
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
        };
    };
    const hydrate = async ({ lastValue }) => {
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
    }
    catch (err) {
        log.warn("cache.recover", meta(QUEST_NAMESPACE, context.discordId, { recovery: "direct", err: normalizeError(err) }));
        const fallback = await performClaim();
        return reviveQuest(fallback);
    }
}
