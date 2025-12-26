/**
 * Homestead Fishing Module
 * 
 * Implements the FISHING mini-game per Game Design Bible doc 24.
 * Cast → Wait → Bite! → Reel → Encounter flow.
 * 
 * SCREEN FLOW (per Bible):
 * 1. Idle Screen - Show rod, [Cast Line] button
 * 2. Waiting Screen - Line in water, waiting for bite
 * 3. Bite Alert Screen - URGENT! React within 3 seconds
 * 4. Success/Fail Screen - Hooked or escaped
 * 
 * @module homestead/fish
 */

// === CRITICAL: Logger & Error Handling MUST be first imports ===
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();

// === External Libraries ===
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Message,
} from "discord.js";

// === Internal Imports ===
import { EMBED_COLORS } from "../shared/embed-colors.js";
import { primaryButton, secondaryButton, dangerButton } from "../shared/button-utils.js";
import { safeReply, safeReplyWithPayload } from "../shared/response-helpers.js";
import { HomesteadChannelManager as _HomesteadChannelManager } from "../../services/homestead-manager.js";
import {
  getBestRod,
  getRodInfo,
  getFishingSession,
  startFishingSession,
  castLine,
  checkForBite,
  reelIn,
  reelInEarly,
  resetToIdle,
  endFishingSession,
  rollFishingEncounter,
  getCurrentShinyRate,
  recordFishingStat,
  FISHING_CONFIG,
  type RodTier,
} from "../../services/fishing.js";
import { spawnFishingEncounter } from "../../core/encounter/spawn.js";
import { openEncounterDM } from "../wilds/controls.js";

// ============================================================================
// BUTTON IDS
// ============================================================================

export const FISH_BUTTON_IDS = {
  CAST: "FISH_CAST",
  REEL_EARLY: "FISH_REEL_EARLY",
  REEL_BITE: "FISH_REEL_BITE",
  TRY_AGAIN: "FISH_TRY_AGAIN",
  BACK: "FISH_BACK",
} as const;

// ============================================================================
// EMBED BUILDERS
// ============================================================================

/**
 * Build fishing idle screen embed
 */
export function buildFishingIdleEmbed(rodTier: RodTier, chainCount: number): EmbedBuilder {
  const rodInfo = getRodInfo(rodTier);
  const shinyInfo = getCurrentShinyRate(chainCount);
  
  const embed = new EmbedBuilder()
    .setTitle("🎣 FISHING SPOT")
    .setColor(EMBED_COLORS.INFO)
    .setDescription(
      `**Your Rod:** ${rodInfo.name}\n` +
      `**Catch Rate:** ${rodInfo.stars} (${rodInfo.description})\n\n` +
      `🌊 The water looks calm...\n\n` +
      `Cast your line to start fishing!`
    );
  
  if (chainCount > 0) {
    embed.addFields({
      name: "✨ Chain Bonus",
      value: `Cast #${chainCount + 1} | Shiny Rate: ${shinyInfo.display}`,
      inline: true,
    });
  }
  
  return embed;
}

/**
 * Build fishing waiting screen embed
 */
export function buildFishingWaitingEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎣 FISHING...")
    .setColor(EMBED_COLORS.WARNING)
    .setDescription(
      `Your line is in the water\n\n` +
      `🌊~~~~~~~~~~~~🎣\n\n` +
      `Watch for movement!`
    );
}

/**
 * Build bite alert screen embed (URGENT)
 */
export function buildFishingBiteEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎣 ❗❗❗ SOMETHING'S BITING! ❗❗❗")
    .setColor(EMBED_COLORS.ERROR) // Red for urgency
    .setDescription(
      `🌊💥~~~~~~~~🎣\n\n` +
      `**QUICK!** Reel it in before it escapes!\n\n` +
      `⏱️ React within 3 seconds!`
    );
}

/**
 * Build nothing biting screen embed
 */
export function buildFishingNothingEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎣 FISHING")
    .setColor(EMBED_COLORS.WARNING)
    .setDescription(
      `🌊 Nothing seems to be biting...\n\n` +
      `Try casting again?`
    );
}

/**
 * Build fish escaped screen embed
 */
export function buildFishingEscapedEmbed(reason: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎣 FISHING")
    .setColor(EMBED_COLORS.ERROR)
    .setDescription(
      `💨 The Pokémon got away!\n\n` +
      `${reason}\n\n` +
      `Your chain has been broken.`
    );
}

/**
 * Build fish hooked success screen embed
 */
