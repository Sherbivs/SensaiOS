import { once } from "node:events";
import { Client, GatewayIntentBits, Partials, Events, Options } from "discord.js";
import { prisma } from "../models/index.js";
import { getLogger } from "../shared/logging/index.js";
import { loadCommands } from "../command-loader.js";
const logger = getLogger();
;
import { handleBattleActionButton, MOVE_PREFIX, SWITCH_PREFIX, FORFEIT_PREFIX } from "./battle/actions.js";
import { handleBattleChallengeButton, handleBattleChallengeCommand } from "./battle/challenge.js";
// Homestead modules (private guild channel-based gameplay)
// See docs/architecture-bible/18-private-channel-architecture.md
import { handleHeal } from "./homestead/heal.js";
import { BOX_PAGE_PREFIX, openBoxView, openPartyView, openProfileView } from "./homestead/home.js";
import { openStartersHomestead as openStartersDM, handleStarterPick, STARTER_OPTIONS } from "./homestead/starters.js";
import { handleOpsCommand } from "./ops/admin.js";
import { handleEncounterButton } from "./wilds/controls.js";
import { handleWalk } from "./wilds/walk.js";
import { replyError, replyInfo, replySuccess, safeReply } from "./shared/response-helpers.js";
/**
 * Boots the Discord bot client and registers a minimal interaction handler.
 * - No Message Content intent required (slash interactions only)
 * - Commands are loaded from src/commands/*.js via CommonJS loader
 */
export async function bootDiscord(opts = {}) {
    const token = opts.token ||
        process.env.DISCORD_BOT_TOKEN ||
        process.env.POKEMON_BOT_TOKEN ||
        process.env.DISCORD_TOKEN ||
        process.env.BOT_TOKEN;
    if (!token) {
        logger.warn('BotInit', 'bootDiscord', 'Discord bot token not provided; skipping bot startup');
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
    let commands = null;
    async function ensureCommandsLoaded() {
        if (!commands) {
            const loadStart = process.hrtime.bigint();
            commands = await loadCommands();
            const loadDurationMs = Number(process.hrtime.bigint() - loadStart) / 1_000_000;
            logger.info('BotInit', 'ensureCommandsLoaded', 'Commands loaded lazily', { durationMs: loadDurationMs, metadata: { count: commands.size } });
        }
        return commands;
    }
    const readyPromise = once(client, Events.ClientReady);
    client.once(Events.ClientReady, () => {
        logger.info('BotInit', 'onReady', 'Discord bot is ready', {
            metadata: {
                user: client.user?.tag,
                lazyCommands: true, // Commands will load on first interaction
            },
        });
    });
    client.on("interactionCreate", async (interaction) => {
        try {
            if (interaction.isChatInputCommand()) {
                // Lazy-load commands on first interaction
                const loadedCommands = await ensureCommandsLoaded();
                const cmd = loadedCommands.get(interaction.commandName);
                if (!cmd) {
                    await replyError(interaction, `Unknown command: ${interaction.commandName}`);
                    return;
                }
                // Small wiring for known commands to homestead flows
                if (interaction.commandName === "starter") {
                    if (interaction.guildId) {
                        await openStartersDM(client, interaction.guildId, interaction.user);
                        await replySuccess(interaction, "I sent your Starters to your homestead channel.");
                    }
                    else {
                        await replyError(interaction, "This command must be used in a server.");
                    }
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
                    }
                    else {
                        await replyInfo(interaction, "Unknown daily subcommand. Try `/daily claim`.");
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
                    }
                    else {
                        await replyInfo(interaction, "Unknown battle subcommand. Try `/battle challenge @trainer`.");
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
                        if (interaction.guildId) {
                            await openStartersDM(client, interaction.guildId, interaction.user);
                            await interaction.reply({ content: "I sent your Starters to your homestead channel.", ephemeral: true });
                        }
                        else {
                            await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                        }
                        break;
                    default:
                        if (id.startsWith(BOX_PAGE_PREFIX) && interaction.isButton()) {
                            const rawPage = Number.parseInt(id.substring(BOX_PAGE_PREFIX.length), 10);
                            const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
                            await openBoxView(interaction, { page, respond: "update" });
                            break;
                        }
                        // Starter pick buttons: STARTER_PICK_<speciesId>
                        if (id.startsWith("STARTER_PICK_")) {
                            const sid = Number(id.substring("STARTER_PICK_".length));
                            const valid = STARTER_OPTIONS.some((s) => s.speciesId === sid);
                            if (!valid)
                                return;
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
        }
        catch (err) {
            logger.error('BotInteraction', 'interactionCreate', 'Interaction handler error', { metadata: { errorMsg: err?.message || String(err) } });
            if (interaction.isRepliable()) {
                try {
                    await safeReply(interaction, "Something went wrong.");
                }
                catch {
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
                logger.warn('BotCache', 'cacheMonitor', 'Discord cache above threshold', {
                    metadata: {
                        messages: messageCount,
                        members: memberCount,
                        note: "Sweepers should be reducing this - check configuration",
                    },
                });
            }
        }
        catch (err) {
            logger.warn('BotCache', 'cacheMonitor', 'Cache monitor failed', { metadata: { errorMsg: err?.message || String(err) } });
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
