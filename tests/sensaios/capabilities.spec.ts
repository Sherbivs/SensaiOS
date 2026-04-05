/**
 * Capability System Tests
 * 
 * Tests for Ring 0-3 security model capability checks.
 * 
 * @module tests/sensaios/capabilities.spec
 */

import { describe, it, expect, vi } from 'vitest';
import { checkCapability, assertCapability, listCapabilities } from '../../src/sensaios/capabilities/assert-capability.js';
import { SensaiError } from '../../src/sensaios/sensai-error.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { TenantScope } from '../../src/sensaios/tenant-scope.js';

// Mock Prisma client
const createMockPrisma = () => ({
  componentCapability: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
}) as unknown as PrismaClient;

// Test scope
const testScope: TenantScope = {
  tenant: 'test-guild-123',
  environment: 'test',
  service: 'test-service',
  component: 'test-component',
};

describe('Capability System', () => {
  describe('checkCapability', () => {
    it('should grant capability when valid grant exists', async () => {
      const prisma = createMockPrisma();
      const grantedAt = new Date(Date.now() - 1000);

      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue({
        id: '1',
        component: 'game.battles',
        type: 'db.write',
        scope: null,
        reason: 'Production deployment',
        expiresAt: null,
        revokedAt: null,
        createdAt: grantedAt,
        grantedBy: 'system',
        revokeReason: null,
      });

      const result = await checkCapability(
        prisma,
        'game.battles',
        'db.write',
        testScope
      );

      expect(result.granted).toBe(true);
      expect(result.grantedAt).toEqual(grantedAt);
      expect(result.grantedBy).toBe('system');
      expect(result.expiresAt).toBeUndefined();
    });

    it('should deny capability when no grant exists', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue(null);

      const result = await checkCapability(
        prisma,
        'game.battles',
        'db.write',
        testScope
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('does not have capability');
    });

    it('should deny capability when grant is expired', async () => {
      const prisma = createMockPrisma();

      // Prisma should not return expired grants (handled in where clause)
      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue(null);

      const result = await checkCapability(
        prisma,
        'game.battles',
        'db.write',
        testScope
      );

      expect(result.granted).toBe(false);
    });

    it('should deny capability when grant is revoked', async () => {
      const prisma = createMockPrisma();

      // Prisma should not return revoked grants (handled in where clause)
      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue(null);

      const result = await checkCapability(
        prisma,
        'game.battles',
        'db.write',
        testScope
      );

      expect(result.granted).toBe(false);
    });

    it('should deny capability when tenant scope does not match', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue({
        id: '1',
        component: 'game.battles',
        type: 'db.write',
        scope: { tenant: 'different-guild' }, // Different tenant
        reason: 'Guild-specific grant',
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
        grantedBy: 'system',
        revokeReason: null,
      });

      const result = await checkCapability(
        prisma,
        'game.battles',
        'db.write',
        testScope
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('not valid for tenant');
    });

    it('should grant capability when grant has no scope restrictions', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue({
        id: '1',
        component: 'game.battles',
        type: 'db.write',
        scope: null, // No scope restrictions
        reason: 'Global grant',
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
        grantedBy: 'system',
        revokeReason: null,
      });

      const result = await checkCapability(
        prisma,
        'game.battles',
        'db.write',
        testScope
      );

      expect(result.granted).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findFirst).mockRejectedValue(
        new Error('Database connection failed')
      );

      const result = await checkCapability(
        prisma,
        'game.battles',
        'db.write',
        testScope
      );

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Database error');
    });
  });

  describe('assertCapability', () => {
    it('should not throw when capability is granted', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue({
        id: '1',
        component: 'game.battles',
        type: 'db.write',
        scope: null,
        reason: 'Test grant',
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date(),
        grantedBy: 'system',
        revokeReason: null,
      });

      await expect(
        assertCapability(prisma, 'game.battles', 'db.write', testScope)
      ).resolves.not.toThrow();
    });

    it('should throw SensaiError when capability is denied', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findFirst).mockResolvedValue(null);

      await expect(
        assertCapability(prisma, 'game.battles', 'db.write', testScope)
      ).rejects.toThrow(SensaiError);

      try {
        await assertCapability(prisma, 'game.battles', 'db.write', testScope);
      } catch (error) {
        expect(error).toBeInstanceOf(SensaiError);
        if (error instanceof SensaiError) {
          expect(error.code).toBe(4001); // Validation error
          expect(error.message).toContain('Capability denied');
        }
      }
    });
  });

  describe('listCapabilities', () => {
    it('should return all active capabilities for component', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findMany).mockResolvedValue([
        {
          id: '1',
          component: 'game.battles',
          type: 'db.read',
          scope: null,
          reason: 'Read access',
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          grantedBy: 'system',
          revokeReason: null,
        },
        {
          id: '2',
          component: 'game.battles',
          type: 'db.write',
          scope: null,
          reason: 'Write access',
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          grantedBy: 'system',
          revokeReason: null,
        },
        {
          id: '3',
          component: 'game.battles',
          type: 'exports.append',
          scope: null,
          reason: 'Export access',
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          grantedBy: 'system',
          revokeReason: null,
        },
      ]);

      const capabilities = await listCapabilities(prisma, 'game.battles', testScope);

      expect(capabilities).toHaveLength(3);
      expect(capabilities).toContain('db.read');
      expect(capabilities).toContain('db.write');
      expect(capabilities).toContain('exports.append');
    });

    it('should filter capabilities by tenant scope', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findMany).mockResolvedValue([
        {
          id: '1',
          component: 'game.battles',
          type: 'db.read',
          scope: { tenant: 'test-guild-123' }, // Matches test scope
          reason: 'Tenant-specific',
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          grantedBy: 'system',
          revokeReason: null,
        },
        {
          id: '2',
          component: 'game.battles',
          type: 'db.write',
          scope: { tenant: 'other-guild' }, // Does not match
          reason: 'Other tenant',
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          grantedBy: 'system',
          revokeReason: null,
        },
      ]);

      const capabilities = await listCapabilities(prisma, 'game.battles', testScope);

      expect(capabilities).toHaveLength(1);
      expect(capabilities).toContain('db.read');
      expect(capabilities).not.toContain('db.write');
    });

    it('should return unique capability types', async () => {
      const prisma = createMockPrisma();

      // Duplicate capability types (should be deduplicated)
      vi.mocked(prisma.componentCapability.findMany).mockResolvedValue([
        {
          id: '1',
          component: 'game.battles',
          type: 'db.write',
          scope: null,
          reason: 'First grant',
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          grantedBy: 'system',
          revokeReason: null,
        },
        {
          id: '2',
          component: 'game.battles',
          type: 'db.write',
          scope: null,
          reason: 'Second grant',
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
          grantedBy: 'admin',
          revokeReason: null,
        },
      ]);

      const capabilities = await listCapabilities(prisma, 'game.battles', testScope);

      expect(capabilities).toHaveLength(1);
      expect(capabilities).toContain('db.write');
    });

    it('should handle database errors gracefully', async () => {
      const prisma = createMockPrisma();

      vi.mocked(prisma.componentCapability.findMany).mockRejectedValue(
        new Error('Database connection failed')
      );

      const capabilities = await listCapabilities(prisma, 'game.battles', testScope);

      expect(capabilities).toEqual([]);
    });
  });
});
