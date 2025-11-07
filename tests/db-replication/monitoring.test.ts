/**
 * Monitoring & Alerting Tests
 * 
 * Tests for replication metrics calculation and alert threshold detection.
 */

import type { PrismaClient } from '@prisma/client';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getReplicationMetrics,
  checkAlertThresholds,
  formatMetrics,
  type ReplicationMetrics,
} from '../../src/services/db-replication/monitoring';
import * as versionModule from '../../src/services/db-replication/version';

// Mock Prisma clients
function createMockPrismaClient(_name: string): PrismaClient {  // Prefixed with _ to indicate intentionally unused
  return {
    $queryRaw: vi.fn(),
    $disconnect: vi.fn(),
  } as unknown as PrismaClient;
}

describe('getReplicationMetrics', () => {
  let devPrisma: PrismaClient;
  let prodPrisma: PrismaClient;
  let localPrisma: PrismaClient;

  beforeEach(() => {
    devPrisma = createMockPrismaClient('DEV');
    prodPrisma = createMockPrismaClient('PROD');
    localPrisma = createMockPrismaClient('LOCAL');
    vi.clearAllMocks();
  });

  it('should calculate metrics when all environments in sync', async () => {
    const mockVersion = {
      fingerprint: 'abc123def456',
      migrationCount: 10,
      lastMigrationName: 'migration_10',
      lastMigrationAppliedAt: new Date(),
      source: 'DEV',
    };

    vi.spyOn(versionModule, 'getVersion')
      .mockResolvedValueOnce(mockVersion) // DEV
      .mockResolvedValueOnce(mockVersion) // PROD
      .mockResolvedValueOnce(mockVersion); // LOCAL

    const metrics = await getReplicationMetrics(devPrisma, prodPrisma, localPrisma);

    expect(metrics.devToProd.versionLag).toBe(0);
    expect(metrics.devToProd.syncStatus).toBe('IN_SYNC');
    expect(metrics.prodToLocal.versionLag).toBe(0);
    expect(metrics.prodToLocal.syncStatus).toBe('IN_SYNC');
    expect(metrics.versionFingerprints.dev).toBe('abc123def456'.slice(0, 16));
    expect(metrics.versionFingerprints.prod).toBe('abc123def456'.slice(0, 16));
  });

  it('should calculate lag when Prod is behind DEV', async () => {
    const devVersion = {
      fingerprint: 'new123',
      migrationCount: 15,
      lastMigrationName: 'migration_15',
      lastMigrationAppliedAt: new Date(),
      source: 'DEV',
    };

    const prodVersion = {
      fingerprint: 'old123',
      migrationCount: 12,
      lastMigrationName: 'migration_12',
      lastMigrationAppliedAt: new Date(),
      source: 'PROD',
    };

    const localVersion = {
      fingerprint: 'old123',
      migrationCount: 12,
      lastMigrationName: 'migration_12',
      lastMigrationAppliedAt: new Date(),
      source: 'LOCAL',
    };

    vi.spyOn(versionModule, 'getVersion')
      .mockResolvedValueOnce(devVersion)
      .mockResolvedValueOnce(prodVersion)
      .mockResolvedValueOnce(localVersion);

    const metrics = await getReplicationMetrics(devPrisma, prodPrisma, localPrisma);

    expect(metrics.devToProd.versionLag).toBe(3); // 15 - 12
    expect(metrics.devToProd.syncStatus).toBe('LAGGING'); // lag <= 5
    expect(metrics.prodToLocal.versionLag).toBe(0); // Prod and Local match
  });

  it('should calculate UNKNOWN status when Local is unavailable', async () => {
    const devVersion = {
      fingerprint: 'dev123',
      migrationCount: 10,
      lastMigrationName: 'migration_10',
      lastMigrationAppliedAt: new Date(),
      source: 'DEV',
    };

    const prodVersion = {
      fingerprint: 'prod123',
      migrationCount: 10,
      lastMigrationName: 'migration_10',
      lastMigrationAppliedAt: new Date(),
      source: 'PROD',
    };

    vi.spyOn(versionModule, 'getVersion')
      .mockResolvedValueOnce(devVersion)
      .mockResolvedValueOnce(prodVersion);

    const metrics = await getReplicationMetrics(devPrisma, prodPrisma, null);

    expect(metrics.prodToLocal.syncStatus).toBe('UNKNOWN');
    expect(metrics.versionFingerprints.local).toBe('N/A');
  });

  it('should detect ERROR status when lag > 5', async () => {
    const devVersion = {
      fingerprint: 'latest',
      migrationCount: 20,
      lastMigrationName: 'migration_20',
      lastMigrationAppliedAt: new Date(),
      source: 'DEV',
    };

    const prodVersion = {
      fingerprint: 'old',
      migrationCount: 12,
      lastMigrationName: 'migration_12',
      lastMigrationAppliedAt: new Date(),
      source: 'PROD',
    };

    vi.spyOn(versionModule, 'getVersion')
      .mockResolvedValueOnce(devVersion)
      .mockResolvedValueOnce(prodVersion)
      .mockResolvedValueOnce(prodVersion);

    const metrics = await getReplicationMetrics(devPrisma, prodPrisma, localPrisma);

    expect(metrics.devToProd.versionLag).toBe(8);
    expect(metrics.devToProd.syncStatus).toBe('ERROR'); // lag > 5
  });
});

