/**
 * Kernel Persistence — Unified Output and Storage Management
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZES ALL KERNEL DATA PERSISTENCE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides:
 * - File-based persistence for crash recovery and offline analysis
 * - Structured JSON exports for AI/ML pipelines
 * - Database integration hooks for long-term storage
 * - Automatic periodic snapshots
 * - Graceful shutdown export
 * 
 * Storage Locations:
 * - Store/kernel-logs/      — Real-time log files (kernel-{timestamp}.log)
 * - Store/kernel-snapshots/ — Periodic JSON snapshots
 * - Store/kernel-crashes/   — Crash reports and error dumps
 * - Store/kernel-exports/   — On-demand exports (full state)
 * - Store/kernel-metrics/   — Metrics history for trending
 * 
 * @module kernel/persistence
 */

import fs from 'node:fs';
import path from 'node:path';
import { kernel, getKernelUptime, exportKernelLogs } from './kernel-logger.js';
import { exportErrorData, getErrorStats } from './kernel-error-detector.js';
import { exportKernelState, getMetrics as _getMetrics } from './kernel-observer.js';
import { exportMetrics, getDashboard } from './kernel-metrics.js';

// ============================================================================
// TYPES
// ============================================================================

export interface PersistenceConfig {
  enabled: boolean;
  snapshotIntervalMs: number;    // How often to save snapshots (0 = disabled)
  retentionDays: number;         // How long to keep old files
  compressOldFiles: boolean;     // Compress files older than 1 day
  maxSnapshotsPerDay: number;    // Limit snapshots per day
  exportOnShutdown: boolean;     // Full export on graceful shutdown
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
// CONSTANTS
// ============================================================================

const STORE_BASE = process.env.RENDER ? '/Store' : 'Store';

const PATHS = {
  logs: path.join(STORE_BASE, 'kernel-logs'),
  snapshots: path.join(STORE_BASE, 'kernel-snapshots'),
  crashes: path.join(STORE_BASE, 'kernel-crashes'),
  exports: path.join(STORE_BASE, 'kernel-exports'),
  metrics: path.join(STORE_BASE, 'kernel-metrics'),
} as const;

const DEFAULT_CONFIG: PersistenceConfig = {
  enabled: true,
  snapshotIntervalMs: 5 * 60 * 1000,  // Every 5 minutes
  retentionDays: 7,
  compressOldFiles: false,  // TODO: Add compression support
  maxSnapshotsPerDay: 288,  // Every 5 min = 288 per day
  exportOnShutdown: true,
};

// ============================================================================
// STATE
// ============================================================================

let config: PersistenceConfig = { ...DEFAULT_CONFIG };
let snapshotInterval: NodeJS.Timeout | null = null;
let snapshotCount = 0;
let lastSnapshotTime = 0;
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
  
  kernel.boot('persistence', 'Initializing kernel persistence layer');
  
  // Create directories
  ensureDirectories();
  
  // Start snapshot interval if configured
  if (config.snapshotIntervalMs > 0) {
    startSnapshotScheduler();
  }
  
  initialized = true;
  kernel.boot('persistence', 'Kernel persistence initialized', {
    snapshotIntervalMs: config.snapshotIntervalMs,
    retentionDays: config.retentionDays,
    paths: PATHS,
  });
}

/**
 * Ensure all storage directories exist
 */
function ensureDirectories(): void {
  for (const dir of Object.values(PATHS)) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        kernel.debug('persistence', `Created directory: ${dir}`);
      }
    } catch (error) {
      kernel.error('persistence', `Failed to create directory: ${dir}`, { error: String(error) });
    }
  }
}

// ============================================================================
// SNAPSHOT SCHEDULER
// ============================================================================

/**
 * Start the automatic snapshot scheduler
 */
