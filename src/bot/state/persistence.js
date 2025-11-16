import { log } from '../../utils/logger.js';
/**
 * @file State Persistence Module
 * @description Manages security bot operational state across restarts
 * @module bot/state/persistence
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { errorTracker } from '../../services/monitoring/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve state directory relative to project root
// On Render with persistent disk mounted at /Store
// Locally falls back to Store/ in project directory
const STATE_DIR = process.env.RENDER 
  ? '/Store/security-bot-state'
  : path.resolve(__dirname, '../../../Store/security-bot-state');
const CURRENT_STATE_PATH = path.join(STATE_DIR, 'current.json');
const PREVIOUS_STATE_PATH = path.join(STATE_DIR, 'previous.json');
const SNAPSHOTS_DIR = path.join(STATE_DIR, 'snapshots');

const SCHEMA_VERSION = '1.1.0';
const STATE_VERSION = 1;
const MAX_TIMELINE_EVENTS = 100;
const SNAPSHOT_RETENTION_DAYS = 7;
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const METRICS_HISTORY_DAYS = 7; // Keep 7 days of hourly metrics

/**
 * Default empty state structure
 */
function createDefaultState() {
  return {
    version: STATE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    metadata: {
      lastSaved: new Date().toISOString(),
      lastRestart: new Date().toISOString(),
      processStartTime: new Date().toISOString(),
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
      firstStartTime: new Date().toISOString()
    },
    // ENHANCED: 7-day comprehensive metrics history (hourly granularity)
    metricsHistory: {
      // Array of hourly metric snapshots: { timestamp, sweeps, alerts, changes, reverts, failures }
      hourly: [],
      // Retention: Automatically pruned to keep only last 7 days (168 hours)
      lastPruned: new Date().toISOString()
    },
    timeline: [],
    guilds: {},
    runtime: {
      currentUptime: 0,
      currentRestartTime: new Date().toISOString(),
      databaseStatus: {
        dev: 'unknown',
        prod: 'unknown'
      },
      activeSweepIntervals: []
    }
  };
}

/**
 * Validate state structure
 */
function validateState(state) {
  if (!state || typeof state !== 'object') return false;
  if (!state.version || !state.schemaVersion) return false;
  if (!state.metadata || !state.cumulative || !state.timeline || !state.guilds || !state.runtime) return false;
  return true;
}

/**
 * Migrate state from older schema versions
 */
function migrateState(state) {
  // Currently only version 1 exists
  if (state.version === STATE_VERSION) {
    return state;
  }

  // Future migrations would go here
  log('warn', '[State] Unknown state version', { version: state.version });
  return state;
}

/**
 * Load state from JSON file
 */
async function loadStateFile(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const state = JSON.parse(data);
    
    if (!validateState(state)) {
      log('error', '[State] Invalid state structure', { filePath });
      return null;
    }
    
    return migrateState(state);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet
      return null;
    }
    log('error', '[State] Error loading file', { filePath, error: error.message });
    
    // Track non-ENOENT errors (corruption, parse failures, etc.)
    errorTracker.captureError(
      error instanceof Error ? error : new Error(String(error)),
      {
        category: 'WORKER',
        operation: 'state:loadFile',
        customData: { filePath, errorCode: error.code },
      }
    ).catch(() => {}); // Fire-and-forget (sync function context)
    
    return null;
  }
}

/**
 * Save state to JSON file
 */
async function saveStateFile(filePath, state) {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const json = JSON.stringify(state, null, 2);
    await fs.writeFile(filePath, json, 'utf8');
    return true;
  } catch (error) {
    log('error', '[State] Error saving file', { filePath, error: error.message });
    
    // Track save failures (disk full, permissions, etc.)
    await errorTracker.captureError(
      error instanceof Error ? error : new Error(String(error)),
      {
        category: 'WORKER',
        operation: 'state:saveFile',
        customData: { filePath, errorCode: error.code },
      }
    );
    
    return false;
  }
}

/**
 * Create timestamped snapshot
 */
