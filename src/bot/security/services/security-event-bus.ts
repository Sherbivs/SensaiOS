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

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Logger interface for event bus
 */
export interface EventBusLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Security event channels (domains)
 */
export enum SecurityChannel {
  /** Authentication events */
  AUTH = "auth",
  /** Role and permission changes */
  ROLES = "roles",
  /** Threat detection events */
  THREATS = "threats",
  /** Audit trail events */
  AUDIT = "audit",
  /** Configuration changes */
  CONFIG = "config",
  /** Rate limiting events */
  RATE_LIMIT = "rate_limit",
  /** User activity events */
  ACTIVITY = "activity",
  /** System health events */
  HEALTH = "health",
  /** All events (wildcard) */
  ALL = "*",
}

/**
 * Event priority levels
 */
export enum EventPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Base security event interface
 */
export interface SecurityEvent<T = unknown> {
  /** Unique event ID */
  id: string;
  /** Event channel/domain */
  channel: SecurityChannel;
  /** Event type within the channel */
  type: string;
  /** Event payload */
  payload: T;
  /** Event priority */
  priority: EventPriority;
  /** Correlation ID for event chains */
  correlationId: string;
  /** Parent correlation ID (for nested events) */
  parentCorrelationId?: string;
  /** Timestamp of event creation */
  timestamp: Date;
  /** Source of the event */
  source: string;
  /** Associated guild ID */
  guildId?: string;
  /** Associated user ID */
  userId?: string;
  /** Event metadata */
  metadata: Record<string, unknown>;
}

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: SecurityEvent<T>) => Promise<void> | void;

/**
 * Event filter function type
 */
export type EventFilter<T = unknown> = (event: SecurityEvent<T>) => boolean;

/**
 * Event transformer function type
 */
export type EventTransformer<TIn = unknown, TOut = unknown> = (
  event: SecurityEvent<TIn>
) => SecurityEvent<TOut>;

/**
 * Subscription options
 */
export interface SubscriptionOptions {
  /** Filter events before handler is called */
  filter?: EventFilter;
  /** Only receive events with specific priority or higher */
  minPriority?: EventPriority;
  /** Only receive events from specific guild */
  guildId?: string;
  /** Only receive events with matching correlation ID */
  correlationId?: string;
  /** Maximum events to buffer before dropping */
  maxBufferSize?: number;
  /** Timeout for handler execution (ms) */
  handlerTimeout?: number;
}

/**
 * Subscription handle
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** Channel subscribed to */
  channel: SecurityChannel;
  /** Event type (or '*' for all) */
  eventType: string;
  /** Whether subscription is active */
  active: boolean;
  /** Unsubscribe function */
  unsubscribe(): void;
}

/**
 * Dead letter entry for failed events
 */
