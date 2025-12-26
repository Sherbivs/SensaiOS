/**
 * Leaderboards Service — Ranking queries and display
 * 
 * Provides ranking queries with pagination, nearby ranks,
 * and personal ranking cards for the leaderboards system.
 * 
 * @module services/leaderboards
 */

import _logger from "../utils/logger.js";
import { prisma } from "../shared/prisma.js";
import type { PlayerStats, LeaderboardSnapshot } from "../generated/prisma/client.js";
import { getCurrentWeekStart } from "./player-stats.js";

// ============================================================================
// TYPES
// ============================================================================

export type LeaderboardType =
  | "total_catches"
  | "weekly_catches"
  | "pokedex"
  | "shinies"
  | "battle_wins"
  | "season_wins"
  | "fish_caught"
  | "weekly_fish"
  | "trades";

export interface RankingEntry {
  rank: number;
  discordId: string;
  value: number;
  isCurrentUser?: boolean;
}

export interface LeaderboardResult {
  type: LeaderboardType;
  title: string;
  emoji: string;
  entries: RankingEntry[];
  totalPlayers: number;
  userRank?: number;
  userValue?: number;
  page: number;
  totalPages: number;
  resetsIn?: string; // For weekly boards
}

export interface PersonalRankings {
  discordId: string;
  rankings: {
    type: LeaderboardType;
    title: string;
    emoji: string;
    rank: number;
    value: number;
  }[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const LEADERBOARD_CONFIG = {
  PAGE_SIZE: 10,
  NEARBY_CONTEXT: 2, // Show 2 above and 2 below user
  TOP_COUNT: 3, // Always show top 3
};

const BOARD_METADATA: Record<LeaderboardType, { title: string; emoji: string; weekly: boolean }> = {
  total_catches: { title: "Total Catches", emoji: "📊", weekly: false },
  weekly_catches: { title: "Weekly Catches", emoji: "📈", weekly: true },
  pokedex: { title: "Pokédex Progress", emoji: "📚", weekly: false },
  shinies: { title: "Shiny Hunters", emoji: "✨", weekly: false },
  battle_wins: { title: "Battle Champions", emoji: "⚔️", weekly: false },
  season_wins: { title: "Season Wins", emoji: "🏆", weekly: false },
  fish_caught: { title: "Fishing Masters", emoji: "🎣", weekly: false },
  weekly_fish: { title: "Weekly Fishing", emoji: "🐟", weekly: true },
  trades: { title: "Top Traders", emoji: "🤝", weekly: false },
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Get leaderboard rankings with pagination
 */
export async function getLeaderboard(
  type: LeaderboardType,
  page: number = 1,
  discordId?: string
): Promise<LeaderboardResult> {
  const metadata = BOARD_METADATA[type];
  const offset = (page - 1) * LEADERBOARD_CONFIG.PAGE_SIZE;
  
  // Get total count
  const totalPlayers = await prisma.playerStats.count({
    where: getWhereClause(type),
  });
  
  // Get rankings for this page
  const entries = await getRankingsForType(type, offset, LEADERBOARD_CONFIG.PAGE_SIZE);
  
  // Calculate pagination
  const totalPages = Math.max(1, Math.ceil(totalPlayers / LEADERBOARD_CONFIG.PAGE_SIZE));
  
  // Get user's rank if provided
  let userRank: number | undefined;
  let userValue: number | undefined;
  
  if (discordId) {
    const userStats = await prisma.playerStats.findUnique({
      where: { discordId },
    });
    
    if (userStats) {
      userValue = getStatValue(userStats, type);
      userRank = await getUserRank(type, discordId);
      
      // Mark current user in entries
      for (const entry of entries) {
        if (entry.discordId === discordId) {
          entry.isCurrentUser = true;
        }
      }
    }
  }
  
  // Calculate time until reset for weekly boards
  let resetsIn: string | undefined;
  if (metadata.weekly) {
    resetsIn = getTimeUntilReset();
  }
  
  return {
    type,
    title: metadata.title,
    emoji: metadata.emoji,
    entries,
    totalPlayers,
    userRank,
    userValue,
    page,
    totalPages,
    resetsIn,
  };
}

/**
 * Get leaderboard with nearby context for the user
 * Shows top 3 + user's nearby ranks
 */
export async function getLeaderboardWithContext(
  type: LeaderboardType,
  discordId: string
): Promise<LeaderboardResult> {
  const metadata = BOARD_METADATA[type];
  const entries: RankingEntry[] = [];
  
  // Always get top 3
  const topEntries = await getRankingsForType(type, 0, LEADERBOARD_CONFIG.TOP_COUNT);
  entries.push(...topEntries);
  
  // Get user's rank
  const userRank = await getUserRank(type, discordId);
  const userStats = await prisma.playerStats.findUnique({
    where: { discordId },
  });
  
  let userValue: number | undefined;
  if (userStats) {
    userValue = getStatValue(userStats, type);
  }
  
  // If user is not in top 3, get nearby ranks
  if (userRank && userRank > LEADERBOARD_CONFIG.TOP_COUNT) {
    // Add separator indicator (will be rendered as "...")
    const nearbyStart = Math.max(
      LEADERBOARD_CONFIG.TOP_COUNT,
      userRank - LEADERBOARD_CONFIG.NEARBY_CONTEXT - 1
    );
    
    // Skip if there's a gap
    if (nearbyStart > LEADERBOARD_CONFIG.TOP_COUNT) {
      entries.push({ rank: -1, discordId: "separator", value: 0 });
    }
    
    // Get nearby entries
    const nearbyEntries = await getRankingsForType(
      type, 
      nearbyStart, 
      LEADERBOARD_CONFIG.NEARBY_CONTEXT * 2 + 1
    );
    
    for (const entry of nearbyEntries) {
      if (entry.rank > LEADERBOARD_CONFIG.TOP_COUNT) {
        if (entry.discordId === discordId) {
          entry.isCurrentUser = true;
        }
        entries.push(entry);
      }
    }
  } else if (userRank) {
    // User is in top 3, mark them
    for (const entry of entries) {
      if (entry.discordId === discordId) {
        entry.isCurrentUser = true;
      }
    }
  }
  
  const totalPlayers = await prisma.playerStats.count({
    where: getWhereClause(type),
  });
  
  let resetsIn: string | undefined;
  if (metadata.weekly) {
    resetsIn = getTimeUntilReset();
  }
  
  return {
    type,
    title: metadata.title,
    emoji: metadata.emoji,
    entries,
    totalPlayers,
    userRank,
    userValue,
    page: 1,
    totalPages: 1,
    resetsIn,
  };
}

/**
 * Get all rankings for a user (personal rank card)
 */
export async function getPersonalRankings(discordId: string): Promise<PersonalRankings> {
  const rankings: PersonalRankings["rankings"] = [];
  
  const userStats = await prisma.playerStats.findUnique({
    where: { discordId },
  });
  
  if (!userStats) {
    return { discordId, rankings: [] };
  }
  
  const boardTypes: LeaderboardType[] = [
    "total_catches",
    "weekly_catches",
    "pokedex",
    "shinies",
    "battle_wins",
    "fish_caught",
    "trades",
  ];
  
  for (const type of boardTypes) {
    const metadata = BOARD_METADATA[type];
    const rank = await getUserRank(type, discordId);
    const value = getStatValue(userStats, type);
    
    rankings.push({
      type,
      title: metadata.title,
      emoji: metadata.emoji,
      rank: rank || 0,
      value,
    });
  }
  
  return { discordId, rankings };
}

/**
 * Get historical snapshot for a board type and week
 */
export async function getHistoricalSnapshot(
  boardType: string,
  weekOf: Date
): Promise<LeaderboardSnapshot | null> {
  return prisma.leaderboardSnapshot.findUnique({
    where: {
      boardType_weekOf: {
        boardType,
        weekOf,
      },
    },
  });
}

/**
 * Get user's best week performance for a board type
 */
export async function getUserBestWeek(
  boardType: string,
  discordId: string
): Promise<{ weekOf: Date; value: number; rank: number } | null> {
  const snapshots = await prisma.leaderboardSnapshot.findMany({
    where: { boardType },
    orderBy: { weekOf: "desc" },
    take: 52, // Last year of weeks
  });
  
  let best: { weekOf: Date; value: number; rank: number } | null = null;
  
  for (const snapshot of snapshots) {
    const rankings = snapshot.rankings as Array<{ rank: number; discordId: string; value: number }>;
    const userEntry = rankings.find((r) => r.discordId === discordId);
    
    if (userEntry) {
      if (!best || userEntry.value > best.value) {
        best = {
          weekOf: snapshot.weekOf,
          value: userEntry.value,
          rank: userEntry.rank,
        };
      }
    }
  }
  
  return best;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getWhereClause(type: LeaderboardType): Record<string, { gt: number }> {
  switch (type) {
    case "total_catches":
      return { totalCatches: { gt: 0 } };
    case "weekly_catches":
      return { weeklyCatches: { gt: 0 } };
    case "pokedex":
      return { pokedexPercent: { gt: 0 } };
    case "shinies":
      return { totalShinies: { gt: 0 } };
    case "battle_wins":
      return { totalBattleWins: { gt: 0 } };
    case "season_wins":
      return { seasonWins: { gt: 0 } };
    case "fish_caught":
      return { totalFishCaught: { gt: 0 } };
    case "weekly_fish":
      return { weeklyFish: { gt: 0 } };
    case "trades":
      return { totalTrades: { gt: 0 } };
    default:
      return {};
  }
}

function getOrderByField(type: LeaderboardType): string {
  switch (type) {
    case "total_catches":
      return "totalCatches";
    case "weekly_catches":
      return "weeklyCatches";
    case "pokedex":
      return "pokedexPercent";
    case "shinies":
      return "totalShinies";
    case "battle_wins":
      return "totalBattleWins";
    case "season_wins":
      return "seasonWins";
    case "fish_caught":
      return "totalFishCaught";
    case "weekly_fish":
      return "weeklyFish";
    case "trades":
      return "totalTrades";
    default:
      return "totalCatches";
  }
}

function getStatValue(stats: PlayerStats, type: LeaderboardType): number {
  switch (type) {
    case "total_catches":
      return stats.totalCatches;
    case "weekly_catches":
      return stats.weeklyCatches;
    case "pokedex":
      return Math.round(stats.pokedexPercent * 100) / 100;
    case "shinies":
      return stats.totalShinies;
    case "battle_wins":
      return stats.totalBattleWins;
    case "season_wins":
      return stats.seasonWins;
    case "fish_caught":
      return stats.totalFishCaught;
    case "weekly_fish":
      return stats.weeklyFish;
    case "trades":
      return stats.totalTrades;
    default:
      return 0;
  }
}

async function getRankingsForType(
  type: LeaderboardType,
  skip: number,
  take: number
): Promise<RankingEntry[]> {
  const field = getOrderByField(type);
  const where = getWhereClause(type);
  
  const players = await prisma.playerStats.findMany({
    where,
    orderBy: { [field]: "desc" },
    skip,
    take,
    select: {
      discordId: true,
      totalCatches: true,
      weeklyCatches: true,
      pokedexPercent: true,
      totalShinies: true,
      totalBattleWins: true,
      seasonWins: true,
      totalFishCaught: true,
      weeklyFish: true,
      totalTrades: true,
    },
  });
  
  return players.map((player, index) => ({
    rank: skip + index + 1,
    discordId: player.discordId,
    value: getStatValue(player as PlayerStats, type),
  }));
}

async function getUserRank(type: LeaderboardType, discordId: string): Promise<number | undefined> {
  const userStats = await prisma.playerStats.findUnique({
    where: { discordId },
  });
  
  if (!userStats) return undefined;
  
  const field = getOrderByField(type);
  const userValue = getStatValue(userStats, type);
  
  if (userValue === 0) return undefined;
  
  // Count players with higher values
  const higherCount = await prisma.playerStats.count({
    where: {
      [field]: { gt: userValue },
    },
  });
  
  return higherCount + 1;
}

function getTimeUntilReset(): string {
  const now = new Date();
  const weekStart = getCurrentWeekStart();
  
  // Next reset is 7 days after current week start
  const nextReset = new Date(weekStart);
  nextReset.setDate(nextReset.getDate() + 7);
  
  const diff = nextReset.getTime() - now.getTime();
  
  if (diff <= 0) {
    return "Resetting...";
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}m`);
  
  return parts.join(" ") || "< 1m";
}

// ============================================================================
// EXPORTS
// ============================================================================

export const leaderboardsService = {
  getLeaderboard,
  getLeaderboardWithContext,
  getPersonalRankings,
  getHistoricalSnapshot,
  getUserBestWeek,
  LEADERBOARD_CONFIG,
  BOARD_METADATA,
};

export default leaderboardsService;
