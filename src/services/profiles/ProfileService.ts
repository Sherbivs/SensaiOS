/**
 * Profile Service
 * 
 * Manages user profiles with caching for optimal performance.
 * 
 * Features:
 * - Profile queries with cache integration
 * - Statistics calculation
 * - Achievement tracking
 * - Leaderboard queries with pagination
 * - Multi-tier caching (30min in-memory, 24hr disk)
 */

import type { Pool } from 'pg';
import { log } from '../../utils/logger.js';
import type {
  UserProfile,
  UserStats,
  UserAchievement,
  LeaderboardEntry,
  LeaderboardOptions,
  LeaderboardResult,
  LeaderboardType,
} from './types.js';

/**
 * Profile service configuration
 */
export interface ProfileServiceConfig {
  /** In-memory cache TTL (ms) */
  memoryCacheTTL?: number;
  /** Disk cache TTL (ms) */
  diskCacheTTL?: number;
  /** Enable performance tracking */
  enableMetrics?: boolean;
  /** Custom logger */
  logger?: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
  };
}

/**
 * Profile service metrics
 */
export interface ProfileServiceMetrics {
  profileQueriesTotal: number;
  profileCacheHits: number;
  profileCacheMisses: number;
  statsQueriesTotal: number;
  achievementQueriesTotal: number;
  leaderboardQueriesTotal: number;
  avgQueryTime: number;
}

/**
 * Simple in-memory cache with TTL
 */
class SimpleCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  private ttl: number;

  constructor(ttl: number) {
    this.ttl = ttl;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttl,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * ProfileService manages user profile queries and caching
 */
export class ProfileService {
  private pool: Pool;
  private config: Required<ProfileServiceConfig>;
  private profileCache: SimpleCache<UserProfile>;
  private statsCache: SimpleCache<UserStats>;
  private achievementsCache: SimpleCache<UserAchievement[]>;
  private metrics: ProfileServiceMetrics = {
    profileQueriesTotal: 0,
    profileCacheHits: 0,
    profileCacheMisses: 0,
    statsQueriesTotal: 0,
    achievementQueriesTotal: 0,
    leaderboardQueriesTotal: 0,
    avgQueryTime: 0,
  };
  private totalQueryTime = 0;

  constructor(pool: Pool, config: ProfileServiceConfig = {}) {
    this.pool = pool;
    this.config = {
      memoryCacheTTL: config.memoryCacheTTL ?? 30 * 60 * 1000, // 30 minutes
      diskCacheTTL: config.diskCacheTTL ?? 24 * 60 * 60 * 1000, // 24 hours
      enableMetrics: config.enableMetrics ?? true,
      logger: config.logger ?? console,
    };

    this.profileCache = new SimpleCache<UserProfile>(this.config.memoryCacheTTL);
    this.statsCache = new SimpleCache<UserStats>(this.config.memoryCacheTTL);
    this.achievementsCache = new SimpleCache<UserAchievement[]>(this.config.memoryCacheTTL);
  }

  /**
   * Get user profile by ID with caching
   */
  async getProfile(userId: string): Promise<UserProfile | null> {
    const startTime = Date.now();
    this.metrics.profileQueriesTotal++;

    // Check cache
    const cached = this.profileCache.get(userId);
    if (cached) {
      this.metrics.profileCacheHits++;
      this.updateQueryTime(Date.now() - startTime);
      
      // Log cache hit rate if enabled
      if (this.config.enableMetrics) {
        const hitRate = this.metrics.profileCacheHits / this.metrics.profileQueriesTotal;
        if (hitRate < 0.7) {
          log('warn', '[ProfileService] Low profile cache hit rate', {
            hitRate: `${(hitRate * 100).toFixed(1)}%`,
            cacheHits: this.metrics.profileCacheHits,
            cacheMisses: this.metrics.profileCacheMisses,
          });
        }
      }
      
      return cached;
    }

    this.metrics.profileCacheMisses++;

    // Query database
    const result = await this.pool.query<UserProfile>(
      `SELECT 
        "id" as "userId",
        "discordId",
        "nickname",
        "tagline",
        "bio",
        "avatarUrl",
        "coins",
        "premiumCoins",
        "profileVisibility",
        "showStats",
        "showAchievements",
        "favoriteSpeciesId",
        "createdAt",
        "updatedAt",
        "lastLoginAt",
        "lastActivityAt"
      FROM "User"
      WHERE "id" = $1`,
      [userId]
    );

    const queryTime = Date.now() - startTime;
    this.updateQueryTime(queryTime);

    // Log slow queries
    if (this.config.enableMetrics && queryTime > 200) {
      log('warn', '[ProfileService] Slow profile query detected', {
        queryTimeMs: queryTime,
        userId,
        threshold: '200ms',
      });
    }

    if (result.rows.length === 0) {
      return null;
    }

    const profile = result.rows[0];
    this.profileCache.set(userId, profile);

    return profile;
  }

  /**
   * Get user statistics with caching
   */
  async getStats(userId: string): Promise<UserStats | null> {
    const startTime = Date.now();
    this.metrics.statsQueriesTotal++;

    // Check cache
    const cached = this.statsCache.get(userId);
    if (cached) {
      this.updateQueryTime(Date.now() - startTime);
      return cached;
    }

    // Query database
    const result = await this.pool.query<{
      id: string;
      totalBattles: number;
      totalWins: number;
      totalCatches: number;
      totalEncounters: number;
      dailyQuestStreak: number;
      dailyQuestLastCompleted: Date | null;
    }>(
      `SELECT 
        "id",
        "totalBattles",
        "totalWins",
        "totalCatches",
        "totalEncounters",
        "dailyQuestStreak",
        "dailyQuestLastCompleted"
      FROM "User"
      WHERE "id" = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      this.updateQueryTime(Date.now() - startTime);
      return null;
    }

    const row = result.rows[0];
    const stats: UserStats = {
      userId: row.id,
      totalBattles: row.totalBattles,
      totalWins: row.totalWins,
      totalLosses: row.totalBattles - row.totalWins,
      winRate: row.totalBattles > 0 ? (row.totalWins / row.totalBattles) * 100 : 0,
      totalCatches: row.totalCatches,
      totalEncounters: row.totalEncounters,
      dailyQuestStreak: row.dailyQuestStreak,
      dailyQuestLastCompleted: row.dailyQuestLastCompleted,
    };

    this.statsCache.set(userId, stats);
    this.updateQueryTime(Date.now() - startTime);

    return stats;
  }

  /**
   * Get user achievements with caching
   */
  async getAchievements(userId: string): Promise<UserAchievement[]> {
    const startTime = Date.now();
    this.metrics.achievementQueriesTotal++;

    // Check cache
    const cached = this.achievementsCache.get(userId);
    if (cached) {
      this.updateQueryTime(Date.now() - startTime);
      return cached;
    }

    // Query database
    const result = await this.pool.query<{
      achievementId: number;
      slug: string;
      name: string;
      description: string;
      category: string;
      rarity: string;
      coinReward: number;
      unlockedAt: Date;
      progress: number;
    }>(
      `SELECT 
        ua."achievementId",
        a."slug",
        a."name",
        a."description",
        a."category",
        a."rarity",
        a."coinReward",
        ua."unlockedAt",
        ua."progress"
      FROM "UserAchievement" ua
      JOIN "Achievement" a ON a."id" = ua."achievementId"
      WHERE ua."userId" = $1
      ORDER BY ua."unlockedAt" DESC`,
      [userId]
    );

    const achievements: UserAchievement[] = result.rows.map(row => ({
      achievementId: row.achievementId,
      achievementSlug: row.slug,
      achievementName: row.name,
      achievementDescription: row.description,
      category: row.category,
      rarity: row.rarity,
      coinReward: row.coinReward,
      unlockedAt: row.unlockedAt,
      progress: row.progress,
    }));

    this.achievementsCache.set(userId, achievements);
    this.updateQueryTime(Date.now() - startTime);

    return achievements;
  }

  /**
   * Get leaderboard with pagination
   */
  async getLeaderboard(options: LeaderboardOptions): Promise<LeaderboardResult> {
    const startTime = Date.now();
    this.metrics.leaderboardQueriesTotal++;

    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;

    const { orderBy, valueColumn } = this.getLeaderboardQuery(options.type);

    // Get leaderboard entries
    const entriesResult = await this.pool.query<{
      userId: string;
      discordId: string;
      nickname: string | null;
      avatarUrl: string | null;
      value: number;
      favoriteSpeciesId: number | null;
      row_num: string;
    }>(
      `SELECT 
        "id" as "userId",
        "discordId",
        "nickname",
        "avatarUrl",
        ${valueColumn} as "value",
        "favoriteSpeciesId",
        ROW_NUMBER() OVER (${orderBy}) as "row_num"
      FROM "User"
      WHERE "profileVisibility" = 'public' AND ${this.getLeaderboardFilter(options.type)}
      ORDER BY ${orderBy.replace('ORDER BY ', '')}
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const entries: LeaderboardEntry[] = entriesResult.rows.map(row => ({
      rank: parseInt(row.row_num, 10),
      userId: row.userId,
      discordId: row.discordId,
      nickname: row.nickname,
      avatarUrl: row.avatarUrl,
      value: row.value,
      favoriteSpeciesId: row.favoriteSpeciesId,
    }));

    // Get total count
    const countResult = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*) as "count" 
       FROM "User" 
       WHERE "profileVisibility" = 'public' AND ${this.getLeaderboardFilter(options.type)}`
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Get user rank if requested
    let userRank: LeaderboardEntry | undefined;
    if (options.includeUserRank) {
      const userRankResult = await this.pool.query<{
        userId: string;
        discordId: string;
        nickname: string | null;
        avatarUrl: string | null;
        value: number;
        favoriteSpeciesId: number | null;
        row_num: string;
      }>(
        `WITH ranked_users AS (
          SELECT 
            "id" as "userId",
            "discordId",
            "nickname",
            "avatarUrl",
            ${valueColumn} as "value",
            "favoriteSpeciesId",
            ROW_NUMBER() OVER (${orderBy}) as "row_num"
          FROM "User"
          WHERE "profileVisibility" = 'public' AND ${this.getLeaderboardFilter(options.type)}
        )
        SELECT * FROM ranked_users WHERE "userId" = $1`,
        [options.includeUserRank]
      );

      if (userRankResult.rows.length > 0) {
        const row = userRankResult.rows[0];
        userRank = {
          rank: parseInt(row.row_num, 10),
          userId: row.userId,
          discordId: row.discordId,
          nickname: row.nickname,
          avatarUrl: row.avatarUrl,
          value: row.value,
          favoriteSpeciesId: row.favoriteSpeciesId,
        };
      }
    }

    this.updateQueryTime(Date.now() - startTime);

    return {
      entries,
      total,
      userRank,
    };
  }

  /**
   * Get leaderboard query configuration
   */
  private getLeaderboardQuery(type: LeaderboardType): { orderBy: string; valueColumn: string } {
    switch (type) {
      case 'battles':
        return {
          orderBy: 'ORDER BY "totalWins" DESC, "totalBattles" DESC',
          valueColumn: '"totalWins"',
        };
      case 'catches':
        return {
          orderBy: 'ORDER BY "totalCatches" DESC',
          valueColumn: '"totalCatches"',
        };
      case 'streaks':
        return {
          orderBy: 'ORDER BY "dailyQuestStreak" DESC',
          valueColumn: '"dailyQuestStreak"',
        };
      case 'winrate':
        return {
          orderBy: 'ORDER BY ("totalWins"::float / GREATEST("totalBattles", 1)) DESC',
          valueColumn: '("totalWins"::float / GREATEST("totalBattles", 1)) * 100',
        };
      default:
        throw new Error(`Unknown leaderboard type: ${type}`);
    }
  }

  /**
   * Get leaderboard filter
   */
  private getLeaderboardFilter(type: LeaderboardType): string {
    switch (type) {
      case 'battles':
        return '"totalBattles" > 0';
      case 'catches':
        return '"totalCatches" > 0';
      case 'streaks':
        return '"dailyQuestStreak" > 0';
      case 'winrate':
        return '"totalBattles" >= 10'; // Minimum 10 battles for fair win rate
      default:
        return '1=1';
    }
  }

  /**
   * Invalidate cache for a user
   */
  invalidateCache(userId: string): void {
    this.profileCache.delete(userId);
    this.statsCache.delete(userId);
    this.achievementsCache.delete(userId);

    if (this.config.enableMetrics) {
      log('info', '[ProfileService] Cache invalidated for user', {
        userId,
        cacheStats: this.getCacheStats(),
      });
    }
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    const beforeStats = this.getCacheStats();
    this.profileCache.clear();
    this.statsCache.clear();
    this.achievementsCache.clear();

    if (this.config.enableMetrics) {
      log('info', '[ProfileService] All caches cleared', {
        beforeStats,
        afterStats: this.getCacheStats(),
      });
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      profileCacheSize: this.profileCache.size(),
      statsCacheSize: this.statsCache.size(),
      achievementsCacheSize: this.achievementsCache.size(),
    };
  }

  /**
   * Get service metrics
   */
  getMetrics(): ProfileServiceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      profileQueriesTotal: 0,
      profileCacheHits: 0,
      profileCacheMisses: 0,
      statsQueriesTotal: 0,
      achievementQueriesTotal: 0,
      leaderboardQueriesTotal: 0,
      avgQueryTime: 0,
    };
    this.totalQueryTime = 0;
  }

  /**
   * Update query time metrics
   */
  private updateQueryTime(duration: number): void {
    this.totalQueryTime += duration;
    const totalQueries = 
      this.metrics.profileQueriesTotal +
      this.metrics.statsQueriesTotal +
      this.metrics.achievementQueriesTotal +
      this.metrics.leaderboardQueriesTotal;
    this.metrics.avgQueryTime = this.totalQueryTime / totalQueries;
  }
}

/**
 * Create a singleton profile service instance
 */
let globalService: ProfileService | null = null;

export function createProfileService(
  pool: Pool,
  config?: ProfileServiceConfig
): ProfileService {
  if (!globalService) {
    globalService = new ProfileService(pool, config);
  }
  return globalService;
}

export function getProfileService(): ProfileService | null {
  return globalService;
}
