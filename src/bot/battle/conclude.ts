import type { Client } from "discord.js";
import type { BattleResultRecord, BattleWithPlayers } from "../../models/index.js";
import { buildBattleResultDMMessages, buildBattleResultThreadMessage } from "../arena/summary.js";

type DiscordClientLike = Pick<Client, "users" | "channels">;
type UpdateLoserInteraction = (content: string) => Promise<void>;

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

export async function announceBattleResult(opts: {
	client: DiscordClientLike;
	battle: BattleWithPlayers;
	result: BattleResultRecord;
	updateLoserInteraction?: UpdateLoserInteraction;
}) {
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
}