export function buildFishingHookedEmbed(reactionMs: number): EmbedBuilder {
  const speedRating = reactionMs < 500 ? "⚡ Lightning fast!" : 
                      reactionMs < 1000 ? "🔥 Great reflexes!" :
                      reactionMs < 2000 ? "👍 Nice catch!" : "😅 Just in time!";
  
  return new EmbedBuilder()
    .setTitle("🎣 HOOKED!")
    .setColor(EMBED_COLORS.SUCCESS)
    .setDescription(
      `You reeled in something!\n\n` +
      `${speedRating} (${reactionMs}ms)\n\n` +
      `A wild Pokémon emerged from the water!`
    );
}

/**
 * Build no rod screen embed
 */
export function buildNoRodEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎣 FISHING")
    .setColor(EMBED_COLORS.ERROR)
    .setDescription(
      `❌ You don't have a Fishing Rod!\n\n` +
      `Visit the **Shop** to buy an Old Rod for 500₽.`
    );
}

// ============================================================================
// BUTTON BUILDERS
// ============================================================================

/**
 * Build fishing idle screen buttons
 */
export function buildFishingIdleButtons(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      primaryButton(FISH_BUTTON_IDS.CAST, "🎣 Cast Line"),
      dangerButton(FISH_BUTTON_IDS.BACK, "🏠 Back")
    ),
  ];
}

/**
 * Build fishing waiting screen buttons
 */
export function buildFishingWaitingButtons(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      secondaryButton(FISH_BUTTON_IDS.REEL_EARLY, "❌ Reel In")
    ),
  ];
}

/**
 * Build bite alert screen buttons (URGENT styling)
 */
export function buildFishingBiteButtons(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(FISH_BUTTON_IDS.REEL_BITE)
        .setLabel("⚡ REEL IT IN!")
        .setStyle(ButtonStyle.Success)
    ),
  ];
}

/**
 * Build try again/back buttons
 */
export function buildFishingRetryButtons(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      primaryButton(FISH_BUTTON_IDS.TRY_AGAIN, "🎣 Cast Again"),
      dangerButton(FISH_BUTTON_IDS.BACK, "🏠 Back")
    ),
  ];
}

/**
 * Build back only button
 */
export function buildFishingBackButton(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      dangerButton(FISH_BUTTON_IDS.BACK, "🏠 Back")
    ),
  ];
}

// ============================================================================
// FISHING FLOW HANDLERS
// ============================================================================

/**
 * Open the fishing screen
 * Called from explore.ts when user clicks [🎣 Fish]
 */
export async function openFishingScreen(
  interaction: ButtonInteraction
): Promise<void> {
  const discordId = interaction.user.id;
  
  try {
    // Check if user has a rod
    const rodTier = await getBestRod(discordId);
    
    if (!rodTier) {
      // No rod - show message
      await safeReplyWithPayload(interaction, {
        embeds: [buildNoRodEmbed()],
        components: buildFishingBackButton(),
      });
      return;
    }
    
    // Start or get fishing session
    const sessionResult = await startFishingSession(discordId);
    
    if ('error' in sessionResult) {
      await safeReply(interaction, `❌ ${sessionResult.error}`, { ephemeral: true });
      return;
    }
    
    const session = sessionResult;
    
    // Show idle screen
    await safeReplyWithPayload(interaction, {
      embeds: [buildFishingIdleEmbed(session.rodTier, session.chainCount)],
      components: buildFishingIdleButtons(),
    });
    
    logger.info('HomesteadFishing', 'openFishingScreen', 'Opened fishing screen', {
      userId: discordId,
      metadata: { rodTier: session.rodTier, chainCount: session.chainCount },
    });
  } catch (error) {
    logger.error('HomesteadFishing', 'openFishingScreen', 'Failed to open fishing screen', {
      userId: discordId,
      metadata: { error },
    });
    await safeReply(interaction, "❌ Something went wrong. Try again.", { ephemeral: true });
  }
}

/**
 * Handle cast line button
 */
