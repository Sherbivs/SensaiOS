/**
 * Leaderboards UI Module — Discord embeds and button handlers
 * 
 * Provides the visual interface for leaderboards including
 * hub screen, board views, and personal rankings.
 * 
 * @module bot/homestead/leaderboards
 */

import logger from "../../utils/logger.js";
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Client,
} from "discord.js";
import {
  getLeaderboard,
  getLeaderboardWithContext,
  getPersonalRankings,
  type LeaderboardType,
  type LeaderboardResult,
} from "../../services/leaderboards.js";

// ============================================================================
// BUTTON IDS
// ============================================================================

export const LEADERBOARD_BUTTON_IDS = {
  // Hub navigation
  HUB: "LB_HUB",
  
  // Board types
  TOTAL_CATCHES: "LB_TOTAL",
  WEEKLY_CATCHES: "LB_WEEKLY",
  POKEDEX: "LB_DEX",
  SHINIES: "LB_SHINY",
  BATTLES: "LB_BATTLE",
  FISHING: "LB_FISH",
  TRADING: "LB_TRADE",
  MY_RANKS: "LB_MY_RANKS",
  
  // Pagination
  PREV: "LB_PREV",
  NEXT: "LB_NEXT",
  
  // Navigation
  BACK: "LB_BACK",
} as const;

// Map button IDs to leaderboard types
const BUTTON_TO_TYPE: Record<string, LeaderboardType> = {
  [LEADERBOARD_BUTTON_IDS.TOTAL_CATCHES]: "total_catches",
  [LEADERBOARD_BUTTON_IDS.WEEKLY_CATCHES]: "weekly_catches",
  [LEADERBOARD_BUTTON_IDS.POKEDEX]: "pokedex",
  [LEADERBOARD_BUTTON_IDS.SHINIES]: "shinies",
  [LEADERBOARD_BUTTON_IDS.BATTLES]: "battle_wins",
  [LEADERBOARD_BUTTON_IDS.FISHING]: "fish_caught",
  [LEADERBOARD_BUTTON_IDS.TRADING]: "trades",
};

// ============================================================================
// EMBED BUILDERS
// ============================================================================

/**
 * Build the leaderboards hub screen
 */
export function buildLeaderboardsHubEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🏆 LEADERBOARDS")
    .setDescription("Choose a category to view rankings:")
    .addFields(
      { name: "\u200B", value: "**📊 Collection**", inline: false },
      { name: "Total Catches", value: "All-time catches", inline: true },
      { name: "Weekly Catches", value: "This week's catches", inline: true },
      { name: "Pokédex", value: "Completion %", inline: true },
      { name: "\u200B", value: "**⚔️ Competition**", inline: false },
      { name: "Shinies", value: "Shiny hunters", inline: true },
      { name: "Battles", value: "PvP wins", inline: true },
      { name: "\u200B", value: "**🎣 Activities**", inline: false },
      { name: "Fishing", value: "Fish caught", inline: true },
      { name: "Trading", value: "Trades completed", inline: true },
    )
    .setColor(0xFFD700)
    .setFooter({ text: "💡 Weekly boards reset every Monday at midnight UTC" });
}

/**
 * Build hub buttons
 */
export function buildLeaderboardsHubButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.TOTAL_CATCHES)
        .setLabel("📊 Total")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.WEEKLY_CATCHES)
        .setLabel("📈 Weekly")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.POKEDEX)
        .setLabel("📚 Pokédex")
        .setStyle(ButtonStyle.Primary),
    );
  
  const row2 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.SHINIES)
        .setLabel("✨ Shinies")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.BATTLES)
        .setLabel("⚔️ Battles")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.FISHING)
        .setLabel("🎣 Fishing")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.TRADING)
        .setLabel("🤝 Trading")
        .setStyle(ButtonStyle.Secondary),
    );
  
  const row3 = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.MY_RANKS)
        .setLabel("👤 My Rankings")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("HOME_MAIN")
        .setLabel("🏠 Back")
        .setStyle(ButtonStyle.Secondary),
    );
  
  return [row1, row2, row3];
}

/**
 * Build leaderboard view embed
 */
export function buildLeaderboardEmbed(result: LeaderboardResult, _client: Client): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`${result.emoji} ${result.title.toUpperCase()} LEADERBOARD`)
    .setColor(0xFFD700);
  
  // Add reset timer for weekly boards
  if (result.resetsIn) {
    embed.setDescription(`Resets in: **${result.resetsIn}**`);
  }
  
  // Build rankings display
  let rankingsText = "";
  
  for (const entry of result.entries) {
    if (entry.rank === -1) {
      // Separator
      rankingsText += "...\n";
      continue;
    }
    
    const medal = getRankMedal(entry.rank);
    const highlight = entry.isCurrentUser ? " ◀────" : "";
    const username = entry.isCurrentUser ? "**YOU**" : `<@${entry.discordId}>`;
    const valueStr = result.type === "pokedex" ? `${entry.value}%` : entry.value.toLocaleString();
    
    rankingsText += `${medal} #${entry.rank}  ${username}  ${valueStr}${highlight}\n`;
  }
  
  if (rankingsText) {
    embed.addFields({ name: "Rankings", value: rankingsText, inline: false });
  } else {
    embed.addFields({ name: "Rankings", value: "*No data yet*", inline: false });
  }
  
  // Add user stats footer
  let footerText = `Total: ${result.totalPlayers.toLocaleString()} players`;
  if (result.userRank && result.userValue !== undefined) {
    const valueStr = result.type === "pokedex" ? `${result.userValue}%` : result.userValue.toLocaleString();
    footerText = `Your rank: #${result.userRank} (${valueStr}) • ${footerText}`;
  }
  
  if (result.totalPages > 1) {
    footerText += ` • Page ${result.page}/${result.totalPages}`;
  }
  
  embed.setFooter({ text: footerText });
  
  return embed;
}

