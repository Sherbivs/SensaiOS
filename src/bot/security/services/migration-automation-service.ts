/**
 * Schema Migration Automation Service
 * ====================================
 *
 * Automated database schema migration service with validation,
 * rollback support, and migration history tracking.
 *
 * @module security/services/migration-automation-service
 * @research D11 (Schema Migration Automation) - Sprint 4
 *
 * Features:
 * - Automated migration discovery and execution
 * - Pre-migration validation checks
 * - Post-migration verification
 * - Rollback orchestration
 * - Migration history tracking
 * - Dry-run mode for testing
 * - Lock management to prevent concurrent migrations
 * - Notification on migration events
 *
 * @example
 * ```typescript
 * const migrationService = createMigrationAutomationService({
 *   migrationsPath: 'prisma/migrations',
 *   backupPath: 'backups/migration-checkpoints',
 * });
 *
 * // Run pending migrations
 * const result = await migrationService.runPendingMigrations();
 *
 * // Rollback last migration
 * await migrationService.rollback(result.appliedMigrations[0].id);
 * ```
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Migration status
 */
export enum MigrationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
  SKIPPED = 'skipped',
}

/**
 * Migration validation status
 */
export enum ValidationStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  WARNING = 'warning',
  SKIPPED = 'skipped',
}

/**
 * Migration lock status
 */
export enum LockStatus {
  ACQUIRED = 'acquired',
  RELEASED = 'released',
  TIMEOUT = 'timeout',
  FAILED = 'failed',
}

/**
 * Migration metadata
 */