async function createSnapshot(state) {
  try {
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const snapshotPath = path.join(SNAPSHOTS_DIR, `${timestamp}.json`);
    await saveStateFile(snapshotPath, state);
    return snapshotPath;
  } catch (error) {
    log('error', '[State] Error creating snapshot', { error: error.message });
    return null;
  }
}

/**
 * Prune old snapshots
 */
async function pruneSnapshots() {
  try {
    // Ensure snapshots directory exists before trying to read it
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
      log('info', '[State] Pruned old snapshots', { count: pruned });
    }
  } catch (error) {
    log('error', '[State] Error pruning snapshots', { error: error.message });
  }
}

/**
 * Load current state with fallback chain
 */
export async function loadState() {
  log('info', '[State] Loading operational state...');
  
  // Try current.json first
  let state = await loadStateFile(CURRENT_STATE_PATH);
  
  // Fall back to previous.json
  if (!state) {
    log('info', '[State] current.json not found, trying previous.json...');
    state = await loadStateFile(PREVIOUS_STATE_PATH);
  }
  
  // Fall back to default
  if (!state) {
    log('info', '[State] No previous state found, initializing fresh state');
    state = createDefaultState();
  } else {
    log('info', '[State] Loaded state', { lastSaved: state.metadata.lastSaved });
  }
  
  return state;
}

/**
 * Save current state
 */
export async function saveState(state) {
  state.metadata.lastSaved = new Date().toISOString();
  const success = await saveStateFile(CURRENT_STATE_PATH, state);
  
  if (success) {
    log('info', '[State] State saved successfully');
  }
  
  return success;
}

/**
 * Initialize state on startup
 */
export async function initializeState() {
  log('info', '[State] Initializing state persistence...');
  log('info', '[State] STATE_DIR', { path: STATE_DIR });
  log('info', '[State] Working directory', { cwd: process.cwd() });
  log('info', '[State] Module location', { dirname: __dirname });
  
  // Verify state directory exists and is writable
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
    log('info', '[State] State directory verified/created');
  } catch (error) {
    log('error', '[State] CRITICAL: Cannot create state directory', { error: error.message });
    log('error', '[State] State persistence will be degraded (in-memory only)');
    
    // Track critical directory creation failures
    await errorTracker.captureError(
      error instanceof Error ? error : new Error(String(error)),
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
  
  // Load previous state
  const previousState = await loadState();
  
  // Back up current.json to previous.json
  if (await loadStateFile(CURRENT_STATE_PATH)) {
    await fs.copyFile(CURRENT_STATE_PATH, PREVIOUS_STATE_PATH).catch(() => {});
  }
  
  // Create new runtime state
  const now = new Date().toISOString();
  const previousRestartTime = previousState.metadata?.lastRestart || now;
  const previousUptime = previousState.runtime?.currentUptime || 0;
  
  const state = {
    ...previousState,
    metadata: {
      ...previousState.metadata,
      previousRestart: previousRestartTime, // Preserve previous restart time for continuity reporting
      lastRestart: now,
      processStartTime: now,
      hostname: process.env.RENDER_SERVICE_NAME || 'local',
      nodeVersion: process.version
    },
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
  
  // Add restart event to timeline
  state.timeline = [
    {
      timestamp: now,
      type: 'restart',
      details: {
        reason: 'manual',
        previousUptime: previousState.runtime?.currentUptime || 0
      }
    },
    ...previousState.timeline
  ].slice(0, MAX_TIMELINE_EVENTS);
  
  // ENHANCED: Record restart in hourly metrics history
  recordMetricsEvent(state, 'restart', 1);
  
  // Save initial state
  await saveState(state);
  await createSnapshot(state);
  await pruneSnapshots();
  
  log('info', '[State] Initialized', { restartNumber: state.cumulative.restartCount });
  return state;
}

/**
 * Add event to timeline
 */
export function addTimelineEvent(state, event) {
  state.timeline = [
    {
      timestamp: new Date().toISOString(),
      ...event
    },
    ...state.timeline
  ].slice(0, MAX_TIMELINE_EVENTS);
}

/**
 * Update cumulative stats
 */
export function updateCumulativeStats(state, updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'number') {
      state.cumulative[key] = (state.cumulative[key] || 0) + value;
    }
  }
}

