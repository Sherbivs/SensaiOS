/**
 * Achievements Service — Achievement definitions and unlock logic
 * 
 * Provides achievement checking, unlock tracking, and reward claiming.
 * This service should be called after relevant game events to check
 * for newly unlocked achievements.
 * 
 * @module services/achievements
 */

import logger from "../utils/logger.js";
import { prisma } from "../shared/prisma.js";
import type { AchievementDef, PlayerStats } from "../generated/prisma/client.js";

// ============================================================================
// TYPES
// ============================================================================

export type AchievementCategory = 
  | "collection"
  | "battle"
  | "social"
  | "exploration"
  | "mastery"
  | "special";

export type AchievementRarity = 
  | "bronze"
  | "silver"
  | "gold"
  | "diamond"
  | "legendary";

export interface AchievementWithProgress {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  requirement: number;
  rewardMoney: number;
  rewardBadge: string | null;
  sortOrder: number;
  unlocked: boolean;
  unlockedAt?: Date;
  rewardClaimed: boolean;
  progress: number;
  progressPercent: number;
}

export interface UnlockResult {
  success: boolean;
  achievement?: AchievementDef;
  alreadyUnlocked?: boolean;
  error?: string;
}

export interface ClaimResult {
  success: boolean;
  moneyAwarded?: number;
  badgeAwarded?: string | null;
  error?: string;
}

export interface CheckResult {
  newUnlocks: AchievementDef[];
  checkedCount: number;
}

/**
 * Achievement definition input for seeding.
 * Explicitly typed to match Prisma create input.
 */
export interface AchievementDefInput {
  code: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  requirement: number;
  rewardMoney: number;
  rewardBadge: string | null;
  sortOrder: number;
}

// ============================================================================
// ACHIEVEMENT CODES
// ============================================================================

export const ACHIEVEMENT_CODES = {
  // Collection
  FIRST_CATCH: "FIRST_CATCH",
  BUG_CATCHER: "BUG_CATCHER",
  WATER_WARRIOR: "WATER_WARRIOR",
  TYPE_COLLECTOR: "TYPE_COLLECTOR",
  CENTURY_CLUB: "CENTURY_CLUB",
  POKEMON_MASTER: "POKEMON_MASTER",
  SHINY_FOUND: "SHINY_FOUND",
  SHINY_HUNTER: "SHINY_HUNTER",
  COMPLETE_DEX: "COMPLETE_DEX",
  
  // Battle
  FIRST_VICTORY: "FIRST_VICTORY",
  WIN_STREAK_3: "WIN_STREAK_3",
  WIN_STREAK_10: "WIN_STREAK_10",
  TYPE_EXPERT: "TYPE_EXPERT",
  UNDERDOG: "UNDERDOG",
  PERFECT_MATCH: "PERFECT_MATCH",
  BATTLE_LEGEND: "BATTLE_LEGEND",
  
  // Social
  FIRST_TRADE: "FIRST_TRADE",
  TRADE_PARTNER: "TRADE_PARTNER",
  TRADE_MASTER: "TRADE_MASTER",
  SOCIAL_BUTTERFLY: "SOCIAL_BUTTERFLY",
  DAILY_7: "DAILY_7",
  DAILY_30: "DAILY_30",
  
  // Exploration
  FIRST_STEPS: "FIRST_STEPS",
  EXPLORER: "EXPLORER",
  MARATHONER: "MARATHONER",
  FIRST_FISH: "FIRST_FISH",
  FISHING_HOBBYIST: "FISHING_HOBBYIST",
  FISHING_PRO: "FISHING_PRO",
  ROD_COLLECTOR: "ROD_COLLECTOR",
  
  // Mastery
  EVOLUTION_EXPERT: "EVOLUTION_EXPERT",
  STONE_MASTER: "STONE_MASTER",
  LEVEL_100: "LEVEL_100",
  TEAM_BUILDER: "TEAM_BUILDER",
  RICH_TRAINER: "RICH_TRAINER",
} as const;

