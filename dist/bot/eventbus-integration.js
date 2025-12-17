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
import { EventBus, } from "../shared/event-bus.js";
import { getErrorMessage } from "../shared/utils/index.js";
// ============================================================================
// MODULE STATE
// ============================================================================
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
 * @param topic - Event topic (e.g., 'baseline.generated', 'threat.detected')
 * @param payload - Event data
 * @param options - EventBus options (correlationId, priority, etc.)
 * @returns Event metadata (correlationId, timestamp)
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
        source: "security-bot",
    }, {
        emitter: "security-bot",
        ...options,
    });
}
/**
 * Emit role management events
 *
 * @param topic - Event topic (e.g., 'changed', 'drift.detected', 'reverted')
 * @param roleData - Role information (id, name, guildId, guildName, permissions)
 * @param options - EventBus options
 * @returns Event metadata
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
        emitter: "security-bot",
        ...options,
    });
}
/**
 * Emit guild operation events
 *
 * @param topic - Event topic (e.g., 'sweep.started', 'member.fetched')
 * @param guildData - Guild information (id, name, memberCount)
 * @param additionalData - Additional event data
 * @param options - EventBus options
 * @returns Event metadata
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
        emitter: "security-bot",
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
 * @param severity - Alert severity (critical, high, medium, low)
 * @param message - Alert message
 * @param data - Additional alert data
 * @param options - EventBus options
 * @returns Event metadata
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
        emitter: "security-bot",
        priority: severity === "critical" || severity === "high" ? "high" : "normal",
        ...options,
    });
}
/**
 * Get EventBus statistics (for monitoring)
 *
 * @returns EventBus stats (eventsEmitted, subscriptions, latency, etc.)
 */
export function getEventBusStats() {
    return bus.getStats();
}
/**
 * Replay events matching pattern since timestamp
 *
 * @param pattern - Event pattern (e.g., 'security.**', 'alert.critical')
 * @param since - Replay events after this timestamp
 * @returns Matching events from replay buffer
 */
export function replayEvents(pattern, since) {
    return bus.replay(pattern, since);
}
/**
 * Get active subscriber information
 *
 * @returns Active subscribers with queue stats
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
 * @param logFn - Logging function from main.js
 * @returns Subscription IDs for cleanup
 *
 * @example
 * client.once(Events.ClientReady, async () => {
 *   const subs = initializeEventBus(log);
 *   console.log(`EventBus subscriptions active: ${subs.length}`);
 * });
 */
