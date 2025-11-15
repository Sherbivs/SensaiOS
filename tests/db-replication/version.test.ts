/**
 * Database Version Tracking Tests
 * 
 * Tests version fingerprint calculation, comparison logic,
 * and reversion detection for database replication architecture.
 * 
 * Updated for PostgreSQL Pool (native pg library).
 */

import { createHash } from 'crypto';

import { describe, it, expect, vi } from 'vitest';

import {
  getVersion,
  compareVersions,
  handleReversion,
  recordVersion,
  VersionStatus,
} from '../../src/services/db-replication/version.js';
import { createMockPoolWithMigrations, type MockMigration } from '../shared/index.js';

// ---- Test Data ----

const sampleMigrations: MockMigration[] = [
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
    const mockPool = createMockPoolWithMigrations(sampleMigrations);
    const version = await getVersion(mockPool, 'TEST');

    // Verify fingerprint calculation
    const expectedInput = '20250101000000_init:abc123|20250102000000_add_users:def456|20250103000000_add_pokemon:ghi789';
    const expectedFingerprint = createHash('sha256').update(expectedInput).digest('hex');

    expect(version.fingerprint).toBe(expectedFingerprint);
    expect(version.migrationCount).toBe(3);
    expect(version.lastMigrationName).toBe('20250103000000_add_pokemon');
    expect(version.source).toBe('TEST');
  });

  it('should handle empty migrations table', async () => {
    const mockPool = createMockPoolWithMigrations([]);
    const version = await getVersion(mockPool, 'EMPTY');

    expect(version.fingerprint).toBe('');
    expect(version.migrationCount).toBe(0);
    expect(version.lastMigrationName).toBeNull();
  });

  it('should use finished_at when available', async () => {
    const mockPool = createMockPoolWithMigrations(sampleMigrations);
    const version = await getVersion(mockPool, 'TEST');

    expect(version.lastMigrationAppliedAt).toEqual(new Date('2025-01-03T00:00:01Z'));
  });
});

describe('compareVersions - MATCH', () => {
  it('should return MATCH when fingerprints are identical', async () => {
    const mockPoolSource = createMockPoolWithMigrations(sampleMigrations);
    const mockPoolTarget = createMockPoolWithMigrations(sampleMigrations);

    const sourceVersion = await getVersion(mockPoolSource, 'DEV');
    const targetVersion = await getVersion(mockPoolTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPoolSource, mockPoolTarget);

    expect(comparison.status).toBe(VersionStatus.MATCH);
    expect(comparison.migrationCountDiff).toBe(0);
    expect(comparison.message).toContain('in sync');
  });
});

