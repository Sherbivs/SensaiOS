/**
 * Security Database Subscriber
 * ============================
 *
 * EventBus subscriber that persists security events to the database.
 * Part of Sprint 5.0 critical gap remediation — wires EventBus events
 * to SecurityEventService for database persistence.
 *
 * @module bot/security-db-subscriber
 * @created Sprint 5.0 (2025-12-06)
 *
 * **Purpose:**
 * - Subscribe to security.** events
 * - Persist events to database via SecurityEventService
 * - Enable forensics, audit trails, and pattern detection
 *
 * **Architecture:**
 * ```
 * EventBus (security.**)
 *       │
 *       ▼
 * SecurityDbSubscriber (this)
 *       │
 *       ▼
 * SecurityEventService.recordEvent()
 *       │
 *       ▼
 * security_events table (with HMAC integrity)
 * ```
 */

import { EventBus } from '../shared/event-bus.js';
import { SecurityEventService } from './security/services/security-event-service.js';
import { SecuritySeverity } from './security/types/database-models.js';
import { prisma } from '../shared/prisma.js';
import { getErrorMessage } from '../shared/utils/index.js';

const bus = EventBus.getInstance();

// Track subscription IDs for cleanup
const dbSubscriptionIds = [];

// SecurityEventService instance
let securityEventService = null;

/**
 * Map EventBus topics to SecurityEvent eventTypes
 */
const TOPIC_TO_EVENT_TYPE = {
  'security.baseline.generated': 'baseline-generated',
  'security.baseline.refresh': 'baseline-refresh',
  'security.threat.detected': 'threat-detected',
  'security.sweep.completed': 'sweep',
  'security.startup': 'startup',
  'security.shutdown': 'shutdown',
  'role.changed': 'role-change',
  'role.drift.detected': 'permission-drift',
  'role.reverted': 'role-reverted',
  'alert.critical': 'alert-critical',
  'alert.high': 'alert-high',
  'alert.medium': 'alert-medium',
  'alert.low': 'alert-low',
};

/**
 * Map severity strings to SecuritySeverity enum
 */
const SEVERITY_MAP = {
  'critical': SecuritySeverity.CRITICAL,
  'high': SecuritySeverity.HIGH,
  'medium': SecuritySeverity.MEDIUM,
  'low': SecuritySeverity.LOW,
  'info': SecuritySeverity.INFO,
};

/**
 * Determine severity from EventBus topic
 */
function getSeverityFromTopic(topic) {
  if (topic.includes('critical')) return SecuritySeverity.CRITICAL;
  if (topic.includes('high') || topic.includes('threat') || topic.includes('drift')) return SecuritySeverity.HIGH;
  if (topic.includes('alert') || topic.includes('detected')) return SecuritySeverity.MEDIUM;
  if (topic.includes('warning')) return SecuritySeverity.LOW;
  return SecuritySeverity.INFO;
}

/**
 * Determine origin from event source
 */
function getOrigin(event) {
  if (event.emitter === 'security-bot') return 'security-bot-sweep';
  if (event.payload?.source === 'admin-manual') return 'admin-manual';
  if (event.payload?.origin) return event.payload.origin;
  return 'eventbus';
}

/**
 * Initialize the security database subscriber.
 *
 * @param {Function} logFn - Logger function (level, message, data)
 * @returns {string[]} Array of subscription IDs
 */
