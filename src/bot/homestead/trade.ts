/**
 * Trading UI Module
 * 
 * Handles all Discord interactions for the P2P trading system.
 * Creates trade room embeds, handles pokemon selection, and manages confirmations.
 * 
 * FLOW (per doc 25):
 * 1. /trade @user → Opens invite UI
 * 2. Recipient accepts → Both get trade room embeds
 * 3. Each selects a Pokémon from their collection
 * 4. Both confirm → Trade executes
 * 
 * @module bot/homestead/trade
 */

// === CRITICAL: Logger & Error Handling MUST be first imports ===
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();

// === Discord.js Imports ===
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  User,
} from "discord.js";

// === Application Imports ===
import {
  TradeSession,
  getTradeSession as _getTradeSession,
  getUserTradeSession,
  acceptTradeInvite,
  declineTradeInvite,
  selectTradeOffer,
  confirmTrade,
  cancelTrade,
  executeTrade,
  getTradeablePokemon,
} from "../../services/trading.js";
import { getSpecies } from "../../data/dexpack.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Button IDs for trade interactions
 */
export const TRADE_BUTTON_IDS = {
  // Invite actions
  ACCEPT_INVITE: "trade_accept",
  DECLINE_INVITE: "trade_decline",
  
  // Trade room actions
  SELECT_POKEMON: "trade_select",
  CONFIRM_TRADE: "trade_confirm",
  CANCEL_TRADE: "trade_cancel",
  
  // Pokemon selection
  POKEMON_SELECT_MENU: "trade_pokemon_select",
} as const;

/**
 * Check if a custom ID is a trade button
 */
export function isTradeButton(customId: string): boolean {
  return customId.startsWith("trade_");
}

// ============================================================================
// EMBED BUILDERS
// ============================================================================

/**
 * Build the trade invite embed (sent to recipient)
 */
