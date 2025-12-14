/**
 * EventBus Adapter for Security Bot
 * 
 * Provides convenience functions for emitting security-related events
 * to the centralized EventBus. All events include automatic correlation
 * tracking and structured payloads.
 * 
 * Event Topics:
 * - security.* : Baselines, threats, integrity, responses
 * - role.*     : Changes, creation, deletion, drift, reverts
 * - guild.*    : Sweeps, member fetches, joins/leaves
 * - alert.*    : Critical, high, medium, low + Drip routing
 * 
 * Usage:
 *   import { emitSecurityEvent, emitRoleEvent, emitAlert } from './eventbus-adapter.js';
 *   
 *   const correlationId = emitSecurityEvent('baseline.generated', {
 *     confidence: 0.95,
 *     dataPoints: 150
 *   });
 * 
 * @module bot/eventbus-adapter
 */

import { EventBus } from '../shared/event-bus.js';

const bus = EventBus.getInstance();
const EMITTER_NAME = 'security-bot';

/**
 * Emit security operation event
 * 
 * Topics: baseline.generated, baseline.failed, threat.detected, threat.resolved,
 *         integrity.check, integrity.passed, integrity.failed, response.triggered,
 *         response.completed
 * 
 * @param {string} topic - Event topic (without 'security.' prefix)
 * @param {Object} payload - Event-specific data
 * @param {Object} [options] - Emission options
 * @param {string} [options.parentCorrelationId] - Chain to parent event
 * @param {'high'|'normal'|'low'} [options.priority] - Event priority
 * @returns {string} Correlation ID for tracing
 * 
 * @example
 * emitSecurityEvent('baseline.generated', {
 *   confidence: 0.95,
 *   dataPoints: 150,
 *   peakActivityHours: [14, 15, 16]
 * });
 */
export function emitSecurityEvent(topic, payload, options = {}) {
  return bus.emit(`security.${topic}`, {
    ...payload,
    timestamp: new Date().toISOString(),
    source: EMITTER_NAME,
  }, {
    emitter: EMITTER_NAME,
    ...options,
  });
}

/**
 * Emit role management event
 * 
 * Topics: changed, created, deleted, drift.detected, reverted
 * 
 * @param {string} topic - Event topic (without 'role.' prefix)
 * @param {Object} roleData - Discord.js Role object or role info
 * @param {string} roleData.id - Role ID
 * @param {string} roleData.name - Role name
 * @param {Object} roleData.guild - Guild object
 * @param {string} roleData.guild.id - Guild ID
 * @param {string} roleData.guild.name - Guild name
 * @param {Object} roleData.permissions - Permissions object
 * @param {Object} [options] - Emission options
 * @param {string} [options.parentCorrelationId] - Chain to parent event
 * @returns {string} Correlation ID for tracing
 * 
 * @example
 * emitRoleEvent('changed', {
 *   id: role.id,
 *   name: role.name,
 *   guild: { id: guild.id, name: guild.name },
 *   permissions: role.permissions
 * });
 */
export function emitRoleEvent(topic, roleData, options = {}) {
  return bus.emit(`role.${topic}`, {
    roleId: roleData.id,
    roleName: roleData.name,
    guildId: roleData.guild.id,
    guildName: roleData.guild.name,
    permissions: roleData.permissions.toArray ? roleData.permissions.toArray() : roleData.permissions,
    timestamp: new Date().toISOString(),
  }, {
    emitter: EMITTER_NAME,
    ...options,
  });
}

/**
 * Emit guild operation event
 * 
 * Topics: sweep.started, sweep.completed, member.fetched, joined, left
 * 
 * @param {string} topic - Event topic (without 'guild.' prefix)
 * @param {Object} guildData - Discord.js Guild object or guild info
 * @param {string} guildData.id - Guild ID
 * @param {string} guildData.name - Guild name
 * @param {Object} [additionalData] - Additional event-specific data
 * @param {Object} [options] - Emission options
 * @param {string} [options.parentCorrelationId] - Chain to parent event
 * @returns {string} Correlation ID for tracing
 * 
 * @example
 * const correlationId = emitGuildEvent('sweep.started', guild, {
 *   rolesChecked: 25,
 *   membersScanned: 150
 * });
 */
