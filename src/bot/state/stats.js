/**
 * @file Runtime Stats Collector
 * @description Tracks and updates cumulative statistics across bot restarts
 * @module bot/state/stats
 */

import { updateCumulativeStats, updateRuntimeState, recordMetricsEvent, getMetricsSummary, getMetricsTrend } from './persistence.js';

// Re-export metrics functions
export { getMetricsSummary, getMetricsTrend } from './persistence.js';

/**
 * Record a role sweep completion
 */
export function recordSweep(state, guildId, guildName, rolesChecked, changesDetected) {
  // Update cumulative stats
  updateCumulativeStats(state, {
    sweepCount: 1
  });
  
  // ENHANCED: Record in hourly metrics history for trend analysis
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
  state.timeline = [
    {
      timestamp: new Date().toISOString(),
      type: 'sweep',
      guildId,
      guildName,
      details: {
        rolesChecked,
        changesDetected
      }
    },
    ...state.timeline
  ].slice(0, 100);
}

/**
 * Record permission change detection and revert
 */
export function recordPermissionChange(
  state,
  guildId,
  guildName,
  userId,
  userName,
  action,
  reverted,
  revertStatus
) {
  // Update cumulative stats
  updateCumulativeStats(state, {
    permissionChangesDetected: 1,
    permissionChangesReverted: reverted ? 1 : 0,
    revertFailures: reverted && revertStatus !== 'success' ? 1 : 0
  });
  
  // ENHANCED: Record in hourly metrics history for trend analysis
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
  state.timeline = [
    {
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
    },
    ...state.timeline
  ].slice(0, 100);
}

/**
 * Record alert sent to administrator
 */
export function recordAlert(state, guildId, recipient, reason, delivered) {
  // Update cumulative stats
  updateCumulativeStats(state, {
    alertCount: 1
  });
  
  // ENHANCED: Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'alert', 1);
  
  // Update guild-specific stats
  if (state.guilds[guildId]) {
    state.guilds[guildId].alertCount = (state.guilds[guildId].alertCount || 0) + 1;
    state.guilds[guildId].lastActivity = new Date().toISOString();
  }
  
  // Add to timeline
  state.timeline = [
    {
      timestamp: new Date().toISOString(),
      type: 'alert',
      guildId,
      details: {
        recipient,
        reason,
        delivered
      }
    },
    ...state.timeline
  ].slice(0, 100);
}

/**
 * Record error event
 */
export function recordError(state, message, stack = null, context = {}) {
  // ENHANCED: Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'error', 1);
  
  // Add to timeline
  state.timeline = [
    {
      timestamp: new Date().toISOString(),
      type: 'error',
      details: {
        message,
        stack: stack ? stack.substring(0, 500) : null,
        ...context
      }
    },
    ...state.timeline
  ].slice(0, 100);
}

/**
 * Record member fetch timeout (for monitoring chronic issues)
 */
export function recordMemberFetchTimeout(state, guildId, guildName, origin, attempt, maxRetries) {
  // ENHANCED: Record in hourly metrics history for trend analysis
  recordMetricsEvent(state, 'member_fetch_timeout', 1);
  
  // Track in guild state if this is a recurring issue
  if (state.guilds[guildId]) {
    state.guilds[guildId].memberFetchTimeouts = (state.guilds[guildId].memberFetchTimeouts || 0) + 1;
    state.guilds[guildId].lastMemberFetchTimeout = new Date().toISOString();
  }
  
  // Add to timeline
  state.timeline = [
    {
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
    },
    ...state.timeline
  ].slice(0, 100);
}

/**
 * Update database connection status
 */
export function updateDatabaseStatus(state, devStatus, prodStatus) {
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
export function updateActiveSweeps(state, guildIds) {
  updateRuntimeState(state, {
    activeSweepIntervals: guildIds
  });
}

/**
 * Get formatted uptime string
 */
export function formatUptime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Get time since last restart
 */
export function getTimeSinceRestart(state) {
  const now = Date.now();
  const restartTime = new Date(state.metadata.lastRestart).getTime();
  return now - restartTime;
}

/**
 * Get formatted stats summary for display
 */
export function getStatsSummary(state) {
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
export function getRecentEvents(state, limit = 10) {
  return state.timeline.slice(0, limit);
}

/**
 * Get guild stats
 */
export function getGuildStats(state, guildId) {
  return state.guilds[guildId] || null;
}

/**
 * Get all guilds summary
 */
export function getAllGuildsSummary(state) {
  return Object.values(state.guilds).map(guild => ({
    id: guild.id,
    name: guild.name,
    sweepCount: guild.sweepCount,
    alertCount: guild.alertCount,
    permissionChanges: guild.permissionChanges,
    lastActivity: guild.lastActivity
  }));
}
