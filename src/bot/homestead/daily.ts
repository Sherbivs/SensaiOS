/**
 * Daily Rewards Screen — Streak Bonuses & Rewards
 * 
 * Implements the daily rewards screen per Game Design Bible § 6.
 * Players can claim daily rewards with streak bonuses.
 * 
 * Button IDs:
 * - DAILY_CLAIM — Claim daily reward
 * - DAILY_BACK — Return to home screen
 * 
 * @module homestead/daily
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ButtonInteraction,
  User as DiscordUser,
} from "discord.js";
import { getGameServer } from "../../sensaios/gameserver/singleton.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { EMBED_COLORS } from "../shared/embed-colors.js";
import { claimDailyQuestReward } from "../../services/cache/recipes.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface DailyData {
  username: string;
  streak: number;
  canClaim: boolean;
  nextClaimAt: Date | null;
  coins: number;
  lastClaimed: Date | null;
}

interface StreakBonus {
  days: number;
  multiplier: number;
  label: string;
  emoji: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BASE_REWARD = 100; // Base coins per daily

// Streak bonus tiers
const STREAK_BONUSES: StreakBonus[] = [
  { days: 1, multiplier: 1.0, label: "Day 1", emoji: "1️⃣" },
  { days: 2, multiplier: 1.1, label: "Day 2", emoji: "2️⃣" },
  { days: 3, multiplier: 1.2, label: "Day 3", emoji: "3️⃣" },
  { days: 4, multiplier: 1.3, label: "Day 4", emoji: "4️⃣" },
  { days: 5, multiplier: 1.5, label: "Day 5", emoji: "5️⃣" },
  { days: 6, multiplier: 1.7, label: "Day 6", emoji: "6️⃣" },
  { days: 7, multiplier: 2.0, label: "Week Bonus!", emoji: "🎁" },
];

// ─────────────────────────────────────────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get streak bonus info for a given streak count
 */
function getStreakBonus(streak: number): StreakBonus {
  // Cycle through week (1-7)
  const dayInWeek = ((streak - 1) % 7) + 1;
  return STREAK_BONUSES[dayInWeek - 1] || STREAK_BONUSES[0];
}

/**
 * Calculate reward coins based on streak
 */
function calculateReward(streak: number): number {
  const bonus = getStreakBonus(streak);
  return Math.floor(BASE_REWARD * bonus.multiplier);
}

/**
 * Build streak progress bar
 */
function buildStreakProgress(currentDay: number): string {
  const lines: string[] = [];
  
  for (const bonus of STREAK_BONUSES) {
    const dayInWeek = ((currentDay - 1) % 7) + 1;
    const isComplete = bonus.days < dayInWeek;
    const isCurrent = bonus.days === dayInWeek;
    
    let status = "⬜"; // Pending
    if (isComplete) status = "✅";
    if (isCurrent) status = "🔶";
    
    const reward = Math.floor(BASE_REWARD * bonus.multiplier);
    lines.push(`${status} ${bonus.emoji} ${bonus.label} — ${reward} coins`);
  }
  
  return lines.join("\n");
}

/**
 * Format time until next claim
 */
function formatTimeUntil(date: Date | null): string {
  if (!date) return "Ready now!";
  
  const now = Date.now();
  const target = date.getTime();
  const diff = target - now;
  
  if (diff <= 0) return "Ready now!";
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the daily rewards embed
 */
function buildDailyEmbed(data: DailyData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🎁 Daily Rewards")
    .setColor(data.canClaim ? EMBED_COLORS.SUCCESS : EMBED_COLORS.WARNING);

  // Current streak info
  const nextDay = data.streak + 1;
  const bonus = getStreakBonus(nextDay);
  const reward = calculateReward(nextDay);
  
  if (data.canClaim) {
    embed.setDescription(
      `Your reward is ready!\n\n` +
      `🔥 **Current Streak:** ${data.streak} days\n` +
      `💰 **Today's Reward:** ${reward} coins (${bonus.label})\n\n` +
      `Claim now to continue your streak!`
    );
  } else {
    embed.setDescription(
      `Come back later for your next reward!\n\n` +
      `🔥 **Current Streak:** ${data.streak} days\n` +
      `⏰ **Next Claim:** ${formatTimeUntil(data.nextClaimAt)}\n` +
      `💰 **Next Reward:** ${reward} coins`
    );
  }

  // Weekly progress
  embed.addFields({
    name: "📅 Weekly Progress",
    value: buildStreakProgress(data.streak + 1),
    inline: false,
  });

  // Current balance
  embed.addFields({
    name: "💰 Balance",
    value: `${data.coins.toLocaleString()} coins`,
    inline: true,
  });

  // Streak info
  if (data.streak > 0) {
    const maxStreak = data.streak; // TODO: Track max streak separately
    embed.addFields({
      name: "🏆 Best Streak",
      value: `${maxStreak} days`,
      inline: true,
    });
  }

  embed.setFooter({ 
    text: data.canClaim 
      ? "Don't break your streak! Claim within 48 hours." 
      : "Rewards reset if you miss 2 days in a row."
  });

  return embed;
}

/**
 * Build daily action buttons
 */
function buildDailyButtons(canClaim: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  // Claim button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId("DAILY_CLAIM")
      .setLabel(canClaim ? "🎁 Claim Reward" : "⏳ Not Ready")
      .setStyle(canClaim ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canClaim)
  );
  
  // Back button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId("DAILY_BACK")
      .setLabel("🔙 Back to Home")
      .setStyle(ButtonStyle.Secondary)
  );
  
  return [row];
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load daily rewards data for a user via GameServerAPI
 */
