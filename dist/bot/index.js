// ============================================================================
// APPLICATION LAYER IMPORTS — Bot Layer Isolation (Phase 3)
// ============================================================================
// Bot module uses Application Layer for all logging and correlation tracking.
// The Application Layer wraps Kernel primitives with Discord-specific facades.
// This ensures the bot layer never imports directly from the kernel layer.
// See docs/architecture-bible/ and src/app/ for architecture documentation.
import { appLog, withDiscordTrace, getCorrelationId } from "../app/index.js";
// NOTE: Legacy logger import removed (2025-12-26)
// Bot now uses kernel exclusively. Kernel reports to shared/logger internally,
// so all logs still reach DB/Loki. The shared/logger is kernel-integrated now.
// === Node.js Built-ins ===
import { once } from "node:events";
// === External Libraries ===
import { Client, GatewayIntentBits, Partials, Events, Options } from "discord.js";
// === Database ===
import { prisma } from "../models/index.js";
// === GameServer API ===
// SensaiOS GameServerAPI singleton for Ring 3 app isolation
// Provides controlled access to game systems with capability checking
import { initializeGameServer } from "../sensaios/gameserver/singleton.js";
// === Command Loader ===
import { loadCommands } from "../command-loader.js";
import { handleBattleActionButton, MOVE_PREFIX, SWITCH_PREFIX, FORFEIT_PREFIX } from "./battle/actions.js";
import { handleBattleChallengeButton, handleBattleChallengeCommand } from "./battle/challenge.js";
// Homestead modules (private guild channel-based gameplay)
// See docs/architecture-bible/18-private-channel-architecture.md
import { openHealScreen, handleHealConfirm, handleHealCancel, handleHeal } from "./homestead/heal.js";
import { BOX_PAGE_PREFIX, openBoxView, openPartyView, openProfileView } from "./homestead/home.js";
import { openStartersHomestead, handleStarterPick } from "./homestead/starters.js";
import { openExploreScreen, handleExploreButton } from "./homestead/explore.js";
import { handleFishingButton, isFishingButton } from "./homestead/fish.js";
import { handleTradeButton, handlePokemonSelect, isTradeButton, TRADE_BUTTON_IDS } from "./homestead/trade.js";
import { handleLeaderboardButton, isLeaderboardButton } from "./homestead/leaderboards.js";
import { handleAchievementButton, isAchievementButton } from "./homestead/achievements.js";
import { openBagScreen, handleBagButton, BAG_CATEGORY_PREFIX, BAG_PAGE_PREFIX } from "./homestead/bag.js";
import { openPokedexScreen, handlePokedexButton, DEX_REGION_PREFIX, DEX_PAGE_PREFIX } from "./homestead/pokedex.js";
import { openPartyScreen, handlePartyButton, PARTY_SLOT_PREFIX, PARTY_SET_LEAD_PREFIX } from "./homestead/party.js";
import { openStorageScreen, handleStorageButton, STORAGE_MON_PREFIX, STORAGE_PAGE_PREFIX, STORAGE_TO_PARTY_PREFIX } from "./homestead/storage.js";
import { openSettingsScreen, handleSettingsButton, SETTINGS_TOGGLE_PREFIX } from "./homestead/settings.js";
import { openDailyScreen, handleDailyButton } from "./homestead/daily.js";
import { openShopScreen, handleShopButton, SHOP_CATEGORY_PREFIX, SHOP_BUY_PREFIX } from "./homestead/shop.js";
import { HomesteadChannelManager } from "../services/homestead-manager.js";
import { handleOpsCommand, isAdmin } from "./ops/admin.js";
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
        appLog.warn('bot/index', 'Discord bot token not provided; skipping bot startup');
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
    // GAMESERVER INITIALIZATION: Initialize GameServerAPI for Ring 3 app isolation
    // This must happen before any interaction handlers use the API
    // Provides controlled access to game systems with capability checking and rate limiting
    await initializeGameServer(prisma);
    appLog.info('bot/index', 'GameServerAPI initialized for Ring 3 app isolation');
    // OPTIMIZATION: Lazy-load commands on first interaction (saves ~500-1000ms on startup)
    // BEFORE: const commands = await loadCommands(); (blocking, loads 50+ command modules upfront)
    // AFTER: Load on-demand when first interaction arrives (non-blocking startup)
    let commands = null;
    async function ensureCommandsLoaded() {
        if (!commands) {
            const loadStart = process.hrtime.bigint();
            commands = await loadCommands();
            const loadDurationMs = Number(process.hrtime.bigint() - loadStart) / 1_000_000;
            appLog.info('bot/index', `Commands loaded lazily (${loadDurationMs.toFixed(1)}ms, ${commands.size} commands)`);
        }
        return commands;
    }
    const readyPromise = once(client, Events.ClientReady);
    client.once(Events.ClientReady, () => {
        appLog.info('bot/index', `Discord bot is ready: ${client.user?.tag} (lazy commands enabled)`);
    });
    client.on("interactionCreate", async (interaction) => {
        // Phase 3: Wrap entire interaction in correlation trace via Application Layer
        const operation = interaction.isCommand()
            ? `cmd:${interaction.commandName}`
            : `btn:${interaction.customId?.slice(0, 20) || 'unknown'}`;
        await withDiscordTrace({
            interactionId: interaction.id,
            userId: interaction.user.id,
            guildId: interaction.guildId,
            operation,
        }, async () => {
            try {
                if (interaction.isChatInputCommand()) {
                    // DEV-ONLY GATE: Only /start is available to regular players
                    // All other slash commands require dev/admin privileges
                    // Per Game Design Bible: Button-first gameplay, minimal slash commands
                    const isDevCommand = interaction.commandName !== "start";
                    if (isDevCommand && !isAdmin(interaction)) {
                        await replyError(interaction, "🚫 This command is for developers only.\n\n🎮 **Players:** Use `/start` to begin your adventure!");
                        return;
                    }
                    // /start - The ONLY player-facing slash command
                    // Opens homestead channel where all gameplay happens via buttons
                    if (interaction.commandName === "start") {
                        if (interaction.guildId) {
                            // Open homestead and trigger starter selection if needed
                            await openStartersHomestead(client, interaction.guildId, interaction.user);
                            await replySuccess(interaction, "🏠 Welcome! Check your homestead channel to begin your Pokémon adventure.");
                        }
                        else {
                            await replyError(interaction, "This command must be used in a server.");
                        }
                        return;
                    }
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
                            // Trigger open starter selection flow (800+ Pokémon choices)
                            await openStartersHomestead(client, interaction.guildId, interaction.user);
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
                            // Open heal screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openHealScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "💊 Opening Pokémon Center...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "HEAL_CONFIRM":
                            await handleHealConfirm(interaction);
                            break;
                        case "HEAL_CANCEL":
                            await handleHealCancel(interaction);
                            break;
                        case "HOME_EXPLORE":
                            // Open explore screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openExploreScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "🌲 Opening exploration options...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "EXPLORE_WALK":
                        case "EXPLORE_FISH":
                        case "EXPLORE_BACK":
                            await handleExploreButton(interaction);
                            break;
                        case "HOME_PARTY":
                            // Open party screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openPartyScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "📋 Opening your party...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "HOME_BOX":
                            await openBoxView(interaction, { page: 1 });
                            break;
                        case "HOME_PROFILE":
                            await openProfileView(interaction);
                            break;
                        case "HOME_BAG":
                            // Open bag screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openBagScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "🎒 Opening your bag...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "HOME_SHOP":
                            // Open shop screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openShopScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "🛒 Opening the Poké Mart...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "HOME_POKEDEX":
                            // Open Pokédex screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openPokedexScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "📖 Opening your Pokédex...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "HOME_STORAGE":
                        case "STORAGE_HOME":
                            // Open/return to storage screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openStorageScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "📦 Opening your storage...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "HOME_SETTINGS":
                        case "SETTINGS_BACK":
                            // Open/return to settings screen per Game Design Bible § 6
                            if (interaction.guildId) {
                                await openSettingsScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "⚙️ Opening settings...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "HOME_DAILY":
                        case "DAILY_BACK":
                            // Open/return to daily rewards screen
                            if (interaction.guildId) {
                                await openDailyScreen(interaction.client, interaction.guildId, interaction.user);
                                await interaction.reply({ content: "🎁 Opening daily rewards...", ephemeral: true });
                            }
                            else {
                                await interaction.reply({ content: "This action must be used in a server.", ephemeral: true });
                            }
                            break;
                        case "BAG_BACK":
                        case "DEX_BACK":
                            // Return to home screen - update with party view
                            await openPartyView(interaction);
                            break;
                        case "HOME_STARTERS":
                            if (interaction.guildId) {
                                // Trigger open starter selection flow (800+ Pokémon choices)
                                await openStartersHomestead(client, interaction.guildId, interaction.user);
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
                            // Bag button handlers: BAG_CAT_<category>, BAG_PAGE_<category>_<page>
                            if (id.startsWith(BAG_CATEGORY_PREFIX) || id.startsWith(BAG_PAGE_PREFIX)) {
                                await handleBagButton(interaction);
                                break;
                            }
                            // Shop button handlers: SHOP_CAT_<category>, SHOP_BUY_<item>, SHOP_BACK
                            if (id.startsWith(SHOP_CATEGORY_PREFIX) || id.startsWith(SHOP_BUY_PREFIX) || id === "SHOP_BACK") {
                                if (id === "SHOP_BACK" && interaction.guildId) {
                                    // Return to home screen
                                    await openPartyView(interaction);
                                }
                                else {
                                    const manager = new HomesteadChannelManager(interaction.client, interaction.guildId);
                                    await handleShopButton(interaction, manager);
                                }
                                break;
                            }
                            // Pokédex button handlers: DEX_REGION_<region>, DEX_PAGE_<region>_<page>
                            if (id.startsWith(DEX_REGION_PREFIX) || id.startsWith(DEX_PAGE_PREFIX)) {
                                await handlePokedexButton(interaction);
                                break;
                            }
                            // Party button handlers: PARTY_SLOT_<slot>, PARTY_SET_LEAD_<slot>, PARTY_BACK, PARTY_DETAIL_BACK
                            if (id.startsWith(PARTY_SLOT_PREFIX) || id.startsWith(PARTY_SET_LEAD_PREFIX) || id === "PARTY_BACK" || id === "PARTY_DETAIL_BACK") {
                                await handlePartyButton(interaction);
                                break;
                            }
                            // Storage button handlers: STORAGE_MON_<id>, STORAGE_PAGE_<n>, STORAGE_TO_PARTY_<id>, STORAGE_BACK
                            if (id.startsWith(STORAGE_MON_PREFIX) || id.startsWith(STORAGE_PAGE_PREFIX) || id.startsWith(STORAGE_TO_PARTY_PREFIX) || id === "STORAGE_BACK") {
                                await handleStorageButton(interaction);
                                break;
                            } // Settings button handlers: SETTINGS_TOGGLE_<setting>
                            if (id.startsWith(SETTINGS_TOGGLE_PREFIX)) {
                                await handleSettingsButton(interaction);
                                break;
                            }
                            // Daily button handlers: DAILY_CLAIM
                            if (id === "DAILY_CLAIM") {
                                await handleDailyButton(interaction);
                                break;
                            } // Legacy starter pick buttons: STARTER_PICK_<speciesId>
                            // Note: New open starter selection uses message collector, not buttons
                            // This handler is kept for backwards compatibility with any existing button messages
                            if (id.startsWith("STARTER_PICK_")) {
                                const sid = Number(id.substring("STARTER_PICK_".length));
                                // Validate using starter-validation rules
                                const { isForbiddenStarter } = await import("../core/starter-validation.js");
                                if (isNaN(sid) || isForbiddenStarter(sid)) {
                                    await interaction.reply({ content: "That Pokémon can't be used as a starter.", ephemeral: true });
                                    return;
                                }
                                await handleStarterPick(interaction, sid);
                            }
                            // Encounter controls: ENCOUNTER_THROW_<id>, ENCOUNTER_RUN_<id>, ENCOUNTER_SWAP_<id>
                            if (id.startsWith("ENCOUNTER_")) {
                                await handleEncounterButton(interaction);
                            }
                            // Fishing controls: FISH_CAST, FISH_REEL_EARLY, FISH_REEL_BITE, FISH_TRY_AGAIN, FISH_BACK
                            if (isFishingButton(id)) {
                                await handleFishingButton(interaction);
                            }
                            // Trading controls: trade_accept, trade_decline, trade_select, trade_confirm, trade_cancel
                            if (isTradeButton(id)) {
                                await handleTradeButton(interaction);
                            }
                            // Leaderboard controls: LB_* buttons
                            if (isLeaderboardButton(id)) {
                                await handleLeaderboardButton(interaction);
                            }
                            // Achievement controls: ACH_* buttons
                            if (isAchievementButton(id)) {
                                await handleAchievementButton(interaction);
                            }
                            break;
                    }
                    return;
                }
                // Handle StringSelectMenu interactions (e.g., trade pokemon selection)
                if (interaction.isStringSelectMenu()) {
                    const id = interaction.customId;
                    // Trade pokemon selection: trade_pokemon_select:<sessionId>
                    if (id.startsWith(TRADE_BUTTON_IDS.POKEMON_SELECT_MENU)) {
                        await handlePokemonSelect(interaction);
                        return;
                    }
                }
            }
            catch (err) {
                const correlationId = getCorrelationId();
                appLog.error('bot/index', `Interaction handler error: ${err?.message || String(err)}`, { correlationId, stack: err instanceof Error ? err.stack : undefined });
                if (interaction.isRepliable()) {
                    try {
                        await safeReply(interaction, "Something went wrong.");
                    }
                    catch {
                        // Ignore secondary reply errors; the primary failure is already logged.
                    }
                }
            }
        } // end withDiscordTrace callback
        ); // end withDiscordTrace
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
                appLog.warn('bot/index', `Discord cache above threshold: messages=${messageCount}, members=${memberCount}. Sweepers should be reducing this.`);
            }
        }
        catch (err) {
            appLog.warn('bot/index', `Cache monitor failed: ${err?.message || String(err)}`);
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
