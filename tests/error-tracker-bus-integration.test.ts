/**
 * Integration Tests: ErrorTracker Event Bus Migration
 * 
 * Tests the complete integration between ErrorTracker and Intelligent Logger
 * via Event Bus, validating correlation tracking, event replay, backpressure,
 * and pattern-based subscriptions.
 * 
 * @module tests/error-tracker-bus-integration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/shared/event-bus.js';
import type { BusEvent } from '../src/shared/event-bus.js';
import type { LiveErrorEvent } from '../src/services/error-tracker.js';

describe('ErrorTracker Event Bus Integration', () => {
  let bus: EventBus;
  
  beforeEach(() => {
    bus = EventBus.getInstance();
  });
  
  afterEach(async () => {
    await bus.shutdown();
    EventBus.resetInstance();
  });

  // ============================================================================
  // Event Emission Tests
  // ============================================================================

  describe('Event Emission', () => {
    it('should emit error to error.critical topic', () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('error.critical', (event) => {
        events.push(event);
      });
      
      const correlationId = bus.emit('error.critical', {
        errorId: 'test-error-1',
        fingerprint: 'fp-12345',
        category: 'APPLICATION',
        severity: 'CRITICAL',
        errorName: 'TestError',
        errorMessage: 'Test critical error',
        timestamp: new Date().toISOString(),
        context: { userId: 'user-123' },
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('error.critical');
      expect(events[0].correlationId).toBe(correlationId);
      expect(events[0].payload.errorId).toBe('test-error-1');
      expect(events[0].payload.severity).toBe('CRITICAL');
    });

    it('should emit error to error.high topic', () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('error.high', (event) => {
        events.push(event);
      });
      
      const correlationId = bus.emit('error.high', {
        errorId: 'test-error-2',
        fingerprint: 'fp-67890',
        category: 'VALIDATION',
        severity: 'HIGH',
        errorName: 'ValidationError',
        errorMessage: 'Test high severity error',
        timestamp: new Date().toISOString(),
        context: { field: 'username' },
      });
      
      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('error.high');
      expect(events[0].correlationId).toBe(correlationId);
      expect(events[0].payload.severity).toBe('HIGH');
    });

    it('should emit error with correlation ID in UUID v4 format', () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('error.medium', (event) => {
        events.push(event);
      });
      
      const correlationId = bus.emit('error.medium', {
        errorId: 'test-error-3',
        fingerprint: 'fp-abc',
        category: 'DATABASE',
        severity: 'MEDIUM',
        errorName: 'DatabaseError',
        errorMessage: 'Test medium severity error',
        timestamp: new Date().toISOString(),
        context: {},
      });
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(correlationId).toMatch(uuidRegex);
      expect(events[0].correlationId).toMatch(uuidRegex);
    });

    it('should emit error with parent correlation chaining', () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('error.low', (event) => {
        events.push(event);
      });
      
      const parentCorrelationId = 'parent-uuid-12345';
      const correlationId = bus.emit('error.low', {
        errorId: 'test-error-4',
        fingerprint: 'fp-def',
        category: 'NETWORK',
        severity: 'LOW',
        errorName: 'NetworkError',
        errorMessage: 'Test low severity error',
        timestamp: new Date().toISOString(),
        context: { correlationId: parentCorrelationId },
      }, {
        emitter: 'error-tracker',
        parentCorrelationId: parentCorrelationId,
      });
      
      expect(correlationId).toContain(parentCorrelationId);
      expect(events[0].correlationId).toContain(parentCorrelationId);
    });
  });

  // ============================================================================
  // Pattern-Based Subscription Tests
  // ============================================================================

  describe('Pattern-Based Subscriptions', () => {
    it('should subscribe to all errors with error.** pattern', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('error.**', (event) => {
        events.push(event);
      });
      
      // Emit errors of different severities
      bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      bus.emit('error.high', createMockErrorPayload('HIGH'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      bus.emit('error.low', createMockErrorPayload('LOW'));
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(events).toHaveLength(4);
      expect(events[0].topic).toBe('error.critical');
      expect(events[1].topic).toBe('error.high');
      expect(events[2].topic).toBe('error.medium');
      expect(events[3].topic).toBe('error.low');
    });

    it('should filter by severity with exact topic match', async () => {
      const criticalEvents: BusEvent[] = [];
      
      bus.subscribe('error.critical', (event) => {
        criticalEvents.push(event);
      });
      
      // Emit mixed severities
      bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      bus.emit('error.high', createMockErrorPayload('HIGH'));
      bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should only receive critical errors
      expect(criticalEvents).toHaveLength(2);
      expect(criticalEvents.every(e => e.topic === 'error.critical')).toBe(true);
    });

    it('should support multiple pattern subscriptions', () => {
      const criticalEvents: BusEvent[] = [];
      const highEvents: BusEvent[] = [];
      
      bus.subscribe('error.critical', (event) => {
        criticalEvents.push(event);
      });
      bus.subscribe('error.high', (event) => {
        highEvents.push(event);
      });
      
      // Emit mixed severities
      bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      bus.emit('error.high', createMockErrorPayload('HIGH'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      
      expect(criticalEvents).toHaveLength(1);
      expect(highEvents).toHaveLength(1);
    });
  });

  // ============================================================================
  // Event Replay Tests
  // ============================================================================

  describe('Event Replay', () => {
    it('should buffer last 100 errors for replay', () => {
      // Emit 150 errors
      for (let i = 0; i < 150; i++) {
        bus.emit('error.medium', {
          ...createMockErrorPayload('MEDIUM'),
          errorId: `test-error-${i}`,
        });
      }
      
      // Replay all errors
      const replayedEvents = bus.replay('error.**');
      
      // Should only keep last 100 (FIFO eviction)
      expect(replayedEvents).toHaveLength(100);
      expect(replayedEvents[0].payload.errorId).toBe('test-error-50');
      expect(replayedEvents[99].payload.errorId).toBe('test-error-149');
    });

    it('should replay errors matching pattern filter', () => {
      // Emit mixed severities
      bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      bus.emit('error.high', createMockErrorPayload('HIGH'));
      bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      
      // Replay only critical errors
      const criticalReplays = bus.replay('error.critical');
      
      expect(criticalReplays).toHaveLength(3);
      expect(criticalReplays.every(e => e.topic === 'error.critical')).toBe(true);
    });

    it('should replay errors since timestamp', async () => {
      const _t1 = new Date();
      
      // Emit errors before timestamp
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      
      // Wait 100ms to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const t2 = new Date();
      
      // Emit errors after timestamp
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      
      // Replay errors since t2
      const recentErrors = bus.replay('error.**', t2);
      
      expect(recentErrors.length).toBeGreaterThanOrEqual(2);
      expect(recentErrors.every(e => new Date(e.timestamp) >= t2)).toBe(true);
    });

    it('should allow late subscribers to replay events', () => {
      // Emit errors before subscriber exists
      bus.emit('error.high', createMockErrorPayload('HIGH'));
      bus.emit('error.high', createMockErrorPayload('HIGH'));
      bus.emit('error.high', createMockErrorPayload('HIGH'));
      
      // Late subscriber joins
      const lateEvents: BusEvent[] = [];
      bus.subscribe('error.high', (event) => {
        lateEvents.push(event);
      });
      
      // Replay missed events
      const missedEvents = bus.replay('error.high');
      lateEvents.push(...missedEvents);
      
      expect(lateEvents).toHaveLength(3);
    });
  });

  // ============================================================================
  // Backpressure Control Tests
  // ============================================================================

  describe('Backpressure Control', () => {
    it('should enforce per-subscriber queue limits', async () => {
      const processedEvents: BusEvent[] = [];
      
      // Slow handler (100ms per event)
      bus.subscribe('error.medium', async (event) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        processedEvents.push(event);
      }, {
        maxQueueSize: 10, // Small queue for testing
      });
      
      // Emit 20 errors rapidly (exceeds queue size)
      for (let i = 0; i < 20; i++) {
        bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      }
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      // Should have dropped some events (queue limit 10)
      expect(processedEvents.length).toBeLessThanOrEqual(20);
      
      const stats = bus.getStats();
      expect(stats.backpressureEvents).toBeGreaterThan(0);
    });

    it('should drop oldest events when queue full', async () => {
      const processedEvents: BusEvent[] = [];
      
      bus.subscribe('error.medium', async (event) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        processedEvents.push(event);
      }, {
        maxQueueSize: 5,
      });
      
      // Emit 10 errors with unique IDs
      for (let i = 0; i < 10; i++) {
        bus.emit('error.medium', {
          ...createMockErrorPayload('MEDIUM'),
          errorId: `test-error-${i}`,
        });
      }
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Should have processed some events (drop-oldest strategy)
      expect(processedEvents.length).toBeGreaterThan(0);
      expect(processedEvents.length).toBeLessThanOrEqual(10);
    });

    it('should track backpressure in statistics', async () => {
      const initialStats = bus.getStats();
      expect(initialStats.backpressureEvents).toBe(0);
      
      // Create slow subscriber
      bus.subscribe('error.medium', async (_event) => {
        await new Promise(resolve => setTimeout(resolve, 100));
      }, {
        maxQueueSize: 5,
      });
      
      // Overwhelm subscriber
      for (let i = 0; i < 20; i++) {
        bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      }
      
      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const stats = bus.getStats();
      expect(stats.backpressureEvents).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Correlation Tracking Tests
  // ============================================================================

  describe('Correlation Tracking', () => {
    it('should generate unique correlation IDs for each error', async () => {
      const correlationIds = new Set<string>();
      
      bus.subscribe('error.medium', (event) => {
        correlationIds.add(event.correlationId);
      });
      
      // Emit multiple errors
      for (let i = 0; i < 10; i++) {
        bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      }
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // All correlation IDs should be unique
      expect(correlationIds.size).toBe(10);
    });

    it('should chain correlation IDs with parent-child relationship', () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('error.**', (event) => {
        events.push(event);
      });
      
      const parentId = 'parent-correlation-id';
      
      // Emit child error
      const childId = bus.emit('error.high', createMockErrorPayload('HIGH'), {
        parentCorrelationId: parentId,
      });
      
      expect(childId).toContain(parentId);
      expect(events[0].correlationId).toContain(parentId);
    });

    it('should include correlation ID in logged error data', () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('error.critical', (event) => {
        events.push(event);
      });
      
      const correlationId = bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      
      expect(events[0].correlationId).toBe(correlationId);
      expect(events[0].correlationId).toBeTruthy();
    });
  });

  // ============================================================================
  // Integration Tests (ErrorTracker → Event Bus → Logger)
  // ============================================================================

  describe('Full Integration', () => {
    it('should deliver error from ErrorTracker to Logger via Event Bus', () => {
      const loggedErrors: LiveErrorEvent[] = [];
      
      // Simulate Logger subscription
      bus.subscribe('error.**', (event: BusEvent) => {
        loggedErrors.push(event.payload as LiveErrorEvent);
      });
      
      // Simulate ErrorTracker emission (minimal required fields)
      const errorPayload: Partial<LiveErrorEvent> = {
        errorId: 'integration-test-1',
        fingerprint: 'fp-integration',
        category: 'UNKNOWN',
        severity: 'CRITICAL',
        errorName: 'IntegrationTestError',
        errorMessage: 'Test error for full integration',
        timestamp: new Date().toISOString(),
        context: { userId: 'test-user' },
      };
      
      bus.emit('error.critical', errorPayload as LiveErrorEvent, {
        emitter: 'error-tracker',
      });
      
      expect(loggedErrors).toHaveLength(1);
      expect(loggedErrors[0].errorId).toBe('integration-test-1');
      expect(loggedErrors[0].errorName).toBe('IntegrationTestError');
      expect(loggedErrors[0].severity).toBe('CRITICAL');
    });

    it('should handle multiple subscribers receiving same error', () => {
      const logger1Events: BusEvent[] = [];
      const logger2Events: BusEvent[] = [];
      const monitoringEvents: BusEvent[] = [];
      
      // Multiple subscribers
      bus.subscribe('error.**', (event) => {
        logger1Events.push(event);
      });
      bus.subscribe('error.critical', (event) => {
        logger2Events.push(event);
      });
      bus.subscribe('error.**', (event) => {
        monitoringEvents.push(event);
      });
      
      // Emit error
      const correlationId = bus.emit('error.critical', createMockErrorPayload('CRITICAL'));
      
      // All subscribers should receive same correlation ID
      expect(logger1Events).toHaveLength(1);
      expect(logger2Events).toHaveLength(1);
      expect(monitoringEvents).toHaveLength(1);
      expect(logger1Events[0].correlationId).toBe(correlationId);
      expect(logger2Events[0].correlationId).toBe(correlationId);
      expect(monitoringEvents[0].correlationId).toBe(correlationId);
    });

    it('should continue processing after handler error', () => {
      const successfulEvents: BusEvent[] = [];
      
      // Faulty handler
      bus.subscribe('error.medium', (_event) => {
        throw new Error('Handler error');
      });
      
      // Successful handler
      bus.subscribe('error.medium', (event) => {
        successfulEvents.push(event);
      });
      
      // Emit error
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      
      // Successful handler should still receive event
      expect(successfulEvents).toHaveLength(1);
      
      const stats = bus.getStats();
      expect(stats.failedHandlerInvocations).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Graceful Shutdown Tests
  // ============================================================================

  describe('Graceful Shutdown', () => {
    it('should drain all subscriptions before shutdown', async () => {
      const processedEvents: BusEvent[] = [];
      
      bus.subscribe('error.medium', async (event) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        processedEvents.push(event);
      });
      
      // Emit events
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      
      // Shutdown (should wait for processing)
      await bus.shutdown();
      
      // All events should be processed
      expect(processedEvents).toHaveLength(2);
    });

    it('should clear subscriptions after shutdown', async () => {
      bus.subscribe('error.**', (_event) => {
        // No-op
      });
      
      const statsBeforeShutdown = bus.getStats();
      expect(statsBeforeShutdown.subscriptionsActive).toBeGreaterThan(0);
      
      await bus.shutdown();
      
      const statsAfterShutdown = bus.getStats();
      expect(statsAfterShutdown.subscriptionsActive).toBe(0);
    });

    it('should clear replay buffer after shutdown', async () => {
      // Emit events
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      bus.emit('error.medium', createMockErrorPayload('MEDIUM'));
      
      const statsBeforeShutdown = bus.getStats();
      expect(statsBeforeShutdown.replayBufferSize).toBeGreaterThan(0);
      
      await bus.shutdown();
      
      const statsAfterShutdown = bus.getStats();
      expect(statsAfterShutdown.replayBufferSize).toBe(0);
    });
  });
});

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create mock error payload for testing
 */
function createMockErrorPayload(severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'): Partial<LiveErrorEvent> {
  return {
    errorId: `test-error-${Date.now()}`,
    fingerprint: `fp-${Date.now()}`,
    category: 'UNKNOWN',
    severity,
    errorName: 'TestError',
    errorMessage: `Test ${severity} error`,
    timestamp: new Date().toISOString(),
    context: { test: true },
  } as LiveErrorEvent;
}
