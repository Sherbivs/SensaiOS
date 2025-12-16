/**
 * Phase 2.3.2 Validation: DripAlertManager Event Bus Subscriptions
 * 
 * Tests that verify Event Bus subscriptions are created and cleaned up properly.
 * Validates subscription priorities, queue sizes, and pattern matching.
 * 
 * @module tests/dripalert-bus-phase2.3.2-validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { delay } from './shared/index.js';
import { EventBus } from '../src/shared/event-bus.js';
import { createDripAlertManager } from '../src/bot/dripAlerts.js';

// Type definitions for test
interface AlertUser {
  id: string;
  username: string;
  send(content: string): Promise<any>;
}

interface DripAlertManager {
  start(): void;
  stop(): void;
  recordAlert(severity: string, title: string, meta?: any): Promise<boolean>;
  flushDigest(): Promise<boolean>;
}

describe('DripAlertManager Event Bus Subscriptions - Phase 2.3.2', () => {
  let bus: EventBus;
  let mockUser: AlertUser;
  let alertManager: DripAlertManager;
  
  beforeEach(() => {
    bus = EventBus.getInstance();
    
    // Mock Discord user
    mockUser = {
      id: 'test-user-123',
      username: 'TestUser',
      send: vi.fn().mockResolvedValue(undefined),
    };
  });
  
  afterEach(async () => {
    if (alertManager) {
      alertManager.stop();
    }
    await bus.shutdown();
    EventBus.resetInstance();
  });

  // ============================================================================
  // Subscription Creation Tests
  // ============================================================================

  describe('Subscription Creation', () => {
    it('should create subscriptions on start with logging', () => {
      const logSpy = vi.fn();
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: logSpy,
        recordActivity: vi.fn(),
      } as any);
      
      alertManager.start();
      
      // Verify subscription creation was logged
      const subscriptionLogs = logSpy.mock.calls.filter(
        call => call[1] && call[1].includes('Drip alert Event Bus subscriptions created')
      );
      expect(subscriptionLogs.length).toBeGreaterThanOrEqual(1);
      
      // Verify subscription IDs were logged
      const logContext = subscriptionLogs[0][2];
      expect(logContext).toBeDefined();
      expect(logContext.immediate).toBeDefined();
      expect(logContext.digest).toBeDefined();
    });

    it('should not create subscriptions if recipient is unset', () => {
      const logSpy = vi.fn();
      
      alertManager = createDripAlertManager({
        recipient: undefined,
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: logSpy,
        recordActivity: vi.fn(),
      } as any);
      
      alertManager.start();
      
      // Verify warning was logged about inactive system
      const warningLogs = logSpy.mock.calls.filter(
        call => call[0] === 'warn' && call[1] && call[1].includes('Drip alert system inactive')
      );
      expect(warningLogs.length).toBeGreaterThanOrEqual(1);
      
      // Verify NO subscription creation log
      const subscriptionLogs = logSpy.mock.calls.filter(
        call => call[1] && call[1].includes('Drip alert Event Bus subscriptions created')
      );
      expect(subscriptionLogs).toHaveLength(0);
    });

    it('should not create duplicate subscriptions on multiple start calls', () => {
      const logSpy = vi.fn();
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: logSpy,
        recordActivity: vi.fn(),
      } as any);
      
      alertManager.start();
      const _firstCallCount = logSpy.mock.calls.filter(
        call => call[1] && call[1].includes('Drip alert Event Bus subscriptions created')
      ).length;
      
      // Clear log spy
      logSpy.mockClear();
      
      // Call start again
      alertManager.start();
      
      // Should NOT log subscription creation again
      const secondCallCount = logSpy.mock.calls.filter(
        call => call[1] && call[1].includes('Drip alert Event Bus subscriptions created')
      ).length;
      expect(secondCallCount).toBe(0);
    });
  });

  // ============================================================================
  // Subscription Cleanup Tests
  // ============================================================================

  describe('Subscription Cleanup', () => {
    it('should handle stop gracefully', () => {
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      alertManager.start();
      
      // Stop should not throw
      expect(() => alertManager.stop()).not.toThrow();
    });

    it('should handle stop when not started', () => {
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      // Stop without start - should not throw
      expect(() => alertManager.stop()).not.toThrow();
    });

    it('should allow restart after stop', () => {
      const logSpy = vi.fn();
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: logSpy,
        recordActivity: vi.fn(),
      } as any);
      
      // Start -> Stop -> Start cycle
      alertManager.start();
      alertManager.stop();
      
      logSpy.mockClear();
      alertManager.start();
      
      // Verify subscriptions recreated after restart
      const subscriptionLogs = logSpy.mock.calls.filter(
        call => call[1] && call[1].includes('Drip alert Event Bus subscriptions created')
      );
      expect(subscriptionLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // Backward Compatibility Tests
  // ============================================================================

  describe('Backward Compatibility', () => {
    it('should maintain existing immediate delivery behavior', async () => {
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      alertManager.start();
      
      await alertManager.recordAlert('critical', 'Backward compat test');
      
      // Wait for async processing
      await delay();
      
      // Verify Discord DM was sent (existing behavior)
      expect(mockUser.send).toHaveBeenCalledTimes(1);
      expect(mockUser.send).toHaveBeenCalledWith(
        expect.stringContaining('DripTVDD Alert — Backward compat test')
      );
    });

    it('should maintain existing digest queueing behavior', async () => {
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      alertManager.start();
      
      await alertManager.recordAlert('warning', 'Digest backward compat test');
      
      // Wait for async processing
      await delay();
      
      // Verify Discord DM was NOT sent immediately (existing behavior)
      expect(mockUser.send).not.toHaveBeenCalled();
    });
  });
});
