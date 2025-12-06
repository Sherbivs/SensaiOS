/**
 * ThreatDetectionService Unit Tests
 * ==================================
 *
 * Comprehensive test coverage for the ThreatDetectionService.
 * Tests threat recording, resolution, MITRE ATT&CK mapping, and statistics.
 *
 * @research T9 (Security Regression Suite)
 * @see src/bot/security/services/threat-detection-service.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '../../../src/generated/prisma/client.js';
import {
  ThreatDetectionService,
  type ThreatQueryOptions,
  type ThreatResolutionInput,
  type ThreatMitigationInput,
  MITRE_ATTACK_MAPPING,
} from '../../../src/bot/security/services/threat-detection-service.js';
import {
  ThreatType,
  SecuritySeverity,
  type ThreatDetection,
  type ThreatDetectionInput,
} from '../../../src/bot/security/types/database-models.js';

// ============================================================================
// MOCKS
// ============================================================================

const mockPrismaClient = {
  threatDetection: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  $transaction: vi.fn(),
};

vi.mock('../../../src/generated/prisma/client.js', () => ({
  PrismaClient: vi.fn(() => mockPrismaClient),
}));

// ============================================================================
// FIXTURES
// ============================================================================

// Unused but kept for reference - createMockThreat returns domain object
function _createMockThreat(overrides: Partial<ThreatDetection> = {}): ThreatDetection {
  return {
    id: 1n,
    threatType: ThreatType.RAPID_ROLE_CHANGES,
    severity: SecuritySeverity.HIGH,
    confidence: 0.85,
    guildId: '123456789',
    guildName: 'Test Server',
    description: 'Detected rapid role changes',
    evidence: {
      triggeringEntries: [{ id: 100n, changeType: 'addition', timestamp: new Date() }],
    },
    triggeringEntryId: 100n,
    mitreAttack: 'T1098.003',
    mitreTactic: 'Privilege Escalation',
    recommendedAction: 'DRIP_ALERT',
    autoMitigated: false,
    mitigationAction: null,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNotes: null,
    falsePositive: false,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockPrismaThreat(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1n,
    threatType: 'RAPID_ROLE_CHANGES',
    severity: 'HIGH',
    confidence: 0.85,
    guildId: '123456789',
    guildName: 'Test Server',
    description: 'Detected rapid role changes',
    evidence: {
      triggeringEntries: [{ id: '100', changeType: 'addition', timestamp: new Date().toISOString() }],
    },
    triggeringEntryId: 100n,
    mitreAttack: 'T1098.003',
    mitreTactic: 'Privilege Escalation',
    recommendedAction: 'DRIP_ALERT',
    autoMitigated: false,
    mitigationAction: null,
    resolved: false,
    resolvedBy: null,
    resolvedAt: null,
    resolutionNotes: null,
    falsePositive: false,
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockThreatInput(overrides: Partial<ThreatDetectionInput> = {}): ThreatDetectionInput {
  return {
    threatType: ThreatType.RAPID_ROLE_CHANGES,
    severity: SecuritySeverity.HIGH,
    confidence: 0.85,
    guildId: '123456789',
    guildName: 'Test Server',
    description: 'Detected rapid role changes',
    evidence: {
      triggeringEntries: [{ id: 100n, changeType: 'addition', timestamp: new Date() }],
    },
    recommendedAction: 'DRIP_ALERT',
    ...overrides,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('ThreatDetectionService', () => {
  let service: ThreatDetectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ThreatDetectionService(mockPrismaClient as unknown as PrismaClient);
  });

  // ==========================================================================
  // CORE CRUD OPERATIONS
  // ==========================================================================

  describe('recordThreat', () => {
    it('should record a threat with auto-populated MITRE mapping', async () => {
      const input = createMockThreatInput();
      const prismaThreat = createMockPrismaThreat();
      mockPrismaClient.threatDetection.create.mockResolvedValue(prismaThreat);

      const result = await service.recordThreat(input);

      expect(mockPrismaClient.threatDetection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          threatType: input.threatType,
          severity: input.severity,
          confidence: input.confidence,
          guildId: input.guildId,
          guildName: input.guildName,
          description: input.description,
          mitreAttack: 'T1098.003', // Auto-populated
          mitreTactic: 'Privilege Escalation', // Auto-populated
          autoMitigated: false,
          resolved: false,
          falsePositive: false,
        }),
      });
      expect(result.threatType).toBe(ThreatType.RAPID_ROLE_CHANGES);
    });

    it('should use provided MITRE mapping over auto-populated', async () => {
      const input = createMockThreatInput({
        mitreAttack: 'T1078',
        mitreTactic: 'Defense Evasion',
      });
      const prismaThreat = createMockPrismaThreat({
        mitreAttack: 'T1078',
        mitreTactic: 'Defense Evasion',
      });
      mockPrismaClient.threatDetection.create.mockResolvedValue(prismaThreat);

      await service.recordThreat(input);

      expect(mockPrismaClient.threatDetection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          mitreAttack: 'T1078',
          mitreTactic: 'Defense Evasion',
        }),
      });
    });

    it('should handle threats without triggering entry', async () => {
      const input = createMockThreatInput({
        triggeringEntryId: undefined,
      });
      const prismaThreat = createMockPrismaThreat({ triggeringEntryId: null });
      mockPrismaClient.threatDetection.create.mockResolvedValue(prismaThreat);

      const result = await service.recordThreat(input);

      expect(mockPrismaClient.threatDetection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeringEntryId: null,
        }),
      });
      expect(result.triggeringEntryId).toBeNull();
    });
  });

  describe('recordThreatsBatch', () => {
    it('should record multiple threats in a transaction', async () => {
      const inputs = [
        createMockThreatInput({ threatType: ThreatType.RAPID_ROLE_CHANGES }),
        createMockThreatInput({ threatType: ThreatType.MASS_ROLE_REMOVAL }),
      ];

      const mockTx = {
        threatDetection: {
          create: vi.fn()
            .mockResolvedValueOnce(createMockPrismaThreat({ id: 1n }))
            .mockResolvedValueOnce(createMockPrismaThreat({ id: 2n, threatType: 'MASS_ROLE_REMOVAL' })),
        },
      };
      mockPrismaClient.$transaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<void>) => {
        await fn(mockTx);
      });

      const result = await service.recordThreatsBatch(inputs);

      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
      expect(mockTx.threatDetection.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty input', async () => {
      const result = await service.recordThreatsBatch([]);

      expect(result).toEqual([]);
      expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getThreat', () => {
    it('should return threat by bigint ID', async () => {
      const prismaThreat = createMockPrismaThreat({ id: 42n });
      mockPrismaClient.threatDetection.findUnique.mockResolvedValue(prismaThreat);

      const result = await service.getThreat(42n);

      expect(mockPrismaClient.threatDetection.findUnique).toHaveBeenCalledWith({
        where: { id: 42n },
      });
      expect(result).not.toBeNull();
      expect(result?.id).toBe(42n);
    });

    it('should return null for non-existent threat', async () => {
      mockPrismaClient.threatDetection.findUnique.mockResolvedValue(null);

      const result = await service.getThreat(999n);

      expect(result).toBeNull();
    });
  });

  describe('queryThreats', () => {
    it('should query threats with guild filter', async () => {
      const prismaThreats = [createMockPrismaThreat()];
      mockPrismaClient.threatDetection.findMany.mockResolvedValue(prismaThreats);

      const options: ThreatQueryOptions = { guildId: '123456789' };
      const result = await service.queryThreats(options);

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { guildId: '123456789' },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by threat type', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ threatType: ThreatType.MASS_ROLE_REMOVAL });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { threatType: ThreatType.MASS_ROLE_REMOVAL },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by severity', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ severity: SecuritySeverity.CRITICAL });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { severity: SecuritySeverity.CRITICAL },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by minimum confidence', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ minConfidence: 0.8 });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { confidence: { gte: 0.8 } },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter unresolved only', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ unresolvedOnly: true });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { resolved: false },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter false positives only', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ falsePositivesOnly: true });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { falsePositive: true },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by MITRE ATT&CK ID', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ mitreAttack: 'T1098.003' });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { mitreAttack: 'T1098.003' },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by date range', async () => {
      const after = new Date('2025-01-01');
      const before = new Date('2025-12-31');
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ after, before });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: after, lte: before },
        },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle pagination', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ limit: 50, offset: 100 });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {},
        take: 50,
        skip: 100,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should cap limit at 1000', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ limit: 5000 });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {},
        take: 1000,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should support ascending order', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.queryThreats({ orderDir: 'asc' });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {},
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('countThreats', () => {
    it('should count threats with filters', async () => {
      mockPrismaClient.threatDetection.count.mockResolvedValue(42);

      const result = await service.countThreats({
        guildId: '123456789',
        unresolvedOnly: true,
      });

      expect(mockPrismaClient.threatDetection.count).toHaveBeenCalledWith({
        where: {
          guildId: '123456789',
          resolved: false,
        },
      });
      expect(result).toBe(42);
    });
  });

  // ==========================================================================
  // RESOLUTION & MITIGATION
  // ==========================================================================

  describe('resolveThreat', () => {
    it('should resolve a threat with resolution details', async () => {
      const resolvedThreat = createMockPrismaThreat({
        resolved: true,
        resolvedBy: 'admin123',
        resolvedAt: new Date(),
        resolutionNotes: 'Manually verified and resolved',
        falsePositive: false,
      });
      mockPrismaClient.threatDetection.update.mockResolvedValue(resolvedThreat);

      const resolution: ThreatResolutionInput = {
        resolvedBy: 'admin123',
        resolutionNotes: 'Manually verified and resolved',
        falsePositive: false,
      };
      const result = await service.resolveThreat(1n, resolution);

      expect(mockPrismaClient.threatDetection.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          resolved: true,
          resolvedBy: 'admin123',
          resolvedAt: expect.any(Date),
          resolutionNotes: 'Manually verified and resolved',
          falsePositive: false,
        },
      });
      expect(result.resolved).toBe(true);
      expect(result.resolvedBy).toBe('admin123');
    });

    it('should resolve threat without notes', async () => {
      const resolvedThreat = createMockPrismaThreat({
        resolved: true,
        resolvedBy: 'admin123',
        resolvedAt: new Date(),
        resolutionNotes: null,
        falsePositive: false,
      });
      mockPrismaClient.threatDetection.update.mockResolvedValue(resolvedThreat);

      const result = await service.resolveThreat(1n, { resolvedBy: 'admin123' });

      expect(mockPrismaClient.threatDetection.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          resolutionNotes: null,
        }),
      });
      expect(result.resolved).toBe(true);
    });
  });

  describe('markAutoMitigated', () => {
    it('should mark threat as auto-mitigated', async () => {
      const mitigatedThreat = createMockPrismaThreat({
        autoMitigated: true,
        mitigationAction: 'AUTO_REVERT_ROLES',
      });
      mockPrismaClient.threatDetection.update.mockResolvedValue(mitigatedThreat);

      const mitigation: ThreatMitigationInput = {
        mitigationAction: 'AUTO_REVERT_ROLES',
      };
      const result = await service.markAutoMitigated(1n, mitigation);

      expect(mockPrismaClient.threatDetection.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: {
          autoMitigated: true,
          mitigationAction: 'AUTO_REVERT_ROLES',
        },
      });
      expect(result.autoMitigated).toBe(true);
      expect(result.mitigationAction).toBe('AUTO_REVERT_ROLES');
    });
  });

  describe('markFalsePositive', () => {
    it('should mark threat as false positive', async () => {
      const fpThreat = createMockPrismaThreat({
        resolved: true,
        resolvedBy: 'admin123',
        resolvedAt: new Date(),
        resolutionNotes: 'Verified as false positive',
        falsePositive: true,
      });
      mockPrismaClient.threatDetection.update.mockResolvedValue(fpThreat);

      const result = await service.markFalsePositive(1n, 'admin123', 'Verified as false positive');

      expect(mockPrismaClient.threatDetection.update).toHaveBeenCalledWith({
        where: { id: 1n },
        data: expect.objectContaining({
          falsePositive: true,
          resolved: true,
          resolvedBy: 'admin123',
        }),
      });
      expect(result.falsePositive).toBe(true);
    });
  });

  // ==========================================================================
  // SPECIALIZED QUERIES
  // ==========================================================================

  describe('getUnresolvedThreats', () => {
    it('should get unresolved threats for a guild', async () => {
      const prismaThreats = [createMockPrismaThreat({ resolved: false })];
      mockPrismaClient.threatDetection.findMany.mockResolvedValue(prismaThreats);

      const result = await service.getUnresolvedThreats('123456789');

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          guildId: '123456789',
          resolved: false,
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by minimum severity', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.getUnresolvedThreats('123456789', { minSeverity: SecuritySeverity.HIGH });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          guildId: '123456789',
          resolved: false,
          severity: { in: [SecuritySeverity.HIGH, SecuritySeverity.CRITICAL] },
        },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should respect limit option', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.getUnresolvedThreats('123456789', { limit: 10 });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getCriticalThreats', () => {
    it('should get critical unresolved threats', async () => {
      const criticalThreats = [
        createMockPrismaThreat({ severity: 'CRITICAL', resolved: false }),
      ];
      mockPrismaClient.threatDetection.findMany.mockResolvedValue(criticalThreats);

      const result = await service.getCriticalThreats();

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          severity: SecuritySeverity.CRITICAL,
          resolved: false,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should filter by guild when provided', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.getCriticalThreats('123456789');

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          severity: SecuritySeverity.CRITICAL,
          resolved: false,
          guildId: '123456789',
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getThreatsByMitreTechnique', () => {
    it('should get threats by MITRE ATT&CK ID', async () => {
      const prismaThreats = [createMockPrismaThreat({ mitreAttack: 'T1098.003' })];
      mockPrismaClient.threatDetection.findMany.mockResolvedValue(prismaThreats);

      const result = await service.getThreatsByMitreTechnique('T1098.003');

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: { mitreAttack: 'T1098.003' },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should apply additional filters', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.getThreatsByMitreTechnique('T1098', {
        guildId: '123456789',
        unresolvedOnly: true,
        limit: 50,
      });

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          mitreAttack: 'T1098',
          guildId: '123456789',
          resolved: false,
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getRecentThreats', () => {
    it('should get threats from last 24 hours by default', async () => {
      const prismaThreats = [createMockPrismaThreat()];
      mockPrismaClient.threatDetection.findMany.mockResolvedValue(prismaThreats);

      const result = await service.getRecentThreats();

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: { gte: expect.any(Date) },
        },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
    });

    it('should support custom hours lookback', async () => {
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.getRecentThreats('123456789', 48);

      expect(mockPrismaClient.threatDetection.findMany).toHaveBeenCalledWith({
        where: {
          guildId: '123456789',
          createdAt: { gte: expect.any(Date) },
        },
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  describe('getStats', () => {
    it('should return comprehensive threat statistics', async () => {
      // Mock all the parallel calls
      mockPrismaClient.threatDetection.count
        .mockResolvedValueOnce(100) // totalThreats
        .mockResolvedValueOnce(25)  // unresolvedCount
        .mockResolvedValueOnce(5)   // falsePositiveCount
        .mockResolvedValueOnce(15)  // autoMitigatedCount
        .mockResolvedValueOnce(10)  // last24h
        .mockResolvedValueOnce(50); // last7d

      mockPrismaClient.threatDetection.groupBy
        .mockResolvedValueOnce([
          { threatType: 'RAPID_ROLE_CHANGES', _count: { threatType: 40 } },
          { threatType: 'MASS_ROLE_REMOVAL', _count: { threatType: 30 } },
        ])
        .mockResolvedValueOnce([
          { severity: 'HIGH', _count: { severity: 45 } },
          { severity: 'CRITICAL', _count: { severity: 20 } },
        ]);

      mockPrismaClient.threatDetection.findMany.mockResolvedValue([
        { confidence: 0.9 },
        { confidence: 0.8 },
        { confidence: 0.85 },
      ]);

      const result = await service.getStats();

      expect(result.totalThreats).toBe(100);
      expect(result.unresolvedCount).toBe(25);
      expect(result.falsePositiveCount).toBe(5);
      expect(result.autoMitigatedCount).toBe(15);
      expect(result.byType).toEqual({
        RAPID_ROLE_CHANGES: 40,
        MASS_ROLE_REMOVAL: 30,
      });
      expect(result.bySeverity).toEqual({
        HIGH: 45,
        CRITICAL: 20,
      });
      expect(result.last24Hours).toBe(10);
      expect(result.last7Days).toBe(50);
      expect(result.averageConfidence).toBeCloseTo(0.85, 10);
    });

    it('should filter stats by guild when provided', async () => {
      mockPrismaClient.threatDetection.count.mockResolvedValue(0);
      mockPrismaClient.threatDetection.groupBy.mockResolvedValue([]);
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      await service.getStats('123456789');

      // Verify guild filter is applied to all count calls
      expect(mockPrismaClient.threatDetection.count).toHaveBeenCalledWith({
        where: { guildId: '123456789' },
      });
    });

    it('should handle empty database', async () => {
      mockPrismaClient.threatDetection.count.mockResolvedValue(0);
      mockPrismaClient.threatDetection.groupBy.mockResolvedValue([]);
      mockPrismaClient.threatDetection.findMany.mockResolvedValue([]);

      const result = await service.getStats();

      expect(result).toEqual({
        totalThreats: 0,
        unresolvedCount: 0,
        falsePositiveCount: 0,
        autoMitigatedCount: 0,
        byType: {},
        bySeverity: {},
        last24Hours: 0,
        last7Days: 0,
        averageConfidence: 0,
      });
    });
  });

  // ==========================================================================
  // MITRE ATT&CK MAPPING
  // ==========================================================================

  describe('MITRE_ATTACK_MAPPING', () => {
    it('should have mappings for all threat types', () => {
      const allThreatTypes = Object.values(ThreatType);

      for (const threatType of allThreatTypes) {
        expect(MITRE_ATTACK_MAPPING[threatType]).toBeDefined();
        expect(MITRE_ATTACK_MAPPING[threatType].id).toBeDefined();
        expect(MITRE_ATTACK_MAPPING[threatType].tactic).toBeDefined();
        expect(MITRE_ATTACK_MAPPING[threatType].name).toBeDefined();
      }
    });

    it('should map RAPID_ROLE_CHANGES to T1098.003', () => {
      const mapping = MITRE_ATTACK_MAPPING[ThreatType.RAPID_ROLE_CHANGES];

      expect(mapping.id).toBe('T1098.003');
      expect(mapping.tactic).toBe('Privilege Escalation');
    });

    it('should map MASS_ROLE_REMOVAL to T1531', () => {
      const mapping = MITRE_ATTACK_MAPPING[ThreatType.MASS_ROLE_REMOVAL];

      expect(mapping.id).toBe('T1531');
      expect(mapping.tactic).toBe('Impact');
    });
  });

  // ==========================================================================
  // TYPE MAPPING
  // ==========================================================================

  describe('type mapping', () => {
    it('should correctly map Prisma result to ThreatDetection', async () => {
      const prismaThreat = createMockPrismaThreat({
        id: 123n,
        threatType: 'PRIVILEGE_ESCALATION',
        severity: 'CRITICAL',
        resolved: true,
        resolvedBy: 'admin',
        resolvedAt: new Date(),
      });
      mockPrismaClient.threatDetection.findUnique.mockResolvedValue(prismaThreat);

      const result = await service.getThreat(123n);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(123n);
      expect(result?.threatType).toBe(ThreatType.PRIVILEGE_ESCALATION);
      expect(result?.severity).toBe(SecuritySeverity.CRITICAL);
      expect(result?.resolved).toBe(true);
      expect(result?.resolvedBy).toBe('admin');
    });
  });
});