/**
 * Update guild state
 */
export function updateGuildState(state, guildId, updates) {
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

/**
 * Update runtime state
 */
export function updateRuntimeState(state, updates) {
  Object.assign(state.runtime, updates);
  state.runtime.currentUptime = Date.now() - new Date(state.metadata.processStartTime).getTime();
}

/**
 * Get or create current hour's metrics bucket
 */
function getCurrentHourMetrics(state) {
  const now = new Date();
  const hourTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
  
  // Ensure metricsHistory exists (migration support)
  if (!state.metricsHistory) {
    state.metricsHistory = {
      hourly: [],
      lastPruned: new Date().toISOString()
    };
  }
  
  // Find existing bucket for current hour
  let hourMetrics = state.metricsHistory.hourly.find(m => m.timestamp === hourTimestamp);
  
  if (!hourMetrics) {
    // Create new bucket for this hour
    hourMetrics = {
      timestamp: hourTimestamp,
      sweeps: 0,
      alerts: 0,
      permissionChanges: 0,
      permissionReverts: 0,
      revertFailures: 0,
      errors: 0,
      memberFetchTimeouts: 0,
      restarts: 0
    };
    state.metricsHistory.hourly.push(hourMetrics);
    
    // Keep array sorted by timestamp (newest first)
    state.metricsHistory.hourly.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }
  
  return hourMetrics;
}

/**
 * Prune metrics history older than retention period
 */
function pruneMetricsHistory(state) {
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
    log('info', '[State] Pruned old metrics', { pruned, remaining: state.metricsHistory.hourly.length });
  }
  
  state.metricsHistory.lastPruned = new Date().toISOString();
}

/**
 * Record metrics event (updates both cumulative and hourly history)
 */
export function recordMetricsEvent(state, eventType, count = 1) {
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
      hourMetrics.restarts += count;
      break;
  }
  
  // Prune old metrics every hour (check on each event for simplicity)
  const lastPruned = new Date(state.metricsHistory.lastPruned).getTime();
  const hoursSinceLastPrune = (Date.now() - lastPruned) / (60 * 60 * 1000);
  if (hoursSinceLastPrune >= 1) {
    pruneMetricsHistory(state);
  }
}

/**
 * Get metrics summary for a time range
 */
export function getMetricsSummary(state, hoursBack = 24) {
  if (!state.metricsHistory || !state.metricsHistory.hourly) {
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
  
  const summary = {
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
    summary.restarts += m.restarts;
  }
  
  return summary;
}

/**
 * Get hourly metrics trend for charts/graphs
 */
export function getMetricsTrend(state, hoursBack = 168) {
  if (!state.metricsHistory || !state.metricsHistory.hourly) {
    return [];
  }
  
  const cutoffTime = Date.now() - (hoursBack * 60 * 60 * 1000);
  return state.metricsHistory.hourly
    .filter(m => new Date(m.timestamp).getTime() >= cutoffTime)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()); // Oldest to newest for charts
}

/**
 * Start auto-save interval
 */
export function startAutoSave(state) {
  const interval = setInterval(async () => {
    log('info', '[State] Auto-saving state...');
    await saveState(state);
  }, AUTO_SAVE_INTERVAL_MS);
  
  log('info', '[State] Auto-save enabled', { intervalSeconds: AUTO_SAVE_INTERVAL_MS / 1000 });
  return interval;
}

/**
 * Stop auto-save interval
 */
export function stopAutoSave(interval) {
  if (interval) {
    clearInterval(interval);
    log('info', '[State] Auto-save stopped');
  }
}

/**
 * Graceful shutdown - save final state
 */
export async function shutdownState(state, reason = 'manual') {
  log('info', '[State] Shutting down', { reason });
  
  // Add shutdown event
  addTimelineEvent(state, {
    type: 'shutdown',
    details: {
      reason,
      uptime: state.runtime.currentUptime
    }
  });
  
  // Update final stats
  updateRuntimeState(state, {});
  
  // Save final state
  await saveState(state);
  await createSnapshot(state);
  
  log('info', '[State] Shutdown complete');
}
