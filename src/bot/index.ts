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

// Homestead channel imports (private guild channel gameplay)
// Migration from DM-based gameplay complete as of Phase 18
// See docs/architecture-bible/14-private-channel-architecture.md
import { handleHeal } from "./homestead/heal.js";
import { BOX_PAGE_PREFIX, openBoxView, openPartyView, openProfileView } from "./homestead/home.js";
// Legacy starters kept for backward compatibility with existing STARTER_PICK_ buttons
import { handleStarterPick, STARTER_OPTIONS } from "./homestead/starters.js";
// New open starter selection (any Pokemon except forbidden categories)
// See docs/architecture-bible/19-starter-selection-flow.md
import { startOpenStarterFlow } from "./homestead/open-starter-selection.js";

import { handleOpsCommand } from "./ops/admin.js";
import { handleEncounterButton } from "./wilds/controls.js";
import { handleWalk } from "./wilds/walk.js";

// Player checkpoint & recovery system (VS Code-style state recovery)
// Triggers diagnostics and forced healing when homestead is deleted
import { setupHomesteadDeletionHandler } from "../services/player-checkpoint.js";

// Background homestead integrity monitor (continuous per-player checking)
// Proactively verifies each player's homestead at a steady pace
import { startAllHomesteadMonitors, stopAllHomesteadMonitors } from "../services/homestead-player-monitor.js";

// Startup bootstrap for deleted/pending homesteads
// Ensures no player is locked out after channel deletion
import { bootstrapAllHomesteads } from "../services/homestead-manager.js";

// Development mode access control
import { isUserAllowedInDevMode, getDevModeAccessDeniedMessage } from "../shared/feature-flags.js";


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
                
                // Register homestead deletion handler for VS Code-style recovery
                // When user deletes their homestead channel, triggers:
                // 1. Full diagnostic tests on player state
                // 2. Forced healing of any data integrity issues
                // 3. Automatic channel recreation with recovery status message
                setupHomesteadDeletionHandler(client);
                
                // STARTUP BOOTSTRAP: Recover deleted/pending homesteads immediately
                // This ensures no player is locked out if their channel was deleted
                // while the bot was offline. Creates channels BEFORE monitors start.
                bootstrapAllHomesteads(client).then(results => {
                        const totalRecovered = results.reduce((sum, r) => sum + r.recovered, 0);
                        const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
                        if (totalRecovered > 0 || totalFailed > 0) {
                                log.info("Homestead bootstrap complete", {
                                        guilds: results.length,
                                        recovered: totalRecovered,
                                        failed: totalFailed,
                                });
                        }
                }).catch(err => {
                        log.error("Failed to bootstrap homesteads", {
                                error: err instanceof Error ? err.message : String(err),
                        });
                });
                
                // Start background homestead integrity monitors for all guilds
                // Checks each player's homestead at a steady pace (~1/second)
                // Proactively recreates missing channels before users notice
                startAllHomesteadMonitors(client).catch(err => {
                        log.error("Failed to start homestead monitors", {
                                error: err instanceof Error ? err.message : String(err),
                        });
                });
        });

	client.on("interactionCreate", async (interaction: Interaction) => {
		try {
				// DEV MODE ACCESS CHECK: Restrict access during pre-release testing
				// Enable via FF_DEV_RESTRICTED_ACCESS=true, configure allowed users via DEV_ALLOWED_USER_IDS
				// Ops commands always allowed for admins to manage the bot
				const isOpsCommand = interaction.isChatInputCommand() && interaction.commandName === "ops";
				if (!isOpsCommand && !isUserAllowedInDevMode(interaction.user?.id)) {
					if (interaction.isRepliable()) {
						await interaction.reply({
							content: getDevModeAccessDeniedMessage(),
							ephemeral: true,
						});
					}
					return;
				}

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
					// Small wiring for known commands to homestead channel flows
					if (interaction.commandName === "starter") {
						if (!interaction.guildId) {
							await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
							return;
						}
						// Use the new open starter selection flow (any Pokemon except forbidden)
						// Falls back to legacy Kanto starters if openStarterFlow fails
						await startOpenStarterFlow(client, interaction.guildId, interaction.user);
						await interaction.reply({ content: "✨ I've opened the Starter Selection in your homestead channel!", ephemeral: true });
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
						case "HOME_INVENTORY":
							await interaction.reply({ content: "🎒 **Inventory** — Coming soon! This will show your items, Poké Balls, and other gear.", ephemeral: true });
							break;
						case "HOME_POKEDEX":
							await interaction.reply({ content: "📘 **Pokédex** — Coming soon! This will show your collection progress and Pokémon data.", ephemeral: true });
							break;
						case "HOME_SETTINGS":
							await interaction.reply({ content: "⚙️ **Settings** — Coming soon! This will let you customize your experience.", ephemeral: true });
							break;
                                                case "HOME_STARTERS":
							if (!interaction.guildId) {
								await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
								break;
							}
							// Use the new open starter selection flow (any Pokemon except forbidden)
							await startOpenStarterFlow(client, interaction.guildId, interaction.user);
							await interaction.reply({ content: "✨ I've opened the Starter Selection in your homestead channel!", ephemeral: true });
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
		// Stop background homestead integrity monitors
		stopAllHomesteadMonitors();
	};
	process.once("SIGTERM", cleanup);
	process.once("SIGINT", cleanup);        return client;
}
