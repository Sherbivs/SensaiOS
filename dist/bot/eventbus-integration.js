/**
 * Unified EventBus Integration for Security Bot
 * 
 * Centralizes all EventBus adapter functions (emit) and subscription handlers
 * in a single module. Provides non-breaking integration with existing security
 * bot code via correlation tracking, priority routing, and backpressure limits.
 * 
 * Usage:
 *   import { initializeEventBus, emitSecurityEvent, emitAlert } from './eventbus-integration.js';
 *   
 *   // During bot startup (ClientReady)
 *   initializeEventBus(log);
 *   
 *   // Throughout codebase
 *   emitSecurityEvent('baseline.generated', { guildId, roleCount });
 *   emitAlert('critical', 'Unauthorized permission change detected', { roleId, guildId });
 * 
 * @module bot/eventbus-integration
 */

import { EventBus } from '../shared/event-bus.js';
import { getErrorMessage } from '../shared/utils/index.js';

const bus = EventBus.getInstance();

// Track subscriptions for cleanup
const subscriptionIds = [];
let statsInterval = null;

// ============================================================================
// ADAPTER FUNCTIONS (Emit Events)
// ============================================================================

/**
 * Emit security-related events
 * 
 * @param {string} topic - Event topic (e.g., 'baseline.generated', 'threat.detected')
 * @param {Object} payload - Event data
 * @param {Object} [options] - EventBus options (correlationId, priority, etc.)
 * @returns {Object} Event metadata (correlationId, timestamp)
 * 
 * @example
 * emitSecurityEvent('baseline.generated', {
 *   guildId: guild.id,
 *   guildName: guild.name,
 *   roleCount: roles.size,
 * });
 */
export function emitSecurityEvent(topic, payload, options = {}) {
  return bus.emit(`security.${topic}`, {
    ...payload,
    timestamp: new Date().toISOString(),
    source: 'security-bot',
  }, {
    emitter: 'security-bot',
    ...options,
  });
}

/**
 * Emit role management events
 * 
 * @param {string} topic - Event topic (e.g., 'changed', 'drift.detected', 'reverted')
 * @param {Object} roleData - Role information (id, name, guildId, guildName, permissions)
 * @param {Object} [options] - EventBus options
 * @returns {Object} Event metadata
 * 
 * @example
 * emitRoleEvent('changed', {
 *   roleId: role.id,
 *   roleName: role.name,
 *   guildId: guild.id,
 *   guildName: guild.name,
 *   permissions: role.permissions.toArray(),
 * });
 */
export function emitRoleEvent(topic, roleData, options = {}) {
  return bus.emit(`role.${topic}`, {
    ...roleData,
    timestamp: new Date().toISOString(),
  }, {
    emitter: 'security-bot',
    ...options,
  });
}

/**
 * Emit guild operation events
 * 
 * @param {string} topic - Event topic (e.g., 'sweep.started', 'member.fetched')
 * @param {Object} guildData - Guild information (id, name, memberCount)
 * @param {Object} [additionalData] - Additional event data
 * @param {Object} [options] - EventBus options
 * @returns {Object} Event metadata
 * 
 * @example
 * emitGuildEvent('sweep.completed', {
 *   guildId: guild.id,
 *   guildName: guild.name,
 * }, {
 *   rolesChecked: 150,
 *   changesDetected: 3,
 *   duration: '2.5s',
 * });
 */
export function emitGuildEvent(topic, guildData, additionalData = {}, options = {}) {
  return bus.emit(`guild.${topic}`, {
    ...guildData,
    ...additionalData,
    timestamp: new Date().toISOString(),
  }, {
    emitter: 'security-bot',
    ...options,
  });
}

/**
 * Emit alert events (centralized alert emission)
 * 
 * Replaces 4 TODO stubs for Drip alert integration. All alerts
 * flow through this function for centralized routing to Drip DM
 * in Phase 2 (alert-dispatcher.js).
 * 
 * @param {string} severity - Alert severity (critical, high, medium, low)
 * @param {string} message - Alert message
 * @param {Object} [data] - Additional alert data
 * @param {Object} [options] - EventBus options
 * @returns {Object} Event metadata
 * 
 * @example
 * emitAlert('critical', 'Unauthorized permission change detected', {
 *   roleId: role.id,
 *   roleName: role.name,
 *   guildId: guild.id,
 *   permissions: ['ADMINISTRATOR'],
 * });
 */
