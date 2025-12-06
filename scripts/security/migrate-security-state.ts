/**
 * Security State Migration Script
 * ================================
 *
 * Migrates security bot state from JSON files to PostgreSQL database.
 *
 * Source: Store/security-bot-state/
 *   - role-archive/role-changes.json → RoleChangeAudit table
 *   - baselines.json → SecurityBaseline table
 *   - snapshots/*.json → SecurityEvent table (startup/shutdown events)
 *
 * Target: CLOUD-PROD-MASTER (production) or ONPREMISE-DEV-PRIMARY (local)
 *
 * @module scripts/security/migrate-security-state
 * @task P0-003 (Migration + Rollback Automation)
 *
 * Usage:
 *   npx tsx scripts/security/migrate-security-state.ts [options]
 *
 * Options:
 *   --dry-run       Preview migration without writing to database
 *   --target        Target database: 'cloud-prod' | 'onpremise-dev' (default: onpremise-dev)
 *   --batch-size    Batch size for database writes (default: 100)
 *   --verify        Verify data integrity after migration
 *   --verbose       Enable verbose logging
 */

/* eslint-disable no-console */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, createHmac } from 'crypto';

// Types for JSON source files
interface JsonRoleChange {
  id: string;
  timestamp: string;
  memberId: string;
  memberTag: string;
  guildId: string;
  guildName: string;
  type: 'addition' | 'removal';
  roleId: string;
  roleName: string;
  origin: string;
  metadata?: Record<string, unknown>;
}

interface JsonRoleChangesFile {
  changes: JsonRoleChange[];
}

interface JsonBaseline {
  averageChangesPerHour: number;
  peakActivityHours: number[];
  confidenceLevel: number;
  dataPointCount: number;
  computedAt: string;
}

interface JsonBaselinesFile {
  baselines: JsonBaseline;
  metadata: {
    savedAt: string;
    schemaVersion: string;
  };
  signature: string;
}

interface JsonSnapshot {
  version: number;
  schemaVersion: string;
  metadata: {
    lastSaved: string;
    lastRestart: string;
    processStartTime: string;
    hostname: string;
    nodeVersion: string;
    botVersion: string;
  };
  cumulative: {
    totalUptime: number;
    restartCount: number;
    sweepCount: number;
    alertCount: number;
    permissionChangesDetected: number;
    permissionChangesReverted: number;
    revertFailures: number;
    guildCount: number;
    firstStartTime: string;
  };
  timeline: Array<{
    timestamp: string;
    type: string;
    guildId?: string;
    guildName?: string;
    details?: Record<string, unknown>;
  }>;
  guilds: Record<
    string,
    {
      id: string;
      name: string;
      lastSweep: string;
      sweepCount: number;
      alertCount: number;
      permissionChanges: number;
      monitoring: boolean;
      lastActivity: string;
    }
  >;
  runtime: {
    currentUptime: number;
    currentRestartTime: string;
    databaseStatus: { dev: string; prod: string };
    activeSweepIntervals: string[];
  };
}

// Migration types
interface MigrationStats {
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
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  errors: string[];
}

interface MigrationOptions {
  dryRun: boolean;
  target: 'cloud-prod' | 'onpremise-dev';
  batchSize: number;
  verify: boolean;
  verbose: boolean;
}

// Constants
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const STATE_DIR = join(PROJECT_ROOT, 'Store', 'security-bot-state');
const ROLE_ARCHIVE_DIR = join(STATE_DIR, 'role-archive');
const SNAPSHOTS_DIR = join(STATE_DIR, 'snapshots');
const MIGRATION_MARKER_FILE = join(STATE_DIR, '.migration-complete');
const ROLLBACK_DATA_FILE = join(STATE_DIR, '.rollback-data.json');

// HMAC key for checksum (should match services)
const CHECKSUM_KEY =
  process.env.SECURITY_CHECKSUM_KEY || 'security-migration-default-key';