export async function handleCastLine(
  interaction: ButtonInteraction
): Promise<void> {
  const discordId = interaction.user.id;
  
  try {
    const castResult = castLine(discordId);
    
    if ('error' in castResult) {
      await safeReply(interaction, `❌ ${castResult.error}`, { ephemeral: true });
      return;
    }
    
    recordFishingStat("cast");
    
    // Update to waiting screen (use interaction.update for button interactions)
    await interaction.update({
      embeds: [buildFishingWaitingEmbed()],
      components: buildFishingWaitingButtons(),
    });
    
    // Schedule bite check after wait duration
    const waitMs = castResult.waitMs;
    
    setTimeout(async () => {
      await triggerBiteCheck(interaction, discordId);
    }, waitMs);
    
    logger.info('HomesteadFishing', 'handleCastLine', 'Cast line', {
      userId: discordId,
      metadata: { waitMs: Math.round(waitMs) },
    });
  } catch (error) {
    logger.error('HomesteadFishing', 'handleCastLine', 'Failed to cast line', {
      userId: discordId,
      metadata: { error },
    });
    await safeReply(interaction, "❌ Something went wrong. Try again.", { ephemeral: true });
  }
}

/**
 * Trigger bite check after wait duration
 * Updates the message to bite alert or nothing
 */
async function triggerBiteCheck(
  originalInteraction: ButtonInteraction,
  discordId: string
): Promise<void> {
  try {
    const session = getFishingSession(discordId);
    
    // Session may have ended (user left, etc)
    if (!session || session.state !== "waiting") {
      return;
    }
    
    const biteResult = checkForBite(discordId);
    
    if ('error' in biteResult) {
      return;
    }
    
    // Get the message to edit
    const message = originalInteraction.message;
    if (!message) return;
    
    if ('nothing' in biteResult) {
      // Nothing biting
      await message.edit({
        embeds: [buildFishingNothingEmbed()],
        components: buildFishingRetryButtons(),
      });
      return;
    }
    
    // Bite! Show urgent alert
    await message.edit({
      embeds: [buildFishingBiteEmbed()],
      components: buildFishingBiteButtons(),
    });
    
    // Schedule escape after bite window
    setTimeout(async () => {
      await triggerEscapeCheck(message, discordId);
    }, FISHING_CONFIG.BITE_WINDOW_MS);
    
  } catch (error) {
    logger.error('HomesteadFishing', 'triggerBiteCheck', 'Failed to check bite', {
      userId: discordId,
      metadata: { error },
    });
  }
}

/**
 * Check if fish escaped (timed out)
 */
async function triggerEscapeCheck(
  message: Message,
  discordId: string
): Promise<void> {
  try {
    const session = getFishingSession(discordId);
    
    // If still in bite state, they didn't react in time
    if (session?.state === "bite") {
      // Force escape
      reelIn(discordId); // This will set state to escaped
      recordFishingStat("escape");
      
      await message.edit({
        embeds: [buildFishingEscapedEmbed("You weren't fast enough...")],
        components: buildFishingRetryButtons(),
      });
    }
  } catch (error) {
    logger.error('HomesteadFishing', 'triggerEscapeCheck', 'Failed escape check', {
      userId: discordId,
      metadata: { error },
    });
  }
}

/**
 * Handle reel in bite button (player reacted!)
 */
export async function handleReelBite(
  interaction: ButtonInteraction
): Promise<void> {
  const discordId = interaction.user.id;
  
  try {
    const reelResult = reelIn(discordId);
    
    if ('error' in reelResult) {
      await safeReply(interaction, `❌ ${reelResult.error}`, { ephemeral: true });
      return;
    }
    
    if ('escaped' in reelResult) {
      recordFishingStat("escape");
      await interaction.update({
        embeds: [buildFishingEscapedEmbed(reelResult.reason)],
        components: buildFishingRetryButtons(),
      });
      return;
    }
    
    // Success! Generate encounter
    const session = getFishingSession(discordId);
    if (!session) {
      await safeReply(interaction, "❌ Fishing session expired.", { ephemeral: true });
      return;
    }
    
    recordFishingStat("catch");
    
    // Show hooked screen briefly
    await interaction.update({
      embeds: [buildFishingHookedEmbed(reelResult.reactionMs)],
      components: [],
    });
    
    // Generate fishing encounter
    const fishData = rollFishingEncounter(session);
    
    // Spawn the encounter in database
    if (!interaction.guildId) {
      await safeReply(interaction, "❌ Cannot fish outside of a server.", { ephemeral: true });
      return;
    }
    
    // Create encounter and open controls
    const encounter = await spawnFishingEncounter({
      discordId,
      speciesId: fishData.speciesId,
      level: fishData.level,
      isShiny: fishData.isShiny,
    });
    
    await openEncounterDM(interaction.client, interaction.guildId, interaction.user, encounter.id);
    
    // Reset session for next cast
    resetToIdle(discordId);
    
    logger.info('HomesteadFishing', 'handleReelBite', 'Fish caught, encounter started', {
      userId: discordId,
      metadata: { 
        speciesId: fishData.speciesId,
        level: fishData.level,
        isShiny: fishData.isShiny,
        rarity: fishData.rarity,
        reactionMs: reelResult.reactionMs,
      },
    });
  } catch (error) {
    logger.error('HomesteadFishing', 'handleReelBite', 'Failed to reel bite', {
      userId: discordId,
      metadata: { error },
    });
    await safeReply(interaction, "❌ Something went wrong. Try again.", { ephemeral: true });
  }
}

