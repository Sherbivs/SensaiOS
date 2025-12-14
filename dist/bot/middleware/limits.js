import { findActiveEncounterForUser } from "../../shared/models/encounter-queries-pg.js";
import { findActiveOrPendingBattleForUser } from "../../shared/models/battle-queries-pg.js";
export async function hasActiveEncounter(discordId) {
    const enc = await findActiveEncounterForUser(discordId);
    return !!enc;
}
export async function hasActiveOrPendingBattle(discordId) {
    const battle = await findActiveOrPendingBattleForUser(discordId);
    return !!battle;
}
export async function canStartWalk(discordId) {
    if (await hasActiveEncounter(discordId))
        return { ok: false, reason: "ACTIVE_ENCOUNTER" };
    return { ok: true };
}
export async function canChallengeBattle(challengerDiscordId, opponentDiscordId) {
    if (challengerDiscordId === opponentDiscordId)
        return { ok: false, reason: "SELF_CHALLENGE" };
    if (await hasActiveOrPendingBattle(challengerDiscordId))
        return { ok: false, reason: "CHALLENGER_BUSY" };
    if (await hasActiveOrPendingBattle(opponentDiscordId))
        return { ok: false, reason: "OPPONENT_BUSY" };
    return { ok: true };
}
