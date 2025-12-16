/**
 * Phase 2.3.1 Validation: DripAlertManager Event Bus Emission
 * 
 * Quick validation tests to confirm Event Bus integration in Phase 2.3.1.
 * Tests that alerts are emitted to correct topics with correlation IDs.
 * 
 * @module tests/dripalert-bus-phase2.3.1-validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { delay } from './shared/index.js';
import { EventBus } from '../src/shared/event-bus.js';
import type { BusEvent } from '../src/shared/event-bus.js';
import { createDripAlertManager } from '../src/bot/dripAlerts.js';

// Type definitions for test (dripAlerts.js is CommonJS)
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

describe('DripAlertManager Event Bus Integration - Phase 2.3.1', () => {
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
  // Event Emission Tests (Phase 2.3.1)
  // ============================================================================

  describe('Event Emission', () => {
    it('should emit critical alert to alert.critical topic', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('alert.critical', (event) => {
        events.push(event);
      });
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('critical', 'Test critical alert', { test: true });
      
      // Wait for async processing
      await delay();
      
      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('alert.critical');
      expect(events[0].payload.severity).toBe('critical');
      expect(events[0].payload.title).toBe('Test critical alert');
      expect(events[0].correlationId).toBeTruthy();
    });

    it('should emit security alert to alert.security topic', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('alert.security', (event) => {
        events.push(event);
      });
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('security', 'Test security alert', { test: true });
      
      // Wait for async processing
      await delay();
      
      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('alert.security');
      expect(events[0].payload.severity).toBe('security');
    });

    it('should emit warning alert to alert.warning topic', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('alert.warning', (event) => {
        events.push(event);
      });
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('warning', 'Test warning alert', { test: true });
      
      // Wait for async processing
      await delay();
      
      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('alert.warning');
      expect(events[0].payload.severity).toBe('warning');
    });

    it('should emit notice alert to alert.notice topic', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('alert.notice', (event) => {
        events.push(event);
      });
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('notice', 'Test notice alert', { test: true });
      
      // Wait for async processing
      await delay();
      
      expect(events).toHaveLength(1);
      expect(events[0].topic).toBe('alert.notice');
      expect(events[0].payload.severity).toBe('notice');
    });

    it('should generate UUID v4 correlation ID for each alert', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('alert.**', (event) => {
        events.push(event);
      });
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('critical', 'Alert 1');
      await alertManager.recordAlert('warning', 'Alert 2');
      await alertManager.recordAlert('notice', 'Alert 3');
      
      // Wait for async processing
      await delay();
      
      expect(events).toHaveLength(3);
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      events.forEach(event => {
        expect(event.correlationId).toMatch(uuidRegex);
      });
      
      // All correlation IDs should be unique
      const correlationIds = new Set(events.map(e => e.correlationId));
      expect(correlationIds.size).toBe(3);
    });

    it('should include metadata in alert payload', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('alert.critical', (event) => {
        events.push(event);
      });
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      const testMeta = { userId: 'user-123', action: 'test-action' };
      await alertManager.recordAlert('critical', 'Test with metadata', testMeta);
      
      // Wait for async processing
      await delay();
      
      expect(events).toHaveLength(1);
      expect(events[0].payload.meta).toBeTruthy();
      expect(events[0].payload.meta).toContain('userId');
      expect(events[0].payload.meta).toContain('user-123');
    });
  });

  // ============================================================================
  // Backward Compatibility Tests
  // ============================================================================

  describe('Backward Compatibility', () => {
    it('should still deliver immediate alerts via existing queue logic', async () => {
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('critical', 'Immediate alert test');
      
      // Wait for async processing
      await delay();
      
      // Verify Discord DM was sent (existing behavior)
      expect(mockUser.send).toHaveBeenCalledTimes(1);
      expect(mockUser.send).toHaveBeenCalledWith(
        expect.stringContaining('DripTVDD Alert — Immediate alert test')
      );
    });

    it('should still queue digest alerts via existing queue logic', async () => {
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('warning', 'Digest alert test');
      
      // Wait for async processing
      await delay();
      
      // Verify Discord DM was NOT sent immediately (existing behavior)
      expect(mockUser.send).not.toHaveBeenCalled();
      
      // Digest should be queued (existing behavior - not tested here)
    });
  });

  // ============================================================================
  // Pattern Subscription Tests
  // ============================================================================

  describe('Pattern Subscriptions', () => {
    it('should allow subscribing to all alerts with alert.** pattern', async () => {
      const events: BusEvent[] = [];
      
      bus.subscribe('alert.**', (event) => {
        events.push(event);
      });
      
      alertManager = createDripAlertManager({
        recipient: 'test-user-123',
        resolveAlertUser: vi.fn().mockResolvedValue(mockUser),
        describeUser: (user: any) => user.username,
        log: vi.fn(),
        recordActivity: vi.fn(),
      } as any);
      
      await alertManager.recordAlert('critical', 'Critical alert');
      await alertManager.recordAlert('security', 'Security alert');
      await alertManager.recordAlert('warning', 'Warning alert');
      await alertManager.recordAlert('notice', 'Notice alert');
      
      // Wait for async processing
      await delay();
      
      expect(events).toHaveLength(4);
      expect(events.map(e => e.topic).sort()).toEqual([
        'alert.critical',
        'alert.notice',
        'alert.security',
        'alert.warning',
      ]);
    });
  });
});
