import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { ProfileService, type ProfileServiceConfig } from '../../src/services/profiles/ProfileService.js';
import type {
  UserProfile,
  UserStats,
  UserAchievement,
  LeaderboardOptions,
} from '../../src/services/profiles/types.js';

// Mock Pool instance
const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
} as unknown as Pool;

describe('ProfileService - Core Functionality', () => {
  let service: ProfileService;
  const testUserId = '123';
  const testDiscordId = '456789';

  const mockProfile: UserProfile = {
    userId: testUserId,
    discordId: testDiscordId,
    nickname: 'TestTrainer',
    tagline: 'Gotta Catch Em All',
    bio: 'Test bio',
    avatarUrl: null,
    coins: 1000,
    premiumCoins: 50,
    profileVisibility: 'public',
    showStats: true,
    showAchievements: true,
    favoriteSpeciesId: 25,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-10'),
    lastLoginAt: new Date('2024-01-10'),
    lastActivityAt: new Date('2024-01-10'),
  };

  const mockStats: UserStats = {
    userId: testUserId,
    totalWins: 10,
    totalBattles: 15,
    totalCatches: 50,
    totalEncounters: 60,
    dailyQuestStreak: 3,
    dailyQuestLastCompleted: new Date('2024-01-10'),
    winRate: (10 / 15) * 100,
    totalLosses: 5,
  };

  const mockAchievement: UserAchievement = {
    achievementId: 1,
    achievementSlug: 'first-catch',
    achievementName: 'First Catch',
    achievementDescription: 'Catch your first Pokémon',
    category: 'gameplay',
    rarity: 'common',
    coinReward: 100,
    unlockedAt: new Date('2024-01-02'),
    progress: 1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create service with short cache TTL for testing
    const config: ProfileServiceConfig = {
      memoryCacheTTL: 100, // 100ms for testing
      enableMetrics: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    
    service = new ProfileService(mockPool, config);
  });

  afterEach(() => {
    if (service) {
      service.clearCaches();
    }
  });

  describe('Profile Queries', () => {
    it('should fetch profile from database on first query', async () => {
      // Mock successful query
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [mockProfile],
        rowCount: 1,
      });

      const profile = await service.getProfile(testUserId);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(profile).toEqual(mockProfile);
    });

    it('should return null for non-existent profile', async () => {
      // Mock empty result
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const profile = await service.getProfile('nonexistent');

      expect(profile).toBeNull();
    });

    it('should cache profile queries', async () => {
      // Mock successful query
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [mockProfile],
        rowCount: 1,
      });

      // First query - hits database
      const profile1 = await service.getProfile(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      // Second query - hits cache
      const profile2 = await service.getProfile(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1); // No additional query
      expect(profile1).toEqual(profile2);

      // Verify cache hit metric
      const metrics = service.getMetrics();
      expect(metrics.profileQueriesTotal).toBe(2);
      expect(metrics.profileCacheHits).toBe(1);
      expect(metrics.profileCacheMisses).toBe(1);
    });
  });

  describe('Stats Queries', () => {
    it('should calculate win rate and total losses', async () => {
      // Mock stats query
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [{
          userId: testUserId,
          totalWins: 10,
          totalBattles: 15,
          totalCatches: 50,
          totalEvolutions: 20,
          activeDaysStreak: 5,
          dailyQuestStreak: 3,
          lastActivityAt: new Date('2024-01-10'),
        }],
        rowCount: 1,
      });

      const stats = await service.getStats(testUserId);

      expect(stats).toBeDefined();
      expect(stats?.winRate).toBeCloseTo(66.67, 1); // (10/15) * 100
      expect(stats?.totalLosses).toBe(5); // 15 - 10
    });

    it('should handle zero battles gracefully', async () => {
      // Mock stats with zero battles
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [{
          userId: testUserId,
          totalWins: 0,
          totalBattles: 0,
          totalCatches: 5,
          totalEncounters: 10,
          dailyQuestStreak: 1,
          dailyQuestLastCompleted: new Date('2024-01-10'),
        }],
        rowCount: 1,
      });

      const stats = await service.getStats(testUserId);

      expect(stats).toBeDefined();
      expect(stats?.winRate).toBe(0);
      expect(stats?.totalLosses).toBe(0);
    });

    it('should cache stats queries', async () => {
      // Mock successful query
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [mockStats],
        rowCount: 1,
      });

      // First query - hits database
      await service.getStats(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      // Second query - hits cache
      await service.getStats(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1); // No additional query

      // Verify cache hit metric
      const metrics = service.getMetrics();
      expect(metrics.statsQueriesTotal).toBe(2);
    });
  });

  describe('Achievement Queries', () => {
    it('should fetch achievements with JOIN', async () => {
      // Mock achievements query with database column names
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [{
          achievementId: 1,
          slug: 'first-catch',
          name: 'First Catch',
          description: 'Catch your first Pokémon',
          category: 'gameplay',
          rarity: 'common',
          coinReward: 100,
          unlockedAt: new Date('2024-01-02'),
          progress: 1,
        }],
        rowCount: 1,
      });

      const achievements = await service.getAchievements(testUserId);

      expect(mockPool.query).toHaveBeenCalledTimes(1);
      expect(achievements).toHaveLength(1);
      expect(achievements[0]).toEqual(mockAchievement);

      // Verify JOIN in query
      const query = (mockPool.query as any).mock.calls[0][0];
      expect(query).toContain('JOIN');
      expect(query).toContain('UserAchievement');
      expect(query).toContain('Achievement');
    });

    it('should cache achievements queries', async () => {
      // Mock successful query
      (mockPool.query as any).mockResolvedValueOnce({
        rows: [mockAchievement],
        rowCount: 1,
      });

      // First query - hits database
      await service.getAchievements(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      // Second query - hits cache
      await service.getAchievements(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1); // No additional query

      // Verify cache hit metric
      const metrics = service.getMetrics();
      expect(metrics.achievementQueriesTotal).toBe(2);
    });
  });

  describe('Leaderboard Queries', () => {
    const mockLeaderboardRow = {
      rank: 1,
      userId: testUserId,
      discordId: testDiscordId,
      nickname: 'TestTrainer',
      avatarUrl: null,
      value: 100,
      favoriteSpeciesId: 25,
    };

    it('should fetch battles leaderboard with pagination', async () => {
      // Mock leaderboard query - entries and count
      (mockPool.query as any)
        .mockResolvedValueOnce({
          rows: [{
            userId: testUserId,
            discordId: testDiscordId,
            nickname: 'TestTrainer',
            avatarUrl: null,
            value: 100,
            favoriteSpeciesId: 25,
            row_num: '1',
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ count: '50' }],
          rowCount: 1,
        });

      const options: LeaderboardOptions = {
        type: 'battles',
        limit: 10,
        offset: 0,
      };

      const result = await service.getLeaderboard(options);

      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(50);
      expect(result.entries[0].rank).toBe(1);
      expect(result.entries[0].value).toBe(100);

      // Verify ROW_NUMBER() in query
      const query = (mockPool.query as any).mock.calls[0][0];
      expect(query).toContain('ROW_NUMBER()');
      expect(query).toContain('totalWins');
    });

    it('should support different leaderboard types', async () => {
      const types: Array<'battles' | 'catches' | 'streaks' | 'winrate'> = [
        'battles',
        'catches',
        'streaks',
        'winrate',
      ];

      for (const type of types) {
        vi.clearAllMocks();
        
        // Mock queries
        (mockPool.query as any)
          .mockResolvedValueOnce({
            rows: [mockLeaderboardRow],
            rowCount: 1,
          })
          .mockResolvedValueOnce({
            rows: [{ total: 10 }],
            rowCount: 1,
          });

        await service.getLeaderboard({ type, limit: 10, offset: 0 });

        const query = (mockPool.query as any).mock.calls[0][0];
        
        // Verify correct ORDER BY for each type
        switch (type) {
          case 'battles':
            expect(query).toContain('totalWins');
            break;
          case 'catches':
            expect(query).toContain('totalCatches');
            break;
          case 'streaks':
            expect(query).toContain('dailyQuestStreak');
            break;
          case 'winrate':
            expect(query).toContain('totalWins');
            expect(query).toContain('totalBattles');
            break;
        }
      }
    });

    it('should include user rank when requested', async () => {
      // Mock leaderboard query - entries, count, and user rank
      (mockPool.query as any)
        .mockResolvedValueOnce({
          rows: [{
            userId: testUserId,
            discordId: testDiscordId,
            nickname: 'TestTrainer',
            avatarUrl: null,
            value: 100,
            favoriteSpeciesId: 25,
            row_num: '1',
          }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{ count: '50' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({
          rows: [{
            userId: testUserId,
            discordId: testDiscordId,
            nickname: 'TestTrainer',
            avatarUrl: null,
            value: 100,
            favoriteSpeciesId: 25,
            row_num: '15',
          }],
          rowCount: 1,
        });

      const options: LeaderboardOptions = {
        type: 'battles',
        limit: 10,
        offset: 0,
        includeUserRank: testUserId,
      };

      const result = await service.getLeaderboard(options);

      expect(result.userRank).toBeDefined();
      expect(result.userRank?.rank).toBe(15);
      expect(mockPool.query).toHaveBeenCalledTimes(3); // entries + total + user rank
    });
  });

  describe('Cache Management', () => {
    it('should invalidate user-specific cache entries', async () => {
      // Mock profile query
      (mockPool.query as any).mockResolvedValue({
        rows: [mockProfile],
        rowCount: 1,
      });

      // First query - populates cache
      await service.getProfile(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      // Second query - hits cache
      await service.getProfile(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidateCache(testUserId);

      // Third query - cache miss, hits database again
      await service.getProfile(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should clear all caches', async () => {
      // Mock queries
      (mockPool.query as any)
        .mockResolvedValueOnce({ rows: [mockProfile], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockStats], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockAchievement], rowCount: 1 });

      // Populate all caches
      await service.getProfile(testUserId);
      await service.getStats(testUserId);
      await service.getAchievements(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(3);

      // Clear all caches
      service.clearCaches();

      // Reset mock call count
      vi.clearAllMocks();
      (mockPool.query as any)
        .mockResolvedValueOnce({ rows: [mockProfile], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockStats], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [mockAchievement], rowCount: 1 });

      // All queries should hit database again
      await service.getProfile(testUserId);
      await service.getStats(testUserId);
      await service.getAchievements(testUserId);
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track query counts and cache statistics', async () => {
      // Mock profile query
      (mockPool.query as any).mockResolvedValue({
        rows: [mockProfile],
        rowCount: 1,
      });

      // Multiple queries - first misses cache, subsequent hit cache
      await service.getProfile(testUserId);
      await service.getProfile(testUserId);
      await service.getProfile(testUserId);

      const metrics = service.getMetrics();
      expect(metrics.profileQueriesTotal).toBe(3);
      expect(metrics.profileCacheHits).toBe(2);
      expect(metrics.profileCacheMisses).toBe(1);
      expect(metrics.avgQueryTime).toBeGreaterThanOrEqual(0);
    });
  });
});
