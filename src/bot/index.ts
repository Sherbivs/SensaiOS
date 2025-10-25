import { Client, GatewayIntentBits, Partials, Interaction } from "discord.js";
import { log } from "../shared/log.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadCommands } = require("../command-loader.js");
import { openStartersDM, handleStarterPick, STARTER_OPTIONS } from "./dm/starters.js";
import { handleHeal } from "./dm/heal.js";
import { handleWalk } from "./wilds/walk.js";
import { handleBattleChallengeButton, handleBattleChallengeCommand } from "./battle/challenge.js";
import { handleBattleActionButton, MOVE_PREFIX, SWITCH_PREFIX, FORFEIT_PREFIX } from "./battle/actions.js";
import { handleEncounterButton } from "./wilds/controls.js";
import { handleOpsCommand } from "./ops/admin.js";
import { prisma } from "../models/index.js";

export type BotStartOptions = {
	token?: string;
};

/**
 * Boots the Discord bot client and registers a minimal interaction handler.
 * - No Message Content intent required (slash interactions only)
 * - Commands are loaded from src/commands/*.js via CommonJS loader
 */
export async function bootDiscord(opts: BotStartOptions = {}): Promise<Client> {
	const token =
		opts.token ||
		process.env.DISCORD_BOT_TOKEN ||
		process.env.POKEMON_BOT_TOKEN ||
		process.env.DISCORD_TOKEN ||
		process.env.BOT_TOKEN;

	if (!token) {
		log.warn("Discord bot token not provided; skipping bot startup");
		// Return a stub client to keep the app running without hard failure
		// when the bot is intentionally disabled.
		return new Client({ intents: [] });
	}

	const client = new Client({
		intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
		partials: [Partials.Channel],
	});

	const commands = loadCommands();

	client.once("ready", () => {
		log.info("Discord bot is ready", {
			user: client.user?.tag,
			commands: commands.size,
		});
	});

	client.on("interactionCreate", async (interaction: Interaction) => {
		try {
				if (interaction.isChatInputCommand()) {
					const cmd = commands.get(interaction.commandName);
					if (!cmd) {
						await interaction.reply({
							content: `Unknown command: ${interaction.commandName}`,
							ephemeral: true,
						});
						return;
					}
					// Small wiring for known commands to DM flows
					if (interaction.commandName === "starter") {
						await openStartersDM(interaction.user);
						await interaction.reply({ content: "I opened your Starters in DMs.", ephemeral: true });
						return;
					}
					if (interaction.commandName === "heal") {
						await handleHeal(interaction);
						return;
					}
					if (interaction.commandName === "walk") {
						await handleWalk(interaction);
						return;
					}
					if (interaction.commandName === "battle") {
						const sub = interaction.options?.getSubcommand?.(false);
						if (sub === "challenge") {
							await handleBattleChallengeCommand(interaction);
						} else {
							await interaction.reply({ content: "Unknown battle subcommand. Try `/battle challenge @trainer`.", ephemeral: true });
						}
						return;
					}
					if (interaction.commandName === "ops") {
						await handleOpsCommand(interaction);
						return;
					}
					await cmd.execute(interaction);
					return;
				}

				if (interaction.isButton()) {
					const id = interaction.customId;
					if (id.startsWith("BATTLE_ACCEPT_") || id.startsWith("BATTLE_DECLINE_")) {
						await handleBattleChallengeButton(interaction);
						return;
					}
					if (id.startsWith(MOVE_PREFIX) || id.startsWith(SWITCH_PREFIX) || id.startsWith(FORFEIT_PREFIX)) {
						await handleBattleActionButton(interaction, { prisma });
						return;
					}
					switch (id) {
						case "HOME_HEAL":
							await handleHeal(interaction);
							break;
						case "HOME_PARTY":
							await interaction.reply({ content: "Party view is coming soon.", ephemeral: true });
							break;
						case "HOME_BOX":
							await interaction.reply({ content: "Box view is coming soon.", ephemeral: true });
							break;
						case "HOME_PROFILE":
							await interaction.reply({ content: "Profile view is coming soon.", ephemeral: true });
							break;
						case "HOME_STARTERS":
							await openStartersDM(interaction.user);
							await interaction.reply({ content: "I opened your Starters in DMs.", ephemeral: true });
							break;
						default:
							// Starter pick buttons: STARTER_PICK_<speciesId>
							if (id.startsWith("STARTER_PICK_")) {
								const sid = Number(id.substring("STARTER_PICK_".length));
								const valid = STARTER_OPTIONS.some((s) => s.speciesId === sid);
								if (!valid) return;
								await handleStarterPick(interaction, sid);
							}
                            // Encounter controls: ENCOUNTER_THROW_<id>, ENCOUNTER_RUN_<id>, ENCOUNTER_SWAP_<id>
                            if (id.startsWith("ENCOUNTER_")) {
                              await handleEncounterButton(interaction);
                            }
							break;
					}
					return;
				}
		} catch (err: any) {
			log.error("Interaction handler error", { err: err?.message || String(err) });
			if (interaction.isRepliable()) {
				try {
					if (interaction.deferred || interaction.replied) {
						await interaction.editReply({ content: "Something went wrong." });
					} else {
						await interaction.reply({ content: "Something went wrong.", ephemeral: true });
					}
				} catch {}
			}
		}
	});

	await client.login(token);
	return client;
}