export function buildTradeInviteEmbed(
  initiator: User,
  session: TradeSession
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle("🔄 Trade Request!")
    .setDescription(`**${initiator.username}** wants to trade Pokémon with you!`)
    .addFields(
      { name: "⏱️ Expires", value: `<t:${Math.floor(session.expiresAt.getTime() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: "Accept to open the trade room" })
    .setTimestamp();
}

/**
 * Build the trade room embed for a participant
 */
export function buildTradeRoomEmbed(
  session: TradeSession,
  viewerId: string,
  initiatorUser: User,
  recipientUser: User
): EmbedBuilder {
  const isInitiator = viewerId === session.initiatorId;
  const otherUser = isInitiator ? recipientUser : initiatorUser;
  
  // Get species names if pokemon selected
  let _yourOffer = "Not selected";
  let _theirOffer = "Not selected";
  
  const yourPokemonId = isInitiator ? session.initiatorPokemonId : session.recipientPokemonId;
  const theirPokemonId = isInitiator ? session.recipientPokemonId : session.initiatorPokemonId;
  const yourConfirmed = isInitiator ? session.initiatorConfirmed : session.recipientConfirmed;
  const theirConfirmed = isInitiator ? session.recipientConfirmed : session.initiatorConfirmed;
  
  // Build status string
  let statusText: string;
  switch (session.status) {
    case "ACTIVE":
      statusText = "📋 Select your Pokémon to offer";
      break;
    case "CONFIRMING":
      if (yourConfirmed && theirConfirmed) {
        statusText = "⚡ Trade executing...";
      } else if (yourConfirmed) {
        statusText = "⏳ Waiting for partner to confirm";
      } else if (theirConfirmed) {
        statusText = "❗ Partner confirmed - Your turn to confirm!";
      } else {
        statusText = "🔍 Review offers and confirm when ready";
      }
      break;
    case "COMPLETED":
      statusText = "✅ Trade completed!";
      break;
    case "CANCELLED":
      statusText = "❌ Trade cancelled";
      break;
    case "EXPIRED":
      statusText = "⏰ Trade session expired";
      break;
    default:
      statusText = "Trade in progress...";
  }
  
  const embed = new EmbedBuilder()
    .setColor(session.status === "COMPLETED" ? 0x2ECC71 : session.status === "CANCELLED" ? 0xE74C3C : 0x3498DB)
    .setTitle(`🔄 Trade Room with ${otherUser.username}`)
    .setDescription(statusText)
    .addFields(
      { 
        name: `📤 Your Offer ${yourConfirmed ? "✅" : ""}`, 
        value: yourPokemonId ? `Selected (ID: ${yourPokemonId.slice(0, 8)}...)` : "Not selected", 
        inline: true 
      },
      { 
        name: `📥 Their Offer ${theirConfirmed ? "✅" : ""}`, 
        value: theirPokemonId ? `Selected (ID: ${theirPokemonId.slice(0, 8)}...)` : "Not selected", 
        inline: true 
      }
    )
    .setFooter({ text: `Session: ${session.id.slice(0, 12)}... | Expires <t:${Math.floor(session.expiresAt.getTime() / 1000)}:R>` })
    .setTimestamp();
  
  return embed;
}

/**
 * Build the trade complete embed
 */
export function buildTradeCompleteEmbed(
  session: TradeSession,
  viewerId: string,
  initiatorUser: User,
  recipientUser: User
): EmbedBuilder {
  const isInitiator = viewerId === session.initiatorId;
  const otherUser = isInitiator ? recipientUser : initiatorUser;
  
  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle("✅ Trade Complete!")
    .setDescription(`You successfully traded with **${otherUser.username}**!`)
    .addFields(
      { name: "📤 You Sent", value: `Pokémon ID: ${isInitiator ? session.initiatorPokemonId?.slice(0, 12) : session.recipientPokemonId?.slice(0, 12)}...`, inline: true },
      { name: "📥 You Received", value: `Pokémon ID: ${isInitiator ? session.recipientPokemonId?.slice(0, 12) : session.initiatorPokemonId?.slice(0, 12)}...`, inline: true }
    )
    .setFooter({ text: "Check your storage to see your new Pokémon!" })
    .setTimestamp();
}

// ============================================================================
// COMPONENT BUILDERS
// ============================================================================

/**
 * Build invite response buttons
 */
export function buildInviteButtons(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`${TRADE_BUTTON_IDS.ACCEPT_INVITE}:${sessionId}`)
        .setLabel("Accept Trade")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`${TRADE_BUTTON_IDS.DECLINE_INVITE}:${sessionId}`)
        .setLabel("Decline")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌")
    );
}

/**
 * Build trade room action buttons
 */
export function buildTradeRoomButtons(
  sessionId: string,
  hasSelected: boolean,
  hasConfirmed: boolean,
  canConfirm: boolean
): ActionRowBuilder<ButtonBuilder> {
  const buttons: ButtonBuilder[] = [];
  
  // Select Pokemon button
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${TRADE_BUTTON_IDS.SELECT_POKEMON}:${sessionId}`)
      .setLabel(hasSelected ? "Change Selection" : "Select Pokémon")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📋")
  );
  
  // Confirm button (only if can confirm)
  if (canConfirm) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${TRADE_BUTTON_IDS.CONFIRM_TRADE}:${sessionId}`)
        .setLabel("Confirm Trade")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
        .setDisabled(hasConfirmed)
    );
  }
  
  // Cancel button
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${TRADE_BUTTON_IDS.CANCEL_TRADE}:${sessionId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🚫")
  );
  
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

/**
 * Build pokemon selection dropdown
 */
export async function buildPokemonSelectMenu(
  discordId: string,
  sessionId: string
): Promise<ActionRowBuilder<StringSelectMenuBuilder> | null> {
  const pokemon = await getTradeablePokemon(discordId);
  
  if (pokemon.length === 0) {
    return null;
  }
  
  const options = pokemon.slice(0, 25).map(p => {
    const species = getSpecies(p.speciesId);
    const shinyTag = p.isShiny ? " ✨" : "";
    const nickname = p.nickname ? ` "${p.nickname}"` : "";
    
    return {
      label: `${species?.name ?? `#${p.speciesId}`}${nickname}${shinyTag}`,
      description: `Level ${p.level}`,
      value: p.id,
      emoji: p.isShiny ? "✨" : undefined,
    };
  });
  
  return new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`${TRADE_BUTTON_IDS.POKEMON_SELECT_MENU}:${sessionId}`)
        .setPlaceholder("Choose a Pokémon to offer...")
        .addOptions(options)
    );
}

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

/**
 * Handle all trade button interactions
 */
export async function handleTradeButton(
  interaction: ButtonInteraction
): Promise<void> {
  const [action, sessionId] = interaction.customId.split(":");
  const userId = interaction.user.id;
  
  logger.info('TradeUI', 'handleTradeButton', 'Processing trade button', {
    userId,
    metadata: { action, sessionId },
  });
  
  try {
    switch (action) {
      case TRADE_BUTTON_IDS.ACCEPT_INVITE:
        await handleAcceptInvite(interaction, sessionId);
        break;
        
      case TRADE_BUTTON_IDS.DECLINE_INVITE:
        await handleDeclineInvite(interaction, sessionId);
        break;
        
      case TRADE_BUTTON_IDS.SELECT_POKEMON:
        await handleSelectPokemon(interaction, sessionId);
        break;
        
      case TRADE_BUTTON_IDS.CONFIRM_TRADE:
        await handleConfirmTrade(interaction, sessionId);
        break;
        
      case TRADE_BUTTON_IDS.CANCEL_TRADE:
        await handleCancelTrade(interaction, sessionId);
        break;
        
      default:
        await interaction.reply({ content: "Unknown trade action.", ephemeral: true });
    }
  } catch (error) {
    logger.error('TradeUI', 'handleTradeButton', 'Trade button error', {
      userId,
      metadata: { action, sessionId, error },
    });
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "Something went wrong. Please try again.", ephemeral: true });
    } else {
      await interaction.reply({ content: "Something went wrong. Please try again.", ephemeral: true });
    }
  }
}

/**
 * Handle accept invite
 */
async function handleAcceptInvite(
  interaction: ButtonInteraction,
  sessionId: string
): Promise<void> {
  const result = acceptTradeInvite(sessionId, interaction.user.id, interaction.channelId);
  
  if ('error' in result) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }
  
  // Update the invite message
  await interaction.update({
    content: "✅ Trade accepted! Opening trade room...",
    embeds: [],
    components: [],
  });
  
  // Send trade room message to recipient
  const session = result;
  const initiator = await interaction.client.users.fetch(session.initiatorId);
  const isInitiator = interaction.user.id === session.initiatorId;
  const hasSelected = isInitiator ? !!session.initiatorPokemonId : !!session.recipientPokemonId;
  const hasConfirmed = isInitiator ? session.initiatorConfirmed : session.recipientConfirmed;
  const canConfirm = session.status === "CONFIRMING";
  
  await interaction.followUp({
    embeds: [buildTradeRoomEmbed(session, interaction.user.id, initiator, interaction.user)],
    components: [buildTradeRoomButtons(sessionId, hasSelected, hasConfirmed, canConfirm)],
    ephemeral: true,
  });
}

/**
 * Handle decline invite
 */
async function handleDeclineInvite(
  interaction: ButtonInteraction,
  sessionId: string
): Promise<void> {
  const result = declineTradeInvite(sessionId, interaction.user.id);
  
  if ('error' in result) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }
  
  await interaction.update({
    content: "❌ Trade declined.",
    embeds: [],
    components: [],
  });
}

/**
 * Handle select pokemon button (opens selection menu)
 */
async function handleSelectPokemon(
  interaction: ButtonInteraction,
  sessionId: string
): Promise<void> {
  const selectMenu = await buildPokemonSelectMenu(interaction.user.id, sessionId);
  
  if (!selectMenu) {
    await interaction.reply({ 
      content: "You don't have any Pokémon available to trade. Make sure they're not in your active party.", 
      ephemeral: true 
    });
    return;
  }
  
  await interaction.reply({
    content: "Select a Pokémon to offer:",
    components: [selectMenu],
    ephemeral: true,
  });
}

/**
 * Handle pokemon selection from dropdown
 */
export async function handlePokemonSelect(
  interaction: StringSelectMenuInteraction
): Promise<void> {
  const [, sessionId] = interaction.customId.split(":");
  const pokemonId = interaction.values[0];
  const userId = interaction.user.id;
  
  logger.info('TradeUI', 'handlePokemonSelect', 'Pokemon selected', {
    userId,
    metadata: { sessionId, pokemonId },
  });
  
  const result = await selectTradeOffer(sessionId, userId, pokemonId);
  
  if ('error' in result) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }
  
  const session = result;
  const initiator = await interaction.client.users.fetch(session.initiatorId);
  const recipient = await interaction.client.users.fetch(session.recipientId);
  const isInitiator = userId === session.initiatorId;
  const hasSelected = isInitiator ? !!session.initiatorPokemonId : !!session.recipientPokemonId;
  const hasConfirmed = isInitiator ? session.initiatorConfirmed : session.recipientConfirmed;
  const canConfirm = session.status === "CONFIRMING";
  
  await interaction.update({
    content: "✅ Pokémon selected!",
    embeds: [buildTradeRoomEmbed(session, userId, initiator, recipient)],
    components: [buildTradeRoomButtons(sessionId, hasSelected, hasConfirmed, canConfirm)],
  });
}

/**
 * Handle confirm trade button
 */
async function handleConfirmTrade(
  interaction: ButtonInteraction,
  sessionId: string
): Promise<void> {
  const userId = interaction.user.id;
  const result = confirmTrade(sessionId, userId);
  
  if ('error' in result) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }
  
  // Check if both confirmed - execute trade
  if ('execute' in result && result.execute) {
    const execResult = await executeTrade(sessionId);
    
    if ('error' in execResult) {
      await interaction.reply({ content: execResult.error, ephemeral: true });
      return;
    }
    
    const session = execResult.session;
    const initiator = await interaction.client.users.fetch(session.initiatorId);
    const recipient = await interaction.client.users.fetch(session.recipientId);
    
    // Update with completion message
    await interaction.update({
      embeds: [buildTradeCompleteEmbed(session, userId, initiator, recipient)],
      components: [],
    });
    
    return;
  }
  
  // Just update the embed to show confirmation status
  const session = result as TradeSession;
  const initiator = await interaction.client.users.fetch(session.initiatorId);
  const recipient = await interaction.client.users.fetch(session.recipientId);
  const isInitiator = userId === session.initiatorId;
  const hasSelected = isInitiator ? !!session.initiatorPokemonId : !!session.recipientPokemonId;
  const hasConfirmed = true; // We just confirmed
  const canConfirm = session.status === "CONFIRMING";
  
  await interaction.update({
    embeds: [buildTradeRoomEmbed(session, userId, initiator, recipient)],
    components: [buildTradeRoomButtons(sessionId, hasSelected, hasConfirmed, canConfirm)],
  });
}

/**
 * Handle cancel trade button
 */
async function handleCancelTrade(
  interaction: ButtonInteraction,
  sessionId: string
): Promise<void> {
  const result = cancelTrade(sessionId, interaction.user.id);
  
  if ('error' in result) {
    await interaction.reply({ content: result.error, ephemeral: true });
    return;
  }
  
  await interaction.update({
    content: "❌ Trade cancelled.",
    embeds: [],
    components: [],
  });
}

// ============================================================================
// SLASH COMMAND SUPPORT
// ============================================================================

/**
 * Open trade screen with another user (called from /trade command)
 */
export async function openTradeScreen(
  interaction: ButtonInteraction,
  targetUser: User
): Promise<void> {
  // This would be called from a slash command handler
  // For now, provide the structure
  const userId = interaction.user.id;
  const session = getUserTradeSession(userId);
  
  if (session) {
    await interaction.reply({ 
      content: "You're already in a trade session. Complete or cancel it first.", 
      ephemeral: true 
    });
    return;
  }
  
  // The actual invite creation would be handled by the slash command
  await interaction.reply({ 
    content: `Use \`/trade @${targetUser.username}\` to send a trade request.`, 
    ephemeral: true 
  });
}
