import type { PrismaClient } from "@prisma/client";
import { prisma as prismaClient } from "../../models/index.js";

type PrismaLike = PrismaClient;

export async function hasActiveEncounter(discordId: string, prisma: PrismaLike = prismaClient) {
  if (typeof prisma?.encounter?.findFirst !== "function") return false;
  const enc = await prisma.encounter.findFirst({ where: { owner: { discordId }, state: "Spawned" } });
  return !!enc;
}

export async function hasActiveOrPendingBattle(discordId: string, prisma: PrismaLike = prismaClient) {
  if (typeof prisma?.battle?.findFirst !== "function") return false;
  const battle = await prisma.battle.findFirst({
    where: {
      OR: [{ p1: { discordId } }, { p2: { discordId } }],
      state: { in: ["Pending", "Active"] },
    },
  });
  return !!battle;
}

export async function canStartWalk(discordId: string, prisma: PrismaLike = prismaClient) {
  if (await hasActiveEncounter(discordId, prisma)) return { ok: false as const, reason: "ACTIVE_ENCOUNTER" };
  return { ok: true as const };
}

export async function canChallengeBattle(
  challengerDiscordId: string,
  opponentDiscordId: string,
  prisma: PrismaLike = prismaClient
) {
  if (challengerDiscordId === opponentDiscordId) return { ok: false as const, reason: "SELF_CHALLENGE" };
  if (await hasActiveOrPendingBattle(challengerDiscordId, prisma))
    return { ok: false as const, reason: "CHALLENGER_BUSY" };
  if (await hasActiveOrPendingBattle(opponentDiscordId, prisma))
    return { ok: false as const, reason: "OPPONENT_BUSY" };
  return { ok: true as const };
}

export const __testing = { hasActiveEncounter, hasActiveOrPendingBattle };
