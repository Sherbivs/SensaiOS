/**
 * Achievements UI Module — Discord embeds and button handlers
 * 
 * Provides the visual interface for achievements including
 * hub screen, category views, and achievement details.
 * 
 * @module bot/homestead/achievements
 */

import logger from "../../utils/logger.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
} from "discord.js";
import {
  getAchievementsByCategory,
  getAchievementSummary,
  getAchievementDetail,
  claimAchievementReward,
  type AchievementCategory,
  type AchievementWithProgress,
  RARITY_DISPLAY,
  CATEGORY_DISPLAY,
} from "../../services/achievements.js";

// ============================================================================
// BUTTON IDS
// ============================================================================

export const ACHIEVEMENT_BUTTON_IDS = {
  // Hub navigation
  HUB: "ACH_HUB",
  
  // Categories
  CAT_COLLECTION: "ACH_CAT_collection",
  CAT_BATTLE: "ACH_CAT_battle",
  CAT_SOCIAL: "ACH_CAT_social",
  CAT_EXPLORATION: "ACH_CAT_exploration",
  CAT_MASTERY: "ACH_CAT_mastery",
  CAT_SPECIAL: "ACH_CAT_special",
  
  // Actions
  VIEW_ALL: "ACH_VIEW_ALL",
  CLAIM: "ACH_CLAIM",
  
  // Pagination
  PREV: "ACH_PREV",
  NEXT: "ACH_NEXT",
  
  // Navigation
  BACK: "ACH_BACK",
} as const;

// Items per page for category view
const PAGE_SIZE = 8;

// ============================================================================
// EMBED BUILDERS
// ============================================================================

/**
 * Build the achievements hub screen
 */
export async function buildAchievementsHubEmbed(
  discordId: string
): Promise<EmbedBuilder> {
  const summary = await getAchievementSummary(discordId);
  
  const embed = new EmbedBuilder()
    .setTitle("🎖️ ACHIEVEMENTS")
    .setDescription(`Progress: **${summary.unlocked}/${summary.total}** unlocked (${summary.percent}%)`)
    .setColor(0xFFD700);
  
  // Add category summaries
  const categories: AchievementCategory[] = [
    "collection", "battle", "social", 
    "exploration", "mastery", "special"
  ];
  
  let categoriesText = "";
  for (const cat of categories) {
    const catData = CATEGORY_DISPLAY[cat];
    const catStats = summary.byCategory[cat];
    categoriesText += `${catData.emoji} **${catData.name}:** ${catStats.unlocked}/${catStats.total}\n`;
  }
  
  embed.addFields({ name: "Categories", value: categoriesText, inline: false });
  
  // Add recent unlock if available
  if (summary.recentUnlock) {
    const timeAgo = getTimeAgo(summary.recentUnlock.unlockedAt);
    embed.addFields({
      name: "🔔 Recent Unlock",
      value: `⭐ **"${summary.recentUnlock.name}"** — ${timeAgo}`,
      inline: false,
    });
  }
  
  return embed;
}

/**
 * Build hub buttons
 */
export function buildAchievementsHubButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ACHIEVEMENT_BUTTON_IDS.CAT_COLLECTION)
        .setLabel("📚 Collection")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(ACHIEVEMENT_BUTTON_IDS.CAT_BATTLE)
        .setLabel("⚔️ Battle")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(ACHIEVEMENT_BUTTON_IDS.CAT_SOCIAL)
        .setLabel("🤝 Social")
        .setStyle(ButtonStyle.Primary),
    );
  
  const row2 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(ACHIEVEMENT_BUTTON_IDS.CAT_EXPLORATION)
        .setLabel("🌍 Exploration")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ACHIEVEMENT_BUTTON_IDS.CAT_MASTERY)
        .setLabel("⭐ Mastery")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ACHIEVEMENT_BUTTON_IDS.CAT_SPECIAL)
        .setLabel("🎉 Special")
        .setStyle(ButtonStyle.Secondary),
    );
  
  const row3 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("HOME_MAIN")
        .setLabel("🏠 Back")
        .setStyle(ButtonStyle.Secondary),
    );
  
  return [row1, row2, row3];
}

/**
 * Build category view embed
 */
