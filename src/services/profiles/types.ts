/**
 * Profile Service Type Definitions
 */

/**
 * User profile with all related data
 */
export interface UserProfile {
  userId: string;
  discordId: string;
  nickname?: string | null;
  tagline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  coins: number;
  premiumCoins: number;
  profileVisibility: string;
  showStats: boolean;
  showAchievements: boolean;
  favoriteSpeciesId?: number | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date | null;
  lastActivityAt?: Date | null;
}

/**
 * User statistics
 */
export interface UserStats {
  userId: string;
  totalBattles: number;
  totalWins: number;
  totalLosses: number;
  winRate: number;
  totalCatches: number;
  totalEncounters: number;
  dailyQuestStreak: number;
  dailyQuestLastCompleted?: Date | null;
}

/**
 * User achievement
 */
export interface UserAchievement {
  achievementId: number;
  achievementSlug: string;
  achievementName: string;
  achievementDescription: string;
  category: string;
  rarity: string;
  coinReward: number;
  unlockedAt: Date;
  progress: number;
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  rank: number;
  userId: string;
  discordId: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  value: number;
  favoriteSpeciesId?: number | null;
}

/**
 * Leaderboard type
 */
export type LeaderboardType = 
  | 'battles'      // Total battles won
  | 'catches'      // Total catches
  | 'streaks'      // Daily quest streaks
  | 'winrate';     // Win rate (min 10 battles)

/**
 * Leaderboard query options
 */
export interface LeaderboardOptions {
  /** Leaderboard type */
  type: LeaderboardType;
  /** Number of entries to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Include user's rank even if not in top results */
  includeUserRank?: string;
}

/**
 * Leaderboard result
 */
export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  total: number;
  userRank?: LeaderboardEntry;
}
