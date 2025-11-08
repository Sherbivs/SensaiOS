/**
 * Profile Service
 * 
 * User profile management with caching, statistics, achievements,
 * and leaderboard queries.
 * 
 * @example
 * ```typescript
 * import { createProfileService } from './services/profiles';
 * import { pool } from './shared/prisma';
 * 
 * const profileService = createProfileService(pool, {
 *   memoryCacheTTL: 30 * 60 * 1000, // 30 minutes
 *   enableMetrics: true,
 * });
 * 
 * // Get user profile with caching
 * const profile = await profileService.getProfile('user_123');
 * console.log(`${profile.nickname} has ${profile.coins} coins`);
 * 
 * // Get user statistics
 * const stats = await profileService.getStats('user_123');
 * console.log(`Win rate: ${stats.winRate.toFixed(2)}%`);
 * 
 * // Get user achievements
 * const achievements = await profileService.getAchievements('user_123');
 * console.log(`Unlocked ${achievements.length} achievements`);
 * 
 * // Get leaderboard
 * const leaderboard = await profileService.getLeaderboard({
 *   type: 'battles',
 *   limit: 10,
 *   includeUserRank: 'user_123',
 * });
 * console.log(`Top player: ${leaderboard.entries[0].nickname} with ${leaderboard.entries[0].value} wins`);
 * console.log(`Your rank: #${leaderboard.userRank?.rank}`);
 * 
 * // Get metrics
 * const metrics = profileService.getMetrics();
 * console.log(`Cache hit rate: ${(metrics.profileCacheHits / metrics.profileQueriesTotal * 100).toFixed(2)}%`);
 * ```
 */

export * from './types.js';
export * from './ProfileService.js';
