/**
 * Event-Driven Security Bus (P2-004)
 *
 * Provides a pub/sub event system for security-related events with:
 * - Typed event channels for different security domains
 * - Event replay capability for audit/debugging
 * - Correlation ID tracking across event chains
 * - Automatic audit logging integration
 * - Dead letter queue for failed handlers
 * - Event filtering and transformation
 *
 * @module SecurityEventBus
 * @security Event Integrity, CWE-778 (Insufficient Logging)
 */
/**
 * Security event channels (domains)
 */
export var SecurityChannel;
(function (SecurityChannel) {
    /** Authentication events */
    SecurityChannel["AUTH"] = "auth";
    /** Role and permission changes */
    SecurityChannel["ROLES"] = "roles";
    /** Threat detection events */
    SecurityChannel["THREATS"] = "threats";
    /** Audit trail events */
    SecurityChannel["AUDIT"] = "audit";
    /** Configuration changes */
    SecurityChannel["CONFIG"] = "config";
    /** Rate limiting events */
    SecurityChannel["RATE_LIMIT"] = "rate_limit";
    /** User activity events */
    SecurityChannel["ACTIVITY"] = "activity";
    /** System health events */
    SecurityChannel["HEALTH"] = "health";
    /** All events (wildcard) */
    SecurityChannel["ALL"] = "*";
})(SecurityChannel || (SecurityChannel = {}));
/**
 * Event priority levels
 */
export var EventPriority;
(function (EventPriority) {
    EventPriority[EventPriority["LOW"] = 0] = "LOW";
    EventPriority[EventPriority["NORMAL"] = 1] = "NORMAL";
    EventPriority[EventPriority["HIGH"] = 2] = "HIGH";
    EventPriority[EventPriority["CRITICAL"] = 3] = "CRITICAL";
})(EventPriority || (EventPriority = {}));
// ============================================================================
// Constants
// ============================================================================
const DEFAULT_CONFIG = {
    maxReplayBufferSize: 1000,
    maxDeadLetterSize: 100,
    defaultHandlerTimeoutMs: 5000,
    enableAuditLogging: true,
    retryFailedHandlers: true,
    maxRetryAttempts: 3,
};
// ============================================================================
// Service Implementation
// ============================================================================
/**
 * Security Event Bus
 *
 * Provides a pub/sub event system for security-related events.
 */
