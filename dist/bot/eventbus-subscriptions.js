/**
 * EventBus Subscriptions for Security Bot
 * 
 * Centralizes all EventBus subscription handlers for logging, monitoring,
 * and processing security-related events. All subscriptions use priority
 * ordering and backpressure limits to ensure reliable event processing.
 * 
 * Subscription Priorities:
 * - 10: Critical event logging (security.**, alert.*)
 * - 5:  Alert processing (alert.* → Drip dispatcher)
 * - 0:  General telemetry (role.*, guild.*)
 * 
 * @module bot/eventbus-subscriptions
 */

import { EventBus } from '../shared/event-bus.js';
import { getErrorMessage } from '../shared/utils/index.js';

const bus = EventBus.getInstance();

// Subscription IDs for cleanup during shutdown
const subscriptionIds = [];

/**
 * Initialize all EventBus subscriptions for security bot
 * 
 * Call this once during bot startup (ClientReady event) to register
 * all event handlers. Returns array of subscription IDs for cleanup.
 * 
 * @param {Function} logFn - Logging function (e.g., from main.js)
 * @returns {Array<string>} Subscription IDs for cleanup
 * 
 * @example
 * import { initializeEventBusSubscriptions } from './eventbus-subscriptions.js';
 * 
 * client.once(Events.ClientReady, async () => {
 *   const subscriptionIds = initializeEventBusSubscriptions(log);
 *   console.log(`EventBus subscriptions active: ${subscriptionIds.length}`);
 * });
 */