export function emitGuildEvent(topic, guildData, additionalData = {}, options = {}) {
  return bus.emit(`guild.${topic}`, {
    guildId: guildData.id,
    guildName: guildData.name,
    ...additionalData,
    timestamp: new Date().toISOString(),
  }, {
    emitter: EMITTER_NAME,
    ...options,
  });
}

/**
 * Emit alert event (replaces Drip alert TODOs)
 * 
 * This is the centralized alert emission point. All alerts should flow through
 * this function for consistent formatting and routing.
 * 
 * Severity levels:
 * - critical: Immediate action required (PagerDuty oncall)
 * - high: Requires attention within hours (Slack team)
 * - medium: Review during business hours (Slack team)
 * - low: Informational (Slack team)
 * 
 * @param {'critical'|'high'|'medium'|'low'} severity - Alert severity
 * @param {string} message - Human-readable alert message
 * @param {Object} [data] - Additional context data
 * @param {Object} [options] - Emission options
 * @param {string} [options.parentCorrelationId] - Chain to parent event
 * @returns {string} Correlation ID for tracing
 * 
 * @example
 * // Replace TODO: Send Drip critical alert
 * emitAlert('critical', 'Unauthorized permission escalation detected', {
 *   roleId: role.id,
 *   roleName: role.name,
 *   guildName: guild.name,
 *   oldPermissions: ['ViewChannel'],
 *   newPermissions: ['Administrator']
 * });
 */
export function emitAlert(severity, message, data = {}, options = {}) {
  // Validate severity
  const validSeverities = ['critical', 'high', 'medium', 'low'];
  if (!validSeverities.includes(severity)) {
    throw new Error(`Invalid alert severity: ${severity}. Must be one of: ${validSeverities.join(', ')}`);
  }
  
  return bus.emit(`alert.${severity}`, {
    message,
    data,
    timestamp: new Date().toISOString(),
  }, {
    emitter: EMITTER_NAME,
    // Critical/high alerts get priority routing
    priority: (severity === 'critical' || severity === 'high') ? 'high' : 'normal',
    ...options,
  });
}

/**
 * Get EventBus statistics
 * 
 * Useful for monitoring and debugging. Can be exposed via /ops command.
 * 
 * @returns {Object} EventBus statistics
 * @returns {number} eventsEmitted - Total events emitted
 * @returns {number} subscriptionsActive - Active subscriptions
 * @returns {number} replayBufferSize - Events in replay buffer
 * @returns {number} totalHandlerInvocations - Total handler calls
 * @returns {number} failedHandlerInvocations - Failed handler calls
 * @returns {number} averageHandlerLatency - Average latency in ms
 * @returns {number} backpressureEvents - Events dropped due to backpressure
 * 
 * @example
 * const stats = getEventBusStats();
 * console.log(`EventBus: ${stats.eventsEmitted} events, ${stats.subscriptionsActive} subscriptions`);
 */
export function getEventBusStats() {
  return bus.getStats();
}

/**
 * Replay events matching pattern
 * 
 * Useful for debugging and post-mortem analysis. Can retrieve all events
 * related to a specific correlation ID or topic pattern.
 * 
 * @param {string} pattern - Topic pattern (supports wildcards)
 * @param {Date} [since] - Only return events after this time
 * @returns {Array<Object>} Matching events
 * 
 * @example
 * // Get all security events from last 5 minutes
 * const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
 * const events = replayEvents('security.**', fiveMinutesAgo);
 * 
 * // Get all events for specific correlation ID
 * const relatedEvents = replayEvents('**').filter(e => 
 *   e.correlationId.startsWith(targetCorrelationId)
 * );
 */
export function replayEvents(pattern, since) {
  return bus.replay(pattern, since);
}

/**
 * Get all active subscribers
 * 
 * Useful for debugging subscription issues.
 * 
 * @returns {Array<Object>} Subscriber information
 * 
 * @example
 * const subscribers = getActiveSubscribers();
 * console.log(`Active subscribers: ${subscribers.length}`);
 * subscribers.forEach(sub => {
 *   console.log(`  ${sub.pattern} (queue: ${sub.queueSize}/${sub.maxQueueSize})`);
 * });
 */
export function getActiveSubscribers() {
  return bus.getSubscribers();
}