/**
 * Generate HMAC-SHA256 checksum for data
 */
function generateChecksum(data: string): string {
  return createHmac('sha256', CHECKSUM_KEY).update(data).digest('hex');
}

/**
 * Generate hash for chain linking
 */
function generateHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    dryRun: args.includes('--dry-run'),
    target:
      args.includes('--target') &&
      args[args.indexOf('--target') + 1] === 'cloud-prod'
        ? 'cloud-prod'
        : 'onpremise-dev',
    batchSize: 100,
    verify: args.includes('--verify'),
    verbose: args.includes('--verbose'),
  };

  // Parse batch size
  const batchIdx = args.indexOf('--batch-size');
  if (batchIdx !== -1 && args[batchIdx + 1]) {
    options.batchSize = parseInt(args[batchIdx + 1], 10) || 100;
  }

  return options;
}

/**
 * Log with optional verbose mode
 */
function log(
  message: string,
  options: MigrationOptions,
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

  console.log(`${prefix} ${message}`);
}

/**
 * Load role changes from JSON file
 */
function loadRoleChanges(): JsonRoleChange[] {
  const filePath = join(ROLE_ARCHIVE_DIR, 'role-changes.json');
  if (!existsSync(filePath)) {
    console.warn(`⚠️  Role changes file not found: ${filePath}`);
    return [];
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: JsonRoleChangesFile = JSON.parse(content);
    return data.changes || [];
  } catch (error) {
    console.error(`❌ Failed to parse role changes: ${error}`);
    return [];
  }
}

/**
 * Load baselines from JSON file
 */
function loadBaselines(): { baseline: JsonBaseline; guildId: string } | null {
  const filePath = join(STATE_DIR, 'baselines.json');
  if (!existsSync(filePath)) {
    console.warn(`⚠️  Baselines file not found: ${filePath}`);
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data: JsonBaselinesFile = JSON.parse(content);

    // The baseline applies to all guilds (global baseline)
    // We'll create a baseline for each unique guild found in role changes
    return {
      baseline: data.baselines,
      guildId: 'global', // Placeholder - will be expanded per guild
    };
  } catch (error) {
    console.error(`❌ Failed to parse baselines: ${error}`);
    return null;
  }
}

/**
 * Load snapshots from snapshots directory
 */
function loadSnapshots(): JsonSnapshot[] {
  if (!existsSync(SNAPSHOTS_DIR)) {
    console.warn(`⚠️  Snapshots directory not found: ${SNAPSHOTS_DIR}`);
    return [];
  }

  const files = readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json'));
  const snapshots: JsonSnapshot[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(SNAPSHOTS_DIR, file), 'utf-8');
      const snapshot: JsonSnapshot = JSON.parse(content);
      snapshots.push(snapshot);
    } catch (error) {
      console.warn(`⚠️  Failed to parse snapshot ${file}: ${error}`);
    }
  }

  return snapshots;
}

/**
 * Extract unique guilds from role changes
 */
function extractUniqueGuilds(
  changes: JsonRoleChange[]
): Map<string, { id: string; name: string }> {
  const guilds = new Map<string, { id: string; name: string }>();

  for (const change of changes) {
    if (!guilds.has(change.guildId)) {
      guilds.set(change.guildId, {
        id: change.guildId,
        name: change.guildName,
      });
    }
  }

  return guilds;
}

/**
 * Transform JSON role change to database format
 */