export type AchievementCode = typeof ACHIEVEMENT_CODES[keyof typeof ACHIEVEMENT_CODES];

// ============================================================================
// ACHIEVEMENT DEFINITIONS (for seeding)
// ============================================================================

export const ACHIEVEMENT_DEFINITIONS: AchievementDefInput[] = [
  // Collection
  { code: "FIRST_CATCH", name: "First Catch!", description: "Catch your first Pokémon", category: "collection", rarity: "bronze", requirement: 1, rewardMoney: 100, rewardBadge: null, sortOrder: 1 },
  { code: "BUG_CATCHER", name: "Bug Catcher", description: "Catch 10 Bug-types", category: "collection", rarity: "bronze", requirement: 10, rewardMoney: 0, rewardBadge: "BUG_BADGE", sortOrder: 2 },
  { code: "WATER_WARRIOR", name: "Water Warrior", description: "Catch 10 Water-types", category: "collection", rarity: "bronze", requirement: 10, rewardMoney: 0, rewardBadge: "WATER_BADGE", sortOrder: 3 },
  { code: "TYPE_COLLECTOR", name: "Type Collector", description: "Catch 1 of each type", category: "collection", rarity: "silver", requirement: 18, rewardMoney: 1000, rewardBadge: null, sortOrder: 4 },
  { code: "CENTURY_CLUB", name: "Century Club", description: "Catch 100 Pokémon", category: "collection", rarity: "silver", requirement: 100, rewardMoney: 500, rewardBadge: null, sortOrder: 5 },
  { code: "POKEMON_MASTER", name: "Pokémon Master", description: "Catch 500 Pokémon", category: "collection", rarity: "gold", requirement: 500, rewardMoney: 0, rewardBadge: "MASTER_BADGE", sortOrder: 6 },
  { code: "SHINY_FOUND", name: "Shiny Found!", description: "Find your first shiny", category: "collection", rarity: "bronze", requirement: 1, rewardMoney: 0, rewardBadge: "SHINY_BADGE", sortOrder: 7 },
  { code: "SHINY_HUNTER", name: "Shiny Hunter", description: "Find 10 shinies", category: "collection", rarity: "gold", requirement: 10, rewardMoney: 0, rewardBadge: "HUNTER_BADGE", sortOrder: 8 },
  { code: "COMPLETE_DEX", name: "Gotta Catch 'Em All", description: "Complete the Pokédex", category: "collection", rarity: "diamond", requirement: 100, rewardMoney: 0, rewardBadge: "COMPLETION_BADGE", sortOrder: 9 },
  
  // Battle
  { code: "FIRST_VICTORY", name: "First Victory", description: "Win your first battle", category: "battle", rarity: "bronze", requirement: 1, rewardMoney: 100, rewardBadge: null, sortOrder: 10 },
  { code: "WIN_STREAK_3", name: "Win Streak 3", description: "Win 3 battles in a row", category: "battle", rarity: "silver", requirement: 3, rewardMoney: 200, rewardBadge: null, sortOrder: 11 },
  { code: "WIN_STREAK_10", name: "Win Streak 10", description: "Win 10 battles in a row", category: "battle", rarity: "gold", requirement: 10, rewardMoney: 1000, rewardBadge: null, sortOrder: 12 },
  { code: "TYPE_EXPERT", name: "Type Expert", description: "Win using only one type", category: "battle", rarity: "silver", requirement: 1, rewardMoney: 0, rewardBadge: "TYPE_BADGE", sortOrder: 13 },
  { code: "UNDERDOG", name: "Underdog Victory", description: "Beat someone 10+ levels higher", category: "battle", rarity: "silver", requirement: 1, rewardMoney: 500, rewardBadge: null, sortOrder: 14 },
  { code: "PERFECT_MATCH", name: "Perfect Match", description: "Win without taking damage", category: "battle", rarity: "silver", requirement: 1, rewardMoney: 300, rewardBadge: null, sortOrder: 15 },
  { code: "BATTLE_LEGEND", name: "Battle Legend", description: "Win 100 battles", category: "battle", rarity: "gold", requirement: 100, rewardMoney: 0, rewardBadge: "LEGEND_BADGE", sortOrder: 16 },
  
  // Social
  { code: "FIRST_TRADE", name: "First Trade", description: "Complete your first trade", category: "social", rarity: "bronze", requirement: 1, rewardMoney: 100, rewardBadge: null, sortOrder: 17 },
  { code: "TRADE_PARTNER", name: "Trade Partner", description: "Trade 10 times", category: "social", rarity: "silver", requirement: 10, rewardMoney: 300, rewardBadge: null, sortOrder: 18 },
  { code: "TRADE_MASTER", name: "Trade Master", description: "Trade 50 times", category: "social", rarity: "gold", requirement: 50, rewardMoney: 0, rewardBadge: "TRADE_BADGE", sortOrder: 19 },
  { code: "SOCIAL_BUTTERFLY", name: "Social Butterfly", description: "Trade with 10 different players", category: "social", rarity: "silver", requirement: 10, rewardMoney: 500, rewardBadge: null, sortOrder: 20 },
  { code: "DAILY_7", name: "Daily Player", description: "Claim daily rewards 7 days in a row", category: "social", rarity: "silver", requirement: 7, rewardMoney: 200, rewardBadge: null, sortOrder: 21 },
  { code: "DAILY_30", name: "Dedicated", description: "Claim daily rewards 30 days in a row", category: "social", rarity: "gold", requirement: 30, rewardMoney: 1000, rewardBadge: null, sortOrder: 22 },
  
  // Exploration
  { code: "FIRST_STEPS", name: "First Steps", description: "Walk 100 times", category: "exploration", rarity: "bronze", requirement: 100, rewardMoney: 100, rewardBadge: null, sortOrder: 23 },
  { code: "EXPLORER", name: "Explorer", description: "Walk 1,000 times", category: "exploration", rarity: "silver", requirement: 1000, rewardMoney: 500, rewardBadge: null, sortOrder: 24 },
  { code: "MARATHONER", name: "Marathoner", description: "Walk 10,000 times", category: "exploration", rarity: "gold", requirement: 10000, rewardMoney: 0, rewardBadge: "EXPLORER_BADGE", sortOrder: 25 },
  { code: "FIRST_FISH", name: "First Fish", description: "Catch a fish", category: "exploration", rarity: "bronze", requirement: 1, rewardMoney: 100, rewardBadge: null, sortOrder: 26 },
  { code: "FISHING_HOBBYIST", name: "Fishing Hobbyist", description: "Catch 50 fish", category: "exploration", rarity: "silver", requirement: 50, rewardMoney: 300, rewardBadge: null, sortOrder: 27 },
  { code: "FISHING_PRO", name: "Fishing Pro", description: "Catch 500 fish", category: "exploration", rarity: "gold", requirement: 500, rewardMoney: 0, rewardBadge: "FISH_BADGE", sortOrder: 28 },
  { code: "ROD_COLLECTOR", name: "Rod Collector", description: "Own all fishing rods", category: "exploration", rarity: "silver", requirement: 3, rewardMoney: 1000, rewardBadge: null, sortOrder: 29 },
  
  // Mastery
  { code: "EVOLUTION_EXPERT", name: "Evolution Expert", description: "Evolve 10 Pokémon", category: "mastery", rarity: "silver", requirement: 10, rewardMoney: 500, rewardBadge: null, sortOrder: 30 },
  { code: "STONE_MASTER", name: "Stone Master", description: "Use 5 evolution stones", category: "mastery", rarity: "silver", requirement: 5, rewardMoney: 300, rewardBadge: null, sortOrder: 31 },
  { code: "LEVEL_100", name: "Level 100 Club", description: "Raise a Pokémon to level 100", category: "mastery", rarity: "diamond", requirement: 1, rewardMoney: 0, rewardBadge: "MAX_BADGE", sortOrder: 32 },
  { code: "TEAM_BUILDER", name: "Team Builder", description: "Have a full party of 6", category: "mastery", rarity: "silver", requirement: 6, rewardMoney: 200, rewardBadge: null, sortOrder: 33 },
  { code: "RICH_TRAINER", name: "Rich Trainer", description: "Accumulate 100,000₽", category: "mastery", rarity: "gold", requirement: 100000, rewardMoney: 0, rewardBadge: "RICH_BADGE", sortOrder: 34 },
];

