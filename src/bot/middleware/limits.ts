import { findActiveEncounterForUser } from "../../shared/models/encounter-queries-pg.js";
import { findActiveOrPendingBattleForUser } from "../../shared/models/battle-queries-pg.js";

export async function hasActiveEncounter(discordId: string) {
  const enc = await findActiveEncounterForUser(discordId);
  return !!enc;
}

export async function hasActiveOrPendingBattle(discordId: string) {
  const battle = await findActiveOrPendingBattleForUser(discordId);
  return !!battle;
}

export async function canStartWalk(discordId: string) {
  if (await hasActiveEncounter(discordId)) return { ok: false as const, reason: "ACTIVE_ENCOUNTER" };
  return { ok: true as const };
}

export async function canChallengeBattle(
  challengerDiscordId: string,
  opponentDiscordId: string
) {
  if (challengerDiscordId === opponentDiscordId) return { ok: false as const, reason: "SELF_CHALLENGE" };
  if (await hasActiveOrPendingBattle(challengerDiscordId))
    return { ok: false as const, reason: "CHALLENGER_BUSY" };
  if (await hasActiveOrPendingBattle(opponentDiscordId))
    return { ok: false as const, reason: "OPPONENT_BUSY" };
  return { ok: true as const };
}

export const __testing = { hasActiveEncounter, hasActiveOrPendingBattle };
