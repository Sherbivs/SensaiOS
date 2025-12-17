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

import { EventBus, type BusEvent } from "../shared/event-bus.js";
import { SecurityEventService } from "./security/services/security-event-service.js";
import { SecuritySeverity } from "./security/types/database-models.js";
import { prisma } from "../shared/prisma.js";
import { getErrorMessage } from "../shared/utils/index.js";

// ============================================================================
// Types
// ============================================================================

export type LogFunction = (level: string, message: string, data?: Record<string, unknown>) => void;

export interface SecurityDbSubscriberStats {
  subscriptions: number;
  serviceInitialized: boolean;
}

interface SecurityEventPayload {
  guildId?: string;
  guildName?: string;
  memberId?: string;
  memberTag?: string;
  roleId?: string;
  roleName?: string;
  executorId?: string;
  executorTag?: string;
  source?: string;
  origin?: string;
  timestamp?: string;
  message?: string;
  data?: unknown;
  permissions?: unknown;
  [key: string]: unknown;
}

// ============================================================================
// Module State
// ============================================================================

const bus = EventBus.getInstance();

// Track subscription IDs for cleanup
const dbSubscriptionIds: string[] = [];

// SecurityEventService instance
let securityEventService: SecurityEventService | null = null;

// ============================================================================
// Topic/Severity Mapping
// ============================================================================

/**
 * Map EventBus topics to SecurityEvent eventTypes
 */
const TOPIC_TO_EVENT_TYPE: Record<string, string> = {
  "security.baseline.generated": "baseline-generated",
  "security.baseline.refresh": "baseline-refresh",
  "security.threat.detected": "threat-detected",
  "security.sweep.completed": "sweep",
  "security.startup": "startup",
  "security.shutdown": "shutdown",
  "role.changed": "role-change",
  "role.drift.detected": "permission-drift",
  "role.reverted": "role-reverted",
  "alert.critical": "alert-critical",
  "alert.high": "alert-high",
  "alert.medium": "alert-medium",
  "alert.low": "alert-low",
};

/**
 * Map severity strings to SecuritySeverity enum
 */
const SEVERITY_MAP: Record<string, SecuritySeverity> = {
  critical: SecuritySeverity.CRITICAL,
  high: SecuritySeverity.HIGH,
  medium: SecuritySeverity.MEDIUM,
  low: SecuritySeverity.LOW,
  info: SecuritySeverity.INFO,
};

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Determine severity from EventBus topic
 */
function getSeverityFromTopic(topic: string): SecuritySeverity {
  if (topic.includes("critical")) return SecuritySeverity.CRITICAL;
  if (topic.includes("high") || topic.includes("threat") || topic.includes("drift")) return SecuritySeverity.HIGH;
  if (topic.includes("alert") || topic.includes("detected")) return SecuritySeverity.MEDIUM;
  if (topic.includes("warning")) return SecuritySeverity.LOW;
  return SecuritySeverity.INFO;
}

/**
 * Determine origin from event source
 */
