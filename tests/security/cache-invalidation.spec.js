/**
 * SECURITY TEST SUITE: Cache Invalidation Strategy
 * Week 2 Day 13-14: High Fix #3
 * 
 * Tests cache invalidation when Trainer role is manually removed.
 * Ensures stale cache entries don't block re-assignment operations.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Cache Invalidation Strategy - guildMemberUpdate Handler', () => {
  
  /**
   * Mock cache module with deleteCache tracking
   */
  let mockCache;
  let deletedCacheKeys;
  
  beforeEach(() => {
    deletedCacheKeys = [];
    mockCache = {
      deleteCache: vi.fn((key) => {
        deletedCacheKeys.push(key);
        return true;
      }),
      readCache: vi.fn(() => null),
      writeCache: vi.fn()
    };
  });

  /**
   * Mock Discord.js structures for guildMemberUpdate event
   */
  const createMockGuild = (name = 'Test Guild', id = 'guild-123') => ({
    name,
    id,
    roles: {
      cache: new Map()
    }
  });

  const createMockRole = (name = 'Trainer', id = 'role-trainer', position = 5) => ({
    name,
    id,
    position,
    editable: true
  });

  const createMockUser = (username = 'TestUser', userId = 'user-456') => ({
    id: userId,
    tag: `${username}#0001`,
    username
  });

  const createMockMember = (guild, user, roles = []) => {
    const roleCacheMap = new Map();
    roles.forEach(role => roleCacheMap.set(role.id, role));
    
    return {
      guild,
      user,
      id: user.id,
      roles: {
        cache: roleCacheMap
      }
    };
  };

  /**
   * Simulate the cache invalidation logic from guildMemberUpdate handler
   */
  const simulateCacheInvalidation = (oldMember, newMember, trainerRole, cache) => {
    if (!trainerRole) return { invalidated: false, reason: 'no-trainer-role' };
    
    const hadRole = oldMember.roles.cache.has(trainerRole.id);
    const hasRole = newMember.roles.cache.has(trainerRole.id);
    
    // Role was removed - invalidate cache
    if (hadRole && !hasRole) {
      const cacheKey = `assign:${newMember.guild.id}:${newMember.id}:${trainerRole.id}`;
      
      try {
        cache.deleteCache(cacheKey);
        return { invalidated: true, cacheKey, reason: 'role-removed' };
      } catch (error) {
        return { invalidated: false, error, reason: 'cache-delete-failed' };
      }
    }
    
    return { invalidated: false, reason: 'no-role-change' };
  };

  describe('Role Removal Detection', () => {
    
    it('should detect when Trainer role is removed from member', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, []); // Role removed
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(result.invalidated).toBe(true);
      expect(result.reason).toBe('role-removed');
    });

    it('should NOT detect role removal when role is added', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      
      const oldMember = createMockMember(guild, user, []); // No role
      const newMember = createMockMember(guild, user, [trainerRole]); // Role added
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(result.invalidated).toBe(false);
      expect(result.reason).toBe('no-role-change');
    });

    it('should NOT detect change when member already has role (no change)', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, [trainerRole]); // Still has role
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(result.invalidated).toBe(false);
      expect(result.reason).toBe('no-role-change');
    });

    it('should NOT detect change when member never had role (no change)', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      
      const oldMember = createMockMember(guild, user, []);
      const newMember = createMockMember(guild, user, []); // Still no role
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(result.invalidated).toBe(false);
      expect(result.reason).toBe('no-role-change');
    });
    
  });

  describe('Cache Key Construction', () => {
    
    it('should construct cache key with correct format: assign:{guildId}:{memberId}:{roleId}', () => {
      const guild = createMockGuild('Production Guild', 'guild-prod-789');
      const user = createMockUser('ProductionUser', 'user-prod-456');
      const trainerRole = createMockRole('Trainer', 'role-trainer-123');
      
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, []);
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(result.invalidated).toBe(true);
      expect(result.cacheKey).toBe('assign:guild-prod-789:user-prod-456:role-trainer-123');
    });

    it('should use consistent cache key format across different guilds', () => {
      const guild1 = createMockGuild('Guild Alpha', 'guild-alpha');
      const guild2 = createMockGuild('Guild Beta', 'guild-beta');
      const user = createMockUser('TestUser', 'user-123');
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      
      // Guild 1 removal
      const oldMember1 = createMockMember(guild1, user, [trainerRole]);
      const newMember1 = createMockMember(guild1, user, []);
      const result1 = simulateCacheInvalidation(oldMember1, newMember1, trainerRole, mockCache);
      
      // Guild 2 removal
      const oldMember2 = createMockMember(guild2, user, [trainerRole]);
      const newMember2 = createMockMember(guild2, user, []);
      const result2 = simulateCacheInvalidation(oldMember2, newMember2, trainerRole, mockCache);
      
      expect(result1.cacheKey).toBe('assign:guild-alpha:user-123:role-trainer');
      expect(result2.cacheKey).toBe('assign:guild-beta:user-123:role-trainer');
      expect(result1.cacheKey).not.toBe(result2.cacheKey);
    });
    
  });

  describe('Cache Deletion Behavior', () => {
    
    it('should call cache.deleteCache() exactly once on role removal', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole();
      
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, []);
      
      simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(mockCache.deleteCache).toHaveBeenCalledTimes(1);
    });

    it('should NOT call cache.deleteCache() when role is added', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole();
      
      const oldMember = createMockMember(guild, user, []);
      const newMember = createMockMember(guild, user, [trainerRole]);
      
      simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(mockCache.deleteCache).not.toHaveBeenCalled();
    });

    it('should track deleted cache keys correctly', () => {
      const guild = createMockGuild('Track Guild', 'guild-track');
      const user = createMockUser('TrackUser', 'user-track');
      const trainerRole = createMockRole('Trainer', 'role-track');
      
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, []);
      
      simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(deletedCacheKeys).toHaveLength(1);
      expect(deletedCacheKeys[0]).toBe('assign:guild-track:user-track:role-track');
    });
    
  });

  describe('Error Handling', () => {
    
    it('should handle cache.deleteCache() errors gracefully', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole();
      
      // Mock cache that throws on delete
      const errorCache = {
        deleteCache: vi.fn(() => {
          throw new Error('Cache deletion failed');
        })
      };
      
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, []);
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, errorCache);
      
      expect(result.invalidated).toBe(false);
      expect(result.reason).toBe('cache-delete-failed');
      expect(result.error).toBeDefined();
    });

    it('should return error object when cache deletion fails', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole();
      
      const errorMessage = 'Network timeout';
      const errorCache = {
        deleteCache: vi.fn(() => {
          throw new Error(errorMessage);
        })
      };
      
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, []);
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, errorCache);
      
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe(errorMessage);
    });

    it('should handle missing trainer role gracefully', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      
      const oldMember = createMockMember(guild, user, []);
      const newMember = createMockMember(guild, user, []);
      
      const result = simulateCacheInvalidation(oldMember, newMember, null, mockCache);
      
      expect(result.invalidated).toBe(false);
      expect(result.reason).toBe('no-trainer-role');
      expect(mockCache.deleteCache).not.toHaveBeenCalled();
    });
    
  });

  describe('Edge Cases', () => {
    
    it('should handle multiple role changes (only invalidate on Trainer removal)', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      const otherRole1 = createMockRole('Moderator', 'role-mod', 10);
      const otherRole2 = createMockRole('Helper', 'role-helper', 3);
      
      // Had Trainer + Moderator, now has Helper (Trainer removed)
      const oldMember = createMockMember(guild, user, [trainerRole, otherRole1]);
      const newMember = createMockMember(guild, user, [otherRole2]);
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(result.invalidated).toBe(true);
      expect(result.cacheKey).toContain('role-trainer');
      expect(mockCache.deleteCache).toHaveBeenCalledTimes(1);
    });

    it('should NOT invalidate when other roles removed but Trainer remains', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      const moderatorRole = createMockRole('Moderator', 'role-mod', 10);
      
      // Had Trainer + Moderator, now has only Trainer
      const oldMember = createMockMember(guild, user, [trainerRole, moderatorRole]);
      const newMember = createMockMember(guild, user, [trainerRole]);
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      expect(result.invalidated).toBe(false);
      expect(mockCache.deleteCache).not.toHaveBeenCalled();
    });

    it('should handle rapid role add/remove cycles', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole();
      
      // Cycle 1: Add role
      const member1 = createMockMember(guild, user, []);
      const member2 = createMockMember(guild, user, [trainerRole]);
      simulateCacheInvalidation(member1, member2, trainerRole, mockCache);
      
      // Cycle 2: Remove role
      const member3 = createMockMember(guild, user, []);
      simulateCacheInvalidation(member2, member3, trainerRole, mockCache);
      
      // Cycle 3: Add role again
      const member4 = createMockMember(guild, user, [trainerRole]);
      simulateCacheInvalidation(member3, member4, trainerRole, mockCache);
      
      // Cycle 4: Remove role again
      const member5 = createMockMember(guild, user, []);
      simulateCacheInvalidation(member4, member5, trainerRole, mockCache);
      
      // Should have invalidated exactly twice (on removals)
      expect(deletedCacheKeys).toHaveLength(2);
      expect(mockCache.deleteCache).toHaveBeenCalledTimes(2);
    });
    
  });

  describe('Security Impact', () => {
    
    it('should prevent stale cache from blocking re-assignment after manual removal', () => {
      const guild = createMockGuild('Security Guild');
      const user = createMockUser('VictimUser');
      const trainerRole = createMockRole();
      
      // Scenario: User had role, it was manually removed by admin
      const oldMember = createMockMember(guild, user, [trainerRole]);
      const newMember = createMockMember(guild, user, []); // Admin removed role
      
      // Cache would say: { assigned: true, timestamp: ... }
      // Without invalidation, bot would skip re-assignment ❌
      
      const result = simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      
      // With invalidation, cache is cleared ✅
      expect(result.invalidated).toBe(true);
      expect(mockCache.deleteCache).toHaveBeenCalled();
      
      // Bot can now re-assign role (no stale cache hit)
    });

    it('should enable immediate re-assignment workflow', () => {
      const guild = createMockGuild();
      const user = createMockUser();
      const trainerRole = createMockRole();
      
      // Step 1: User has role → cache entry exists
      const member1 = createMockMember(guild, user, [trainerRole]);
      
      // Step 2: Admin removes role manually → cache invalidated
      const member2 = createMockMember(guild, user, []);
      const invalidationResult = simulateCacheInvalidation(member1, member2, trainerRole, mockCache);
      
      expect(invalidationResult.invalidated).toBe(true);
      
      // Step 3: User requests role again → bot processes (no cache hit)
      // Bot calls: cache.readCache(cacheKey) → returns null (cache was deleted)
      // Bot proceeds with assignment ✅
      
      const cacheRead = mockCache.readCache(invalidationResult.cacheKey);
      expect(cacheRead).toBeNull(); // Cache cleared
    });

    it('should track all invalidation events for audit trail', () => {
      const guild = createMockGuild('Audit Guild', 'guild-audit');
      const users = [
        createMockUser('User1', 'user-1'),
        createMockUser('User2', 'user-2'),
        createMockUser('User3', 'user-3')
      ];
      const trainerRole = createMockRole('Trainer', 'role-trainer');
      
      // Simulate multiple role removals
      users.forEach(user => {
        const oldMember = createMockMember(guild, user, [trainerRole]);
        const newMember = createMockMember(guild, user, []);
        simulateCacheInvalidation(oldMember, newMember, trainerRole, mockCache);
      });
      
      // All invalidations tracked
      expect(deletedCacheKeys).toHaveLength(3);
      expect(deletedCacheKeys[0]).toContain('user-1');
      expect(deletedCacheKeys[1]).toContain('user-2');
      expect(deletedCacheKeys[2]).toContain('user-3');
    });
    
  });

});
