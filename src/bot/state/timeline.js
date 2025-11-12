/**
 * @file Activity Timeline Tracker
 * @description Manages rolling timeline of bot events for display and analysis
 * @module bot/state/timeline
 */

import { toEasternString } from '../../shared/datetime.js';

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
    case 'sweep':
      return `[${timestamp}] Sweep: ${event.guildName} - ${event.details.rolesChecked} roles checked, ${event.details.changesDetected} changes detected`;
    
    case 'permission_change':
      return `[${timestamp}] Permission Change: ${event.guildName} - ${event.details.userName} (${event.details.action}) ${event.details.reverted ? `[REVERTED: ${event.details.revertStatus}]` : '[NOT REVERTED]'}`;
    
    case 'alert':
      return `[${timestamp}] Alert: Sent to ${event.details.recipient} - ${event.details.reason} ${event.details.delivered ? '✓' : '✗'}`;
    
    case 'restart':
      return `[${timestamp}] Restart: ${event.details.reason} (previous uptime: ${formatDuration(event.details.previousUptime)})`;
    
    case 'shutdown':
      return `[${timestamp}] Shutdown: ${event.details.reason} (uptime: ${formatDuration(event.details.uptime)})`;
    
    case 'error':
      return `[${timestamp}] Error: ${event.details.message}`;
    
    case 'member_fetch_timeout':
      const status = event.details.isFinal ? '⚠️ FINAL' : `retry ${event.details.attempt}/${event.details.maxRetries}`;
      return `[${timestamp}] Member Fetch Timeout: ${event.guildName} (${event.details.origin}) [${status}]`;
    
    default:
      return `[${timestamp}] ${event.type}: ${JSON.stringify(event.details)}`;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
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
 * Get timeline events filtered by type
 */
export function getEventsByType(state, eventType, limit = 50) {
  return state.timeline
    .filter(event => event.type === eventType)
    .slice(0, limit);
}

/**
 * Get timeline events for specific guild
 */
export function getEventsByGuild(state, guildId, limit = 50) {
  return state.timeline
    .filter(event => event.guildId === guildId)
    .slice(0, limit);
}

/**
 * Get timeline events within time range
 */
export function getEventsByTimeRange(state, startTime, endTime = new Date()) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  
  return state.timeline.filter(event => {
    const eventTime = new Date(event.timestamp).getTime();
    return eventTime >= start && eventTime <= end;
  });
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
      case 'alert':
        return `• ${relativeTime}: Alert sent to ${event.details.recipient}`;
      case 'error':
        return `• ${relativeTime}: Error - ${event.details.message}`;
      case 'member_fetch_timeout':
        return `• ${relativeTime}: Member fetch timeout in ${event.guildName}`;
      default:
        return `• ${relativeTime}: ${event.type}`;
    }
  });
  
  return lines.join('\n');
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
  } else if (hours > 0) {
    return `${hours}h ago`;
  } else if (minutes > 0) {
    return `${minutes}m ago`;
  } else {
    return `${seconds}s ago`;
  }
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
    member_fetch_timeout: '⏱️'
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
  
  const fields = events.map((event, index) => {
    const icon = getEventIcon(event.type);
    const relativeTime = getRelativeTime(event.timestamp);
    let description = '';
    
    switch (event.type) {
      case 'sweep':
        description = `${event.guildName} - ${event.details.rolesChecked} roles, ${event.details.changesDetected} changes`;
        break;
      case 'permission_change':
        description = `${event.guildName} - ${event.details.userName} [${event.details.revertStatus}]`;
        break;
      case 'alert':
        description = `To ${event.details.recipient} - ${event.details.reason}`;
        break;
      case 'restart':
        description = `${event.details.reason}`;
        break;
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
