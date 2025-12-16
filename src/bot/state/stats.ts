/**
 * Runtime Stats Collector
 * Tracks and updates cumulative statistics across bot restarts
 * @module bot/state/stats
 */

import { updateCumulativeStats, updateRuntimeState, recordMetricsEvent } from './persistence.js';
import { formatDuration } from '../../shared/utils/format-utils.js';
import type {
  SecurityBotState,
  GuildState,
  CumulativeStatsUpdate,
  MetricEventType,
  DatabaseStatus,
  TimelineEvent,
} from './types.js';

// Re-export metrics functions
export { getMetricsSummary, getMetricsTrend } from './persistence.js';

// ─────────────────────────────────────────────────────────────────────────────
// Sweep Recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a role sweep completion
 */
export function recordSweep(
  state: SecurityBotState,
  guildId: string,
  guildName: string,
  rolesChecked: number,
  changesDetected: number
): void {
  // Update cumulative stats
  updateCumulativeStats(state, {
    sweepCount: 1
  });
  
  // Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'sweep', 1);
  
  // Update guild-specific stats
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = {
      id: guildId,
      name: guildName,
      lastSweep: null,
      sweepCount: 0,
      alertCount: 0,
      permissionChanges: 0,
      monitoring: true,
      lastActivity: new Date().toISOString()
    };
  }
  
  state.guilds[guildId].sweepCount = (state.guilds[guildId].sweepCount || 0) + 1;
  state.guilds[guildId].lastSweep = new Date().toISOString();
  state.guilds[guildId].lastActivity = new Date().toISOString();
  
  // Add to timeline
  const newEvent: TimelineEvent = {
    timestamp: new Date().toISOString(),
    type: 'sweep',
    guildId,
    guildName,
    details: {
      rolesChecked,
      changesDetected
    }
  };
  
  state.timeline = [newEvent, ...state.timeline].slice(0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission Change Recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record permission change detection and revert
 */
export function recordPermissionChange(
  state: SecurityBotState,
  guildId: string,
  guildName: string,
  userId: string,
  userName: string,
  action: string,
  reverted: boolean,
  revertStatus: string
): void {
  // Update cumulative stats
  updateCumulativeStats(state, {
    permissionChangesDetected: 1,
    permissionChangesReverted: reverted ? 1 : 0,
    revertFailures: reverted && revertStatus !== 'success' ? 1 : 0
  });
  
  // Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'permission_change', 1);
  if (reverted) {
    recordMetricsEvent(state, 'permission_revert', 1);
    if (revertStatus !== 'success') {
      recordMetricsEvent(state, 'revert_failure', 1);
    }
  }
  
  // Update guild-specific stats
  if (!state.guilds[guildId]) {
    state.guilds[guildId] = {
      id: guildId,
      name: guildName,
      lastSweep: null,
      sweepCount: 0,
      alertCount: 0,
      permissionChanges: 0,
      monitoring: true,
      lastActivity: new Date().toISOString()
    };
  }
  
  state.guilds[guildId].permissionChanges = (state.guilds[guildId].permissionChanges || 0) + 1;
  state.guilds[guildId].lastActivity = new Date().toISOString();
  
  // Add to timeline
  const newEvent: TimelineEvent = {
    timestamp: new Date().toISOString(),
    type: 'permission_change',
    guildId,
    guildName,
    details: {
      userId,
      userName,
      action,
      reverted,
      revertStatus: reverted ? revertStatus : 'not_attempted'
    }
  };
  
  state.timeline = [newEvent, ...state.timeline].slice(0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record alert sent to administrator
 */
export function recordAlert(
  state: SecurityBotState,
  guildId: string,
  recipient: string,
  reason: string,
  delivered: boolean
): void {
  // Update cumulative stats
  updateCumulativeStats(state, {
    alertCount: 1
  });
  
  // Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'alert', 1);
  
  // Update guild-specific stats
  if (state.guilds[guildId]) {
    state.guilds[guildId].alertCount = (state.guilds[guildId].alertCount || 0) + 1;
    state.guilds[guildId].lastActivity = new Date().toISOString();
  }
  
  // Add to timeline
  const newEvent: TimelineEvent = {
    timestamp: new Date().toISOString(),
    type: 'alert',
    guildId,
    details: {
      recipient,
      reason,
      delivered
    }
  };
  
  state.timeline = [newEvent, ...state.timeline].slice(0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record error event
 */
export function recordError(
  state: SecurityBotState,
  message: string,
  stack: string | null = null,
  context: Record<string, unknown> = {}
): void {
  // Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'error' as MetricEventType, 1);
  
  // Add to timeline
  const newEvent: TimelineEvent = {
    timestamp: new Date().toISOString(),
    type: 'error',
    details: {
      message,
      stack: stack ? stack.substring(0, 500) : undefined,
      ...context
    }
  };
  
  state.timeline = [newEvent, ...state.timeline].slice(0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Member Fetch Timeout Recording
// ─────────────────────────────────────────────────────────────────────────────

interface GuildStateExtended extends GuildState {
  memberFetchTimeouts?: number;
  lastMemberFetchTimeout?: string;
}

/**
 * Record member fetch timeout (for monitoring chronic issues)
 */
export function recordMemberFetchTimeout(
  state: SecurityBotState,
  guildId: string,
  guildName: string,
  origin: string,
  attempt: number,
  maxRetries: number
): void {
  // Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'member_fetch_timeout' as MetricEventType, 1);
  
  // Track in guild state if this is a recurring issue
  const guildState = state.guilds[guildId] as GuildStateExtended | undefined;
  if (guildState) {
    guildState.memberFetchTimeouts = (guildState.memberFetchTimeouts || 0) + 1;
    guildState.lastMemberFetchTimeout = new Date().toISOString();
  }
  
  // Add to timeline
  const newEvent: TimelineEvent = {
    timestamp: new Date().toISOString(),
    type: 'member_fetch_timeout',
    guildId,
    guildName,
    details: {
      origin,
      attempt,
      maxRetries,
      isFinal: attempt >= maxRetries
    }
  };
  
  state.timeline = [newEvent, ...state.timeline].slice(0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Database Status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Update database connection status
 */
export function updateDatabaseStatus(
  state: SecurityBotState,
  devStatus?: DatabaseStatus['dev'],
  prodStatus?: DatabaseStatus['prod']
): void {
  updateRuntimeState(state, {
    databaseStatus: {
      dev: devStatus || state.runtime.databaseStatus.dev,
      prod: prodStatus || state.runtime.databaseStatus.prod
    }
  });
}

/**
 * Update active sweep intervals tracking
 */
export function updateActiveSweeps(state: SecurityBotState, guildIds: string[]): void {
  updateRuntimeState(state, {
    activeSweepIntervals: guildIds
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Uptime Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get formatted uptime string (delegates to shared utility)
 */
export function formatUptime(milliseconds: number): string {
  return formatDuration(milliseconds);
}

/**
 * Get time since last restart
 */
export function getTimeSinceRestart(state: SecurityBotState): number {
  const now = Date.now();
  const restartTime = new Date(state.metadata.lastRestart).getTime();
  return now - restartTime;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface StatsSummaryResult {
  currentUptime: string;
  totalUptime: string;
  timeSinceRestart: string;
  restartCount: number;
  sweepCount: number;
  alertCount: number;
  permissionChangesDetected: number;
  permissionChangesReverted: number;
  revertFailures: number;
  guildCount: number;
  databaseStatus: DatabaseStatus;
}

/**
 * Get formatted stats summary for display
 */
export function getStatsSummary(state: SecurityBotState): StatsSummaryResult {
  const currentUptime = Date.now() - new Date(state.metadata.processStartTime).getTime();
  const timeSinceRestart = getTimeSinceRestart(state);
  
  return {
    currentUptime: formatUptime(currentUptime),
    totalUptime: formatUptime(state.cumulative.totalUptime + currentUptime),
    timeSinceRestart: formatUptime(timeSinceRestart),
    restartCount: state.cumulative.restartCount,
    sweepCount: state.cumulative.sweepCount,
    alertCount: state.cumulative.alertCount,
    permissionChangesDetected: state.cumulative.permissionChangesDetected,
    permissionChangesReverted: state.cumulative.permissionChangesReverted,
    revertFailures: state.cumulative.revertFailures,
    guildCount: Object.keys(state.guilds).length,
    databaseStatus: state.runtime.databaseStatus
  };
}

/**
 * Get recent timeline events for display
 */
export function getRecentEvents(state: SecurityBotState, limit: number = 10): TimelineEvent[] {
  return state.timeline.slice(0, limit);
}

/**
 * Get guild stats
 */
export function getGuildStats(state: SecurityBotState, guildId: string): GuildState | null {
  return state.guilds[guildId] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Guild Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface GuildSummary {
  id: string;
  name: string;
  sweepCount: number;
  alertCount: number;
  permissionChanges: number;
  lastActivity: string;
}

/**
 * Get all guilds summary
 */
export function getAllGuildsSummary(state: SecurityBotState): GuildSummary[] {
  return Object.values(state.guilds).map((guild: GuildState) => ({
    id: guild.id,
    name: guild.name,
    sweepCount: guild.sweepCount,
    alertCount: guild.alertCount,
    permissionChanges: guild.permissionChanges,
    lastActivity: guild.lastActivity
  }));
}
