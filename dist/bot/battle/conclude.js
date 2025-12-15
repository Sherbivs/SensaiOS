import { BattleRepo, prisma as prismaClient } from "../../models/index.js";
import { invalidateBattleState, loadBattleState } from "../../services/cache/recipes.js";
import { buildBattleResultDMMessages, buildBattleResultThreadMessage } from "../arena/summary.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
async function dmParticipant(client, guildId, discordId, message) {
    try {
        const manager = new HomesteadChannelManager(client, guildId);
        const user = await client.users.fetch(discordId);
        if (!user)
            return;
        const result = await manager.getOrCreateChannel(user);
        await result.channel.send(message);
    }
    catch {
        // Homestead delivery failure is non-fatal; ignore and continue with other notifications.
    }
}
async function postToArenaThread(client, threadId, message) {
    try {
        const thread = await client.channels.fetch(threadId);
        if (!thread || typeof thread.send !== "function")
            return;
        await thread.send(message);
    }
    catch {
        // Thread may have been deleted or unavailable; nothing else to do here.
    }
}
export const announceBattleResult = async (opts) => {
    const { client, guildId, battle, result, updateLoserInteraction } = opts;
    const messages = buildBattleResultDMMessages(result);
    let loserNotified = false;
    if (updateLoserInteraction) {
        try {
            await updateLoserInteraction(messages.loser);
            loserNotified = true;
        }
        catch {
            // Interaction edit failed; fall back to homestead channels below.
        }
    }
    if (!loserNotified) {
        await dmParticipant(client, guildId, result.loser.discordId, messages.loser);
    }
    await dmParticipant(client, guildId, result.winner.discordId, messages.winner);
    if (battle.arenaThreadId) {
        const threadMessage = buildBattleResultThreadMessage(result);
        await postToArenaThread(client, battle.arenaThreadId, threadMessage);
    }
};
function sanitizeTurnCount(turnCount, fallbackTurns) {
    if (!Number.isFinite(turnCount)) {
        return fallbackTurns > 0 ? Math.max(1, Math.floor(fallbackTurns)) : 1;
    }
    const normalized = Math.max(0, Math.floor(turnCount));
    if (normalized <= 0) {
        return fallbackTurns > 0 ? Math.max(1, Math.floor(fallbackTurns)) : 1;
    }
    return normalized;
}
function normalizeFullLog(log) {
    if (!Array.isArray(log))
        return [];
    return log.map((entry) => String(entry));
}
export async function concludeBattleWithVictory(opts) {
    const prisma = opts.prisma ?? prismaClient;
    const battle = await loadBattleState(opts.battleId, { prisma });
    if (!battle || battle.state !== "Active") {
        return null;
    }
    const logFull = normalizeFullLog(opts.fullLog);
    const turnCount = sanitizeTurnCount(opts.turnCount, logFull.length);
    const result = await BattleRepo.concludeBattle({
        prisma,
        battle,
        winner: opts.winner,
        turnCount,
        reason: "victory",
        logFull,
    });
    await invalidateBattleState(battle.id);
    const { announceBattleResult: announce } = await import("./conclude.js");
    await announce({
        client: opts.client,
        guildId: opts.guildId,
        battle,
        result,
        updateLoserInteraction: opts.updateLoserInteraction,
    });
    return result;
}