// ============================================================================
// RARITY DISPLAY
// ============================================================================

export const RARITY_DISPLAY: Record<AchievementRarity, { emoji: string; color: number }> = {
  bronze: { emoji: "🟫", color: 0xCD7F32 },
  silver: { emoji: "🥈", color: 0xC0C0C0 },
  gold: { emoji: "🥇", color: 0xFFD700 },
  diamond: { emoji: "💎", color: 0x00D4FF },
  legendary: { emoji: "✨", color: 0x9B59B6 },
};

export const CATEGORY_DISPLAY: Record<AchievementCategory, { emoji: string; name: string }> = {
  collection: { emoji: "📚", name: "Collection" },
  battle: { emoji: "⚔️", name: "Battle" },
  social: { emoji: "🤝", name: "Social" },
  exploration: { emoji: "🌍", name: "Exploration" },
  mastery: { emoji: "⭐", name: "Mastery" },
  special: { emoji: "🎉", name: "Special" },
};

// ============================================================================
// SERVICE FUNCTIONS
// ============================================================================

/**
 * Seed achievement definitions (run once on startup or migration)
 */
export async function seedAchievements(): Promise<number> {
  let created = 0;
  
  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const existing = await prisma.achievementDef.findUnique({
      where: { code: def.code },
    });
    
    if (!existing) {
      await prisma.achievementDef.create({
        data: def,
      });
      created++;
    }
  }
  
  if (created > 0) {
    logger.log("info", `Seeded ${created} new achievement definitions`);
  }
  
  return created;
}