export function buildCategoryEmbed(
  category: AchievementCategory,
  achievements: AchievementWithProgress[],
  page: number = 1
): EmbedBuilder {
  const catData = CATEGORY_DISPLAY[category];
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const totalPages = Math.ceil(achievements.length / PAGE_SIZE);
  
  const embed = new EmbedBuilder()
    .setTitle(`${catData.emoji} ${catData.name.toUpperCase()} ACHIEVEMENTS`)
    .setDescription(`Progress: **${unlocked}/${achievements.length}** unlocked`)
    .setColor(0xFFD700);
  
  // Get page items
  const startIdx = (page - 1) * PAGE_SIZE;
  const pageItems = achievements.slice(startIdx, startIdx + PAGE_SIZE);
  
  let achievementsText = "";
  for (const ach of pageItems) {
    const statusIcon = ach.unlocked ? "✅" : "🔒";
    const rarityData = RARITY_DISPLAY[ach.rarity as keyof typeof RARITY_DISPLAY];
    
    if (ach.unlocked) {
      achievementsText += `${statusIcon} **${ach.name}** — ${ach.description}  ${rarityData.emoji}\n`;
    } else {
      // Show progress for locked achievements
      const progressStr = ach.progressPercent < 100 
        ? ` (${ach.progress}/${ach.requirement})`
        : "";
      achievementsText += `${statusIcon} **${ach.name}** — ${ach.progress}/${ach.requirement}${progressStr}  ${rarityData.emoji}\n`;
    }
  }
  
  if (achievementsText) {
    embed.addFields({ name: "Achievements", value: achievementsText, inline: false });
  } else {
    embed.addFields({ name: "Achievements", value: "*No achievements in this category*", inline: false });
  }
  
  if (totalPages > 1) {
    embed.setFooter({ text: `Page ${page}/${totalPages}` });
  }
  
  return embed;
}

/**
 * Build category view buttons
 */
export function buildCategoryButtons(
  category: AchievementCategory,
  achievements: AchievementWithProgress[],
  page: number = 1
): ActionRowBuilder<ButtonBuilder>[] {
  const totalPages = Math.ceil(achievements.length / PAGE_SIZE);
  
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  // Pagination buttons if needed
  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ACHIEVEMENT_BUTTON_IDS.PREV}:${category}:${page}`)
        .setLabel("⬅️ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page <= 1),
      new ButtonBuilder()
        .setCustomId(`${ACHIEVEMENT_BUTTON_IDS.NEXT}:${category}:${page}`)
        .setLabel("➡️ Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages),
    );
  }
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(ACHIEVEMENT_BUTTON_IDS.HUB)
      .setLabel("🔙 Back")
      .setStyle(ButtonStyle.Primary),
  );
  
  return [row];
}

/**
 * Build achievement detail embed
 */
export function buildAchievementDetailEmbed(
  achievement: AchievementWithProgress
): EmbedBuilder {
  const rarityData = RARITY_DISPLAY[achievement.rarity as keyof typeof RARITY_DISPLAY];
  
  const embed = new EmbedBuilder()
    .setTitle(`${rarityData.emoji} ${achievement.name.toUpperCase()}`)
    .setColor(rarityData.color);
  
  // Status
  if (achievement.unlocked) {
    embed.setDescription("✅ **UNLOCKED!**");
  } else {
    embed.setDescription("🔒 *Locked*");
  }
  
  // Description
  embed.addFields({
    name: "Description",
    value: `"${achievement.description}"`,
    inline: false,
  });
  
  // Progress bar
  const progressBar = buildProgressBar(achievement.progressPercent);
  embed.addFields({
    name: "Progress",
    value: `${progressBar} ${achievement.progress}/${achievement.requirement} (${achievement.progressPercent}%)`,
    inline: false,
  });
  
  // Rewards
  const rewards: string[] = [];
  if (achievement.rewardMoney > 0) {
    const claimStatus = achievement.rewardClaimed ? "(Claimed!)" : "";
    rewards.push(`${achievement.rewardMoney}₽ ${claimStatus}`);
  }
  if (achievement.rewardBadge) {
    const claimStatus = achievement.rewardClaimed ? "(Claimed!)" : "";
    rewards.push(`${achievement.rewardBadge} Badge ${claimStatus}`);
  }
  
  if (rewards.length > 0) {
    embed.addFields({
      name: "Reward",
      value: rewards.join("\n"),
      inline: true,
    });
  }
  
  // Rarity
  embed.addFields({
    name: "Rarity",
    value: `${rarityData.emoji} ${achievement.rarity.charAt(0).toUpperCase() + achievement.rarity.slice(1)}`,
    inline: true,
  });
  
  // Unlock date if unlocked
  if (achievement.unlocked && achievement.unlockedAt) {
    embed.addFields({
      name: "Unlocked",
      value: achievement.unlockedAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      inline: false,
    });
  }
  
  return embed;
}

/**
 * Build achievement detail buttons
 */
export function buildAchievementDetailButtons(
  achievement: AchievementWithProgress,
  category: AchievementCategory
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  // Show claim button if unlocked and has unclaimed rewards
  const hasReward = achievement.rewardMoney > 0 || achievement.rewardBadge;
  if (achievement.unlocked && hasReward && !achievement.rewardClaimed) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ACHIEVEMENT_BUTTON_IDS.CLAIM}:${achievement.code}`)
        .setLabel("🎁 Claim Reward")
        .setStyle(ButtonStyle.Success),
    );
  }
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`ACH_CAT_${category}`)
      .setLabel("🔙 Back")
      .setStyle(ButtonStyle.Primary),
  );
  
  return [row];
}

/**
 * Build unlock notification embed (for showing when achievement unlocks)
 */
