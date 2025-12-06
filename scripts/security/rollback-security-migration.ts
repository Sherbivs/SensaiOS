/**
 * Security State Rollback Script
 * ================================
 *
 * Rolls back security state migration from database back to JSON files.
 *
 * This script:
 * 1. Reads rollback data from .rollback-data.json
 * 2. Deletes migrated records from database
 * 3. Removes migration marker file
 *
 * @module scripts/security/rollback-security-migration
 * @task P0-003 (Migration + Rollback Automation)
 *
 * Usage:
 *   npx tsx scripts/security/rollback-security-migration.ts [options]
 *
 * Options:
 *   --dry-run       Preview rollback without making changes
 *   --target        Target database: 'cloud-prod' | 'onpremise-dev' (default: onpremise-dev)
 *   --force         Skip confirmation prompts
 *   --verbose       Enable verbose logging
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// Types
interface RollbackData {
  migratedAt: string;
  target: 'cloud-prod' | 'onpremise-dev';
  stats: {
    roleChanges: {
      total: number;
      migrated: number;
      skipped: number;
      failed: number;
    };
    baselines: {
      total: number;
      migrated: number;
      skipped: number;
      failed: number;
    };
    events: {
      total: number;
      migrated: number;
      skipped: number;
      failed: number;
    };
    errors: string[];
  };
  canRollback: boolean;
}

interface RollbackOptions {
  dryRun: boolean;
  target: 'cloud-prod' | 'onpremise-dev';
  force: boolean;
  verbose: boolean;
}

interface RollbackStats {
  roleChanges: number;
  baselines: number;
  events: number;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  errors: string[];
}

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const STATE_DIR = join(PROJECT_ROOT, 'Store', 'security-bot-state');
const MIGRATION_MARKER_FILE = join(STATE_DIR, '.migration-complete');
const ROLLBACK_DATA_FILE = join(STATE_DIR, '.rollback-data.json');
const ROLLBACK_COMPLETE_FILE = join(STATE_DIR, '.rollback-complete');

/**
 * Parse command line arguments
 */
function parseArgs(): RollbackOptions {
  const args = process.argv.slice(2);
  const options: RollbackOptions = {
    dryRun: args.includes('--dry-run'),
    target:
      args.includes('--target') &&
      args[args.indexOf('--target') + 1] === 'cloud-prod'
        ? 'cloud-prod'
        : 'onpremise-dev',
    force: args.includes('--force'),
    verbose: args.includes('--verbose'),
  };

  return options;
}

/**
 * Log with optional verbose mode
 */
function log(
  message: string,
  options: RollbackOptions,
  level: 'info' | 'verbose' | 'error' | 'success' | 'warn' = 'info'
): void {
  if (level === 'verbose' && !options.verbose) return;

  const prefix = {
    info: '📋',
    verbose: '   ',
    error: '❌',
    success: '✅',
    warn: '⚠️',
  }[level];

  // eslint-disable-next-line no-console
  console.log(`${prefix} ${message}`);
}

/**
 * Prompt for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Load rollback data
 */
function loadRollbackData(): RollbackData | null {
  if (!existsSync(ROLLBACK_DATA_FILE)) {
    return null;
  }

  try {
    const content = readFileSync(ROLLBACK_DATA_FILE, 'utf-8');
    return JSON.parse(content) as RollbackData;
  } catch {
    return null;
  }
}

/**
 * Main rollback function
 */
