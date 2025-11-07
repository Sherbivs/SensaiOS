/**
 * Sync Orchestration Tests
 * 
 * Tests for DEV→Prod and Prod→Local sync orchestrators.
 */

import type { PrismaClient } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as integrityModule from '../../src/services/db-replication/integrity';
import * as rollbackModule from '../../src/services/db-replication/rollback';
import { syncDevToProd, syncProdToLocal, SyncStage } from '../../src/services/db-replication/sync';
import * as versionModule from '../../src/services/db-replication/version';

// Mock Prisma clients
function createMockPrismaClient(_name: string): PrismaClient {  // Prefixed with _ to indicate intentionally unused
  return {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  } as unknown as PrismaClient;
}

describe('syncDevToProd', () => {
  let devPrisma: PrismaClient;
  let prodPrisma: PrismaClient;

  beforeEach(() => {
    devPrisma = createMockPrismaClient('DEV');
    prodPrisma = createMockPrismaClient('PROD');
    vi.clearAllMocks();
  });

  describe('Version Check (Stage 1)', () => {
    it('should skip sync if versions already MATCH', async () => {
      const mockVersion = {
        fingerprint: 'abc123',
        migrationCount: 10,
        lastMigrationName: 'migration_10',
        lastMigrationAppliedAt: new Date(),
        source: 'DEV',
      };

      vi.spyOn(versionModule, 'getVersion')
        .mockResolvedValueOnce(mockVersion) // DEV
        .mockResolvedValueOnce(mockVersion); // PROD

      vi.spyOn(versionModule, 'compareVersions').mockResolvedValue({
        status: versionModule.VersionStatus.MATCH,
        sourceFingerprint: 'abc123',
        targetFingerprint: 'abc123',
        migrationCountDiff: 0,
        message: 'Versions match',
      });

      const result = await syncDevToProd(devPrisma, prodPrisma);

      expect(result.success).toBe(true);
      expect(result.stage).toBe(SyncStage.COMPLETE);
      expect(result.metrics.migrationsApplied).toBe(0);
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should throw error if DEV is BEHIND Prod (reversion detected)', async () => {
      const devVersion = {
        fingerprint: 'old123',
        migrationCount: 8,
        lastMigrationName: 'migration_8',
        lastMigrationAppliedAt: new Date(),
        source: 'DEV',
      };

      const prodVersion = {
        fingerprint: 'new456',
        migrationCount: 10,
        lastMigrationName: 'migration_10',
        lastMigrationAppliedAt: new Date(),
        source: 'PROD',
      };

      vi.spyOn(versionModule, 'getVersion')
        .mockResolvedValueOnce(devVersion)
        .mockResolvedValueOnce(prodVersion);

      vi.spyOn(versionModule, 'compareVersions').mockResolvedValue({
        status: versionModule.VersionStatus.BEHIND,
        sourceFingerprint: 'old123',
        targetFingerprint: 'new456',
        migrationCountDiff: -2,
        message: 'DEV is BEHIND',
      });

      vi.spyOn(versionModule, 'handleReversion').mockResolvedValue({
        reversionDetected: true,
        syncBlocked: true,
        devMigrationCount: 8,
        prodMigrationCount: 10,
        message: 'Reversion detected',
      });

      vi.spyOn(rollbackModule, 'handleSyncFailure').mockResolvedValue();

      const result = await syncDevToProd(devPrisma, prodPrisma);

      expect(result.success).toBe(false);
      expect(result.stage).toBe(SyncStage.VERSION_CHECK);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('BEHIND');
      expect(versionModule.handleReversion).toHaveBeenCalledWith(devVersion, prodVersion, prodPrisma);
    });

    it('should throw error if DEV and Prod DIVERGED', async () => {
      const devVersion = {
        fingerprint: 'abc123',
        migrationCount: 10,
        lastMigrationName: 'migration_10_dev',
        lastMigrationAppliedAt: new Date(),
        source: 'DEV',
      };

      const prodVersion = {
        fingerprint: 'xyz789',
        migrationCount: 10,
        lastMigrationName: 'migration_10_prod',
        lastMigrationAppliedAt: new Date(),
        source: 'PROD',
      };

      vi.spyOn(versionModule, 'getVersion')
        .mockResolvedValueOnce(devVersion)
        .mockResolvedValueOnce(prodVersion);

      vi.spyOn(versionModule, 'compareVersions').mockResolvedValue({
        status: versionModule.VersionStatus.DIVERGED,
        sourceFingerprint: 'abc123',
        targetFingerprint: 'xyz789',
        migrationCountDiff: 0,
        message: 'DIVERGED',
      });

      vi.spyOn(rollbackModule, 'handleSyncFailure').mockResolvedValue();

      const result = await syncDevToProd(devPrisma, prodPrisma);

      expect(result.success).toBe(false);
      expect(result.errors[0].message).toContain('DIVERGED');
      expect(result.errors[0].message).toContain('Manual resolution required');
    });
  });

  describe('Dry Run Mode', () => {
    it('should skip migration apply in dry run mode', async () => {
      const devVersion = {
        fingerprint: 'new123',
        migrationCount: 12,
        lastMigrationName: 'migration_12',
        lastMigrationAppliedAt: new Date(),
        source: 'DEV',
      };

      const prodVersion = {
        fingerprint: 'old123',
        migrationCount: 10,
        lastMigrationName: 'migration_10',
        lastMigrationAppliedAt: new Date(),
        source: 'PROD',
      };

      vi.spyOn(versionModule, 'getVersion')
        .mockResolvedValueOnce(devVersion)
        .mockResolvedValueOnce(prodVersion);

      vi.spyOn(versionModule, 'compareVersions').mockResolvedValue({
        status: versionModule.VersionStatus.AHEAD,
        sourceFingerprint: 'new123',
        targetFingerprint: 'old123',
        migrationCountDiff: 2,
        message: 'AHEAD by 2',
      });

      const result = await syncDevToProd(devPrisma, prodPrisma, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.stage).toBe(SyncStage.COMPLETE);
      expect(result.metrics.migrationsApplied).toBe(2);
    });
  });

  describe('Integrity Verification', () => {
    it('should skip integrity checks when skipIntegrity=true', async () => {
      const devVersion = {
        fingerprint: 'new123',
        migrationCount: 12,
        lastMigrationName: 'migration_12',
        lastMigrationAppliedAt: new Date(),
        source: 'DEV',
      };

      const prodVersion = {
        fingerprint: 'old123',
        migrationCount: 10,
        lastMigrationName: 'migration_10',
        lastMigrationAppliedAt: new Date(),
        source: 'PROD',
      };

      vi.spyOn(versionModule, 'getVersion')
        .mockResolvedValueOnce(devVersion)
        .mockResolvedValueOnce(prodVersion);

      vi.spyOn(versionModule, 'compareVersions').mockResolvedValue({
        status: versionModule.VersionStatus.AHEAD,
        sourceFingerprint: 'new123',
        targetFingerprint: 'old123',
        migrationCountDiff: 2,
        message: 'AHEAD by 2',
      });

      const verifySchemaSpy = vi.spyOn(integrityModule, 'verifySchemaIntegrity');

      await syncDevToProd(devPrisma, prodPrisma, { dryRun: true, skipIntegrity: true });

      expect(verifySchemaSpy).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should call handleSyncFailure on any error', async () => {
      vi.spyOn(versionModule, 'getVersion').mockRejectedValue(new Error('Database connection failed'));
      vi.spyOn(rollbackModule, 'handleSyncFailure').mockResolvedValue();

      const result = await syncDevToProd(devPrisma, prodPrisma);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(rollbackModule.handleSyncFailure).toHaveBeenCalledWith(
        prodPrisma,
        'DEV',
        'PROD',
        expect.objectContaining({ success: false })
      );
    });
  });
});