/**
 * Build leaderboard view buttons with pagination
 */
export function buildLeaderboardButtons(
  type: LeaderboardType,
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>();
  
  // Pagination buttons
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${LEADERBOARD_BUTTON_IDS.PREV}:${type}:${page}`)
      .setLabel("⬅️ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${LEADERBOARD_BUTTON_IDS.NEXT}:${type}:${page}`)
      .setLabel("➡️ Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
    new ButtonBuilder()
      .setCustomId(LEADERBOARD_BUTTON_IDS.HUB)
      .setLabel("🔙 Back")
      .setStyle(ButtonStyle.Primary),
  );
  
  return [row];
}

/**
 * Build personal rankings embed
 */
export function buildPersonalRankingsEmbed(
  discordId: string,
  rankings: ReturnType<typeof getPersonalRankings> extends Promise<infer T> ? T : never
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📊 YOUR RANKINGS")
    .setColor(0x00D4FF);
  
  if (rankings.rankings.length === 0) {
    embed.setDescription("*No rankings yet! Start playing to appear on leaderboards.*");
    return embed;
  }
  
  let rankingsText = "";
  
  for (const r of rankings.rankings) {
    const valueStr = r.type === "pokedex" ? `${r.value}%` : r.value.toLocaleString();
    const rankStr = r.rank > 0 ? `#${r.rank}` : "N/A";
    
    rankingsText += `${r.emoji} **${r.title}:** ${rankStr}  (${valueStr})\n`;
  }
  
  embed.setDescription(rankingsText);
  
  return embed;
}

/**
 * Build personal rankings buttons
 */
export function buildPersonalRankingsButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(LEADERBOARD_BUTTON_IDS.HUB)
        .setLabel("🔙 Back to Leaderboards")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("HOME_MAIN")
        .setLabel("🏠 Home")
        .setStyle(ButtonStyle.Secondary),
    );
  
  return [row];
}

// ============================================================================
// BUTTON HANDLERS
// ============================================================================

/**
 * Check if a button ID is a leaderboard button
 */
export function isLeaderboardButton(customId: string): boolean {
  return customId.startsWith("LB_");
}

/**
 * Handle leaderboard button interactions
 */
export async function handleLeaderboardButton(
  interaction: ButtonInteraction
): Promise<void> {
  const customId = interaction.customId;
  
  try {
    await interaction.deferUpdate();
    
    // Parse button ID
    const [action, ...params] = customId.split(":");
    
    switch (action) {
      case LEADERBOARD_BUTTON_IDS.HUB:
        await showLeaderboardsHub(interaction);
        break;
        
      case LEADERBOARD_BUTTON_IDS.MY_RANKS:
        await showPersonalRankings(interaction);
        break;
        
      case LEADERBOARD_BUTTON_IDS.PREV:
      case LEADERBOARD_BUTTON_IDS.NEXT: {
        const type = params[0] as LeaderboardType;
        const currentPage = parseInt(params[1] || "1", 10);
        const newPage = action === LEADERBOARD_BUTTON_IDS.PREV 
          ? currentPage - 1 
          : currentPage + 1;
        await showLeaderboard(interaction, type, newPage);
        break;
      }
        
      default:
        // Check if it's a board type button
        if (BUTTON_TO_TYPE[action]) {
          await showLeaderboard(interaction, BUTTON_TO_TYPE[action]);
        }
        break;
    }
  } catch (error) {
    logger.log("error", "Failed to handle leaderboard button", { error, customId });
    
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

async function showLeaderboardsHub(interaction: ButtonInteraction): Promise<void> {
  const embed = buildLeaderboardsHubEmbed();
  const buttons = buildLeaderboardsHubButtons();
  
  await interaction.editReply({
    embeds: [embed],
    components: buttons,
  });
}

async function showLeaderboard(
  interaction: ButtonInteraction,
  type: LeaderboardType,
  page: number = 1
): Promise<void> {
  const discordId = interaction.user.id;
  
  // Get leaderboard with context if on page 1, otherwise paginated
  const result = page === 1
    ? await getLeaderboardWithContext(type, discordId)
    : await getLeaderboard(type, page, discordId);
  
  const embed = buildLeaderboardEmbed(result, interaction.client);
  const buttons = buildLeaderboardButtons(type, result.page, result.totalPages);
  
  await interaction.editReply({
    embeds: [embed],
    components: buttons,
  });
}

async function showPersonalRankings(interaction: ButtonInteraction): Promise<void> {
  const discordId = interaction.user.id;
  
  const rankings = await getPersonalRankings(discordId);
  const embed = buildPersonalRankingsEmbed(discordId, rankings);
  const buttons = buildPersonalRankingsButtons();
  
  await interaction.editReply({
    embeds: [embed],
    components: buttons,
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRankMedal(rank: number): string {
  switch (rank) {
    case 1: return "🥇";
    case 2: return "🥈";
    case 3: return "🥉";
    default: return "  "; // Two spaces for alignment
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const leaderboardsUI = {
  LEADERBOARD_BUTTON_IDS,
  buildLeaderboardsHubEmbed,
  buildLeaderboardsHubButtons,
  buildLeaderboardEmbed,
  buildLeaderboardButtons,
  buildPersonalRankingsEmbed,
  buildPersonalRankingsButtons,
  isLeaderboardButton,
  handleLeaderboardButton,
};

export default leaderboardsUI;
