/**
 * State Persistence Module
 * Manages security bot operational state across restarts
 * @module bot/state/persistence
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../../utils/logger.js';
import { getFilesafeTimestamp } from '../../shared/utils/index.js';
import { errorTracker } from '../../services/monitoring/index.js';
// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
const AUTO_SAVE_INTERVAL_MS = 30 * 1000;
const METRICS_HISTORY_DAYS = 7;
// ─────────────────────────────────────────────────────────────────────────────
// Default State
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Default empty state structure
 */
function createDefaultState() {
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
 * Validate state structure
 */
function validateState(state) {
    if (!state || typeof state !== 'object')
        return false;
    const s = state;
    if (!s.version || !s.schemaVersion)
        return false;
    if (!s.metadata || !s.cumulative || !s.timeline || !s.guilds || !s.runtime)
        return false;
    return true;
}
/**
 * Migrate state from older schema versions
 */
function migrateState(state) {
    if (state.version === STATE_VERSION) {
        return state;
    }
    log('warn', '[State] Unknown state version', { version: state.version });
    return state;
}
// ─────────────────────────────────────────────────────────────────────────────
// File Operations
// ─────────────────────────────────────────────────────────────────────────────
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
    }
    catch (err) {
        const error = err;
        if (error.code === 'ENOENT') {
            return null;
        }
        log('error', '[State] Error loading file', { filePath, error: error.message });
        errorTracker.captureError(error instanceof Error ? error : new Error(String(error)), {
            category: 'WORKER',
            operation: 'state:loadFile',
            customData: { filePath, errorCode: error.code },
        }).catch(() => { });
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
    }
    catch (err) {
        const error = err;
        log('error', '[State] Error saving file', { filePath, error: error.message });
        await errorTracker.captureError(error instanceof Error ? error : new Error(String(error)), {
            category: 'WORKER',
            operation: 'state:saveFile',
            customData: { filePath, errorCode: error.code },
        });
        return false;
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Snapshots
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Create timestamped snapshot
 */
async function createSnapshot(state) {
    try {
        await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
        const timestamp = getFilesafeTimestamp();
        const snapshotPath = path.join(SNAPSHOTS_DIR, `${timestamp}.json`);
        await saveStateFile(snapshotPath, state);
        return snapshotPath;
    }
    catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log('error', '[State] Error creating snapshot', { error: error.message });
        return null;
    }
}
/**
 * Prune old snapshots
 */
async function pruneSnapshots() {
    try {
        await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
        const files = await fs.readdir(SNAPSHOTS_DIR);
        const now = Date.now();
        const maxAge = SNAPSHOT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        let pruned = 0;
        for (const file of files) {
            if (!file.endsWith('.json'))
                continue;
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
    }
    catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log('error', '[State] Error pruning snapshots', { error: error.message });
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Core State Operations
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Load current state with fallback chain
 */
export async function loadState() {
    log('info', '[State] Loading operational state...');
    let state = await loadStateFile(CURRENT_STATE_PATH);
    if (!state) {
        log('info', '[State] current.json not found, trying previous.json...');
        state = await loadStateFile(PREVIOUS_STATE_PATH);
    }
    if (!state) {
        log('info', '[State] No previous state found, initializing fresh state');
        state = createDefaultState();
    }
    else {
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
    try {
        await fs.mkdir(STATE_DIR, { recursive: true });
        await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
        log('info', '[State] State directory verified/created');
    }
    catch (err) {
        const error = err;
        log('error', '[State] CRITICAL: Cannot create state directory', { error: error.message });
        log('error', '[State] State persistence will be degraded (in-memory only)');
        await errorTracker.captureError(error instanceof Error ? error : new Error(String(error)), {
            category: 'WORKER',
            severity: 'CRITICAL',
            operation: 'state:initializeDirectories',
            customData: {
                stateDir: STATE_DIR,
                snapshotsDir: SNAPSHOTS_DIR,
                errorCode: error.code,
            },
        });
    }
    const previousState = await loadState();
    if (await loadStateFile(CURRENT_STATE_PATH)) {
        await fs.copyFile(CURRENT_STATE_PATH, PREVIOUS_STATE_PATH).catch(() => { });
    }
    const now = new Date().toISOString();
    const previousRestartTime = previousState.metadata?.lastRestart || now;
    const previousUptime = previousState.runtime?.currentUptime || 0;
    const state = {
        ...previousState,
        metadata: {
            ...previousState.metadata,
            previousRestart: previousRestartTime,
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
    recordMetricsEvent(state, 'restart', 1);
    await saveState(state);
    await createSnapshot(state);
    await pruneSnapshots();
    log('info', '[State] Initialized', { restartNumber: state.cumulative.restartCount });
    return state;
}
// ─────────────────────────────────────────────────────────────────────────────
// Timeline Events
// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
// Cumulative Stats
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Update cumulative stats
 */
export function updateCumulativeStats(state, updates) {
    for (const [key, value] of Object.entries(updates)) {
        if (typeof value === 'number' && key in state.cumulative) {
            const statKey = key;
            const currentValue = state.cumulative[statKey];
            if (typeof currentValue === 'number') {
                state.cumulative[statKey] = currentValue + value;
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
// ─────────────────────────────────────────────────────────────────────────────
// Runtime State
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Update runtime state
 */
export function updateRuntimeState(state, updates) {
    Object.assign(state.runtime, updates);
    state.runtime.currentUptime = Date.now() - new Date(state.metadata.processStartTime).getTime();
}
// ─────────────────────────────────────────────────────────────────────────────
// Metrics History
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Get or create current hour's metrics bucket
 */
function getCurrentHourMetrics(state) {
    const now = new Date();
    const hourTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
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
        state.metricsHistory.hourly.push(hourMetrics);
        state.metricsHistory.hourly.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    }
    return hourMetrics;
}
/**
 * Prune metrics history older than retention period
 */
function pruneMetricsHistory(state) {
    if (!state.metricsHistory)
        return;
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
export function getMetricsSummary(state, hoursBack = 24) {
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
        summary.restarts += m.restarts ?? 0;
    }
    return summary;
}
/**
 * Get hourly metrics trend for charts/graphs
 */
export function getMetricsTrend(state, hoursBack = 168) {
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
// ─────────────────────────────────────────────────────────────────────────────
// Shutdown
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Graceful shutdown - save final state
 */
export async function shutdownState(state, reason = 'manual') {
    log('info', '[State] Shutting down', { reason });
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
    log('info', '[State] Shutdown complete');
}
