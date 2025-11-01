import type { Client } from "discord.js";
import type { PrismaClient } from "@prisma/client";
import type { BattleResultRecord, BattleWithPlayers } from "../../models/index.js";
import { BattleRepo, prisma as prismaClient } from "../../models/index.js";
import { buildBattleResultDMMessages, buildBattleResultThreadMessage } from "../arena/summary.js";
import { invalidateBattleState, loadBattleState } from "../../services/cache/recipes.js";

type DiscordClientLike = Pick<Client, "users" | "channels">;
type UpdateLoserInteraction = (content: string) => Promise<void>;

type PrismaLike = PrismaClient;

async function dmParticipant(client: DiscordClientLike, discordId: string, message: string) {
	try {
		const user: any = await client.users.fetch(discordId);
		if (!user) return;
		const dm = await user.createDM?.();
		if (!dm || typeof dm.send !== "function") return;
		await dm.send(message);
	} catch {}
}

async function postToArenaThread(client: DiscordClientLike, threadId: string, message: string) {
	try {
		const thread: any = await client.channels.fetch(threadId);
		if (!thread || typeof thread.send !== "function") return;
		await thread.send(message);
	} catch {}
}

export const announceBattleResult = async (opts: {
        client: DiscordClientLike;
        battle: BattleWithPlayers;
        result: BattleResultRecord;
        updateLoserInteraction?: UpdateLoserInteraction;
}) => {
        const { client, battle, result, updateLoserInteraction } = opts;
        const messages = buildBattleResultDMMessages(result);

	let loserNotified = false;
	if (updateLoserInteraction) {
		try {
			await updateLoserInteraction(messages.loser);
			loserNotified = true;
		} catch {}
	}

	if (!loserNotified) {
		await dmParticipant(client, result.loser.discordId, messages.loser);
	}

	await dmParticipant(client, result.winner.discordId, messages.winner);

	if (battle.arenaThreadId) {
		const threadMessage = buildBattleResultThreadMessage(result);
		await postToArenaThread(client, battle.arenaThreadId, threadMessage);
	}
};

function sanitizeTurnCount(turnCount: number, fallbackTurns: number) {
	if (!Number.isFinite(turnCount)) {
		return fallbackTurns > 0 ? Math.max(1, Math.floor(fallbackTurns)) : 1;
	}
	const normalized = Math.max(0, Math.floor(turnCount));
	if (normalized <= 0) {
		return fallbackTurns > 0 ? Math.max(1, Math.floor(fallbackTurns)) : 1;
	}
	return normalized;
}

function normalizeFullLog(log: unknown): string[] {
	if (!Array.isArray(log)) return [];
	return log.map((entry) => String(entry));
}

export async function concludeBattleWithVictory(opts: {
	client: DiscordClientLike;
	battleId: string;
	winner: "p1" | "p2";
	turnCount: number;
	fullLog: unknown;
	prisma?: PrismaLike;
	updateLoserInteraction?: UpdateLoserInteraction;
}): Promise<BattleResultRecord | null> {
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
                battle,
                result,
                updateLoserInteraction: opts.updateLoserInteraction,
        });

	return result;
}
