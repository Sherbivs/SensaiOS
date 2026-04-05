/**
 * Kernel Persistence — Unified Output and Storage Management
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * DATABASE-FIRST ARCHITECTURE (2025-12-27)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * All persistence now uses PostgreSQL via Prisma:
 * - RuntimeMetric table — Snapshots, crash reports, metrics history
 * - CacheEntry table — State exports, logs
 * 
 * NO FILE WRITES. All data stored in database for proper scaling.
 * 
 * @module kernel/persistence
 */

import { prisma } from '../shared/prisma.js';
import { kernel, getKernelUptime, exportKernelLogs } from './kernel-logger.js';
import { exportErrorData, getErrorStats } from './kernel-error-detector.js';
import { exportKernelState, getMetrics as _getMetrics } from './kernel-observer.js';
import { exportMetrics, getDashboard } from './kernel-metrics.js';
import { TIER } from '../config/resource-tiers.js';
import { getEffectiveRetentionDays } from './database-resource-manager.js';
const writePersistenceError = (message: string, error: unknown): void => {
  const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message} ${details}\n`);
};

// ============================================================================
// TYPES
// ============================================================================

export interface PersistenceConfig {
  /** Enable/disable persistence entirely */
  enabled: boolean;
  /** How often to save periodic snapshots (0 = disabled) */
  snapshotIntervalMs: number;
  /** How long to keep old entries in database (days) */
  retentionDays: number;
  /** Maximum snapshots stored per day (prevents runaway) */
  maxSnapshotsPerDay: number;
  /** Whether to export full state on graceful shutdown */
  exportOnShutdown: boolean;
  /** How often to run garbage collection (default: 4 hours) */
  gcIntervalMs: number;
  /** Database size warning threshold in MB (derived from TIER.database.sizeWarnMb) */
  dbSizeWarnMb: number;
  /** Database size emergency threshold in MB — triggers aggressive pruning (derived from TIER.database.sizeEmergencyMb) */
  dbSizeEmergencyMb: number;
}

export interface KernelSnapshot {
  id: string;
  timestamp: string;
  uptimeMs: number;
  type: 'PERIODIC' | 'SHUTDOWN' | 'CRASH' | 'MANUAL';
  summary: {
    kernelLogEntries: number;
    kernelErrors: number;
    registeredSystems: number;
    healthStatus: string;
    phase: string;
  };
  paths: {
    logs?: string;
    errors?: string;
    state?: string;
    metrics?: string;
    full?: string;
  };
}

export interface DatabaseExportHook {
  name: string;
  enabled: boolean;
  exportLogs: (logs: ReturnType<typeof exportKernelLogs>) => Promise<void>;
  exportErrors: (errors: ReturnType<typeof exportErrorData>) => Promise<void>;
  exportState: (state: ReturnType<typeof exportKernelState>) => Promise<void>;
  exportMetrics: (metrics: ReturnType<typeof exportMetrics>) => Promise<void>;
}

// ============================================================================
// CONSTANTS — Database namespaces
// ============================================================================

const NAMESPACES = {
  snapshots: 'kernel-snapshots',
  crashes: 'kernel-crashes',
  exports: 'kernel-exports',
  metrics: 'kernel-metrics',
  logs: 'kernel-logs',
} as const;

const DEFAULT_CONFIG: PersistenceConfig = {
  enabled: true,
  snapshotIntervalMs: TIER.database.snapshotIntervalMs,
  retentionDays: TIER.database.retentionDays,
  maxSnapshotsPerDay: TIER.database.maxSnapshotsPerDay,
  exportOnShutdown: true,
  gcIntervalMs: TIER.database.gcIntervalMs,
  dbSizeWarnMb: TIER.database.sizeWarnMb,
  dbSizeEmergencyMb: TIER.database.sizeEmergencyMb,
};

/** Maximum snapshots to keep in memory history */
const MAX_SNAPSHOT_HISTORY = 100;

/** Calculate expiration date based on adaptive retention (DB Resource Manager) */
function getExpirationDate(): Date {
  const days = getEffectiveRetentionDays();
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// ============================================================================
// STATE
// ============================================================================

let config: PersistenceConfig = { ...DEFAULT_CONFIG };
let snapshotInterval: NodeJS.Timeout | null = null;
let gcInterval: NodeJS.Timeout | null = null;
let snapshotCount = 0;
let lastSnapshotTime = 0;
let lastGcTime = 0;
let gcRunCount = 0;
let gcTotalDeleted = 0;
const databaseHooks: DatabaseExportHook[] = [];
const snapshotHistory: KernelSnapshot[] = [];
let initialized = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize persistence system
 */
export function initializePersistence(customConfig?: Partial<PersistenceConfig>): void {
  if (initialized) {
    kernel.warn('persistence', 'Persistence already initialized, skipping');
    return;
  }
  
  config = { ...DEFAULT_CONFIG, ...customConfig };
  
  if (!config.enabled) {
    kernel.info('persistence', 'Persistence disabled by configuration');
    initialized = true;
    return;
  }
  
  kernel.boot('persistence', 'Initializing kernel persistence layer (database-first)');
  
  // Start snapshot interval if configured
  if (config.snapshotIntervalMs > 0) {
    startSnapshotScheduler();
  }
  
  // Start garbage collection scheduler
  if (config.gcIntervalMs > 0) {
    startGcScheduler();
  }
  
  initialized = true;
  kernel.boot('persistence', 'Kernel persistence initialized', {
    snapshotIntervalMs: config.snapshotIntervalMs,
    retentionDays: config.retentionDays,
    gcIntervalMs: config.gcIntervalMs,
    storage: 'PostgreSQL (database-first)',
  });
}

// No directory operations needed — using database

// ============================================================================
// SNAPSHOT SCHEDULER
// ============================================================================

/** Track consecutive failures for backoff */
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_BACKOFF_MS = 30_000; // 30 seconds

/**
 * Start the automatic snapshot scheduler
 */
function startSnapshotScheduler(): void {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
  }
  
  snapshotInterval = setInterval(async () => {
    try {
      // Check daily limit before attempting
      const today = new Date().toDateString();
      const todayCount = snapshotHistory.filter(
        s => new Date(s.timestamp).toDateString() === today
      ).length;
      
      if (todayCount >= config.maxSnapshotsPerDay) {
        kernel.debug('persistence', 'Daily snapshot limit reached, skipping');
        return;
      }
      
      await saveSnapshot('PERIODIC');
      consecutiveFailures = 0; // Reset on success
    } catch (error) {
      consecutiveFailures++;
      kernel.error('persistence', `Periodic snapshot failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${error}`);
      
      // Pause scheduler after too many consecutive failures
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        kernel.warn('persistence', `Too many failures, pausing scheduler for ${FAILURE_BACKOFF_MS / 1000}s`);
        stopSnapshotScheduler();
        setTimeout(() => {
          consecutiveFailures = 0;
          startSnapshotScheduler();
          kernel.info('persistence', 'Snapshot scheduler resumed after backoff');
        }, FAILURE_BACKOFF_MS);
      }
    }
  }, config.snapshotIntervalMs);
  
  kernel.info('persistence', `Snapshot scheduler started (every ${config.snapshotIntervalMs / 1000}s)`);
}

/**
 * Stop the snapshot scheduler
 */
function stopSnapshotScheduler(): void {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
    snapshotInterval = null;
    kernel.info('persistence', 'Snapshot scheduler stopped');
  }
}

// ============================================================================
// SNAPSHOT OPERATIONS
// ============================================================================

/**
 * Save a kernel snapshot to database
 */
export async function saveSnapshot(
  type: KernelSnapshot['type'] = 'MANUAL'
): Promise<KernelSnapshot> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `snapshot-${timestamp}-${type.toLowerCase()}`;
  const uptimeMs = getKernelUptime();
  
  kernel.debug('persistence', `Creating ${type} snapshot: ${id}`);
  
  const dashboard = getDashboard();
  const snapshot: KernelSnapshot = {
    id,
    timestamp: new Date().toISOString(),
    uptimeMs,
    type,
    summary: {
      kernelLogEntries: dashboard.kernelLogEntries,
      kernelErrors: dashboard.kernelErrors,
      registeredSystems: dashboard.totalSystems,
      healthStatus: dashboard.currentPhase,
      phase: dashboard.currentPhase,
    },
    paths: {},
  };
  
  // Determine what to save based on type
  const saveAll = type === 'SHUTDOWN' || type === 'CRASH' || type === 'MANUAL';
  
  try {
    // Always save summary to RuntimeMetric
    await prisma.runtimeMetric.create({
      data: {
        metricType: 'kernel-snapshot',
        trigger: type,
        uptimeMs,
        metadata: snapshot as object,
      },
    });
    snapshot.paths.full = `db:${NAMESPACES.snapshots}/${id}`;
    
    // Save logs (periodic/shutdown/crash)
    if (saveAll || type === 'PERIODIC') {
      const logs = exportKernelLogs();
      await prisma.cacheEntry.upsert({
        where: { key: `${id}-logs` },
        update: { value: logs as object, updatedAt: new Date() },
        create: {
          key: `${id}-logs`,
          namespace: NAMESPACES.logs,
          value: logs as object,
          sizeBytes: JSON.stringify(logs).length,
          expiresAt: getExpirationDate(),
        },
      });
      snapshot.paths.logs = `db:${NAMESPACES.logs}/${id}-logs`;
    }
    
    // Save errors (if any, or on shutdown/crash)
    const errorStats = getErrorStats();
    if (errorStats.totalErrors > 0 || type === 'SHUTDOWN' || type === 'CRASH') {
      const errors = exportErrorData();
      await prisma.cacheEntry.upsert({
        where: { key: `${id}-errors` },
        update: { value: errors as object, updatedAt: new Date() },
        create: {
          key: `${id}-errors`,
          namespace: NAMESPACES.snapshots,
          value: errors as object,
          sizeBytes: JSON.stringify(errors).length,
          expiresAt: getExpirationDate(),
        },
      });
      snapshot.paths.errors = `db:${NAMESPACES.snapshots}/${id}-errors`;
    }
    
    // Save full state on shutdown/crash/manual
    if (saveAll) {
      const state = exportKernelState();
      await prisma.cacheEntry.upsert({
        where: { key: `${id}-state` },
        update: { value: state as object, updatedAt: new Date() },
        create: {
          key: `${id}-state`,
          namespace: NAMESPACES.snapshots,
          value: state as object,
          sizeBytes: JSON.stringify(state).length,
          expiresAt: getExpirationDate(),
        },
      });
      snapshot.paths.state = `db:${NAMESPACES.snapshots}/${id}-state`;
      
      const metrics = exportMetrics();
      await prisma.cacheEntry.upsert({
        where: { key: `${id}-metrics` },
        update: { value: metrics as object, updatedAt: new Date() },
        create: {
          key: `${id}-metrics`,
          namespace: NAMESPACES.metrics,
          value: metrics as object,
          sizeBytes: JSON.stringify(metrics).length,
          expiresAt: getExpirationDate(),
        },
      });
      snapshot.paths.metrics = `db:${NAMESPACES.metrics}/${id}-metrics`;
    }
    
    // Track snapshot
    snapshotCount++;
    lastSnapshotTime = Date.now();
    snapshotHistory.push(snapshot);
    
    // Keep history bounded (ring buffer behavior)
    while (snapshotHistory.length > MAX_SNAPSHOT_HISTORY) {
      snapshotHistory.shift();
    }
    
    kernel.info('persistence', `Snapshot saved: ${id}`, {
      type,
      files: Object.keys(snapshot.paths).length,
    });
    
    // Export to database hooks
    await exportToDatabase(type);
    
  } catch (error) {
    kernel.error('persistence', `Snapshot failed: ${error}`, { id, type });
    throw error;
  }
  
  return snapshot;
}

/**
 * Save crash report to database (async, with console fallback)
 */
export function saveCrashReport(reason: string, error?: Error): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const crashKey = `crash-${timestamp}`;
  
  try {
    const crashReport = {
      timestamp: new Date().toISOString(),
      uptimeMs: getKernelUptime(),
      reason,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : null,
      dashboard: getDashboard(),
      errorStats: getErrorStats(),
      logs: exportKernelLogs(),
      state: exportKernelState(),
      metrics: exportMetrics(),
    };
    
    // Fire-and-forget database write (crash context, can't await)
    prisma.runtimeMetric.create({
      data: {
        metricType: 'kernel-crash',
        trigger: reason,
        uptimeMs: getKernelUptime(),
        metadata: crashReport as object,
      },
    }).catch((dbErr: Error) => {
      writePersistenceError('[KERNEL-PERSISTENCE] DB crash save failed:', dbErr);
    });
    
    kernel.critical('persistence', `Crash report queued: db:${NAMESPACES.crashes}/${crashKey}`);
    return `db:${NAMESPACES.crashes}/${crashKey}`;
  } catch (writeError) {
    writePersistenceError('[KERNEL-PERSISTENCE] Failed to save crash report:', writeError);
    return '';
  }
}

// ============================================================================
// ON-DEMAND EXPORT
// ============================================================================

/**
 * Export full kernel state to database
 */
export async function exportFullState(tag?: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const exportKey = tag 
    ? `export-${timestamp}-${tag}`
    : `export-${timestamp}`;
  
  try {
    const fullExport = {
      exportedAt: new Date().toISOString(),
      tag: tag ?? null,
      uptimeMs: getKernelUptime(),
      dashboard: getDashboard(),
      logs: exportKernelLogs(),
      errors: exportErrorData(),
      state: exportKernelState(),
      metrics: exportMetrics(),
    };
    
    await prisma.cacheEntry.upsert({
      where: { key: exportKey },
      update: { value: fullExport as object, updatedAt: new Date() },
      create: {
        key: exportKey,
        namespace: NAMESPACES.exports,
        value: fullExport as object,
        sizeBytes: JSON.stringify(fullExport).length,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });
    
    kernel.info('persistence', `Full state exported: db:${NAMESPACES.exports}/${exportKey}`);
    return `db:${NAMESPACES.exports}/${exportKey}`;
  } catch (error) {
    kernel.error('persistence', `Export failed: ${error}`);
    throw error;
  }
}

/**
 * Export metrics history to database
 */
export async function exportMetricsHistory(): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const metricsKey = `metrics-${timestamp}`;
  
  try {
    const metricsExport = {
      exportedAt: new Date().toISOString(),
      uptimeMs: getKernelUptime(),
      current: exportMetrics(),
      snapshotCount,
      lastSnapshotTime: lastSnapshotTime ? new Date(lastSnapshotTime).toISOString() : null,
    };
    
    await prisma.cacheEntry.upsert({
      where: { key: metricsKey },
      update: { value: metricsExport as object, updatedAt: new Date() },
      create: {
        key: metricsKey,
        namespace: NAMESPACES.metrics,
        value: metricsExport as object,
        sizeBytes: JSON.stringify(metricsExport).length,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
    
    kernel.info('persistence', `Metrics exported: db:${NAMESPACES.metrics}/${metricsKey}`);
    return `db:${NAMESPACES.metrics}/${metricsKey}`;
  } catch (error) {
    kernel.error('persistence', `Metrics export failed: ${error}`);
    throw error;
  }
}

// ============================================================================
// DATABASE HOOKS
// ============================================================================

/**
 * Register a database export hook
 */
export function registerDatabaseHook(hook: DatabaseExportHook): void {
  databaseHooks.push(hook);
  kernel.info('persistence', `Database hook registered: ${hook.name}`);
}

/**
 * Unregister a database export hook
 */
export function unregisterDatabaseHook(name: string): void {
  const index = databaseHooks.findIndex(h => h.name === name);
  if (index >= 0) {
    databaseHooks.splice(index, 1);
    kernel.info('persistence', `Database hook unregistered: ${name}`);
  }
}

/**
 * Export to all registered database hooks
 */
async function exportToDatabase(_triggerType: KernelSnapshot['type']): Promise<void> {
  const enabledHooks = databaseHooks.filter(h => h.enabled);
  
  if (enabledHooks.length === 0) {
    return;
  }
  
  kernel.debug('persistence', `Exporting to ${enabledHooks.length} database hook(s)`);
  
  // Gather data once
  const logs = exportKernelLogs();
  const errors = exportErrorData();
  const state = exportKernelState();
  const metrics = exportMetrics();
  
  // Export to each hook
  for (const hook of enabledHooks) {
    try {
      await Promise.all([
        hook.exportLogs(logs),
        hook.exportErrors(errors),
        hook.exportState(state),
        hook.exportMetrics(metrics),
      ]);
      kernel.debug('persistence', `Database export complete: ${hook.name}`);
    } catch (error) {
      kernel.error('persistence', `Database hook failed: ${hook.name}`, { error: String(error) });
    }
  }
}

// ============================================================================
// GARBAGE COLLECTION SCHEDULER
// ============================================================================

/** GC consecutive failures for backoff */
let gcConsecutiveFailures = 0;
const GC_MAX_CONSECUTIVE_FAILURES = 3;
const GC_FAILURE_BACKOFF_MS = 60_000; // 1 minute

/**
 * Start the garbage collection scheduler.
 * Runs an immediate catch-up collection, then periodically.
 */
function startGcScheduler(): void {
  if (gcInterval) {
    clearInterval(gcInterval);
  }

  kernel.info('persistence', `GC scheduler starting (every ${config.gcIntervalMs / 1000 / 60} min, retention: ${config.retentionDays} days)`);

  // Run immediate catch-up GC on startup (delayed 30s to let boot finish)
  setTimeout(async () => {
    try {
      kernel.info('persistence', 'Running startup GC catch-up...');
      await runGarbageCollection();
      gcConsecutiveFailures = 0;
    } catch (error) {
      kernel.error('persistence', `Startup GC catch-up failed: ${error}`);
    }
  }, 30_000);

  // Periodic GC
  gcInterval = setInterval(async () => {
    try {
      await runGarbageCollection();
      gcConsecutiveFailures = 0;
    } catch (error) {
      gcConsecutiveFailures++;
      kernel.error('persistence', `GC failed (${gcConsecutiveFailures}/${GC_MAX_CONSECUTIVE_FAILURES}): ${error}`);

      if (gcConsecutiveFailures >= GC_MAX_CONSECUTIVE_FAILURES) {
        kernel.warn('persistence', `Too many GC failures, pausing for ${GC_FAILURE_BACKOFF_MS / 1000}s`);
        stopGcScheduler();
        setTimeout(() => {
          gcConsecutiveFailures = 0;
          startGcScheduler();
          kernel.info('persistence', 'GC scheduler resumed after backoff');
        }, GC_FAILURE_BACKOFF_MS);
      }
    }
  }, config.gcIntervalMs);
}

/**
 * Stop the garbage collection scheduler
 */
function stopGcScheduler(): void {
  if (gcInterval) {
    clearInterval(gcInterval);
    gcInterval = null;
    kernel.info('persistence', 'GC scheduler stopped');
  }
}

/**
 * Run a full garbage collection cycle:
 * 1. Delete expired CacheEntry rows (expiresAt < now) across ALL namespaces
 * 2. Delete old kernel entries beyond retention period (createdAt-based)
 * 3. Delete old RuntimeMetric records beyond retention period
 * 4. Check DB size and trigger aggressive pruning if needed
 */
async function runGarbageCollection(): Promise<void> {
  const startTime = Date.now();
  let totalDeleted = 0;

  const now = new Date();
  const effectiveDays = getEffectiveRetentionDays();
  const retentionCutoff = new Date(now.getTime() - effectiveDays * 24 * 60 * 60 * 1000);

  if (effectiveDays < config.retentionDays) {
    kernel.info('persistence', `GC using adaptive retention: ${effectiveDays}d (reduced from ${config.retentionDays}d due to DB pressure)`);
  }

  // Phase 1: Delete expired entries across ALL namespaces (TTL enforcement)
  try {
    const expired = await prisma.cacheEntry.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    if (expired.count > 0) {
      kernel.info('persistence', `GC Phase 1: Deleted ${expired.count} expired cache entries`);
      totalDeleted += expired.count;
    }
  } catch (err) {
    kernel.error('persistence', `GC Phase 1 (expired entries) failed: ${err}`);
  }

  // Phase 2: Delete old kernel namespace entries beyond retention period
  try {
    const oldKernel = await prisma.cacheEntry.deleteMany({
      where: {
        namespace: { in: Object.values(NAMESPACES) },
        createdAt: { lt: retentionCutoff },
      },
    });
    if (oldKernel.count > 0) {
      kernel.info('persistence', `GC Phase 2: Deleted ${oldKernel.count} old kernel entries`);
      totalDeleted += oldKernel.count;
    }
  } catch (err) {
    kernel.error('persistence', `GC Phase 2 (old kernel entries) failed: ${err}`);
  }

  // Phase 3: Delete old RuntimeMetric records beyond retention period
  try {
    const oldMetrics = await prisma.runtimeMetric.deleteMany({
      where: {
        metricType: { in: ['kernel-snapshot', 'kernel-crash'] },
        createdAt: { lt: retentionCutoff },
      },
    });
    if (oldMetrics.count > 0) {
      kernel.info('persistence', `GC Phase 3: Deleted ${oldMetrics.count} old runtime metrics`);
      totalDeleted += oldMetrics.count;
    }
  } catch (err) {
    kernel.error('persistence', `GC Phase 3 (old runtime metrics) failed: ${err}`);
  }

  // Phase 4: Database size check — aggressive pruning if over thresholds
  try {
    const sizeResult = await prisma.$queryRawUnsafe<Array<{ size_bytes: bigint }>>(
      `SELECT pg_database_size(current_database()) as size_bytes`
    );
    const dbSizeMb = Number(sizeResult[0]?.size_bytes ?? 0) / (1024 * 1024);

    if (dbSizeMb >= config.dbSizeEmergencyMb) {
      kernel.warn('persistence', `🚨 DB SIZE EMERGENCY: ${dbSizeMb.toFixed(0)} MB / ${TIER.database.storageLimitMb} MB — aggressive prune triggered`);
      const emergencyDeleted = await aggressivePrune(1); // Keep only 1 day
      totalDeleted += emergencyDeleted;
    } else if (dbSizeMb >= config.dbSizeWarnMb) {
      kernel.warn('persistence', `⚠️ DB SIZE WARNING: ${dbSizeMb.toFixed(0)} MB / ${TIER.database.storageLimitMb} MB — reducing retention to 3 days`);
      const warnDeleted = await aggressivePrune(3); // Keep only 3 days
      totalDeleted += warnDeleted;
    } else {
      kernel.debug('persistence', `DB size: ${dbSizeMb.toFixed(0)} MB / ${TIER.database.storageLimitMb} MB (OK)`);
    }
  } catch (err) {
    kernel.error('persistence', `GC Phase 4 (size check) failed: ${err}`);
  }

  const durationMs = Date.now() - startTime;
  lastGcTime = Date.now();
  gcRunCount++;
  gcTotalDeleted += totalDeleted;

  if (totalDeleted > 0) {
    kernel.info('persistence', `GC complete: ${totalDeleted} entries deleted in ${durationMs}ms (run #${gcRunCount}, lifetime: ${gcTotalDeleted})`);
  } else {
    kernel.debug('persistence', `GC complete: nothing to clean (${durationMs}ms)`);
  }
}