describe('syncProdToLocal', () => {
  let prodPrisma: PrismaClient;
  let localPrisma: PrismaClient;

  beforeEach(() => {
    prodPrisma = createMockPrismaClient('PROD');
    localPrisma = createMockPrismaClient('LOCAL');
    vi.clearAllMocks();
  });

  describe('Version Check', () => {
    it('should skip sync if Prod and Local already match', async () => {
      const mockVersion = {
        fingerprint: 'abc123',
        migrationCount: 10,
        lastMigrationName: 'migration_10',
        lastMigrationAppliedAt: new Date(),
        source: 'PROD',
      };

      vi.spyOn(versionModule, 'getVersion')
        .mockResolvedValueOnce(mockVersion) // PROD
        .mockResolvedValueOnce(mockVersion); // LOCAL

      const result = await syncProdToLocal(prodPrisma, localPrisma);

      expect(result.success).toBe(true);
      expect(result.stage).toBe(SyncStage.COMPLETE);
    });

    it('should skip pg_dump/restore in dry run mode', async () => {
      const prodVersion = {
        fingerprint: 'new123',
        migrationCount: 12,
        lastMigrationName: 'migration_12',
        lastMigrationAppliedAt: new Date(),
        source: 'PROD',
      };

      const localVersion = {
        fingerprint: 'old123',
        migrationCount: 10,
        lastMigrationName: 'migration_10',
        lastMigrationAppliedAt: new Date(),
        source: 'LOCAL',
      };

      vi.spyOn(versionModule, 'getVersion')
        .mockResolvedValueOnce(prodVersion)
        .mockResolvedValueOnce(localVersion);

      const result = await syncProdToLocal(prodPrisma, localPrisma, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.stage).toBe(SyncStage.COMPLETE);
    });
  });

  describe('Error Handling', () => {
    it('should handle version check failures gracefully', async () => {
      vi.spyOn(versionModule, 'getVersion').mockRejectedValue(new Error('Connection timeout'));

      const result = await syncProdToLocal(prodPrisma, localPrisma);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Connection timeout');
    });
  });
});

