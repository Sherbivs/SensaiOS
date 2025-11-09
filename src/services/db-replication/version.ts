/**
 * Database Version Tracking Foundation
 * 
 * Implements version control system for database replication architecture.
 * Calculates SHA-256 fingerprints from _prisma_migrations table to enable
 * version comparison and reversion detection across DEV/Prod/Local environments.
 */

import { createHash } from 'crypto';
import type { Pool } from 'pg';
import { log } from '../../shared/log.js';
import {
  getMigrations,
  getMigrationsWithLimit,
  createDbVersion,
  upsertDbSyncState,
  type MigrationRow,
} from '../../shared/models/db-version-queries-pg.js';

// Logger wrapper for consistent formatting
const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log.info(`[INFO] ${msg}`, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log.warn(`[WARN] ${msg}`, meta),
  error: (msg: string, err?: unknown, meta?: Record<string, unknown>) => log.error(`[ERROR] ${msg}`, err, meta),
};

// ---- Types ----

export interface Version {
  fingerprint: string;
  migrationCount: number;
  lastMigrationName: string | null;
  lastMigrationAppliedAt: Date | null;
  source: string;
}

export enum VersionStatus {
  MATCH = 'MATCH',
  AHEAD = 'AHEAD',
  BEHIND = 'BEHIND',
  DIVERGED = 'DIVERGED',
}

export interface VersionComparison {
  status: VersionStatus;
  sourceFingerprint: string;
  targetFingerprint: string;
  migrationCountDiff: number;
  message: string;
}

export interface ReversionResult {
  reversionDetected: boolean;
  syncBlocked: boolean;
  devMigrationCount: number;
  prodMigrationCount: number;
  message: string;
}

// ---- Core Functions ----

/**
 * Calculate version fingerprint from _prisma_migrations table.
 * 
 * Formula: SHA-256(migration_1:checksum|migration_2:checksum|...)
 * 
 * @param pool - PostgreSQL connection pool for target database
 * @param sourceName - Descriptive name for this database (e.g., 'DEV', 'PROD', 'LOCAL')
 * @returns Version object with fingerprint and metadata
 */
export async function getVersion(
  pool: Pool,
  sourceName: string
): Promise<Version> {
  try {
    // Query _prisma_migrations table (internal Prisma tracking table)
    const migrations = await getMigrations(pool);

    if (migrations.length === 0) {
      logger.warn(`[db-replication] No migrations found in ${sourceName} database`);
      return {
        fingerprint: '',
        migrationCount: 0,
        lastMigrationName: null,
        lastMigrationAppliedAt: null,
        source: sourceName,
      };
    }

    // Build fingerprint: migration_1:checksum|migration_2:checksum|...
    const fingerprintInput = migrations
      .map((m: MigrationRow) => `${m.migration_name}:${m.checksum}`)
      .join('|');

    const fingerprint = createHash('sha256')
      .update(fingerprintInput)
      .digest('hex');

    const lastMigration = migrations[migrations.length - 1]!;

    return {
      fingerprint,
      migrationCount: migrations.length,
      lastMigrationName: lastMigration.migration_name,
      lastMigrationAppliedAt: lastMigration.finished_at || lastMigration.started_at,
      source: sourceName,
    };
  } catch (error) {
    logger.error(`[db-replication] Failed to get version from ${sourceName}`, { error });
    throw new Error(`Failed to get version from ${sourceName}: ${error}`);
  }
}

/**
 * Compare versions between source and target databases.
 * 
 * Returns:
 * - MATCH: Identical fingerprints (databases in sync)
 * - AHEAD: Source has more migrations, target is prefix of source (normal sync scenario)
 * - BEHIND: Source has fewer migrations than target (REVERSION detected - target rolled back!)
 * - DIVERGED: Different fingerprints at same count (conflict - databases diverged)
 * 
 * @param source - Version from source database (e.g., DEV)
 * @param target - Version from target database (e.g., PROD)
 * @param poolSource - PostgreSQL pool for source database
 * @param poolTarget - PostgreSQL pool for target database
 * @returns VersionComparison with status and metadata
 */
export async function compareVersions(
  source: Version,
  target: Version,
  poolSource: Pool,
  poolTarget: Pool
): Promise<VersionComparison> {
  // Case 1: Identical fingerprints
  if (source.fingerprint === target.fingerprint) {
    return {
      status: VersionStatus.MATCH,
      sourceFingerprint: source.fingerprint,
      targetFingerprint: target.fingerprint,
      migrationCountDiff: 0,
      message: `${source.source} and ${target.source} are in sync (fingerprint: ${source.fingerprint.substring(0, 12)}...)`,
    };
  }

  const migrationCountDiff = source.migrationCount - target.migrationCount;

  // Case 2: Source has fewer migrations (REVERSION!)
  if (migrationCountDiff < 0) {
    return {
      status: VersionStatus.BEHIND,
      sourceFingerprint: source.fingerprint,
      targetFingerprint: target.fingerprint,
      migrationCountDiff,
      message: `REVERSION DETECTED: ${source.source} has ${Math.abs(migrationCountDiff)} fewer migrations than ${target.source}. ${source.source} rolled back - sync blocked until ${source.source} catches up.`,
    };
  }

  // Case 3: Source has more migrations - verify prefix
  if (migrationCountDiff > 0) {
    const prefixValid = await verifyMigrationPrefix(
      poolSource,
      poolTarget,
      target.migrationCount
    );

    if (prefixValid) {
      return {
        status: VersionStatus.AHEAD,
        sourceFingerprint: source.fingerprint,
        targetFingerprint: target.fingerprint,
        migrationCountDiff,
        message: `${source.source} is ${migrationCountDiff} migration(s) ahead of ${target.source}. Target is valid prefix - safe to sync.`,
      };
    } else {
      return {
        status: VersionStatus.DIVERGED,
        sourceFingerprint: source.fingerprint,
        targetFingerprint: target.fingerprint,
        migrationCountDiff,
        message: `DIVERGENCE DETECTED: ${source.source} and ${target.source} have different migration histories. Manual reconciliation required.`,
      };
    }
  }

  // Case 4: Same count but different fingerprints (DIVERGED)
  return {
    status: VersionStatus.DIVERGED,
    sourceFingerprint: source.fingerprint,
    targetFingerprint: target.fingerprint,
    migrationCountDiff: 0,
    message: `DIVERGENCE DETECTED: ${source.source} and ${target.source} have same migration count (${source.migrationCount}) but different fingerprints. Migration histories diverged.`,
  };
}

