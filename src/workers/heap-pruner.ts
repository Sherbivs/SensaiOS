/**
 * Heap Snapshot Pruner — Automated Disk Space Management
 * 
 * Phase 1, Project 1 of Metrics Expansion Bible
 * @see docs/projects/metrics-expansion-bible.md § Project 1
 * 
 * Purpose:
 * Heap snapshots are created in src/index.ts via v8.writeHeapSnapshot() on startup.
 * Pattern: startup-heap-{ISO-timestamp}.heapsnapshot
 * Without pruning, these accumulate indefinitely (~27 MB each), consuming disk.
 * 
 * This worker:
 * 1. Runs on configurable schedule (default: every 24 hours)
 * 2. Keeps only MAX_COUNT most recent snapshots (default: 3)
 * 3. Deletes snapshots older than MAX_AGE_DAYS (default: 7)
 * 4. Emits EventBus events for observability
 * 5. Only targets startup-heap-*.heapsnapshot files (safe pattern)
 * 
 * Resource Constraints (Render Standard Plan):
 * - /Store disk: 974 MB total
 * - Without pruning: 7 snapshots = 190 MB (22% of disk)
 * - With pruning: 3 snapshots = ~80 MB (8% of disk)
 * - Savings: ~110 MB (14% disk reclaimed)
 * 
 * Integration:
 * - Called from src/index.ts boot() after Store directory confirmed
 * - Gracefully stopped in gracefulShutdown()
 * - Events visible via EventBus subscriptions
 * 
 * @module workers/heap-pruner
 */

import { readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import { performance } from 'node:perf_hooks';
import { EventBus } from '../shared/event-bus.js';
import { getLogger } from '../shared/logging/index.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';

const logger = getLogger();

// ============================================================================
// Configuration
// ============================================================================

/**
 * Heap pruner configuration from environment variables
 * 
 * Note on env var naming:
 * - HEAP_SNAPSHOT_ON_STARTUP: Controls CREATION of snapshots (in src/index.ts)
 * - HEAP_SNAPSHOT_ENABLED: Controls PRUNING of snapshots (this worker)
 * These are independent — you can disable creation but keep pruning for existing files.
 */
const CONFIG = {
  /** Master switch for pruner worker (default: enabled) */
  enabled: process.env.HEAP_SNAPSHOT_ENABLED !== 'false',
  
  /** Keep N most recent snapshots (default: 3) */
  maxCount: parseInt(process.env.HEAP_SNAPSHOT_MAX_COUNT ?? '3', 10),
  
  /** Delete snapshots older than N days (default: 7) */
  maxAgeDays: parseInt(process.env.HEAP_SNAPSHOT_MAX_AGE_DAYS ?? '7', 10),
  
  /** Prune interval in milliseconds (default: 24 hours) */
  pruneIntervalMs: parseInt(process.env.HEAP_SNAPSHOT_PRUNE_INTERVAL_MS ?? '86400000', 10),
  
  /** Directory containing heap snapshots */
  storeDir: process.env.RENDER ? '/Store' : './Store',
  
  /** Safe pattern for heap snapshot files — ONLY files matching this get deleted */
  safePattern: /^startup-heap-.*\.heapsnapshot$/,
  
  /** Startup stagger delay to avoid thundering herd (5 seconds) */
  startupStaggerMs: 5000,
  
  /** Run immediately on startup (useful for catching accumulated snapshots) */
  runOnStartup: process.env.HEAP_SNAPSHOT_RUN_ON_STARTUP !== 'false',
};

// ============================================================================
// Types
// ============================================================================

/** Snapshot file metadata */
interface SnapshotFile {
  name: string;
  path: string;
  sizeBytes: number;
  createdAt: Date;
  ageMs: number;
}

/** Pruning result */
interface PruneResult {
  success: boolean;
  deletedCount: number;
  deletedBytes: number;
  keptCount: number;
  errors: string[];
  durationMs: number;
}

/** Worker status for observability */
interface HeapPrunerStatus {
  isRunning: boolean;
  lastRunTime: Date | null;
  lastRunDurationMs: number;
  totalRunCount: number;
  totalDeletedCount: number;
  totalDeletedBytes: number;
  errorCount: number;
  lastError: string | null;
  config: {
    enabled: boolean;
    maxCount: number;
    maxAgeDays: number;
    pruneIntervalMs: number;
    storeDir: string;
  };
}

// ============================================================================
// Heap Pruner Worker
// ============================================================================

/** Singleton worker instance */
let prunerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/** Worker statistics */
const stats = {
  lastRunTime: null as Date | null,
  lastRunDurationMs: 0,
  totalRunCount: 0,
  totalDeletedCount: 0,
  totalDeletedBytes: 0,
  errorCount: 0,
  lastError: null as string | null,
};

/**
 * Discover all heap snapshot files in the Store directory
 */
function discoverSnapshots(): SnapshotFile[] {
  const snapshots: SnapshotFile[] = [];
  const now = Date.now();
  
  try {
    if (!existsSync(CONFIG.storeDir)) {
      logger.warn('HeapPruner', 'discoverSnapshots', 'Store directory does not exist', {
        metadata: { storeDir: CONFIG.storeDir },
      });
      return snapshots;
    }
    
    const files = readdirSync(CONFIG.storeDir);
    
    for (const file of files) {
      // SAFETY: Only match heap snapshot files
      if (!CONFIG.safePattern.test(file)) {
        continue;
      }
      
      const filePath = pathJoin(CONFIG.storeDir, file);
      
      try {
        const fileStat = statSync(filePath);
        
        if (fileStat.isFile()) {
          snapshots.push({
            name: file,
            path: filePath,
            sizeBytes: fileStat.size,
            createdAt: fileStat.birthtime,
            ageMs: now - fileStat.birthtime.getTime(),
          });
        }
      } catch (error) {
        logger.warn('HeapPruner', 'discoverSnapshots', 'Failed to stat file', {
          metadata: { file, errorMsg: getErrorMessage(error) },
        });
      }
    }
    
    // Sort by creation time (newest first)
    snapshots.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
  } catch (error) {
    logger.error('HeapPruner', 'discoverSnapshots', 'Failed to discover snapshots', {
      metadata: { storeDir: CONFIG.storeDir, errorMsg: getErrorMessage(error) },
    });
  }
  
  return snapshots;
}

/**
 * Prune heap snapshots based on count and age rules
 * 
 * Rules (applied in order):
 * 1. Keep at most MAX_COUNT snapshots (delete oldest first)
 * 2. Delete any snapshots older than MAX_AGE_DAYS
 */
export async function pruneHeapSnapshots(): Promise<PruneResult> {
  const startTime = performance.now();
  const result: PruneResult = {
    success: true,
    deletedCount: 0,
    deletedBytes: 0,
    keptCount: 0,
    errors: [],
    durationMs: 0,
  };
  
  try {
    const snapshots = discoverSnapshots();
    const maxAgeMs = CONFIG.maxAgeDays * 24 * 60 * 60 * 1000;
    
    logger.info('HeapPruner', 'prune', 'Starting prune operation', {
      metadata: {
        foundCount: snapshots.length,
        maxCount: CONFIG.maxCount,
        maxAgeDays: CONFIG.maxAgeDays,
      },
    });
    
    // Determine which files to keep vs delete
    const toDelete: SnapshotFile[] = [];
    const toKeep: SnapshotFile[] = [];
    
    for (let i = 0; i < snapshots.length; i++) {
      const snapshot = snapshots[i];
      const isOverCount = i >= CONFIG.maxCount;
      const isOverAge = snapshot.ageMs > maxAgeMs;
      
      if (isOverCount || isOverAge) {
        toDelete.push(snapshot);
      } else {
        toKeep.push(snapshot);
      }
    }
    
    // Delete files
    for (const snapshot of toDelete) {
      try {
        unlinkSync(snapshot.path);
        result.deletedCount++;
        result.deletedBytes += snapshot.sizeBytes;
        
        logger.info('HeapPruner', 'prune', 'Deleted snapshot', {
          metadata: {
            name: snapshot.name,
            sizeMB: (snapshot.sizeBytes / 1024 / 1024).toFixed(2),
            ageDays: (snapshot.ageMs / 1000 / 60 / 60 / 24).toFixed(1),
          },
        });
      } catch (error) {
        const errorMsg = getErrorMessage(error);
        result.errors.push(`Failed to delete ${snapshot.name}: ${errorMsg}`);
        result.success = false;
        
        logger.error('HeapPruner', 'prune', 'Failed to delete snapshot', {
          metadata: {
            name: snapshot.name,
            errorMsg,
          },
        });
      }
    }
    
    result.keptCount = toKeep.length;
    result.durationMs = performance.now() - startTime;
    
    // Update stats
    stats.lastRunTime = new Date();
    stats.lastRunDurationMs = result.durationMs;
    stats.totalRunCount++;
    stats.totalDeletedCount += result.deletedCount;
    stats.totalDeletedBytes += result.deletedBytes;
    if (!result.success) {
      stats.errorCount++;
      stats.lastError = result.errors.join('; ');
    } else {
      stats.lastError = null;
    }
    
    // Emit EventBus event for observability
    EventBus.getInstance().emit('system.prune.heapsnapshot', {
      success: result.success,
      deletedCount: result.deletedCount,
      deletedBytes: result.deletedBytes,
      deletedMB: parseFloat((result.deletedBytes / 1024 / 1024).toFixed(2)),
      keptCount: result.keptCount,
      durationMs: parseFloat(result.durationMs.toFixed(2)),
      errors: result.errors,
      config: {
        maxCount: CONFIG.maxCount,
        maxAgeDays: CONFIG.maxAgeDays,
      },
    }, { emitter: 'heap-pruner' });
    
    logger.info('HeapPruner', 'prune', 'Prune operation complete', {
      durationMs: result.durationMs,
      metadata: {
        success: result.success,
        deletedCount: result.deletedCount,
        deletedMB: (result.deletedBytes / 1024 / 1024).toFixed(2),
        keptCount: result.keptCount,
      },
    });
    
  } catch (error) {
    result.success = false;
    result.errors.push(getErrorMessage(error));
    result.durationMs = performance.now() - startTime;
    
    stats.errorCount++;
    stats.lastError = getErrorMessage(error);
    
    // Emit failure event
    EventBus.getInstance().emit('system.prune.heapsnapshot', {
      success: false,
      deletedCount: 0,
      deletedBytes: 0,
      deletedMB: 0,
      keptCount: 0,
      durationMs: parseFloat(result.durationMs.toFixed(2)),
      errors: result.errors,
      config: {
        maxCount: CONFIG.maxCount,
        maxAgeDays: CONFIG.maxAgeDays,
      },
    }, { emitter: 'heap-pruner' });
    
    logger.error('HeapPruner', 'prune', 'Prune operation failed', {
      metadata: { errorMsg: getErrorMessage(error) },
    });
  }
  
  return result;
}

/**
 * Start the heap pruner worker
 * 
 * @returns Interval handle (for manual cleanup if needed)
 */
export function startHeapPruner(): NodeJS.Timeout | null {
  if (!CONFIG.enabled) {
    logger.info('HeapPruner', 'start', 'Disabled via HEAP_SNAPSHOT_ENABLED=false');
    return null;
  }
  
  if (prunerInterval) {
    logger.warn('HeapPruner', 'start', 'Already running, skipping start');
    return prunerInterval;
  }
  
  isRunning = true;
  
  logger.info('HeapPruner', 'start', 'Starting worker', {
    metadata: {
      maxCount: CONFIG.maxCount,
      maxAgeDays: CONFIG.maxAgeDays,
      pruneIntervalHours: CONFIG.pruneIntervalMs / 1000 / 60 / 60,
      storeDir: CONFIG.storeDir,
      runOnStartup: CONFIG.runOnStartup,
      staggerDelayMs: CONFIG.startupStaggerMs,
    },
  });
  
  // Run immediately on startup (after stagger delay) to catch accumulated snapshots
  if (CONFIG.runOnStartup) {
    setTimeout(async () => {
      if (isRunning) {
        logger.info('HeapPruner', 'start', 'Running startup prune');
        await pruneHeapSnapshots();
      }
    }, CONFIG.startupStaggerMs);
  }
  
  // Start periodic execution
  prunerInterval = setInterval(async () => {
    if (isRunning) {
      await pruneHeapSnapshots();
    }
  }, CONFIG.pruneIntervalMs);
  
  // Use .unref() to allow process exit without blocking
  prunerInterval.unref?.();
  
  // Emit startup event
  EventBus.getInstance().emit('system.worker.started', {
    worker: 'heap-pruner',
    config: {
      maxCount: CONFIG.maxCount,
      maxAgeDays: CONFIG.maxAgeDays,
      pruneIntervalMs: CONFIG.pruneIntervalMs,
    },
  }, { emitter: 'heap-pruner' });
  
  return prunerInterval;
}

/**
 * Stop the heap pruner worker
 */
export function stopHeapPruner(): void {
  if (prunerInterval) {
    clearInterval(prunerInterval);
    prunerInterval = null;
    
    logger.info('HeapPruner', 'stop', 'Stopped', {
      metadata: {
        totalRunCount: stats.totalRunCount,
        totalDeletedCount: stats.totalDeletedCount,
        totalDeletedMB: (stats.totalDeletedBytes / 1024 / 1024).toFixed(2),
        errorCount: stats.errorCount,
      },
    });
    
    // Emit shutdown event
    EventBus.getInstance().emit('system.worker.stopped', {
      worker: 'heap-pruner',
      stats: {
        totalRunCount: stats.totalRunCount,
        totalDeletedCount: stats.totalDeletedCount,
        totalDeletedMB: parseFloat((stats.totalDeletedBytes / 1024 / 1024).toFixed(2)),
        errorCount: stats.errorCount,
      },
    }, { emitter: 'heap-pruner' });
  }
  
  isRunning = false;
}

/**
 * Get heap pruner worker status for observability
 */
export function getHeapPrunerStatus(): HeapPrunerStatus {
  return {
    isRunning,
    lastRunTime: stats.lastRunTime,
    lastRunDurationMs: stats.lastRunDurationMs,
    totalRunCount: stats.totalRunCount,
    totalDeletedCount: stats.totalDeletedCount,
    totalDeletedBytes: stats.totalDeletedBytes,
    errorCount: stats.errorCount,
    lastError: stats.lastError,
    config: {
      enabled: CONFIG.enabled,
      maxCount: CONFIG.maxCount,
      maxAgeDays: CONFIG.maxAgeDays,
      pruneIntervalMs: CONFIG.pruneIntervalMs,
      storeDir: CONFIG.storeDir,
    },
  };
}

/**
 * Force immediate prune (for /ops commands or testing)
 */
export async function forcePrune(): Promise<PruneResult> {
  logger.info('HeapPruner', 'forcePrune', 'Force prune requested');
  return pruneHeapSnapshots();
}

export default {
  start: startHeapPruner,
  stop: stopHeapPruner,
  prune: pruneHeapSnapshots,
  forcePrune,
  getStatus: getHeapPrunerStatus,
};