/**
 * Aggressive pruning — reduce retention to N days for all kernel data.
 * Used when DB approaches size limits.
 */
async function aggressivePrune(keepDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - keepDays * 24 * 60 * 60 * 1000);
  let deleted = 0;

  try {
    const cacheResult = await prisma.cacheEntry.deleteMany({
      where: {
        namespace: { in: Object.values(NAMESPACES) },
        createdAt: { lt: cutoff },
      },
    });
    deleted += cacheResult.count;

    const metricsResult = await prisma.runtimeMetric.deleteMany({
      where: {
        metricType: { in: ['kernel-snapshot', 'kernel-crash'] },
        createdAt: { lt: cutoff },
      },
    });
    deleted += metricsResult.count;

    kernel.info('persistence', `Aggressive prune (keep ${keepDays}d): deleted ${deleted} entries`);
  } catch (err) {
    kernel.error('persistence', `Aggressive prune failed: ${err}`);
  }

  return deleted;
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Clean up old entries based on retention policy (database)
 */
export async function cleanupOldFiles(): Promise<{ deleted: number; errors: number }> {
  const effectiveDays = getEffectiveRetentionDays();
  const cutoffTime = new Date(Date.now() - (effectiveDays * 24 * 60 * 60 * 1000));
  let deleted = 0;
  let errors = 0;
  
  kernel.info('persistence', `Cleaning up entries older than ${effectiveDays} days (adaptive retention)`);
  
  try {
    // Clean up old CacheEntry records for kernel namespaces
    const result = await prisma.cacheEntry.deleteMany({
      where: {
        namespace: { in: Object.values(NAMESPACES) },
        createdAt: { lt: cutoffTime },
      },
    });
    deleted += result.count;
    
    // Clean up old RuntimeMetric records for kernel types
    const metricsResult = await prisma.runtimeMetric.deleteMany({
      where: {
        metricType: { in: ['kernel-snapshot', 'kernel-crash'] },
        createdAt: { lt: cutoffTime },
      },
    });
    deleted += metricsResult.count;
    
  } catch (err) {
    kernel.error('persistence', `Cleanup failed: ${err}`);
    errors++;
  }
  
  kernel.info('persistence', `Cleanup complete: ${deleted} deleted, ${errors} errors`);
  return { deleted, errors };
}

