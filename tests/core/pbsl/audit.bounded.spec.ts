/**
 * MemoryAuditTrail bounded buffer tests
 * @module tests/core/pbsl/audit.bounded
 */

import { describe, expect, it } from 'vitest';

import { MemoryAuditTrail } from '../../../src/core/pbsl/audit.js';

describe('MemoryAuditTrail bounded buffer (MEMLEAK.PHASE1.4)', () => {
  it('should default maxEvents to 10000', () => {
    const trail = new MemoryAuditTrail();
    const metrics = trail.getMetrics();
    expect(metrics.max).toBe(10000);
    expect(metrics.current).toBe(0);
    expect(metrics.utilization).toBe(0);
  });

  it('should record events and update metrics', () => {
    const trail = new MemoryAuditTrail();
    trail.record({ phase: 'alpha', action: 'start' });
    const metrics = trail.getMetrics();
    expect(metrics.current).toBe(1);
    expect(metrics.utilization).toBe((1 / 10000) * 100);
  });

  it('should drop oldest event when max reached', () => {
    const trail = new MemoryAuditTrail(undefined, 3);
    trail.record({ phase: 'p', action: 'a1' });
    trail.record({ phase: 'p', action: 'a2' });
    trail.record({ phase: 'p', action: 'a3' });
    trail.record({ phase: 'p', action: 'a4' });

    const snapshot = trail.flush();
    expect(snapshot.length).toBe(3);
    expect(snapshot[0].action).toBe('a2');
    expect(snapshot[2].action).toBe('a4');
  });

  it('should cap size to maxEvents', () => {
    const trail = new MemoryAuditTrail(undefined, 2);
    trail.record({ phase: 'p', action: 'a1' });
    trail.record({ phase: 'p', action: 'a2' });
    trail.record({ phase: 'p', action: 'a3' });

    const metrics = trail.getMetrics();
    expect(metrics.current).toBe(2);
  });

  it('should retain only the latest event when maxEvents=1', () => {
    const trail = new MemoryAuditTrail(undefined, 1);
    trail.record({ phase: 'p', action: 'first' });
    trail.record({ phase: 'p', action: 'second' });

    const snapshot = trail.flush();
    expect(snapshot.length).toBe(1);
    expect(snapshot[0].action).toBe('second');
  });

  it('should clear events on flush', () => {
    const trail = new MemoryAuditTrail(undefined, 5);
    trail.record({ phase: 'p', action: 'a1' });
    trail.record({ phase: 'p', action: 'a2' });

    const snapshot = trail.flush();
    expect(snapshot.length).toBe(2);
    expect(trail.getMetrics().current).toBe(0);
  });

  it('should return an empty snapshot after a second flush', () => {
    const trail = new MemoryAuditTrail(undefined, 5);
    trail.record({ phase: 'p', action: 'a1' });
    trail.flush();

    const snapshot = trail.flush();
    expect(snapshot.length).toBe(0);
  });

  it('should report accurate utilization for partial fill', () => {
    const trail = new MemoryAuditTrail(undefined, 4);
    trail.record({ phase: 'p', action: 'a1' });
    trail.record({ phase: 'p', action: 'a2' });
    const metrics = trail.getMetrics();
    expect(metrics.utilization).toBe(50);
  });

  it('should report 100% utilization at capacity', () => {
    const trail = new MemoryAuditTrail(undefined, 2);
    trail.record({ phase: 'p', action: 'a1' });
    trail.record({ phase: 'p', action: 'a2' });
    const metrics = trail.getMetrics();
    expect(metrics.utilization).toBe(100);
  });

  it('should accept custom maxEvents values', () => {
    const trail = new MemoryAuditTrail(undefined, 7);
    const metrics = trail.getMetrics();
    expect(metrics.max).toBe(7);
  });
});
