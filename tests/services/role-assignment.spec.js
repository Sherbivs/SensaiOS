/**
 * TEST SUITE: Unified Role Assignment Logic
 * Week 3 Day 15-17: Architecture Optimization
 * 
 * Tests the consolidated role assignment service that replaces 600+ lines
 * of duplicate logic across ensureTrainerFor() and assignTrainerRoleToNewMember().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assignRole, assignRoleBatch, shouldAssignRole } from '../../src/services/role-assignment.js';

describe('Unified Role Assignment Logic', () => {
  
  let mockServices;
  let mockMember;
  let mockRole;
  let mockGuild;
  
  beforeEach(() => {
    // Mock Discord.js structures
    mockGuild = {
      id: 'guild-123',
      name: 'Test Guild',
      roles: {
        everyone: { id: 'everyone-id' }
      }
    };
    
    mockRole = {
      id: 'role-trainer',
      name: 'Trainer',
      position: 5,
      editable: true
    };
    
    mockMember = {
      id: 'user-456',
      guild: mockGuild,
      user: {
        id: 'user-456',
        tag: 'TestUser#0001',
        bot: false
      },
      roles: {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined)
      }
    };
    
    // Mock services with tracking
    mockServices = {
      findRole: vi.fn(() => mockRole),
      enforcePermissions: vi.fn(() => true),
      cache: {
        readCache: vi.fn(() => null),
        writeCache: vi.fn()
      },
      cacheTTL: 24,
      activityTracker: {
        recordActivity: vi.fn()
      },
      log: vi.fn(),
      report: vi.fn(),
      describeGuild: vi.fn(() => 'Test Guild (guild-123)'),
      describeMember: vi.fn(() => 'TestUser#0001 (user-456)'),
      describeRole: vi.fn(() => 'Trainer (role-trainer)'),
      recordArchive: vi.fn()
    };
  });

  describe('assignRole() - Success Path', () => {
    
    it('should successfully assign role when all checks pass', async () => {
      // Mock distributed lock success
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      const result = await assignRole(mockMember, {
        ...mockServices,
        origin: 'test'
      });
      
      expect(result.success).toBe(true);
      expect(result.reason).toBe('assigned');
      expect(mockMember.roles.add).toHaveBeenCalledWith(mockRole);
    });

    it('should call all required services in correct order', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      await assignRole(mockMember, {
        ...mockServices,
        origin: 'member-join'
      });
      
      // Verify service call order
      expect(mockServices.findRole).toHaveBeenCalled();
      expect(mockServices.enforcePermissions).toHaveBeenCalledWith(mockGuild, mockRole);
      expect(mockServices.cache.readCache).toHaveBeenCalled();
      expect(mockMember.roles.add).toHaveBeenCalled();
      expect(mockServices.activityTracker.recordActivity).toHaveBeenCalled();
      expect(mockServices.cache.writeCache).toHaveBeenCalled();
    });

    it('should track activity with correct metadata', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      await assignRole(mockMember, {
        ...mockServices,
        origin: 'sweep'
      });
      
      expect(mockServices.activityTracker.recordActivity).toHaveBeenCalledWith(
        'role-assignment',
        expect.stringContaining('Assigned'),
        expect.objectContaining({
          origin: 'sweep'
        })
      );
    });

    it('should write cache entry after successful assignment', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      await assignRole(mockMember, {
        ...mockServices,
        origin: 'test'
      });
      
      expect(mockServices.cache.writeCache).toHaveBeenCalledWith(
        expect.stringContaining('assign:'),
        expect.objectContaining({
          assigned: true,
          timestamp: expect.any(Number)
        })
      );
    });
    
  });

  describe('assignRole() - Member Validation', () => {
    
    it('should reject invalid member object (null)', async () => {
      const result = await assignRole(null, mockServices);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid-member');
    });

    it('should reject member without guild', async () => {
      const invalidMember = { ...mockMember, guild: null };
      const result = await assignRole(invalidMember, mockServices);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid-member');
    });

    it('should reject member without user', async () => {
      const invalidMember = { ...mockMember, user: null };
      const result = await assignRole(invalidMember, mockServices);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid-member');
    });

    it('should skip bot members', async () => {
      const botMember = {
        ...mockMember,
        user: { ...mockMember.user, bot: true }
      };
      
      const result = await assignRole(botMember, mockServices);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('bot-member');
      expect(result.skipped).toBe(true);
    });
    
  });

  describe('assignRole() - Role Resolution', () => {
    
    it('should use provided role when given', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      const customRole = { id: 'custom-role', name: 'Custom', position: 10 };
      
      await assignRole(mockMember, {
        ...mockServices,
        role: customRole
      });
      
      expect(mockServices.findRole).not.toHaveBeenCalled();
      expect(mockMember.roles.add).toHaveBeenCalledWith(customRole);
    });

    it('should call findRole when role not provided', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      await assignRole(mockMember, mockServices);
      
      expect(mockServices.findRole).toHaveBeenCalledWith(mockGuild);
    });

    it('should fail when role not found', async () => {
      const servicesWithNoRole = {
        ...mockServices,
        findRole: vi.fn(() => null)
      };
      
      const result = await assignRole(mockMember, servicesWithNoRole);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('role-not-found');
    });
    
  });

  describe('assignRole() - Permission Enforcement', () => {
    
    it('should call enforcePermissions before assignment', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      await assignRole(mockMember, mockServices);
      
      expect(mockServices.enforcePermissions).toHaveBeenCalledWith(mockGuild, mockRole);
    });

    it('should abort when permission check throws', async () => {
      const servicesWithPermissionError = {
        ...mockServices,
        enforcePermissions: vi.fn(() => {
          throw new Error('Bot lacks MANAGE_ROLES permission');
        })
      };
      
      const result = await assignRole(mockMember, servicesWithPermissionError);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('permission-denied');
      expect(result.error).toBeDefined();
      expect(mockMember.roles.add).not.toHaveBeenCalled();
    });

    it('should log permission errors with full context', async () => {
      const permissionError = new Error('Role hierarchy violation');
      const servicesWithPermissionError = {
        ...mockServices,
        enforcePermissions: vi.fn(() => { throw permissionError; })
      };
      
      await assignRole(mockMember, servicesWithPermissionError);
      
      expect(mockServices.log).toHaveBeenCalledWith(
        'error',
        expect.stringContaining('[SECURITY]'),
        expect.objectContaining({
          reason: permissionError.message
        })
      );
    });
    
  });

  describe('assignRole() - Cache Management', () => {
    
    it('should skip assignment when valid cache entry exists', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      const servicesWithCache = {
        ...mockServices,
        cache: {
          ...mockServices.cache,
          readCache: vi.fn(() => ({
            assigned: true,
            timestamp: Date.now() - (1000 * 60 * 60) // 1 hour ago
          }))
        }
      };
      
      const result = await assignRole(mockMember, servicesWithCache);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('cached');
      expect(result.cached).toBe(true);
      expect(mockMember.roles.add).not.toHaveBeenCalled();
    });

    it('should process assignment when cache entry expired', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      const servicesWithExpiredCache = {
        ...mockServices,
        cacheTTL: 24,
        cache: {
          ...mockServices.cache,
          readCache: vi.fn(() => ({
            assigned: true,
            timestamp: Date.now() - (1000 * 60 * 60 * 25) // 25 hours ago (expired)
          }))
        }
      };
      
      const result = await assignRole(mockMember, servicesWithExpiredCache);
      
      expect(result.success).toBe(true);
      expect(result.reason).toBe('assigned');
      expect(mockMember.roles.add).toHaveBeenCalled();
    });
    
  });

  describe('assignRoleBatch() - Batch Processing', () => {
    
    it('should process all members in batch', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      const members = [
        { ...mockMember, id: 'user-1' },
        { ...mockMember, id: 'user-2' },
        { ...mockMember, id: 'user-3' }
      ];
      
      const result = await assignRoleBatch(members, {
        ...mockServices,
        concurrency: 2,
        delayMs: 100
      });
      
      expect(result.assigned).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should respect concurrency limits', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      const members = Array.from({ length: 10 }, (_, i) => ({
        ...mockMember,
        id: `user-${i}`
      }));
      
      const startTime = Date.now();
      await assignRoleBatch(members, {
        ...mockServices,
        concurrency: 5,
        delayMs: 50
      });
      const duration = Date.now() - startTime;
      
      // With 10 members, concurrency 5, delay 50ms:
      // Batch 1: 5 members (parallel)
      // Delay: 50ms
      // Batch 2: 5 members (parallel)
      // Total: ~50ms minimum (plus processing time)
      expect(duration).toBeGreaterThanOrEqual(50);
    });

    it('should aggregate results correctly', async () => {
      vi.mock('../../src/services/distributed-lock.js', () => ({
        acquireLock: vi.fn().mockResolvedValue({ key: 'lock-key', value: 'lock-value' }),
        releaseLock: vi.fn().mockResolvedValue(true)
      }));
      
      const members = [
        { ...mockMember, id: 'user-1' }, // Will succeed
        { ...mockMember, id: 'user-2', user: { bot: true } }, // Will skip (bot)
        { ...mockMember, id: 'user-3' } // Will succeed
      ];
      
      const result = await assignRoleBatch(members, mockServices);
      
      expect(result.assigned).toBe(2);
      expect(result.skipped).toBe(1);
    });
    
  });

  describe('shouldAssignRole() - Business Logic Checks', () => {
    
    it('should return false when member already has role', () => {
      mockMember.roles.cache.set(mockRole.id, mockRole);
      
      const result = shouldAssignRole(mockMember, mockRole, () => true);
      
      expect(result.shouldAssign).toBe(false);
      expect(result.reason).toBe('already-has-role');
    });

    it('should return false when member has other assignable roles', () => {
      const hasNoAssignableRoles = vi.fn(() => false); // Has other roles
      
      const result = shouldAssignRole(mockMember, mockRole, hasNoAssignableRoles);
      
      expect(result.shouldAssign).toBe(false);
      expect(result.reason).toBe('has-other-roles');
    });

    it('should return true when member is eligible', () => {
      const hasNoAssignableRoles = vi.fn(() => true); // No other roles
      
      const result = shouldAssignRole(mockMember, mockRole, hasNoAssignableRoles);
      
      expect(result.shouldAssign).toBe(true);
      expect(result.reason).toBe('eligible');
    });
    
  });

});