// ============================================================================
// QUERY / LIST
// ============================================================================

/**
 * List available snapshots (most recent first)
 */
export function listSnapshots(): KernelSnapshot[] {
  return [...snapshotHistory].reverse();
}

/**
 * Get persistence statistics
 */
export function getPersistenceStats(): {
  enabled: boolean;
  initialized: boolean;
  snapshotCount: number;
  lastSnapshotTime: string | null;
  historySize: number;
  maxHistorySize: number;
  registeredHooks: number;
  schedulerActive: boolean;
  consecutiveFailures: number;
  namespaces: typeof NAMESPACES;
  config: PersistenceConfig;
  gc: {
    schedulerActive: boolean;
    runCount: number;
    totalDeleted: number;
    lastRunTime: string | null;
    consecutiveFailures: number;
  };
} {
  return {
    enabled: config.enabled,
    initialized,
    snapshotCount,
    lastSnapshotTime: lastSnapshotTime ? new Date(lastSnapshotTime).toISOString() : null,
    historySize: snapshotHistory.length,
    maxHistorySize: MAX_SNAPSHOT_HISTORY,
    registeredHooks: databaseHooks.length,
    schedulerActive: snapshotInterval !== null,
    consecutiveFailures,
    namespaces: NAMESPACES,
    config,
    gc: {
      schedulerActive: gcInterval !== null,
      runCount: gcRunCount,
      totalDeleted: gcTotalDeleted,
      lastRunTime: lastGcTime ? new Date(lastGcTime).toISOString() : null,
      consecutiveFailures: gcConsecutiveFailures,
    },
  };
}

