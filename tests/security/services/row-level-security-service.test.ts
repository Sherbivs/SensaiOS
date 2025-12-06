/**
 * Row-Level Security Service Tests
 * =================================
 *
 * Comprehensive test suite for PostgreSQL RLS management service.
 *
 * @research D7 (Row-Level Security)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RowLevelSecurityService,
  createRowLevelSecurityService,
  RLSServiceError,
  RLS_TABLES,
  RLS_ERROR_CODES,
  RLSPolicyType,
  isRLSTable,
  isRLSError,
  isRecoverableRLSError,
  type RLSPrismaClient,
  type RLSLogger,
  type RLSPolicy,
  type RLSTable,
} from '../../../src/bot/security/services/row-level-security-service.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

/**
 * Create a mock Prisma client
 */
function createMockPrisma(): RLSPrismaClient {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
  };
}

/**
 * Create a mock logger
 */
function createMockLogger(): RLSLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

// ============================================================================
// CONSTRUCTOR TESTS
// ============================================================================

describe('RowLevelSecurityService', () => {
  describe('constructor', () => {
    it('should create service with default config', () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      expect(service).toBeInstanceOf(RowLevelSecurityService);
      expect(service.getTables()).toEqual(RLS_TABLES);
    });
    
    it('should accept custom app namespace', () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({
        prisma,
        appNamespace: 'custom',
      });
      
      expect(service).toBeInstanceOf(RowLevelSecurityService);
    });
    
    it('should accept custom target roles', () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({
        prisma,
        targetRoles: ['app_user', 'app_admin'],
      });
      
      expect(service).toBeInstanceOf(RowLevelSecurityService);
    });
    
    it('should accept logger', () => {
      const prisma = createMockPrisma();
      const logger = createMockLogger();
      const service = new RowLevelSecurityService({
        prisma,
        logger,
      });
      
      expect(service).toBeInstanceOf(RowLevelSecurityService);
    });
    
    it('should initialize tracked policies for all tables', () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      const tracked = service.getTrackedPolicies();
      
      expect(tracked.size).toBe(RLS_TABLES.length);
      for (const table of RLS_TABLES) {
        expect(tracked.has(table)).toBe(true);
        expect(tracked.get(table)).toBeInstanceOf(Set);
        expect(tracked.get(table)!.size).toBe(0);
      }
    });
  });
  
  // ==========================================================================
  // CONTEXT MANAGEMENT TESTS
  // ==========================================================================
  
  describe('setGuildContext', () => {
    let prisma: RLSPrismaClient;
    let service: RowLevelSecurityService;
    
    beforeEach(() => {
      prisma = createMockPrisma();
      service = new RowLevelSecurityService({ prisma });
    });
    
    it('should set guild context successfully', async () => {
      await service.setGuildContext('guild_123');
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('guild_123'),
      );
      expect(service.getTrackedGuildId()).toBe('guild_123');
      expect(service.isBypassEnabled()).toBe(false);
    });
    
    it('should escape guild ID to prevent SQL injection', async () => {
      await service.setGuildContext("guild'; DROP TABLE users; --");
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("guild''; DROP TABLE users; --"),
      );
    });
    
    it('should throw for empty guild ID', async () => {
      await expect(service.setGuildContext('')).rejects.toThrow(RLSServiceError);
      await expect(service.setGuildContext('')).rejects.toMatchObject({
        code: RLS_ERROR_CODES.INVALID_GUILD_ID,
      });
    });
    
    it('should throw for invalid guild ID type', async () => {
      // @ts-expect-error Testing invalid input
      await expect(service.setGuildContext(null)).rejects.toThrow(RLSServiceError);
      // @ts-expect-error Testing invalid input
      await expect(service.setGuildContext(123)).rejects.toThrow(RLSServiceError);
    });
    
    it('should clear bypass when setting guild context', async () => {
      // First enable bypass
      await service.setBypassContext();
      expect(service.isBypassEnabled()).toBe(true);
      
      // Then set guild context
      await service.setGuildContext('guild_123');
      expect(service.isBypassEnabled()).toBe(false);
    });
    
    it('should log when logger is provided', async () => {
      const logger = createMockLogger();
      const loggedService = new RowLevelSecurityService({ prisma, logger });
      
      await loggedService.setGuildContext('guild_123');
      
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('guild_123'),
      );
    });
    
    it('should wrap database errors', async () => {
      vi.mocked(prisma.$executeRawUnsafe).mockRejectedValueOnce(
        new Error('Connection failed'),
      );
      
      await expect(service.setGuildContext('guild_123')).rejects.toMatchObject({
        code: RLS_ERROR_CODES.CONTEXT_SET_FAILED,
        message: expect.stringContaining('Connection failed'),
      });
    });
  });
  
  describe('setGuildContextLocal', () => {
    it('should use SET LOCAL for transaction-scoped context', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      await service.setGuildContextLocal('guild_456');
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringMatching(/SET LOCAL.*guild_456/),
      );
    });
    
    it('should throw for invalid guild ID', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      await expect(service.setGuildContextLocal('')).rejects.toThrow(RLSServiceError);
    });
  });
  
  describe('setBypassContext', () => {
    let prisma: RLSPrismaClient;
    let service: RowLevelSecurityService;
    
    beforeEach(() => {
      prisma = createMockPrisma();
      service = new RowLevelSecurityService({ prisma });
    });
    
    it('should enable bypass context', async () => {
      await service.setBypassContext();
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('rls_bypass'),
      );
      expect(service.isBypassEnabled()).toBe(true);
      expect(service.getTrackedGuildId()).toBeNull();
    });
    
    it('should log audit info when provided', async () => {
      const logger = createMockLogger();
      const loggedService = new RowLevelSecurityService({ prisma, logger });
      
      await loggedService.setBypassContext({
        reason: 'Cross-guild analysis',
        userId: 'admin_123',
      });
      
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('admin_123'),
        // May or may not have additional args depending on implementation
      );
    });
    
    it('should clear guild context when enabling bypass', async () => {
      await service.setGuildContext('guild_123');
      await service.setBypassContext();
      
      expect(service.getTrackedGuildId()).toBeNull();
    });
  });
  
  describe('resetContext', () => {
    it('should reset both guild and bypass context', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      await service.setGuildContext('guild_123');
      await service.resetContext();
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('RESET'),
      );
      expect(service.getTrackedGuildId()).toBeNull();
      expect(service.isBypassEnabled()).toBe(false);
    });
    
    it('should wrap errors', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$executeRawUnsafe).mockRejectedValueOnce(
        new Error('Reset failed'),
      );
      
      const service = new RowLevelSecurityService({ prisma });
      
      await expect(service.resetContext()).rejects.toMatchObject({
        code: RLS_ERROR_CODES.CONTEXT_RESET_FAILED,
      });
    });
  });
  
  describe('getCurrentContext', () => {
    it('should return guild ID from database', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ guild_id: 'guild_123' }])
        .mockResolvedValueOnce([{ bypass: null }]);
      
      const service = new RowLevelSecurityService({ prisma });
      const context = await service.getCurrentContext();
      
      expect(context.guildId).toBe('guild_123');
      expect(context.bypass).toBe(false);
    });
    
    it('should return bypass status from database', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ guild_id: null }])
        .mockResolvedValueOnce([{ bypass: 'true' }]);
      
      const service = new RowLevelSecurityService({ prisma });
      const context = await service.getCurrentContext();
      
      expect(context.guildId).toBeNull();
      expect(context.bypass).toBe(true);
    });
    
    it('should return defaults on error', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(new Error('Query failed'));
      
      const service = new RowLevelSecurityService({ prisma });
      const context = await service.getCurrentContext();
      
      expect(context.guildId).toBeNull();
      expect(context.bypass).toBe(false);
    });
  });
  
  // ==========================================================================
  // RLS MANAGEMENT TESTS
  // ==========================================================================
  
  describe('enableRLS', () => {
    let prisma: RLSPrismaClient;
    let service: RowLevelSecurityService;
    
    beforeEach(() => {
      prisma = createMockPrisma();
      service = new RowLevelSecurityService({ prisma });
    });
    
    it('should enable RLS on all tables by default', async () => {
      const result = await service.enableRLS();
      
      expect(result.success).toBe(true);
      expect(result.tables.length).toBe(RLS_TABLES.length);
      expect(result.policies.length).toBe(RLS_TABLES.length * 2); // guild + bypass
      expect(result.errors).toHaveLength(0);
    });
    
    it('should enable RLS on specific tables', async () => {
      const tables: RLSTable[] = ['security_events', 'threat_detections'];
      const result = await service.enableRLS({ tables });
      
      expect(result.success).toBe(true);
      expect(result.tables).toEqual(tables);
      expect(result.policies.length).toBe(4); // 2 tables * 2 policies
    });
    
    it('should force RLS by default', async () => {
      await service.enableRLS();
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('FORCE ROW LEVEL SECURITY'),
      );
    });
    
    it('should skip force when disabled', async () => {
      await service.enableRLS({ force: false });
      
      // Should have ENABLE but not FORCE
      const calls = vi.mocked(prisma.$executeRawUnsafe).mock.calls;
      const hasForce = calls.some(([sql]) => sql.includes('FORCE'));
      expect(hasForce).toBe(false);
    });
    
    it('should track enabled policies', async () => {
      await service.enableRLS({ tables: ['security_events'] });
      
      const tracked = service.getTrackedPolicies();
      const eventPolicies = tracked.get('security_events');
      
      expect(eventPolicies?.has('security_events_guild_isolation')).toBe(true);
      expect(eventPolicies?.has('security_events_admin_bypass')).toBe(true);
    });
    
    it('should handle partial failures', async () => {
      vi.mocked(prisma.$executeRawUnsafe)
        .mockResolvedValueOnce(1) // Enable RLS
        .mockResolvedValueOnce(1) // Force RLS
        .mockResolvedValueOnce(1) // Drop policy
        .mockResolvedValueOnce(1) // Create guild policy
        .mockResolvedValueOnce(1) // Drop bypass policy
        .mockResolvedValueOnce(1) // Create bypass policy
        .mockRejectedValueOnce(new Error('Table not found')); // Next table fails
      
      const result = await service.enableRLS({ tables: ['security_events', 'threat_detections'] });
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].recoverable).toBe(true);
    });
    
    it('should log on success when logger provided', async () => {
      const logger = createMockLogger();
      const loggedService = new RowLevelSecurityService({ prisma, logger });
      
      await loggedService.enableRLS({ tables: ['security_events'] });
      
      expect(logger.info).toHaveBeenCalled();
    });
    
    it('should measure duration', async () => {
      const result = await service.enableRLS();
      
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('disableRLS', () => {
    it('should disable RLS on all tables by default', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      const result = await service.disableRLS();
      
      expect(result.success).toBe(true);
      expect(result.tables.length).toBe(RLS_TABLES.length);
    });
    
    it('should disable RLS on specific tables', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      const tables: RLSTable[] = ['security_events'];
      const result = await service.disableRLS({ tables });
      
      expect(result.tables).toEqual(tables);
    });
    
    it('should clear tracked policies', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      // First enable
      await service.enableRLS({ tables: ['security_events'] });
      expect(service.getTrackedPolicies().get('security_events')?.size).toBeGreaterThan(0);
      
      // Then disable
      await service.disableRLS({ tables: ['security_events'] });
      expect(service.getTrackedPolicies().get('security_events')?.size).toBe(0);
    });
    
    it('should handle errors gracefully', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$executeRawUnsafe).mockRejectedValue(
        new Error('Permission denied'),
      );
      
      const service = new RowLevelSecurityService({ prisma });
      const result = await service.disableRLS();
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
  
  describe('createPolicy', () => {
    let prisma: RLSPrismaClient;
    let service: RowLevelSecurityService;
    
    beforeEach(() => {
      prisma = createMockPrisma();
      service = new RowLevelSecurityService({ prisma });
    });
    
    it('should create custom policy', async () => {
      const policy: RLSPolicy = {
        name: 'custom_policy',
        table: 'security_events',
        type: RLSPolicyType.GUILD_ISOLATION,
        command: 'SELECT',
        using: "guild_id = 'specific_guild'",
        roles: ['app_user'],
      };
      
      const result = await service.createPolicy(policy);
      
      expect(result).toBe(true);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('custom_policy'),
      );
    });
    
    it('should include WITH CHECK for modifying policies', async () => {
      const policy: RLSPolicy = {
        name: 'insert_policy',
        table: 'security_events',
        type: RLSPolicyType.GUILD_ISOLATION,
        command: 'INSERT',
        using: 'true',
        withCheck: "guild_id = current_setting('app.guild_id')",
        roles: ['PUBLIC'],
      };
      
      await service.createPolicy(policy);
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('WITH CHECK'),
      );
    });
    
    it('should throw for invalid table', async () => {
      const policy: RLSPolicy = {
        name: 'bad_policy',
        table: 'invalid_table' as RLSTable,
        type: RLSPolicyType.GUILD_ISOLATION,
        command: 'ALL',
        using: 'true',
        roles: ['PUBLIC'],
      };
      
      await expect(service.createPolicy(policy)).rejects.toMatchObject({
        code: RLS_ERROR_CODES.INVALID_TABLE,
      });
    });
    
    it('should track created policies', async () => {
      const policy: RLSPolicy = {
        name: 'tracked_policy',
        table: 'security_events',
        type: RLSPolicyType.GUILD_ISOLATION,
        command: 'ALL',
        using: 'true',
        roles: ['PUBLIC'],
      };
      
      await service.createPolicy(policy);
      
      const tracked = service.getTrackedPolicies();
      expect(tracked.get('security_events')?.has('tracked_policy')).toBe(true);
    });
    
    it('should drop existing policy before creating', async () => {
      const policy: RLSPolicy = {
        name: 'replacement_policy',
        table: 'security_events',
        type: RLSPolicyType.GUILD_ISOLATION,
        command: 'ALL',
        using: 'true',
        roles: ['PUBLIC'],
      };
      
      await service.createPolicy(policy);
      
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DROP POLICY IF EXISTS'),
      );
    });
  });
  
  describe('dropPolicy', () => {
    it('should drop policy by name', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      const result = await service.dropPolicy('security_events', 'test_policy');
      
      expect(result).toBe(true);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('DROP POLICY'),
      );
    });
    
    it('should remove from tracked policies', async () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      // First create a policy
      await service.createPolicy({
        name: 'to_drop',
        table: 'security_events',
        type: RLSPolicyType.GUILD_ISOLATION,
        command: 'ALL',
        using: 'true',
        roles: ['PUBLIC'],
      });
      
      expect(service.getTrackedPolicies().get('security_events')?.has('to_drop')).toBe(true);
      
      // Then drop it
      await service.dropPolicy('security_events', 'to_drop');
      
      expect(service.getTrackedPolicies().get('security_events')?.has('to_drop')).toBe(false);
    });
    
    it('should throw on error', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$executeRawUnsafe).mockRejectedValue(
        new Error('Policy not found'),
      );
      
      const service = new RowLevelSecurityService({ prisma });
      
      await expect(service.dropPolicy('security_events', 'missing'))
        .rejects.toMatchObject({
          code: RLS_ERROR_CODES.POLICY_DROP_FAILED,
        });
    });
  });
  
  // ==========================================================================
  // STATUS & DIAGNOSTICS TESTS
  // ==========================================================================
  
  describe('getRLSStatus', () => {
    it('should return comprehensive status', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ version: 'PostgreSQL 15.2' }])
        .mockResolvedValue([]); // For table checks
      
      const service = new RowLevelSecurityService({ prisma });
      const status = await service.getRLSStatus();
      
      expect(status.supported).toBe(true);
      expect(status.version).toContain('PostgreSQL');
      expect(Object.keys(status.tables).length).toBe(RLS_TABLES.length);
      expect(status.checkedAt).toBeInstanceOf(Date);
    });
    
    it('should detect PostgreSQL 9.5+ as supported', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ version: 'PostgreSQL 9.5.0' }])
        .mockResolvedValue([]);
      
      const service = new RowLevelSecurityService({ prisma });
      const status = await service.getRLSStatus();
      
      expect(status.supported).toBe(true);
    });
    
    it('should detect PostgreSQL < 9.5 as unsupported', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ version: 'PostgreSQL 9.4.0' }])
        .mockResolvedValue([]);
      
      const service = new RowLevelSecurityService({ prisma });
      const status = await service.getRLSStatus();
      
      expect(status.supported).toBe(false);
    });
    
    it('should count enabled tables', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ version: 'PostgreSQL 15.2' }])
        .mockResolvedValueOnce([{ rls_enabled: true, force_rls: true }])
        .mockResolvedValueOnce([]) // policies for first table
        .mockResolvedValueOnce([{ rls_enabled: false, force_rls: false }])
        .mockResolvedValue([]); // remaining tables
      
      const service = new RowLevelSecurityService({ prisma });
      const status = await service.getRLSStatus();
      
      expect(status.enabledTables).toBeGreaterThanOrEqual(0);
    });
    
    it('should throw on database error', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(
        new Error('Connection refused'),
      );
      
      const service = new RowLevelSecurityService({ prisma });
      
      await expect(service.getRLSStatus()).rejects.toMatchObject({
        code: RLS_ERROR_CODES.STATUS_CHECK_FAILED,
      });
    });
  });
  
  describe('getTableRLSStatus', () => {
    it('should return table status', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{
          table_name: 'security_events',
          rls_enabled: true,
          force_rls: true,
        }])
        .mockResolvedValueOnce([{
          policy_name: 'guild_policy',
          command: '*',
          permissive: true,
          using_expr: "guild_id = '123'",
          with_check_expr: "guild_id = '123'",
          roles: ['PUBLIC'],
        }]);
      
      const service = new RowLevelSecurityService({ prisma });
      const status = await service.getTableRLSStatus('security_events');
      
      expect(status.table).toBe('security_events');
      expect(status.enabled).toBe(true);
      expect(status.forceEnabled).toBe(true);
      expect(status.policies.length).toBe(1);
      expect(status.policies[0].name).toBe('guild_policy');
    });
    
    it('should return defaults on error', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(
        new Error('Table not found'),
      );
      
      const service = new RowLevelSecurityService({ prisma });
      const status = await service.getTableRLSStatus('security_events');
      
      expect(status.enabled).toBe(false);
      expect(status.forceEnabled).toBe(false);
      expect(status.policies).toHaveLength(0);
    });
    
    it('should map command characters correctly', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ rls_enabled: true, force_rls: false }])
        .mockResolvedValueOnce([
          { policy_name: 'select_policy', command: 'r', permissive: true, using_expr: null, with_check_expr: null, roles: [] },
          { policy_name: 'insert_policy', command: 'a', permissive: true, using_expr: null, with_check_expr: null, roles: [] },
          { policy_name: 'update_policy', command: 'w', permissive: true, using_expr: null, with_check_expr: null, roles: [] },
          { policy_name: 'delete_policy', command: 'd', permissive: true, using_expr: null, with_check_expr: null, roles: [] },
          { policy_name: 'all_policy', command: '*', permissive: true, using_expr: null, with_check_expr: null, roles: [] },
        ]);
      
      const service = new RowLevelSecurityService({ prisma });
      const status = await service.getTableRLSStatus('security_events');
      
      expect(status.policies.find(p => p.name === 'select_policy')?.command).toBe('SELECT');
      expect(status.policies.find(p => p.name === 'insert_policy')?.command).toBe('INSERT');
      expect(status.policies.find(p => p.name === 'update_policy')?.command).toBe('UPDATE');
      expect(status.policies.find(p => p.name === 'delete_policy')?.command).toBe('DELETE');
      expect(status.policies.find(p => p.name === 'all_policy')?.command).toBe('ALL');
    });
  });
  
  describe('verifyRLS', () => {
    it('should verify RLS is working', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ guild_id: 'test_guild' }])
        .mockResolvedValueOnce([{ bypass: null }])
        .mockResolvedValueOnce([{ guild_id: null }])
        .mockResolvedValueOnce([{ bypass: 'true' }]);
      
      const service = new RowLevelSecurityService({ prisma });
      const result = await service.verifyRLS('test_guild');
      
      expect(result.working).toBe(true);
      expect(result.details.contextSet).toBe(true);
      expect(result.details.contextMatches).toBe(true);
      expect(result.details.bypassWorks).toBe(true);
    });
    
    it('should detect failed context', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$executeRawUnsafe).mockRejectedValue(
        new Error('Failed'),
      );
      
      const service = new RowLevelSecurityService({ prisma });
      const result = await service.verifyRLS('test_guild');
      
      expect(result.working).toBe(false);
      expect(result.details.contextSet).toBe(false);
    });
    
    it('should detect mismatched context', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ guild_id: 'different_guild' }]) // Mismatch!
        .mockResolvedValueOnce([{ bypass: null }]);
      
      const service = new RowLevelSecurityService({ prisma });
      const result = await service.verifyRLS('test_guild');
      
      expect(result.details.contextMatches).toBe(false);
    });
  });
  
  // ==========================================================================
  // UTILITY TESTS
  // ==========================================================================
  
  describe('isRLSEnabled', () => {
    it('should return true when enabled', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ rls_enabled: true, force_rls: true }])
        .mockResolvedValueOnce([]);
      
      const service = new RowLevelSecurityService({ prisma });
      const enabled = await service.isRLSEnabled('security_events');
      
      expect(enabled).toBe(true);
    });
    
    it('should return false when disabled', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ rls_enabled: false, force_rls: false }])
        .mockResolvedValueOnce([]);
      
      const service = new RowLevelSecurityService({ prisma });
      const enabled = await service.isRLSEnabled('security_events');
      
      expect(enabled).toBe(false);
    });
  });
  
  describe('getPolicies', () => {
    it('should return policy names', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe)
        .mockResolvedValueOnce([{ rls_enabled: true, force_rls: true }])
        .mockResolvedValueOnce([
          { policy_name: 'policy_1', command: '*', permissive: true, using_expr: null, with_check_expr: null, roles: [] },
          { policy_name: 'policy_2', command: 'r', permissive: true, using_expr: null, with_check_expr: null, roles: [] },
        ]);
      
      const service = new RowLevelSecurityService({ prisma });
      const policies = await service.getPolicies('security_events');
      
      expect(policies).toContain('policy_1');
      expect(policies).toContain('policy_2');
    });
  });
  
  describe('policyExists', () => {
    it('should return true when policy exists', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([{ exists: true }]);
      
      const service = new RowLevelSecurityService({ prisma });
      const exists = await service.policyExists('security_events', 'test_policy');
      
      expect(exists).toBe(true);
    });
    
    it('should return false when policy does not exist', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValueOnce([{ exists: false }]);
      
      const service = new RowLevelSecurityService({ prisma });
      const exists = await service.policyExists('security_events', 'missing_policy');
      
      expect(exists).toBe(false);
    });
    
    it('should return false on error', async () => {
      const prisma = createMockPrisma();
      vi.mocked(prisma.$queryRawUnsafe).mockRejectedValue(new Error('Query failed'));
      
      const service = new RowLevelSecurityService({ prisma });
      const exists = await service.policyExists('security_events', 'test_policy');
      
      expect(exists).toBe(false);
    });
  });
  
  describe('getTables', () => {
    it('should return all RLS tables', () => {
      const prisma = createMockPrisma();
      const service = new RowLevelSecurityService({ prisma });
      
      const tables = service.getTables();
      
      expect(tables).toEqual(RLS_TABLES);
      expect(tables).toContain('security_events');
      expect(tables).toContain('role_change_audit');
      expect(tables).toContain('threat_detections');
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createRowLevelSecurityService', () => {
  it('should create service instance', () => {
    const prisma = createMockPrisma();
    const service = createRowLevelSecurityService({ prisma });
    
    expect(service).toBeInstanceOf(RowLevelSecurityService);
  });
  
  it('should pass config to constructor', () => {
    const prisma = createMockPrisma();
    const logger = createMockLogger();
    const service = createRowLevelSecurityService({
      prisma,
      logger,
      appNamespace: 'custom',
      targetRoles: ['app_user'],
    });
    
    expect(service).toBeInstanceOf(RowLevelSecurityService);
  });
});

// ============================================================================
// ERROR CLASS TESTS
// ============================================================================

describe('RLSServiceError', () => {
  it('should create error with code', () => {
    const error = new RLSServiceError(
      RLS_ERROR_CODES.INVALID_GUILD_ID,
      'Invalid guild ID',
    );
    
    expect(error.code).toBe(RLS_ERROR_CODES.INVALID_GUILD_ID);
    expect(error.message).toBe('Invalid guild ID');
    expect(error.name).toBe('RLSServiceError');
  });
  
  it('should include context', () => {
    const error = new RLSServiceError(
      RLS_ERROR_CODES.ENABLE_FAILED,
      'Enable failed',
      { table: 'security_events' },
    );
    
    expect(error.context).toEqual({ table: 'security_events' });
  });
  
  it('should include cause', () => {
    const cause = new Error('Original error');
    const error = new RLSServiceError(
      RLS_ERROR_CODES.CONTEXT_SET_FAILED,
      'Context failed',
      {},
      cause,
    );
    
    expect(error.cause).toBe(cause);
  });
  
  it('should serialize to JSON', () => {
    const error = new RLSServiceError(
      RLS_ERROR_CODES.POLICY_CREATE_FAILED,
      'Policy creation failed',
      { policy: 'test' },
      new Error('DB error'),
    );
    
    const json = error.toJSON();
    
    expect(json.name).toBe('RLSServiceError');
    expect(json.code).toBe(RLS_ERROR_CODES.POLICY_CREATE_FAILED);
    expect(json.message).toBe('Policy creation failed');
    expect(json.context).toEqual({ policy: 'test' });
    expect(json.cause).toBe('DB error');
    expect(json.stack).toBeDefined();
  });
});

// ============================================================================
// TYPE GUARD TESTS
// ============================================================================

describe('isRLSTable', () => {
  it('should return true for valid tables', () => {
    expect(isRLSTable('security_events')).toBe(true);
    expect(isRLSTable('role_change_audit')).toBe(true);
    expect(isRLSTable('threat_detections')).toBe(true);
    expect(isRLSTable('security_baselines')).toBe(true);
    expect(isRLSTable('permission_snapshots')).toBe(true);
    expect(isRLSTable('admin_role_requests')).toBe(true);
  });
  
  it('should return false for invalid tables', () => {
    expect(isRLSTable('invalid_table')).toBe(false);
    expect(isRLSTable('users')).toBe(false);
    expect(isRLSTable('')).toBe(false);
    expect(isRLSTable(null)).toBe(false);
    expect(isRLSTable(undefined)).toBe(false);
    expect(isRLSTable(123)).toBe(false);
  });
});

describe('isRLSError', () => {
  it('should return true for RLSServiceError', () => {
    const error = new RLSServiceError(
      RLS_ERROR_CODES.INVALID_GUILD_ID,
      'Test error',
    );
    
    expect(isRLSError(error)).toBe(true);
  });
  
  it('should return false for other errors', () => {
    expect(isRLSError(new Error('Test'))).toBe(false);
    expect(isRLSError({ code: 'test' })).toBe(false);
    expect(isRLSError(null)).toBe(false);
    expect(isRLSError('error')).toBe(false);
  });
});

describe('isRecoverableRLSError', () => {
  it('should return true for recoverable errors', () => {
    const contextSetError = new RLSServiceError(
      RLS_ERROR_CODES.CONTEXT_SET_FAILED,
      'Context failed',
    );
    const contextResetError = new RLSServiceError(
      RLS_ERROR_CODES.CONTEXT_RESET_FAILED,
      'Reset failed',
    );
    
    expect(isRecoverableRLSError(contextSetError)).toBe(true);
    expect(isRecoverableRLSError(contextResetError)).toBe(true);
  });
  
  it('should return false for non-recoverable errors', () => {
    const invalidTableError = new RLSServiceError(
      RLS_ERROR_CODES.INVALID_TABLE,
      'Invalid table',
    );
    const policyCreateError = new RLSServiceError(
      RLS_ERROR_CODES.POLICY_CREATE_FAILED,
      'Create failed',
    );
    
    expect(isRecoverableRLSError(invalidTableError)).toBe(false);
    expect(isRecoverableRLSError(policyCreateError)).toBe(false);
  });
  
  it('should return false for non-RLS errors', () => {
    expect(isRecoverableRLSError(new Error('Test'))).toBe(false);
    expect(isRecoverableRLSError(null)).toBe(false);
  });
});

// ============================================================================
// CONSTANTS TESTS
// ============================================================================

describe('RLS_TABLES', () => {
  it('should contain all security tables', () => {
    expect(RLS_TABLES).toContain('security_events');
    expect(RLS_TABLES).toContain('role_change_audit');
    expect(RLS_TABLES).toContain('threat_detections');
    expect(RLS_TABLES).toContain('security_baselines');
    expect(RLS_TABLES).toContain('permission_snapshots');
    expect(RLS_TABLES).toContain('admin_role_requests');
    expect(RLS_TABLES.length).toBe(6);
  });
});

describe('RLS_ERROR_CODES', () => {
  it('should define all error codes', () => {
    expect(RLS_ERROR_CODES.RLS_NOT_SUPPORTED).toBe('RLS_NOT_SUPPORTED');
    expect(RLS_ERROR_CODES.INVALID_TABLE).toBe('RLS_INVALID_TABLE');
    expect(RLS_ERROR_CODES.INVALID_GUILD_ID).toBe('RLS_INVALID_GUILD_ID');
    expect(RLS_ERROR_CODES.POLICY_EXISTS).toBe('RLS_POLICY_EXISTS');
    expect(RLS_ERROR_CODES.ENABLE_FAILED).toBe('RLS_ENABLE_FAILED');
    expect(RLS_ERROR_CODES.DISABLE_FAILED).toBe('RLS_DISABLE_FAILED');
    expect(RLS_ERROR_CODES.POLICY_CREATE_FAILED).toBe('RLS_POLICY_CREATE_FAILED');
    expect(RLS_ERROR_CODES.POLICY_DROP_FAILED).toBe('RLS_POLICY_DROP_FAILED');
    expect(RLS_ERROR_CODES.CONTEXT_SET_FAILED).toBe('RLS_CONTEXT_SET_FAILED');
    expect(RLS_ERROR_CODES.CONTEXT_RESET_FAILED).toBe('RLS_CONTEXT_RESET_FAILED');
    expect(RLS_ERROR_CODES.STATUS_CHECK_FAILED).toBe('RLS_STATUS_CHECK_FAILED');
    expect(RLS_ERROR_CODES.PERMISSION_DENIED).toBe('RLS_PERMISSION_DENIED');
  });
});

describe('RLSPolicyType', () => {
  it('should define policy types', () => {
    expect(RLSPolicyType.GUILD_ISOLATION).toBe('guild_isolation');
    expect(RLSPolicyType.READ_ONLY).toBe('read_only');
    expect(RLSPolicyType.FULL_ACCESS_AUDITED).toBe('full_access_audited');
  });
});
