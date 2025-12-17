/**
 * Centralized Alert Dispatcher
 *
 * Bridges EventBus alert events with the Drip alert system. Subscribes to
 * alert.* events and routes them to dripAlertManager for DM delivery.
 * Emits alert.drip.sent/failed events for delivery tracking.
 *
 * This module centralizes all Drip alert logic, eliminating the need for
 * scattered TODO comments and manual dripAlertManager.recordAlert() calls.
 *
 * Usage:
 *   import { initializeAlertDispatcher } from './alert-dispatcher.js';
 *
 *   // During bot startup (after EventBus + dripAlertManager initialization)
 *   initializeAlertDispatcher(dripAlertManager, log);
 *
 *   // Throughout codebase (via EventBus integration)
 *   emitAlert('critical', 'Unauthorized permission change', { roleId, guildId });
 *
 * @module bot/alert-dispatcher
 */

import { EventBus, type BusEvent } from "../shared/event-bus.js";
import { DRIP_ALERT_SEVERITY } from "./dripAlerts.js";
import { getErrorMessage } from "../shared/utils/index.js";

// ============================================================================
// Types
// ============================================================================

export type AlertSeverity = "critical" | "high" | "medium" | "low";

export type DripSeverity = string;

export interface AlertPayload {
  message: string;
  data: {
    recipient?: string;
    [key: string]: unknown;
  };
}

export interface DripAlertManager {
  recordAlert: (severity: DripSeverity, message: string, data: Record<string, unknown>) => Promise<boolean>;
}

export type LogFunction = (level: string, message: string, data?: Record<string, unknown>) => void;

export interface AlertDispatcherStatus {
  initialized: boolean;
  subscriptionId: string | null;
  dripManagerAvailable: boolean;
}

// ============================================================================
// Module State
// ============================================================================

const bus = EventBus.getInstance();

// Track subscription for cleanup
let alertSubscriptionId: string | null = null;
let dripManagerRef: DripAlertManager | null = null;
let logFn: LogFunction | null = null;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Map EventBus severity levels to Drip alert severity constants
 */
function mapSeverityToDrip(eventSeverity: string): DripSeverity {
  const severityMap: Record<string, DripSeverity> = {
    critical: DRIP_ALERT_SEVERITY.critical,
    high: DRIP_ALERT_SEVERITY.security,
    medium: DRIP_ALERT_SEVERITY.warning,
    low: DRIP_ALERT_SEVERITY.notice,
  };

  return severityMap[eventSeverity] || DRIP_ALERT_SEVERITY.notice;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize alert dispatcher
 *
 * Subscribes to alert.* events and routes them to dripAlertManager.
 * Call once during bot startup after EventBus and dripAlertManager
 * are initialized.
 *
 * @param dripAlertManager - Initialized Drip alert manager
 * @param log - Logging function
 * @returns Subscription ID for cleanup
 *
 * @example
 * // In main.js ClientReady handler:
 * dripAlertManager = createDripAlertManager({ ... });
 * initializeEventBus(log);
 * initializeAlertDispatcher(dripAlertManager, log);
 */
export function initializeAlertDispatcher(dripAlertManager: DripAlertManager, log: LogFunction): string {
  if (!dripAlertManager) {
    throw new Error("[AlertDispatcher] dripAlertManager is required");
  }

  if (!log) {
    throw new Error("[AlertDispatcher] log function is required");
  }

  // Store references
  dripManagerRef = dripAlertManager;
  logFn = log;

  // Cleanup existing subscription if any
  if (alertSubscriptionId) {
    try {
      bus.unsubscribe(alertSubscriptionId);
    } catch {
      // Ignore unsubscribe errors
    }
  }

  // Subscribe to all alert events
  alertSubscriptionId = bus.subscribe(
    "alert.*",
    async (event: BusEvent) => {
      // Skip drip status events (alert.drip.sent, alert.drip.failed)
      if (event.topic.startsWith("alert.drip.")) {
        return;
      }

      const severity = event.topic.split(".")[1]; // critical, high, medium, low
      const payload = event.payload as AlertPayload;
      const { message, data } = payload;

      try {
        // Map EventBus severity to Drip severity
        const dripSeverity = mapSeverityToDrip(severity);

        // Route to dripAlertManager
        const success = await dripManagerRef!.recordAlert(dripSeverity, message, data);

        if (success) {
          // Emit success tracking event
          bus.emit(
            "alert.drip.sent",
            {
              severity,
              message,
              recipient: data.recipient || "DripTVDD",
              timestamp: new Date().toISOString(),
              originalCorrelationId: event.correlationId,
            },
            {
              emitter: "alert-dispatcher",
              parentCorrelationId: event.correlationId, // Chain correlation
            },
          );

          logFn!("info", "[AlertDispatcher] Alert delivered to Drip", {
            severity,
            message,
            correlationId: event.correlationId,
          });
        } else {
          // Emit failure tracking event
          bus.emit(
            "alert.drip.failed",
            {
              severity,
              message,
              recipient: data.recipient || "DripTVDD",
              error: "recordAlert returned false",
              timestamp: new Date().toISOString(),
              originalCorrelationId: event.correlationId,
            },
            {
              emitter: "alert-dispatcher",
              parentCorrelationId: event.correlationId,
              priority: "high", // Delivery failures are high priority
            },
          );

          logFn!("error", "[AlertDispatcher] Alert delivery failed", {
            severity,
            message,
            correlationId: event.correlationId,
          });
        }
      } catch (error) {
        // Emit failure tracking event
        bus.emit(
          "alert.drip.failed",
          {
            severity,
            message,
            recipient: data.recipient || "DripTVDD",
            error: getErrorMessage(error),
            timestamp: new Date().toISOString(),
            originalCorrelationId: event.correlationId,
          },
          {
            emitter: "alert-dispatcher",
            parentCorrelationId: event.correlationId,
            priority: "high",
          },
        );

        logFn!("error", "[AlertDispatcher] Error delivering alert", {
          severity,
          message,
          error: getErrorMessage(error),
          correlationId: event.correlationId,
        });
      }
    },
    {
      priority: 5, // Medium priority (below security/alert logging, above general telemetry)
      maxQueueSize: 500, // Match alert subscription queue size
    },
  );

  logFn("success", "[AlertDispatcher] Initialized", {
    subscriptionId: alertSubscriptionId,
    dripManagerReady: !!dripManagerRef,
  });

  return alertSubscriptionId;
}

/**
 * Cleanup alert dispatcher (graceful shutdown)
 *
 * Unsubscribes from alert.* events and clears references.
 */
export function cleanupAlertDispatcher(): void {
  if (alertSubscriptionId) {
    try {
      bus.unsubscribe(alertSubscriptionId);
      logFn?.("info", "[AlertDispatcher] Subscription cleaned up");
    } catch {
      // Ignore cleanup errors
    }
    alertSubscriptionId = null;
  }

  dripManagerRef = null;
  logFn = null;
}

/**
 * Get alert dispatcher status (for monitoring)
 */
export function getAlertDispatcherStatus(): AlertDispatcherStatus {
  return {
    initialized: !!alertSubscriptionId,
    subscriptionId: alertSubscriptionId,
    dripManagerAvailable: !!dripManagerRef,
  };
}
