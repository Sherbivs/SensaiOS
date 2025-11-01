import { describe, expect, it, vi } from "vitest";

import { announceBattleResult } from "../src/bot/battle/conclude.js";
import { BattleRepo } from "../src/models/index.js";
import type { BattleResultRecord } from "../src/models/index.js";

function buildBattle() {
	return {
		id: "battle-1",
		state: "Active",
		arenaThreadId: "thread-7",
		rngSeed: "seed",
		ruleset: "standard",
		logCompact: {},
		logFull: [],
		startedAt: new Date("2025-01-01T00:00:00Z"),
		endedAt: null,
		p1Id: "p1",
		p2Id: "p2",
		p1: { id: "p1", discordId: "winner" },
		p2: { id: "p2", discordId: "loser" },
	} as any;
}

describe("BattleRepo.concludeBattle", () => {
	it("writes battle result data and distributes rewards", async () => {
		const userUpdates: any[] = [];
		const battleUpdates: any[] = [];
		const prisma = {
			user: {
				update: vi.fn(async (args) => {
					userUpdates.push(args);
					return { id: args.where.id };
				}),
			},
			battle: {
				update: vi.fn(async (args) => {
					battleUpdates.push(args);
					return { id: args.where.id };
				}),
			},
			$transaction: vi.fn(async (ops: Promise<unknown>[]) => {
				for (const op of ops) await op;
			}),
		} as any;

		const result = await BattleRepo.concludeBattle({
			prisma,
			battle: buildBattle(),
			winner: "p1",
			turnCount: 5,
			reason: "victory",
		});

		expect(prisma.$transaction).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({
			battleId: "battle-1",
			reason: "victory",
			winner: { discordId: "winner" },
			loser: { discordId: "loser" },
		});
		expect(result.rewards).toEqual({ winner: 65, loser: 14 });

		expect(prisma.user.update).toHaveBeenCalledTimes(2);
		expect(userUpdates[0]).toMatchObject({
			where: { id: "p1" },
			data: { coins: { increment: 65 } },
		});
		expect(userUpdates[1]).toMatchObject({
			where: { id: "p2" },
			data: { coins: { increment: 14 } },
		});

		expect(prisma.battle.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "battle-1" },
				data: expect.objectContaining({
					state: "Finished",
					resultJson: expect.objectContaining({
						reason: "victory",
						turnCount: 5,
						winnerDiscordId: "winner",
						loserDiscordId: "loser",
					}),
				}),
			})
		);
	});
});

describe("announceBattleResult", () => {
	it("notifies loser via interaction, winner via DM, and posts arena summary", async () => {
		const threadSend = vi.fn();
		const winnerDmSend = vi.fn();
		const createWinnerDM = vi.fn().mockResolvedValue({ send: winnerDmSend });
		const client = {
			users: {
				fetch: vi.fn(async (id: string) => {
					if (id === "winner") {
						return { createDM: createWinnerDM };
					}
					throw new Error("unexpected fetch");
				}),
			},
			channels: {
				fetch: vi.fn(async () => ({ send: threadSend })),
			},
		} as any;

		const loserInteraction = vi.fn();
		const result: BattleResultRecord = {
			battleId: "battle-1",
			reason: "victory",
			turnCount: 3,
			rewards: { winner: 59, loser: 12 },
			winner: { userId: "p1", discordId: "winner" },
			loser: { userId: "p2", discordId: "loser" },
		};

		await announceBattleResult({
			client,
			battle: buildBattle(),
			result,
			updateLoserInteraction: async (message) => {
				loserInteraction(message);
			},
		});

		expect(loserInteraction).toHaveBeenCalledWith(expect.stringContaining("battle-1"));
		expect(client.users.fetch).toHaveBeenCalledWith("winner");
		expect(createWinnerDM).toHaveBeenCalled();
		expect(winnerDmSend).toHaveBeenCalledWith(expect.stringContaining("You won"));
		expect(threadSend).toHaveBeenCalledWith(expect.stringContaining("Rewards"));
	});
});
