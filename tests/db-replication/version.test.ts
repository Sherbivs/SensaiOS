/**
 * Database Version Tracking Tests
 * 
 * Tests version fingerprint calculation, comparison logic,
 * and reversion detection for database replication architecture.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';
import {
  getVersion,
  compareVersions,
  handleReversion,
  recordVersion,
  VersionStatus,
  type Version,
} from '../../src/services/db-replication/version.js';

// ---- Mock Setup ----

const createMockPrismaClient = (migrations: Array<{ migration_name: string; checksum: string; started_at: Date; finished_at: Date | null }>) => {
  return {
    $queryRaw: vi.fn().mockResolvedValue(migrations),
    dbVersion: {
      create: vi.fn().mockResolvedValue({}),
    },
    dbSyncState: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  } as any;
};

const sampleMigrations = [
  {
    migration_name: '20250101000000_init',
    checksum: 'abc123',
    applied_steps_count: 1,
    started_at: new Date('2025-01-01T00:00:00Z'),
    finished_at: new Date('2025-01-01T00:00:01Z'),
  },
  {
    migration_name: '20250102000000_add_users',
    checksum: 'def456',
    applied_steps_count: 1,
    started_at: new Date('2025-01-02T00:00:00Z'),
    finished_at: new Date('2025-01-02T00:00:01Z'),
  },
  {
    migration_name: '20250103000000_add_pokemon',
    checksum: 'ghi789',
    applied_steps_count: 1,
    started_at: new Date('2025-01-03T00:00:00Z'),
    finished_at: new Date('2025-01-03T00:00:01Z'),
  },
];

// ---- Tests ----

describe('getVersion', () => {
  it('should calculate SHA-256 fingerprint from migrations', async () => {
    const mockPrisma = createMockPrismaClient(sampleMigrations);
    const version = await getVersion(mockPrisma, 'TEST');

    // Verify fingerprint calculation
    const expectedInput = '20250101000000_init:abc123|20250102000000_add_users:def456|20250103000000_add_pokemon:ghi789';
    const expectedFingerprint = createHash('sha256').update(expectedInput).digest('hex');

    expect(version.fingerprint).toBe(expectedFingerprint);
    expect(version.migrationCount).toBe(3);
    expect(version.lastMigrationName).toBe('20250103000000_add_pokemon');
    expect(version.source).toBe('TEST');
  });

  it('should handle empty migrations table', async () => {
    const mockPrisma = createMockPrismaClient([]);
    const version = await getVersion(mockPrisma, 'EMPTY');

    expect(version.fingerprint).toBe('');
    expect(version.migrationCount).toBe(0);
    expect(version.lastMigrationName).toBeNull();
  });

  it('should use finished_at when available', async () => {
    const mockPrisma = createMockPrismaClient(sampleMigrations);
    const version = await getVersion(mockPrisma, 'TEST');

    expect(version.lastMigrationAppliedAt).toEqual(new Date('2025-01-03T00:00:01Z'));
  });
});

describe('compareVersions - MATCH', () => {
  it('should return MATCH when fingerprints are identical', async () => {
    const mockPrismaSource = createMockPrismaClient(sampleMigrations);
    const mockPrismaTarget = createMockPrismaClient(sampleMigrations);

    const sourceVersion = await getVersion(mockPrismaSource, 'DEV');
    const targetVersion = await getVersion(mockPrismaTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPrismaSource, mockPrismaTarget);

    expect(comparison.status).toBe(VersionStatus.MATCH);
    expect(comparison.migrationCountDiff).toBe(0);
    expect(comparison.message).toContain('in sync');
  });
});

describe('compareVersions - AHEAD', () => {
  it('should return AHEAD when source has more migrations with valid prefix', async () => {
    const targetMigrations = sampleMigrations.slice(0, 2);
    const mockPrismaSource = createMockPrismaClient(sampleMigrations);
    const mockPrismaTarget = createMockPrismaClient(targetMigrations);

    // Mock prefix verification to return target migrations
    mockPrismaSource.$queryRaw = vi.fn()
      .mockResolvedValueOnce(sampleMigrations) // First call for getVersion
      .mockResolvedValueOnce(targetMigrations); // Second call for prefix verification

    mockPrismaTarget.$queryRaw = vi.fn()
      .mockResolvedValueOnce(targetMigrations) // First call for getVersion
      .mockResolvedValueOnce(targetMigrations); // Second call for prefix verification

    const sourceVersion = await getVersion(mockPrismaSource, 'DEV');
    const targetVersion = await getVersion(mockPrismaTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPrismaSource, mockPrismaTarget);

    expect(comparison.status).toBe(VersionStatus.AHEAD);
    expect(comparison.migrationCountDiff).toBe(1);
    expect(comparison.message).toContain('ahead');
    expect(comparison.message).toContain('safe to sync');
  });

  it('should return DIVERGED when source has more migrations but prefix invalid', async () => {
    const targetMigrations = [
      {
        migration_name: '20250101000000_init',
        checksum: 'DIFFERENT_CHECKSUM', // Different checksum
        applied_steps_count: 1,
        started_at: new Date('2025-01-01T00:00:00Z'),
        finished_at: new Date('2025-01-01T00:00:01Z'),
      },
    ];

    const mockPrismaSource = createMockPrismaClient(sampleMigrations);
    const mockPrismaTarget = createMockPrismaClient(targetMigrations);

    // Mock prefix verification
    mockPrismaSource.$queryRaw = vi.fn()
      .mockResolvedValueOnce(sampleMigrations)
      .mockResolvedValueOnce([sampleMigrations[0]]); // First migration from source

    mockPrismaTarget.$queryRaw = vi.fn()
      .mockResolvedValueOnce(targetMigrations)
      .mockResolvedValueOnce(targetMigrations);

    const sourceVersion = await getVersion(mockPrismaSource, 'DEV');
    const targetVersion = await getVersion(mockPrismaTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPrismaSource, mockPrismaTarget);

    expect(comparison.status).toBe(VersionStatus.DIVERGED);
    expect(comparison.message).toContain('DIVERGENCE');
    expect(comparison.message).toContain('different migration histories');
  });
});

describe('compareVersions - BEHIND (Reversion)', () => {
  it('should return BEHIND when source has fewer migrations', async () => {
    const sourceMigrations = sampleMigrations.slice(0, 2);
    const mockPrismaSource = createMockPrismaClient(sourceMigrations);
    const mockPrismaTarget = createMockPrismaClient(sampleMigrations);

    const sourceVersion = await getVersion(mockPrismaSource, 'DEV');
    const targetVersion = await getVersion(mockPrismaTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPrismaSource, mockPrismaTarget);

    expect(comparison.status).toBe(VersionStatus.BEHIND);
    expect(comparison.migrationCountDiff).toBe(-1);
    expect(comparison.message).toContain('REVERSION DETECTED');
    expect(comparison.message).toContain('rolled back');
    expect(comparison.message).toContain('sync blocked');
  });
});

describe('compareVersions - DIVERGED', () => {
  it('should return DIVERGED when same count but different fingerprints', async () => {
    const divergedMigrations = [
      {
        migration_name: '20250101000000_init',
        checksum: 'abc123',
        applied_steps_count: 1,
        started_at: new Date('2025-01-01T00:00:00Z'),
        finished_at: new Date('2025-01-01T00:00:01Z'),
      },
      {
        migration_name: '20250102000000_add_users',
        checksum: 'def456',
        applied_steps_count: 1,
        started_at: new Date('2025-01-02T00:00:00Z'),
        finished_at: new Date('2025-01-02T00:00:01Z'),
      },
      {
        migration_name: '20250103000000_DIFFERENT_MIGRATION', // Different migration
        checksum: 'xyz999',
        applied_steps_count: 1,
        started_at: new Date('2025-01-03T00:00:00Z'),
        finished_at: new Date('2025-01-03T00:00:01Z'),
      },
    ];

    const mockPrismaSource = createMockPrismaClient(sampleMigrations);
    const mockPrismaTarget = createMockPrismaClient(divergedMigrations);

    const sourceVersion = await getVersion(mockPrismaSource, 'DEV');
    const targetVersion = await getVersion(mockPrismaTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPrismaSource, mockPrismaTarget);

    expect(comparison.status).toBe(VersionStatus.DIVERGED);
    expect(comparison.migrationCountDiff).toBe(0);
    expect(comparison.message).toContain('same migration count');
    expect(comparison.message).toContain('different fingerprints');
  });
});

describe('handleReversion', () => {
  it('should detect reversion and block sync when DEV has fewer migrations', async () => {
    const devMigrations = sampleMigrations.slice(0, 2);
    const mockPrismaDev = createMockPrismaClient(devMigrations);
    const mockPrismaProd = createMockPrismaClient(sampleMigrations);

    const devVersion = await getVersion(mockPrismaDev, 'DEV');
    const prodVersion = await getVersion(mockPrismaProd, 'PROD');

    const result = await handleReversion(devVersion, prodVersion, mockPrismaProd);

    expect(result.reversionDetected).toBe(true);
    expect(result.syncBlocked).toBe(true);
    expect(result.devMigrationCount).toBe(2);
    expect(result.prodMigrationCount).toBe(3);
    expect(result.message).toContain('rolled back 1 migration');
    expect(result.message).toContain('catches up to 3 migrations');

    // Verify db_sync_state update
    expect(mockPrismaProd.dbSyncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { source_target: { source: 'DEV', target: 'PROD' } },
        create: expect.objectContaining({
          status: 'WAITING_FOR_MASTER',
          lastError: expect.stringContaining('Reversion detected'),
        }),
        update: expect.objectContaining({
          status: 'WAITING_FOR_MASTER',
        }),
      })
    );
  });

  it('should return no reversion when DEV is ahead or in sync', async () => {
    const mockPrismaDev = createMockPrismaClient(sampleMigrations);
    const mockPrismaProd = createMockPrismaClient(sampleMigrations.slice(0, 2));

    const devVersion = await getVersion(mockPrismaDev, 'DEV');
    const prodVersion = await getVersion(mockPrismaProd, 'PROD');

    const result = await handleReversion(devVersion, prodVersion, mockPrismaProd);

    expect(result.reversionDetected).toBe(false);
    expect(result.syncBlocked).toBe(false);
    expect(result.message).toContain('No reversion detected');

    // Verify db_sync_state NOT updated
    expect(mockPrismaProd.dbSyncState.upsert).not.toHaveBeenCalled();
  });
});

describe('recordVersion', () => {
  it('should create version record in db_version table', async () => {
    const mockPrisma = createMockPrismaClient(sampleMigrations);
    const version = await getVersion(mockPrisma, 'DEV');

    await recordVersion(mockPrisma, version);

    expect(mockPrisma.dbVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versionFingerprint: version.fingerprint,
          migrationCount: 3,
          lastMigrationName: '20250103000000_add_pokemon',
          syncSource: 'DEV',
        }),
      })
    );
  });

  it('should handle empty version gracefully', async () => {
    const mockPrisma = createMockPrismaClient([]);
    const version = await getVersion(mockPrisma, 'EMPTY');

    await recordVersion(mockPrisma, version);

    expect(mockPrisma.dbVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          versionFingerprint: '',
          migrationCount: 0,
          lastMigrationName: '',
          syncSource: 'EMPTY',
        }),
      })
    );
  });
});

describe('Fingerprint calculation edge cases', () => {
  it('should produce different fingerprints for different migration orders', async () => {
    const migrations1 = [sampleMigrations[0], sampleMigrations[1]];
    const migrations2 = [sampleMigrations[1], sampleMigrations[0]]; // Reversed order

    const mockPrisma1 = createMockPrismaClient(migrations1);
    const mockPrisma2 = createMockPrismaClient(migrations2);

    const version1 = await getVersion(mockPrisma1, 'TEST1');
    const version2 = await getVersion(mockPrisma2, 'TEST2');

    expect(version1.fingerprint).not.toBe(version2.fingerprint);
  });

  it('should produce different fingerprints for different checksums', async () => {
    const migrations1 = [sampleMigrations[0]];
    const migrations2 = [
      {
        ...sampleMigrations[0],
        checksum: 'DIFFERENT_CHECKSUM',
      },
    ];

    const mockPrisma1 = createMockPrismaClient(migrations1);
    const mockPrisma2 = createMockPrismaClient(migrations2);

    const version1 = await getVersion(mockPrisma1, 'TEST1');
    const version2 = await getVersion(mockPrisma2, 'TEST2');

    expect(version1.fingerprint).not.toBe(version2.fingerprint);
  });

  it('should produce same fingerprint for identical migrations', async () => {
    const mockPrisma1 = createMockPrismaClient(sampleMigrations);
    const mockPrisma2 = createMockPrismaClient(sampleMigrations);

    const version1 = await getVersion(mockPrisma1, 'TEST1');
    const version2 = await getVersion(mockPrisma2, 'TEST2');

    expect(version1.fingerprint).toBe(version2.fingerprint);
  });
});
