/**
 * BaselineService Unit Tests
 * ==========================
 *
 * Comprehensive test coverage for the BaselineService.
 * Tests baseline CRUD, health checks, freshness monitoring, and bulk operations.
 *
 * @research T9 (Security Regression Suite)
 * @see src/bot/security/services/baseline-service.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import {
  BaselineService,
  type BaselineFreshnessConfig,
  DEFAULT_FRESHNESS_CONFIG,
} from '../../../src/bot/security/services/baseline-service.js';
import {
  type SecurityBaselineInput,
} from '../../../src/bot/security/types/database-models.js';

// ============================================================================
// MOCKS
// ============================================================================

const mockPrismaClient = {
  securityBaseline: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock('../../../src/generated/prisma/client.js', () => ({
  PrismaClient: vi.fn(() => mockPrismaClient),
}));

// ============================================================================
// FIXTURES
// ============================================================================

function createMockPrismaBaseline(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1n,
    guildId: '123456789',
    guildName: 'Test Server',
    averageChangesPerHour: 2.5,
    averageChangesPerDay: 45.3,
    peakActivityHours: [14, 15, 20, 21],
    rapidChangeThreshold: 5,
    maxChangesPerMember: 10,
    expectedOrigins: ['member-join', 'sweep', 'admin-manual'],
    confidenceLevel: 0.85,
    dataPointCount: 350,
    computedAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockBaselineInput(overrides: Partial<SecurityBaselineInput> = {}): SecurityBaselineInput {
  return {
    guildId: '123456789',
    guildName: 'Test Server',
    averageChangesPerHour: 2.5,
    averageChangesPerDay: 45.3,
    peakActivityHours: [14, 15, 20, 21],
    rapidChangeThreshold: 5,
    maxChangesPerMember: 10,
    expectedOrigins: ['member-join', 'sweep', 'admin-manual'],
    confidenceLevel: 0.85,
    dataPointCount: 350,
    computedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('BaselineService', () => {
  let service: BaselineService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BaselineService(mockPrismaClient as unknown as PrismaClient);
  });

  // ==========================================================================
  // CONSTRUCTOR & CONFIG
  // ==========================================================================

  describe('constructor', () => {
    it('should use default freshness config when not provided', () => {
      const service = new BaselineService(mockPrismaClient as unknown as PrismaClient);
      // Verify it's created without error
      expect(service).toBeDefined();
    });

    it('should accept custom freshness config', () => {
      const customConfig: BaselineFreshnessConfig = {
        maxAgeHours: 48,
        minConfidence: 0.5,
        minDataPoints: 100,
      };
      const service = new BaselineService(mockPrismaClient as unknown as PrismaClient, customConfig);
      expect(service).toBeDefined();
    });
  });

  describe('DEFAULT_FRESHNESS_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_FRESHNESS_CONFIG.maxAgeHours).toBe(24);
      expect(DEFAULT_FRESHNESS_CONFIG.minConfidence).toBe(0.7);
      expect(DEFAULT_FRESHNESS_CONFIG.minDataPoints).toBe(200);
    });
  });

  // ==========================================================================
  // CORE CRUD OPERATIONS
  // ==========================================================================

  describe('getBaseline', () => {
    it('should return baseline for guild', async () => {
      const prismaBaseline = createMockPrismaBaseline();
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(prismaBaseline);

      const result = await service.getBaseline('123456789');

      expect(mockPrismaClient.securityBaseline.findUnique).toHaveBeenCalledWith({
        where: { guildId: '123456789' },
      });
      expect(result).not.toBeNull();
      expect(result?.guildId).toBe('123456789');
      expect(result?.confidenceLevel).toBe(0.85);
    });

    it('should return null for non-existent baseline', async () => {
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(null);

      const result = await service.getBaseline('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('upsertBaseline', () => {
    it('should create new baseline via upsert', async () => {
      const input = createMockBaselineInput();
      const prismaBaseline = createMockPrismaBaseline();
      mockPrismaClient.securityBaseline.upsert.mockResolvedValue(prismaBaseline);

      const result = await service.upsertBaseline(input);

      expect(mockPrismaClient.securityBaseline.upsert).toHaveBeenCalledWith({
        where: { guildId: input.guildId },
        create: expect.objectContaining({
          guildId: input.guildId,
          guildName: input.guildName,
          averageChangesPerHour: input.averageChangesPerHour,
          confidenceLevel: input.confidenceLevel,
        }),
        update: expect.objectContaining({
          guildName: input.guildName,
          averageChangesPerHour: input.averageChangesPerHour,
          confidenceLevel: input.confidenceLevel,
        }),
      });
      expect(result.guildId).toBe('123456789');
    });

    it('should update existing baseline via upsert', async () => {
      const input = createMockBaselineInput({ confidenceLevel: 0.95 });
      const prismaBaseline = createMockPrismaBaseline({ confidenceLevel: 0.95 });
      mockPrismaClient.securityBaseline.upsert.mockResolvedValue(prismaBaseline);

      const result = await service.upsertBaseline(input);

      expect(result.confidenceLevel).toBe(0.95);
    });
  });

  describe('deleteBaseline', () => {
    it('should delete baseline and return deleted record', async () => {
      const prismaBaseline = createMockPrismaBaseline();
      mockPrismaClient.securityBaseline.delete.mockResolvedValue(prismaBaseline);

      const result = await service.deleteBaseline('123456789');

      expect(mockPrismaClient.securityBaseline.delete).toHaveBeenCalledWith({
        where: { guildId: '123456789' },
      });
      expect(result.guildId).toBe('123456789');
    });
  });

  describe('getAllBaselines', () => {
    it('should return all baselines with default options', async () => {
      const prismaBaselines = [
        createMockPrismaBaseline({ guildId: '111' }),
        createMockPrismaBaseline({ guildId: '222' }),
      ];
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue(prismaBaselines);

      const result = await service.getAllBaselines();

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: {},
        take: 100,
        skip: 0,
        orderBy: { computedAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should filter by minimum confidence', async () => {
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue([]);

      await service.getAllBaselines({ minConfidence: 0.8 });

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: { confidenceLevel: { gte: 0.8 } },
        take: 100,
        skip: 0,
        orderBy: { computedAt: 'desc' },
      });
    });

    it('should filter stale baselines', async () => {
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue([]);

      await service.getAllBaselines({ staleOnly: true, maxAgeHours: 12 });

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: {
          computedAt: { lt: expect.any(Date) },
        },
        take: 100,
        skip: 0,
        orderBy: { computedAt: 'desc' },
      });
    });

    it('should handle pagination', async () => {
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue([]);

      await service.getAllBaselines({ limit: 50, offset: 100 });

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: {},
        take: 50,
        skip: 100,
        orderBy: { computedAt: 'desc' },
      });
    });

    it('should cap limit at 1000', async () => {
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue([]);

      await service.getAllBaselines({ limit: 5000 });

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: {},
        take: 1000,
        skip: 0,
        orderBy: { computedAt: 'desc' },
      });
    });
  });

  describe('countBaselines', () => {
    it('should count baselines with filters', async () => {
      mockPrismaClient.securityBaseline.count.mockResolvedValue(42);

      const result = await service.countBaselines({ minConfidence: 0.7 });

      expect(mockPrismaClient.securityBaseline.count).toHaveBeenCalledWith({
        where: { confidenceLevel: { gte: 0.7 } },
      });
      expect(result).toBe(42);
    });

    it('should count stale baselines', async () => {
      mockPrismaClient.securityBaseline.count.mockResolvedValue(5);

      const result = await service.countBaselines({ staleOnly: true });

      expect(mockPrismaClient.securityBaseline.count).toHaveBeenCalledWith({
        where: {
          computedAt: { lt: expect.any(Date) },
        },
      });
      expect(result).toBe(5);
    });
  });

  // ==========================================================================
  // HEALTH & FRESHNESS
  // ==========================================================================

  describe('checkBaselineHealth', () => {
    it('should return not exists for missing baseline', async () => {
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(null);

      const result = await service.checkBaselineHealth('123456789');

      expect(result).toEqual({
        guildId: '123456789',
        exists: false,
        isFresh: false,
        hasSufficientConfidence: false,
        isUsable: false,
        ageHours: null,
        confidenceLevel: null,
        reason: 'Baseline does not exist',
      });
    });

    it('should return usable for fresh high-confidence baseline', async () => {
      const recentBaseline = createMockPrismaBaseline({
        computedAt: new Date(), // Just now
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(recentBaseline);

      const result = await service.checkBaselineHealth('123456789');

      expect(result.exists).toBe(true);
      expect(result.isFresh).toBe(true);
      expect(result.hasSufficientConfidence).toBe(true);
      expect(result.isUsable).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should detect stale baseline', async () => {
      const staleBaseline = createMockPrismaBaseline({
        computedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(staleBaseline);

      const result = await service.checkBaselineHealth('123456789');

      expect(result.exists).toBe(true);
      expect(result.isFresh).toBe(false);
      expect(result.hasSufficientConfidence).toBe(true);
      expect(result.isUsable).toBe(false);
      expect(result.reason).toContain('Stale');
    });

    it('should detect low confidence baseline', async () => {
      const lowConfidenceBaseline = createMockPrismaBaseline({
        computedAt: new Date(), // Fresh
        confidenceLevel: 0.5, // Below threshold (0.7)
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(lowConfidenceBaseline);

      const result = await service.checkBaselineHealth('123456789');

      expect(result.exists).toBe(true);
      expect(result.isFresh).toBe(true);
      expect(result.hasSufficientConfidence).toBe(false);
      expect(result.isUsable).toBe(false);
      expect(result.reason).toContain('Low confidence');
    });

    it('should detect both stale and low confidence', async () => {
      const badBaseline = createMockPrismaBaseline({
        computedAt: new Date(Date.now() - 72 * 60 * 60 * 1000), // 72 hours ago
        confidenceLevel: 0.3,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(badBaseline);

      const result = await service.checkBaselineHealth('123456789');

      expect(result.exists).toBe(true);
      expect(result.isFresh).toBe(false);
      expect(result.hasSufficientConfidence).toBe(false);
      expect(result.isUsable).toBe(false);
      expect(result.reason).toContain('Stale');
      expect(result.reason).toContain('low confidence');
    });
  });

  describe('needsRefresh', () => {
    it('should return true for missing baseline', async () => {
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(null);

      const result = await service.needsRefresh('123456789');

      expect(result).toBe(true);
    });

    it('should return true for stale baseline', async () => {
      const staleBaseline = createMockPrismaBaseline({
        computedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(staleBaseline);

      const result = await service.needsRefresh('123456789');

      expect(result).toBe(true);
    });

    it('should return true for low confidence baseline', async () => {
      const lowConfidenceBaseline = createMockPrismaBaseline({
        computedAt: new Date(),
        confidenceLevel: 0.5,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(lowConfidenceBaseline);

      const result = await service.needsRefresh('123456789');

      expect(result).toBe(true);
    });

    it('should return false for healthy baseline', async () => {
      const healthyBaseline = createMockPrismaBaseline({
        computedAt: new Date(),
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(healthyBaseline);

      const result = await service.needsRefresh('123456789');

      expect(result).toBe(false);
    });
  });

  describe('getUsableBaseline', () => {
    it('should return baseline if usable', async () => {
      const healthyBaseline = createMockPrismaBaseline({
        computedAt: new Date(),
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(healthyBaseline);

      const result = await service.getUsableBaseline('123456789');

      expect(result).not.toBeNull();
      expect(result?.guildId).toBe('123456789');
    });

    it('should return null if not usable', async () => {
      const staleBaseline = createMockPrismaBaseline({
        computedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(staleBaseline);

      const result = await service.getUsableBaseline('123456789');

      expect(result).toBeNull();
    });

    it('should return null for missing baseline', async () => {
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(null);

      const result = await service.getUsableBaseline('123456789');

      expect(result).toBeNull();
    });
  });

  describe('getStaleBaselines', () => {
    it('should return stale baselines using default config', async () => {
      const staleBaselines = [
        createMockPrismaBaseline({ guildId: '111', computedAt: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
      ];
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue(staleBaselines);

      const result = await service.getStaleBaselines();

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: {
          computedAt: { lt: expect.any(Date) },
        },
        take: 100,
        skip: 0,
        orderBy: { computedAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should support custom max age', async () => {
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue([]);

      await service.getStaleBaselines(12);

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalled();
    });
  });

  describe('getLowConfidenceBaselines', () => {
    it('should return low confidence baselines', async () => {
      const lowConfidenceBaselines = [
        createMockPrismaBaseline({ guildId: '111', confidenceLevel: 0.3 }),
        createMockPrismaBaseline({ guildId: '222', confidenceLevel: 0.5 }),
      ];
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue(lowConfidenceBaselines);

      const result = await service.getLowConfidenceBaselines();

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: {
          confidenceLevel: { lt: 0.7 }, // Default threshold
        },
        orderBy: { confidenceLevel: 'asc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should support custom confidence threshold', async () => {
      mockPrismaClient.securityBaseline.findMany.mockResolvedValue([]);

      await service.getLowConfidenceBaselines(0.5);

      expect(mockPrismaClient.securityBaseline.findMany).toHaveBeenCalledWith({
        where: {
          confidenceLevel: { lt: 0.5 },
        },
        orderBy: { confidenceLevel: 'asc' },
      });
    });
  });

  // ==========================================================================
  // BULK OPERATIONS
  // ==========================================================================

  describe('bulkHealthCheck', () => {
    it('should check health for multiple guilds', async () => {
      // Set up mock to return different baselines for different guilds
      mockPrismaClient.securityBaseline.findUnique
        .mockResolvedValueOnce(createMockPrismaBaseline({ guildId: '111', computedAt: new Date(), confidenceLevel: 0.9 })) // usable
        .mockResolvedValueOnce(createMockPrismaBaseline({ guildId: '222', computedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), confidenceLevel: 0.9 })) // stale
        .mockResolvedValueOnce(createMockPrismaBaseline({ guildId: '333', computedAt: new Date(), confidenceLevel: 0.3 })) // low confidence
        .mockResolvedValueOnce(null); // missing

      const result = await service.bulkHealthCheck(['111', '222', '333', '444']);

      expect(result.total).toBe(4);
      expect(result.usable).toBe(1);
      expect(result.stale).toBe(1);
      expect(result.lowConfidence).toBe(1);
      expect(result.missing).toBe(1);
      expect(result.details).toHaveLength(4);
    });

    it('should return empty result for empty input', async () => {
      const result = await service.bulkHealthCheck([]);

      expect(result.total).toBe(0);
      expect(result.usable).toBe(0);
      expect(result.stale).toBe(0);
      expect(result.lowConfidence).toBe(0);
      expect(result.missing).toBe(0);
      expect(result.details).toHaveLength(0);
    });
  });

  describe('getGuildsNeedingRefresh', () => {
    it('should return guilds that need baseline refresh', async () => {
      mockPrismaClient.securityBaseline.findUnique
        .mockResolvedValueOnce(createMockPrismaBaseline({ guildId: '111', computedAt: new Date(), confidenceLevel: 0.9 })) // healthy - no refresh
        .mockResolvedValueOnce(null) // missing - needs refresh
        .mockResolvedValueOnce(createMockPrismaBaseline({ guildId: '333', computedAt: new Date(Date.now() - 48 * 60 * 60 * 1000), confidenceLevel: 0.9 })); // stale - needs refresh

      const result = await service.getGuildsNeedingRefresh(['111', '222', '333']);

      expect(result).toEqual(['222', '333']);
    });

    it('should return all guilds when all need refresh', async () => {
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(null);

      const result = await service.getGuildsNeedingRefresh(['111', '222', '333']);

      expect(result).toEqual(['111', '222', '333']);
    });

    it('should return empty array when all baselines are healthy', async () => {
      const healthyBaseline = createMockPrismaBaseline({
        computedAt: new Date(),
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(healthyBaseline);

      const result = await service.getGuildsNeedingRefresh(['111', '222', '333']);

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // TYPE MAPPING
  // ==========================================================================

  describe('type mapping', () => {
    it('should correctly map Prisma result to SecurityBaseline', async () => {
      const prismaBaseline = createMockPrismaBaseline({
        id: 42n,
        peakActivityHours: [9, 10, 14, 15],
        expectedOrigins: ['member-join', 'sweep'],
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(prismaBaseline);

      const result = await service.getBaseline('123456789');

      expect(result).not.toBeNull();
      expect(result?.id).toBe(42n);
      expect(result?.peakActivityHours).toEqual([9, 10, 14, 15]);
      expect(result?.expectedOrigins).toEqual(['member-join', 'sweep']);
    });
  });

  // ==========================================================================
  // CUSTOM CONFIG
  // ==========================================================================

  describe('custom freshness config', () => {
    it('should use custom max age for health checks', async () => {
      const customConfig: BaselineFreshnessConfig = {
        maxAgeHours: 12, // Stricter than default 24
        minConfidence: 0.7,
        minDataPoints: 200,
      };
      const customService = new BaselineService(
        mockPrismaClient as unknown as PrismaClient,
        customConfig
      );

      // A baseline 18 hours old would be fresh with default (24h) but stale with custom (12h)
      const eighteenHoursAgo = createMockPrismaBaseline({
        computedAt: new Date(Date.now() - 18 * 60 * 60 * 1000),
        confidenceLevel: 0.9,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(eighteenHoursAgo);

      const result = await customService.checkBaselineHealth('123456789');

      expect(result.isFresh).toBe(false); // Should be stale with 12h max
      expect(result.isUsable).toBe(false);
    });

    it('should use custom min confidence for health checks', async () => {
      const customConfig: BaselineFreshnessConfig = {
        maxAgeHours: 24,
        minConfidence: 0.9, // Stricter than default 0.7
        minDataPoints: 200,
      };
      const customService = new BaselineService(
        mockPrismaClient as unknown as PrismaClient,
        customConfig
      );

      // 0.8 confidence would pass default (0.7) but fail custom (0.9)
      const mediumConfidence = createMockPrismaBaseline({
        computedAt: new Date(),
        confidenceLevel: 0.8,
      });
      mockPrismaClient.securityBaseline.findUnique.mockResolvedValue(mediumConfidence);

      const result = await customService.checkBaselineHealth('123456789');

      expect(result.hasSufficientConfidence).toBe(false); // Should fail with 0.9 min
      expect(result.isUsable).toBe(false);
    });
  });
});
