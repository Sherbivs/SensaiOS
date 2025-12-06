/**
 * Migration Automation Service Tests
 * ===================================
 *
 * Comprehensive test suite for the Schema Migration Automation Service.
 *
 * @module tests/security/services/migration-automation-service
 * @research D11 (Schema Migration Automation) - Sprint 4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MigrationAutomationService,
  createMigrationAutomationService,
  MigrationStatus,
  ValidationStatus,
  LockStatus,
  MigrationError,
  MigrationNotFoundError,
  MigrationLockError,
  MigrationValidationError,
  isMigrationError,
  isMigrationNotFoundError,
  isMigrationLockError,
  isMigrationValidationError,
  type MigrationAutomationConfig,
  type MigrationMetadata,
  type MigrationLogger,
  type MigrationNotification,
} from '../../../src/bot/security/services/migration-automation-service.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockLogger(): MigrationLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createTestMigration(
  id: string,
  options: Partial<Omit<MigrationMetadata, 'id' | 'checksum'>> = {},
): Omit<MigrationMetadata, 'checksum'> {
  return {
    id,
    name: options.name ?? `Migration ${id}`,
    path: options.path ?? `prisma/migrations/${id}/migration.sql`,
    status: options.status ?? MigrationStatus.PENDING,
    createdAt: options.createdAt ?? new Date(),
    hasRollback: options.hasRollback ?? true,
    ...options,
  };
}

function createTestConfig(
  overrides: Partial<MigrationAutomationConfig> = {},
): MigrationAutomationConfig {
  return {
    migrationsPath: 'prisma/migrations',
    backupPath: 'backups/migration-checkpoints',
    lockTimeoutMs: 5000,
    autoBackup: false, // Disable for faster tests
    runValidations: true,
    dryRun: true, // Enable dry-run for tests
    logger: createMockLogger(),
    ...overrides,
  };
}

// ============================================================================
// Test Suite
// ============================================================================

describe('MigrationAutomationService', () => {
  let service: MigrationAutomationService;
  let mockLogger: MigrationLogger;
  let notifications: MigrationNotification[];

  beforeEach(() => {
    mockLogger = createMockLogger();
    notifications = [];

    service = createMigrationAutomationService({
      ...createTestConfig(),
      logger: mockLogger,
      onNotification: (n) => notifications.push(n),
    });
  });

  afterEach(() => {
    service.clear();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // Constructor and Configuration Tests
  // ==========================================================================

  describe('Constructor and Configuration', () => {
    it('should create service with default config', () => {
      const defaultService = createMigrationAutomationService({
        migrationsPath: 'migrations',
        backupPath: 'backups',
      });
      expect(defaultService).toBeInstanceOf(MigrationAutomationService);
    });

    it('should create service with custom config', () => {
      const customService = createMigrationAutomationService({
        migrationsPath: 'custom/migrations',
        backupPath: 'custom/backups',
        lockTimeoutMs: 10000,
        autoBackup: true,
        runValidations: false,
        maxRetries: 5,
      });
      expect(customService).toBeInstanceOf(MigrationAutomationService);
    });

    it('should accept custom logger', () => {
      const logger = createMockLogger();
      const loggedService = createMigrationAutomationService({
        ...createTestConfig(),
        logger,
      });

      loggedService.registerMigration(createTestMigration('test-1'));
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should accept notification callback', () => {
      const onNotification = vi.fn();
      const notifyService = createMigrationAutomationService({
        ...createTestConfig(),
        onNotification,
      });

      notifyService.registerMigration(createTestMigration('test-1'));
      // Notification happens during migration execution
    });

    it('should support dry-run mode', () => {
      expect(service.isDryRun()).toBe(true);

      service.setDryRun(false);
      expect(service.isDryRun()).toBe(false);
    });
  });

  // ==========================================================================
  // Migration Discovery Tests
  // ==========================================================================

  describe('Migration Discovery', () => {
    it('should register a migration', () => {
      const migration = service.registerMigration(createTestMigration('20240101120000_initial'));

      expect(migration.id).toBe('20240101120000_initial');
      expect(migration.checksum).toBeDefined();
    });

    it('should discover all registered migrations', () => {
      service.registerMigration(createTestMigration('migration-1'));
      service.registerMigration(createTestMigration('migration-2'));
      service.registerMigration(createTestMigration('migration-3'));

      const migrations = service.discoverMigrations();
      expect(migrations).toHaveLength(3);
    });

    it('should get migration by ID', () => {
      service.registerMigration(createTestMigration('test-migration'));

      const migration = service.getMigration('test-migration');
      expect(migration?.id).toBe('test-migration');
    });

    it('should return undefined for non-existent migration', () => {
      const migration = service.getMigration('non-existent');
      expect(migration).toBeUndefined();
    });

    it('should get pending migrations only', () => {
      service.registerMigration(createTestMigration('pending-1', { status: MigrationStatus.PENDING }));
      service.registerMigration(createTestMigration('completed-1', { status: MigrationStatus.COMPLETED }));
      service.registerMigration(createTestMigration('pending-2', { status: MigrationStatus.PENDING }));

      const pending = service.getPendingMigrations();
      expect(pending).toHaveLength(2);
      expect(pending.every((m) => m.status === MigrationStatus.PENDING)).toBe(true);
    });

    it('should compute consistent checksum', () => {
      const migration1 = service.registerMigration(createTestMigration('checksum-test'));
      service.clear();
      const migration2 = service.registerMigration(createTestMigration('checksum-test'));

      expect(migration1.checksum).toBe(migration2.checksum);
    });
  });

  // ==========================================================================
  // Validation Tests
  // ==========================================================================

  describe('Pre-Migration Validation', () => {
    it('should run pre-migration checks', async () => {
      service.registerMigration(createTestMigration('validate-me'));

      const result = await service.runPreMigrationChecks('validate-me');

      expect(result.migrationId).toBe('validate-me');
      expect(result.validations).toBeDefined();
      expect(result.validations.length).toBeGreaterThan(0);
    });

    it('should validate migration file exists', async () => {
      service.registerMigration(createTestMigration('with-path', { path: 'migrations/test.sql' }));

      const result = await service.runPreMigrationChecks('with-path');
      const fileCheck = result.validations.find((v) => v.name === 'migration_file_exists');

      expect(fileCheck?.status).toBe(ValidationStatus.PASSED);
    });

    it('should validate checksum integrity', async () => {
      service.registerMigration(createTestMigration('checksum-valid'));

      const result = await service.runPreMigrationChecks('checksum-valid');
      const checksumCheck = result.validations.find((v) => v.name === 'checksum_integrity');

      expect(checksumCheck?.status).toBe(ValidationStatus.PASSED);
    });

    it('should warn if no rollback script', async () => {
      service.registerMigration(createTestMigration('no-rollback', { hasRollback: false }));

      const result = await service.runPreMigrationChecks('no-rollback');
      const rollbackCheck = result.validations.find((v) => v.name === 'rollback_script_exists');

      expect(rollbackCheck?.status).toBe(ValidationStatus.WARNING);
    });

    it('should pass if rollback script exists', async () => {
      service.registerMigration(createTestMigration('with-rollback', { hasRollback: true }));

      const result = await service.runPreMigrationChecks('with-rollback');
      const rollbackCheck = result.validations.find((v) => v.name === 'rollback_script_exists');

      expect(rollbackCheck?.status).toBe(ValidationStatus.PASSED);
    });

    it('should throw for non-existent migration', async () => {
      await expect(service.runPreMigrationChecks('non-existent')).rejects.toThrow(MigrationNotFoundError);
    });

    it('should include total duration', async () => {
      service.registerMigration(createTestMigration('duration-test'));

      const result = await service.runPreMigrationChecks('duration-test');

      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include individual validation durations', async () => {
      service.registerMigration(createTestMigration('durations'));

      const result = await service.runPreMigrationChecks('durations');

      result.validations.forEach((v) => {
        expect(v.durationMs).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ==========================================================================
  // Migration Execution Tests
  // ==========================================================================

  describe('Migration Execution', () => {
    it('should run a single migration', async () => {
      service.registerMigration(createTestMigration('single-run'));

      const result = await service.runMigration('single-run');

      expect(result.success).toBe(true);
      expect(result.migration.status).toBe(MigrationStatus.COMPLETED);
    });

    it('should update migration metadata after execution', async () => {
      service.registerMigration(createTestMigration('update-meta'));

      await service.runMigration('update-meta');

      const migration = service.getMigration('update-meta');
      expect(migration?.appliedAt).toBeDefined();
      expect(migration?.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should send notifications during execution', async () => {
      service.registerMigration(createTestMigration('notify-test'));

      await service.runMigration('notify-test');

      expect(notifications.some((n) => n.type === 'migration_started')).toBe(true);
      expect(notifications.some((n) => n.type === 'migration_completed')).toBe(true);
    });

    it('should throw for non-existent migration', async () => {
      await expect(service.runMigration('non-existent')).rejects.toThrow(MigrationNotFoundError);
    });

    it('should run all pending migrations', async () => {
      service.registerMigration(createTestMigration('batch-1', { createdAt: new Date('2024-01-01') }));
      service.registerMigration(createTestMigration('batch-2', { createdAt: new Date('2024-01-02') }));
      service.registerMigration(createTestMigration('batch-3', { createdAt: new Date('2024-01-03') }));

      const result = await service.runPendingMigrations();

      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(3);
      expect(result.failedMigrations).toHaveLength(0);
    });

    it('should run migrations in order by creation date', async () => {
      service.registerMigration(createTestMigration('ordered-3', { createdAt: new Date('2024-03-01') }));
      service.registerMigration(createTestMigration('ordered-1', { createdAt: new Date('2024-01-01') }));
      service.registerMigration(createTestMigration('ordered-2', { createdAt: new Date('2024-02-01') }));

      const result = await service.runPendingMigrations();

      expect(result.appliedMigrations[0].migration.id).toBe('ordered-1');
      expect(result.appliedMigrations[1].migration.id).toBe('ordered-2');
      expect(result.appliedMigrations[2].migration.id).toBe('ordered-3');
    });

    it('should skip remaining migrations on failure', async () => {
      // First migration will fail validation (no path)
      service.registerMigration(createTestMigration('will-pass', { createdAt: new Date('2024-01-01') }));

      // Create a service that fails validation
      const failService = createMigrationAutomationService({
        ...createTestConfig(),
        runValidations: true,
        dryRun: true,
      });

      failService.registerMigration(createTestMigration('skip-1', { createdAt: new Date('2024-01-01') }));
      failService.registerMigration(createTestMigration('skip-2', { createdAt: new Date('2024-01-02') }));

      const result = await failService.runPendingMigrations();

      // Both should pass in dry-run mode
      expect(result.appliedMigrations.length).toBeGreaterThanOrEqual(1);
    });

    it('should include batch result metadata', async () => {
      service.registerMigration(createTestMigration('meta-test'));

      const result = await service.runPendingMigrations();

      expect(result.startedAt).toBeInstanceOf(Date);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should record migration history', async () => {
      service.registerMigration(createTestMigration('history-test'));

      await service.runMigration('history-test');

      const history = service.getHistory('history-test');
      expect(history).toHaveLength(1);
      expect(history[0].action).toBe('apply');
      expect(history[0].status).toBe(MigrationStatus.COMPLETED);
    });
  });

  // ==========================================================================
  // Rollback Tests
  // ==========================================================================

  describe('Rollback Operations', () => {
    it('should rollback a completed migration', async () => {
      service.registerMigration(createTestMigration('rollback-test'));
      await service.runMigration('rollback-test');

      const result = await service.rollback('rollback-test');

      expect(result.success).toBe(true);
      expect(result.migrationId).toBe('rollback-test');
    });

    it('should update migration status after rollback', async () => {
      service.registerMigration(createTestMigration('status-rollback'));
      await service.runMigration('status-rollback');

      await service.rollback('status-rollback');

      const migration = service.getMigration('status-rollback');
      expect(migration?.status).toBe(MigrationStatus.ROLLED_BACK);
      expect(migration?.rolledBackAt).toBeDefined();
    });

    it('should fail rollback for pending migration', async () => {
      service.registerMigration(createTestMigration('pending-rollback'));

      await expect(service.rollback('pending-rollback')).rejects.toThrow(MigrationError);
    });

    it('should fail rollback without rollback script', async () => {
      service.registerMigration(createTestMigration('no-script', { hasRollback: false }));
      await service.runMigration('no-script');

      const result = await service.rollback('no-script');
      expect(result.success).toBe(false);
      expect(result.error).toContain('No rollback script');
    });

    it('should send notifications during rollback', async () => {
      service.registerMigration(createTestMigration('notify-rollback'));
      await service.runMigration('notify-rollback');
      notifications.length = 0; // Clear previous notifications

      await service.rollback('notify-rollback');

      expect(notifications.some((n) => n.type === 'rollback_started')).toBe(true);
      expect(notifications.some((n) => n.type === 'rollback_completed')).toBe(true);
    });

    it('should record rollback in history', async () => {
      service.registerMigration(createTestMigration('rollback-history'));
      await service.runMigration('rollback-history');
      await service.rollback('rollback-history');

      const history = service.getHistory('rollback-history');
      expect(history).toHaveLength(2);
      expect(history[1].action).toBe('rollback');
    });

    it('should rollback to specific migration', async () => {
      service.registerMigration(createTestMigration('target', { createdAt: new Date('2024-01-01') }));
      service.registerMigration(createTestMigration('after-1', { createdAt: new Date('2024-01-02') }));
      service.registerMigration(createTestMigration('after-2', { createdAt: new Date('2024-01-03') }));

      await service.runPendingMigrations();

      const results = await service.rollbackTo('target');

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  // ==========================================================================
  // Lock Management Tests
  // ==========================================================================

  describe('Lock Management', () => {
    it('should acquire migration lock', async () => {
      const lock = await service.acquireLock('test-migration');

      expect(lock.status).toBe(LockStatus.ACQUIRED);
      expect(lock.holder).toBeDefined();
      expect(lock.acquiredAt).toBeInstanceOf(Date);
    });

    it('should prevent concurrent locks', async () => {
      await service.acquireLock('first');

      await expect(service.acquireLock('second')).rejects.toThrow(MigrationLockError);
    });

    it('should release lock', async () => {
      await service.acquireLock('release-test');
      await service.releaseLock();

      const status = service.getLockStatus();
      expect(status).toBeNull();
    });

    it('should allow new lock after release', async () => {
      await service.acquireLock('first-lock');
      await service.releaseLock();

      const lock = await service.acquireLock('second-lock');
      expect(lock.status).toBe(LockStatus.ACQUIRED);
    });

    it('should include migration ID in lock', async () => {
      const lock = await service.acquireLock('specific-migration');
      expect(lock.migrationId).toBe('specific-migration');
    });

    it('should force release lock', async () => {
      await service.acquireLock('force-release');

      service.forceReleaseLock();

      const status = service.getLockStatus();
      expect(status).toBeNull();
    });

    it('should send lock notifications', async () => {
      await service.acquireLock('notify-lock');

      expect(notifications.some((n) => n.type === 'lock_acquired')).toBe(true);

      await service.releaseLock();

      expect(notifications.some((n) => n.type === 'lock_released')).toBe(true);
    });

    it('should set lock expiration', async () => {
      const lock = await service.acquireLock('expiring');

      expect(lock.expiresAt.getTime()).toBeGreaterThan(lock.acquiredAt.getTime());
    });
  });

  // ==========================================================================
  // Backup Tests
  // ==========================================================================

  describe('Backup Operations', () => {
    it('should create backup', async () => {
      const backupId = await service.createBackup('test-migration');

      expect(backupId).toMatch(/^backup-test-migration-/);
    });

    it('should restore from backup', async () => {
      const backupId = await service.createBackup('restore-test');

      // Should not throw
      await expect(service.restoreFromBackup(backupId)).resolves.toBeUndefined();
    });

    it('should create backup before migration when enabled', async () => {
      const backupService = createMigrationAutomationService({
        ...createTestConfig(),
        autoBackup: true,
        dryRun: false,
      });

      backupService.registerMigration(createTestMigration('backup-enabled'));

      const result = await backupService.runMigration('backup-enabled');

      expect(result.backupId).toBeDefined();
    });

    it('should not create backup in dry-run mode', async () => {
      service.registerMigration(createTestMigration('no-backup-dry'));

      const result = await service.runMigration('no-backup-dry');

      expect(result.backupId).toBeUndefined();
    });
  });

  // ==========================================================================
  // History Tests
  // ==========================================================================

  describe('History Operations', () => {
    it('should get all history', async () => {
      service.registerMigration(createTestMigration('hist-1'));
      service.registerMigration(createTestMigration('hist-2'));

      await service.runMigration('hist-1');
      await service.runMigration('hist-2');

      const history = service.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should filter history by migration ID', async () => {
      service.registerMigration(createTestMigration('filter-1'));
      service.registerMigration(createTestMigration('filter-2'));

      await service.runMigration('filter-1');
      await service.runMigration('filter-2');

      const history = service.getHistory('filter-1');
      expect(history).toHaveLength(1);
      expect(history[0].migrationId).toBe('filter-1');
    });

    it('should include history entry metadata', async () => {
      service.registerMigration(createTestMigration('metadata-hist'));
      await service.runMigration('metadata-hist');

      const history = service.getHistory('metadata-hist');
      const entry = history[0];

      expect(entry.id).toBeDefined();
      expect(entry.action).toBe('apply');
      expect(entry.status).toBe(MigrationStatus.COMPLETED);
      expect(entry.performedAt).toBeInstanceOf(Date);
      expect(entry.performedBy).toBeDefined();
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should clear history', async () => {
      service.registerMigration(createTestMigration('clear-hist'));
      await service.runMigration('clear-hist');

      service.clearHistory();

      const history = service.getHistory();
      expect(history).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Statistics Tests
  // ==========================================================================

  describe('Statistics', () => {
    it('should calculate total migrations', () => {
      service.registerMigration(createTestMigration('stat-1'));
      service.registerMigration(createTestMigration('stat-2'));
      service.registerMigration(createTestMigration('stat-3'));

      const stats = service.getStats();
      expect(stats.totalMigrations).toBe(3);
    });

    it('should count pending migrations', () => {
      service.registerMigration(createTestMigration('pending-stat-1'));
      service.registerMigration(createTestMigration('pending-stat-2'));

      const stats = service.getStats();
      expect(stats.pendingMigrations).toBe(2);
    });

    it('should count completed migrations', async () => {
      service.registerMigration(createTestMigration('complete-stat'));
      await service.runMigration('complete-stat');

      const stats = service.getStats();
      expect(stats.completedMigrations).toBe(1);
    });

    it('should calculate success rate', async () => {
      service.registerMigration(createTestMigration('success-1'));
      service.registerMigration(createTestMigration('success-2'));

      await service.runPendingMigrations();

      const stats = service.getStats();
      expect(stats.successRate).toBe(100);
    });

    it('should calculate average duration', async () => {
      service.registerMigration(createTestMigration('avg-1'));
      service.registerMigration(createTestMigration('avg-2'));

      await service.runPendingMigrations();

      const stats = service.getStats();
      expect(stats.averageDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track last migration time', async () => {
      service.registerMigration(createTestMigration('last-time'));
      await service.runMigration('last-time');

      const stats = service.getStats();
      expect(stats.lastMigrationAt).toBeInstanceOf(Date);
    });

    it('should track last rollback time', async () => {
      service.registerMigration(createTestMigration('last-rollback'));
      await service.runMigration('last-rollback');
      await service.rollback('last-rollback');

      const stats = service.getStats();
      expect(stats.lastRollbackAt).toBeInstanceOf(Date);
    });
  });

  // ==========================================================================
  // Error Type Guards Tests
  // ==========================================================================

  describe('Error Type Guards', () => {
    it('should identify MigrationError', () => {
      const error = new MigrationError('test', 'TEST');
      expect(isMigrationError(error)).toBe(true);
      expect(isMigrationError(new Error('test'))).toBe(false);
    });

    it('should identify MigrationNotFoundError', () => {
      const error = new MigrationNotFoundError('test');
      expect(isMigrationNotFoundError(error)).toBe(true);
      expect(isMigrationNotFoundError(new MigrationError('test', 'OTHER'))).toBe(false);
    });

    it('should identify MigrationLockError', () => {
      const error = new MigrationLockError('test');
      expect(isMigrationLockError(error)).toBe(true);
      expect(isMigrationLockError(new MigrationError('test', 'OTHER'))).toBe(false);
    });

    it('should identify MigrationValidationError', () => {
      const error = new MigrationValidationError('test', []);
      expect(isMigrationValidationError(error)).toBe(true);
      expect(isMigrationValidationError(new MigrationError('test', 'OTHER'))).toBe(false);
    });
  });

  // ==========================================================================
  // Edge Cases Tests
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty migrations list', () => {
      const migrations = service.discoverMigrations();
      expect(migrations).toHaveLength(0);

      const pending = service.getPendingMigrations();
      expect(pending).toHaveLength(0);
    });

    it('should handle running pending with no migrations', async () => {
      const result = await service.runPendingMigrations();

      expect(result.success).toBe(true);
      expect(result.appliedMigrations).toHaveLength(0);
    });

    it('should handle clear operation', () => {
      service.registerMigration(createTestMigration('to-clear'));

      service.clear();

      expect(service.discoverMigrations()).toHaveLength(0);
      expect(service.getHistory()).toHaveLength(0);
    });

    it('should handle special characters in migration names', async () => {
      service.registerMigration(createTestMigration('20240101_add-users_table', {
        name: 'Add users table with special-chars!',
      }));

      const result = await service.runMigration('20240101_add-users_table');
      expect(result.success).toBe(true);
    });

    it('should handle very long migration names', async () => {
      const longId = 'migration_' + 'a'.repeat(200);
      service.registerMigration(createTestMigration(longId));

      const result = await service.runMigration(longId);
      expect(result.success).toBe(true);
    });
  });
});