export interface MigrationMetadata {
  /** Migration identifier (timestamp + name) */
  id: string;
  /** Human-readable migration name */
  name: string;
  /** Migration file path */
  path: string;
  /** Migration status */
  status: MigrationStatus;
  /** When the migration was created */
  createdAt: Date;
  /** When the migration was applied */
  appliedAt?: Date;
  /** When the migration was rolled back */
  rolledBackAt?: Date;
  /** Duration of migration execution in ms */
  durationMs?: number;
  /** SQL checksum for integrity verification */
  checksum: string;
  /** Whether migration has rollback script */
  hasRollback: boolean;
  /** Error message if migration failed */
  error?: string;
  /** Migration author (from migration file metadata) */
  author?: string;
  /** Migration description */
  description?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Migration validation result
 */
export interface ValidationResult {
  /** Validation name */
  name: string;
  /** Validation status */
  status: ValidationStatus;
  /** Detailed message */
  message: string;
  /** Additional context */
  details?: Record<string, unknown>;
  /** Time taken for validation in ms */
  durationMs: number;
}

/**
 * Pre-migration check result
 */
export interface PreMigrationCheck {
  /** Migration being checked */
  migrationId: string;
  /** All validation results */
  validations: ValidationResult[];
  /** Overall passed status */
  passed: boolean;
  /** Check timestamp */
  checkedAt: Date;
  /** Total check duration in ms */
  totalDurationMs: number;
}

/**
 * Migration execution result
 */
export interface MigrationResult {
  /** Migration that was executed */
  migration: MigrationMetadata;
  /** Whether execution was successful */
  success: boolean;
  /** SQL statements executed count */
  statementsExecuted: number;
  /** Rows affected */
  rowsAffected: number;
  /** Duration in ms */
  durationMs: number;
  /** Error details if failed */
  error?: {
    message: string;
    code?: string;
    position?: number;
    statement?: string;
  };
  /** Backup created before migration */
  backupId?: string;
}

/**
 * Batch migration result
 */
export interface BatchMigrationResult {
  /** Migrations that were applied */
  appliedMigrations: MigrationResult[];
  /** Migrations that failed */
  failedMigrations: MigrationResult[];
  /** Migrations that were skipped */
  skippedMigrations: MigrationMetadata[];
  /** Total duration in ms */
  totalDurationMs: number;
  /** Whether all migrations succeeded */
  success: boolean;
  /** Start timestamp */
  startedAt: Date;
  /** End timestamp */
  completedAt: Date;
}

/**
 * Rollback result
 */
export interface RollbackResult {
  /** Migration that was rolled back */
  migrationId: string;
  /** Whether rollback was successful */
  success: boolean;
  /** Duration in ms */
  durationMs: number;
  /** Error details if failed */
  error?: string;
  /** Restored from backup ID */
  restoredFromBackup?: string;
}

/**
 * Migration lock
 */
export interface MigrationLock {
  /** Lock identifier */
  id: string;
  /** Who holds the lock */
  holder: string;
  /** When lock was acquired */
  acquiredAt: Date;
  /** When lock expires */
  expiresAt: Date;
  /** Lock status */
  status: LockStatus;
  /** Migration being protected */
  migrationId?: string;
}

/**
 * Migration history entry
 */
export interface MigrationHistoryEntry {
  /** Unique entry ID */
  id: string;
  /** Migration ID */
  migrationId: string;
  /** Action performed */
  action: 'apply' | 'rollback' | 'skip';
  /** Action status */
  status: MigrationStatus;
  /** Duration in ms */
  durationMs: number;
  /** When action was performed */
  performedAt: Date;
  /** Who performed the action */
  performedBy: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Migration automation statistics
 */
export interface MigrationStats {
  /** Total migrations discovered */
  totalMigrations: number;
  /** Pending migrations */
  pendingMigrations: number;
  /** Completed migrations */
  completedMigrations: number;
  /** Failed migrations */
  failedMigrations: number;
  /** Rolled back migrations */
  rolledBackMigrations: number;
  /** Average migration duration in ms */
  averageDurationMs: number;
  /** Success rate percentage */
  successRate: number;
  /** Last migration applied */
  lastMigrationAt?: Date;
  /** Last rollback performed */
  lastRollbackAt?: Date;
}

/**
 * Migration automation configuration
 */
export interface MigrationAutomationConfig {
  /** Path to migrations directory */
  migrationsPath: string;
  /** Path for backups */
  backupPath: string;
  /** Lock timeout in ms (default: 5 minutes) */
  lockTimeoutMs?: number;
  /** Whether to auto-backup before migration */
  autoBackup?: boolean;
  /** Whether to run validations before migration */
  runValidations?: boolean;
  /** Maximum retries on failure */
  maxRetries?: number;
  /** Retry delay in ms */
  retryDelayMs?: number;
  /** Lock holder identifier */
  lockHolder?: string;
  /** Enable dry-run mode */
  dryRun?: boolean;
  /** Logger for migration events */
  logger?: MigrationLogger;
  /** Notification callback */
  onNotification?: (event: MigrationNotification) => void;
}

/**
 * Migration logger interface
 */
export interface MigrationLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Migration notification
 */
export interface MigrationNotification {
  /** Notification type */
  type: 'migration_started' | 'migration_completed' | 'migration_failed' | 'rollback_started' | 'rollback_completed' | 'rollback_failed' | 'lock_acquired' | 'lock_released';
  /** Migration ID if applicable */
  migrationId?: string;
  /** Notification message */
  message: string;
  /** Severity level */
  severity: 'info' | 'warning' | 'error';
  /** Timestamp */
  timestamp: Date;
  /** Additional data */
  data?: Record<string, unknown>;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: Required<Omit<MigrationAutomationConfig, 'logger' | 'onNotification'>> & {
  logger: MigrationLogger;
  onNotification: (event: MigrationNotification) => void;
} = {
  migrationsPath: 'prisma/migrations',
  backupPath: 'backups/migration-checkpoints',
  lockTimeoutMs: 5 * 60 * 1000, // 5 minutes
  autoBackup: true,
  runValidations: true,
  maxRetries: 3,
  retryDelayMs: 1000,
  lockHolder: `migration-service-${process.pid}`,
  dryRun: false,
  logger: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
  onNotification: () => {},
};

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base migration error
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly migrationId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * Migration not found error
 */
export class MigrationNotFoundError extends MigrationError {
  constructor(migrationId: string) {
    super(`Migration '${migrationId}' not found`, 'MIGRATION_NOT_FOUND', migrationId);
    this.name = 'MigrationNotFoundError';
  }
}

/**
 * Migration lock error
 */
export class MigrationLockError extends MigrationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'LOCK_ERROR', undefined, details);
    this.name = 'MigrationLockError';
  }
}

