/**
 * State Persistence Module
 * Manages security bot operational state across restarts
 * @module bot/state/persistence
 * 
 * RELIABILITY FEATURES (2025-12-21):
 * - Atomic writes: temp file + rename prevents corruption
 * - Checksum verification: SHA256 detects tampering/corruption
 * - Snapshot recovery: Falls back to recent snapshot before default
 * - Deferred pruning: Startup not blocked by housekeeping
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from '../../shared/logging/index.js';
import { getFilesafeTimestamp } from '../../shared/utils/index.js';

const logger = getLogger();
import { ensureError } from '../../shared/utils/error-utils.js';
import { errorTracker } from '../../services/monitoring/index.js';
import {
  STATE_DIR,
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
// Configuration (imports from config.ts + local path resolution)
// ─────────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Derive paths from canonical STATE_DIR
const CURRENT_STATE_PATH = path.join(STATE_DIR, 'current.json');
const PREVIOUS_STATE_PATH = path.join(STATE_DIR, 'previous.json');
const SNAPSHOTS_DIR = path.join(STATE_DIR, 'snapshots');

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
 * - **Tradeoff:** Slight increase in disk I/O (negligible on SSD) vs better
 *   crash resilience. State files are <100KB so writes are fast.
 * 
 * - **Shutdown behavior:** Final save always occurs on SIGTERM/SIGINT,
 *   so graceful shutdowns capture 100% of state regardless of interval.
 */
const AUTO_SAVE_INTERVAL_MS = 30 * 1000;
const METRICS_HISTORY_DAYS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// Module State (P2-R2: Degraded Mode)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Degraded mode flag - true when state directory is unavailable.
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
// File Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load state from JSON file with checksum verification
 */
async function loadStateFile(filePath: string): Promise<SecurityBotState | null> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const state = JSON.parse(data);
    
    if (!validateState(state)) {
      logger.error('security-state', 'load', '[State] Invalid state structure', { metadata: { filePath } });
      return null;
    }
    
    // Verify checksum integrity
    if (!verifyStateChecksum(state)) {
      logger.error('security-state', 'load', '[State] Checksum verification failed, rejecting file', { metadata: { filePath } });
      return null;
    }
    
    return migrateState(state);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT') {
      return null;
    }
    logger.error('security-state', 'load', '[State] Error loading file', { metadata: { filePath, errorMsg: error.message } });
    
    errorTracker.captureError(
      ensureError(error),
      {
        category: 'WORKER',
        operation: 'state:loadFile',
        customData: { filePath, errorCode: error.code },
      }
    ).catch(() => {});
    
    return null;
  }
}

/**
 * Save state to JSON file (ATOMIC)
 * 
 * Uses write-to-temp + rename pattern for crash safety:
 * 1. Write to {filePath}.tmp
 * 2. Atomically rename to final path
 * 3. If crash during write, .tmp is incomplete but original is safe
 */
async function saveStateFile(filePath: string, state: SecurityBotState): Promise<boolean> {
  const tempPath = `${filePath}.tmp`;
  
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    
    // Add checksum before saving
    const stateWithChecksum = {
      ...state,
      metadata: {
        ...state.metadata,
        checksum: computeStateChecksum(state)
      }
    };
    
    const json = JSON.stringify(stateWithChecksum, null, 2);
    
    // Step 1: Write to temp file
    await fs.writeFile(tempPath, json, 'utf8');
    
    // Step 2: Atomic rename (same filesystem = atomic on POSIX)
    await fs.rename(tempPath, filePath);
    
    return true;
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    logger.error('security-state', 'save', '[State] Error saving file', { metadata: { filePath, errorMsg: error.message } });
    
    // Cleanup temp file if it exists
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    
    await errorTracker.captureError(
      ensureError(error),
      {
        category: 'WORKER',
        operation: 'state:saveFile',
        customData: { filePath, errorCode: error.code },
      }
    );
    
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create timestamped snapshot
 */
async function createSnapshot(state: SecurityBotState): Promise<string | null> {
  try {
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    const timestamp = getFilesafeTimestamp();
    const snapshotPath = path.join(SNAPSHOTS_DIR, `${timestamp}.json`);
    await saveStateFile(snapshotPath, state);
    return snapshotPath;
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'save', '[State] Error creating snapshot', { metadata: { errorMsg: error.message } });
    return null;
  }
}

/**
 * Prune old snapshots
 */
async function pruneSnapshots(): Promise<void> {
  try {
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    
    const files = await fs.readdir(SNAPSHOTS_DIR);
    const now = Date.now();
    const maxAge = SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    
    let pruned = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(SNAPSHOTS_DIR, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtime.getTime();
      
      if (age > maxAge) {
        await fs.unlink(filePath);
        pruned++;
      }
    }
    
    if (pruned > 0) {
      logger.info('security-state', 'prune', '[State] Pruned old snapshots', { metadata: { count: pruned } });
    }
  } catch (err) {
    const error = ensureError(err);
    logger.error('security-state', 'prune', '[State] Error pruning snapshots', { metadata: { errorMsg: error.message } });
  }
}