describe('checkAlertThresholds', () => {
  it('should generate WARNING alert for moderate lag (5-10)', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 5000,
        versionLag: 7, // WARNING threshold
        syncStatus: 'LAGGING',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123',
        prod: 'old456',
        local: 'old456',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    const lagAlert = alerts.find(a => a.title.includes('Version Lag'));
    expect(lagAlert).toBeDefined();
    expect(lagAlert?.severity).toBe('WARNING');
    expect(lagAlert?.escalate).toBe(false);
  });

  it('should generate ERROR alert for critical lag (>10)', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 5000,
        versionLag: 15, // ERROR threshold
        syncStatus: 'ERROR',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'latest',
        prod: 'very_old',
        local: 'very_old',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    const criticalAlert = alerts.find(a => a.title.includes('Critical Version Lag'));
    expect(criticalAlert).toBeDefined();
    expect(criticalAlert?.severity).toBe('ERROR');
    expect(criticalAlert?.escalate).toBe(true);
  });

  it('should generate CRITICAL alert for diverged fingerprints', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 5000,
        versionLag: 0, // Same count but different fingerprints!
        syncStatus: 'ERROR',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123_different',
        prod: 'xyz789_different',
        local: 'xyz789_different',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    const divergenceAlert = alerts.find(a => a.title.includes('Divergence'));
    expect(divergenceAlert).toBeDefined();
    expect(divergenceAlert?.severity).toBe('CRITICAL');
    expect(divergenceAlert?.escalate).toBe(true);
  });

  it('should generate ERROR alert for sync failure', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 5000,
        versionLag: 3,
        syncStatus: 'ERROR',
        lastError: 'Migration failed at stage 3',
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123',
        prod: 'old456',
        local: 'old456',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    const syncFailureAlert = alerts.find(a => a.title.includes('Sync Failed'));
    expect(syncFailureAlert).toBeDefined();
    expect(syncFailureAlert?.severity).toBe('ERROR');
    expect(syncFailureAlert?.message).toContain('Migration failed');
  });

  it('should generate WARNING alert for blocked sync', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 5000,
        versionLag: 2,
        syncStatus: 'BLOCKED',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123',
        prod: 'old456',
        local: 'old456',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    const blockedAlert = alerts.find(a => a.title.includes('Sync Blocked'));
    expect(blockedAlert).toBeDefined();
    expect(blockedAlert?.severity).toBe('WARNING');
  });

  it('should generate WARNING alert for slow sync (>10min)', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 720000, // 12 minutes
        versionLag: 1,
        syncStatus: 'LAGGING',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123',
        prod: 'old456',
        local: 'old456',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    const slowAlert = alerts.find(a => a.title.includes('Slow Sync'));
    expect(slowAlert).toBeDefined();
    expect(slowAlert?.severity).toBe('WARNING');
    expect(slowAlert?.message).toContain('720s');
  });

  it('should generate ERROR alert for integrity failure', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 5000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123',
        prod: 'abc123',
        local: 'abc123',
      },
      integrityStatus: {
        devProdSchema: 'FAIL', // Integrity failure
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    const integrityAlert = alerts.find(a => a.title.includes('Schema Integrity Failed'));
    expect(integrityAlert).toBeDefined();
    expect(integrityAlert?.severity).toBe('ERROR');
    expect(integrityAlert?.escalate).toBe(true);
  });

  it('should return no alerts when everything is healthy', async () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date(),
        lastSyncDuration: 5000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date(),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123',
        prod: 'abc123',
        local: 'abc123',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date(),
      },
      capturedAt: new Date(),
    };

    const alerts = await checkAlertThresholds(metrics);

    expect(alerts).toHaveLength(0);
  });
});

describe('formatMetrics', () => {
  it('should format metrics for display', () => {
    const metrics: ReplicationMetrics = {
      devToProd: {
        lastSyncAt: new Date('2025-11-06T20:00:00Z'),
        lastSyncDuration: 5000,
        versionLag: 2,
        syncStatus: 'LAGGING',
        lastError: null,
      },
      prodToLocal: {
        lastSyncAt: new Date('2025-11-06T19:00:00Z'),
        lastSyncDuration: 3000,
        versionLag: 0,
        syncStatus: 'IN_SYNC',
        lastError: null,
      },
      versionFingerprints: {
        dev: 'abc123def456',
        prod: 'old789ghi012',
        local: 'old789ghi012',
      },
      integrityStatus: {
        devProdSchema: 'PASS',
        prodLocalSchema: 'PASS',
        lastCheckedAt: new Date('2025-11-06T20:00:00Z'),
      },
      capturedAt: new Date('2025-11-06T20:30:00Z'),
    };

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain('Database Replication Metrics');
    expect(formatted).toContain('DEV → Prod');
    expect(formatted).toContain('Lag: 2 migrations');
    expect(formatted).toContain('⏳ LAGGING');
    expect(formatted).toContain('Prod → Local');
    expect(formatted).toContain('✅ IN SYNC');
    expect(formatted).toContain('Version Fingerprints');
    expect(formatted).toContain('abc123def456');
  });
});
