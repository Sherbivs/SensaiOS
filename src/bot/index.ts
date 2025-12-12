import { once } from "node:events";

import { Client, GatewayIntentBits, Partials, Interaction, Events, Options } from "discord.js";

import { prisma } from "../models/index.js";
import { log } from "../shared/log.js";

type CommandDefinition = {
	execute: (...args: unknown[]) => Promise<unknown> | unknown;
	data?: { name?: string };
	[key: string]: unknown;
};

type CommandCollection = Map<string, CommandDefinition>;

type CommandLoaderModule = {
	loadCommands: (...args: unknown[]) => Promise<CommandCollection>;
};

const commandLoaderModule = (await import("../command-loader.js")) as CommandLoaderModule;
const { loadCommands } = commandLoaderModule;
import { handleBattleActionButton, MOVE_PREFIX, SWITCH_PREFIX, FORFEIT_PREFIX } from "./battle/actions.js";
import { handleBattleChallengeButton, handleBattleChallengeCommand } from "./battle/challenge.js";

// ⚠️ DEPRECATED (Phase 18): DM-based gameplay being replaced with private guild channels (homestead-{username})
// See docs/architecture-bible/14-private-channel-architecture.md for migration specification
// TODO: Replace with imports from ./homestead/ after Foundation phase complete
import { handleHeal } from "./dm/heal.js";
import { BOX_PAGE_PREFIX, openBoxView, openPartyView, openProfileView } from "./dm/home.js";
import { openStartersDM, handleStarterPick, STARTER_OPTIONS } from "./dm/starters.js";

import { handleOpsCommand } from "./ops/admin.js";
import { handleEncounterButton } from "./wilds/controls.js";
import { handleWalk } from "./wilds/walk.js";


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
		// MEMORY OPTIMIZATION (2025-11-17): Prevent unbounded cache growth on idle bot
		// Discord.js caches everything indefinitely by default, causing 50-200 MB/day growth
		// even with zero gameplay activity. Configure limits + sweeping to cap memory usage.
		makeCache: Options.cacheWithLimits({
			MessageManager: 200, // Last 200 messages per channel (needed for DM interactions)
			GuildMemberManager: 200, // 200 members per guild (needed for battle challenges)
			PresenceManager: 0, // Disable - not used
			ReactionManager: 0, // Disable - not used
			VoiceStateManager: 0, // Disable - not used
			ApplicationCommandManager: 0, // Disable - commands loaded separately
			BaseGuildEmojiManager: 0, // Disable - not used
			GuildEmojiManager: 0, // Disable - not used
			GuildBanManager: 0, // Disable - not used
			GuildInviteManager: 0, // Disable - not used
			StageInstanceManager: 0, // Disable - not used
			ThreadManager: 0, // Disable - not used
			ThreadMemberManager: 0, // Disable - not used
		}),
		sweepers: {
			// Sweep messages older than 30 minutes every hour
			messages: {
				interval: 3600, // 1 hour (in seconds)
				lifetime: 1800, // 30 minutes (in seconds)
			},
		},
	});

	// OPTIMIZATION: Lazy-load commands on first interaction (saves ~500-1000ms on startup)
	// BEFORE: const commands = await loadCommands(); (blocking, loads 50+ command modules upfront)
	// AFTER: Load on-demand when first interaction arrives (non-blocking startup)
	let commands: CommandCollection | null = null;
	
	async function ensureCommandsLoaded(): Promise<CommandCollection> {
		if (!commands) {
			const loadStart = process.hrtime.bigint();
			commands = await loadCommands();
			const loadDurationMs = Number(process.hrtime.bigint() - loadStart) / 1_000_000;
			log.info("Commands loaded lazily", { count: commands.size, durationMs: loadDurationMs });
		}
		return commands;
	}

        const readyPromise = once(client, Events.ClientReady);

        client.once(Events.ClientReady, () => {
                log.info("Discord bot is ready", {
                        user: client.user?.tag,
                        lazyCommands: true,  // Commands will load on first interaction
                });
        });

	client.on("interactionCreate", async (interaction: Interaction) => {
		try {
				if (interaction.isChatInputCommand()) {
					// Lazy-load commands on first interaction
					const loadedCommands = await ensureCommandsLoaded();
					const cmd = loadedCommands.get(interaction.commandName);
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
					if (interaction.commandName === "daily") {
						const sub = interaction.options?.getSubcommand?.(false);
						if (sub === "claim") {
							const { handleDailyClaim } = await import("./daily/claim.js");
							await handleDailyClaim(interaction, { prisma });
						} else {
							await interaction.reply({ content: "Unknown daily subcommand. Try `/daily claim`.", ephemeral: true });
						}
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
						await handleBattleActionButton(interaction);
						return;
					}
					switch (id) {
						case "HOME_HEAL":
							await handleHeal(interaction);
							break;
                                                case "HOME_PARTY":
                                                        await openPartyView(interaction);
                                                        break;
                                                case "HOME_BOX":
                                                        await openBoxView(interaction, { page: 1 });
                                                        break;
                                                case "HOME_PROFILE":
                                                        await openProfileView(interaction);
                                                        break;
                                                case "HOME_STARTERS":
							await openStartersDM(interaction.user);
							await interaction.reply({ content: "I opened your Starters in DMs.", ephemeral: true });
							break;
                                                default:
                                                        if (id.startsWith(BOX_PAGE_PREFIX) && interaction.isButton()) {
                                                                const rawPage = Number.parseInt(
                                                                        id.substring(BOX_PAGE_PREFIX.length),
                                                                        10
                                                                );
                                                                const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
                                                                await openBoxView(interaction, { page, respond: "update" });
                                                                break;
                                                        }
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
				} catch {
					// Ignore secondary reply errors; the primary failure is already logged.
				}
			}
		}
	});

        await Promise.all([client.login(token), readyPromise]);

        // MEMORY OPTIMIZATION (2025-11-17): Cache hygiene monitoring
        // Automatic sweepers (configured in Client options) handle cleanup.
        // Log cache stats periodically to verify sweeping is working.
        const cacheMonitorInterval = setInterval(() => {
                try {
                        const messageCount = client.channels.cache.reduce((total, channel) => {
                                if ("messages" in channel && channel.messages?.cache) {
                                        return total + channel.messages.cache.size;
                                }
                                return total;
                        }, 0);
                        const memberCount = client.guilds.cache.reduce((total, guild) => {
                                return total + guild.members.cache.size;
                        }, 0);
                        
                        // Only log if caches are growing beyond expected limits
                        if (messageCount > 500 || memberCount > 500) {
                                log.warn("Discord cache above threshold", { 
                                        messages: messageCount, 
                                        members: memberCount,
                                        note: "Sweepers should be reducing this - check configuration"
                                });
                        }
                } catch (err: any) {
                        log.warn("Cache monitor failed", { err: err?.message || String(err) });
                }
        }, 3600_000); // 1 hour

        // Cleanup on shutdown
        const cleanup = () => {
                clearInterval(cacheMonitorInterval);
        };
        process.once("SIGTERM", cleanup);
        process.once("SIGINT", cleanup);

        return client;
}
