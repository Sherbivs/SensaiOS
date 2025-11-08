import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pool } from 'pg';
import { EventTracker, type EventTrackerConfig } from '../../src/services/events/EventTracker.js';
import { 
  type LoginEvent,
  type BattleStartedEvent, 
  type CoinsEvent,
  RETENTION_POLICIES 
} from '../../src/services/events/types.js';

// Mock Pool instance
const mockPool = {
  query: vi.fn(),
  end: vi.fn(),
} as unknown as Pool;

describe('EventTracker - Core Functionality', () => {
  let tracker: EventTracker;
  const testUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock successful INSERT query
    (mockPool.query as any).mockResolvedValue({ rowCount: 1 });
    
    // Create tracker with minimal batch size for testing
    const config: EventTrackerConfig = {
      maxBatchSize: 3, // Small batch for testing
      maxBatchDelay: 100, // Short interval for testing
      enableMetrics: true,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    
    tracker = new EventTracker(mockPool, config);
  });

  afterEach(async () => {
    if (tracker) {
      await tracker.shutdown();
    }
  });

  describe('Event Batching', () => {
    it('should queue events without immediate flush', async () => {
      const event: LoginEvent = {
        userId: testUserId,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      };

      await tracker.track(event);

      // No query should have been made yet (batch not full, timer not expired)
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should auto-flush when batch size reached', async () => {
      const events: LoginEvent[] = Array.from({ length: 3 }, (_, i) => ({
        userId: `user-${i}`,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: i === 0,
        },
      }));

      // Track 3 events (matches maxBatchSize)
      for (const event of events) {
        await tracker.track(event);
      }

      // Should trigger auto-flush
      expect(mockPool.query).toHaveBeenCalledTimes(1);
      
      // Verify INSERT query structure
      const query = (mockPool.query as any).mock.calls[0][0];
      expect(query).toContain('INSERT INTO "UserEvent"');
      expect(query).toContain('VALUES');
    });

    it('should batch multiple events efficiently', async () => {
      const events: LoginEvent[] = Array.from({ length: 10 }, (_, i) => ({
        userId: `user-${i}`,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      }));

      await tracker.trackBatch(events);
      await tracker.flush();

      // trackBatch triggers multiple flushes due to maxBatchSize=3 config
      // 10 events with batch size 3 = 4 queries (3+3+3+1)
      expect(mockPool.query).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledTimes(4);
      
      // Verify all queries are INSERT statements
      const queries = (mockPool.query as any).mock.calls.map((call: any) => call[0]);
      queries.forEach((query: string) => {
        expect(query).toContain('INSERT INTO "UserEvent"');
      });
    });
  });

  describe('PII Hashing', () => {
    it('should hash IP addresses with SHA-256', async () => {
      const event: LoginEvent = {
        userId: testUserId,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        ipAddress: '192.168.1.1',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      };

      await tracker.track(event);
      await tracker.flush();

      // Verify query was called
      expect(mockPool.query).toHaveBeenCalled();
      
      // Verify ipAddress was hashed (check query params)
      const queryParams = (mockPool.query as any).mock.calls[0][1];
      const ipAddressParam = queryParams.find((p: string) => 
        p && p.length === 64 && /^[a-f0-9]{64}$/.test(p)
      );
      
      expect(ipAddressParam).toBeDefined();
      expect(ipAddressParam).not.toBe('192.168.1.1');
    });

    it('should handle events without IP addresses', async () => {
      const event: LoginEvent = {
        userId: testUserId,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      };

      await tracker.track(event);
      await tracker.flush();

      expect(mockPool.query).toHaveBeenCalled();
      
      // Should have null for ipAddress
      const queryParams = (mockPool.query as any).mock.calls[0][1];
      expect(queryParams).toContain(null);
    });
  });

  describe('Retention Calculation', () => {
    it('should calculate retention for gameplay/info (indefinite)', async () => {
      const event: BattleStartedEvent = {
        userId: testUserId,
        category: 'gameplay',
        eventType: 'battle.started',
        severity: 'info',
        data: {
          battleId: 'battle-1',
          opponentId: 'opponent-1',
          ruleset: 'standard',
        },
        relatedEntityType: 'Battle',
        relatedEntityId: 'battle-1',
      };

      await tracker.track(event);
      await tracker.flush();

      const queryParams = (mockPool.query as any).mock.calls[0][1];
      
      // retainUntil should be null (indefinite retention)
      expect(queryParams).toContain(null);
    });

    it('should calculate retention for economy/info (1 year)', async () => {
      const event: CoinsEvent = {
        userId: testUserId,
        category: 'economy',
        eventType: 'coins.earned',
        severity: 'info',
        data: {
          amount: 100,
          source: 'battle',
          balance_after: 1100,
        },
      };

      // Capture timestamp BEFORE tracking to avoid race condition
      const beforeTrack = new Date();

      await tracker.track(event);
      await tracker.flush();

      const queryParams = (mockPool.query as any).mock.calls[0][1];
      
      // retainUntil is parameter index 11 (12th parameter, 0-indexed)
      const retainUntilParam = queryParams[11];
      expect(retainUntilParam).toBeDefined();
      expect(retainUntilParam).toBeInstanceOf(Date);
      
      // Should be in the future (retention period applied) - compare to beforeTrack
      expect(retainUntilParam.getTime()).toBeGreaterThanOrEqual(beforeTrack.getTime());
      
      // Should be approximately 1 year in the future (from beforeTrack)
      // Economy/info retention is 365 days, so check it's roughly that amount
      const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
      const diff = retainUntilParam.getTime() - beforeTrack.getTime();
      expect(diff).toBeGreaterThan(oneYearInMs * 0.99); // At least 99% of a year
      expect(diff).toBeLessThan(oneYearInMs * 1.01); // At most 101% of a year
    });
  });

  describe('Metrics Tracking', () => {
    it('should track events queued', async () => {
      const event: LoginEvent = {
        userId: testUserId,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      };

      await tracker.track(event);
      
      const metrics = tracker.getMetrics();
      expect(metrics.eventsQueued).toBe(1);
    });

    it('should track events flushed', async () => {
      const events: LoginEvent[] = Array.from({ length: 5 }, (_, i) => ({
        userId: `user-${i}`,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      }));

      await tracker.trackBatch(events);
      await tracker.flush();
      
      const metrics = tracker.getMetrics();
      expect(metrics.eventsFlushed).toBe(5);
    });

    it('should track errors on failed flush', async () => {
      // Mock query failure
      (mockPool.query as any).mockRejectedValueOnce(new Error('Database error'));

      const event: LoginEvent = {
        userId: testUserId,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      };

      await tracker.track(event);
      
      // Flush should fail and increment error counter
      try {
        await tracker.flush();
      } catch (error) {
        // Expected error - flush re-throws after logging
      }
      
      const metrics = tracker.getMetrics();
      expect(metrics.errors).toBe(1);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should flush pending events on shutdown', async () => {
      const event: LoginEvent = {
        userId: testUserId,
        category: 'engagement',
        eventType: 'login',
        severity: 'info',
        data: {
          loginMethod: 'discord',
          isNewUser: false,
        },
      };

      await tracker.track(event);
      expect(mockPool.query).not.toHaveBeenCalled();

      // Shutdown should flush
      await tracker.shutdown();
      
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });
});