/**
 * Verify that target migrations are a prefix of source migrations.
 * 
 * Used to ensure AHEAD status is safe - target must have exact same migrations
 * as source (just fewer).
 * 
 * @param poolSource - Source PostgreSQL pool
 * @param poolTarget - Target PostgreSQL pool
 * @param targetCount - Number of migrations in target
 * @returns true if target is valid prefix, false if diverged
 */
async function verifyMigrationPrefix(
  poolSource: Pool,
  poolTarget: Pool,
  targetCount: number
): Promise<boolean> {
  try {
    // Get first N migrations from both databases
    const sourceMigrations = await getMigrationsWithLimit(targetCount, poolSource);
    const targetMigrations = await getMigrationsWithLimit(targetCount, poolTarget);

    // Compare migration names and checksums
    if (sourceMigrations.length !== targetMigrations.length) {
      return false;
    }

    for (let i = 0; i < targetMigrations.length; i++) {
      const source = sourceMigrations[i]!;
      const target = targetMigrations[i]!;

      if (
        source.migration_name !== target.migration_name ||
        source.checksum !== target.checksum
      ) {
        logger.warn(`[db-replication] Migration prefix mismatch at index ${i}`, {
          source: source.migration_name,
          target: target.migration_name,
        });
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('[db-replication] Failed to verify migration prefix', { error });
    return false;
  }
}

/**
 * Handle reversion detection - block sync and alert operators.
 * 
 * When DEV (master) rolls back migrations, this function:
 * 1. Updates db_sync_state with WAITING_FOR_MASTER status
 * 2. Logs alert for operators
 * 3. Returns metadata about the reversion
 * 
 * @param devVersion - Version from DEV database (master)
 * @param prodVersion - Version from PROD database (replica)
 * @param poolProd - PostgreSQL pool for PROD database
 * @returns ReversionResult with detection metadata
 */
export async function handleReversion(
  devVersion: Version,
  prodVersion: Version,
  poolProd: Pool
): Promise<ReversionResult> {
  const reversionDetected = devVersion.migrationCount < prodVersion.migrationCount;

  if (!reversionDetected) {
    return {
      reversionDetected: false,
      syncBlocked: false,
      devMigrationCount: devVersion.migrationCount,
      prodMigrationCount: prodVersion.migrationCount,
      message: 'No reversion detected - sync can proceed',
    };
  }

  const migrationGap = prodVersion.migrationCount - devVersion.migrationCount;

  // Update db_sync_state to block sync
  try {
    await upsertDbSyncState(
      {
        source: 'DEV',
        target: 'PROD',
        status: 'WAITING_FOR_MASTER',
        lastError: `Reversion detected: DEV rolled back ${migrationGap} migration(s). Sync blocked until DEV catches up.`,
      },
      poolProd
    );

    logger.error(
      `[db-replication] REVERSION DETECTED: DEV has ${devVersion.migrationCount} migrations, PROD has ${prodVersion.migrationCount}. Sync blocked.`,
      {
        devFingerprint: devVersion.fingerprint.substring(0, 12),
        prodFingerprint: prodVersion.fingerprint.substring(0, 12),
        migrationGap,
      }
    );
  } catch (error) {
    logger.error('[db-replication] Failed to update db_sync_state during reversion handling', {
      error,
    });
  }

  return {
    reversionDetected: true,
    syncBlocked: true,
    devMigrationCount: devVersion.migrationCount,
    prodMigrationCount: prodVersion.migrationCount,
    message: `Reversion detected: DEV rolled back ${migrationGap} migration(s). Sync blocked until DEV catches up to ${prodVersion.migrationCount} migrations.`,
  };
}

/**
 * Record version snapshot to db_version table.
 * 
 * Stores version metadata for historical tracking and observability.
 * 
 * @param pool - PostgreSQL pool for target database
 * @param version - Version object to record
 */
export async function recordVersion(
  pool: Pool,
  version: Version
): Promise<void> {
  try {
    await createDbVersion(
      {
        versionFingerprint: version.fingerprint,
        migrationCount: version.migrationCount,
        lastMigrationName: version.lastMigrationName || '',
        lastMigrationAppliedAt: version.lastMigrationAppliedAt || new Date(),
        syncSource: version.source,
      },
      pool
    );

    logger.info(`[db-replication] Recorded version snapshot for ${version.source}`, {
      fingerprint: version.fingerprint.substring(0, 12),
      migrationCount: version.migrationCount,
    });
  } catch (error) {
    logger.warn(`[db-replication] Failed to record version snapshot`, { error });
    // Non-fatal - version tracking is best-effort for observability
  }
}
