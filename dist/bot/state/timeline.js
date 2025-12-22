/**
 * Activity Timeline Tracker
 * Manages rolling timeline of bot events for display and analysis
 * @module bot/state/timeline
 */
import { toEasternString } from '../../shared/datetime.js';
import { formatDuration } from '../../shared/utils/format-utils.js';
// ─────────────────────────────────────────────────────────────────────────────
// Event Formatting
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Format timeline event for human-readable display
 */
export function formatTimelineEvent(event) {
    const timestamp = toEasternString(new Date(event.timestamp), {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: undefined,
    });
    switch (event.type) {
        case 'sweep': {
            const details = event.details;
            return `[${timestamp}] Sweep: ${event.guildName} - ${details.rolesChecked} roles checked, ${details.changesDetected} changes detected`;
        }
        case 'permission_change': {
            const details = event.details;
            return `[${timestamp}] Permission Change: ${event.guildName} - ${details.userName} (${details.action}) ${details.reverted ? `[REVERTED: ${details.revertStatus}]` : '[NOT REVERTED]'}`;
        }
        case 'alert': {
            const details = event.details;
            return `[${timestamp}] Alert: Sent to ${details.recipient} - ${details.reason} ${details.delivered ? '✓' : '✗'}`;
        }
        case 'restart': {
            const details = event.details;
            return `[${timestamp}] Restart: ${details.reason} (previous uptime: ${formatDuration(details.previousUptime)})`;
        }
        case 'shutdown': {
            const details = event.details;
            return `[${timestamp}] Shutdown: ${details.reason} (uptime: ${formatDuration(details.uptime)})`;
        }
        case 'error': {
            const details = event.details;
            return `[${timestamp}] Error: ${details.message}`;
        }
        case 'member_fetch_timeout': {
            const details = event.details;
            const status = details.isFinal ? '⚠️ FINAL' : `retry ${details.attempt}/${details.maxRetries}`;
            return `[${timestamp}] Member Fetch Timeout: ${event.guildName} (${details.origin}) [${status}]`;
        }
        case 'crash_recovery': {
            const details = event.details;
            return `[${timestamp}] Crash Recovery: Resumed ${details.resumedOperations} operation(s) (checkpoint age: ${Math.round(details.checkpointAge / 1000)}s)`;
        }
        default:
            return `[${timestamp}] ${event.type}: ${JSON.stringify(event.details)}`;
    }
}
/**
 * Get timeline summary statistics
 */
export function getTimelineSummary(state) {
    const typeCounts = {};
    for (const event of state.timeline) {
        typeCounts[event.type] = (typeCounts[event.type] || 0) + 1;
    }
    const firstEvent = state.timeline[state.timeline.length - 1];
    const lastEvent = state.timeline[0];
    return {
        totalEvents: state.timeline.length,
        eventTypes: typeCounts,
        firstEvent: firstEvent ? firstEvent.timestamp : null,
        lastEvent: lastEvent ? lastEvent.timestamp : null,
        timeSpan: firstEvent && lastEvent
            ? new Date(lastEvent.timestamp).getTime() - new Date(firstEvent.timestamp).getTime()
            : 0
    };
}
// ─────────────────────────────────────────────────────────────────────────────
// Display Formatting
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Get formatted timeline for display (Discord embed-friendly)
 */
export function getFormattedTimeline(state, limit = 10) {
    const events = state.timeline.slice(0, limit);
    if (events.length === 0) {
        return ['No recent activity'];
    }
    return events.map(formatTimelineEvent);
}
/**
 * Get relative time string (e.g., "2 hours ago")
 */
function getRelativeTime(timestamp) {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) {
        return `${days}d ago`;
    }
    else if (hours > 0) {
        return `${hours}h ago`;
    }
    else if (minutes > 0) {
        return `${minutes}m ago`;
    }
    else {
        return `${seconds}s ago`;
    }
}
/**
 * Get recent activity summary for restart DM
 */
export function getRecentActivitySummary(state, limit = 5) {
    const events = state.timeline.slice(0, limit);
    if (events.length === 0) {
        return 'No recent activity before restart';
    }
    const lines = events.map(event => {
        const relativeTime = getRelativeTime(event.timestamp);
        switch (event.type) {
            case 'sweep':
                return `• ${relativeTime}: Swept ${event.guildName}`;
            case 'permission_change':
                return `• ${relativeTime}: Reverted unauthorized change in ${event.guildName}`;
            case 'alert': {
                const details = event.details;
                return `• ${relativeTime}: Alert sent to ${details.recipient}`;
            }
            case 'error': {
                const details = event.details;
                return `• ${relativeTime}: Error - ${details.message}`;
            }
            case 'member_fetch_timeout':
                return `• ${relativeTime}: Member fetch timeout in ${event.guildName}`;
            case 'crash_recovery': {
                const details = event.details;
                return `• ${relativeTime}: Crash recovery - resumed ${details.resumedOperations} operation(s)`;
            }
            default:
                return `• ${relativeTime}: ${event.type}`;
        }
    });
    return lines.join('\n');
}
/**
 * Get event icon emoji for display
 */
export function getEventIcon(eventType) {
    const icons = {
        sweep: '🔍',
        permission_change: '⚠️',
        alert: '📢',
        restart: '🔄',
        shutdown: '⏹️',
        error: '❌',
        member_fetch_timeout: '⏱️',
        crash_recovery: '🔧'
    };
    return icons[eventType] || '📝';
}
/**
 * Build Discord embed fields for timeline
 */
export function buildTimelineEmbedFields(state, limit = 10) {
    const events = state.timeline.slice(0, limit);
    if (events.length === 0) {
        return [{
                name: 'Recent Activity',
                value: 'No events recorded yet',
                inline: false
            }];
    }
    const fields = events.map((event) => {
        const icon = getEventIcon(event.type);
        const relativeTime = getRelativeTime(event.timestamp);
        let description = '';
        switch (event.type) {
            case 'sweep': {
                const details = event.details;
                description = `${event.guildName} - ${details.rolesChecked} roles, ${details.changesDetected} changes`;
                break;
            }
            case 'permission_change': {
                const details = event.details;
                description = `${event.guildName} - ${details.userName} [${details.revertStatus}]`;
                break;
            }
            case 'alert': {
                const details = event.details;
                description = `To ${details.recipient} - ${details.reason}`;
                break;
            }
            case 'restart': {
                const details = event.details;
                description = `${details.reason}`;
                break;
            }
            default:
                description = JSON.stringify(event.details).substring(0, 100);
        }
        return {
            name: `${icon} ${event.type} (${relativeTime})`,
            value: description,
            inline: false
        };
    });
    return fields;
}