export function emitAlert(severity, message, data = {}, options = {}) {
  return bus.emit(`alert.${severity}`, {
    message,
    data,
    timestamp: new Date().toISOString(),
  }, {
    emitter: 'security-bot',
    priority: (severity === 'critical' || severity === 'high') ? 'high' : 'normal',
    ...options,
  });
}

/**
 * Get EventBus statistics (for monitoring)
 * 
 * @returns {Object} EventBus stats (eventsEmitted, subscriptions, latency, etc.)
 */
export function getEventBusStats() {
  return bus.getStats();
}

/**
 * Replay events matching pattern since timestamp
 * 
 * @param {string} pattern - Event pattern (e.g., 'security.**', 'alert.critical')
 * @param {Date|string} since - Replay events after this timestamp
 * @returns {Array<Object>} Matching events from replay buffer
 */
export function replayEvents(pattern, since) {
  return bus.replay(pattern, since);
}

/**
 * Get active subscriber information
 * 
 * @returns {Array<Object>} Active subscribers with queue stats
 */
export function getActiveSubscribers() {
  return bus.getSubscribers();
}

// ============================================================================
// SUBSCRIPTION HANDLERS (Process Events)
// ============================================================================

/**
 * Initialize all EventBus subscriptions
 * 
 * Registers event handlers for logging, monitoring, and processing
 * security-related events. Call once during bot startup (ClientReady).
 * 
 * @param {Function} logFn - Logging function from main.js
 * @returns {Array<string>} Subscription IDs for cleanup
 * 
 * @example
 * client.once(Events.ClientReady, async () => {
 *   const subs = initializeEventBus(log);
 *   console.log(`EventBus subscriptions active: ${subs.length}`);
 * });
 */
export function initializeEventBus(logFn) {
  // Use provided logger or no-op fallback
  const log = logFn || (() => {});
  
  // Clear existing subscriptions (prevent duplicates on hot reload)
  cleanupEventBus();
  
  // =========================================================================
  // PRIORITY 10: Security Events (Critical Path)
  // =========================================================================
  
  const securitySubId = bus.subscribe('security.**', (event) => {
    const operation = event.topic.split('.').slice(1).join('.'); // Remove 'security.' prefix
    
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
  
  const alertSubId = bus.subscribe('alert.*', (event) => {
    const severity = event.topic.split('.')[1];
    const logLevel = (severity === 'critical' || severity === 'high') ? 'error' : 'warn';
    
    log(logLevel, `[EventBus:Alert:${severity.toUpperCase()}] ${event.payload.message}`, {
      correlationId: event.correlationId,
      severity,
      data: event.payload.data,
      timestamp: event.payload.timestamp,
    });
  }, {
    priority: 10,
    maxQueueSize: 500,
  });
  subscriptionIds.push(alertSubId);
  
  // =========================================================================
  // PRIORITY 5: Drip Alert Status
  // =========================================================================
  
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
  // PRIORITY 0-5: Role Events
  // =========================================================================
  
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
    maxQueueSize: 5000,
  });
  subscriptionIds.push(roleChangedSubId);
  
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
  
  statsInterval = setInterval(() => {
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
  }, 5 * 60 * 1000);
  
  log('success', '[EventBus] Subscriptions initialized', {
    subscriptions: subscriptionIds.length,
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
 * Cleanup all subscriptions (graceful shutdown)
 * 
 * Call during bot shutdown to unsubscribe all handlers
 * and clear intervals.
 */
export function cleanupEventBus() {
  for (const id of subscriptionIds) {
    try {
      bus.unsubscribe(id);
    } catch {
      // Ignore cleanup errors
    }
  }
  subscriptionIds.length = 0;
  
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

/**
 * Get current subscription status (for monitoring)
 * 
 * @returns {Object} Subscription status with queue stats
 */
export function getSubscriptionStatus() {
  const subscribers = bus.getSubscribers();
  
  return {
    totalSubscriptions: subscriptionIds.length,
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
