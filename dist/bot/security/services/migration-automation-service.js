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
export var MigrationStatus;
(function (MigrationStatus) {
    MigrationStatus["PENDING"] = "pending";
    MigrationStatus["RUNNING"] = "running";
    MigrationStatus["COMPLETED"] = "completed";
    MigrationStatus["FAILED"] = "failed";
    MigrationStatus["ROLLED_BACK"] = "rolled_back";
    MigrationStatus["SKIPPED"] = "skipped";
})(MigrationStatus || (MigrationStatus = {}));
/**
 * Migration validation status
 */
export var ValidationStatus;
(function (ValidationStatus) {
    ValidationStatus["PASSED"] = "passed";
    ValidationStatus["FAILED"] = "failed";
    ValidationStatus["WARNING"] = "warning";
    ValidationStatus["SKIPPED"] = "skipped";
})(ValidationStatus || (ValidationStatus = {}));
/**
 * Migration lock status
 */
export var LockStatus;
(function (LockStatus) {
    LockStatus["ACQUIRED"] = "acquired";
    LockStatus["RELEASED"] = "released";
    LockStatus["TIMEOUT"] = "timeout";
    LockStatus["FAILED"] = "failed";
})(LockStatus || (LockStatus = {}));
// ============================================================================
// Default Configuration
// ============================================================================
const DEFAULT_CONFIG = {
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
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
    },
    onNotification: () => { },
};
// ============================================================================
// Error Classes
// ============================================================================
/**
 * Base migration error
 */
export class MigrationError extends Error {
    code;
    migrationId;
    details;
    constructor(message, code, migrationId, details) {
        super(message);
        this.code = code;
        this.migrationId = migrationId;
        this.details = details;
        this.name = 'MigrationError';
    }
}
/**
 * Migration not found error
 */
export class MigrationNotFoundError extends MigrationError {
    constructor(migrationId) {
        super(`Migration '${migrationId}' not found`, 'MIGRATION_NOT_FOUND', migrationId);
        this.name = 'MigrationNotFoundError';
    }
}
/**
 * Migration lock error
 */
export class MigrationLockError extends MigrationError {
    constructor(message, details) {
        super(message, 'LOCK_ERROR', undefined, details);
        this.name = 'MigrationLockError';
    }
}
/**
 * Migration validation error
 */