export function initializeEventBus(logFn) {
    // Use provided logger or no-op fallback
    const log = logFn || (() => { });
    // Clear existing subscriptions (prevent duplicates on hot reload)
    cleanupEventBus();
    // =========================================================================
    // PRIORITY 10: Security Events (Critical Path)
    // =========================================================================
    const securitySubId = bus.subscribe("security.**", (event) => {
        const operation = event.topic.split(".").slice(1).join("."); // Remove 'security.' prefix
        let level = "info";
        if (operation.includes("failed") || operation.includes("error")) {
            level = "error";
        }
        else if (operation.includes("detected") || operation.includes("triggered")) {
            level = "warn";
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
    const alertSubId = bus.subscribe("alert.*", (event) => {
        const payload = event.payload;
        const severity = event.topic.split(".")[1] ?? "unknown";
        const logLevel = severity === "critical" || severity === "high" ? "error" : "warn";
        log(logLevel, `[EventBus:Alert:${severity.toUpperCase()}] ${payload?.message ?? "No message"}`, {
            correlationId: event.correlationId,
            severity,
            data: payload?.data,
            timestamp: payload?.timestamp,
        });
    }, {
        priority: 10,
        maxQueueSize: 500,
    });
    subscriptionIds.push(alertSubId);
    // =========================================================================
    // PRIORITY 5: Drip Alert Status
    // =========================================================================
    const dripStatusSubId = bus.subscribe("alert.drip.*", (event) => {
        const payload = event.payload;
        const status = event.topic.split(".")[2] ?? "unknown"; // sent, failed
        const level = status === "failed" ? "error" : "info";
        log(level, `[EventBus:Drip] Alert ${status}`, {
            correlationId: event.correlationId,
            severity: payload?.severity,
            recipient: payload?.recipient,
            error: payload?.error,
        });
    }, {
        priority: 5,
        maxQueueSize: 100,
    });
    subscriptionIds.push(dripStatusSubId);
    // =========================================================================
    // PRIORITY 0-5: Role Events
    // =========================================================================
    const roleChangedSubId = bus.subscribe("role.changed", (event) => {
        const payload = event.payload;
        log("info", "[EventBus:Role] Permission change detected", {
            correlationId: event.correlationId,
            roleId: payload?.roleId,
            roleName: payload?.roleName,
            guildName: payload?.guildName,
            permissionCount: Array.isArray(payload?.permissions)
                ? payload.permissions.length
                : 0,
        });
    }, {
        priority: 0,
        maxQueueSize: 5000,
    });
    subscriptionIds.push(roleChangedSubId);
    const roleDriftSubId = bus.subscribe("role.drift.detected", (event) => {
        const payload = event.payload;
        log("warn", "[EventBus:Role] Permission drift detected", {
            correlationId: event.correlationId,
            roleId: payload?.roleId,
            roleName: payload?.roleName,
            guildName: payload?.guildName,
        });
    }, {
        priority: 5,
        maxQueueSize: 1000,
    });
    subscriptionIds.push(roleDriftSubId);
    const roleRevertedSubId = bus.subscribe("role.reverted", (event) => {
        const payload = event.payload;
        log("success", "[EventBus:Role] Unauthorized change reverted", {
            correlationId: event.correlationId,
            roleId: payload?.roleId,
            roleName: payload?.roleName,
            guildName: payload?.guildName,
        });
    }, {
        priority: 5,
        maxQueueSize: 1000,
    });
    subscriptionIds.push(roleRevertedSubId);
    // =========================================================================
    // PRIORITY 0: Guild Sweep Telemetry
    // =========================================================================
    const guildSweepSubId = bus.subscribe("guild.sweep.*", (event) => {
        const payload = event.payload;
        const action = event.topic.split(".")[2] ?? "unknown"; // started, completed
        log("info", `[EventBus:Guild] Sweep ${action}`, {
            correlationId: event.correlationId,
            guildName: payload?.guildName,
            rolesChecked: payload?.rolesChecked,
            changesDetected: payload?.changesDetected,
            duration: payload?.duration,
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
            log("info", "[EventBus] Statistics", {
                eventsEmitted: stats.eventsEmitted,
                subscriptionsActive: stats.subscriptionsActive,
                replayBufferSize: stats.replayBufferSize,
                totalHandlerInvocations: stats.totalHandlerInvocations,
                failedHandlerInvocations: stats.failedHandlerInvocations,
                averageHandlerLatency: `${stats.averageHandlerLatency.toFixed(2)}ms`,
                backpressureEvents: stats.backpressureEvents,
            });
        }
        catch (error) {
            log("error", "[EventBus] Failed to retrieve statistics", {
                error: getErrorMessage(error),
            });
        }
    }, 5 * 60 * 1000);
    log("success", "[EventBus] Subscriptions initialized", {
        subscriptions: subscriptionIds.length,
        patterns: [
            "security.**",
            "alert.*",
            "alert.drip.*",
            "role.changed",
            "role.drift.detected",
            "role.reverted",
            "guild.sweep.*",
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
        }
        catch {
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
 * @returns Subscription status with queue stats
 */
export function getSubscriptionStatus() {
    const subscribers = bus.getSubscribers();
    return {
        totalSubscriptions: subscriptionIds.length,
        activeSubscriptions: subscribers.length,
        subscribers: subscribers.map((sub) => ({
            pattern: sub.pattern,
            priority: sub.priority,
            queueSize: sub.queueSize,
            maxQueueSize: sub.maxQueueSize,
            droppedEvents: sub.droppedEvents,
            handlerName: sub.handlerName,
        })),
    };
}