function getOrigin(event: BusEvent): string {
  if (event.emitter === "security-bot") return "security-bot-sweep";
  const payload = event.payload as SecurityEventPayload | undefined;
  if (payload?.source === "admin-manual") return "admin-manual";
  if (payload?.origin) return payload.origin;
  return "eventbus";
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the security database subscriber.
 *
 * @param logFn - Logger function (level, message, data)
 * @returns Array of subscription IDs
 */
export function initializeSecurityDbSubscriber(logFn?: LogFunction): string[] {
  const log: LogFunction = logFn || (() => {});

  // Clean up existing subscriptions
  cleanupSecurityDbSubscriber();

  // Initialize SecurityEventService
  try {
    securityEventService = new SecurityEventService(prisma as any);
    log("info", "[SecurityDbSubscriber] SecurityEventService initialized");
  } catch (error) {
    log("error", "[SecurityDbSubscriber] Failed to initialize SecurityEventService", {
      error: getErrorMessage(error),
    });
    return [];
  }

  // =========================================================================
  // DATABASE PERSISTENCE SUBSCRIBER (Priority 15 - after logging)
  // =========================================================================

  // Subscribe to all security events
  const securityDbSubId = bus.subscribe(
    "security.**",
    async (event: BusEvent) => {
      try {
        const eventType = TOPIC_TO_EVENT_TYPE[event.topic] || event.topic.split(".").slice(1).join("-");
        const severity = getSeverityFromTopic(event.topic);
        const origin = getOrigin(event);
        const payload = event.payload as SecurityEventPayload | undefined;

        // Extract guild information from payload
        const guildId = payload?.guildId || "unknown";
        const guildName = payload?.guildName || "Unknown Guild";

        // Record to database
        await securityEventService!.recordEvent({
          eventType,
          severity,
          guildId,
          guildName,
          memberId: payload?.memberId,
          memberTag: payload?.memberTag,
          roleId: payload?.roleId,
          roleName: payload?.roleName,
          executorId: payload?.executorId,
          executorTag: payload?.executorTag,
          origin,
          metadata: {
            correlationId: event.correlationId,
            parentCorrelationId: event.parentCorrelationId,
            emitter: event.emitter,
            timestamp: payload?.timestamp,
            ...payload,
          },
        });

        log("info", `[SecurityDbSubscriber] Persisted: ${eventType}`, {
          correlationId: event.correlationId,
          guildId,
          severity,
        });
      } catch (error) {
        log("error", "[SecurityDbSubscriber] Failed to persist security event", {
          topic: event.topic,
          correlationId: event.correlationId,
          error: getErrorMessage(error),
        });
      }
    },
    {
      priority: 15, // Higher than logging subscribers (10)
      maxQueueSize: 2000,
    },
  );
  dbSubscriptionIds.push(securityDbSubId);

  // Subscribe to alert events
  const alertDbSubId = bus.subscribe(
    "alert.*",
    async (event: BusEvent) => {
      try {
        const severity = event.topic.split(".")[1];
        const eventType = `alert-${severity}`;
        const severityEnum = SEVERITY_MAP[severity] || SecuritySeverity.MEDIUM;
        const payload = event.payload as SecurityEventPayload | undefined;

        // Record to database
        await securityEventService!.recordEvent({
          eventType,
          severity: severityEnum,
          guildId: payload?.guildId || "unknown",
          guildName: payload?.guildName || "System Alert",
          memberId: payload?.memberId,
          memberTag: payload?.memberTag,
          origin: getOrigin(event),
          metadata: {
            correlationId: event.correlationId,
            message: payload?.message,
            data: payload?.data,
            timestamp: payload?.timestamp,
          },
        });

        log("info", `[SecurityDbSubscriber] Persisted alert: ${severity}`, {
          correlationId: event.correlationId,
          message: typeof payload?.message === "string" ? payload.message.substring(0, 50) : undefined,
        });
      } catch (error) {
        log("error", "[SecurityDbSubscriber] Failed to persist alert event", {
          topic: event.topic,
          correlationId: event.correlationId,
          error: getErrorMessage(error),
        });
      }
    },
    {
      priority: 15,
      maxQueueSize: 500,
    },
  );
  dbSubscriptionIds.push(alertDbSubId);

  // Subscribe to role events
  const roleDbSubId = bus.subscribe(
    "role.*",
    async (event: BusEvent) => {
      try {
        const action = event.topic.split(".").slice(1).join("-");
        const eventType = `role-${action}`;
        const severity = getSeverityFromTopic(event.topic);
        const payload = event.payload as SecurityEventPayload | undefined;

        // Record to database
        await securityEventService!.recordEvent({
          eventType,
          severity,
          guildId: payload?.guildId || "unknown",
          guildName: payload?.guildName || "Unknown Guild",
          roleId: payload?.roleId,
          roleName: payload?.roleName,
          executorId: payload?.executorId,
          executorTag: payload?.executorTag,
          origin: getOrigin(event),
          metadata: {
            correlationId: event.correlationId,
            permissions: payload?.permissions,
            timestamp: payload?.timestamp,
          },
        });

        log("info", `[SecurityDbSubscriber] Persisted role event: ${action}`, {
          correlationId: event.correlationId,
          roleId: payload?.roleId,
          guildId: payload?.guildId,
        });
      } catch (error) {
        log("error", "[SecurityDbSubscriber] Failed to persist role event", {
          topic: event.topic,
          correlationId: event.correlationId,
          error: getErrorMessage(error),
        });
      }
    },
    {
      priority: 15,
      maxQueueSize: 5000,
    },
  );
  dbSubscriptionIds.push(roleDbSubId);

  log("success", "[SecurityDbSubscriber] Initialized", {
    subscriptions: dbSubscriptionIds.length,
    topics: ["security.**", "alert.*", "role.*"],
  });

  return dbSubscriptionIds;
}

/**
 * Clean up database subscriber subscriptions.
 */
export function cleanupSecurityDbSubscriber(): void {
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
export function getSecurityDbSubscriberStats(): SecurityDbSubscriberStats {
  return {
    subscriptions: dbSubscriptionIds.length,
    serviceInitialized: securityEventService !== null,
  };
}
