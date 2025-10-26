import { describe, expect, test } from "vitest";

// CommonJS command exports helpers via _internals for testing
type HomePartyMember = {
	slot: number;
	speciesId: number | null;
	name: string;
	hp: number | null;
	maxHp: number | null;
	isShiny: boolean;
};

type HomeBattleHistoryEntry = {
	battleId: string;
	outcome: "WIN" | "LOSS";
	opponentDiscordId: string | null;
	reward: number | null;
	turnCount: number | null;
};

type HomeDailyQuest = {
	status: "fresh" | "locked" | "due" | "reset";
	streak: number;
	fieldValue: string;
	atRisk: boolean;
	lost: boolean;
	lastCompleted: Date | null;
	lastReset: Date | null;
	nextDue: Date | null;
};

type HomeView = {
	coins: number;
	nextDaily: string;
	party: HomePartyMember[];
	showStarters: boolean;
	battleHistory: HomeBattleHistoryEntry[];
 	dailyQuest: HomeDailyQuest;
};

type HomeInternals = {
	mapTrainerToView: (trainer: any, now?: Date, options?: { battleHistory?: HomeBattleHistoryEntry[] }) => HomeView;
	buildHomeEmbed: (view: HomeView) => any;
	asDiscordTimestamp: (date?: Date | string | null, now?: Date) => string;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const internals: HomeInternals = require("../src/commands/home.js")._internals;

const { mapTrainerToView, buildHomeEmbed, asDiscordTimestamp } = internals;

describe("DM Home view model", () => {
	test("returns starter prompt when trainer data is missing", () => {
		const view = mapTrainerToView(null);
		expect(view.coins).toBe(0);
		expect(view.party).toHaveLength(0);
		expect(view.showStarters).toBe(true);
		expect(view.nextDaily).toBe("Ready now");
		expect(view.battleHistory).toEqual([]);
		expect(view.dailyQuest.fieldValue).toContain("Complete today's quest");
	});

	test("renders embed with persisted Pokémon details", () => {
		const now = new Date("2025-10-25T10:00:00Z");
		const trainer = {
			coins: 1250,
			cooldowns: [
				{
					kind: "daily",
					readyAt: new Date("2025-10-26T12:00:00Z"),
				},
			],
			parties: [
				{
					slots: [
						{
							slot: 1,
							pokemon: {
								speciesId: 25,
								nickname: "Sparky",
								hp: 35,
								maxHp: 35,
								isShiny: true,
							},
						},
						{
							slot: 2,
							pokemon: {
								speciesId: 7,
								nickname: "Shellshock",
								hp: 44,
								maxHp: 44,
							},
						},
					],
				},
			],
		};

		const history = [
			{ battleId: "battle-a", outcome: "WIN" as const, opponentDiscordId: "rival", reward: 60, turnCount: 4 },
		];
		const view = mapTrainerToView(trainer, now, { battleHistory: history });
		expect(view.coins).toBe(1250);
		expect(view.showStarters).toBe(false);
		expect(view.party).toHaveLength(2);
		expect(view.party[0].name).toBe("Sparky");
		expect(view.party[0].isShiny).toBe(true);
		expect(view.battleHistory).toHaveLength(1);

		const embed = buildHomeEmbed(view);
		const json = embed.toJSON();
		const partyField = json.fields?.find((field) => field.name === "Party");
		const questField = json.fields?.find((field) => field.name === "Daily Quest");
		expect(partyField?.value).toContain("#1 Sparky ✨");
		expect(partyField?.value).toContain("HP 35 / 35");
		expect(questField?.value).toMatch(/streak|Complete today's quest/);
		expect(asDiscordTimestamp(trainer.cooldowns[0].readyAt, now)).toMatch(/<t:\d+:R>/);
	});

	test("renders battle history summary when entries exist", () => {
		const view: HomeView = {
			coins: 100,
			nextDaily: "Ready now",
			party: [],
			showStarters: false,
			battleHistory: [
				{ battleId: "battle-1", outcome: "WIN", opponentDiscordId: "winner", reward: 65, turnCount: 5 },
				{ battleId: "battle-2", outcome: "LOSS", opponentDiscordId: "loser", reward: 12, turnCount: null },
			],
		};

		const embed = buildHomeEmbed(view);
		const historyField = embed.toJSON().fields?.find((field) => field.name === "Battle History");
		expect(historyField?.value).toContain("✅ Win vs <@winner>");
		expect(historyField?.value).toContain("+65 coins");
		expect(historyField?.value).toContain("❌ Loss vs <@loser>");
	});

	test("shows placeholder message when no battle history entries", () => {
		const view: HomeView = {
			coins: 0,
			nextDaily: "Ready now",
			party: [],
			showStarters: true,
			battleHistory: [],
		};

		const embed = buildHomeEmbed(view);
		const historyField = embed.toJSON().fields?.find((field) => field.name === "Battle History");
		expect(historyField?.value).toContain("No finished battles yet");
	});

		test("daily quest streak field shows active streak details", () => {
			const now = new Date("2025-10-26T12:00:00Z");
			const trainer: any = {
				coins: 0,
				cooldowns: [],
				parties: [{ slots: [] }],
				dailyQuestStreak: 3,
				dailyQuestLastCompleted: new Date("2025-10-26T08:00:00Z"),
			};
			const view = mapTrainerToView(trainer, now, { battleHistory: [] });
			expect(view.dailyQuest.status).toBe("locked");
			expect(view.dailyQuest.fieldValue).toContain("3-day streak");
			const embed = buildHomeEmbed(view).toJSON();
			const questField = embed.fields?.find((field: any) => field.name === "Daily Quest");
			expect(questField?.value).toContain("3-day streak");
		});

		test("daily quest streak field guides recovery after reset", () => {
			const now = new Date("2025-10-30T09:00:00Z");
			const trainer: any = {
				coins: 0,
				cooldowns: [],
				parties: [{ slots: [] }],
				dailyQuestStreak: 0,
				dailyQuestLastCompleted: new Date("2025-10-27T07:00:00Z"),
				dailyQuestLastReset: new Date("2025-10-29T09:00:00Z"),
			};
			const view = mapTrainerToView(trainer, now, { battleHistory: [] });
			expect(view.dailyQuest.status).toBe("reset");
			expect(view.dailyQuest.fieldValue).toContain("streak reset");
		});
});
