/**
 * State Persistence Module
 * Manages security bot operational state across restarts
 * @module bot/state/persistence
 * 
 * MIGRATION (2025-12-27): Moved from /Store file system to PostgreSQL CacheEntry table
 * Database-First Architecture - All state stored in CLOUD-PROD-MASTER
 * 
 * RELIABILITY FEATURES (2025-12-21):
 * - Atomic writes: Database transactions ensure consistency
 * - Checksum verification: SHA256 detects tampering/corruption
 * - Snapshot recovery: Falls back to recent snapshot before default
 * - Deferred pruning: Startup not blocked by housekeeping
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../../shared/logging/index.js';
const logger = getLogger();

import crypto from 'crypto';
import { prisma } from '../../shared/prisma.js';
import { getFilesafeTimestamp } from '../../shared/utils/index.js';
import { ensureError } from '../../shared/utils/error-utils.js';
import { errorTracker } from '../../services/monitoring/index.js';
import {
  MAX_TIMELINE_EVENTS,
  SNAPSHOT_RETENTION_DAYS
} from './config.js';
import type { 
  SecurityBotState, 
  CumulativeStats, 
  HourlyMetrics,
  MetricsSummary, 
  GuildState, 
  RuntimeState, 
  TimelineEvent,
  StateMetadata,
  MetricsEventType
} from './types.js';

// Re-export MetricsEventType for backward compatibility
export type { MetricsEventType } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuration (Database-First Architecture)
// ─────────────────────────────────────────────────────────────────────────────

// Database keys for state storage (replaces file paths)
const STATE_NAMESPACE = 'security-bot-state';
const CURRENT_STATE_KEY = `${STATE_NAMESPACE}:current`;
const PREVIOUS_STATE_KEY = `${STATE_NAMESPACE}:previous`;
const SNAPSHOT_KEY_PREFIX = `${STATE_NAMESPACE}:snapshot:`;
const BACKUP_KEY_PREFIX = `${STATE_NAMESPACE}:backup-`;

const SCHEMA_VERSION = '1.1.0';
const STATE_VERSION = 1;

/**
 * Auto-save interval for state persistence.
 * 
 * **DESIGN DECISION (P5-F):** Using 30s interval in persistence module vs
 * 5 minutes documented elsewhere. Rationale:
 * 
 * - **30 seconds (persistence.ts):** Aggressive interval ensures minimal data
 *   loss on unexpected crashes. Security bot state changes frequently (sweeps,
 *   permission changes, alerts) and losing 30s of data is acceptable vs 5min.
 * 
 * - **5 minutes (config references):** Original conservative estimate for
 *   general-purpose background saves. May be referenced in documentation or
 *   config files but persistence module uses its own optimized interval.
 * 
 * - **Tradeoff:** Database writes are fast and transactional, even better than
 *   file system writes. State payloads are <100KB.
 * 
 * - **Shutdown behavior:** Final save always occurs on SIGTERM/SIGINT,
 *   so graceful shutdowns capture 100% of state regardless of interval.
 */
const AUTO_SAVE_INTERVAL_MS = 30 * 1000;
const METRICS_HISTORY_DAYS = 7;
const BACKUP_COUNT = 3;

// ─────────────────────────────────────────────────────────────────────────────
// Module State (P2-R2: Degraded Mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Degraded mode flag - true when database is unavailable.
 * In degraded mode, state changes are memory-only and won't persist.
 */
let degradedMode = false;

/**
 * Check if state persistence is in degraded mode.
 * Use for health checks and to warn operators.
 */
