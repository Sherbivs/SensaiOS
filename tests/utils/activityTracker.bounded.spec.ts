/**
 * Activity Tracker — Bounded Circular Buffer Tests
 * @module tests/utils/activityTracker.bounded
 *
 * Validates MEMLEAK.PHASE1.1 acceptance criteria:
 *   - pendingActivities never exceeds MAX_PENDING_ACTIVITIES
 *   - Oldest entries are evicted (circular buffer)
 *   - droppedCount increments correctly
 *   - requeueActivities rejects over-limit batches
 *   - getBufferMetrics() reports accurate observability data
 *   - drain + refill cycles remain bounded
 *   - Subscriber notifications fire even after overflow
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

// Mock logger before importing the module under test
vi.mock('../../src/shared/logging/index.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  recordActivity,
  drainActivities,
  requeueActivities,
  getPendingActivities,
  getStats,
  getBufferMetrics,
  subscribe,
  MAX_PENDING_ACTIVITIES,
  __testing,
} from '../../src/utils/activityTracker.js';

import type { BufferMetrics, ActivityStats } from '../../src/utils/activityTracker.js';

describe('ActivityTracker — Bounded Circular Buffer (MEMLEAK.PHASE1.1)', () => {
  beforeEach(() => {
    __testing.reset();
  });

  // ─────────────── Capacity Enforcement ───────────────

  describe('capacity enforcement', () => {
    it('should enforce MAX_PENDING_ACTIVITIES limit', () => {
      for (let i = 0; i < MAX_PENDING_ACTIVITIES + 200; i++) {
        recordActivity('test', `event-${i}`);
      }
      const pending = getPendingActivities();
      expect(pending.length).toBe(MAX_PENDING_ACTIVITIES);
    });

    it('should export MAX_PENDING_ACTIVITIES as 1000', () => {
      expect(MAX_PENDING_ACTIVITIES).toBe(1000);
    });

    it('should allow filling to exactly MAX without dropping', () => {
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('fill', `entry-${i}`);
      }
      const metrics = getBufferMetrics();
      expect(metrics.current).toBe(MAX_PENDING_ACTIVITIES);
      expect(metrics.dropped).toBe(0);
    });
  });

  // ─────────────── Circular Buffer Eviction ───────────────

  describe('circular buffer eviction', () => {
    it('should drop the oldest entry when at capacity', () => {
      // Fill to capacity
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('old', `old-${i}`);
      }
      // Push one more — oldest ("old-0") should be evicted
      recordActivity('new', 'newest-entry');

      const pending = getPendingActivities();
      expect(pending.length).toBe(MAX_PENDING_ACTIVITIES);
      // First entry should now be "old-1" (old-0 was evicted)
      expect(pending[0].summary).toBe('old-1');
      // Last entry should be the newest
      expect(pending[pending.length - 1].summary).toBe('newest-entry');
    });

    it('should increment droppedCount on each eviction', () => {
      // Fill to capacity
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('fill', `fill-${i}`);
      }
      expect(getBufferMetrics().dropped).toBe(0);

      // Push 5 more — 5 evictions
      for (let i = 0; i < 5; i++) {
        recordActivity('over', `over-${i}`);
      }
      expect(getBufferMetrics().dropped).toBe(5);
      expect(getPendingActivities().length).toBe(MAX_PENDING_ACTIVITIES);
    });

    it('should maintain correct order after multiple evictions', () => {
      // Fill buffer
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('seq', `seq-${i}`);
      }
      // Overflow by 10
      for (let i = 0; i < 10; i++) {
        recordActivity('new', `new-${i}`);
      }

      const pending = getPendingActivities();
      // First entry should be seq-10 (seq-0..seq-9 evicted)
      expect(pending[0].summary).toBe('seq-10');
      // Last 10 should be new-0..new-9
      expect(pending[pending.length - 1].summary).toBe('new-9');
      expect(pending[pending.length - 10].summary).toBe('new-0');
    });
  });

  // ─────────────── Requeue Guard ───────────────

  describe('requeueActivities guard', () => {
    it('should reject a batch that would exceed capacity', () => {
      // Fill to 900
      for (let i = 0; i < 900; i++) {
        recordActivity('pre', `pre-${i}`);
      }
      expect(getPendingActivities().length).toBe(900);

      // Try to requeue 200 entries — would push to 1100, exceeds 1000
      const batch = Array.from({ length: 200 }, (_, i) => ({
        id: `requeue-${i}`,
        type: 'requeue',
        summary: `rq-${i}`,
        meta: {},
        timestamp: new Date(),
      }));

      requeueActivities(batch);

      // Buffer should remain at 900 — batch was rejected
      expect(getPendingActivities().length).toBe(900);
      // droppedCount should reflect the rejected batch size
      expect(getBufferMetrics().dropped).toBe(200);
    });

    it('should accept a batch that fits within remaining capacity', () => {
      // Fill to 950
      for (let i = 0; i < 950; i++) {
        recordActivity('pre', `pre-${i}`);
      }

      // Requeue 50 entries — exactly fills to 1000
      const batch = Array.from({ length: 50 }, (_, i) => ({
        id: `rq-${i}`,
        type: 'requeue',
        summary: `rq-${i}`,
        meta: {},
        timestamp: new Date(),
      }));

      requeueActivities(batch);

      expect(getPendingActivities().length).toBe(MAX_PENDING_ACTIVITIES);
      expect(getBufferMetrics().dropped).toBe(0);
    });

    it('should handle empty requeue gracefully', () => {
      recordActivity('test', 'single');
      requeueActivities([]);
      expect(getPendingActivities().length).toBe(1);
      expect(getBufferMetrics().dropped).toBe(0);
    });
  });

  // ─────────────── getBufferMetrics() ───────────────

  describe('getBufferMetrics()', () => {
    it('should report zero state initially', () => {
      const m: BufferMetrics = getBufferMetrics();
      expect(m.current).toBe(0);
      expect(m.max).toBe(MAX_PENDING_ACTIVITIES);
      expect(m.utilization).toBe(0);
      expect(m.dropped).toBe(0);
    });

    it('should report accurate utilization percentage', () => {
      for (let i = 0; i < 500; i++) {
        recordActivity('half', `h-${i}`);
      }
      const m = getBufferMetrics();
      expect(m.current).toBe(500);
      expect(m.utilization).toBe(50);
    });

    it('should report 100% utilization at capacity', () => {
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('full', `f-${i}`);
      }
      const m = getBufferMetrics();
      expect(m.utilization).toBe(100);
    });

    it('should accumulate drops from both overflow and requeue rejection', () => {
      // Fill to capacity
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('fill', `f-${i}`);
      }
      // Overflow by 3
      for (let i = 0; i < 3; i++) {
        recordActivity('over', `o-${i}`);
      }
      // Reject a requeue of 7
      const batch = Array.from({ length: 7 }, (_, i) => ({
        id: `rq-${i}`,
        type: 'rq',
        summary: `rq-${i}`,
        meta: {},
        timestamp: new Date(),
      }));
      requeueActivities(batch);

      expect(getBufferMetrics().dropped).toBe(3 + 7);
    });
  });

  // ─────────────── Drain + Refill Cycles ───────────────

  describe('drain and refill cycles', () => {
    it('should reset current to 0 after drain and allow refill', () => {
      // Fill to capacity
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('cycle', `c-${i}`);
      }
      expect(getBufferMetrics().current).toBe(MAX_PENDING_ACTIVITIES);

      // Drain
      const drained = drainActivities();
      expect(drained.length).toBe(MAX_PENDING_ACTIVITIES);
      expect(getBufferMetrics().current).toBe(0);

      // Refill to capacity again
      for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
        recordActivity('refill', `r-${i}`);
      }
      expect(getBufferMetrics().current).toBe(MAX_PENDING_ACTIVITIES);
      expect(getBufferMetrics().dropped).toBe(0);
    });
  });

  // ─────────────── Subscriber Notification ───────────────

  describe('subscriber notification after overflow', () => {
    it('should still notify subscribers when buffer overflows', () => {
      const snapshots: ActivityStats[] = [];
      subscribe((snapshot) => {
        snapshots.push(snapshot);
      });

      // Initial subscribe fires once
      const initialCount = snapshots.length;

      // Fill to capacity + 1 overflow
      for (let i = 0; i < MAX_PENDING_ACTIVITIES + 1; i++) {
        recordActivity('notify', `n-${i}`);
      }

      // Should have been notified for every recordActivity call + initial
      expect(snapshots.length).toBe(initialCount + MAX_PENDING_ACTIVITIES + 1);

      // Last snapshot should reflect bounded state
      const last = snapshots[snapshots.length - 1];
      expect(last.pendingEvents).toBe(MAX_PENDING_ACTIVITIES);
    });
  });

  // ─────────────── Lifetime Counts ───────────────

  describe('lifetime counts survive overflow', () => {
    it('should track totalEvents including evicted entries', () => {
      const total = MAX_PENDING_ACTIVITIES + 50;
      for (let i = 0; i < total; i++) {
        recordActivity('counted', `c-${i}`);
      }
      const stats = getStats();
      expect(stats.totalEvents).toBe(total);
      expect(stats.lifetimeCounts['counted']).toBe(total);
      // But pending is capped
      expect(stats.pendingEvents).toBe(MAX_PENDING_ACTIVITIES);
    });
  });
});
