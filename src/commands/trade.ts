/**
 * /trade Command
 * 
 * Initiate a Pokémon trade with another trainer.
 * Sends a trade invitation that the target user can accept or decline.
 * 
 * @module commands/trade
 * @since Phase 9 (2025-12-20) - Trading System implementation
 */

// === CRITICAL: Logger & Error Handling MUST be first imports ===
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

// === Discord.js Imports ===
import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

// === Application Imports ===
import type { Command } from "./types.js";
import { createTradeInvite, TRADE_CONFIG } from "../services/trading.js";
import { buildTradeInviteEmbed, buildInviteButtons } from "../bot/homestead/trade.js";
import { HomesteadChannelManager } from "../services/homestead-manager.js";

// ============================================================================
// COMMAND DEFINITION
// ============================================================================

const data = new SlashCommandBuilder()
  .setName("trade")
  .setDescription("Trade Pokémon with another trainer")
  .addUserOption((opt) =>
    opt
      .setName("trainer")
      .setDescription("The trainer you want to trade with")
      .setRequired(true)
  );

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const userId = interaction.user.id;
  const targetUser = interaction.options.getUser("trainer", true);
  
  logger.info("TradeCommand", "execute", "Trade initiated", {
    userId,
    metadata: { targetId: targetUser.id },
  });
  
  // Validate target is not a bot
  if (targetUser.bot) {
    await interaction.reply({
      content: "❌ You can't trade with bots!",
      ephemeral: true,
    });
    return;
  }
  
  // Validate target is not self
  if (targetUser.id === userId) {
    await interaction.reply({
      content: "❌ You can't trade with yourself!",
      ephemeral: true,
    });
    return;
  }
  
  // Create trade invite
  const result = await createTradeInvite(
    userId,
    targetUser.id,
    interaction.channelId
  );
  
  if ("error" in result) {
    await interaction.reply({
      content: `❌ ${result.error}`,
      ephemeral: true,
    });
    return;
  }
  
  const session = result;
  
  // Send invite to recipient's homestead channel
  try {
    const guild = interaction.guild;
    
    if (guild) {
      const homesteadManager = new HomesteadChannelManager(interaction.client, guild.id);
      
      // Fetch recipient user object from the guild
      const recipientMember = await guild.members.fetch(targetUser.id).catch(() => null);
      
      if (recipientMember) {
        const { channel: homesteadChannel } = await homesteadManager.getOrCreateChannel(targetUser);
        
        if (homesteadChannel) {
          await homesteadChannel.send({
            content: `<@${targetUser.id}>`,
            embeds: [buildTradeInviteEmbed(interaction.user, session)],
            components: [buildInviteButtons(session.id)],
          });
        }
      }
    }
  } catch (error) {
    logger.warn("TradeCommand", "execute", "Could not send to homestead, falling back", {
      userId,
      metadata: { error },
    });
  }
  
  // Confirm to initiator
  const timeoutMinutes = Math.floor(TRADE_CONFIG.INVITE_TIMEOUT_MS / 60000);
  await interaction.reply({
    content: `✅ Trade request sent to **${targetUser.username}**!\n\nThey have ${timeoutMinutes} minutes to accept. You'll be notified when they respond.`,
    ephemeral: true,
  });
  
  logger.info("TradeCommand", "execute", "Trade invite sent successfully", {
    userId,
    metadata: { sessionId: session.id, recipientId: targetUser.id },
  });
}

// ============================================================================
// EXPORT
// ============================================================================

export default {
  data,
  execute,
} satisfies Command;