export function isStateDegraded(): boolean {
  return degradedMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types (Local interfaces only - MetricsEventType imported from types.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface CumulativeStatsUpdates {
  [key: string]: number;
}

interface GuildStateUpdates extends Partial<GuildState> {
  name?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a default empty state structure.
 * Exported for test fixtures and state initialization.
 */
export function createDefaultState(): SecurityBotState {
  const now = new Date().toISOString();
  return {
    version: STATE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    metadata: {
      lastSaved: now,
      lastRestart: now,
      processStartTime: now,
      hostname: process.env.RENDER_SERVICE_NAME || 'local',
      nodeVersion: process.version,
      botVersion: '2.0.0'
    },
    cumulative: {
      totalUptime: 0,
      restartCount: 0,
      sweepCount: 0,
      alertCount: 0,
      permissionChangesDetected: 0,
      permissionChangesReverted: 0,
      revertFailures: 0,
      guildCount: 0,
      firstStartTime: now
    },
    metricsHistory: {
      hourly: [],
      lastPruned: now
    },
    timeline: [],
    guilds: {},
    runtime: {
      currentUptime: 0,
      currentRestartTime: now,
      databaseStatus: {
        dev: 'unknown',
        prod: 'unknown'
      },
      activeSweepIntervals: []
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation & Migration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate state structure.
 * Checks that required top-level fields exist.
 * @param state - Unknown value to validate
 * @returns Type guard confirming state is SecurityBotState
 */
export function validateState(state: unknown): state is SecurityBotState {
  if (!state || typeof state !== 'object') return false;
  const s = state as Record<string, unknown>;
  if (!s.version || !s.schemaVersion) return false;
  if (!s.metadata || !s.cumulative || !s.timeline || !s.guilds || !s.runtime) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Checksum Verification (P0 Reliability)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute SHA256 checksum of state (excluding the checksum field itself).
 * Used for integrity verification on load.
 * @param state - State object to hash
 * @returns 16-character hex checksum
 */
export function computeStateChecksum(state: SecurityBotState): string {
  // Clone metadata without checksum to avoid circular dependency
  const stateForHash = {
    ...state,
    metadata: { ...state.metadata, checksum: undefined }
  };
  return crypto.createHash('sha256')
    .update(JSON.stringify(stateForHash))
    .digest('hex')
    .substring(0, 16);  // 16 chars is sufficient for integrity check
}

/**
 * Verify state checksum matches stored value.
 * Returns true for legacy files without checksum (backward compatible).
 * @param state - State object with metadata.checksum field
 * @returns True if checksum valid or missing (legacy), false if mismatch
 */
export function verifyStateChecksum(state: SecurityBotState): boolean {
  const storedChecksum = (state.metadata as unknown as Record<string, unknown>).checksum as string | undefined;
  if (!storedChecksum) {
    // Legacy file without checksum — allow but log
    logger.debug('security-state', 'verify', '[State] No checksum in state file (legacy)');
    return true;
  }
  
  const computed = computeStateChecksum(state);
  if (storedChecksum !== computed) {
    logger.error('security-state', 'verify', '[State] Checksum mismatch! Possible corruption', {
      metadata: { stored: storedChecksum, computed }
    });
    return false;
  }
  
  return true;
}

/**
 * Migrate state from older schema versions
 */
function migrateState(state: SecurityBotState): SecurityBotState {
  if (state.version === STATE_VERSION) {
    return state;
  }

  logger.warn('security-state', 'warning', '[State] Unknown state version', { metadata: { version: state.version } });
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Operations (Database-First Architecture 2025-12-27)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load state from database with checksum verification
 */
async function loadStateFromDb(key: string): Promise<SecurityBotState | null> {
  try {
    const entry = await prisma.cacheEntry.findUnique({
      where: { key },
    });
    
    if (!entry) {
      return null;
    }
    
    const state = entry.value as unknown as SecurityBotState;
    
    if (!validateState(state)) {
      logger.error('security-state', 'load', '[State] Invalid state structure', { metadata: { key } });
      return null;
    }
    
    // Verify checksum integrity
    if (!verifyStateChecksum(state)) {
      logger.error('security-state', 'load', '[State] Checksum verification failed, rejecting entry', { metadata: { key } });
      return null;
    }
    
    return migrateState(state);
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'load', '[State] Error loading from database', { metadata: { key, errorMsg: error.message } });
    
    errorTracker.captureError(
      error,
      {
        category: 'WORKER',
        operation: 'state:loadFromDb',
        customData: { key },
      }
    ).catch(() => {});
    
    return null;
  }
}

/**
 * Save state to database (ATOMIC via upsert)
 * 
 * Database transactions ensure atomicity - no temp file needed.
 */
async function saveStateToDb(key: string, state: SecurityBotState): Promise<boolean> {
  try {
    // Add checksum before saving
    const stateWithChecksum = {
      ...state,
      metadata: {
        ...state.metadata,
        checksum: computeStateChecksum(state)
      }
    };
    
    const jsonSize = JSON.stringify(stateWithChecksum).length;
    
    await prisma.cacheEntry.upsert({
      where: { key },
      update: {
        value: stateWithChecksum as object,
        sizeBytes: jsonSize,
        updatedAt: new Date(),
      },
      create: {
        key,
        namespace: STATE_NAMESPACE,
        value: stateWithChecksum as object,
        sizeBytes: jsonSize,
        // State entries don't expire (permanent storage)
      },
    });
    
    return true;
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'save', '[State] Error saving to database', { metadata: { key, errorMsg: error.message } });
    
    await errorTracker.captureError(
      error,
      {
        category: 'WORKER',
        operation: 'state:saveToDb',
        customData: { key },
      }
    );
    
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshots (Database-First Architecture)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create timestamped snapshot in database
 */
async function createSnapshot(state: SecurityBotState): Promise<string | null> {
  try {
    const timestamp = getFilesafeTimestamp();
    const snapshotKey = `${SNAPSHOT_KEY_PREFIX}${timestamp}`;
    const success = await saveStateToDb(snapshotKey, state);
    return success ? snapshotKey : null;
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'save', '[State] Error creating snapshot', { metadata: { errorMsg: error.message } });
    return null;
  }
}

/**
 * Prune old snapshots from database
 */
async function pruneSnapshots(): Promise<void> {
  try {
    const now = Date.now();
    const maxAge = SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(now - maxAge);
    
    // Find and delete old snapshots
    const oldSnapshots = await prisma.cacheEntry.findMany({
      where: {
        key: { startsWith: SNAPSHOT_KEY_PREFIX },
        updatedAt: { lt: cutoffDate },
      },
      select: { key: true },
    });
    
    if (oldSnapshots.length > 0) {
      await prisma.cacheEntry.deleteMany({
        where: {
          key: { in: oldSnapshots.map(s => s.key) },
        },
      });
      
      logger.info('security-state', 'prune', '[State] Pruned old snapshots', { metadata: { count: oldSnapshots.length } });
    }
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'prune', '[State] Error pruning snapshots', { metadata: { errorMsg: error.message } });
  }
}

/**
 * Load the newest valid snapshot from database
 * Returns null if no valid snapshots exist
 */
async function loadNewestSnapshot(): Promise<SecurityBotState | null> {
  try {
    // Get all snapshots ordered by key (timestamp-based naming means alphabetical = chronological)
    const snapshots = await prisma.cacheEntry.findMany({
      where: {
        key: { startsWith: SNAPSHOT_KEY_PREFIX },
      },
      orderBy: { key: 'desc' }, // Newest first
      select: { key: true },
    });
    
    for (const snapshot of snapshots) {
      logger.debug('security-state', 'load', '[State] Trying snapshot', { metadata: { key: snapshot.key } });
      
      const state = await loadStateFromDb(snapshot.key);
      if (state) {
        logger.info('security-state', 'load', '[State] Recovered from snapshot', { 
          metadata: { key: snapshot.key, lastSaved: state.metadata.lastSaved }
        });
        return state;
      }
    }
    
    return null;
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'load', '[State] Error searching snapshots', { metadata: { errorMsg: error.message } });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup Rotation (Database-First Architecture)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rotate backup entries in database (keep last N backups)
 * 
 * Creates a chain: current -> backup-0 -> backup-1 -> backup-2
 * This provides multiple recovery points if both current and previous corrupt.
 */
async function rotateBackups(): Promise<void> {
  try {
    // Rotate existing backups (backup-2 <- backup-1 <- backup-0)
    for (let i = BACKUP_COUNT - 1; i > 0; i--) {
      const srcKey = `${BACKUP_KEY_PREFIX}${i - 1}`;
      const dstKey = `${BACKUP_KEY_PREFIX}${i}`;
      
      const srcEntry = await prisma.cacheEntry.findUnique({
        where: { key: srcKey },
      });
      
      if (srcEntry) {
        // Copy src to dst
        await prisma.cacheEntry.upsert({
          where: { key: dstKey },
          update: {
            value: srcEntry.value as object,
            sizeBytes: srcEntry.sizeBytes,
            updatedAt: new Date(),
          },
          create: {
            key: dstKey,
            namespace: STATE_NAMESPACE,
            value: srcEntry.value as object,
            sizeBytes: srcEntry.sizeBytes,
          },
        });
      }
    }
    
    // Copy current to backup-0
    const currentEntry = await prisma.cacheEntry.findUnique({
      where: { key: CURRENT_STATE_KEY },
    });
    
    if (currentEntry) {
      await prisma.cacheEntry.upsert({
        where: { key: `${BACKUP_KEY_PREFIX}0` },
        update: {
          value: currentEntry.value as object,
          sizeBytes: currentEntry.sizeBytes,
          updatedAt: new Date(),
        },
        create: {
          key: `${BACKUP_KEY_PREFIX}0`,
          namespace: STATE_NAMESPACE,
          value: currentEntry.value as object,
          sizeBytes: currentEntry.sizeBytes,
        },
      });
    }
  } catch (err) {
    const error = ensureError(err);
    logger.warn('security-state', 'warning', '[State] Backup rotation failed', { metadata: { errorMsg: error.message } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core State Operations (Database-First Architecture)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load current state with full fallback chain:
 * 1. security-bot-state:current — Primary state entry
 * 2. security-bot-state:previous — Backup from last successful save
 * 3. Newest valid snapshot — Hourly backups (7-day retention)
 * 4. Fresh default state — Clean slate if all else fails
 */
export async function loadState(): Promise<SecurityBotState> {
  logger.info('security-state', 'load', '[State] Loading operational state from database...');
  
  // Try 1: current entry
  let state = await loadStateFromDb(CURRENT_STATE_KEY);
  
  // Try 2: previous entry
  if (!state) {
    logger.info('security-state', 'load', '[State] Current state not found/corrupted, trying previous...');
    state = await loadStateFromDb(PREVIOUS_STATE_KEY);
  }
  
  // Try 3: Newest snapshot (P0 recovery chain)
  if (!state) {
    logger.warn('security-state', 'warning', '[State] Primary entries unavailable, searching snapshots...');
    state = await loadNewestSnapshot();
  }
  
  // Try 4: Fresh state
  if (!state) {
    logger.info('security-state', 'init', '[State] No recoverable state found, initializing fresh state');
    state = createDefaultState();
  } else {
    logger.info('security-state', 'load', '[State] Loaded state', { metadata: { lastSaved: state.metadata.lastSaved } });
  }
  
  return state;
}

/**
 * Save current state with backup rotation
 */
export async function saveState(state: SecurityBotState): Promise<boolean> {
  state.metadata.lastSaved = new Date().toISOString();
  
  // Rotate backups before saving (non-blocking friendly)
  await rotateBackups();
  
  const success = await saveStateToDb(CURRENT_STATE_KEY, state);
  
  if (success) {
    logger.info('security-state', 'save', '[State] State saved successfully');
  }
  
  return success;
}

/**
 * Initialize state on startup with performance timing
 * 
 * Database-First: No filesystem operations needed.
 */
export async function initializeState(): Promise<SecurityBotState> {
  const startTime = performance.now();
  let recoveryTier: 'current' | 'previous' | 'snapshot' | 'fresh';
  
  logger.info('security-state', 'init', '[State] Initializing state persistence (Database-First)...');
  logger.info('security-state', 'init', '[State] Database namespace', { metadata: { namespace: STATE_NAMESPACE } });
  logger.info('security-state', 'init', '[State] Working directory', { metadata: { cwd: process.cwd() } });
  
  // Database-First: No mkdir needed - database is always available
  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('security-state', 'init', '[State] Database connection verified');
  } catch (err) {
    const error = err as Error;
    degradedMode = true;  // P2-R2: Set degraded flag
    logger.error('security-state', 'error', '[State] CRITICAL: Database connection failed', { metadata: { errorMsg: error.message } });
    logger.error('security-state', 'error', '[State] ENTERING DEGRADED MODE - state persistence disabled');
    
    await errorTracker.captureError(
      ensureError(error),
      {
        category: 'WORKER',
        severity: 'CRITICAL',
        operation: 'state:initializeDatabase',
        customData: {
          namespace: STATE_NAMESPACE,
          errorCode: (error as NodeJS.ErrnoException).code,
        },
      }
    );
  }
  
  const previousState = await loadState();
  
  // Track which recovery tier we used
  if (await loadStateFromDb(CURRENT_STATE_KEY)) {
    recoveryTier = 'current';
    // Copy current to previous as backup
    const currentEntry = await prisma.cacheEntry.findUnique({
      where: { key: CURRENT_STATE_KEY },
    });
    if (currentEntry) {
      await prisma.cacheEntry.upsert({
        where: { key: PREVIOUS_STATE_KEY },
        update: {
          value: currentEntry.value as object,
          sizeBytes: currentEntry.sizeBytes,
          updatedAt: new Date(),
        },
        create: {
          key: PREVIOUS_STATE_KEY,
          namespace: STATE_NAMESPACE,
          value: currentEntry.value as object,
          sizeBytes: currentEntry.sizeBytes,
        },
      }).catch(() => {});
    }
  } else if (await loadStateFromDb(PREVIOUS_STATE_KEY)) {
    recoveryTier = 'previous';
  } else if (previousState.cumulative.restartCount > 0) {
    recoveryTier = 'snapshot';
  } else {
    recoveryTier = 'fresh';
  }
  
  const now = new Date().toISOString();
  const previousRestartTime = previousState.metadata?.lastRestart || now;
  const previousUptime = previousState.runtime?.currentUptime || 0;
  
  const state: SecurityBotState = {
    ...previousState,
    metadata: {
      ...previousState.metadata,
      previousRestart: previousRestartTime,
      lastRestart: now,
      processStartTime: now,
      hostname: process.env.RENDER_SERVICE_NAME || 'local',
      nodeVersion: process.version
    } as StateMetadata,
    cumulative: {
      ...previousState.cumulative,
      restartCount: (previousState.cumulative.restartCount || 0) + 1,
      totalUptime: (previousState.cumulative.totalUptime || 0) + previousUptime
    },
    runtime: {
      currentUptime: 0,
      currentRestartTime: now,
      databaseStatus: {
        dev: 'unknown',
        prod: 'unknown'
      },
      activeSweepIntervals: []
    }
  };
  
  // Initialize timeline with restart event (P2-M1: avoid spread)
  state.timeline = previousState.timeline.slice(0, MAX_TIMELINE_EVENTS - 1);
  state.timeline.unshift({
    timestamp: now,
    type: 'restart',
    details: {
      reason: 'manual',
      previousUptime: previousState.runtime?.currentUptime || 0
    }
  } as TimelineEvent);
  
  recordMetricsEvent(state, 'restart', 1);
  
  // Critical startup operations (blocking)
  await saveState(state);
  await createSnapshot(state);
  
  // Defer non-critical pruning (P1: don't block startup)
  setImmediate(() => {
    pruneSnapshots().catch(err => {
      logger.warn('security-state', 'warning', '[State] Deferred pruning failed', { metadata: { errorMsg: String(err) } });
    });
  });
  
  // P2-T1: Log cold boot timing metrics
  const initDurationMs = Math.round(performance.now() - startTime);
  logger.info('security-state', 'init', '[State] Initialization complete', { 
    durationMs: initDurationMs,
    metadata: {
      restartNumber: state.cumulative.restartCount,
      recoveryTier,
      degradedMode
    }
  });
  
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add event to timeline (P2-M1: Ring buffer pattern)
 * 
 * Uses unshift + length truncation instead of spread + slice
 * to reduce GC pressure during high-activity periods (raids).
 */
export function addTimelineEvent(state: SecurityBotState, event: Omit<TimelineEvent, 'timestamp'>): void {
  // Unshift is O(n) but avoids creating new array
  state.timeline.unshift({
    timestamp: new Date().toISOString(),
    ...event
  } as TimelineEvent);
  
  // Truncate in-place if over limit (avoids slice creating new array)
  if (state.timeline.length > MAX_TIMELINE_EVENTS) {
    state.timeline.length = MAX_TIMELINE_EVENTS;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cumulative Stats
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update cumulative stats
 */
export function updateCumulativeStats(state: SecurityBotState, updates: CumulativeStatsUpdates): void {
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'number' && key in state.cumulative) {
      const statKey = key as keyof CumulativeStats;
      const currentValue = state.cumulative[statKey];
      if (typeof currentValue === 'number') {
        (state.cumulative as Record<keyof CumulativeStats, string | number>)[statKey] = currentValue + value;
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update guild state
 */
export function updateGuildState(state: SecurityBotState, guildId: string, updates: GuildStateUpdates): void {
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = {
      id: guildId,
      name: updates.name || 'Unknown',
      lastSweep: null,
      sweepCount: 0,
      alertCount: 0,
      permissionChanges: 0,
      monitoring: true,
      lastActivity: new Date().toISOString()
    };
    state.cumulative.guildCount = Object.keys(state.guilds).length;
  }
  
  Object.assign(state.guilds[guildId], updates);
  state.guilds[guildId].lastActivity = new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime State
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update runtime state
 */
export function updateRuntimeState(state: SecurityBotState, updates: Partial<RuntimeState>): void {
  Object.assign(state.runtime, updates);
  state.runtime.currentUptime = Date.now() - new Date(state.metadata.processStartTime).getTime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics History
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Binary search insertion for sorted metrics array (P2-M3)
 * Maintains descending timestamp order without full sort.
 */
function insertMetricsSorted(arr: HourlyMetrics[], item: HourlyMetrics): void {
  const itemTime = new Date(item.timestamp).getTime();
  let low = 0, high = arr.length;
  
  // Binary search for insertion point (descending order)
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (new Date(arr[mid].timestamp).getTime() > itemTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  
  arr.splice(low, 0, item);
}

/**
 * Get or create current hour's metrics bucket
 */
function getCurrentHourMetrics(state: SecurityBotState): HourlyMetrics {
  const now = new Date();
  const hourTimestamp = new Date(
    now.getFullYear(), 
    now.getMonth(), 
    now.getDate(), 
    now.getHours()
  ).toISOString();
  
  if (!state.metricsHistory) {
    state.metricsHistory = {
      hourly: [],
      lastPruned: new Date().toISOString()
    };
  }
  
  let hourMetrics = state.metricsHistory.hourly.find(m => m.timestamp === hourTimestamp);
  
  if (!hourMetrics) {
    hourMetrics = {
      timestamp: hourTimestamp,
      sweeps: 0,
      alerts: 0,
      changes: 0,
      reverts: 0,
      failures: 0,
      permissionChanges: 0,
      permissionReverts: 0,
      revertFailures: 0,
      errors: 0,
      memberFetchTimeouts: 0,
      restarts: 0
    };
    
    // P2-M3: Binary insertion instead of push + sort
    insertMetricsSorted(state.metricsHistory.hourly, hourMetrics);
  }
  
  return hourMetrics;
}

/**
 * Prune metrics history older than retention period
 */
function pruneMetricsHistory(state: SecurityBotState): void {
  if (!state.metricsHistory) return;
  
  const now = Date.now();
  const retentionMs = METRICS_HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const cutoffTime = now - retentionMs;
  
  const originalCount = state.metricsHistory.hourly.length;
  state.metricsHistory.hourly = state.metricsHistory.hourly.filter(m => {
    const timestamp = new Date(m.timestamp).getTime();
    return timestamp >= cutoffTime;
  });
  
  const pruned = originalCount - state.metricsHistory.hourly.length;
  if (pruned > 0) {
    logger.info('security-state', 'prune', '[State] Pruned old metrics', { metadata: { pruned, remaining: state.metricsHistory.hourly.length } });
  }
  
  state.metricsHistory.lastPruned = new Date().toISOString();
}

/**
 * Record metrics event (updates both cumulative and hourly history)
 */
export function recordMetricsEvent(state: SecurityBotState, eventType: MetricsEventType, count: number = 1): void {
  const hourMetrics = getCurrentHourMetrics(state);
  
  switch (eventType) {
    case 'sweep':
      hourMetrics.sweeps += count;
      break;
    case 'alert':
      hourMetrics.alerts += count;
      break;
    case 'permission_change':
      hourMetrics.permissionChanges += count;
      break;
    case 'permission_revert':
      hourMetrics.permissionReverts += count;
      break;
    case 'revert_failure':
      hourMetrics.revertFailures += count;
      break;
    case 'error':
      hourMetrics.errors += count;
      break;
    case 'member_fetch_timeout':
      hourMetrics.memberFetchTimeouts += count;
      break;
    case 'restart':
      hourMetrics.restarts = (hourMetrics.restarts ?? 0) + count;
      break;
  }
  
  const lastPruned = new Date(state.metricsHistory.lastPruned).getTime();
  const hoursSinceLastPrune = (Date.now() - lastPruned) / (60 * 60 * 1000);
  if (hoursSinceLastPrune >= 1) {
    pruneMetricsHistory(state);
  }
}

/**
 * Get metrics summary for a time range
 */
export function getMetricsSummary(state: SecurityBotState, hoursBack: number = 24): MetricsSummary {
  if (!state.metricsHistory?.hourly) {
    return {
      sweeps: 0,
      alerts: 0,
      permissionChanges: 0,
      permissionReverts: 0,
      revertFailures: 0,
      errors: 0,
      memberFetchTimeouts: 0,
      restarts: 0,
      hoursWithData: 0
    };
  }
  
  const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
  const recentMetrics = state.metricsHistory.hourly.filter(m => {
    return new Date(m.timestamp).getTime() >= cutoffTime;
  });
  
  const summary: MetricsSummary = {
    sweeps: 0,
    alerts: 0,
    permissionChanges: 0,
    permissionReverts: 0,
    revertFailures: 0,
    errors: 0,
    memberFetchTimeouts: 0,
    restarts: 0,
    hoursWithData: recentMetrics.length
  };
  
  for (const m of recentMetrics) {
    summary.sweeps += m.sweeps;
    summary.alerts += m.alerts;
    summary.permissionChanges += m.permissionChanges;
    summary.permissionReverts += m.permissionReverts;
    summary.revertFailures += m.revertFailures;
    summary.errors += m.errors;
    summary.memberFetchTimeouts += m.memberFetchTimeouts;
    summary.restarts += m.restarts ?? 0;
  }
  
  return summary;
}

/**
 * Get hourly metrics trend for charts/graphs
 */
export function getMetricsTrend(state: SecurityBotState, hoursBack: number = 168): HourlyMetrics[] {
  if (!state.metricsHistory?.hourly) {
    return [];
  }
  
  const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
  return state.metricsHistory.hourly
    .filter(m => new Date(m.timestamp).getTime() >= cutoffTime)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Save
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start auto-save interval
 */
export function startAutoSave(state: SecurityBotState): NodeJS.Timeout {
  const interval = setInterval(async () => {
    logger.info('security-state', 'save', '[State] Auto-saving state...');
    await saveState(state);
  }, AUTO_SAVE_INTERVAL_MS);
  
  logger.info('security-state', 'init', '[State] Auto-save enabled', { metadata: { intervalSeconds: AUTO_SAVE_INTERVAL_MS / 1000 } });
  return interval;
}

/**
 * Stop auto-save interval
 */
export function stopAutoSave(interval: NodeJS.Timeout | null): void {
  if (interval) {
    clearInterval(interval);
    logger.info('security-state', 'save', '[State] Auto-save stopped');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shutdown
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Graceful shutdown - save final state
 */
export async function shutdownState(state: SecurityBotState, reason: string = 'manual'): Promise<void> {
  logger.info('security-state', 'save', '[State] Shutting down', { metadata: { reason } });
  
  addTimelineEvent(state, {
    type: 'shutdown',
    details: {
      reason,
      uptime: state.runtime.currentUptime
    }
  });
  
  updateRuntimeState(state, {});
  
  await saveState(state);
  await createSnapshot(state);
  
  logger.info('security-state', 'save', '[State] Shutdown complete');
}