export function initializeSecurityDbSubscriber(logFn) {
  const log = logFn || (() => {});

  // Clean up existing subscriptions
  cleanupSecurityDbSubscriber();

  // Initialize SecurityEventService
  try {
    securityEventService = new SecurityEventService(prisma);
    log('info', '[SecurityDbSubscriber] SecurityEventService initialized');
  } catch (error) {
    log('error', '[SecurityDbSubscriber] Failed to initialize SecurityEventService', {
      error: getErrorMessage(error),
    });
    return [];
  }

  // =========================================================================
  // DATABASE PERSISTENCE SUBSCRIBER (Priority 15 - after logging)
  // =========================================================================

  // Subscribe to all security events
  const securityDbSubId = bus.subscribe('security.**', async (event) => {
    try {
      const eventType = TOPIC_TO_EVENT_TYPE[event.topic] || event.topic.split('.').slice(1).join('-');
      const severity = getSeverityFromTopic(event.topic);
      const origin = getOrigin(event);

      // Extract guild information from payload
      const guildId = event.payload?.guildId || 'unknown';
      const guildName = event.payload?.guildName || 'Unknown Guild';

      // Record to database
      await securityEventService.recordEvent({
        eventType,
        severity,
        guildId,
        guildName,
        memberId: event.payload?.memberId,
        memberTag: event.payload?.memberTag,
        roleId: event.payload?.roleId,
        roleName: event.payload?.roleName,
        executorId: event.payload?.executorId,
        executorTag: event.payload?.executorTag,
        origin,
        metadata: {
          correlationId: event.correlationId,
          parentCorrelationId: event.parentCorrelationId,
          emitter: event.emitter,
          timestamp: event.payload?.timestamp,
          ...event.payload,
        },
      });

      log('info', `[SecurityDbSubscriber] Persisted: ${eventType}`, {
        correlationId: event.correlationId,
        guildId,
        severity,
      });
    } catch (error) {
      log('error', '[SecurityDbSubscriber] Failed to persist security event', {
        topic: event.topic,
        correlationId: event.correlationId,
        error: getErrorMessage(error),
      });
    }
  }, {
    priority: 15, // Higher than logging subscribers (10)
    maxQueueSize: 2000,
  });
  dbSubscriptionIds.push(securityDbSubId);

  // Subscribe to alert events
  const alertDbSubId = bus.subscribe('alert.*', async (event) => {
    try {
      const severity = event.topic.split('.')[1];
      const eventType = `alert-${severity}`;
      const severityEnum = SEVERITY_MAP[severity] || SecuritySeverity.MEDIUM;

      // Record to database
      await securityEventService.recordEvent({
        eventType,
        severity: severityEnum,
        guildId: event.payload?.guildId || 'unknown',
        guildName: event.payload?.guildName || 'System Alert',
        memberId: event.payload?.memberId,
        memberTag: event.payload?.memberTag,
        origin: getOrigin(event),
        metadata: {
          correlationId: event.correlationId,
          message: event.payload?.message,
          data: event.payload?.data,
          timestamp: event.payload?.timestamp,
        },
      });

      log('info', `[SecurityDbSubscriber] Persisted alert: ${severity}`, {
        correlationId: event.correlationId,
        message: event.payload?.message?.substring(0, 50),
      });
    } catch (error) {
      log('error', '[SecurityDbSubscriber] Failed to persist alert event', {
        topic: event.topic,
        correlationId: event.correlationId,
        error: getErrorMessage(error),
      });
    }
  }, {
    priority: 15,
    maxQueueSize: 500,
  });
  dbSubscriptionIds.push(alertDbSubId);

  // Subscribe to role events
  const roleDbSubId = bus.subscribe('role.*', async (event) => {
    try {
      const action = event.topic.split('.').slice(1).join('-');
      const eventType = `role-${action}`;
      const severity = getSeverityFromTopic(event.topic);

      // Record to database
      await securityEventService.recordEvent({
        eventType,
        severity,
        guildId: event.payload?.guildId || 'unknown',
        guildName: event.payload?.guildName || 'Unknown Guild',
        roleId: event.payload?.roleId,
        roleName: event.payload?.roleName,
        executorId: event.payload?.executorId,
        executorTag: event.payload?.executorTag,
        origin: getOrigin(event),
        metadata: {
          correlationId: event.correlationId,
          permissions: event.payload?.permissions,
          timestamp: event.payload?.timestamp,
        },
      });

      log('info', `[SecurityDbSubscriber] Persisted role event: ${action}`, {
        correlationId: event.correlationId,
        roleId: event.payload?.roleId,
        guildId: event.payload?.guildId,
      });
    } catch (error) {
      log('error', '[SecurityDbSubscriber] Failed to persist role event', {
        topic: event.topic,
        correlationId: event.correlationId,
        error: getErrorMessage(error),
      });
    }
  }, {
    priority: 15,
    maxQueueSize: 5000,
  });
  dbSubscriptionIds.push(roleDbSubId);

  log('success', '[SecurityDbSubscriber] Initialized', {
    subscriptions: dbSubscriptionIds.length,
    topics: ['security.**', 'alert.*', 'role.*'],
  });

  return dbSubscriptionIds;
}

/**
 * Clean up database subscriber subscriptions.
 */
export function cleanupSecurityDbSubscriber() {
  for (const subId of dbSubscriptionIds) {
    try {
      bus.unsubscribe(subId);
    } catch {
      // Ignore cleanup errors
    }
  }
  dbSubscriptionIds.length = 0;
  securityEventService = null;
}

/**
 * Get statistics about the database subscriber.
 */
export function getSecurityDbSubscriberStats() {
  return {
    subscriptions: dbSubscriptionIds.length,
    serviceInitialized: securityEventService !== null,
  };
}