// ============================================================================
// SHUTDOWN
// ============================================================================

/**
 * Shutdown persistence (save final snapshot)
 */
export async function shutdownPersistence(): Promise<void> {
  kernel.boot('persistence', 'Kernel persistence shutting down');
  
  stopSnapshotScheduler();
  stopGcScheduler();
  
  if (config.exportOnShutdown) {
    try {
      await saveSnapshot('SHUTDOWN');
      kernel.info('persistence', 'Shutdown snapshot saved');
    } catch (error) {
      kernel.error('persistence', `Shutdown snapshot failed: ${error}`);
    }
  }
  
  kernel.boot('persistence', 'Kernel persistence shutdown complete');
}

// ============================================================================
// FACTORY HOOKS (for common database integrations)
// ============================================================================

/**
 * Create a Prisma database hook (primary persistence method)
 * 
 * Creates a hook that exports kernel data to CacheEntry table.
 * The global prisma client is used for all operations.
 * 
 * @param options - Configuration for the hook
 * @returns DatabaseExportHook instance
 */
export function createPrismaHook(
  options?: { namespace?: string; enabled?: boolean }
): DatabaseExportHook {
  const namespace = options?.namespace ?? 'kernel-prisma';
  
  return {
    name: `prisma-${namespace}`,
    enabled: options?.enabled ?? true,
    
    exportLogs: async (logs) => {
      await prisma.cacheEntry.upsert({
        where: { key: `${namespace}:logs` },
        update: { value: logs as object, updatedAt: new Date() },
        create: {
          key: `${namespace}:logs`,
          namespace,
          value: logs as object,
          sizeBytes: JSON.stringify(logs).length,
        },
      });
      kernel.trace('persistence', `[prisma] Exported ${logs.entries.length} logs to ${namespace}`);
    },
    
    exportErrors: async (errors) => {
      await prisma.cacheEntry.upsert({
        where: { key: `${namespace}:errors` },
        update: { value: errors as object, updatedAt: new Date() },
        create: {
          key: `${namespace}:errors`,
          namespace,
          value: errors as object,
          sizeBytes: JSON.stringify(errors).length,
        },
      });
      kernel.trace('persistence', `[prisma] Exported ${errors.errors.length} errors`);
    },
    
    exportState: async (state) => {
      await prisma.cacheEntry.upsert({
        where: { key: `${namespace}:state` },
        update: { value: state as object, updatedAt: new Date() },
        create: {
          key: `${namespace}:state`,
          namespace,
          value: state as object,
          sizeBytes: JSON.stringify(state).length,
        },
      });
      kernel.trace('persistence', `[prisma] Exported state snapshot`);
    },
    
    exportMetrics: async (metrics) => {
      await prisma.cacheEntry.upsert({
        where: { key: `${namespace}:metrics` },
        update: { value: metrics as object, updatedAt: new Date() },
        create: {
          key: `${namespace}:metrics`,
          namespace,
          value: metrics as object,
          sizeBytes: JSON.stringify(metrics).length,
        },
      });
      kernel.trace('persistence', `[prisma] Exported metrics`);
    },
  };
}

// createFileDbHook removed — Database-First Architecture (2025-12-27)