export function buildUnlockNotificationEmbed(
  achievement: AchievementWithProgress
): EmbedBuilder {
  const rarityData = RARITY_DISPLAY[achievement.rarity as keyof typeof RARITY_DISPLAY];
  
  return new EmbedBuilder()
    .setTitle("🎉 ACHIEVEMENT UNLOCKED!")
    .setDescription(`**${achievement.name}**\n\n"${achievement.description}"`)
    .setColor(rarityData.color)
    .addFields({
      name: "Rarity",
      value: `${rarityData.emoji} ${achievement.rarity.charAt(0).toUpperCase() + achievement.rarity.slice(1)}`,
      inline: true,
    })
    .setFooter({ text: "View your achievements to claim rewards!" });
}

// ============================================================================
// BUTTON HANDLERS
// ============================================================================

/**
 * Check if a button ID is an achievement button
 */
export function isAchievementButton(customId: string): boolean {
  return customId.startsWith("ACH_");
}

/**
 * Handle achievement button interactions
 */
export async function handleAchievementButton(
  interaction: ButtonInteraction
): Promise<void> {
  const customId = interaction.customId;
  
  try {
    await interaction.deferUpdate();
    
    // Parse button ID
    const [action, ...params] = customId.split(":");
    
    switch (action) {
      case ACHIEVEMENT_BUTTON_IDS.HUB:
        await showAchievementsHub(interaction);
        break;
        
      case ACHIEVEMENT_BUTTON_IDS.PREV:
      case ACHIEVEMENT_BUTTON_IDS.NEXT: {
        const category = params[0] as AchievementCategory;
        const currentPage = parseInt(params[1] || "1", 10);
        const newPage = action === ACHIEVEMENT_BUTTON_IDS.PREV 
          ? currentPage - 1 
          : currentPage + 1;
        await showCategory(interaction, category, newPage);
        break;
      }
        
      case ACHIEVEMENT_BUTTON_IDS.CLAIM: {
        const achievementCode = params[0];
        await claimReward(interaction, achievementCode);
        break;
      }
        
      default:
        // Check if it's a category button
        if (action.startsWith("ACH_CAT_")) {
          const category = action.replace("ACH_CAT_", "") as AchievementCategory;
          await showCategory(interaction, category);
        }
        break;
    }
  } catch (error) {
    logger.log("error", "Failed to handle achievement button", { error, customId });
    
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: "❌ Something went wrong. Please try again.",
        ephemeral: true,
      });
    }
  }
}

// ============================================================================
// SCREEN HANDLERS
// ============================================================================

async function showAchievementsHub(interaction: ButtonInteraction): Promise<void> {
  const discordId = interaction.user.id;
  
  const embed = await buildAchievementsHubEmbed(discordId);
  const buttons = buildAchievementsHubButtons();
  
  await interaction.editReply({
    embeds: [embed],
    components: buttons,
  });
}

async function showCategory(
  interaction: ButtonInteraction,
  category: AchievementCategory,
  page: number = 1
): Promise<void> {
  const discordId = interaction.user.id;
  
  const achievements = await getAchievementsByCategory(category, discordId);
  const embed = buildCategoryEmbed(category, achievements, page);
  const buttons = buildCategoryButtons(category, achievements, page);
  
  await interaction.editReply({
    embeds: [embed],
    components: buttons,
  });
}

async function claimReward(
  interaction: ButtonInteraction,
  achievementCode: string
): Promise<void> {
  const discordId = interaction.user.id;
  
  const result = await claimAchievementReward(discordId, achievementCode);
  
  if (result.success) {
    let message = "🎁 **Reward Claimed!**\n";
    if (result.moneyAwarded && result.moneyAwarded > 0) {
      message += `+${result.moneyAwarded}₽\n`;
    }
    if (result.badgeAwarded) {
      message += `Badge: ${result.badgeAwarded}\n`;
    }
    
    await interaction.followUp({
      content: message,
      ephemeral: true,
    });
    
    // Refresh the detail view
    const achievement = await getAchievementDetail(achievementCode, discordId);
    if (achievement) {
      const embed = buildAchievementDetailEmbed(achievement);
      const buttons = buildAchievementDetailButtons(achievement, achievement.category as AchievementCategory);
      await interaction.editReply({
        embeds: [embed],
        components: buttons,
      });
    }
  } else {
    await interaction.followUp({
      content: `❌ ${result.error || "Failed to claim reward"}`,
      ephemeral: true,
    });
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildProgressBar(percent: number): string {
  const filled = Math.floor(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (minutes > 0) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  return "just now";
}

// ============================================================================
// EXPORTS
// ============================================================================

export const achievementsUI = {
  ACHIEVEMENT_BUTTON_IDS,
  buildAchievementsHubEmbed,
  buildAchievementsHubButtons,
  buildCategoryEmbed,
  buildCategoryButtons,
  buildAchievementDetailEmbed,
  buildAchievementDetailButtons,
  buildUnlockNotificationEmbed,
  isAchievementButton,
  handleAchievementButton,
};

export default achievementsUI;
