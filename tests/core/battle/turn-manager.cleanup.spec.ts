/**
 * turn-manager runtime cleanup tests
 * @module tests/core/battle/turn-manager.cleanup
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import {
  RUNTIME_TIMEOUT_MS,
  destroyRuntime,
  getRuntimeMetrics,
  __testing,
} from '../../../src/core/battle/turn-manager.js';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

describe('turn-manager runtime cleanup (MEMLEAK.PHASE1.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00Z'));
    __testing.stopCleanupInterval();
    __testing.clear();
  });

  afterEach(() => {
    __testing.stopCleanupInterval();
    __testing.clear();
    vi.useRealTimers();
  });

  it('should create a runtime and set lastActivity on first access', () => {
    const runtime = __testing.ensureRuntime('battle-1');
    expect(runtime).toBeDefined();
    expect(runtime.lastActivity).toBe(Date.now());

    const metrics = getRuntimeMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.active).toBe(1);
    expect(metrics.cleaned).toBe(0);
  });

  it('should update lastActivity on repeated access', () => {
    __testing.ensureRuntime('battle-2');
    const stored = __testing.getRuntime('battle-2');
    if (stored) stored.lastActivity = Date.now() - 5000;

    vi.setSystemTime(new Date(Date.now() + 1000));
    const refreshed = __testing.ensureRuntime('battle-2');
    expect(refreshed.lastActivity).toBe(Date.now());
  });

  it('should cleanup stale runtimes and increment cleaned count', () => {
    __testing.ensureRuntime('battle-3');
    const stored = __testing.getRuntime('battle-3');
    if (stored) stored.lastActivity = Date.now() - RUNTIME_TIMEOUT_MS - 1;

    const cleaned = __testing.cleanupStaleRuntimes(Date.now());
    expect(cleaned).toBe(1);
    expect(__testing.getRuntime('battle-3')).toBeNull();

    const metrics = getRuntimeMetrics();
    expect(metrics.cleaned).toBe(1);
    expect(metrics.active).toBe(0);
  });

  it('should preserve active runtimes within timeout', () => {
    __testing.ensureRuntime('battle-4');
    const stored = __testing.getRuntime('battle-4');
    if (stored) stored.lastActivity = Date.now() - RUNTIME_TIMEOUT_MS + 1;

    const cleaned = __testing.cleanupStaleRuntimes(Date.now());
    expect(cleaned).toBe(0);
    expect(__testing.getRuntime('battle-4')).not.toBeNull();
  });

  it('should cleanup stale runtimes via interval', () => {
    __testing.ensureRuntime('battle-5');
    const stored = __testing.getRuntime('battle-5');
    if (stored) stored.lastActivity = Date.now() - RUNTIME_TIMEOUT_MS - 1;

    __testing.startCleanupInterval();
    vi.advanceTimersByTime(CLEANUP_INTERVAL_MS);

    expect(__testing.getRuntime('battle-5')).toBeNull();
    expect(getRuntimeMetrics().cleaned).toBe(1);
  });

  it('should stop cleanup interval on SIGTERM', () => {
    __testing.startCleanupInterval();
    expect(__testing.getCleanupInterval()).not.toBeNull();

    process.emit('SIGTERM');
    expect(__testing.getCleanupInterval()).toBeNull();
  });

  it('should destroy runtime explicitly', () => {
    __testing.ensureRuntime('battle-6');
    expect(__testing.getRuntime('battle-6')).not.toBeNull();

    const destroyed = destroyRuntime('battle-6');
    expect(destroyed).toBe(true);
    expect(__testing.getRuntime('battle-6')).toBeNull();
  });
});
