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

type HomeView = {
	coins: number;
	nextDaily: string;
	party: HomePartyMember[];
	showStarters: boolean;
	battleHistory: HomeBattleHistoryEntry[];
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
		expect(json.fields?.[0]?.value).toContain("#1 Sparky ✨");
		expect(json.fields?.[0]?.value).toContain("HP 35 / 35");
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
});