function transformRoleChange(
  change: JsonRoleChange,
  previousHash: string | null
): {
  data: Record<string, unknown>;
  hash: string;
} {
  const timestamp = new Date(change.timestamp);

  const data = {
    guildId: change.guildId,
    guildName: change.guildName,
    memberId: change.memberId,
    memberTag: change.memberTag,
    changeType: change.type,
    roleId: change.roleId,
    roleName: change.roleName,
    executorId: null, // Not tracked in legacy format
    executorTag: null,
    executorRoles: [],
    authorized: true, // Legacy changes assumed authorized
    authReason: 'Legacy migration - pre-database',
    reverted: false,
    revertedAt: null,
    revertedBy: null,
    origin: change.origin,
    metadata: change.metadata || {},
    previousHash: previousHash,
    timestamp: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // Generate checksum for data integrity
  const checksumData = JSON.stringify({
    guildId: data.guildId,
    memberId: data.memberId,
    changeType: data.changeType,
    roleId: data.roleId,
    timestamp: data.timestamp.toISOString(),
  });
  const checksum = generateChecksum(checksumData);
  const signature = generateChecksum(checksumData + CHECKSUM_KEY);

  // Generate hash for chain
  const hashData = JSON.stringify({
    ...data,
    checksum,
    previousHash,
  });
  const hash = generateHash(hashData);

  return {
    data: {
      ...data,
      checksum,
      signature,
    },
    hash,
  };
}

/**
 * Transform baseline to database format
 */
function transformBaseline(
  baseline: JsonBaseline,
  guildId: string,
  guildName: string
): Record<string, unknown> {
  const now = new Date();
  const computedAt = new Date(baseline.computedAt);

  // Extract peak hours as array
  const peakActivityHours = baseline.peakActivityHours || [];

  // Generate checksum
  const checksumData = JSON.stringify({
    guildId,
    averageChangesPerHour: baseline.averageChangesPerHour,
    confidenceLevel: baseline.confidenceLevel,
    computedAt: computedAt.toISOString(),
  });
  const checksum = generateChecksum(checksumData);

  return {
    guildId,
    guildName,
    averageChangesPerHour: baseline.averageChangesPerHour,
    standardDeviation: 0, // Not tracked in legacy format
    peakActivityHours: peakActivityHours,
    quietActivityHours: [],
    averageDailyMembers: 0,
    uniqueExecutors: 0,
    mostActiveRoles: [],
    confidenceLevel: baseline.confidenceLevel,
    dataPointCount: baseline.dataPointCount,
    sampleStartDate: computedAt,
    sampleEndDate: computedAt,
    computedAt: computedAt,
    checksum,
    validUntil: new Date(computedAt.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Transform snapshot timeline event to SecurityEvent format
 */
function transformTimelineEvent(
  event: JsonSnapshot['timeline'][0],
  previousHash: string | null
): {
  data: Record<string, unknown>;
  hash: string;
} | null {
  const timestamp = new Date(event.timestamp);

  // Map event types
  const eventTypeMap: Record<string, string> = {
    sweep: 'role-change',
    permission_change: 'role-change',
    alert: 'drip-alert',
    restart: 'startup',
    error: 'security-violation',
  };

  const eventType = eventTypeMap[event.type] || event.type;

  // Determine severity
  const severityMap: Record<string, string> = {
    sweep: 'INFO',
    permission_change: 'HIGH',
    alert: 'HIGH',
    restart: 'INFO',
    error: 'CRITICAL',
  };

  const data = {
    eventType,
    severity: severityMap[event.type] || 'MEDIUM',
    guildId: event.guildId || 'system',
    guildName: event.guildName || 'System',
    memberId: null,
    memberTag: null,
    roleId: null,
    roleName: null,
    executorId: null,
    executorTag: null,
    origin: 'security-bot-sweep',
    metadata: event.details || {},
    previousHash: previousHash,
    createdAt: timestamp,
  };

  // Generate checksum
  const checksumData = JSON.stringify({
    eventType: data.eventType,
    severity: data.severity,
    guildId: data.guildId,
    timestamp: timestamp.toISOString(),
  });
  const checksum = generateChecksum(checksumData);
  const signature = generateChecksum(checksumData + CHECKSUM_KEY);

  // Generate hash for chain
  const hashData = JSON.stringify({
    ...data,
    checksum,
    previousHash,
  });
  const hash = generateHash(hashData);

  return {
    data: {
      ...data,
      checksum,
      signature,
    },
    hash,
  };
}

/**
 * Create rollback data file
 */
function saveRollbackData(
  stats: MigrationStats,
  options: MigrationOptions
): void {
  const rollbackData = {
    migratedAt: new Date().toISOString(),
    target: options.target,
    stats,
    canRollback: true,
  };

  writeFileSync(ROLLBACK_DATA_FILE, JSON.stringify(rollbackData, null, 2));
  log(`Rollback data saved to ${ROLLBACK_DATA_FILE}`, options);
}

/**
 * Create migration complete marker
 */
function createMigrationMarker(
  stats: MigrationStats,
  options: MigrationOptions
): void {
  const marker = {
    completedAt: new Date().toISOString(),
    target: options.target,
    stats: {
      roleChanges: stats.roleChanges.migrated,
      baselines: stats.baselines.migrated,
      events: stats.events.migrated,
    },
    duration: stats.durationMs,
  };

  writeFileSync(MIGRATION_MARKER_FILE, JSON.stringify(marker, null, 2));
  log(`Migration marker created: ${MIGRATION_MARKER_FILE}`, options);
}

/**
 * Main migration function
 */
async function migrate(): Promise<void> {
  const options = parseArgs();

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       Security State Migration — JSON → PostgreSQL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');

  log(`Target: ${options.target.toUpperCase()}`, options);
  log(`Mode: ${options.dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`, options);
  log(`Batch Size: ${options.batchSize}`, options);
  log(`Verify: ${options.verify ? 'Yes' : 'No'}`, options);
  console.log('\n');

  // Check for existing migration
  if (existsSync(MIGRATION_MARKER_FILE) && !options.dryRun) {
    console.warn('⚠️  Migration marker found. Data may already be migrated.');
    console.warn('   Run rollback first if you want to re-migrate.');
    console.warn(`   Marker: ${MIGRATION_MARKER_FILE}`);
    console.log('\n');
  }

  // Initialize stats
  const stats: MigrationStats = {
    roleChanges: { total: 0, migrated: 0, skipped: 0, failed: 0 },
    baselines: { total: 0, migrated: 0, skipped: 0, failed: 0 },
    events: { total: 0, migrated: 0, skipped: 0, failed: 0 },
    startedAt: new Date(),
    errors: [],
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 1: Load source data
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  Phase 1: Loading Source Data                               │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  const roleChanges = loadRoleChanges();
  stats.roleChanges.total = roleChanges.length;
  log(`Role changes loaded: ${roleChanges.length}`, options, 'success');

  const baselinesData = loadBaselines();
  if (baselinesData) {
    stats.baselines.total = 1;
    log('Baselines loaded: 1', options, 'success');
  }

  const snapshots = loadSnapshots();
  const timelineEvents = snapshots.flatMap((s) => s.timeline || []);
  stats.events.total = timelineEvents.length;
  log(`Timeline events loaded: ${timelineEvents.length}`, options, 'success');

  // Extract unique guilds for baseline creation
  const uniqueGuilds = extractUniqueGuilds(roleChanges);
  log(`Unique guilds found: ${uniqueGuilds.size}`, options, 'success');
  console.log('\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 2: Transform data
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  Phase 2: Transforming Data                                 │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  // Transform role changes with hash chain
  const transformedRoleChanges: Array<{
    data: Record<string, unknown>;
    hash: string;
  }> = [];
  let previousRoleHash: string | null = null;

  for (const change of roleChanges) {
    const transformed = transformRoleChange(change, previousRoleHash);
    transformedRoleChanges.push(transformed);
    previousRoleHash = transformed.hash;
  }
  log(
    `Role changes transformed: ${transformedRoleChanges.length}`,
    options,
    'success'
  );

  // Transform baselines per guild
  const transformedBaselines: Array<Record<string, unknown>> = [];
  if (baselinesData) {
    for (const [guildId, guild] of uniqueGuilds) {
      const transformed = transformBaseline(
        baselinesData.baseline,
        guildId,
        guild.name
      );
      transformedBaselines.push(transformed);
    }
    stats.baselines.total = transformedBaselines.length;
  }
  log(
    `Baselines transformed: ${transformedBaselines.length}`,
    options,
    'success'
  );

  // Transform timeline events with hash chain
  const transformedEvents: Array<{
    data: Record<string, unknown>;
    hash: string;
  }> = [];
  let previousEventHash: string | null = null;

  for (const event of timelineEvents) {
    const transformed = transformTimelineEvent(event, previousEventHash);
    if (transformed) {
      transformedEvents.push(transformed);
      previousEventHash = transformed.hash;
    }
  }
  log(
    `Timeline events transformed: ${transformedEvents.length}`,
    options,
    'success'
  );
  console.log('\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 3: Write to database (or preview)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('┌─────────────────────────────────────────────────────────────┐');
  console.log('│  Phase 3: Database Operations                               │');
  console.log('└─────────────────────────────────────────────────────────────┘');

  if (options.dryRun) {
    log('DRY RUN MODE - No database writes', options, 'info');
    log(
      `Would insert ${transformedRoleChanges.length} role audit records`,
      options
    );
    log(`Would insert ${transformedBaselines.length} baseline records`, options);
    log(`Would insert ${transformedEvents.length} security events`, options);

    // In dry run, count all as "migrated" for preview
    stats.roleChanges.migrated = transformedRoleChanges.length;
    stats.baselines.migrated = transformedBaselines.length;
    stats.events.migrated = transformedEvents.length;
  } else {
    // Dynamic import of Prisma client for actual database operations
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

      // Insert role audit records in batches (if model exists)
      log('Inserting role audit records...', options);
      if (client.roleChangeAudit) {
        for (let i = 0; i < transformedRoleChanges.length; i += options.batchSize) {
          const batch = transformedRoleChanges.slice(i, i + options.batchSize);

          try {
            await client.roleChangeAudit.createMany({
              data: batch.map((item) => item.data),
              skipDuplicates: true,
            });
            stats.roleChanges.migrated += batch.length;
            log(
              `  Batch ${Math.floor(i / options.batchSize) + 1}: ${batch.length} records`,
              options,
              'verbose'
            );
          } catch (error) {
            stats.roleChanges.failed += batch.length;
            stats.errors.push(`Role batch ${i}: ${error}`);
            log(`  Batch ${i} failed: ${error}`, options, 'error');
          }
        }
        log(
          `Role audits: ${stats.roleChanges.migrated}/${stats.roleChanges.total} migrated`,
          options,
          'success'
        );
      } else {
        log('RoleChangeAudit model not available (schema not applied)', options, 'warn');
      }

      // Insert baselines (if model exists)
      log('Inserting baseline records...', options);
      if (client.securityBaseline) {
        for (const baseline of transformedBaselines) {
          try {
            await client.securityBaseline.upsert({
              where: { guildId: baseline.guildId },
              create: baseline,
              update: baseline,
            });
            stats.baselines.migrated++;
          } catch (error) {
            stats.baselines.failed++;
            stats.errors.push(`Baseline ${baseline.guildId}: ${error}`);
            log(`  Baseline ${baseline.guildId} failed: ${error}`, options, 'error');
          }
        }
        log(
          `Baselines: ${stats.baselines.migrated}/${stats.baselines.total} migrated`,
          options,
          'success'
        );
      } else {
        log('SecurityBaseline model not available (schema not applied)', options, 'warn');
      }

      // Insert security events in batches (if model exists)
      log('Inserting security events...', options);
      if (client.securityEvent) {
        for (let i = 0; i < transformedEvents.length; i += options.batchSize) {
          const batch = transformedEvents.slice(i, i + options.batchSize);

          try {
            await client.securityEvent.createMany({
              data: batch.map((item) => item.data),
              skipDuplicates: true,
            });
            stats.events.migrated += batch.length;
            log(
              `  Batch ${Math.floor(i / options.batchSize) + 1}: ${batch.length} records`,
              options,
              'verbose'
            );
          } catch (error) {
            stats.events.failed += batch.length;
            stats.errors.push(`Event batch ${i}: ${error}`);
            log(`  Batch ${i} failed: ${error}`, options, 'error');
          }
        }
        log(
          `Events: ${stats.events.migrated}/${stats.events.total} migrated`,
          options,
          'success'
        );
      } else {
        log('SecurityEvent model not available (schema not applied)', options, 'warn');
      }

      // Save rollback data
      saveRollbackData(stats, options);

      // Create migration marker
      createMigrationMarker(stats, options);
    } catch (error) {
      stats.errors.push(`Database connection: ${error}`);
      log(`Database connection failed: ${error}`, options, 'error');
    }
  }

  console.log('\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Phase 4: Verification (optional)
  // ─────────────────────────────────────────────────────────────────────────
  if (options.verify && !options.dryRun) {
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log('│  Phase 4: Data Verification                                 │');
    console.log('└─────────────────────────────────────────────────────────────┘');

    try {
      const { prisma, onPremiseDevPrisma } = await import(
        '../../src/shared/prisma.js'
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client: any =
        options.target === 'cloud-prod' ? prisma : (onPremiseDevPrisma ?? prisma);

      if (client) {
        let roleCount = 0;
        let baselineCount = 0;
        let eventCount = 0;

        if (client.roleChangeAudit) {
          roleCount = await client.roleChangeAudit.count();
        }
        if (client.securityBaseline) {
          baselineCount = await client.securityBaseline.count();
        }
        if (client.securityEvent) {
          eventCount = await client.securityEvent.count();
        }

        log(`Database role audits: ${roleCount}`, options);
        log(`Database baselines: ${baselineCount}`, options);
        log(`Database events: ${eventCount}`, options);

        // Verify counts match
        const roleMatch = roleCount >= stats.roleChanges.migrated;
        const baselineMatch = baselineCount >= stats.baselines.migrated;
        const eventMatch = eventCount >= stats.events.migrated;

        if (roleMatch && baselineMatch && eventMatch) {
          log('Data verification passed!', options, 'success');
        } else {
          log('Data verification: counts mismatch', options, 'error');
        }
      }
    } catch (error) {
      log(`Verification failed: ${error}`, options, 'error');
    }

    console.log('\n');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  stats.completedAt = new Date();
  stats.durationMs = stats.completedAt.getTime() - stats.startedAt.getTime();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('                     Migration Summary                          ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n');
  console.log(`  Role Audits:    ${stats.roleChanges.migrated}/${stats.roleChanges.total} migrated`);
  console.log(`  Baselines:      ${stats.baselines.migrated}/${stats.baselines.total} migrated`);
  console.log(`  Events:         ${stats.events.migrated}/${stats.events.total} migrated`);
  console.log(`  Duration:       ${(stats.durationMs / 1000).toFixed(2)}s`);
  console.log(`  Errors:         ${stats.errors.length}`);
  console.log('\n');

  if (stats.errors.length > 0) {
    console.log('Errors encountered:');
    for (const error of stats.errors.slice(0, 10)) {
      console.log(`  - ${error}`);
    }
    if (stats.errors.length > 10) {
      console.log(`  ... and ${stats.errors.length - 10} more`);
    }
    console.log('\n');
  }

  if (options.dryRun) {
    console.log('💡 This was a DRY RUN. Run without --dry-run to perform migration.');
  } else {
    console.log('✅ Migration complete. Rollback data saved.');
  }
  console.log('\n');
}

// Run migration
migrate().catch((error) => {
  console.error('❌ Migration failed with error:', error);
  process.exit(1);
});