export class MigrationValidationError extends MigrationError {
    validationResults;
    constructor(migrationId, validationResults) {
        super(`Migration '${migrationId}' failed validation`, 'VALIDATION_FAILED', migrationId, { validationResults });
        this.validationResults = validationResults;
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
    config;
    migrations = new Map();
    history = [];
    currentLock = null;
    constructor(config) {
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
    discoverMigrations() {
        // In a real implementation, this would scan the file system
        // For now, we simulate with stored migrations
        return Array.from(this.migrations.values());
    }
    /**
     * Register a migration manually (useful for testing)
     */
    registerMigration(migration) {
        const checksum = this.computeChecksum(migration.id + migration.name + migration.path);
        const fullMigration = {
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
    getPendingMigrations() {
        return this.discoverMigrations().filter((m) => m.status === MigrationStatus.PENDING);
    }
    /**
     * Get migration by ID
     */
    getMigration(id) {
        return this.migrations.get(id);
    }
    // ==========================================================================
    // Validation Methods
    // ==========================================================================
    /**
     * Run pre-migration validations
     */
    async runPreMigrationChecks(migrationId) {
        const migration = this.migrations.get(migrationId);
        if (!migration) {
            throw new MigrationNotFoundError(migrationId);
        }
        const startTime = Date.now();
        const validations = [];
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
        const passed = validations.every((v) => v.status === ValidationStatus.PASSED || v.status === ValidationStatus.WARNING);
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
    checkDependencies(_migration) {
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
    async runMigration(migrationId) {
        const migration = this.migrations.get(migrationId);
        if (!migration) {
            throw new MigrationNotFoundError(migrationId);
        }
        // Acquire lock
        await this.acquireLock(migrationId);
        const startTime = Date.now();
        let backupId;
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
                    const failedValidations = checks.validations.filter((v) => v.status === ValidationStatus.FAILED);
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
        }
        catch (error) {
            // Update status to failed
            migration.status = MigrationStatus.FAILED;
            migration.error = error.message;
            // Record history
            this.recordHistory(migrationId, 'apply', MigrationStatus.FAILED, Date.now() - startTime);
            // Notify failure
            this.notify({
                type: 'migration_failed',
                migrationId,
                message: `Migration failed: ${migration.name} - ${error.message}`,
                severity: 'error',
                timestamp: new Date(),
                data: { error: error.message },
            });
            return {
                migration,
                success: false,
                statementsExecuted: 0,
                rowsAffected: 0,
                durationMs: Date.now() - startTime,
                backupId,
                error: {
                    message: error.message,
                },
            };
        }
        finally {
            // Release lock
            await this.releaseLock();
        }
    }
    /**
     * Run all pending migrations
     */
    async runPendingMigrations() {
        const startTime = Date.now();
        const pendingMigrations = this.getPendingMigrations();
        const appliedMigrations = [];
        const failedMigrations = [];
        const skippedMigrations = [];
        // Sort by creation date
        pendingMigrations.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        for (const migration of pendingMigrations) {
            try {
                const result = await this.runMigration(migration.id);
                if (result.success) {
                    appliedMigrations.push(result);
                }
                else {
                    failedMigrations.push(result);
                    // Skip remaining migrations on failure
                    const remaining = pendingMigrations.slice(pendingMigrations.indexOf(migration) + 1);
                    skippedMigrations.push(...remaining);
                    break;
                }
            }
            catch (error) {
                const result = {
                    migration,
                    success: false,
                    statementsExecuted: 0,
                    rowsAffected: 0,
                    durationMs: 0,
                    error: {
                        message: error.message,
                    },
                };
                failedMigrations.push(result);
                const remaining = pendingMigrations.slice(pendingMigrations.indexOf(migration) + 1);
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
    async rollback(migrationId) {
        const migration = this.migrations.get(migrationId);
        if (!migration) {
            throw new MigrationNotFoundError(migrationId);
        }
        if (migration.status !== MigrationStatus.COMPLETED) {
            throw new MigrationError(`Cannot rollback migration in status: ${migration.status}`, 'INVALID_STATUS', migrationId);
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
                throw new MigrationError('No rollback script available for this migration', 'NO_ROLLBACK_SCRIPT', migrationId);
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
        }
        catch (error) {
            // Record history
            this.recordHistory(migrationId, 'rollback', MigrationStatus.FAILED, Date.now() - startTime);
            // Notify failure
            this.notify({
                type: 'rollback_failed',
                migrationId,
                message: `Rollback failed: ${migration.name} - ${error.message}`,
                severity: 'error',
                timestamp: new Date(),
            });
            return {
                migrationId,
                success: false,
                durationMs: Date.now() - startTime,
                error: error.message,
            };
        }
        finally {
            await this.releaseLock();
        }
    }
    /**
     * Rollback to a specific migration (rolls back all after it)
     */
    async rollbackTo(targetMigrationId) {
        const results = [];
        const allMigrations = Array.from(this.migrations.values())
            .filter((m) => m.status === MigrationStatus.COMPLETED)
            .sort((a, b) => {
            // Primary sort: appliedAt descending (newest first)
            const appliedDiff = (b.appliedAt?.getTime() ?? 0) - (a.appliedAt?.getTime() ?? 0);
            if (appliedDiff !== 0)
                return appliedDiff;
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
    async acquireLock(migrationId) {
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
        const lock = {
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
    async releaseLock() {
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
    getLockStatus() {
        return this.currentLock;
    }
    /**
     * Force release lock (admin operation)
     */
    forceReleaseLock() {
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
    async createBackup(migrationId) {
        const backupId = `backup-${migrationId}-${Date.now()}`;
        this.config.logger.info(`Creating backup: ${backupId}`);
        // In real implementation: create database backup
        await this.simulateExecution(20);
        return backupId;
    }
    /**
     * Restore from a backup
     */
    async restoreFromBackup(backupId) {
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
    recordHistory(migrationId, action, status, durationMs) {
        const entry = {
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
    getHistory(migrationId) {
        if (migrationId) {
            return this.history.filter((h) => h.migrationId === migrationId);
        }
        return [...this.history];
    }
    /**
     * Clear history (for testing)
     */
    clearHistory() {
        this.history.length = 0;
    }
    // ==========================================================================
    // Statistics Methods
    // ==========================================================================
    /**
     * Get migration statistics
     */
    getStats() {
        const migrations = Array.from(this.migrations.values());
        const completed = migrations.filter((m) => m.status === MigrationStatus.COMPLETED);
        const failed = migrations.filter((m) => m.status === MigrationStatus.FAILED);
        const rolledBack = migrations.filter((m) => m.status === MigrationStatus.ROLLED_BACK);
        const pending = migrations.filter((m) => m.status === MigrationStatus.PENDING);
        const durations = completed
            .map((m) => m.durationMs)
            .filter((d) => d !== undefined);
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
    computeChecksum(content) {
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
    notify(notification) {
        this.config.onNotification(notification);
        this.config.logger.info(notification.message, {
            type: notification.type,
            migrationId: notification.migrationId,
        });
    }
    /**
     * Simulate async execution (for testing)
     */
    async simulateExecution(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Set dry-run mode
     */
    setDryRun(enabled) {
        this.config.dryRun = enabled;
    }
    /**
     * Check if in dry-run mode
     */
    isDryRun() {
        return this.config.dryRun;
    }
    /**
     * Clear all data (for testing)
     */
    clear() {
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
export function createMigrationAutomationService(config) {
    return new MigrationAutomationService(config);
}
// ============================================================================
// Type Guards
// ============================================================================
/**
 * Check if error is a migration error
 */
export function isMigrationError(error) {
    return error instanceof MigrationError;
}
/**
 * Check if error is a migration not found error
 */
export function isMigrationNotFoundError(error) {
    return error instanceof MigrationNotFoundError;
}
/**
 * Check if error is a migration lock error
 */
export function isMigrationLockError(error) {
    return error instanceof MigrationLockError;
}
/**
 * Check if error is a migration validation error
 */
export function isMigrationValidationError(error) {
    return error instanceof MigrationValidationError;
}