describe('compareVersions - AHEAD', () => {
  it('should return AHEAD when source has more migrations with valid prefix', async () => {
    const targetMigrations = sampleMigrations.slice(0, 2);
    
    // Create pools with custom query behavior for prefix verification
    const sourceQueryMock = vi.fn((sql: string, _params?: any[]) => {
      // getMigrations (no LIMIT) returns all 3 migrations
      if (sql.includes('_prisma_migrations') && !sql.includes('LIMIT')) {
        return Promise.resolve({
          rows: sampleMigrations,
          rowCount: sampleMigrations.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      // getMigrationsWithLimit (for prefix verification) - return first 2
      if (sql.includes('_prisma_migrations') && sql.includes('LIMIT')) {
        return Promise.resolve({
          rows: targetMigrations,
          rowCount: targetMigrations.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const targetQueryMock = vi.fn((sql: string) => {
      // getMigrations returns 2 migrations
      if (sql.includes('_prisma_migrations')) {
        return Promise.resolve({
          rows: targetMigrations,
          rowCount: targetMigrations.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const mockPoolSource = { query: sourceQueryMock } as any;
    const mockPoolTarget = { query: targetQueryMock } as any;

    const sourceVersion = await getVersion(mockPoolSource, 'DEV');
    const targetVersion = await getVersion(mockPoolTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPoolSource, mockPoolTarget);

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

    const sourceQueryMock = vi.fn((sql: string, _params?: any[]) => {
      if (sql.includes('_prisma_migrations') && !sql.includes('LIMIT')) {
        return Promise.resolve({
          rows: sampleMigrations,
          rowCount: sampleMigrations.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      // Prefix check - return first migration from source
      if (sql.includes('LIMIT')) {
        return Promise.resolve({
          rows: [sampleMigrations[0]],
          rowCount: 1,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const targetQueryMock = vi.fn((sql: string) => {
      if (sql.includes('_prisma_migrations')) {
        return Promise.resolve({
          rows: targetMigrations,
          rowCount: targetMigrations.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const mockPoolSource = { query: sourceQueryMock } as any;
    const mockPoolTarget = { query: targetQueryMock } as any;

    const sourceVersion = await getVersion(mockPoolSource, 'DEV');
    const targetVersion = await getVersion(mockPoolTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPoolSource, mockPoolTarget);

    expect(comparison.status).toBe(VersionStatus.DIVERGED);
    expect(comparison.message).toContain('DIVERGENCE');
    expect(comparison.message).toContain('different migration histories');
  });
});

describe('compareVersions - BEHIND (Reversion)', () => {
  it('should return BEHIND when source has fewer migrations', async () => {
    const sourceMigrations = sampleMigrations.slice(0, 2);
    const mockPoolSource = createMockPoolWithMigrations(sourceMigrations);
    const mockPoolTarget = createMockPoolWithMigrations(sampleMigrations);

    const sourceVersion = await getVersion(mockPoolSource, 'DEV');
    const targetVersion = await getVersion(mockPoolTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPoolSource, mockPoolTarget);

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

    const mockPoolSource = createMockPoolWithMigrations(sampleMigrations);
    const mockPoolTarget = createMockPoolWithMigrations(divergedMigrations);

    const sourceVersion = await getVersion(mockPoolSource, 'DEV');
    const targetVersion = await getVersion(mockPoolTarget, 'PROD');

    const comparison = await compareVersions(sourceVersion, targetVersion, mockPoolSource, mockPoolTarget);

    expect(comparison.status).toBe(VersionStatus.DIVERGED);
    expect(comparison.migrationCountDiff).toBe(0);
    expect(comparison.message).toContain('same migration count');
    expect(comparison.message).toContain('different fingerprints');
  });
});

describe('handleReversion', () => {
  it('should detect reversion and block sync when DEV has fewer migrations', async () => {
    const devMigrations = sampleMigrations.slice(0, 2);
    
    // Create mock pool that tracks query calls
    const upsertCalls: any[] = [];
    const prodQueryMock = vi.fn((sql: string, params?: any[]) => {
      // getMigrations
      if (sql.includes('SELECT') && sql.includes('_prisma_migrations')) {
        return Promise.resolve({
          rows: sampleMigrations,
          rowCount: sampleMigrations.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      // upsertDbSyncState
      if (sql.includes('INSERT INTO "DbSyncState"') && sql.includes('ON CONFLICT')) {
        upsertCalls.push({ sql, params });
        return Promise.resolve({
          rows: [{
            source: params?.[0],
            target: params?.[1],
            status: params?.[2],
            lastSyncAt: params?.[3],
            lastError: params?.[4],
            createdAt: new Date(),
            updatedAt: new Date(),
          }],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const mockPoolDev = createMockPoolWithMigrations(devMigrations);
    const mockPoolProd = { query: prodQueryMock } as any;

    const devVersion = await getVersion(mockPoolDev, 'DEV');
    const prodVersion = await getVersion(mockPoolProd, 'PROD');

    const result = await handleReversion(devVersion, prodVersion, mockPoolProd);

    expect(result.reversionDetected).toBe(true);
    expect(result.syncBlocked).toBe(true);
    expect(result.devMigrationCount).toBe(2);
    expect(result.prodMigrationCount).toBe(3);
    expect(result.message).toContain('rolled back 1 migration');
    expect(result.message).toContain('catches up to 3 migrations');

    // Verify upsertDbSyncState was called with correct parameters
    expect(upsertCalls.length).toBeGreaterThan(0);
    const lastCall = upsertCalls[upsertCalls.length - 1];
    expect(lastCall.params[0]).toBe('DEV'); // source
    expect(lastCall.params[1]).toBe('PROD'); // target
    expect(lastCall.params[2]).toBe('WAITING_FOR_MASTER'); // status
    expect(lastCall.params[4]).toContain('Reversion detected'); // lastError
  });

  it('should return no reversion when DEV is ahead or in sync', async () => {
    const queryCallCount = { prod: 0 };
    
    const prodQueryMock = vi.fn((sql: string) => {
      queryCallCount.prod++;
      
      if (sql.includes('_prisma_migrations')) {
        return Promise.resolve({
          rows: sampleMigrations.slice(0, 2),
          rowCount: 2,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const mockPoolDev = createMockPoolWithMigrations(sampleMigrations);
    const mockPoolProd = { query: prodQueryMock } as any;

    const devVersion = await getVersion(mockPoolDev, 'DEV');
    const prodVersion = await getVersion(mockPoolProd, 'PROD');

    const result = await handleReversion(devVersion, prodVersion, mockPoolProd);

    expect(result.reversionDetected).toBe(false);
    expect(result.syncBlocked).toBe(false);
    expect(result.message).toContain('No reversion detected');

    // Verify upsertDbSyncState was NOT called (no additional queries beyond getMigrations)
    expect(queryCallCount.prod).toBe(1); // Only getMigrations, no upsert
  });
});

describe('recordVersion', () => {
  it('should create version record in db_version table', async () => {
    const createCalls: any[] = [];
    const queryMock = vi.fn((sql: string, params?: any[]) => {
      if (sql.includes('_prisma_migrations')) {
        return Promise.resolve({
          rows: sampleMigrations,
          rowCount: sampleMigrations.length,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      if (sql.includes('INSERT INTO "DbVersion"')) {
        createCalls.push({ sql, params });
        return Promise.resolve({
          rows: [{
            id: 1,
            versionFingerprint: params?.[0],
            migrationCount: params?.[1],
            lastMigrationName: params?.[2],
            lastMigrationAppliedAt: params?.[3],
            syncSource: params?.[4],
            createdAt: new Date(),
          }],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const mockPool = { query: queryMock } as any;
    const version = await getVersion(mockPool, 'DEV');

    await recordVersion(mockPool, version);

    expect(createCalls.length).toBe(1);
    const call = createCalls[0];
    expect(call.params[0]).toBe(version.fingerprint); // versionFingerprint
    expect(call.params[1]).toBe(3); // migrationCount
    expect(call.params[2]).toBe('20250103000000_add_pokemon'); // lastMigrationName
    expect(call.params[4]).toBe('DEV'); // syncSource
  });

  it('should handle empty version gracefully', async () => {
    const createCalls: any[] = [];
    const queryMock = vi.fn((sql: string, params?: any[]) => {
      if (sql.includes('_prisma_migrations')) {
        return Promise.resolve({
          rows: [],
          rowCount: 0,
          command: 'SELECT',
          oid: 0,
          fields: [],
        });
      }
      
      if (sql.includes('INSERT INTO "DbVersion"')) {
        createCalls.push({ sql, params });
        return Promise.resolve({
          rows: [{
            id: 1,
            versionFingerprint: '',
            migrationCount: 0,
            lastMigrationName: '',
            syncSource: 'EMPTY',
            createdAt: new Date(),
          }],
          rowCount: 1,
          command: 'INSERT',
          oid: 0,
          fields: [],
        });
      }
      
      return Promise.resolve({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
    });

    const mockPool = { query: queryMock } as any;
    const version = await getVersion(mockPool, 'EMPTY');

    await recordVersion(mockPool, version);

    expect(createCalls.length).toBe(1);
    const call = createCalls[0];
    expect(call.params[0]).toBe(''); // versionFingerprint
    expect(call.params[1]).toBe(0); // migrationCount
    expect(call.params[2]).toBe(''); // lastMigrationName
    expect(call.params[4]).toBe('EMPTY'); // syncSource
  });
});

describe('Fingerprint calculation edge cases', () => {
  it('should produce different fingerprints for different migration orders', async () => {
    const migrations1 = [sampleMigrations[0], sampleMigrations[1]];
    const migrations2 = [sampleMigrations[1], sampleMigrations[0]]; // Reversed order

    const mockPool1 = createMockPoolWithMigrations(migrations1);
    const mockPool2 = createMockPoolWithMigrations(migrations2);

    const version1 = await getVersion(mockPool1, 'TEST1');
    const version2 = await getVersion(mockPool2, 'TEST2');

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

    const mockPool1 = createMockPoolWithMigrations(migrations1);
    const mockPool2 = createMockPoolWithMigrations(migrations2);

    const version1 = await getVersion(mockPool1, 'TEST1');
    const version2 = await getVersion(mockPool2, 'TEST2');

    expect(version1.fingerprint).not.toBe(version2.fingerprint);
  });

  it('should produce same fingerprint for identical migrations', async () => {
    const mockPool1 = createMockPoolWithMigrations(sampleMigrations);
    const mockPool2 = createMockPoolWithMigrations(sampleMigrations);

    const version1 = await getVersion(mockPool1, 'TEST1');
    const version2 = await getVersion(mockPool2, 'TEST2');

    expect(version1.fingerprint).toBe(version2.fingerprint);
  });
});