/**
 * Load the newest valid snapshot from snapshots directory
 * Returns null if no valid snapshots exist
 */
async function loadNewestSnapshot(): Promise<SecurityBotState | null> {
  try {
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    
    const files = await fs.readdir(SNAPSHOTS_DIR);
    const jsonFiles = files
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse();  // Newest first (timestamp-based naming)
    
    for (const file of jsonFiles) {
      const filePath = path.join(SNAPSHOTS_DIR, file);
      logger.debug('security-state', 'load', '[State] Trying snapshot', { metadata: { file } });
      
      const state = await loadStateFile(filePath);
      if (state) {
        logger.info('security-state', 'load', '[State] Recovered from snapshot', { 
          metadata: { file, lastSaved: state.metadata.lastSaved }
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
// Backup Rotation (P2-R1)
// ─────────────────────────────────────────────────────────────────────────────

const BACKUP_COUNT = 3;

/**
 * Rotate backup files (keep last N backups)
 * 
 * Creates a chain: current -> backup-0 -> backup-1 -> backup-2
 * This provides multiple recovery points if both current and previous corrupt.
 */
async function rotateBackups(): Promise<void> {
  try {
    // Rotate existing backups (backup-0 -> backup-1 -> backup-2)
    for (let i = BACKUP_COUNT - 1; i > 0; i--) {
      const src = path.join(STATE_DIR, `backup-${i - 1}.json`);
      const dst = path.join(STATE_DIR, `backup-${i}.json`);
      try {
        await fs.rename(src, dst);
      } catch {
        // Ignore missing files during rotation
      }
    }
    
    // Copy current to backup-0
    try {
      await fs.copyFile(CURRENT_STATE_PATH, path.join(STATE_DIR, 'backup-0.json'));
    } catch {
      // Current might not exist yet
    }
  } catch (err) {
    const error = ensureError(err);
    logger.warn('security-state', 'warning', '[State] Backup rotation failed', { metadata: { errorMsg: error.message } });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core State Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load current state with full fallback chain:
 * 1. current.json — Primary state file
 * 2. previous.json — Backup from last successful save
 * 3. Newest valid snapshot — Hourly backups (7-day retention)
 * 4. Fresh default state — Clean slate if all else fails
 */
export async function loadState(): Promise<SecurityBotState> {
  logger.info('security-state', 'load', '[State] Loading operational state...');
  
  // Try 1: current.json
  let state = await loadStateFile(CURRENT_STATE_PATH);
  
  // Try 2: previous.json
  if (!state) {
    logger.info('security-state', 'load', '[State] current.json not found/corrupted, trying previous.json...');
    state = await loadStateFile(PREVIOUS_STATE_PATH);
  }
  
  // Try 3: Newest snapshot (P0 recovery chain)
  if (!state) {
    logger.warn('security-state', 'warning', '[State] Primary files unavailable, searching snapshots...');
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
  
  // P2-R1: Rotate backups before saving (non-blocking)
  await rotateBackups();
  
  const success = await saveStateFile(CURRENT_STATE_PATH, state);
  
  if (success) {
    logger.info('security-state', 'save', '[State] State saved successfully');
  }
  
  return success;
}

/**
 * Initialize state on startup with performance timing
 */
export async function initializeState(): Promise<SecurityBotState> {
  const startTime = performance.now();
  let recoveryTier: 'current' | 'previous' | 'snapshot' | 'fresh' = 'current';
  
  logger.info('security-state', 'init', '[State] Initializing state persistence...');
  logger.info('security-state', 'init', '[State] STATE_DIR', { metadata: { path: STATE_DIR } });
  logger.info('security-state', 'init', '[State] Working directory', { metadata: { cwd: process.cwd() } });
  logger.info('security-state', 'init', '[State] Module location', { metadata: { dirname: __dirname } });
  
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    logger.info('security-state', 'init', '[State] State directory verified/created');
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    degradedMode = true;  // P2-R2: Set degraded flag
    logger.error('security-state', 'error', '[State] CRITICAL: Cannot create state directory', { metadata: { errorMsg: error.message } });
    logger.error('security-state', 'error', '[State] ENTERING DEGRADED MODE - state persistence disabled');
    
    await errorTracker.captureError(
      ensureError(error),
      {
        category: 'WORKER',
        severity: 'CRITICAL',
        operation: 'state:initializeDirectories',
        customData: {
          stateDir: STATE_DIR,
          snapshotsDir: SNAPSHOTS_DIR,
          errorCode: error.code,
        },
      }
    );
  }
  
  const previousState = await loadState();
  
  // Track which recovery tier we used
  if (await loadStateFile(CURRENT_STATE_PATH)) {
    recoveryTier = 'current';
    await fs.copyFile(CURRENT_STATE_PATH, PREVIOUS_STATE_PATH).catch(() => {});
  } else if (await loadStateFile(PREVIOUS_STATE_PATH)) {
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
