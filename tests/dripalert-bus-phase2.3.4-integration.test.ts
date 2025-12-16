/**
 * Phase 2.3.4: DripAlertManager + Event Bus Integration Tests
 * 
 * Tests comprehensive scenarios validating DripAlertManager Event Bus integration:
 * - End-to-end alert delivery (critical, security, warning, notice)
 * - Event Bus replay buffer usage for digest delivery
 * - Failure retry via Event Bus re-emission
 * - Subscription lifecycle and cleanup
 * - Correlation ID propagation across delivery attempts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { delay } from './shared/index.js';
import { EventBus } from '../src/shared/event-bus.js';
import { createDripAlertManager } from '../src/bot/dripAlerts.js';

// Mock Discord user for testing
const createMockUser = (shouldFail = false) => ({
  id: '123456789',
  username: 'TestUser',
  send: vi.fn(async (_message: string) => {
    if (shouldFail) {
      throw new Error('Discord API error');
    }
    return { id: 'message-id' };
  }),
});

describe('DripAlertManager Event Bus Integration - Phase 2.3.4', () => {
  let bus: ReturnType<typeof EventBus.getInstance>;
  
  beforeEach(() => {
    // Reset Event Bus singleton to ensure clean state
    EventBus.resetInstance();
    // Get fresh Event Bus instance
    bus = EventBus.getInstance();
  });
  
  afterEach(async () => {
    // Shutdown Event Bus and reset instance for test isolation
    await bus.shutdown();
    EventBus.resetInstance();
  });

  describe('End-to-End Alert Delivery', () => {
    it('should deliver critical alert immediately via Event Bus subscription', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record critical alert
      await manager.recordAlert('critical', 'Test Critical Alert', { testMeta: true });
      
      // Give Event Bus time to process
      await delay();
      
      // Verify immediate delivery
      expect(mockUser.send).toHaveBeenCalledOnce();
      const sentMessage = mockUser.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('🚨 Critical');
      expect(sentMessage).toContain('Test Critical Alert');
      
      manager.stop();
    });

    it('should deliver security alert immediately via Event Bus subscription', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record security alert
      await manager.recordAlert('security', 'Unauthorized Access Detected', { ip: '192.168.1.1' });
      
      // Give Event Bus time to process
      await delay();
      
      // Verify immediate delivery
      expect(mockUser.send).toHaveBeenCalledOnce();
      const sentMessage = mockUser.send.mock.calls[0]?.[0];
      expect(sentMessage).toContain('🔒 Security');
      expect(sentMessage).toContain('Unauthorized Access Detected');
      
      manager.stop();
    });

    it('should queue warning alert in Event Bus replay buffer', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record warning alert
      await manager.recordAlert('warning', 'Rate Limit Approaching', { current: 80, limit: 100 });
      
      // Give Event Bus time to process
      await delay();
      
      // Verify NOT delivered immediately (digest only)
      expect(mockUser.send).not.toHaveBeenCalled();
      
      // Verify alert is in Event Bus replay buffer
      const replayEvents = bus.getReplayBuffer();
      const warningEvents = replayEvents.filter(e => e.topic === 'alert.warning');
      expect(warningEvents).toHaveLength(1);
      expect(warningEvents[0].payload.title).toBe('Rate Limit Approaching');
      
      manager.stop();
    });

    it('should queue notice alert in Event Bus replay buffer', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record notice alert
      await manager.recordAlert('notice', 'Cache Refreshed', { entries: 1000 });
      
      // Give Event Bus time to process
      await delay();
      
      // Verify NOT delivered immediately (digest only)
      expect(mockUser.send).not.toHaveBeenCalled();
      
      // Verify alert is in Event Bus replay buffer
      const replayEvents = bus.getReplayBuffer();
      const noticeEvents = replayEvents.filter(e => e.topic === 'alert.notice');
      expect(noticeEvents).toHaveLength(1);
      expect(noticeEvents[0].payload.title).toBe('Cache Refreshed');
      
      manager.stop();
    });
  });

  describe('Digest Delivery via Event Bus Replay', () => {
    it('should deliver digest with multiple alerts from Event Bus replay buffer', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record multiple digest alerts
      await manager.recordAlert('warning', 'Warning 1', {});
      await manager.recordAlert('notice', 'Notice 1', {});
      await manager.recordAlert('warning', 'Warning 2', {});
      
      // Give Event Bus time to process
      await delay();
      
      // Verify alerts in replay buffer
      const replayEvents = bus.getReplayBuffer();
      const digestEvents = replayEvents.filter(e => 
        e.topic === 'alert.warning' || e.topic === 'alert.notice'
      );
      expect(digestEvents).toHaveLength(3);
      
      // Flush digest
      await manager.flushDigest();
      
      // Verify digest delivery
      expect(mockUser.send).toHaveBeenCalledOnce();
      const digestMessage = mockUser.send.mock.calls[0]?.[0];
      expect(digestMessage).toContain('Warning 1');
      expect(digestMessage).toContain('Notice 1');
      expect(digestMessage).toContain('Warning 2');
      
      manager.stop();
    });

    it('should skip digest delivery when Event Bus replay buffer has no digest alerts', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record only critical alert (not included in digest)
      await manager.recordAlert('critical', 'Critical Alert', {});
      
      // Give Event Bus time to process
      await delay();
      
      // Clear immediate delivery call
      mockUser.send.mockClear();
      
      // Flush digest
      const result = await manager.flushDigest();
      
      // Verify digest skipped (no digest alerts in replay buffer)
      expect(result).toBe(false);
      expect(mockUser.send).not.toHaveBeenCalled();
      
      manager.stop();
    });
  });

  describe('Failure Retry via Event Bus Re-emission', () => {
    it('should re-emit failed immediate delivery as alert.warning', async () => {
      const mockUser = createMockUser(true); // Configure to fail
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record critical alert (will fail delivery)
      await manager.recordAlert('critical', 'Test Failure', {});
      
      // Give Event Bus time to process
      await delay();
      
      // Verify delivery attempted and failed
      expect(mockUser.send).toHaveBeenCalledOnce();
      
      // Verify re-emission as alert.warning in replay buffer
      const replayEvents = bus.getReplayBuffer();
      const retryEvents = replayEvents.filter(e => 
        e.topic === 'alert.warning' && 
        e.payload.title?.includes('[Retry]')
      );
      expect(retryEvents.length).toBeGreaterThan(0);
      expect(retryEvents[0].payload.originalSeverity).toBe('critical');
      expect(retryEvents[0].payload.retryReason).toBe('delivery-failed');
      
      manager.stop();
    });

    it('should re-emit missing recipient as alert.warning', async () => {
      const manager = createDripAlertManager({
        recipient: 'invalid-user-id',
        describeUser: () => `InvalidUser#0000`,
        resolveAlertUser: async () => { throw new Error('User not found'); },
      });
      
      manager.start();
      
      // Record critical alert (recipient missing)
      await manager.recordAlert('critical', 'Test Missing Recipient', {});
      
      // Give Event Bus time to process
      await delay();
      
      // Verify re-emission as alert.warning in replay buffer
      const replayEvents = bus.getReplayBuffer();
      const retryEvents = replayEvents.filter(e => 
        e.topic === 'alert.warning' && 
        e.payload.title?.includes('[Retry]')
      );
      expect(retryEvents.length).toBeGreaterThan(0);
      expect(retryEvents[0].payload.retryReason).toBe('recipient-missing');
      
      manager.stop();
    });
  });

  describe('Subscription Lifecycle', () => {
    it('should create Event Bus subscriptions on start', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      // Before start: baseline subscriptions
      const beforeStats = bus.getStats();
      const beforeSubscribers = beforeStats.subscriptionsActive;
      
      // Start manager
      manager.start();
      
      // After start: 2 new subscriptions (immediate + digest)
      const afterStats = bus.getStats();
      const afterSubscribers = afterStats.subscriptionsActive;
      
      expect(afterSubscribers).toBeGreaterThan(beforeSubscribers);
      expect(afterSubscribers - beforeSubscribers).toBe(2);
      
      manager.stop();
    });

    it('should cleanup Event Bus subscriptions on stop', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // After start: subscriptions exist
      const startStats = bus.getStats();
      const startSubscribers = startStats.subscriptionsActive;
      
      // Stop manager
      manager.stop();
      
      // After stop: subscriptions removed
      const stopStats = bus.getStats();
      const stopSubscribers = stopStats.subscriptionsActive;
      
      expect(stopSubscribers).toBeLessThan(startSubscribers);
      
      manager.stop();
    });
  });

  describe('Correlation ID Propagation', () => {
    it('should propagate correlation ID from emission through delivery', async () => {
      const mockUser = createMockUser();
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record critical alert
      await manager.recordAlert('critical', 'Test Correlation', {});
      
      // Give Event Bus time to process
      await delay();
      
      // Verify delivery with correlation ID in message
      expect(mockUser.send).toHaveBeenCalledOnce();
      const sentMessage = mockUser.send.mock.calls[0]?.[0];
      expect(sentMessage).toMatch(/ID: [a-f0-9-]{36}/); // UUID v4 format
      
      manager.stop();
    });

    it('should include parentCorrelationId when re-emitting failures', async () => {
      const mockUser = createMockUser(true); // Configure to fail
      const manager = createDripAlertManager({
        recipient: mockUser.id,
        describeUser: () => `TestUser#0000`,
        resolveAlertUser: async () => mockUser as any,
      });
      
      manager.start();
      
      // Record critical alert (will fail delivery)
      await manager.recordAlert('critical', 'Test Correlation Failure', {});
      
      // Give Event Bus time to process
      await delay();
      
      // Verify retry event has parentCorrelationId
      const replayEvents = bus.getReplayBuffer();
      const retryEvents = replayEvents.filter(e => 
        e.topic === 'alert.warning' && 
        e.payload.title?.includes('[Retry]')
      );
      expect(retryEvents.length).toBeGreaterThan(0);
      expect(retryEvents[0].parentCorrelationId).toBeDefined();
      expect(retryEvents[0].parentCorrelationId).toMatch(/^[a-f0-9-]{36}$/);
      
      manager.stop();
    });
  });
});