export function initializeEventBusSubscriptions(logFn) {
  // Use provided logger or no-op fallback
  const log = logFn || (() => {});
  
  // Clear any existing subscriptions (prevent duplicates on hot reload)
  subscriptionIds.forEach(id => {
    try {
      bus.unsubscribe(id);
    } catch {
      // Ignore unsubscribe errors during cleanup
    }
  });
  subscriptionIds.length = 0;
  
  // =========================================================================
  // PRIORITY 10: Security Events (Critical Path)
  // =========================================================================
  
  /**
   * Log all security operations
   * Pattern: security.**
   * Priority: 10 (highest)
   * Queue: 1000 events
   */
  const securitySubId = bus.subscribe('security.**', (event) => {
    const topicParts = event.topic.split('.');
    const operation = topicParts.slice(1).join('.'); // Remove 'security.' prefix
    
    // Determine log level based on operation
    let level = 'info';
    if (operation.includes('failed') || operation.includes('error')) {
      level = 'error';
    } else if (operation.includes('detected') || operation.includes('triggered')) {
      level = 'warn';
    }
    
    log(level, `[EventBus:Security] ${operation}`, {
      correlationId: event.correlationId,
      payload: event.payload,
      emitter: event.emitter,
    });
  }, {
    priority: 10,
    maxQueueSize: 1000,
  });
  subscriptionIds.push(securitySubId);
  
  // =========================================================================
  // PRIORITY 10: Alert Events (Critical Path)
  // =========================================================================
  
  /**
   * Log all alerts with severity-appropriate levels
   * Pattern: alert.*
   * Priority: 10 (highest)
   * Queue: 500 events (prevent alert flooding)
   */
  const alertSubId = bus.subscribe('alert.*', (event) => {
    const severity = event.topic.split('.')[1]; // critical, high, medium, low
    
    // Map severity to log level
    const logLevel = (severity === 'critical' || severity === 'high') ? 'error' : 'warn';
    
    log(logLevel, `[EventBus:Alert:${severity.toUpperCase()}] ${event.payload.message}`, {
      correlationId: event.correlationId,
      severity,
      data: event.payload.data,
      timestamp: event.payload.timestamp,
    });
  }, {
    priority: 10,
    maxQueueSize: 500, // Prevent alert flooding
  });
  subscriptionIds.push(alertSubId);
  
  // =========================================================================
  // PRIORITY 5: Drip Alert Status Events
  // =========================================================================
  
  /**
   * Log Drip alert delivery success/failure
   * Pattern: alert.drip.*
   * Priority: 5
   * Queue: 100 events
   */
  const dripStatusSubId = bus.subscribe('alert.drip.*', (event) => {
    const status = event.topic.split('.')[2]; // sent, failed
    const level = status === 'failed' ? 'error' : 'info';
    
    log(level, `[EventBus:Drip] Alert ${status}`, {
      correlationId: event.correlationId,
      severity: event.payload.severity,
      recipient: event.payload.recipient,
      error: event.payload.error,
    });
  }, {
    priority: 5,
    maxQueueSize: 100,
  });
  subscriptionIds.push(dripStatusSubId);
  
  // =========================================================================
  // PRIORITY 0: Role Change Telemetry
  // =========================================================================
  
  /**
   * Track role changes for audit trail
   * Pattern: role.changed
   * Priority: 0 (general telemetry)
   * Queue: 5000 events (handle mass role changes)
   */
  const roleChangedSubId = bus.subscribe('role.changed', (event) => {
    log('info', '[EventBus:Role] Permission change detected', {
      correlationId: event.correlationId,
      roleId: event.payload.roleId,
      roleName: event.payload.roleName,
      guildName: event.payload.guildName,
      permissionCount: event.payload.permissions?.length || 0,
    });
  }, {
    priority: 0,
    maxQueueSize: 5000, // Handle mass role changes (e.g., during guild setup)
  });
  subscriptionIds.push(roleChangedSubId);
  
  /**
   * Track role drift detection
   * Pattern: role.drift.detected
   * Priority: 5 (security relevant)
   * Queue: 1000 events
   */
  const roleDriftSubId = bus.subscribe('role.drift.detected', (event) => {
    log('warn', '[EventBus:Role] Permission drift detected', {
      correlationId: event.correlationId,
      roleId: event.payload.roleId,
      roleName: event.payload.roleName,
      guildName: event.payload.guildName,
    });
  }, {
    priority: 5,
    maxQueueSize: 1000,
  });
  subscriptionIds.push(roleDriftSubId);
  
  /**
   * Track role reverts (automated responses)
   * Pattern: role.reverted
   * Priority: 5 (security relevant)
   * Queue: 1000 events
   */
  const roleRevertedSubId = bus.subscribe('role.reverted', (event) => {
    log('success', '[EventBus:Role] Unauthorized change reverted', {
      correlationId: event.correlationId,
      roleId: event.payload.roleId,
      roleName: event.payload.roleName,
      guildName: event.payload.guildName,
    });
  }, {
    priority: 5,
    maxQueueSize: 1000,
  });
  subscriptionIds.push(roleRevertedSubId);
  
  // =========================================================================
  // PRIORITY 0: Guild Sweep Telemetry
  // =========================================================================
  
  /**
   * Track guild sweep lifecycle
   * Pattern: guild.sweep.*
   * Priority: 0 (general telemetry)
   * Queue: 100 events
   */
  const guildSweepSubId = bus.subscribe('guild.sweep.*', (event) => {
    const action = event.topic.split('.')[2]; // started, completed
    
    log('info', `[EventBus:Guild] Sweep ${action}`, {
      correlationId: event.correlationId,
      guildName: event.payload.guildName,
      rolesChecked: event.payload.rolesChecked,
      changesDetected: event.payload.changesDetected,
      duration: event.payload.duration,
    });
  }, {
    priority: 0,
    maxQueueSize: 100,
  });
  subscriptionIds.push(guildSweepSubId);
  
  // =========================================================================
  // Statistics Logging (Every 5 Minutes)
  // =========================================================================
  
  /**
   * Periodically log EventBus statistics for monitoring
   */
  const statsInterval = setInterval(() => {
    try {
      const stats = bus.getStats();
      log('info', '[EventBus] Statistics', {
        eventsEmitted: stats.eventsEmitted,
        subscriptionsActive: stats.subscriptionsActive,
        replayBufferSize: stats.replayBufferSize,
        totalHandlerInvocations: stats.totalHandlerInvocations,
        failedHandlerInvocations: stats.failedHandlerInvocations,
        averageHandlerLatency: `${stats.averageHandlerLatency.toFixed(2)}ms`,
        backpressureEvents: stats.backpressureEvents,
      });
    } catch (error) {
      log('error', '[EventBus] Failed to retrieve statistics', {
        error: getErrorMessage(error),
      });
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  // Store interval for cleanup
  subscriptionIds.push({ type: 'interval', id: statsInterval });
  
  log('success', '[EventBus] Subscriptions initialized', {
    subscriptions: subscriptionIds.filter(id => typeof id === 'string').length,
    patterns: [
      'security.**',
      'alert.*',
      'alert.drip.*',
      'role.changed',
      'role.drift.detected',
      'role.reverted',
      'guild.sweep.*',
    ],
  });
  
  return subscriptionIds;
}

/**
 * Cleanup all subscriptions (for graceful shutdown)
 * 
 * Call this during bot shutdown to unsubscribe all handlers
 * and clear intervals.
 * 
 * @example
 * process.on('SIGTERM', async () => {
 *   await cleanupEventBusSubscriptions();
 *   process.exit(0);
 * });
 */
export async function cleanupEventBusSubscriptions() {
  for (const item of subscriptionIds) {
    try {
      if (typeof item === 'string') {
        // Subscription ID
        bus.unsubscribe(item);
      } else if (item && item.type === 'interval') {
        // Interval timer
        clearInterval(item.id);
      }
    } catch {
      // Ignore cleanup errors (silent failure during shutdown)
    }
  }
  subscriptionIds.length = 0;
}

/**
 * Get current subscription status
 * 
 * Useful for debugging and monitoring.
 * 
 * @returns {Object} Subscription status
 */
export function getSubscriptionStatus() {
  const subscribers = bus.getSubscribers();
  
  return {
    totalSubscriptions: subscriptionIds.filter(id => typeof id === 'string').length,
    activeSubscriptions: subscribers.length,
    subscribers: subscribers.map(sub => ({
      pattern: sub.pattern,
      priority: sub.priority,
      queueSize: sub.queueSize,
      maxQueueSize: sub.maxQueueSize,
      droppedEvents: sub.droppedEvents,
      handlerName: sub.handlerName,
    })),
  };
}