/**
 * Get all achievements for a category with user progress
 */
export async function getAchievementsByCategory(
  category: AchievementCategory,
  discordId: string,
  stats?: PlayerStats
): Promise<AchievementWithProgress[]> {
  // Get all achievements in category
  const achievements = await prisma.achievementDef.findMany({
    where: { category },
    orderBy: { sortOrder: "asc" },
  });
  
  // Get user's unlocks
  const unlocks = await prisma.achievementUnlock.findMany({
    where: {
      discordId,
      achievementId: { in: achievements.map((a) => a.id) },
    },
  });
  
  const unlockMap = new Map(unlocks.map((u) => [u.achievementId, u]));
  
  // Get stats if not provided
  if (!stats) {
    stats = await prisma.playerStats.findUnique({
      where: { discordId },
    }) || undefined;
  }
  
  // Build progress data
  return achievements.map((ach) => {
    const unlock = unlockMap.get(ach.id);
    const progress = stats ? getProgress(ach.code as AchievementCode, stats) : 0;
    
    return {
      ...ach,
      unlocked: !!unlock,
      unlockedAt: unlock?.unlockedAt,
      rewardClaimed: unlock?.rewardClaimed ?? false,
      progress,
      progressPercent: Math.min(100, Math.round((progress / ach.requirement) * 100)),
    };
  });
}

/**
 * Get user's overall achievement progress
 */
