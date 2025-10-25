import { Client, GatewayIntentBits, Partials, Interaction } from "discord.js";
import { log } from "../shared/log.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadCommands } = require("../command-loader.js");

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
			if (!interaction.isChatInputCommand()) return;
			const cmd = commands.get(interaction.commandName);
			if (!cmd) {
				await interaction.reply({
					content: `Unknown command: ${interaction.commandName}`,
					ephemeral: true,
				});
				return;
			}
			await cmd.execute(interaction);
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