/**
 * Handle reel in early button (cancel fishing)
 */
export async function handleReelEarly(
  interaction: ButtonInteraction
): Promise<void> {
  const discordId = interaction.user.id;
  
  try {
    const result = reelInEarly(discordId);
    
    if ('error' in result) {
      await safeReply(interaction, `❌ ${result.error}`, { ephemeral: true });
      return;
    }
    
    const session = getFishingSession(discordId);
    
    // Back to idle screen
    await interaction.update({
      embeds: [buildFishingIdleEmbed(session?.rodTier ?? "OLD_ROD", session?.chainCount ?? 0)],
      components: buildFishingIdleButtons(),
    });
    
    logger.info('HomesteadFishing', 'handleReelEarly', 'Reeled in early', {
      userId: discordId,
      metadata: {},
    });
  } catch (error) {
    logger.error('HomesteadFishing', 'handleReelEarly', 'Failed to reel early', {
      userId: discordId,
      metadata: { error },
    });
    await safeReply(interaction, "❌ Something went wrong. Try again.", { ephemeral: true });
  }
}

/**
 * Handle try again button
 */
export async function handleTryAgain(
  interaction: ButtonInteraction
): Promise<void> {
  const discordId = interaction.user.id;
  
  try {
    // Reset to idle and show idle screen
    resetToIdle(discordId);
    
    const session = getFishingSession(discordId);
    
    if (!session) {
      // Session expired, restart
      const newSession = await startFishingSession(discordId);
      if ('error' in newSession) {
        await safeReply(interaction, `❌ ${newSession.error}`, { ephemeral: true });
        return;
      }
      
      await interaction.update({
        embeds: [buildFishingIdleEmbed(newSession.rodTier, newSession.chainCount)],
        components: buildFishingIdleButtons(),
      });
      return;
    }
    
    await interaction.update({
      embeds: [buildFishingIdleEmbed(session.rodTier, session.chainCount)],
      components: buildFishingIdleButtons(),
    });
    
  } catch (error) {
    logger.error('HomesteadFishing', 'handleTryAgain', 'Failed to try again', {
      userId: discordId,
      metadata: { error },
    });
    await safeReply(interaction, "❌ Something went wrong. Try again.", { ephemeral: true });
  }
}

/**
 * Handle back button (return to explore)
 */
export async function handleFishingBack(
  interaction: ButtonInteraction
): Promise<void> {
  const discordId = interaction.user.id;
  
  // End fishing session
  endFishingSession(discordId);
  
  // Return to explore screen
  await safeReply(interaction, "🏠 Returning to explore...", { ephemeral: true });
  
  if (interaction.guildId) {
    const { openExploreScreen } = await import("./explore.js");
    await openExploreScreen(interaction.client, interaction.guildId, interaction.user);
  }
}

/**
 * Main fishing button handler
 * Routes to appropriate handler based on button ID
 */
export async function handleFishingButton(
  interaction: ButtonInteraction
): Promise<void> {
  const id = interaction.customId;
  
  switch (id) {
    case FISH_BUTTON_IDS.CAST:
      await handleCastLine(interaction);
      break;
    case FISH_BUTTON_IDS.REEL_EARLY:
      await handleReelEarly(interaction);
      break;
    case FISH_BUTTON_IDS.REEL_BITE:
      await handleReelBite(interaction);
      break;
    case FISH_BUTTON_IDS.TRY_AGAIN:
      await handleTryAgain(interaction);
      break;
    case FISH_BUTTON_IDS.BACK:
      await handleFishingBack(interaction);
      break;
    default:
      logger.warn('HomesteadFishing', 'handleFishingButton', 'Unknown fishing button', {
        userId: interaction.user.id,
        metadata: { buttonId: id },
      });
  }
}

/**
 * Check if a button ID belongs to fishing
 */
export function isFishingButton(customId: string): boolean {
  return customId.startsWith("FISH_");
}