export interface DeadLetterEntry {
  /** Event that failed */
  event: SecurityEvent;
  /** Error that occurred */
  error: string;
  /** Handler that failed */
  handlerId: string;
  /** Timestamp of failure */
  failedAt: Date;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Event bus statistics
 */
export interface EventBusStats {
  /** Total events published */
  totalPublished: number;
  /** Total events delivered */
  totalDelivered: number;
  /** Total events in dead letter queue */
  deadLetterCount: number;
  /** Active subscriptions */
  activeSubscriptions: number;
  /** Events by channel */
  eventsByChannel: Record<string, number>;
  /** Average delivery time (ms) */
  avgDeliveryTimeMs: number;
  /** Events in replay buffer */
  replayBufferSize: number;
}

/**
 * Event bus configuration
 */
export interface EventBusConfig {
  /** Maximum events to keep in replay buffer */
  maxReplayBufferSize: number;
  /** Maximum events in dead letter queue */
  maxDeadLetterSize: number;
  /** Default handler timeout (ms) */
  defaultHandlerTimeoutMs: number;
  /** Enable automatic audit logging */
  enableAuditLogging: boolean;
  /** Retry failed handlers */
  retryFailedHandlers: boolean;
  /** Max retry attempts */
  maxRetryAttempts: number;
  /** Optional logger */
  logger?: EventBusLogger;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_CONFIG: EventBusConfig = {
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
  private readonly config: EventBusConfig;
  private readonly logger?: EventBusLogger;

  // Subscription storage: channel -> eventType -> handlers[]
  private subscriptions: Map<
    SecurityChannel,
    Map<string, Array<{ id: string; handler: EventHandler; options: SubscriptionOptions }>>
  > = new Map();

  // Replay buffer for event replay capability
  private replayBuffer: SecurityEvent[] = [];

  // Dead letter queue for failed events
  private deadLetterQueue: DeadLetterEntry[] = [];

  // Statistics
  private stats = {
    totalPublished: 0,
    totalDelivered: 0,
    eventsByChannel: {} as Record<string, number>,
    deliveryTimes: [] as number[],
  };

  // Subscription ID counter
  private subscriptionIdCounter = 0;

  /**
   * Creates a new SecurityEventBus instance
   */
  constructor(config: Partial<EventBusConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = this.config.logger;

    // Initialize channel maps
    for (const channel of Object.values(SecurityChannel)) {
      this.subscriptions.set(channel as SecurityChannel, new Map());
    }
  }

  // ==========================================================================
  // Public API - Publishing
  // ==========================================================================

  /**
   * Publishes an event to the bus
   */
  async publish<T>(event: Omit<SecurityEvent<T>, "id" | "timestamp">): Promise<string> {
    const fullEvent: SecurityEvent<T> = {
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
  async publishAndWait<T>(
    event: Omit<SecurityEvent<T>, "id" | "timestamp">
  ): Promise<{ eventId: string; delivered: number; failed: number }> {
    const fullEvent: SecurityEvent<T> = {
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
  createEvent<T>(
    channel: SecurityChannel,
    type: string,
    payload: T,
    options: Partial<Omit<SecurityEvent<T>, "id" | "timestamp" | "channel" | "type" | "payload">> = {}
  ): Omit<SecurityEvent<T>, "id" | "timestamp"> {
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
  subscribe<T = unknown>(
    channel: SecurityChannel,
    eventType: string,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): Subscription {
    const id = `sub_${++this.subscriptionIdCounter}`;

    const channelSubs = this.subscriptions.get(channel)!;
    if (!channelSubs.has(eventType)) {
      channelSubs.set(eventType, []);
    }

    channelSubs.get(eventType)!.push({
      id,
      handler: handler as EventHandler,
      options,
    });

    this.logger?.debug("Subscription created", {
      subscriptionId: id,
      channel,
      eventType,
    });

    const subscription: Subscription = {
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
  subscribeToChannel<T = unknown>(
    channel: SecurityChannel,
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): Subscription {
    return this.subscribe(channel, "*", handler, options);
  }

  /**
   * Subscribes to all events across all channels
   */
  subscribeToAll<T = unknown>(
    handler: EventHandler<T>,
    options: SubscriptionOptions = {}
  ): Subscription {
    return this.subscribe(SecurityChannel.ALL, "*", handler, options);
  }

  /**
   * Unsubscribes a specific handler
   */
  unsubscribe(channel: SecurityChannel, eventType: string, subscriptionId: string): boolean {
    const channelSubs = this.subscriptions.get(channel);
    if (!channelSubs) return false;

    const typeSubs = channelSubs.get(eventType);
    if (!typeSubs) return false;

    const index = typeSubs.findIndex((s) => s.id === subscriptionId);
    if (index === -1) return false;

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
  async replay(
    filter?: EventFilter,
    limit?: number
  ): Promise<{ replayed: number; delivered: number }> {
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
  getReplayBuffer(filter?: EventFilter, limit?: number): SecurityEvent[] {
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
  clearReplayBuffer(): void {
    this.replayBuffer = [];
    this.logger?.debug("Replay buffer cleared");
  }

  // ==========================================================================
  // Public API - Dead Letter Queue
  // ==========================================================================

  /**
   * Gets entries from the dead letter queue
   */
  getDeadLetterQueue(): DeadLetterEntry[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Retries a dead letter entry
   */
  async retryDeadLetter(entryIndex: number): Promise<boolean> {
    const entry = this.deadLetterQueue[entryIndex];
    if (!entry) return false;

    try {
      await this.deliverEvent(entry.event);
      this.deadLetterQueue.splice(entryIndex, 1);
      this.logger?.info("Dead letter entry retried successfully", {
        eventId: entry.event.id,
      });
      return true;
    } catch {
      entry.retryCount++;
      return false;
    }
  }

  /**
   * Clears the dead letter queue
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue = [];
    this.logger?.debug("Dead letter queue cleared");
  }

  // ==========================================================================
  // Public API - Statistics
  // ==========================================================================

  /**
   * Gets event bus statistics
   */
  getStats(): EventBusStats {
    const avgDeliveryTime =
      this.stats.deliveryTimes.length > 0
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
  resetStats(): void {
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
  generateCorrelationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `cor_${timestamp}_${random}`;
  }

  /**
   * Gets all events with a specific correlation ID
   */
  getEventsByCorrelationId(correlationId: string): SecurityEvent[] {
    return this.replayBuffer.filter(
      (e) => e.correlationId === correlationId || e.parentCorrelationId === correlationId
    );
  }

  // ==========================================================================
  // Private - Event Delivery
  // ==========================================================================

  private async deliverEvent<T>(event: SecurityEvent<T>): Promise<void> {
    const handlers = this.getMatchingHandlers(event);
    const startTime = Date.now();

    for (const { id, handler, options } of handlers) {
      if (!this.shouldDeliverToHandler(event, options)) {
        continue;
      }

      try {
        const timeout = options.handlerTimeout ?? this.config.defaultHandlerTimeoutMs;
        await this.executeWithTimeout(handler(event as SecurityEvent), timeout);
        this.stats.totalDelivered++;
      } catch (error) {
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

  private async deliverEventWithResults<T>(
    event: SecurityEvent<T>
  ): Promise<{ delivered: number; failed: number }> {
    const handlers = this.getMatchingHandlers(event);
    let delivered = 0;
    let failed = 0;

    for (const { id, handler, options } of handlers) {
      if (!this.shouldDeliverToHandler(event, options)) {
        continue;
      }

      try {
        const timeout = options.handlerTimeout ?? this.config.defaultHandlerTimeoutMs;
        await this.executeWithTimeout(handler(event as SecurityEvent), timeout);
        this.stats.totalDelivered++;
        delivered++;
      } catch (error) {
        this.handleDeliveryError(event, id, error);
        failed++;
      }
    }

    return { delivered, failed };
  }

  private getMatchingHandlers<T>(event: SecurityEvent<T>): Array<{
    id: string;
    handler: EventHandler;
    options: SubscriptionOptions;
  }> {
    const handlers: Array<{
      id: string;
      handler: EventHandler;
      options: SubscriptionOptions;
    }> = [];

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

  private shouldDeliverToHandler<T>(
    event: SecurityEvent<T>,
    options: SubscriptionOptions
  ): boolean {
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
    if (options.filter && !options.filter(event as SecurityEvent)) {
      return false;
    }

    return true;
  }

  private async executeWithTimeout<T>(
    promise: Promise<T> | T,
    timeoutMs: number
  ): Promise<T> {
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

  private handleDeliveryError<T>(
    event: SecurityEvent<T>,
    handlerId: string,
    error: unknown
  ): void {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    this.logger?.error("Event delivery failed", {
      eventId: event.id,
      handlerId,
      error: errorMessage,
    });

    // Add to dead letter queue
    if (this.deadLetterQueue.length < this.config.maxDeadLetterSize) {
      this.deadLetterQueue.push({
        event: event as SecurityEvent,
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

  private addToReplayBuffer<T>(event: SecurityEvent<T>): void {
    this.replayBuffer.push(event as SecurityEvent);

    // Trim buffer if needed
    while (this.replayBuffer.length > this.config.maxReplayBufferSize) {
      this.replayBuffer.shift();
    }
  }

  // ==========================================================================
  // Private - Audit Logging
  // ==========================================================================

  private auditLog<T>(event: SecurityEvent<T>): void {
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

  private generateEventId(): string {
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
export function createSecurityEventBus(
  config: Partial<EventBusConfig> = {}
): SecurityEventBus {
  return new SecurityEventBus(config);
}

// ============================================================================
// Typed Event Helpers
// ============================================================================

/**
 * Authentication event payloads
 */
export interface AuthEventPayload {
  action: "login" | "logout" | "token_refresh" | "permission_denied";
  success: boolean;
  reason?: string;
}

/**
 * Role change event payloads
 */
export interface RoleEventPayload {
  action: "role_assigned" | "role_removed" | "permission_changed";
  roleId: string;
  roleName: string;
  targetUserId: string;
  changes?: Record<string, unknown>;
}

/**
 * Threat event payloads
 */
export interface ThreatEventPayload {
  threatType: string;
  severity: "low" | "medium" | "high" | "critical";
  indicators: string[];
  mitigated: boolean;
}

/**
 * Creates typed auth event
 */
export function createAuthEvent(
  bus: SecurityEventBus,
  payload: AuthEventPayload,
  options: Partial<Omit<SecurityEvent<AuthEventPayload>, "id" | "timestamp" | "channel" | "type" | "payload">> = {}
): Omit<SecurityEvent<AuthEventPayload>, "id" | "timestamp"> {
  return bus.createEvent(SecurityChannel.AUTH, payload.action, payload, options);
}

/**
 * Creates typed role event
 */
export function createRoleEvent(
  bus: SecurityEventBus,
  payload: RoleEventPayload,
  options: Partial<Omit<SecurityEvent<RoleEventPayload>, "id" | "timestamp" | "channel" | "type" | "payload">> = {}
): Omit<SecurityEvent<RoleEventPayload>, "id" | "timestamp"> {
  return bus.createEvent(SecurityChannel.ROLES, payload.action, payload, options);
}

/**
 * Creates typed threat event
 */
export function createThreatEvent(
  bus: SecurityEventBus,
  payload: ThreatEventPayload,
  options: Partial<Omit<SecurityEvent<ThreatEventPayload>, "id" | "timestamp" | "channel" | "type" | "payload">> = {}
): Omit<SecurityEvent<ThreatEventPayload>, "id" | "timestamp"> {
  return bus.createEvent(SecurityChannel.THREATS, "threat_detected", payload, {
    ...options,
    priority: payload.severity === "critical" ? EventPriority.CRITICAL : 
              payload.severity === "high" ? EventPriority.HIGH :
              payload.severity === "medium" ? EventPriority.NORMAL : EventPriority.LOW,
  });
}
