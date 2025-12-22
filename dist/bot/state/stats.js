/**
 * Runtime Stats Collector
 * Tracks and updates cumulative statistics across bot restarts
 * @module bot/state/stats
 */
import { updateCumulativeStats, updateRuntimeState, recordMetricsEvent, addTimelineEvent } from './persistence.js';
import { initializeGuild } from './context.js';
import { formatDuration } from '../../shared/utils/format-utils.js';
import { observabilityHub } from '../../observability/index.js';
// Re-export metrics functions
export { getMetricsSummary, getMetricsTrend } from './persistence.js';
// ─────────────────────────────────────────────────────────────────────────────
// Sweep Recording
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record a role sweep completion
 */
export function recordSweep(state, guildId, guildName, rolesChecked, changesDetected) {
    // Update cumulative stats
    updateCumulativeStats(state, {
        sweepCount: 1
    });
    // Record in hourly metrics history for trend analysis
    recordMetricsEvent(state, 'sweep', 1);
    // Emit to Observability Hub for Loki ingestion (Security Bot direct path)
    observabilityHub.ingest('security.sweep.completed', {
        guildId,
        guildName,
        rolesChecked,
        changesDetected,
        sweepCount: state.cumulative.sweepCount,
    }, 'security-bot');
    // Update guild-specific stats (use shared helper for consistency)
    initializeGuild(state, guildId, guildName);
    state.guilds[guildId].sweepCount = (state.guilds[guildId].sweepCount || 0) + 1;
    state.guilds[guildId].lastSweep = new Date().toISOString();
    state.guilds[guildId].lastActivity = new Date().toISOString();
    // Add to timeline (P3: use ring buffer pattern)
    addTimelineEvent(state, {
        type: 'sweep',
        guildId,
        guildName,
        details: {
            rolesChecked,
            changesDetected
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Permission Change Recording
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record permission change detection and revert
 */
export function recordPermissionChange(state, guildId, guildName, userId, userName, action, reverted, revertStatus) {
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
    // Emit to Observability Hub for Loki ingestion (Security Bot direct path)
    observabilityHub.ingest('security.permission.changed', {
        guildId,
        guildName,
        userId,
        userName,
        action,
        reverted,
        revertStatus: reverted ? revertStatus : 'not_attempted',
        totalChanges: state.cumulative.permissionChangesDetected,
        totalReverts: state.cumulative.permissionChangesReverted,
    }, 'security-bot');
    // Update guild-specific stats (use shared helper for consistency)
    initializeGuild(state, guildId, guildName);
    state.guilds[guildId].permissionChanges = (state.guilds[guildId].permissionChanges || 0) + 1;
    state.guilds[guildId].lastActivity = new Date().toISOString();
    // Add to timeline (P3: use ring buffer pattern)
    addTimelineEvent(state, {
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
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Alert Recording
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record alert sent to administrator
 */
export function recordAlert(state, guildId, recipient, reason, delivered) {
    // Update cumulative stats
    updateCumulativeStats(state, {
        alertCount: 1
    });
    // Record in hourly metrics history for trend analysis
    recordMetricsEvent(state, 'alert', 1);
    // Emit to Observability Hub for Loki ingestion (Security Bot direct path)
    observabilityHub.ingest('security.alert.sent', {
        guildId,
        recipient,
        reason,
        delivered,
        totalAlerts: state.cumulative.alertCount,
    }, 'security-bot');
    // Update guild-specific stats
    if (state.guilds[guildId]) {
        state.guilds[guildId].alertCount = (state.guilds[guildId].alertCount || 0) + 1;
        state.guilds[guildId].lastActivity = new Date().toISOString();
    }
    // Add to timeline (P3: use ring buffer pattern)
    addTimelineEvent(state, {
        type: 'alert',
        guildId,
        details: {
            recipient,
            reason,
            delivered
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Error Recording
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Record error event
 */
export function recordError(state, message, stack = null, context = {}) {
    // Record in hourly metrics history for trend analysis
    recordMetricsEvent(state, 'error', 1);
    // Emit to Observability Hub for Loki ingestion (Security Bot direct path)
    observabilityHub.ingest('security.error.occurred', {
        message,
        stack: stack ? stack.substring(0, 500) : null,
        ...context,
    }, 'security-bot');
    // Add to timeline (P3: use ring buffer pattern)
    addTimelineEvent(state, {
        type: 'error',
        details: {
            message,
            stack: stack ? stack.substring(0, 500) : undefined,
            ...context
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Member Fetch Timeout Recording
// ─────────────────────────────────────────────────────────────────────────────
// Note: GuildState already includes memberFetchTimeouts and lastMemberFetchTimeout fields
// No separate interface needed (P3 cleanup)
/**
 * Record member fetch timeout (for monitoring chronic issues)
 */
export function recordMemberFetchTimeout(state, guildId, guildName, origin, attempt, maxRetries) {
    // Record in hourly metrics history for trend analysis
    recordMetricsEvent(state, 'member_fetch_timeout', 1);
    // Track in guild state if this is a recurring issue
    const guildState = state.guilds[guildId];
    if (guildState) {
        guildState.memberFetchTimeouts = (guildState.memberFetchTimeouts || 0) + 1;
        guildState.lastMemberFetchTimeout = new Date().toISOString();
    }
    // Add to timeline (P3: use ring buffer pattern)
    addTimelineEvent(state, {
        type: 'member_fetch_timeout',
        guildId,
        guildName,
        details: {
            origin,
            attempt,
            maxRetries,
            isFinal: attempt >= maxRetries
        }
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Database Status
// ─────────────────────────────────────────────────────────────────────────────
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
// ─────────────────────────────────────────────────────────────────────────────
// Uptime Utilities
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Get formatted uptime string (delegates to shared utility)
 */
export function formatUptime(milliseconds) {
    return formatDuration(milliseconds);
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
    return Object.values(state.guilds).map((guild) => ({
        id: guild.id,
        name: guild.name,
        sweepCount: guild.sweepCount,
        alertCount: guild.alertCount,
        permissionChanges: guild.permissionChanges,
        lastActivity: guild.lastActivity
    }));
}
// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle Events (Observability Hub Direct Ingestion)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Emit Security Bot startup event to Observability Hub
 */
export function emitStartup(state) {
    observabilityHub.ingest('security.lifecycle.startup', {
        restartCount: state.cumulative.restartCount,
        processStartTime: state.metadata.processStartTime,
        lastRestart: state.metadata.lastRestart,
        guildCount: Object.keys(state.guilds).length,
    }, 'security-bot');
}
/**
 * Emit Security Bot shutdown event to Observability Hub
 */
export function emitShutdown(state, reason = 'graceful') {
    const uptime = Date.now() - new Date(state.metadata.processStartTime).getTime();
    observabilityHub.ingest('security.lifecycle.shutdown', {
        reason,
        uptimeMs: uptime,
        sweepsCompleted: state.cumulative.sweepCount,
        alertsSent: state.cumulative.alertCount,
        permissionChanges: state.cumulative.permissionChangesDetected,
        revertsAttempted: state.cumulative.permissionChangesReverted,
        revertFailures: state.cumulative.revertFailures,
    }, 'security-bot');
}
