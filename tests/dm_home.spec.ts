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

type HomeView = {
	coins: number;
	nextDaily: string;
	party: HomePartyMember[];
	showStarters: boolean;
};

type HomeInternals = {
	mapTrainerToView: (trainer: any, now?: Date) => HomeView;
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

		const view = mapTrainerToView(trainer, now);
		expect(view.coins).toBe(1250);
		expect(view.showStarters).toBe(false);
		expect(view.party).toHaveLength(2);
		expect(view.party[0].name).toBe("Sparky");
		expect(view.party[0].isShiny).toBe(true);

		const embed = buildHomeEmbed(view);
		const json = embed.toJSON();
		expect(json.fields?.[0]?.value).toContain("#1 Sparky ✨");
		expect(json.fields?.[0]?.value).toContain("HP 35 / 35");
		expect(asDiscordTimestamp(trainer.cooldowns[0].readyAt, now)).toMatch(/<t:\d+:R>/);
	});
});