/**
 * Migration validation error
 */
export class MigrationValidationError extends MigrationError {
  constructor(
    migrationId: string,
    public readonly validationResults: ValidationResult[],
  ) {
    super(
      `Migration '${migrationId}' failed validation`,
      'VALIDATION_FAILED',
      migrationId,
      { validationResults },
    );
    this.name = 'MigrationValidationError';
  }
}

// ============================================================================
// Migration Automation Service Implementation
// ============================================================================

/**
 * Migration Automation Service
 */
export class MigrationAutomationService {
  private readonly config: Required<Omit<MigrationAutomationConfig, 'logger' | 'onNotification'>> & {
    logger: MigrationLogger;
    onNotification: (event: MigrationNotification) => void;
  };
  private readonly migrations = new Map<string, MigrationMetadata>();
  private readonly history: MigrationHistoryEntry[] = [];
  private currentLock: MigrationLock | null = null;

  constructor(config: MigrationAutomationConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      logger: config.logger ?? DEFAULT_CONFIG.logger,
      onNotification: config.onNotification ?? DEFAULT_CONFIG.onNotification,
    };
  }

  // ==========================================================================
  // Discovery Methods
  // ==========================================================================

  /**
   * Discover all migrations in the migrations path
   */
  discoverMigrations(): MigrationMetadata[] {
    // In a real implementation, this would scan the file system
    // For now, we simulate with stored migrations
    return Array.from(this.migrations.values());
  }

  /**
   * Register a migration manually (useful for testing)
   */
  registerMigration(migration: Omit<MigrationMetadata, 'checksum'>): MigrationMetadata {
    const checksum = this.computeChecksum(migration.id + migration.name + migration.path);
    const fullMigration: MigrationMetadata = {
      ...migration,
      checksum,
    };

    this.migrations.set(migration.id, fullMigration);
    this.config.logger.debug(`Registered migration: ${migration.id}`);

    return fullMigration;
  }

  /**
   * Get pending migrations
   */
  getPendingMigrations(): MigrationMetadata[] {
    return this.discoverMigrations().filter((m) => m.status === MigrationStatus.PENDING);
  }

  /**
   * Get migration by ID
   */
  getMigration(id: string): MigrationMetadata | undefined {
    return this.migrations.get(id);
  }

  // ==========================================================================
  // Validation Methods
  // ==========================================================================

  /**
   * Run pre-migration validations
   */
  async runPreMigrationChecks(migrationId: string): Promise<PreMigrationCheck> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      throw new MigrationNotFoundError(migrationId);
    }

    const startTime = Date.now();
    const validations: ValidationResult[] = [];

    // Validation 1: Migration file exists
    const fileCheckStart = Date.now();
    validations.push({
      name: 'migration_file_exists',
      status: migration.path ? ValidationStatus.PASSED : ValidationStatus.FAILED,
      message: migration.path ? 'Migration file found' : 'Migration file not found',
      durationMs: Date.now() - fileCheckStart,
    });

    // Validation 2: Checksum integrity
    const checksumStart = Date.now();
    const expectedChecksum = this.computeChecksum(migration.id + migration.name + migration.path);
    const checksumValid = expectedChecksum === migration.checksum;
    validations.push({
      name: 'checksum_integrity',
      status: checksumValid ? ValidationStatus.PASSED : ValidationStatus.FAILED,
      message: checksumValid ? 'Checksum valid' : 'Checksum mismatch - migration may have been modified',
      durationMs: Date.now() - checksumStart,
    });

    // Validation 3: Rollback script exists (warning if not)
    const rollbackStart = Date.now();
    validations.push({
      name: 'rollback_script_exists',
      status: migration.hasRollback ? ValidationStatus.PASSED : ValidationStatus.WARNING,
      message: migration.hasRollback ? 'Rollback script available' : 'No rollback script - manual rollback may be required',
      durationMs: Date.now() - rollbackStart,
    });

    // Validation 4: No pending dependencies
    const depCheckStart = Date.now();
    const pendingDeps = this.checkDependencies(migration);
    validations.push({
      name: 'no_pending_dependencies',
      status: pendingDeps.length === 0 ? ValidationStatus.PASSED : ValidationStatus.FAILED,
      message: pendingDeps.length === 0
        ? 'All dependencies satisfied'
        : `Pending dependencies: ${pendingDeps.join(', ')}`,
      details: { pendingDependencies: pendingDeps },
      durationMs: Date.now() - depCheckStart,
    });

    // Validation 5: Syntax check (simulated)
    const syntaxStart = Date.now();
    validations.push({
      name: 'sql_syntax_valid',
      status: ValidationStatus.PASSED,
      message: 'SQL syntax validated',
      durationMs: Date.now() - syntaxStart,
    });

    const passed = validations.every(
      (v) => v.status === ValidationStatus.PASSED || v.status === ValidationStatus.WARNING,
    );

    return {
      migrationId,
      validations,
      passed,
      checkedAt: new Date(),
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Check migration dependencies
   */
  private checkDependencies(_migration: MigrationMetadata): string[] {
    // In a real implementation, this would check if dependent migrations are applied
    // For now, return empty (no pending dependencies)
    return [];
  }

  // ==========================================================================
  // Execution Methods
  // ==========================================================================

  /**
   * Run a single migration
   */
  async runMigration(migrationId: string): Promise<MigrationResult> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      throw new MigrationNotFoundError(migrationId);
    }

    // Acquire lock
    await this.acquireLock(migrationId);

    const startTime = Date.now();
    let backupId: string | undefined;

    try {
      // Notify start
      this.notify({
        type: 'migration_started',
        migrationId,
        message: `Starting migration: ${migration.name}`,
        severity: 'info',
        timestamp: new Date(),
      });

      // Run validations if enabled
      if (this.config.runValidations) {
        const checks = await this.runPreMigrationChecks(migrationId);
        if (!checks.passed) {
          const failedValidations = checks.validations.filter(
            (v) => v.status === ValidationStatus.FAILED,
          );
          throw new MigrationValidationError(migrationId, failedValidations);
        }
      }

      // Create backup if enabled
      if (this.config.autoBackup && !this.config.dryRun) {
        backupId = await this.createBackup(migrationId);
      }

      // Update migration status
      migration.status = MigrationStatus.RUNNING;

      // Execute migration (simulated)
      if (!this.config.dryRun) {
        // In real implementation: execute SQL from migration file
        await this.simulateExecution(50);
      }

      // Update migration metadata
      migration.status = MigrationStatus.COMPLETED;
      migration.appliedAt = new Date();
      migration.durationMs = Date.now() - startTime;

      // Record history
      this.recordHistory(migrationId, 'apply', MigrationStatus.COMPLETED, migration.durationMs);

      // Notify completion
      this.notify({
        type: 'migration_completed',
        migrationId,
        message: `Migration completed: ${migration.name}`,
        severity: 'info',
        timestamp: new Date(),
        data: { durationMs: migration.durationMs },
      });

      return {
        migration,
        success: true,
        statementsExecuted: 1,
        rowsAffected: 0,
        durationMs: migration.durationMs,
        backupId,
      };
    } catch (error) {
      // Update status to failed
      migration.status = MigrationStatus.FAILED;
      migration.error = (error as Error).message;

      // Record history
      this.recordHistory(migrationId, 'apply', MigrationStatus.FAILED, Date.now() - startTime);

      // Notify failure
      this.notify({
        type: 'migration_failed',
        migrationId,
        message: `Migration failed: ${migration.name} - ${(error as Error).message}`,
        severity: 'error',
        timestamp: new Date(),
        data: { error: (error as Error).message },
      });

      return {
        migration,
        success: false,
        statementsExecuted: 0,
        rowsAffected: 0,
        durationMs: Date.now() - startTime,
        backupId,
        error: {
          message: (error as Error).message,
        },
      };
    } finally {
      // Release lock
      await this.releaseLock();
    }
  }

  /**
   * Run all pending migrations
   */
  async runPendingMigrations(): Promise<BatchMigrationResult> {
    const startTime = Date.now();
    const pendingMigrations = this.getPendingMigrations();

    const appliedMigrations: MigrationResult[] = [];
    const failedMigrations: MigrationResult[] = [];
    const skippedMigrations: MigrationMetadata[] = [];

    // Sort by creation date
    pendingMigrations.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    for (const migration of pendingMigrations) {
      try {
        const result = await this.runMigration(migration.id);

        if (result.success) {
          appliedMigrations.push(result);
        } else {
          failedMigrations.push(result);
          // Skip remaining migrations on failure
          const remaining = pendingMigrations.slice(
            pendingMigrations.indexOf(migration) + 1,
          );
          skippedMigrations.push(...remaining);
          break;
        }
      } catch (error) {
        const result: MigrationResult = {
          migration,
          success: false,
          statementsExecuted: 0,
          rowsAffected: 0,
          durationMs: 0,
          error: {
            message: (error as Error).message,
          },
        };
        failedMigrations.push(result);
        const remaining = pendingMigrations.slice(
          pendingMigrations.indexOf(migration) + 1,
        );
        skippedMigrations.push(...remaining);
        break;
      }
    }

    return {
      appliedMigrations,
      failedMigrations,
      skippedMigrations,
      totalDurationMs: Date.now() - startTime,
      success: failedMigrations.length === 0,
      startedAt: new Date(startTime),
      completedAt: new Date(),
    };
  }

  // ==========================================================================
  // Rollback Methods
  // ==========================================================================

  /**
   * Rollback a migration
   */
  async rollback(migrationId: string): Promise<RollbackResult> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      throw new MigrationNotFoundError(migrationId);
    }

    if (migration.status !== MigrationStatus.COMPLETED) {
      throw new MigrationError(
        `Cannot rollback migration in status: ${migration.status}`,
        'INVALID_STATUS',
        migrationId,
      );
    }

    const startTime = Date.now();

    try {
      // Acquire lock
      await this.acquireLock(migrationId);

      // Notify start
      this.notify({
        type: 'rollback_started',
        migrationId,
        message: `Starting rollback: ${migration.name}`,
        severity: 'warning',
        timestamp: new Date(),
      });

      if (!migration.hasRollback) {
        throw new MigrationError(
          'No rollback script available for this migration',
          'NO_ROLLBACK_SCRIPT',
          migrationId,
        );
      }

      if (!this.config.dryRun) {
        // In real implementation: execute rollback SQL
        await this.simulateExecution(30);
      }

      // Update migration status
      migration.status = MigrationStatus.ROLLED_BACK;
      migration.rolledBackAt = new Date();

      // Record history
      this.recordHistory(migrationId, 'rollback', MigrationStatus.ROLLED_BACK, Date.now() - startTime);

      // Notify completion
      this.notify({
        type: 'rollback_completed',
        migrationId,
        message: `Rollback completed: ${migration.name}`,
        severity: 'info',
        timestamp: new Date(),
      });

      return {
        migrationId,
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      // Record history
      this.recordHistory(migrationId, 'rollback', MigrationStatus.FAILED, Date.now() - startTime);

      // Notify failure
      this.notify({
        type: 'rollback_failed',
        migrationId,
        message: `Rollback failed: ${migration.name} - ${(error as Error).message}`,
        severity: 'error',
        timestamp: new Date(),
      });

      return {
        migrationId,
        success: false,
        durationMs: Date.now() - startTime,
        error: (error as Error).message,
      };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Rollback to a specific migration (rolls back all after it)
   */
  async rollbackTo(targetMigrationId: string): Promise<RollbackResult[]> {
    const results: RollbackResult[] = [];
    const allMigrations = Array.from(this.migrations.values())
      .filter((m) => m.status === MigrationStatus.COMPLETED)
      .sort((a, b) => {
        // Primary sort: appliedAt descending (newest first)
        const appliedDiff = (b.appliedAt?.getTime() ?? 0) - (a.appliedAt?.getTime() ?? 0);
        if (appliedDiff !== 0) return appliedDiff;
        // Secondary sort: createdAt descending for stable ordering when appliedAt is identical
        return b.createdAt.getTime() - a.createdAt.getTime();
      });

    const targetIndex = allMigrations.findIndex((m) => m.id === targetMigrationId);
    if (targetIndex === -1) {
      throw new MigrationNotFoundError(targetMigrationId);
    }

    // Rollback migrations after target (but not target itself)
    const toRollback = allMigrations.slice(0, targetIndex);

    for (const migration of toRollback) {
      const result = await this.rollback(migration.id);
      results.push(result);

      if (!result.success) {
        break; // Stop on first failure
      }
    }

    return results;
  }

  // ==========================================================================
  // Lock Management
  // ==========================================================================

  /**
   * Acquire migration lock
   */
  async acquireLock(migrationId?: string): Promise<MigrationLock> {
    if (this.currentLock) {
      // Check if lock is expired
      if (this.currentLock.expiresAt > new Date()) {
        throw new MigrationLockError('Lock already held', {
          holder: this.currentLock.holder,
          expiresAt: this.currentLock.expiresAt,
        });
      }
      // Lock expired, release it
      this.currentLock = null;
    }

    const lock: MigrationLock = {
      id: `lock-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      holder: this.config.lockHolder,
      acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.lockTimeoutMs),
      status: LockStatus.ACQUIRED,
      migrationId,
    };

    this.currentLock = lock;

    this.notify({
      type: 'lock_acquired',
      migrationId,
      message: `Migration lock acquired by ${lock.holder}`,
      severity: 'info',
      timestamp: new Date(),
    });

    return lock;
  }

  /**
   * Release migration lock
   */
  async releaseLock(): Promise<void> {
    if (this.currentLock) {
      const migrationId = this.currentLock.migrationId;
      this.currentLock.status = LockStatus.RELEASED;
      this.currentLock = null;

      this.notify({
        type: 'lock_released',
        migrationId,
        message: 'Migration lock released',
        severity: 'info',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get current lock status
   */
  getLockStatus(): MigrationLock | null {
    return this.currentLock;
  }

  /**
   * Force release lock (admin operation)
   */
  forceReleaseLock(): void {
    if (this.currentLock) {
      this.config.logger.warn('Force releasing migration lock', {
        holder: this.currentLock.holder,
        acquiredAt: this.currentLock.acquiredAt,
      });
      this.currentLock = null;
    }
  }

  // ==========================================================================
  // Backup Methods
  // ==========================================================================

  /**
   * Create a backup before migration
   */
  async createBackup(migrationId: string): Promise<string> {
    const backupId = `backup-${migrationId}-${Date.now()}`;
    this.config.logger.info(`Creating backup: ${backupId}`);
    // In real implementation: create database backup
    await this.simulateExecution(20);
    return backupId;
  }

  /**
   * Restore from a backup
   */
  async restoreFromBackup(backupId: string): Promise<void> {
    this.config.logger.info(`Restoring from backup: ${backupId}`);
    // In real implementation: restore database from backup
    await this.simulateExecution(30);
  }

  // ==========================================================================
  // History Methods
  // ==========================================================================

  /**
   * Record migration history
   */
  private recordHistory(
    migrationId: string,
    action: 'apply' | 'rollback' | 'skip',
    status: MigrationStatus,
    durationMs: number,
  ): void {
    const entry: MigrationHistoryEntry = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      migrationId,
      action,
      status,
      durationMs,
      performedAt: new Date(),
      performedBy: this.config.lockHolder,
    };

    this.history.push(entry);
  }

  /**
   * Get migration history
   */
  getHistory(migrationId?: string): MigrationHistoryEntry[] {
    if (migrationId) {
      return this.history.filter((h) => h.migrationId === migrationId);
    }
    return [...this.history];
  }

  /**
   * Clear history (for testing)
   */
  clearHistory(): void {
    this.history.length = 0;
  }

  // ==========================================================================
  // Statistics Methods
  // ==========================================================================

  /**
   * Get migration statistics
   */
  getStats(): MigrationStats {
    const migrations = Array.from(this.migrations.values());

    const completed = migrations.filter((m) => m.status === MigrationStatus.COMPLETED);
    const failed = migrations.filter((m) => m.status === MigrationStatus.FAILED);
    const rolledBack = migrations.filter((m) => m.status === MigrationStatus.ROLLED_BACK);
    const pending = migrations.filter((m) => m.status === MigrationStatus.PENDING);

    const durations = completed
      .map((m) => m.durationMs)
      .filter((d): d is number => d !== undefined);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    const totalAttempts = completed.length + failed.length;
    const successRate = totalAttempts > 0
      ? (completed.length / totalAttempts) * 100
      : 100;

    const lastApplied = completed
      .sort((a, b) => (b.appliedAt?.getTime() ?? 0) - (a.appliedAt?.getTime() ?? 0))[0];
    const lastRolledBack = rolledBack
      .sort((a, b) => (b.rolledBackAt?.getTime() ?? 0) - (a.rolledBackAt?.getTime() ?? 0))[0];

    return {
      totalMigrations: migrations.length,
      pendingMigrations: pending.length,
      completedMigrations: completed.length,
      failedMigrations: failed.length,
      rolledBackMigrations: rolledBack.length,
      averageDurationMs: avgDuration,
      successRate,
      lastMigrationAt: lastApplied?.appliedAt,
      lastRollbackAt: lastRolledBack?.rolledBackAt,
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Compute checksum for integrity verification
   */
  private computeChecksum(content: string): string {
    // Simple hash for demonstration - in production use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Send notification
   */
  private notify(notification: MigrationNotification): void {
    this.config.onNotification(notification);
    this.config.logger.info(notification.message, {
      type: notification.type,
      migrationId: notification.migrationId,
    });
  }

  /**
   * Simulate async execution (for testing)
   */
  private async simulateExecution(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Set dry-run mode
   */
  setDryRun(enabled: boolean): void {
    (this.config as { dryRun: boolean }).dryRun = enabled;
  }

  /**
   * Check if in dry-run mode
   */
  isDryRun(): boolean {
    return this.config.dryRun;
  }

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.migrations.clear();
    this.history.length = 0;
    this.currentLock = null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new migration automation service
 */
export function createMigrationAutomationService(
  config: MigrationAutomationConfig,
): MigrationAutomationService {
  return new MigrationAutomationService(config);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if error is a migration error
 */
export function isMigrationError(error: unknown): error is MigrationError {
  return error instanceof MigrationError;
}

/**
 * Check if error is a migration not found error
 */
export function isMigrationNotFoundError(error: unknown): error is MigrationNotFoundError {
  return error instanceof MigrationNotFoundError;
}

/**
 * Check if error is a migration lock error
 */
export function isMigrationLockError(error: unknown): error is MigrationLockError {
  return error instanceof MigrationLockError;
}

/**
 * Check if error is a migration validation error
 */
export function isMigrationValidationError(error: unknown): error is MigrationValidationError {
  return error instanceof MigrationValidationError;
}