export class SecurityEventBus {
    config;
    logger;
    // Subscription storage: channel -> eventType -> handlers[]
    subscriptions = new Map();
    // Replay buffer for event replay capability
    replayBuffer = [];
    // Dead letter queue for failed events
    deadLetterQueue = [];
    // Statistics
    stats = {
        totalPublished: 0,
        totalDelivered: 0,
        eventsByChannel: {},
        deliveryTimes: [],
    };
    // Subscription ID counter
    subscriptionIdCounter = 0;
    /**
     * Creates a new SecurityEventBus instance
     */
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.logger = this.config.logger;
        // Initialize channel maps
        for (const channel of Object.values(SecurityChannel)) {
            this.subscriptions.set(channel, new Map());
        }
    }
    // ==========================================================================
    // Public API - Publishing
    // ==========================================================================
    /**
     * Publishes an event to the bus
     */
    async publish(event) {
        const fullEvent = {
            ...event,
            id: this.generateEventId(),
            timestamp: new Date(),
        };
        this.logger?.debug("Publishing event", {
            eventId: fullEvent.id,
            channel: fullEvent.channel,
            type: fullEvent.type,
            correlationId: fullEvent.correlationId,
        });
        // Update stats
        this.stats.totalPublished++;
        this.stats.eventsByChannel[fullEvent.channel] =
            (this.stats.eventsByChannel[fullEvent.channel] || 0) + 1;
        // Add to replay buffer
        this.addToReplayBuffer(fullEvent);
        // Audit logging
        if (this.config.enableAuditLogging) {
            this.auditLog(fullEvent);
        }
        // Deliver to subscribers
        await this.deliverEvent(fullEvent);
        return fullEvent.id;
    }
    /**
     * Publishes an event and waits for all handlers to complete
     */
    async publishAndWait(event) {
        const fullEvent = {
            ...event,
            id: this.generateEventId(),
            timestamp: new Date(),
        };
        this.stats.totalPublished++;
        this.stats.eventsByChannel[fullEvent.channel] =
            (this.stats.eventsByChannel[fullEvent.channel] || 0) + 1;
        this.addToReplayBuffer(fullEvent);
        if (this.config.enableAuditLogging) {
            this.auditLog(fullEvent);
        }
        const { delivered, failed } = await this.deliverEventWithResults(fullEvent);
        return { eventId: fullEvent.id, delivered, failed };
    }
    /**
     * Creates a new event with proper defaults
     */
    createEvent(channel, type, payload, options = {}) {
        return {
            channel,
            type,
            payload,
            priority: options.priority ?? EventPriority.NORMAL,
            correlationId: options.correlationId ?? this.generateCorrelationId(),
            parentCorrelationId: options.parentCorrelationId,
            source: options.source ?? "unknown",
            guildId: options.guildId,
            userId: options.userId,
            metadata: options.metadata ?? {},
        };
    }
    // ==========================================================================
    // Public API - Subscribing
    // ==========================================================================
    /**
     * Subscribes to events on a channel
     */
    subscribe(channel, eventType, handler, options = {}) {
        const id = `sub_${++this.subscriptionIdCounter}`;
        const channelSubs = this.subscriptions.get(channel);
        if (!channelSubs.has(eventType)) {
            channelSubs.set(eventType, []);
        }
        channelSubs.get(eventType).push({
            id,
            handler: handler,
            options,
        });
        this.logger?.debug("Subscription created", {
            subscriptionId: id,
            channel,
            eventType,
        });
        const subscription = {
            id,
            channel,
            eventType,
            active: true,
            unsubscribe: () => {
                this.unsubscribe(channel, eventType, id);
                subscription.active = false;
            },
        };
        return subscription;
    }
    /**
     * Subscribes to all events on a channel
     */
    subscribeToChannel(channel, handler, options = {}) {
        return this.subscribe(channel, "*", handler, options);
    }
    /**
     * Subscribes to all events across all channels
     */
    subscribeToAll(handler, options = {}) {
        return this.subscribe(SecurityChannel.ALL, "*", handler, options);
    }
    /**
     * Unsubscribes a specific handler
     */
    unsubscribe(channel, eventType, subscriptionId) {
        const channelSubs = this.subscriptions.get(channel);
        if (!channelSubs)
            return false;
        const typeSubs = channelSubs.get(eventType);
        if (!typeSubs)
            return false;
        const index = typeSubs.findIndex((s) => s.id === subscriptionId);
        if (index === -1)
            return false;
        typeSubs.splice(index, 1);
        this.logger?.debug("Subscription removed", {
            subscriptionId,
            channel,
            eventType,
        });
        return true;
    }
    // ==========================================================================
    // Public API - Event Replay
    // ==========================================================================
    /**
     * Replays events from the buffer
     */
    async replay(filter, limit) {
        let events = [...this.replayBuffer];
        if (filter) {
            events = events.filter(filter);
        }
        if (limit) {
            events = events.slice(-limit);
        }
        let delivered = 0;
        for (const event of events) {
            const result = await this.deliverEventWithResults(event);
            delivered += result.delivered;
        }
        this.logger?.info("Event replay completed", {
            replayed: events.length,
            delivered,
        });
        return { replayed: events.length, delivered };
    }
    /**
     * Gets events from the replay buffer
     */
    getReplayBuffer(filter, limit) {
        let events = [...this.replayBuffer];
        if (filter) {
            events = events.filter(filter);
        }
        if (limit) {
            events = events.slice(-limit);
        }
        return events;
    }
    /**
     * Clears the replay buffer
     */
    clearReplayBuffer() {
        this.replayBuffer = [];
        this.logger?.debug("Replay buffer cleared");
    }
    // ==========================================================================
    // Public API - Dead Letter Queue
    // ==========================================================================
    /**
     * Gets entries from the dead letter queue
     */
    getDeadLetterQueue() {
        return [...this.deadLetterQueue];
    }
    /**
     * Retries a dead letter entry
     */
    async retryDeadLetter(entryIndex) {
        const entry = this.deadLetterQueue[entryIndex];
        if (!entry)
            return false;
        try {
            await this.deliverEvent(entry.event);
            this.deadLetterQueue.splice(entryIndex, 1);
            this.logger?.info("Dead letter entry retried successfully", {
                eventId: entry.event.id,
            });
            return true;
        }
        catch {
            entry.retryCount++;
            return false;
        }
    }
    /**
     * Clears the dead letter queue
     */
    clearDeadLetterQueue() {
        this.deadLetterQueue = [];
        this.logger?.debug("Dead letter queue cleared");
    }
    // ==========================================================================
    // Public API - Statistics
    // ==========================================================================
    /**
     * Gets event bus statistics
     */
    getStats() {
        const avgDeliveryTime = this.stats.deliveryTimes.length > 0
            ? this.stats.deliveryTimes.reduce((a, b) => a + b, 0) / this.stats.deliveryTimes.length
            : 0;
        let activeSubscriptions = 0;
        for (const channelMap of this.subscriptions.values()) {
            for (const handlers of channelMap.values()) {
                activeSubscriptions += handlers.length;
            }
        }
        return {
            totalPublished: this.stats.totalPublished,
            totalDelivered: this.stats.totalDelivered,
            deadLetterCount: this.deadLetterQueue.length,
            activeSubscriptions,
            eventsByChannel: { ...this.stats.eventsByChannel },
            avgDeliveryTimeMs: avgDeliveryTime,
            replayBufferSize: this.replayBuffer.length,
        };
    }
    /**
     * Resets statistics
     */
    resetStats() {
        this.stats = {
            totalPublished: 0,
            totalDelivered: 0,
            eventsByChannel: {},
            deliveryTimes: [],
        };
        this.logger?.debug("Statistics reset");
    }
    // ==========================================================================
    // Public API - Correlation
    // ==========================================================================
    /**
     * Generates a new correlation ID
     */
    generateCorrelationId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 10);
        return `cor_${timestamp}_${random}`;
    }
    /**
     * Gets all events with a specific correlation ID
     */
    getEventsByCorrelationId(correlationId) {
        return this.replayBuffer.filter((e) => e.correlationId === correlationId || e.parentCorrelationId === correlationId);
    }
    // ==========================================================================
    // Private - Event Delivery
    // ==========================================================================
    async deliverEvent(event) {
        const handlers = this.getMatchingHandlers(event);
        const startTime = Date.now();
        for (const { id, handler, options } of handlers) {
            if (!this.shouldDeliverToHandler(event, options)) {
                continue;
            }
            try {
                const timeout = options.handlerTimeout ?? this.config.defaultHandlerTimeoutMs;
                await this.executeWithTimeout(handler(event), timeout);
                this.stats.totalDelivered++;
            }
            catch (error) {
                this.handleDeliveryError(event, id, error);
            }
        }
        const deliveryTime = Date.now() - startTime;
        this.stats.deliveryTimes.push(deliveryTime);
        // Keep only last 100 delivery times for average calculation
        if (this.stats.deliveryTimes.length > 100) {
            this.stats.deliveryTimes.shift();
        }
    }
    async deliverEventWithResults(event) {
        const handlers = this.getMatchingHandlers(event);
        let delivered = 0;
        let failed = 0;
        for (const { id, handler, options } of handlers) {
            if (!this.shouldDeliverToHandler(event, options)) {
                continue;
            }
            try {
                const timeout = options.handlerTimeout ?? this.config.defaultHandlerTimeoutMs;
                await this.executeWithTimeout(handler(event), timeout);
                this.stats.totalDelivered++;
                delivered++;
            }
            catch (error) {
                this.handleDeliveryError(event, id, error);
                failed++;
            }
        }
        return { delivered, failed };
    }
    getMatchingHandlers(event) {
        const handlers = [];
        // Get handlers for specific channel + event type
        const channelSubs = this.subscriptions.get(event.channel);
        if (channelSubs) {
            const typeSubs = channelSubs.get(event.type);
            if (typeSubs) {
                handlers.push(...typeSubs);
            }
            // Get wildcard handlers for this channel
            const wildcardSubs = channelSubs.get("*");
            if (wildcardSubs) {
                handlers.push(...wildcardSubs);
            }
        }
        // Get handlers subscribed to ALL channels
        const allChannelSubs = this.subscriptions.get(SecurityChannel.ALL);
        if (allChannelSubs) {
            const wildcardSubs = allChannelSubs.get("*");
            if (wildcardSubs) {
                handlers.push(...wildcardSubs);
            }
        }
        return handlers;
    }
    shouldDeliverToHandler(event, options) {
        // Check priority filter
        if (options.minPriority !== undefined && event.priority < options.minPriority) {
            return false;
        }
        // Check guild filter
        if (options.guildId && event.guildId !== options.guildId) {
            return false;
        }
        // Check correlation filter
        if (options.correlationId && event.correlationId !== options.correlationId) {
            return false;
        }
        // Check custom filter
        if (options.filter && !options.filter(event)) {
            return false;
        }
        return true;
    }
    async executeWithTimeout(promise, timeoutMs) {
        if (!(promise instanceof Promise)) {
            return promise;
        }
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Handler timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            promise
                .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
    handleDeliveryError(event, handlerId, error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        this.logger?.error("Event delivery failed", {
            eventId: event.id,
            handlerId,
            error: errorMessage,
        });
        // Add to dead letter queue
        if (this.deadLetterQueue.length < this.config.maxDeadLetterSize) {
            this.deadLetterQueue.push({
                event: event,
                error: errorMessage,
                handlerId,
                failedAt: new Date(),
                retryCount: 0,
            });
        }
    }
    // ==========================================================================
    // Private - Buffer Management
    // ==========================================================================
    addToReplayBuffer(event) {
        this.replayBuffer.push(event);
        // Trim buffer if needed
        while (this.replayBuffer.length > this.config.maxReplayBufferSize) {
            this.replayBuffer.shift();
        }
    }
    // ==========================================================================
    // Private - Audit Logging
    // ==========================================================================
    auditLog(event) {
        this.logger?.info("Security event", {
            eventId: event.id,
            channel: event.channel,
            type: event.type,
            correlationId: event.correlationId,
            source: event.source,
            guildId: event.guildId,
            userId: event.userId,
            priority: EventPriority[event.priority],
        });
    }
    // ==========================================================================
    // Private - ID Generation
    // ==========================================================================
    generateEventId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        return `evt_${timestamp}_${random}`;
    }
}
// ============================================================================
// Factory Function
// ============================================================================
/**
 * Creates a new SecurityEventBus instance
 */
export function createSecurityEventBus(config = {}) {
    return new SecurityEventBus(config);
}
/**
 * Creates typed auth event
 */
export function createAuthEvent(bus, payload, options = {}) {
    return bus.createEvent(SecurityChannel.AUTH, payload.action, payload, options);
}
/**
 * Creates typed role event
 */
export function createRoleEvent(bus, payload, options = {}) {
    return bus.createEvent(SecurityChannel.ROLES, payload.action, payload, options);
}
/**
 * Creates typed threat event
 */
export function createThreatEvent(bus, payload, options = {}) {
    return bus.createEvent(SecurityChannel.THREATS, "threat_detected", payload, {
        ...options,
        priority: payload.severity === "critical" ? EventPriority.CRITICAL :
            payload.severity === "high" ? EventPriority.HIGH :
                payload.severity === "medium" ? EventPriority.NORMAL : EventPriority.LOW,
    });
}
