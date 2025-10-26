// Prisma client singleton and simple repository helpers

import { PrismaClient } from "@prisma/client";
import type { Battle, User as PrismaUser } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Example: lightweight repo helpers (expand later)
export const UserRepo = {
  upsertByDiscordId: async (discordId: string, client: PrismaClient = prisma) =>
    client.user.upsert({
      where: { discordId },
      update: {},
      create: { discordId, coins: 0 },
    }),
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

function normalizeLogCompact(existing: unknown, summary: BattleResultRecord) {
  const base = typeof existing === "object" && existing !== null ? existing : {};
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
  };
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

    const resultJson = {
      ...result,
      recordedAt: new Date().toISOString(),
    } as any;

    const logFull = opts.logFull ?? (opts.battle.logFull as unknown as string[] | undefined);
    const logCompact = normalizeLogCompact(opts.battle.logCompact, result) as any;

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
          logFull: (logFull ?? null) as any,
        },
      }),
    ];

    const transact = (client as any).$transaction;
    if (typeof transact === "function") {
      await transact(updates);
    } else {
      for (const op of updates) await op;
    }

    return result;
  },
};