function startSnapshotScheduler(): void {
  if (snapshotInterval) {
    clearInterval(snapshotInterval);
  }
  
  snapshotInterval = setInterval(() => {
    saveSnapshot('PERIODIC').catch(error => {
      kernel.error('persistence', `Periodic snapshot failed: ${error}`);
    });
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
 * Save a kernel snapshot
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
    // Always save summary
    const summaryPath = path.join(PATHS.snapshots, `${id}-summary.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(snapshot, null, 2));
    snapshot.paths.full = summaryPath;
    
    // Save logs (periodic/shutdown/crash)
    if (saveAll || type === 'PERIODIC') {
      const logsPath = path.join(PATHS.snapshots, `${id}-logs.json`);
      const logs = exportKernelLogs();
      fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
      snapshot.paths.logs = logsPath;
    }
    
    // Save errors (if any, or on shutdown/crash)
    const errorStats = getErrorStats();
    if (errorStats.totalErrors > 0 || type === 'SHUTDOWN' || type === 'CRASH') {
      const errorsPath = path.join(PATHS.snapshots, `${id}-errors.json`);
      const errors = exportErrorData();
      fs.writeFileSync(errorsPath, JSON.stringify(errors, null, 2));
      snapshot.paths.errors = errorsPath;
    }
    
    // Save full state on shutdown/crash/manual
    if (saveAll) {
      const statePath = path.join(PATHS.snapshots, `${id}-state.json`);
      const state = exportKernelState();
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      snapshot.paths.state = statePath;
      
      const metricsPath = path.join(PATHS.snapshots, `${id}-metrics.json`);
      const metrics = exportMetrics();
      fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));
      snapshot.paths.metrics = metricsPath;
    }
    
    // Track snapshot
    snapshotCount++;
    lastSnapshotTime = Date.now();
    snapshotHistory.push(snapshot);
    
    // Keep history bounded
    if (snapshotHistory.length > 100) {
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
 * Save crash report (synchronous for reliability)
 */
export function saveCrashReport(reason: string, error?: Error): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `crash-${timestamp}.json`;
  const filepath = path.join(PATHS.crashes, filename);
  
  try {
    ensureDirectories();
    
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
    
    fs.writeFileSync(filepath, JSON.stringify(crashReport, null, 2));
    kernel.critical('persistence', `Crash report saved: ${filepath}`);
    
    return filepath;
  } catch (writeError) {
    // eslint-disable-next-line no-console
    console.error('[KERNEL-PERSISTENCE] Failed to save crash report:', writeError);
    return '';
  }
}

// ============================================================================
// ON-DEMAND EXPORT
// ============================================================================

/**
 * Export full kernel state to a file
 */
export function exportFullState(tag?: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = tag 
    ? `export-${timestamp}-${tag}.json`
    : `export-${timestamp}.json`;
  const filepath = path.join(PATHS.exports, filename);
  
  try {
    ensureDirectories();
    
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
    
    fs.writeFileSync(filepath, JSON.stringify(fullExport, null, 2));
    kernel.info('persistence', `Full state exported: ${filepath}`);
    
    return filepath;
  } catch (error) {
    kernel.error('persistence', `Export failed: ${error}`);
    throw error;
  }
}

/**
 * Export metrics history to file
 */
export function exportMetricsHistory(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `metrics-${timestamp}.json`;
  const filepath = path.join(PATHS.metrics, filename);
  
  try {
    ensureDirectories();
    
    const metricsExport = {
      exportedAt: new Date().toISOString(),
      uptimeMs: getKernelUptime(),
      current: exportMetrics(),
      snapshotCount,
      lastSnapshotTime: lastSnapshotTime ? new Date(lastSnapshotTime).toISOString() : null,
    };
    
    fs.writeFileSync(filepath, JSON.stringify(metricsExport, null, 2));
    kernel.info('persistence', `Metrics exported: ${filepath}`);
    
    return filepath;
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
// CLEANUP
// ============================================================================

/**
 * Clean up old files based on retention policy
 */
export function cleanupOldFiles(): { deleted: number; errors: number } {
  const cutoffTime = Date.now() - (config.retentionDays * 24 * 60 * 60 * 1000);
  let deleted = 0;
  let errors = 0;
  
  kernel.info('persistence', `Cleaning up files older than ${config.retentionDays} days`);
  
  for (const dir of Object.values(PATHS)) {
    try {
      if (!fs.existsSync(dir)) continue;
      
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filepath = path.join(dir, file);
        try {
          const stats = fs.statSync(filepath);
          if (stats.mtimeMs < cutoffTime) {
            fs.unlinkSync(filepath);
            deleted++;
          }
        } catch {
          errors++;
        }
      }
    } catch {
      errors++;
    }
  }
  
  kernel.info('persistence', `Cleanup complete: ${deleted} deleted, ${errors} errors`);
  return { deleted, errors };
}

// ============================================================================
// QUERY / LIST
// ============================================================================

/**
 * List available snapshots
 */
export function listSnapshots(): KernelSnapshot[] {
  return [...snapshotHistory];
}

/**
 * Get persistence statistics
 */
export function getPersistenceStats(): {
  enabled: boolean;
  snapshotCount: number;
  lastSnapshotTime: string | null;
  registeredHooks: number;
  paths: typeof PATHS;
  config: PersistenceConfig;
} {
  return {
    enabled: config.enabled,
    snapshotCount,
    lastSnapshotTime: lastSnapshotTime ? new Date(lastSnapshotTime).toISOString() : null,
    registeredHooks: databaseHooks.length,
    paths: PATHS,
    config,
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
 * Create a Prisma database hook
 * @param prisma - Prisma client instance
 * @param tableName - Table name for kernel data
 */
export function createPrismaHook(
  prisma: unknown,
  options?: { tableName?: string; enabled?: boolean }
): DatabaseExportHook {
  const tableName = options?.tableName ?? 'KernelLog';
  
  return {
    name: `prisma-${tableName}`,
    enabled: options?.enabled ?? true,
    
    exportLogs: async (logs) => {
      // Implementation would be:
      // await prisma[tableName].createMany({ data: logs.entries.map(...) })
      kernel.trace('persistence', `[prisma] Would export ${logs.entries.length} logs to ${tableName}`);
    },
    
    exportErrors: async (errors) => {
      kernel.trace('persistence', `[prisma] Would export ${errors.errors.length} errors`);
    },
    
    exportState: async (_state) => {
      kernel.trace('persistence', `[prisma] Would export state snapshot`);
    },
    
    exportMetrics: async (_metrics) => {
      kernel.trace('persistence', `[prisma] Would export metrics`);
    },
  };
}

/**
 * Create a JSON file-based "database" hook (for development)
 */
export function createFileDbHook(baseDir: string): DatabaseExportHook {
  return {
    name: 'file-db',
    enabled: true,
    
    exportLogs: async (logs) => {
      const filepath = path.join(baseDir, 'kernel-logs.json');
      fs.writeFileSync(filepath, JSON.stringify(logs, null, 2));
    },
    
    exportErrors: async (errors) => {
      const filepath = path.join(baseDir, 'kernel-errors.json');
      fs.writeFileSync(filepath, JSON.stringify(errors, null, 2));
    },
    
    exportState: async (state) => {
      const filepath = path.join(baseDir, 'kernel-state.json');
      fs.writeFileSync(filepath, JSON.stringify(state, null, 2));
    },
    
    exportMetrics: async (metrics) => {
      const filepath = path.join(baseDir, 'kernel-metrics.json');
      fs.writeFileSync(filepath, JSON.stringify(metrics, null, 2));
    },
  };
}
