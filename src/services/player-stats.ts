/**
 * Player Stats Service — Stat tracking for leaderboards
 * 
 * Provides centralized stat tracking and increment operations
 * for the leaderboards system. All game events should call this
 * service to update player statistics.
 * 
 * @module services/player-stats
 */

import logger from "../utils/logger.js";
import { prisma } from "../shared/prisma.js";
import type { PlayerStats } from "../generated/prisma/client.js";

// ============================================================================
// TYPES
// ============================================================================

export type StatType = 
  | "catches"
  | "battles_won"
  | "battles_lost"
  | "trades"
  | "fish_caught"
  | "walks"
  | "shinies"
  | "evolutions";

export interface StatUpdate {
  discordId: string;
  stat: StatType;
  amount?: number; // Default: 1
  metadata?: {
    pokemonType?: string;
    tradePartnerId?: string;
    isShiny?: boolean;
  };
}

export interface StatResult {
  success: boolean;
  stats?: PlayerStats;
  error?: string;
}

export interface WeeklyResetResult {
  success: boolean;
  playersReset: number;
  snapshotsSaved: string[];
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const STATS_CONFIG = {
  // Weekly reset day (0 = Sunday, 1 = Monday, etc.)
  WEEKLY_RESET_DAY: 1, // Monday
  WEEKLY_RESET_HOUR: 0, // Midnight UTC
  
  // Daily streak config
  DAILY_STREAK_HOURS: 24, // Hours to maintain streak
  DAILY_STREAK_GRACE: 12, // Grace period hours
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Get or create player stats record
 */
export async function getOrCreateStats(discordId: string): Promise<PlayerStats> {
  let stats = await prisma.playerStats.findUnique({
    where: { discordId },
  });
  
  if (!stats) {
    stats = await prisma.playerStats.create({
      data: { discordId },
    });
    logger.log("detail", `Created new player stats for ${discordId}`);
  }
  
  return stats;
}

/**
 * Increment a player stat with optional metadata tracking
 */
export async function incrementStat(update: StatUpdate): Promise<StatResult> {
  const { discordId, stat, amount = 1, metadata } = update;
  
  try {
    // Build the update data based on stat type
    const updateData = buildStatUpdate(stat, amount, metadata);
    
    const stats = await prisma.playerStats.upsert({
      where: { discordId },
      create: { 
        discordId,
        ...updateData.create,
      },
      update: updateData.update,
    });
    
    logger.log("detail", `Updated stat ${stat} for ${discordId}: +${amount}`);
    
    return { success: true, stats };
  } catch (error) {
    logger.log("error", `Failed to increment stat ${stat} for ${discordId}`, { error });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get a player's current stats
 */
export async function getPlayerStats(discordId: string): Promise<PlayerStats | null> {
  return prisma.playerStats.findUnique({
    where: { discordId },
  });
}

/**
 * Record a daily claim and update streak
 */
export async function recordDailyClaim(discordId: string): Promise<StatResult> {
  try {
    const now = new Date();
    const stats = await getOrCreateStats(discordId);
    
    // Calculate if streak should continue or reset
    const lastClaim = stats.lastDailyClaimAt;
    let newStreak = 1;
    
    if (lastClaim) {
      const hoursSinceClaim = (now.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
      const totalGraceHours = STATS_CONFIG.DAILY_STREAK_HOURS + STATS_CONFIG.DAILY_STREAK_GRACE;
      
      if (hoursSinceClaim <= totalGraceHours && hoursSinceClaim >= STATS_CONFIG.DAILY_STREAK_HOURS) {
        // Within valid claim window - continue streak
        newStreak = stats.dailyStreak + 1;
      } else if (hoursSinceClaim < STATS_CONFIG.DAILY_STREAK_HOURS) {
        // Already claimed today
        return { success: false, error: "Already claimed daily reward" };
      }
      // Else: streak breaks, newStreak stays at 1
    }
    
    const updatedStats = await prisma.playerStats.update({
      where: { discordId },
      data: {
        dailyStreak: newStreak,
        bestDailyStreak: Math.max(newStreak, stats.bestDailyStreak),
        lastDailyClaimAt: now,
      },
    });
    
    return { success: true, stats: updatedStats };
  } catch (error) {
    logger.log("error", `Failed to record daily claim for ${discordId}`, { error });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update battle streak after a battle result
 */
export async function updateBattleStreak(
  discordId: string, 
  won: boolean
): Promise<StatResult> {
  try {
    const stats = await getOrCreateStats(discordId);
    
    let newStreak = won ? stats.currentWinStreak + 1 : 0;
    let bestStreak = stats.bestWinStreak;
    
    if (won && newStreak > bestStreak) {
      bestStreak = newStreak;
    }
    
    const updatedStats = await prisma.playerStats.update({
      where: { discordId },
      data: {
        currentWinStreak: newStreak,
        bestWinStreak: bestStreak,
        totalBattleWins: won ? { increment: 1 } : undefined,
        totalBattleLosses: won ? undefined : { increment: 1 },
        weeklyBattles: { increment: 1 },
        seasonWins: won ? { increment: 1 } : undefined,
      },
    });
    
    return { success: true, stats: updatedStats };
  } catch (error) {
    logger.log("error", `Failed to update battle streak for ${discordId}`, { error });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Record a trade and track unique partners
 */
export async function recordTrade(
  discordId: string, 
  partnerId: string
): Promise<StatResult> {
  try {
    // Check if this is a new trade partner
    const existingTrades = await prisma.tradeLog.count({
      where: {
        OR: [
          { senderId: discordId, receiverId: partnerId },
          { senderId: partnerId, receiverId: discordId },
        ],
      },
    });
    
    const isNewPartner = existingTrades === 0;
    
    const stats = await prisma.playerStats.upsert({
      where: { discordId },
      create: { 
        discordId,
        totalTrades: 1,
        uniqueTradePartners: 1,
      },
      update: {
        totalTrades: { increment: 1 },
        uniqueTradePartners: isNewPartner ? { increment: 1 } : undefined,
      },
    });
    
    return { success: true, stats };
  } catch (error) {
    logger.log("error", `Failed to record trade for ${discordId}`, { error });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update Pokédex completion percentage
 */
export async function updatePokedexPercent(
  discordId: string, 
  percent: number
): Promise<StatResult> {
  try {
    const stats = await prisma.playerStats.upsert({
      where: { discordId },
      create: { 
        discordId,
        pokedexPercent: percent,
      },
      update: {
        pokedexPercent: percent,
      },
    });
    
    return { success: true, stats };
  } catch (error) {
    logger.log("error", `Failed to update Pokédex percent for ${discordId}`, { error });
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check if weekly stats should be reset
 */
export function shouldResetWeekly(weekStartedAt: Date): boolean {
  const now = new Date();
  const daysSinceStart = Math.floor(
    (now.getTime() - weekStartedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceStart >= 7;
}

/**
 * Get the start of the current week (Monday midnight UTC)
 */
export function getCurrentWeekStart(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since Monday
  
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysToSubtract);
  weekStart.setUTCHours(0, 0, 0, 0);
  
  return weekStart;
}

/**
 * Reset weekly stats for all players
 * Called by weekly cron job
 */
export async function resetWeeklyStats(): Promise<WeeklyResetResult> {
  try {
    const currentWeekStart = getCurrentWeekStart();
    
    // Get all players with weekly activity
    const activePlayers = await prisma.playerStats.findMany({
      where: {
        OR: [
          { weeklyCatches: { gt: 0 } },
          { weeklyFish: { gt: 0 } },
          { weeklyBattles: { gt: 0 } },
        ],
      },
    });
    
    // Save snapshots before reset
    const snapshotsSaved: string[] = [];
    
    if (activePlayers.length > 0) {
      const weekOf = new Date(currentWeekStart);
      weekOf.setDate(weekOf.getDate() - 7); // Last week
      
      // Weekly catches snapshot
      const catchRankings = activePlayers
        .filter((p) => p.weeklyCatches > 0)
        .sort((a, b) => b.weeklyCatches - a.weeklyCatches)
        .slice(0, 100)
        .map((p, i) => ({
          rank: i + 1,
          discordId: p.discordId,
          value: p.weeklyCatches,
        }));
      
      if (catchRankings.length > 0) {
        await prisma.leaderboardSnapshot.create({
          data: {
            boardType: "weekly_catches",
            weekOf,
            rankings: catchRankings,
          },
        });
        snapshotsSaved.push("weekly_catches");
      }
      
      // Weekly fish snapshot
      const fishRankings = activePlayers
        .filter((p) => p.weeklyFish > 0)
        .sort((a, b) => b.weeklyFish - a.weeklyFish)
        .slice(0, 100)
        .map((p, i) => ({
          rank: i + 1,
          discordId: p.discordId,
          value: p.weeklyFish,
        }));
      
      if (fishRankings.length > 0) {
        await prisma.leaderboardSnapshot.create({
          data: {
            boardType: "weekly_fish",
            weekOf,
            rankings: fishRankings,
          },
        });
        snapshotsSaved.push("weekly_fish");
      }
      
      // Weekly battles snapshot
      const battleRankings = activePlayers
        .filter((p) => p.weeklyBattles > 0)
        .sort((a, b) => b.weeklyBattles - a.weeklyBattles)
        .slice(0, 100)
        .map((p, i) => ({
          rank: i + 1,
          discordId: p.discordId,
          value: p.weeklyBattles,
        }));
      
      if (battleRankings.length > 0) {
        await prisma.leaderboardSnapshot.create({
          data: {
            boardType: "weekly_battles",
            weekOf,
            rankings: battleRankings,
          },
        });
        snapshotsSaved.push("weekly_battles");
      }
    }
    
    // Reset all weekly stats
    await prisma.playerStats.updateMany({
      data: {
        weeklyCatches: 0,
        weeklyFish: 0,
        weeklyBattles: 0,
        weekStartedAt: currentWeekStart,
      },
    });
    
    logger.log("info", `Weekly stats reset complete`, {
      playersReset: activePlayers.length,
      snapshotsSaved,
    });
    
    return {
      success: true,
      playersReset: activePlayers.length,
      snapshotsSaved,
    };
  } catch (error) {
    logger.log("error", "Failed to reset weekly stats", { error });
    return {
      success: false,
      playersReset: 0,
      snapshotsSaved: [],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface StatUpdateData {
  create: Record<string, number>;
  update: Record<string, { increment: number } | number>;
}

function buildStatUpdate(
  stat: StatType, 
  amount: number, 
  metadata?: StatUpdate["metadata"]
): StatUpdateData {
  const create: Record<string, number> = {};
  const update: Record<string, { increment: number } | number> = {};
  
  switch (stat) {
    case "catches":
      create.totalCatches = amount;
      create.weeklyCatches = amount;
      update.totalCatches = { increment: amount };
      update.weeklyCatches = { increment: amount };
      
      if (metadata?.isShiny) {
        create.totalShinies = 1;
        update.totalShinies = { increment: 1 };
      }
      break;
      
    case "battles_won":
      create.totalBattleWins = amount;
      create.weeklyBattles = amount;
      create.seasonWins = amount;
      update.totalBattleWins = { increment: amount };
      update.weeklyBattles = { increment: amount };
      update.seasonWins = { increment: amount };
      break;
      
    case "battles_lost":
      create.totalBattleLosses = amount;
      create.weeklyBattles = amount;
      update.totalBattleLosses = { increment: amount };
      update.weeklyBattles = { increment: amount };
      break;
      
    case "trades":
      create.totalTrades = amount;
      update.totalTrades = { increment: amount };
      break;
      
    case "fish_caught":
      create.totalFishCaught = amount;
      create.weeklyFish = amount;
      update.totalFishCaught = { increment: amount };
      update.weeklyFish = { increment: amount };
      break;
      
    case "walks":
      create.totalWalks = amount;
      update.totalWalks = { increment: amount };
      break;
      
    case "shinies":
      create.totalShinies = amount;
      update.totalShinies = { increment: amount };
      break;
      
    case "evolutions":
      create.totalEvolutions = amount;
      update.totalEvolutions = { increment: amount };
      break;
  }
  
  return { create, update };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const playerStatsService = {
  getOrCreateStats,
  incrementStat,
  getPlayerStats,
  recordDailyClaim,
  updateBattleStreak,
  recordTrade,
  updatePokedexPercent,
  resetWeeklyStats,
  shouldResetWeekly,
  getCurrentWeekStart,
  STATS_CONFIG,
};

export default playerStatsService;