describe('Integration: Full DEV→Prod→Local Cascade', () => {
  it('should sync DEV→Prod then Prod→Local in sequence', async () => {
    const devPrisma = createMockPrismaClient('DEV');
    const prodPrisma = createMockPrismaClient('PROD');
    const localPrisma = createMockPrismaClient('LOCAL');

    // DEV version (ahead)
    const devVersion = {
      fingerprint: 'latest',
      migrationCount: 15,
      lastMigrationName: 'migration_15',
      lastMigrationAppliedAt: new Date(),
      source: 'DEV',
    };

    // Prod version (behind DEV, will catch up)
    const prodVersionBefore = {
      fingerprint: 'older',
      migrationCount: 12,
      lastMigrationName: 'migration_12',
      lastMigrationAppliedAt: new Date(),
      source: 'PROD',
    };

    // Local version (behind Prod)
    const localVersion = {
      fingerprint: 'oldest',
      migrationCount: 10,
      lastMigrationName: 'migration_10',
      lastMigrationAppliedAt: new Date(),
      source: 'LOCAL',
    };

    // Mock DEV→Prod sync
    vi.spyOn(versionModule, 'getVersion')
      .mockResolvedValueOnce(devVersion) // DEV
      .mockResolvedValueOnce(prodVersionBefore); // PROD before

    vi.spyOn(versionModule, 'compareVersions').mockResolvedValue({
      status: versionModule.VersionStatus.AHEAD,
      sourceFingerprint: 'latest',
      targetFingerprint: 'older',
      migrationCountDiff: 3,
      message: 'AHEAD by 3',
    });

    const resultDevToProd = await syncDevToProd(devPrisma, prodPrisma, { dryRun: true });

    expect(resultDevToProd.success).toBe(true);
    expect(resultDevToProd.metrics.migrationsApplied).toBe(3);

    // Mock Prod→Local sync
    vi.spyOn(versionModule, 'getVersion')
      .mockResolvedValueOnce(devVersion) // PROD now matches DEV
      .mockResolvedValueOnce(localVersion); // LOCAL

    const resultProdToLocal = await syncProdToLocal(prodPrisma, localPrisma, { dryRun: true });

    expect(resultProdToLocal.success).toBe(true);
  });
});
