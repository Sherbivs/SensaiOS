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
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { scopedLogger } from '../../src/observability/envelope/console.js';
import { formatSectionHeader, formatKeyValueList, formatList, printSuccess, printError, printWarning, printInfo } from '../../src/utils/output-formatter.js';

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

const envelopeLog = scopedLogger('security.rollback-migration');

function toRelativePath(filePath: string): string {
  const relPath = relative(PROJECT_ROOT, filePath);
  return relPath || filePath;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
  level: 'info' | 'verbose' | 'error' | 'success' | 'warn' = 'info',
  context: Record<string, unknown> = {}
): void {
  if (level === 'verbose' && !options.verbose) return;

  const baseContext = {
    target: options.target,
    dryRun: options.dryRun,
  };
  const payload = { ...baseContext, ...context };

  switch (level) {
    case 'verbose':
      envelopeLog.debug('rollback', message, payload);
      break;
    case 'error':
      envelopeLog.error('rollback', message, payload);
      break;
    case 'warn':
      envelopeLog.warn('rollback', message, payload);
      break;
    case 'success':
      envelopeLog.info('rollback', message, { ...payload, status: 'success' });
      break;
    default:
      envelopeLog.info('rollback', message, payload);
  }
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

  console.log(formatSectionHeader('Security State Rollback — PostgreSQL → JSON'));

  console.log(formatKeyValueList([
    ['Target', options.target.toUpperCase()],
    ['Mode', options.dryRun ? 'DRY RUN (no changes)' : 'LIVE'],
  ]));

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
  printInfo('Phase 1: Loading Rollback Data');

  const rollbackData = loadRollbackData();

  if (!rollbackData) {
    log('No rollback data found. Nothing to rollback.', options, 'warn');
    log('Expected rollback data file missing', options, 'info', {
      relativePath: toRelativePath(ROLLBACK_DATA_FILE),
    });
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

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: Confirmation
  // ─────────────────────────────────────────────────────────────────────────
  if (!options.force && !options.dryRun) {
    printInfo('Phase 2: Confirmation');

    printWarning('This will DELETE migrated records from the database.');
    printInfo('Original JSON files will NOT be modified.');

    const confirmed = await confirm('Proceed with rollback?');

    if (!confirmed) {
      log('Rollback cancelled by user.', options, 'warn');
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: Database rollback
  // ─────────────────────────────────────────────────────────────────────────
  printInfo('Phase 3: Database Rollback');

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
        const message = formatError(error);
        stats.errors.push(`Role audit deletion: ${message}`);
        log('Role audit deletion failed', options, 'error', { error: message });
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
        const message = formatError(error);
        stats.errors.push(`Baseline deletion: ${message}`);
        log('Baseline deletion failed', options, 'error', { error: message });
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
        const message = formatError(error);
        stats.errors.push(`Event deletion: ${message}`);
        log('Event deletion failed', options, 'error', { error: message });
      }
    } catch (error) {
      const message = formatError(error);
      stats.errors.push(`Database connection: ${message}`);
      log('Database connection failed', options, 'error', { error: message });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: Cleanup
  // ─────────────────────────────────────────────────────────────────────────
  printInfo('Phase 4: Cleanup');

  if (options.dryRun) {
    log('DRY RUN - Would remove marker files', options, 'info');
  } else {
    // Remove migration marker
    if (existsSync(MIGRATION_MARKER_FILE)) {
      try {
        unlinkSync(MIGRATION_MARKER_FILE);
        log('Migration marker removed', options, 'success');
      } catch (error) {
        const message = formatError(error);
        stats.errors.push(`Marker removal: ${message}`);
        log('Failed to remove marker', options, 'error', { error: message });
      }
    }

    // Remove rollback data
    if (existsSync(ROLLBACK_DATA_FILE)) {
      try {
        unlinkSync(ROLLBACK_DATA_FILE);
        log('Rollback data removed', options, 'success');
      } catch (error) {
        const message = formatError(error);
        stats.errors.push(`Rollback data removal: ${message}`);
        log('Failed to remove rollback data', options, 'error', { error: message });
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

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  stats.completedAt = new Date();
  stats.durationMs = stats.completedAt.getTime() - stats.startedAt.getTime();

  console.log(formatSectionHeader('Rollback Summary'));
  console.log(formatKeyValueList([
    ['Role Audits', `${stats.roleChanges} deleted`],
    ['Baselines', `${stats.baselines} deleted`],
    ['Events', `${stats.events} deleted`],
    ['Duration', `${(stats.durationMs / 1000).toFixed(2)}s`],
    ['Errors', String(stats.errors.length)],
  ]));

  if (stats.errors.length > 0) {
    printError('Errors encountered:');
    console.log(formatList(stats.errors.slice(0, 10)));
    if (stats.errors.length > 10) {
      printInfo(`... and ${stats.errors.length - 10} more`);
    }
  }

  if (options.dryRun) {
    printInfo('This was a DRY RUN. Run without --dry-run to perform rollback.');
  } else {
    printSuccess('Rollback complete. You can now re-run migration if needed.');
  }
}

// Run rollback
rollback().catch((error) => {
  envelopeLog.error('rollback', 'Rollback failed with error', {
    error: formatError(error),
  });
  printError(`Rollback failed with error: ${error}`);
  process.exit(1);
});
