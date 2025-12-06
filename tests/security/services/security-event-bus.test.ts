/**
 * Security Event Bus Tests (P2-004)
 *
 * Tests for the event-driven security bus including:
 * - Event publishing and subscription
 * - Channel-based routing
 * - Event replay capability
 * - Dead letter queue handling
 * - Correlation tracking
 * - Statistics and monitoring
 *
 * @module SecurityEventBusTests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SecurityEventBus,
  createSecurityEventBus,
  SecurityChannel,
  EventPriority,
  createAuthEvent,
  createRoleEvent,
  createThreatEvent,
  type EventBusLogger,
  type SecurityEvent,
  type EventHandler,
  type AuthEventPayload,
  type RoleEventPayload,
  type ThreatEventPayload,
} from "../../../src/bot/security/services/security-event-bus.js";

// ============================================================================
// Mock Logger
// ============================================================================

const createMockLogger = (): EventBusLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

// ============================================================================
// Test Helpers
// ============================================================================

const createTestEvent = <T>(
  bus: SecurityEventBus,
  channel: SecurityChannel,
  type: string,
  payload: T
) => {
  return bus.createEvent(channel, type, payload, {
    source: "test",
    guildId: "test-guild",
    userId: "test-user",
  });
};

// ============================================================================
// Test Suites
// ============================================================================

describe("SecurityEventBus", () => {
  let bus: SecurityEventBus;
  let mockLogger: EventBusLogger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = createMockLogger();
    bus = new SecurityEventBus({ logger: mockLogger });
  });

  afterEach(() => {
    bus.clearReplayBuffer();
    bus.clearDeadLetterQueue();
    bus.resetStats();
  });

  // ==========================================================================
  // Constructor and Configuration Tests
  // ==========================================================================

  describe("constructor and configuration", () => {
    it("should create bus with default configuration", () => {
      const defaultBus = new SecurityEventBus();
      const stats = defaultBus.getStats();

      expect(stats.totalPublished).toBe(0);
      expect(stats.activeSubscriptions).toBe(0);
    });

    it("should create bus with custom configuration", () => {
      const customBus = new SecurityEventBus({
        maxReplayBufferSize: 50,
        maxDeadLetterSize: 10,
        enableAuditLogging: false,
      });

      expect(customBus).toBeDefined();
    });

    it("should create bus using factory function", () => {
      const factoryBus = createSecurityEventBus({ logger: mockLogger });
      expect(factoryBus).toBeInstanceOf(SecurityEventBus);
    });
  });

  // ==========================================================================
  // Event Publishing Tests
  // ==========================================================================

  describe("event publishing", () => {
    it("should publish an event and return event ID", async () => {
      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", { userId: "123" });
      const eventId = await bus.publish(event);

      expect(eventId).toMatch(/^evt_[a-z0-9]+_[a-z0-9]+$/);
    });

    it("should assign unique IDs to events", async () => {
      const event1 = createTestEvent(bus, SecurityChannel.AUTH, "login", {});
      const event2 = createTestEvent(bus, SecurityChannel.AUTH, "login", {});

      const id1 = await bus.publish(event1);
      const id2 = await bus.publish(event2);

      expect(id1).not.toBe(id2);
    });

    it("should assign timestamp to published events", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "login", handler);

      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", {});
      await bus.publish(event);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      );
    });

    it("should update statistics on publish", async () => {
      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", {});
      await bus.publish(event);

      const stats = bus.getStats();
      expect(stats.totalPublished).toBe(1);
      expect(stats.eventsByChannel[SecurityChannel.AUTH]).toBe(1);
    });

    it("should log audit entry when audit logging enabled", async () => {
      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", {});
      await bus.publish(event);

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Security event",
        expect.objectContaining({
          channel: SecurityChannel.AUTH,
          type: "login",
        })
      );
    });

    it("should not log audit entry when audit logging disabled", async () => {
      const noAuditBus = new SecurityEventBus({
        logger: mockLogger,
        enableAuditLogging: false,
      });

      const event = noAuditBus.createEvent(SecurityChannel.AUTH, "login", {}, { source: "test" });
      await noAuditBus.publish(event);

      expect(mockLogger.info).not.toHaveBeenCalledWith(
        "Security event",
        expect.any(Object)
      );
    });
  });

  // ==========================================================================
  // Event Subscription Tests
  // ==========================================================================

  describe("event subscription", () => {
    it("should deliver events to subscribers", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "login", handler);

      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", { test: true });
      await bus.publish(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: SecurityChannel.AUTH,
          type: "login",
          payload: { test: true },
        })
      );
    });

    it("should deliver events to multiple subscribers", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe(SecurityChannel.AUTH, "login", handler1);
      bus.subscribe(SecurityChannel.AUTH, "login", handler2);

      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", {});
      await bus.publish(event);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("should not deliver events to wrong event type", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "logout", handler);

      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", {});
      await bus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should not deliver events to wrong channel", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.ROLES, "login", handler);

      const event = createTestEvent(bus, SecurityChannel.AUTH, "login", {});
      await bus.publish(event);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should return subscription object with unsubscribe", async () => {
      const handler = vi.fn();
      const subscription = bus.subscribe(SecurityChannel.AUTH, "login", handler);

      expect(subscription.id).toMatch(/^sub_\d+$/);
      expect(subscription.channel).toBe(SecurityChannel.AUTH);
      expect(subscription.eventType).toBe("login");
      expect(subscription.active).toBe(true);
      expect(typeof subscription.unsubscribe).toBe("function");
    });

    it("should stop receiving events after unsubscribe", async () => {
      const handler = vi.fn();
      const subscription = bus.subscribe(SecurityChannel.AUTH, "login", handler);

      // First event should be received
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      expect(handler).toHaveBeenCalledTimes(1);

      // Unsubscribe
      subscription.unsubscribe();
      expect(subscription.active).toBe(false);

      // Second event should not be received
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Wildcard Subscription Tests
  // ==========================================================================

  describe("wildcard subscriptions", () => {
    it("should deliver all events in channel with wildcard subscription", async () => {
      const handler = vi.fn();
      bus.subscribeToChannel(SecurityChannel.AUTH, handler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "logout", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "token_refresh", {}));

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it("should not deliver events from other channels with channel subscription", async () => {
      const handler = vi.fn();
      bus.subscribeToChannel(SecurityChannel.AUTH, handler);

      await bus.publish(createTestEvent(bus, SecurityChannel.ROLES, "role_assigned", {}));

      expect(handler).not.toHaveBeenCalled();
    });

    it("should deliver all events with subscribeToAll", async () => {
      const handler = vi.fn();
      bus.subscribeToAll(handler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.ROLES, "role_assigned", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.THREATS, "threat_detected", {}));

      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  // ==========================================================================
  // Subscription Options Tests
  // ==========================================================================

  describe("subscription options", () => {
    it("should filter events by priority", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "*", handler, {
        minPriority: EventPriority.HIGH,
      });

      // Low priority - should not be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", {}, {
          source: "test",
          priority: EventPriority.LOW,
        })
      );
      expect(handler).not.toHaveBeenCalled();

      // High priority - should be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", {}, {
          source: "test",
          priority: EventPriority.HIGH,
        })
      );
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should filter events by guild ID", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "*", handler, {
        guildId: "guild-123",
      });

      // Wrong guild - should not be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", {}, {
          source: "test",
          guildId: "guild-456",
        })
      );
      expect(handler).not.toHaveBeenCalled();

      // Correct guild - should be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", {}, {
          source: "test",
          guildId: "guild-123",
        })
      );
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should filter events by correlation ID", async () => {
      const handler = vi.fn();
      const correlationId = bus.generateCorrelationId();

      bus.subscribe(SecurityChannel.AUTH, "*", handler, { correlationId });

      // Wrong correlation - should not be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", {}, { source: "test" })
      );
      expect(handler).not.toHaveBeenCalled();

      // Correct correlation - should be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", {}, {
          source: "test",
          correlationId,
        })
      );
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("should apply custom filter function", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "*", handler, {
        filter: (event) => (event.payload as { important?: boolean }).important === true,
      });

      // Not important - should not be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", { important: false }, { source: "test" })
      );
      expect(handler).not.toHaveBeenCalled();

      // Important - should be delivered
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", { important: true }, { source: "test" })
      );
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // Async Handler Tests
  // ==========================================================================

  describe("async handlers", () => {
    it("should handle async handlers", async () => {
      let completed = false;
      const handler: EventHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        completed = true;
      };

      bus.subscribe(SecurityChannel.AUTH, "login", handler);
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      expect(completed).toBe(true);
    });

    it("should handle handler timeouts", async () => {
      const timeoutBus = new SecurityEventBus({
        logger: mockLogger,
        defaultHandlerTimeoutMs: 50,
      });

      const slowHandler: EventHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      };

      timeoutBus.subscribe(SecurityChannel.AUTH, "login", slowHandler);
      await timeoutBus.publish(
        timeoutBus.createEvent(SecurityChannel.AUTH, "login", {}, { source: "test" })
      );

      // Should have logged error
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Event delivery failed",
        expect.objectContaining({
          error: expect.stringContaining("timeout"),
        })
      );
    });
  });

  // ==========================================================================
  // Publish And Wait Tests
  // ==========================================================================

  describe("publishAndWait", () => {
    it("should return delivery results", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe(SecurityChannel.AUTH, "login", handler1);
      bus.subscribe(SecurityChannel.AUTH, "login", handler2);

      const result = await bus.publishAndWait(
        createTestEvent(bus, SecurityChannel.AUTH, "login", {})
      );

      expect(result.eventId).toMatch(/^evt_/);
      expect(result.delivered).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should count failed handlers", async () => {
      const goodHandler = vi.fn();
      const badHandler = vi.fn().mockRejectedValue(new Error("Handler error"));

      bus.subscribe(SecurityChannel.AUTH, "login", goodHandler);
      bus.subscribe(SecurityChannel.AUTH, "login", badHandler);

      const result = await bus.publishAndWait(
        createTestEvent(bus, SecurityChannel.AUTH, "login", {})
      );

      expect(result.delivered).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  // ==========================================================================
  // Event Replay Tests
  // ==========================================================================

  describe("event replay", () => {
    it("should store events in replay buffer", async () => {
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", { id: 1 }));
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", { id: 2 }));

      const buffer = bus.getReplayBuffer();
      expect(buffer).toHaveLength(2);
    });

    it("should replay events to current subscribers", async () => {
      // Publish events before subscribing
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", { id: 1 }));
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", { id: 2 }));

      // Subscribe after events
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "login", handler);

      // Replay events
      const result = await bus.replay();

      expect(result.replayed).toBe(2);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("should filter replay events", async () => {
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", { important: false }));
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", { important: true }));

      const buffer = bus.getReplayBuffer(
        (e) => (e.payload as { important: boolean }).important === true
      );

      expect(buffer).toHaveLength(1);
    });

    it("should limit replay buffer size", async () => {
      const smallBus = new SecurityEventBus({ maxReplayBufferSize: 3 });

      for (let i = 0; i < 5; i++) {
        await smallBus.publish(
          smallBus.createEvent(SecurityChannel.AUTH, "login", { id: i }, { source: "test" })
        );
      }

      const buffer = smallBus.getReplayBuffer();
      expect(buffer).toHaveLength(3);
      // Should have most recent events
      expect((buffer[0].payload as { id: number }).id).toBe(2);
    });

    it("should clear replay buffer", async () => {
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      bus.clearReplayBuffer();

      expect(bus.getReplayBuffer()).toHaveLength(0);
    });
  });

  // ==========================================================================
  // Dead Letter Queue Tests
  // ==========================================================================

  describe("dead letter queue", () => {
    it("should add failed events to dead letter queue", async () => {
      const badHandler = vi.fn().mockRejectedValue(new Error("Handler error"));
      bus.subscribe(SecurityChannel.AUTH, "login", badHandler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      const dlq = bus.getDeadLetterQueue();
      expect(dlq).toHaveLength(1);
      expect(dlq[0].error).toBe("Handler error");
    });

    it("should include handler ID in dead letter entry", async () => {
      const badHandler = vi.fn().mockRejectedValue(new Error("Fail"));
      bus.subscribe(SecurityChannel.AUTH, "login", badHandler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      const dlq = bus.getDeadLetterQueue();
      expect(dlq[0].handlerId).toMatch(/^sub_\d+$/);
    });

    it("should track retry count", async () => {
      const badHandler = vi.fn().mockRejectedValue(new Error("Fail"));
      bus.subscribe(SecurityChannel.AUTH, "login", badHandler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      const dlq = bus.getDeadLetterQueue();
      expect(dlq[0].retryCount).toBe(0);
    });

    it("should retry dead letter entries", async () => {
      // First, create a failing handler
      const failingHandler = vi.fn().mockRejectedValueOnce(new Error("Fail"));
      bus.subscribe(SecurityChannel.AUTH, "login", failingHandler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      expect(bus.getDeadLetterQueue()).toHaveLength(1);

      // Now handler will succeed
      failingHandler.mockResolvedValueOnce(undefined);

      // Retry
      const success = await bus.retryDeadLetter(0);
      expect(success).toBe(true);
      expect(bus.getDeadLetterQueue()).toHaveLength(0);
    });

    it("should return false for invalid dead letter index", async () => {
      const success = await bus.retryDeadLetter(999);
      expect(success).toBe(false);
    });

    it("should clear dead letter queue", async () => {
      const badHandler = vi.fn().mockRejectedValue(new Error("Fail"));
      bus.subscribe(SecurityChannel.AUTH, "login", badHandler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      bus.clearDeadLetterQueue();

      expect(bus.getDeadLetterQueue()).toHaveLength(0);
    });

    it("should limit dead letter queue size", async () => {
      const smallDLQBus = new SecurityEventBus({
        maxDeadLetterSize: 2,
        logger: mockLogger,
      });

      const badHandler = vi.fn().mockRejectedValue(new Error("Fail"));
      smallDLQBus.subscribe(SecurityChannel.AUTH, "login", badHandler);

      for (let i = 0; i < 5; i++) {
        await smallDLQBus.publish(
          smallDLQBus.createEvent(SecurityChannel.AUTH, "login", { id: i }, { source: "test" })
        );
      }

      expect(smallDLQBus.getDeadLetterQueue()).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Correlation ID Tests
  // ==========================================================================

  describe("correlation tracking", () => {
    it("should generate unique correlation IDs", () => {
      const id1 = bus.generateCorrelationId();
      const id2 = bus.generateCorrelationId();

      expect(id1).toMatch(/^cor_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it("should track events by correlation ID", async () => {
      const correlationId = bus.generateCorrelationId();

      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "login", { step: 1 }, {
          source: "test",
          correlationId,
        })
      );
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "validate", { step: 2 }, {
          source: "test",
          correlationId,
        })
      );
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "complete", { step: 3 }, {
          source: "test",
          correlationId,
        })
      );

      // Publish unrelated event
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "other", {}));

      const correlated = bus.getEventsByCorrelationId(correlationId);
      expect(correlated).toHaveLength(3);
    });

    it("should include child events with parent correlation ID", async () => {
      const parentCorrelationId = bus.generateCorrelationId();
      const childCorrelationId = bus.generateCorrelationId();

      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "parent", {}, {
          source: "test",
          correlationId: parentCorrelationId,
        })
      );
      await bus.publish(
        bus.createEvent(SecurityChannel.AUTH, "child", {}, {
          source: "test",
          correlationId: childCorrelationId,
          parentCorrelationId,
        })
      );

      const correlated = bus.getEventsByCorrelationId(parentCorrelationId);
      expect(correlated).toHaveLength(2);
    });
  });

  // ==========================================================================
  // Statistics Tests
  // ==========================================================================

  describe("statistics", () => {
    it("should track total published events", async () => {
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.ROLES, "assign", {}));

      const stats = bus.getStats();
      expect(stats.totalPublished).toBe(2);
    });

    it("should track events by channel", async () => {
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "logout", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.ROLES, "assign", {}));

      const stats = bus.getStats();
      expect(stats.eventsByChannel[SecurityChannel.AUTH]).toBe(2);
      expect(stats.eventsByChannel[SecurityChannel.ROLES]).toBe(1);
    });

    it("should track total delivered events", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe(SecurityChannel.AUTH, "login", handler1);
      bus.subscribe(SecurityChannel.AUTH, "login", handler2);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      const stats = bus.getStats();
      expect(stats.totalDelivered).toBe(2);
    });

    it("should track active subscriptions", () => {
      bus.subscribe(SecurityChannel.AUTH, "login", vi.fn());
      bus.subscribe(SecurityChannel.AUTH, "logout", vi.fn());
      bus.subscribe(SecurityChannel.ROLES, "*", vi.fn());

      const stats = bus.getStats();
      expect(stats.activeSubscriptions).toBe(3);
    });

    it("should calculate average delivery time", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "login", handler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      const stats = bus.getStats();
      expect(stats.avgDeliveryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it("should reset statistics", async () => {
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));
      bus.resetStats();

      const stats = bus.getStats();
      expect(stats.totalPublished).toBe(0);
      expect(stats.totalDelivered).toBe(0);
    });
  });

  // ==========================================================================
  // Create Event Helper Tests
  // ==========================================================================

  describe("createEvent helper", () => {
    it("should create event with all required fields", () => {
      const event = bus.createEvent(SecurityChannel.AUTH, "login", { test: true }, {
        source: "test",
        guildId: "guild-123",
        userId: "user-456",
      });

      expect(event.channel).toBe(SecurityChannel.AUTH);
      expect(event.type).toBe("login");
      expect(event.payload).toEqual({ test: true });
      expect(event.source).toBe("test");
      expect(event.guildId).toBe("guild-123");
      expect(event.userId).toBe("user-456");
      expect(event.correlationId).toMatch(/^cor_/);
      expect(event.priority).toBe(EventPriority.NORMAL);
    });

    it("should allow priority override", () => {
      const event = bus.createEvent(SecurityChannel.THREATS, "detected", {}, {
        source: "test",
        priority: EventPriority.CRITICAL,
      });

      expect(event.priority).toBe(EventPriority.CRITICAL);
    });
  });

  // ==========================================================================
  // Typed Event Helper Tests
  // ==========================================================================

  describe("typed event helpers", () => {
    describe("createAuthEvent", () => {
      it("should create auth event", () => {
        const payload: AuthEventPayload = {
          action: "login",
          success: true,
        };
        const event = createAuthEvent(bus, payload, { source: "test" });

        expect(event.channel).toBe(SecurityChannel.AUTH);
        expect(event.type).toBe("login");
        expect(event.payload).toEqual(payload);
      });
    });

    describe("createRoleEvent", () => {
      it("should create role event", () => {
        const payload: RoleEventPayload = {
          action: "role_assigned",
          roleId: "role-123",
          roleName: "Admin",
          targetUserId: "user-456",
        };
        const event = createRoleEvent(bus, payload, { source: "test" });

        expect(event.channel).toBe(SecurityChannel.ROLES);
        expect(event.type).toBe("role_assigned");
        expect(event.payload).toEqual(payload);
      });
    });

    describe("createThreatEvent", () => {
      it("should create threat event with appropriate priority", () => {
        const criticalPayload: ThreatEventPayload = {
          threatType: "injection",
          severity: "critical",
          indicators: ["sql"],
          mitigated: false,
        };
        const criticalEvent = createThreatEvent(bus, criticalPayload, { source: "test" });
        expect(criticalEvent.priority).toBe(EventPriority.CRITICAL);

        const lowPayload: ThreatEventPayload = {
          threatType: "scan",
          severity: "low",
          indicators: ["port_scan"],
          mitigated: true,
        };
        const lowEvent = createThreatEvent(bus, lowPayload, { source: "test" });
        expect(lowEvent.priority).toBe(EventPriority.LOW);
      });
    });
  });

  // ==========================================================================
  // Enum Tests
  // ==========================================================================

  describe("SecurityChannel enum", () => {
    it("should have all expected channels", () => {
      expect(SecurityChannel.AUTH).toBe("auth");
      expect(SecurityChannel.ROLES).toBe("roles");
      expect(SecurityChannel.THREATS).toBe("threats");
      expect(SecurityChannel.AUDIT).toBe("audit");
      expect(SecurityChannel.CONFIG).toBe("config");
      expect(SecurityChannel.RATE_LIMIT).toBe("rate_limit");
      expect(SecurityChannel.ACTIVITY).toBe("activity");
      expect(SecurityChannel.HEALTH).toBe("health");
      expect(SecurityChannel.ALL).toBe("*");
    });
  });

  describe("EventPriority enum", () => {
    it("should have correct priority values", () => {
      expect(EventPriority.LOW).toBe(0);
      expect(EventPriority.NORMAL).toBe(1);
      expect(EventPriority.HIGH).toBe(2);
      expect(EventPriority.CRITICAL).toBe(3);
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("should handle sync handlers", async () => {
      let called = false;
      const syncHandler: EventHandler = () => {
        called = true;
      };

      bus.subscribe(SecurityChannel.AUTH, "login", syncHandler);
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      expect(called).toBe(true);
    });

    it("should handle empty payload", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "login", handler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", undefined));

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ payload: undefined })
      );
    });

    it("should handle null metadata", async () => {
      const handler = vi.fn();
      bus.subscribe(SecurityChannel.AUTH, "login", handler);

      const event = bus.createEvent(SecurityChannel.AUTH, "login", {}, {
        source: "test",
        metadata: undefined as unknown as Record<string, unknown>,
      });
      await bus.publish(event);

      expect(handler).toHaveBeenCalled();
    });

    it("should handle unsubscribe during event delivery", async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn(() => {
        subscription1.unsubscribe();
      });

      const subscription1 = bus.subscribe(SecurityChannel.AUTH, "login", handler1);
      bus.subscribe(SecurityChannel.AUTH, "login", handler2);

      // Handler1 executes first, handler2 unsubscribes handler1
      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      // Both handlers should have been called this time
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("should continue delivery after handler error", async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error("Fail"));
      const successHandler = vi.fn();

      bus.subscribe(SecurityChannel.AUTH, "login", errorHandler);
      bus.subscribe(SecurityChannel.AUTH, "login", successHandler);

      await bus.publish(createTestEvent(bus, SecurityChannel.AUTH, "login", {}));

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });

    it("should handle manual unsubscribe method", () => {
      const handler = vi.fn();
      const subscription = bus.subscribe(SecurityChannel.AUTH, "login", handler);

      const result = bus.unsubscribe(SecurityChannel.AUTH, "login", subscription.id);
      expect(result).toBe(true);

      const resultAgain = bus.unsubscribe(SecurityChannel.AUTH, "login", subscription.id);
      expect(resultAgain).toBe(false);
    });

    it("should return false for unsubscribe with invalid channel", () => {
      const result = bus.unsubscribe("invalid" as SecurityChannel, "type", "id");
      expect(result).toBe(false);
    });
  });
});
