/**
 * @file Operational Context Restoration
 * @description Restores guild monitoring state and resumes operations after restart
 * @module bot/state/context
 */

import { formatDuration } from '../../shared/utils/format-utils.js';

/**
 * Restore guild monitoring context from state
 */
export function restoreGuildContext(state, guildId) {
  const guildState = state.guilds[guildId];
  
  if (!guildState) {
    return {
      isNew: true,
      shouldResumeSweep: true,
      lastSweep: null,
      sweepCount: 0
    };
  }
  
  return {
    isNew: false,
    shouldResumeSweep: guildState.monitoring,
    lastSweep: guildState.lastSweep,
    sweepCount: guildState.sweepCount,
    alertCount: guildState.alertCount,
    permissionChanges: guildState.permissionChanges
  };
}

/**
 * Get time since last sweep for a guild
 */
export function getTimeSinceLastSweep(state, guildId) {
  const guildState = state.guilds[guildId];
  
  if (!guildState || !guildState.lastSweep) {
    return null;
  }
  
  const now = Date.now();
  const lastSweep = new Date(guildState.lastSweep).getTime();
  return now - lastSweep;
}

/**
 * Check if sweep is overdue for a guild
 */
export function isSweepOverdue(state, guildId, sweepIntervalMs = 5 * 60 * 1000) {
  const timeSinceLast = getTimeSinceLastSweep(state, guildId);
  
  if (timeSinceLast === null) {
    return true; // Never swept, should sweep now
  }
  
  return timeSinceLast > sweepIntervalMs;
}

/**
 * Get guilds that need immediate sweep after restart
 */
export function getGuildsNeedingSweep(state, sweepIntervalMs = 5 * 60 * 1000) {
  return Object.values(state.guilds)
    .filter(guild => guild.monitoring && isSweepOverdue(state, guild.id, sweepIntervalMs))
    .map(guild => ({
      id: guild.id,
      name: guild.name,
      timeSinceLastSweep: getTimeSinceLastSweep(state, guild.id)
    }));
}

/**
 * Initialize guild in state if not exists
 */
export function initializeGuild(state, guildId, guildName) {
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
    
    // Update guild count
    state.cumulative.guildCount = Object.keys(state.guilds).length;
    
    return true; // New guild
  }
  
  // Update name in case it changed
  state.guilds[guildId].name = guildName;
  state.guilds[guildId].lastActivity = new Date().toISOString();
  
  return false; // Existing guild
}

/**
 * Enable monitoring for a guild
 */
export function enableGuildMonitoring(state, guildId) {
  if (state.guilds[guildId]) {
    state.guilds[guildId].monitoring = true;
    state.guilds[guildId].lastActivity = new Date().toISOString();
  }
}

/**
 * Disable monitoring for a guild
 */
export function disableGuildMonitoring(state, guildId) {
  if (state.guilds[guildId]) {
    state.guilds[guildId].monitoring = false;
    state.guilds[guildId].lastActivity = new Date().toISOString();
  }
}

/**
 * Get monitoring status for all guilds
 */
export function getMonitoringStatus(state) {
  return Object.values(state.guilds).map(guild => ({
    id: guild.id,
    name: guild.name,
    monitoring: guild.monitoring,
    lastSweep: guild.lastSweep,
    sweepCount: guild.sweepCount,
    lastActivity: guild.lastActivity
  }));
}

/**
 * Build restart summary showing continuity
 */
export function buildRestartSummary(state) {
  // Calculate time since previous restart (not current restart)
  const previousRestartTime = state.metadata.previousRestart 
    ? new Date(state.metadata.previousRestart).getTime()
    : new Date(state.metadata.lastRestart).getTime();
  const currentRestartTime = new Date(state.metadata.lastRestart).getTime();
  const timeSinceRestart = currentRestartTime - previousRestartTime;
  
  const summary = {
    restartNumber: state.cumulative.restartCount,
    timeSinceLastRestart: formatDuration(timeSinceRestart),
    totalUptime: formatDuration(state.cumulative.totalUptime),
    currentUptime: formatDuration(state.runtime.currentUptime),
    totalSweeps: state.cumulative.sweepCount,
    totalAlerts: state.cumulative.alertCount,
    totalPermissionChanges: state.cumulative.permissionChangesDetected,
    successfulReverts: state.cumulative.permissionChangesReverted,
    failedReverts: state.cumulative.revertFailures,
    guildsMonitored: Object.keys(state.guilds).length,
    databaseStatus: state.runtime.databaseStatus
  };
  
  return summary;
}

/**
 * Format duration helper - now imported from centralized format-utils.js
 */
// function formatDuration removed - using centralized version

/**
 * Get recovery recommendations after restart
 */
export function getRecoveryRecommendations(state) {
  const recommendations = [];
  
  // Check for overdue sweeps
  const overdueGuilds = getGuildsNeedingSweep(state);
  if (overdueGuilds.length > 0) {
    recommendations.push({
      priority: 'high',
      action: 'resume_sweeps',
      message: `${overdueGuilds.length} guild(s) have overdue sweeps`,
      guilds: overdueGuilds
    });
  }
  
  // Check for recent errors
  const recentErrors = state.timeline.filter(e => e.type === 'error').slice(0, 5);
  if (recentErrors.length > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'review_errors',
      message: `${recentErrors.length} error(s) in recent timeline`,
      errors: recentErrors
    });
  }
  
  // Check for failed reverts
  if (state.cumulative.revertFailures > 0) {
    recommendations.push({
      priority: 'medium',
      action: 'review_reverts',
      message: `${state.cumulative.revertFailures} permission revert(s) have failed`,
      count: state.cumulative.revertFailures
    });
  }
  
  return recommendations;
}