async function loadDailyData(discordId: string): Promise<DailyData | null> {
  const gameServer = getGameServer();
  
  // GameServerAPI accepts plain strings and handles them internally
  const data = await gameServer.trainers.getDailyData(discordId);
  if (!data) return null;
  
  return {
    username: discordId,
    streak: data.streak,
    canClaim: data.canClaim,
    nextClaimAt: data.nextClaimAt,
    coins: data.coins,
    lastClaimed: data.lastClaimed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the daily rewards screen
 */
export async function openDailyScreen(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<void> {
  const manager = new HomesteadChannelManager(client, guildId);
  const result = await manager.getOrCreateChannel(user);
  const channel = result.channel;

  const data = await loadDailyData(user.id);
  if (!data) {
    await channel.send({
      content: "❌ Could not load daily rewards. Please try `/start` first.",
    });
    return;
  }

  const embed = buildDailyEmbed(data);
  const buttons = buildDailyButtons(data.canClaim);

  await channel.send({
    embeds: [embed],
    components: buttons,
  });
}

/**
 * Handle daily claim button
 */
async function handleDailyClaim(interaction: ButtonInteraction): Promise<void> {
  const discordId = interaction.user.id;
  
  try {
    // Attempt to claim (service layer uses its own prisma instance)
    const result = await claimDailyQuestReward({
      discordId,
      rewardCoins: BASE_REWARD,
      now: new Date(),
    });

    if (result.kind === "awarded") {
      const bonus = getStreakBonus(result.streak?.streak ?? 1);
      
      // Build success embed
      const embed = new EmbedBuilder()
        .setTitle("🎉 Reward Claimed!")
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(
          `You received **${result.rewardCoins}** coins!\n\n` +
          `🔥 **Streak:** ${result.streak?.streak ?? 1} days\n` +
          `💰 **New Balance:** ${result.balance} coins`
        );
      
      if (bonus.days === 7) {
        embed.addFields({
          name: "🎁 Week Bonus!",
          value: "Congratulations on a 7-day streak! Double rewards!",
        });
      }

      const backButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("DAILY_BACK")
          .setLabel("🔙 Back to Home")
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({
        embeds: [embed],
        components: [backButton],
      });
    } else {
      // Already claimed
      const data = await loadDailyData(discordId);
      const embed = buildDailyEmbed(data || {
        username: discordId,
        streak: 0,
        canClaim: false,
        nextClaimAt: new Date(result.readyAt),
        coins: 0,
        lastClaimed: null,
      });
      
      await interaction.update({
        embeds: [embed],
        components: buildDailyButtons(false),
      });
    }
  } catch {
    await interaction.reply({
      content: "❌ Failed to claim daily reward. Please try again.",
      ephemeral: true,
    });
  }
}

/**
 * Handle daily back button - return to home
 */
async function handleDailyBack(interaction: ButtonInteraction): Promise<void> {
  // Import dynamically to avoid circular deps
  const { openPartyView } = await import("./home.js");
  
  if (!interaction.guildId) {
    await interaction.reply({ content: "Cannot navigate without guild context.", ephemeral: true });
    return;
  }
  
  // openPartyView is the main home screen view
  await openPartyView(interaction);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle all daily-related button interactions
 */
export async function handleDailyButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;
  
  switch (id) {
    case "DAILY_CLAIM":
      await handleDailyClaim(interaction);
      break;
    case "DAILY_BACK":
      await handleDailyBack(interaction);
      break;
    default:
      // Unknown button - silently ignore
      break;
  }
}