export async function getAchievementSummary(discordId: string): Promise<{
  total: number;
  unlocked: number;
  percent: number;
  recentUnlock?: { name: string; unlockedAt: Date };
  byCategory: Record<AchievementCategory, { total: number; unlocked: number }>;
}> {
  const allAchievements = await prisma.achievementDef.findMany();
  const unlocks = await prisma.achievementUnlock.findMany({
    where: { discordId },
    include: { achievement: true },
    orderBy: { unlockedAt: "desc" },
  });
  
  const unlockSet = new Set(unlocks.map((u) => u.achievementId));
  
  const byCategory: Record<AchievementCategory, { total: number; unlocked: number }> = {
    collection: { total: 0, unlocked: 0 },
    battle: { total: 0, unlocked: 0 },
    social: { total: 0, unlocked: 0 },
    exploration: { total: 0, unlocked: 0 },
    mastery: { total: 0, unlocked: 0 },
    special: { total: 0, unlocked: 0 },
  };
  
  for (const ach of allAchievements) {
    const cat = ach.category as AchievementCategory;
    byCategory[cat].total++;
    if (unlockSet.has(ach.id)) {
      byCategory[cat].unlocked++;
    }
  }
  
  const recentUnlock = unlocks[0]
    ? { name: unlocks[0].achievement.name, unlockedAt: unlocks[0].unlockedAt }
    : undefined;
  
  return {
    total: allAchievements.length,
    unlocked: unlocks.length,
    percent: Math.round((unlocks.length / allAchievements.length) * 100),
    recentUnlock,
    byCategory,
  };
}

/**
 * Check and unlock achievements based on current stats
 */
export async function checkAchievements(
  discordId: string,
  stats?: PlayerStats
): Promise<CheckResult> {
  // Get stats if not provided
  if (!stats) {
    const fetchedStats = await prisma.playerStats.findUnique({
      where: { discordId },
    });
    if (!fetchedStats) {
      return { newUnlocks: [], checkedCount: 0 };
    }
    stats = fetchedStats;
  }
  
  // Get all achievements not yet unlocked
  const allAchievements = await prisma.achievementDef.findMany();
  const existingUnlocks = await prisma.achievementUnlock.findMany({
    where: { discordId },
    select: { achievementId: true },
  });
  
  const unlockedIds = new Set(existingUnlocks.map((u) => u.achievementId));
  const unchecked = allAchievements.filter((a) => !unlockedIds.has(a.id));
  
  const newUnlocks: AchievementDef[] = [];
  
  for (const ach of unchecked) {
    const progress = getProgress(ach.code as AchievementCode, stats);
    
    if (progress >= ach.requirement) {
      // Unlock achievement
      await prisma.achievementUnlock.create({
        data: {
          discordId,
          achievementId: ach.id,
        },
      });
      
      newUnlocks.push(ach);
      logger.log("info", `Achievement unlocked: ${ach.name} for ${discordId}`);
    }
  }
  
  return { newUnlocks, checkedCount: unchecked.length };
}

/**
 * Claim reward for an unlocked achievement
 */