async function rollback(): Promise<void> {
  const options = parseArgs();

  // eslint-disable-next-line no-console
  console.log('\n');
  // eslint-disable-next-line no-console
  console.log('═══════════════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('       Security State Rollback — PostgreSQL → JSON');
  // eslint-disable-next-line no-console
  console.log('═══════════════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('\n');

  log(`Target: ${options.target.toUpperCase()}`, options);
  log(`Mode: ${options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`, options);
  // eslint-disable-next-line no-console
  console.log('\n');

  // Initialize stats
  const stats: RollbackStats = {
    roleChanges: 0,
    baselines: 0,
    events: 0,
    startedAt: new Date(),
    errors: [],
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1: Load rollback data
  // ─────────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log('┌─────────────────────────────────────────────────────────────┐');
  // eslint-disable-next-line no-console
  console.log('│  Phase 1: Loading Rollback Data                             │');
  // eslint-disable-next-line no-console
  console.log('└─────────────────────────────────────────────────────────────┘');

  const rollbackData = loadRollbackData();

  if (!rollbackData) {
    log('No rollback data found. Nothing to rollback.', options, 'warn');
    log(`Expected file: ${ROLLBACK_DATA_FILE}`, options, 'info');
    // eslint-disable-next-line no-console
    console.log('\n');
    return;
  }

  log(`Rollback data found from: ${rollbackData.migratedAt}`, options, 'success');
  log(
    `Original target: ${rollbackData.target}`,
    options,
    'info'
  );
  log(
    `Role changes migrated: ${rollbackData.stats.roleChanges.migrated}`,
    options,
    'info'
  );
  log(
    `Baselines migrated: ${rollbackData.stats.baselines.migrated}`,
    options,
    'info'
  );
  log(
    `Events migrated: ${rollbackData.stats.events.migrated}`,
    options,
    'info'
  );
  // eslint-disable-next-line no-console
  console.log('\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: Confirmation
  // ─────────────────────────────────────────────────────────────────────────
  if (!options.force && !options.dryRun) {
    // eslint-disable-next-line no-console
    console.log('┌─────────────────────────────────────────────────────────────┐');
    // eslint-disable-next-line no-console
    console.log('│  Phase 2: Confirmation                                      │');
    // eslint-disable-next-line no-console
    console.log('└─────────────────────────────────────────────────────────────┘');

    // eslint-disable-next-line no-console
    console.log('\n⚠️  WARNING: This will DELETE migrated records from the database.');
    // eslint-disable-next-line no-console
    console.log('   Original JSON files will NOT be modified.\n');

    const confirmed = await confirm('Proceed with rollback?');

    if (!confirmed) {
      log('Rollback cancelled by user.', options, 'warn');
      // eslint-disable-next-line no-console
      console.log('\n');
      return;
    }
    // eslint-disable-next-line no-console
    console.log('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: Database rollback
  // ─────────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log('┌─────────────────────────────────────────────────────────────┐');
  // eslint-disable-next-line no-console
  console.log('│  Phase 3: Database Rollback                                  │');
  // eslint-disable-next-line no-console
  console.log('└─────────────────────────────────────────────────────────────┘');

  if (options.dryRun) {
    log('DRY RUN MODE - No database changes', options, 'info');
    log(
      `Would delete up to ${rollbackData.stats.roleChanges.migrated} role audit records`,
      options
    );
    log(
      `Would delete up to ${rollbackData.stats.baselines.migrated} baseline records`,
      options
    );
    log(
      `Would delete up to ${rollbackData.stats.events.migrated} security events`,
      options
    );
  } else {
    try {
      const { prisma, onPremiseDevPrisma } = await import(
        '../../src/shared/prisma.js'
      );

      // Select target database client
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any =
        options.target === 'cloud-prod' ? prisma : (onPremiseDevPrisma ?? prisma);

      if (!client) {
        throw new Error(
          `Target database client not available: ${options.target}`
        );
      }

      log(`Connected to ${options.target}`, options, 'success');

      // Delete role audit records (if model exists)
      // Note: We delete records marked as legacy migration
      log('Deleting role audit records...', options);
      try {
        if (client.roleChangeAudit) {
          const deleted = await client.roleChangeAudit.deleteMany({
            where: {
              authReason: 'Legacy migration - pre-database',
            },
          });
          stats.roleChanges = deleted.count;
          log(`  Deleted ${deleted.count} role audit records`, options, 'success');
        } else {
          log('  RoleChangeAudit model not available (schema not applied)', options, 'warn');
        }
      } catch (error) {
        stats.errors.push(`Role audit deletion: ${error}`);
        log(`  Role audit deletion failed: ${error}`, options, 'error');
      }

      // Delete baselines (if model exists)
      log('Deleting baseline records...', options);
      try {
        if (client.securityBaseline) {
          const deleted = await client.securityBaseline.deleteMany({
            where: {
              // Delete baselines with migration-era timestamps
              createdAt: {
                lte: new Date(rollbackData.migratedAt),
              },
            },
          });
          stats.baselines = deleted.count;
          log(`  Deleted ${deleted.count} baseline records`, options, 'success');
        } else {
          log('  SecurityBaseline model not available (schema not applied)', options, 'warn');
        }
      } catch (error) {
        stats.errors.push(`Baseline deletion: ${error}`);
        log(`  Baseline deletion failed: ${error}`, options, 'error');
      }

      // Delete security events from migration (if model exists)
      log('Deleting security events...', options);
      try {
        if (client.securityEvent) {
          const deleted = await client.securityEvent.deleteMany({
            where: {
              origin: 'security-bot-sweep',
              createdAt: {
                lte: new Date(rollbackData.migratedAt),
              },
            },
          });
          stats.events = deleted.count;
          log(`  Deleted ${deleted.count} security events`, options, 'success');
        } else {
          log('  SecurityEvent model not available (schema not applied)', options, 'warn');
        }
      } catch (error) {
        stats.errors.push(`Event deletion: ${error}`);
        log(`  Event deletion failed: ${error}`, options, 'error');
      }
    } catch (error) {
      stats.errors.push(`Database connection: ${error}`);
      log(`Database connection failed: ${error}`, options, 'error');
    }
  }

  // eslint-disable-next-line no-console
  console.log('\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  // eslint-disable-next-line no-console
  console.log('┌─────────────────────────────────────────────────────────────┐');
  // eslint-disable-next-line no-console
  console.log('│  Phase 4: Cleanup                                            │');
  // eslint-disable-next-line no-console
  console.log('└─────────────────────────────────────────────────────────────┘');

  if (options.dryRun) {
    log('DRY RUN - Would remove marker files', options, 'info');
  } else {
    // Remove migration marker
    if (existsSync(MIGRATION_MARKER_FILE)) {
      try {
        unlinkSync(MIGRATION_MARKER_FILE);
        log('Migration marker removed', options, 'success');
      } catch (error) {
        stats.errors.push(`Marker removal: ${error}`);
        log(`Failed to remove marker: ${error}`, options, 'error');
      }
    }

    // Remove rollback data
    if (existsSync(ROLLBACK_DATA_FILE)) {
      try {
        unlinkSync(ROLLBACK_DATA_FILE);
        log('Rollback data removed', options, 'success');
      } catch (error) {
        stats.errors.push(`Rollback data removal: ${error}`);
        log(`Failed to remove rollback data: ${error}`, options, 'error');
      }
    }

    // Create rollback complete marker
    const marker = {
      completedAt: new Date().toISOString(),
      target: options.target,
      stats: {
        roleChanges: stats.roleChanges,
        baselines: stats.baselines,
        events: stats.events,
      },
    };
    writeFileSync(ROLLBACK_COMPLETE_FILE, JSON.stringify(marker, null, 2));
    log(`Rollback marker created: ${ROLLBACK_COMPLETE_FILE}`, options);
  }

  // eslint-disable-next-line no-console
  console.log('\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  stats.completedAt = new Date();
  stats.durationMs = stats.completedAt.getTime() - stats.startedAt.getTime();

  // eslint-disable-next-line no-console
  console.log('═══════════════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('                     Rollback Summary                           ');
  // eslint-disable-next-line no-console
  console.log('═══════════════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('\n');
  // eslint-disable-next-line no-console
  console.log(`  Role Audits:    ${stats.roleChanges} deleted`);
  // eslint-disable-next-line no-console
  console.log(`  Baselines:      ${stats.baselines} deleted`);
  // eslint-disable-next-line no-console
  console.log(`  Events:         ${stats.events} deleted`);
  // eslint-disable-next-line no-console
  console.log(`  Duration:       ${(stats.durationMs / 1000).toFixed(2)}s`);
  // eslint-disable-next-line no-console
  console.log(`  Errors:         ${stats.errors.length}`);
  // eslint-disable-next-line no-console
  console.log('\n');

  if (stats.errors.length > 0) {
    // eslint-disable-next-line no-console
    console.log('Errors encountered:');
    for (const error of stats.errors.slice(0, 10)) {
      // eslint-disable-next-line no-console
      console.log(`  - ${error}`);
    }
    if (stats.errors.length > 10) {
      // eslint-disable-next-line no-console
      console.log(`  ... and ${stats.errors.length - 10} more`);
    }
    // eslint-disable-next-line no-console
    console.log('\n');
  }

  if (options.dryRun) {
    // eslint-disable-next-line no-console
    console.log('💡 This was a DRY RUN. Run without --dry-run to perform rollback.');
  } else {
    // eslint-disable-next-line no-console
    console.log('✅ Rollback complete. You can now re-run migration if needed.');
  }
  // eslint-disable-next-line no-console
  console.log('\n');
}

// Run rollback
rollback().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Rollback failed with error:', error);
  process.exit(1);
});
