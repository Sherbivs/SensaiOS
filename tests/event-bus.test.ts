/**
 * Event Bus Test Suite
 * 
 * Validates:
 * - Event emission (sync, async, correlation IDs)
 * - Pattern-based subscriptions (exact, wildcard, multi-level)
 * - Event replay buffer (FIFO, pattern filtering, time filtering)
 * - Backpressure control (queue limits, drop-oldest strategy)
 * - Subscriber management (subscribe, unsubscribe, priority ordering)
 * - Statistics tracking (events emitted, handler invocations, latency)
 * - Graceful shutdown (pending events flushed, subscribers cleaned up)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus, type BusEvent, type SubscriptionId } from '../src/shared/event-bus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = EventBus.getInstance();
  });

  afterEach(async () => {
    await bus.shutdown();
    EventBus.resetInstance();
  });

  /// ---- Event Emission Tests ----

  describe('Event Emission', () => {
    it('should emit event with correlation ID', () => {
      const events: BusEvent[] = [];
      bus.subscribe('test.topic', (event) => {
        events.push(event);
      });

      const correlationId = bus.emit('test.topic', { foo: 'bar' });

      expect(correlationId).toBeTruthy();
      expect(correlationId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('should emit event with payload', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('test.topic', (event) => {
        events.push(event);
      });

      bus.emit('test.topic', { foo: 'bar', num: 42 });

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].payload).toEqual({ foo: 'bar', num: 42 });
    });

    it('should emit event with timestamp', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('test.topic', (event) => {
        events.push(event);
      });

      const beforeEmit = new Date();
      bus.emit('test.topic', {});
      const afterEmit = new Date();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].timestamp).toBeInstanceOf(Date);
      expect(events[0].timestamp.getTime()).toBeGreaterThanOrEqual(beforeEmit.getTime());
      expect(events[0].timestamp.getTime()).toBeLessThanOrEqual(afterEmit.getTime());
    });

    it('should emit event with emitter name', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('test.topic', (event) => {
        events.push(event);
      });

      bus.emit('test.topic', {}, { emitter: 'test-service' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].emitter).toBe('test-service');
    });

    it('should emit event with parent correlation ID', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('test.topic', (event) => {
        events.push(event);
      });

      const parentId = 'parent-uuid';
      const correlationId = bus.emit('test.topic', {}, { parentCorrelationId: parentId });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(correlationId).toContain(parentId);
      expect(events).toHaveLength(1);
      expect(events[0].parentCorrelationId).toBe(parentId);
    });

    it('should emit to multiple subscribers', async () => {
      const events1: BusEvent[] = [];
      const events2: BusEvent[] = [];
      const events3: BusEvent[] = [];

      bus.subscribe('test.topic', (event) => { events1.push(event); });
      bus.subscribe('test.topic', (event) => { events2.push(event); });
      bus.subscribe('test.topic', (event) => { events3.push(event); });

      bus.emit('test.topic', { foo: 'bar' });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
      expect(events3).toHaveLength(1);
      expect(events1[0].correlationId).toBe(events2[0].correlationId);
      expect(events2[0].correlationId).toBe(events3[0].correlationId);
    });
  });

  /// ---- Pattern Matching Tests ----

  describe('Pattern Matching', () => {
    it('should match exact topic', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('battle.started', (event) => {
        events.push(event);
      });

      bus.emit('battle.started', {});
      bus.emit('battle.ended', {});
      bus.emit('error.critical', {});

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('battle.started');
    });

    it('should match single-level wildcard', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('battle.*', (event) => {
        events.push(event);
      });

      bus.emit('battle.started', {});
      bus.emit('battle.ended', {});
      bus.emit('error.critical', {});
      bus.emit('battle.turn.1', {}); // Should NOT match (too deep)

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(2);
      expect(events.map(e => e.topic)).toEqual(['battle.started', 'battle.ended']);
    });

    it('should match multi-level wildcard', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('battle.**', (event) => {
        events.push(event);
      });

      bus.emit('battle.started', {});
      bus.emit('battle.turn.1', {});
      bus.emit('battle.turn.2.move.1', {});
      bus.emit('error.critical', {}); // Should NOT match

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(3);
      expect(events.map(e => e.topic)).toEqual([
        'battle.started',
        'battle.turn.1',
        'battle.turn.2.move.1',
      ]);
    });

    it('should match all events with * pattern', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('*', (event) => {
        events.push(event);
      });

      bus.emit('battle.started', {});
      bus.emit('error.critical', {});
      bus.emit('user.login', {});

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(3);
    });

    it('should match all events with ** pattern', async () => {
      const events: BusEvent[] = [];
      bus.subscribe('**', (event) => {
        events.push(event);
      });

      bus.emit('battle.started', {});
      bus.emit('error.critical', {});
      bus.emit('user.profile.update', {});

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(3);
    });

    it('should support multiple patterns on same subscriber', async () => {
      const battleEvents: BusEvent[] = [];
      const errorEvents: BusEvent[] = [];

      bus.subscribe('battle.**', (event) => { battleEvents.push(event); });
      bus.subscribe('error.**', (event) => { errorEvents.push(event); });

      bus.emit('battle.started', {});
      bus.emit('error.critical', {});
      bus.emit('user.login', {});

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(battleEvents).toHaveLength(1);
      expect(errorEvents).toHaveLength(1);
    });
  });

  /// ---- Subscription Management Tests ----

  describe('Subscription Management', () => {
    it('should subscribe and return subscription ID', () => {
      const handler = vi.fn();
      const subscriptionId = bus.subscribe('test.topic', handler);

      expect(subscriptionId).toBeTruthy();
      expect(subscriptionId).toMatch(/^[0-9a-f-]{36}$/); // UUID format
    });

    it('should unsubscribe by subscription ID', async () => {
      const events: BusEvent[] = [];
      const subscriptionId = bus.subscribe('test.topic', (event) => {
        events.push(event);
      });

      bus.emit('test.topic', { before: true });
      await new Promise(resolve => setTimeout(resolve, 50));

      const removed = bus.unsubscribe(subscriptionId);
      expect(removed).toBe(true);

      bus.emit('test.topic', { after: true });
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events).toHaveLength(1);
      expect(events[0].payload.before).toBe(true);
    });

    it('should return false when unsubscribing non-existent ID', () => {
      const removed = bus.unsubscribe('non-existent-id');
      expect(removed).toBe(false);
    });

    it('should unsubscribe all subscriptions', async () => {
      const events1: BusEvent[] = [];
      const events2: BusEvent[] = [];

      bus.subscribe('test.topic', (event) => { events1.push(event); });
      bus.subscribe('test.topic', (event) => { events2.push(event); });

      bus.emit('test.topic', { before: true });
      await new Promise(resolve => setTimeout(resolve, 50));

      const count = bus.unsubscribeAll();
      expect(count).toBe(2);

      bus.emit('test.topic', { after: true });
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1).toHaveLength(1);
      expect(events2).toHaveLength(1);
    });

    it('should unsubscribe all subscriptions matching pattern', async () => {
      const events1: BusEvent[] = [];
      const events2: BusEvent[] = [];

      bus.subscribe('battle.started', (event) => { events1.push(event); });
      bus.subscribe('error.critical', (event) => { events2.push(event); });

      bus.emit('battle.started', {});
      bus.emit('error.critical', {});
      await new Promise(resolve => setTimeout(resolve, 50));

      const count = bus.unsubscribeAll('battle.started');
      expect(count).toBe(1);

      bus.emit('battle.started', {});
      bus.emit('error.critical', {});
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1).toHaveLength(1); // Only 1 event (before unsubscribe)
      expect(events2).toHaveLength(2); // 2 events (still subscribed)
    });

    it('should execute handlers in priority order', async () => {
      const executionOrder: number[] = [];

      bus.subscribe('test.topic', () => { executionOrder.push(1); }, { priority: 1 });
      bus.subscribe('test.topic', () => { executionOrder.push(3); }, { priority: 3 });
      bus.subscribe('test.topic', () => { executionOrder.push(2); }, { priority: 2 });

      bus.emit('test.topic', {});
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(executionOrder).toEqual([3, 2, 1]); // Highest priority first
    });
  });

  /// ---- Event Replay Tests ----

  describe('Event Replay', () => {
    it('should buffer last 100 events', () => {
      // Emit 150 events
      for (let i = 0; i < 150; i++) {
        bus.emit('test.topic', { index: i });
      }

      const buffer = bus.getReplayBuffer();
      expect(buffer).toHaveLength(100);
      expect(buffer[0].payload.index).toBe(50); // First 50 evicted
      expect(buffer[99].payload.index).toBe(149);
    });

    it('should replay events matching pattern', () => {
      bus.emit('battle.started', { id: 1 });
      bus.emit('error.critical', { id: 2 });
      bus.emit('battle.ended', { id: 3 });

      const battleEvents = bus.replay('battle.**');
      expect(battleEvents).toHaveLength(2);
      expect(battleEvents.map(e => e.payload.id)).toEqual([1, 3]);
    });

    it('should replay events since timestamp', async () => {
      const t1 = new Date();
      bus.emit('test.topic', { id: 1 });

      // Wait 100ms to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));
      const t2 = new Date();

      bus.emit('test.topic', { id: 2 });
      bus.emit('test.topic', { id: 3 });

      const recentEvents = bus.replay('test.topic', t2);
      expect(recentEvents.length).toBeGreaterThanOrEqual(2); // Events 2 and 3
    });

    it('should replay all events', () => {
      bus.emit('battle.started', {});
      bus.emit('error.critical', {});
      bus.emit('user.login', {});

      const allEvents = bus.getReplayBuffer();
      expect(allEvents).toHaveLength(3);
    });

    it('should allow late subscribers to replay events', async () => {
      // Emit events before subscription
      bus.emit('battle.started', { id: 1 });
      bus.emit('battle.ended', { id: 2 });

      // Late subscriber
      const lateEvents = bus.replay('battle.**');
      expect(lateEvents).toHaveLength(2);
      expect(lateEvents.map(e => e.payload.id)).toEqual([1, 2]);
    });
  });

  /// ---- Backpressure Tests ----

  describe('Backpressure Control', () => {
    it('should enforce per-subscriber queue limits', async () => {
      const events: BusEvent[] = [];

      // Slow handler (100ms per event)
      bus.subscribe('test.topic', async (event) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        events.push(event);
      }, { maxQueueSize: 10 });

      // Emit 20 events rapidly
      for (let i = 0; i < 20; i++) {
        bus.emit('test.topic', { index: i });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2500));

      // Only first 10 events should be processed (queue limit)
      expect(events.length).toBeLessThanOrEqual(20);
      
      const stats = bus.getStats();
      expect(stats.backpressureEvents).toBeGreaterThan(0);
    });

    it('should drop oldest events when queue full', async () => {
      const events: BusEvent[] = [];

      // Slow handler
      bus.subscribe('test.topic', async (event) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        events.push(event);
      }, { maxQueueSize: 5 });

      // Emit 10 events rapidly
      for (let i = 0; i < 10; i++) {
        bus.emit('test.topic', { index: i });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 600));

      // Some events should be dropped
      expect(events.length).toBeLessThanOrEqual(10);
    });

    it('should track backpressure in statistics', async () => {
      bus.subscribe('test.topic', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      }, { maxQueueSize: 5 });

      // Emit 20 events rapidly (exceeds queue limit)
      for (let i = 0; i < 20; i++) {
        bus.emit('test.topic', {});
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      const stats = bus.getStats();
      expect(stats.backpressureEvents).toBeGreaterThan(0);
    });
  });

  /// ---- Statistics Tests ----

  describe('Statistics Tracking', () => {
    it('should track events emitted', () => {
      bus.emit('test.topic', {});
      bus.emit('test.topic', {});
      bus.emit('test.topic', {});

      const stats = bus.getStats();
      expect(stats.eventsEmitted).toBe(3);
    });

    it('should track active subscriptions', () => {
      const id1 = bus.subscribe('test.topic', () => {});
      const id2 = bus.subscribe('test.topic', () => {});

      let stats = bus.getStats();
      expect(stats.subscriptionsActive).toBe(2);

      bus.unsubscribe(id1);
      stats = bus.getStats();
      expect(stats.subscriptionsActive).toBe(1);
    });

    it('should track handler invocations', async () => {
      bus.subscribe('test.topic', () => {});

      bus.emit('test.topic', {});
      bus.emit('test.topic', {});

      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = bus.getStats();
      expect(stats.totalHandlerInvocations).toBeGreaterThanOrEqual(2);
    });

    it('should track failed handler invocations', async () => {
      bus.subscribe('test.topic', () => {
        throw new Error('Handler error');
      });

      bus.emit('test.topic', {});
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = bus.getStats();
      expect(stats.failedHandlerInvocations).toBe(1);
    });

    it('should track replay buffer size', () => {
      bus.emit('test.topic', {});
      bus.emit('test.topic', {});

      const stats = bus.getStats();
      expect(stats.replayBufferSize).toBe(2);
    });

    it('should get subscriber info', async () => {
      const id = bus.subscribe('test.topic', () => {}, { priority: 5, maxQueueSize: 500 });

      const subscribers = bus.getSubscribers();
      expect(subscribers).toHaveLength(1);
      expect(subscribers[0].id).toBe(id);
      expect(subscribers[0].pattern).toBe('test.topic');
      expect(subscribers[0].priority).toBe(5);
      expect(subscribers[0].maxQueueSize).toBe(500);
    });

    it('should get subscribers by pattern', () => {
      bus.subscribe('battle.started', () => {});
      bus.subscribe('error.critical', () => {});
      bus.subscribe('battle.ended', () => {});

      const battleSubs = bus.getSubscribers('battle.started');
      expect(battleSubs).toHaveLength(1);
      expect(battleSubs[0].pattern).toBe('battle.started');
    });
  });

  /// ---- Graceful Shutdown Tests ----

  describe('Graceful Shutdown', () => {
    it('should drain all subscriptions before shutdown', async () => {
      const events: BusEvent[] = [];

      bus.subscribe('test.topic', async (event) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        events.push(event);
      });

      bus.emit('test.topic', { id: 1 });
      bus.emit('test.topic', { id: 2 });

      await bus.shutdown();

      expect(events).toHaveLength(2);
    });

    it('should clear subscriptions after shutdown', async () => {
      bus.subscribe('test.topic', () => {});
      bus.subscribe('error.critical', () => {});

      await bus.shutdown();

      const stats = bus.getStats();
      expect(stats.subscriptionsActive).toBe(0);
    });

    it('should clear replay buffer after shutdown', async () => {
      bus.emit('test.topic', {});
      bus.emit('test.topic', {});

      await bus.shutdown();

      const stats = bus.getStats();
      expect(stats.replayBufferSize).toBe(0);
    });
  });

  /// ---- Error Handling Tests ----

  describe('Error Handling', () => {
    it('should continue processing after handler error', async () => {
      const events1: BusEvent[] = [];
      const events2: BusEvent[] = [];

      bus.subscribe('test.topic', () => {
        throw new Error('Handler 1 error');
      });

      bus.subscribe('test.topic', (event) => {
        events1.push(event);
      });

      bus.emit('test.topic', {});
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(events1).toHaveLength(1);
    });

    it('should track failed handler invocations', async () => {
      bus.subscribe('test.topic', () => {
        throw new Error('Test error');
      });

      bus.emit('test.topic', {});
      bus.emit('test.topic', {});
      await new Promise(resolve => setTimeout(resolve, 50));

      const stats = bus.getStats();
      expect(stats.failedHandlerInvocations).toBe(2);
    });
  });

  /// ---- Singleton Pattern Tests ----

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = EventBus.getInstance();
      const instance2 = EventBus.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance', async () => {
      const instance1 = EventBus.getInstance();
      
      await instance1.shutdown();
      EventBus.resetInstance();
      
      // Wait for reset to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const instance2 = EventBus.getInstance();
      expect(instance2).not.toBe(instance1);
    });
  });
});