export async function claimAchievementReward(
  discordId: string,
  achievementCode: string
): Promise<ClaimResult> {
  try {
    // Find achievement
    const achievement = await prisma.achievementDef.findUnique({
      where: { code: achievementCode },
    });
    
    if (!achievement) {
      return { success: false, error: "Achievement not found" };
    }
    
    // Check if unlocked
    const unlock = await prisma.achievementUnlock.findUnique({
      where: {
        discordId_achievementId: {
          discordId,
          achievementId: achievement.id,
        },
      },
    });
    
    if (!unlock) {
      return { success: false, error: "Achievement not unlocked" };
    }
    
    if (unlock.rewardClaimed) {
      return { success: false, error: "Reward already claimed" };
    }
    
    // Claim reward
    await prisma.$transaction([
      // Mark as claimed
      prisma.achievementUnlock.update({
        where: { id: unlock.id },
        data: { rewardClaimed: true },
      }),
      // Award money if applicable
      ...(achievement.rewardMoney > 0
        ? [
            prisma.user.update({
              where: { discordId },
              data: { coins: { increment: achievement.rewardMoney } },
            }),
          ]
        : []),
    ]);
    
    return {
      success: true,
      moneyAwarded: achievement.rewardMoney,
      badgeAwarded: achievement.rewardBadge,
    };
  } catch (error) {
    logger.log("error", `Failed to claim achievement ${achievementCode} for ${discordId}`, { error });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get specific achievement details with user progress
 */
export async function getAchievementDetail(
  achievementCode: string,
  discordId: string
): Promise<AchievementWithProgress | null> {
  const achievement = await prisma.achievementDef.findUnique({
    where: { code: achievementCode },
  });
  
  if (!achievement) return null;
  
  const unlock = await prisma.achievementUnlock.findUnique({
    where: {
      discordId_achievementId: {
        discordId,
        achievementId: achievement.id,
      },
    },
  });
  
  const stats = await prisma.playerStats.findUnique({
    where: { discordId },
  });
  
  const progress = stats ? getProgress(achievement.code as AchievementCode, stats) : 0;
  
  return {
    ...achievement,
    unlocked: !!unlock,
    unlockedAt: unlock?.unlockedAt,
    rewardClaimed: unlock?.rewardClaimed ?? false,
    progress,
    progressPercent: Math.min(100, Math.round((progress / achievement.requirement) * 100)),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get current progress for an achievement based on stats
 */
function getProgress(code: AchievementCode, stats: PlayerStats): number {
  switch (code) {
    // Collection
    case "FIRST_CATCH":
    case "CENTURY_CLUB":
    case "POKEMON_MASTER":
      return stats.totalCatches;
    case "BUG_CATCHER":
    case "WATER_WARRIOR":
    case "TYPE_COLLECTOR":
      return stats.uniqueTypesCaught;
    case "SHINY_FOUND":
    case "SHINY_HUNTER":
      return stats.totalShinies;
    case "COMPLETE_DEX":
      return stats.pokedexPercent;
      
    // Battle
    case "FIRST_VICTORY":
    case "BATTLE_LEGEND":
      return stats.totalBattleWins;
    case "WIN_STREAK_3":
    case "WIN_STREAK_10":
      return stats.bestWinStreak;
    case "TYPE_EXPERT":
    case "UNDERDOG":
    case "PERFECT_MATCH":
      return 0; // These need special tracking, return 0 for now
      
    // Social
    case "FIRST_TRADE":
    case "TRADE_PARTNER":
    case "TRADE_MASTER":
      return stats.totalTrades;
    case "SOCIAL_BUTTERFLY":
      return stats.uniqueTradePartners;
    case "DAILY_7":
    case "DAILY_30":
      return stats.bestDailyStreak;
      
    // Exploration
    case "FIRST_STEPS":
    case "EXPLORER":
    case "MARATHONER":
      return stats.totalWalks;
    case "FIRST_FISH":
    case "FISHING_HOBBYIST":
    case "FISHING_PRO":
      return stats.totalFishCaught;
    case "ROD_COLLECTOR":
      return 0; // Needs inventory check
      
    // Mastery
    case "EVOLUTION_EXPERT":
      return stats.totalEvolutions;
    case "STONE_MASTER":
      return 0; // Needs inventory tracking
    case "LEVEL_100":
      return 0; // Needs Pokemon check
    case "TEAM_BUILDER":
      return 0; // Needs party check
    case "RICH_TRAINER":
      return 0; // Needs User coins check
      
    default:
      return 0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const achievementsService = {
  seedAchievements,
  getAchievementsByCategory,
  getAchievementSummary,
  checkAchievements,
  claimAchievementReward,
  getAchievementDetail,
  ACHIEVEMENT_CODES,
  ACHIEVEMENT_DEFINITIONS,
  RARITY_DISPLAY,
  CATEGORY_DISPLAY,
};

export default achievementsService;
