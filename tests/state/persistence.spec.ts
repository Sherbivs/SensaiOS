/**
 * @file State Persistence Unit Tests
 * @description Test suite for security bot state persistence module
 * 
 * Tests cover:
 * - createDefaultState() factory
 * - addTimelineEvent() ring buffer behavior
 * - updateCumulativeStats() mutations
 * - updateGuildState() with initialization
 * - recordMetricsEvent() binary insertion
 * - getMetricsSummary() calculations
 * 
 * @module tests/state/persistence.spec
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultState,
  addTimelineEvent,
  updateCumulativeStats,
  updateGuildState,
  updateRuntimeState,
  recordMetricsEvent,
  getMetricsSummary,
  getMetricsTrend,
  isStateDegraded,
} from '../../src/bot/state/persistence.js';
import { MAX_TIMELINE_EVENTS } from '../../src/bot/state/config.js';
import type { SecurityBotState } from '../../src/bot/state/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createTestState(): SecurityBotState {
  return createDefaultState();
}

// ─────────────────────────────────────────────────────────────────────────────
// createDefaultState Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('createDefaultState', () => {
  it('creates a valid state with all required fields', () => {
    const state = createDefaultState();
    
    // Core structure
    expect(state.version).toBe(1);
    expect(state.schemaVersion).toBe('1.1.0');
    expect(state.metadata).toBeDefined();
    expect(state.cumulative).toBeDefined();
    expect(state.metricsHistory).toBeDefined();
    expect(state.timeline).toBeDefined();
    expect(state.guilds).toBeDefined();
    expect(state.runtime).toBeDefined();
  });

  it('initializes cumulative stats to zero', () => {
    const state = createDefaultState();
    
    expect(state.cumulative.totalUptime).toBe(0);
    expect(state.cumulative.restartCount).toBe(0);
    expect(state.cumulative.sweepCount).toBe(0);
    expect(state.cumulative.alertCount).toBe(0);
    expect(state.cumulative.permissionChangesDetected).toBe(0);
    expect(state.cumulative.permissionChangesReverted).toBe(0);
    expect(state.cumulative.revertFailures).toBe(0);
    expect(state.cumulative.guildCount).toBe(0);
  });

  it('initializes empty timeline array', () => {
    const state = createDefaultState();
    expect(state.timeline).toEqual([]);
  });

  it('initializes empty guilds object', () => {
    const state = createDefaultState();
    expect(state.guilds).toEqual({});
  });

  it('sets timestamp fields to current time', () => {
    const before = new Date().toISOString();
    const state = createDefaultState();
    const after = new Date().toISOString();
    
    // Timestamps should be between before and after
    expect(state.metadata.lastSaved >= before).toBe(true);
    expect(state.metadata.lastSaved <= after).toBe(true);
    expect(state.cumulative.firstStartTime >= before).toBe(true);
  });

  it('includes node version and hostname', () => {
    const state = createDefaultState();
    
    expect(state.metadata.nodeVersion).toBe(process.version);
    expect(state.metadata.hostname).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// addTimelineEvent Tests (Ring Buffer)
// ─────────────────────────────────────────────────────────────────────────────

describe('addTimelineEvent', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('adds event to empty timeline', () => {
    addTimelineEvent(state, {
      type: 'sweep',
      guildId: 'guild-1',
      guildName: 'Test Guild',
      details: { rolesChecked: 10, changesDetected: 0 }
    });

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].type).toBe('sweep');
    expect(state.timeline[0].guildName).toBe('Test Guild');
    expect(state.timeline[0].timestamp).toBeDefined();
  });

  it('adds timestamp automatically', () => {
    const before = Date.now();
    
    addTimelineEvent(state, {
      type: 'alert',
      details: { recipient: 'owner', reason: 'test', delivered: true }
    });

    const after = Date.now();
    const eventTime = new Date(state.timeline[0].timestamp).getTime();
    
    expect(eventTime).toBeGreaterThanOrEqual(before);
    expect(eventTime).toBeLessThanOrEqual(after);
  });

  it('maintains MAX_TIMELINE_EVENTS limit (ring buffer)', () => {
    // Fill beyond capacity
    for (let i = 0; i < MAX_TIMELINE_EVENTS + 20; i++) {
      addTimelineEvent(state, {
        type: 'sweep',
        guildId: `guild-${i}`,
        guildName: `Guild ${i}`,
        details: { rolesChecked: i, changesDetected: 0 }
      });
    }

    expect(state.timeline).toHaveLength(MAX_TIMELINE_EVENTS);
  });

  it('preserves newest events when overflow occurs', () => {
    // Add MAX + 5 events
    for (let i = 0; i < MAX_TIMELINE_EVENTS + 5; i++) {
      addTimelineEvent(state, {
        type: 'sweep',
        guildId: `guild-${i}`,
        guildName: `Guild ${i}`,
        details: { rolesChecked: i, changesDetected: 0 }
      });
    }

    // Timeline uses unshift - newest at front, oldest at end
    // The oldest 5 should be dropped (the ones with lowest rolesChecked values)
    const lastEvent = state.timeline[state.timeline.length - 1];
    const lastDetails = lastEvent.details as { rolesChecked: number };
    expect(lastDetails.rolesChecked).toBe(5); // 0-4 dropped, 5 is now oldest
    
    const firstEvent = state.timeline[0];
    const firstDetails = firstEvent.details as { rolesChecked: number };
    expect(firstDetails.rolesChecked).toBe(MAX_TIMELINE_EVENTS + 4); // Newest
  });

  it('handles different event types', () => {
    addTimelineEvent(state, {
      type: 'error',
      details: { message: 'Test error', code: 'ERR_TEST' }
    });

    addTimelineEvent(state, {
      type: 'permission_change',
      guildId: 'guild-1',
      guildName: 'Test',
      details: {
        userId: 'user-1',
        userName: 'TestUser',
        action: 'role_added',
        reverted: false,
        revertStatus: 'not_attempted'
      }
    });

    expect(state.timeline).toHaveLength(2);
    // unshift puts newest first
    expect(state.timeline[0].type).toBe('permission_change');
    expect(state.timeline[1].type).toBe('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateCumulativeStats Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('updateCumulativeStats', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('increments sweep count', () => {
    updateCumulativeStats(state, { sweepCount: 1 });
    expect(state.cumulative.sweepCount).toBe(1);

    updateCumulativeStats(state, { sweepCount: 5 });
    expect(state.cumulative.sweepCount).toBe(6);
  });

  it('increments alert count', () => {
    updateCumulativeStats(state, { alertCount: 3 });
    expect(state.cumulative.alertCount).toBe(3);
  });

  it('increments multiple stats at once', () => {
    updateCumulativeStats(state, {
      sweepCount: 2,
      alertCount: 1,
      permissionChangesDetected: 5,
      permissionChangesReverted: 3,
      revertFailures: 2
    });

    expect(state.cumulative.sweepCount).toBe(2);
    expect(state.cumulative.alertCount).toBe(1);
    expect(state.cumulative.permissionChangesDetected).toBe(5);
    expect(state.cumulative.permissionChangesReverted).toBe(3);
    expect(state.cumulative.revertFailures).toBe(2);
  });

  it('handles restart count increment', () => {
    updateCumulativeStats(state, { restartCount: 1 });
    expect(state.cumulative.restartCount).toBe(1);
  });

  it('updates guild count', () => {
    updateCumulativeStats(state, { guildCount: 5 });
    expect(state.cumulative.guildCount).toBe(5);
    
    // Guild count can decrease
    updateCumulativeStats(state, { guildCount: -2 });
    expect(state.cumulative.guildCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateGuildState Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('updateGuildState', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('initializes new guild on first update', () => {
    updateGuildState(state, 'guild-1', {
      name: 'Test Guild',
      sweepCount: 1
    });

    expect(state.guilds['guild-1']).toBeDefined();
    expect(state.guilds['guild-1'].name).toBe('Test Guild');
    expect(state.guilds['guild-1'].sweepCount).toBe(1);
  });

  it('updates existing guild', () => {
    updateGuildState(state, 'guild-1', { name: 'Guild', sweepCount: 1 });
    updateGuildState(state, 'guild-1', { sweepCount: 5 });

    expect(state.guilds['guild-1'].sweepCount).toBe(5);
    expect(state.guilds['guild-1'].name).toBe('Guild');
  });

  it('tracks last sweep time', () => {
    const now = new Date().toISOString();
    
    updateGuildState(state, 'guild-1', {
      name: 'Test',
      lastSweep: now
    });

    expect(state.guilds['guild-1'].lastSweep).toBe(now);
  });

  it('updates permission change counters', () => {
    updateGuildState(state, 'guild-1', { name: 'Test' });
    updateGuildState(state, 'guild-1', {
      permissionChanges: 10,
      alertCount: 5
    });

    expect(state.guilds['guild-1'].permissionChanges).toBe(10);
    expect(state.guilds['guild-1'].alertCount).toBe(5);
  });

  it('manages monitoring enabled flag', () => {
    updateGuildState(state, 'guild-1', { name: 'Test', monitoring: true });
    expect(state.guilds['guild-1'].monitoring).toBe(true);

    updateGuildState(state, 'guild-1', { monitoring: false });
    expect(state.guilds['guild-1'].monitoring).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateRuntimeState Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('updateRuntimeState', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('recalculates current uptime from processStartTime', () => {
    // updateRuntimeState always recalculates uptime based on processStartTime
    updateRuntimeState(state, {});
    
    // Uptime should be >= 0 (calculated from processStartTime)
    expect(state.runtime.currentUptime).toBeGreaterThanOrEqual(0);
  });

  it('updates database status', () => {
    updateRuntimeState(state, {
      databaseStatus: { dev: 'connected', prod: 'connected' }
    });

    expect(state.runtime.databaseStatus.dev).toBe('connected');
    expect(state.runtime.databaseStatus.prod).toBe('connected');
  });

  it('updates active sweep intervals', () => {
    updateRuntimeState(state, {
      activeSweepIntervals: ['guild-1', 'guild-2']
    });

    expect(state.runtime.activeSweepIntervals).toEqual(['guild-1', 'guild-2']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordMetricsEvent Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recordMetricsEvent', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('creates hourly bucket if none exists', () => {
    recordMetricsEvent(state, 'sweep', 1);
    
    expect(state.metricsHistory.hourly).toHaveLength(1);
    expect(state.metricsHistory.hourly[0].sweeps).toBe(1);
  });

  it('increments existing hour bucket', () => {
    recordMetricsEvent(state, 'sweep', 1);
    recordMetricsEvent(state, 'sweep', 2);
    
    expect(state.metricsHistory.hourly).toHaveLength(1);
    expect(state.metricsHistory.hourly[0].sweeps).toBe(3);
  });

  it('tracks different event types', () => {
    recordMetricsEvent(state, 'sweep', 5);
    recordMetricsEvent(state, 'alert', 2);
    recordMetricsEvent(state, 'permission_change', 3);
    recordMetricsEvent(state, 'permission_revert', 1);
    recordMetricsEvent(state, 'error', 1);
    
    const hour = state.metricsHistory.hourly[0];
    expect(hour.sweeps).toBe(5);
    expect(hour.alerts).toBe(2);
    expect(hour.permissionChanges).toBe(3);
    expect(hour.permissionReverts).toBe(1);
    expect(hour.errors).toBe(1);
  });

  it('handles revert_failure event type', () => {
    recordMetricsEvent(state, 'revert_failure', 2);
    expect(state.metricsHistory.hourly[0].revertFailures).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMetricsSummary Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getMetricsSummary', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns zero summary for empty history', () => {
    const summary = getMetricsSummary(state, 24);
    
    expect(summary.sweeps).toBe(0);
    expect(summary.alerts).toBe(0);
    expect(summary.permissionChanges).toBe(0);
    expect(summary.permissionReverts).toBe(0);
    expect(summary.revertFailures).toBe(0);
    expect(summary.hoursWithData).toBe(0);
  });

  it('aggregates metrics within time window', () => {
    // Add some recent metrics
    recordMetricsEvent(state, 'sweep', 10);
    recordMetricsEvent(state, 'alert', 3);
    recordMetricsEvent(state, 'permission_change', 5);

    const summary = getMetricsSummary(state, 24);
    
    expect(summary.sweeps).toBe(10);
    expect(summary.alerts).toBe(3);
    expect(summary.permissionChanges).toBe(5);
  });

  it('counts hours with data', () => {
    // Add metrics for current hour
    recordMetricsEvent(state, 'sweep', 12);
    
    const summary = getMetricsSummary(state, 24);
    
    // Should have 1 hour with data
    expect(summary.hoursWithData).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMetricsTrend Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getMetricsTrend', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns empty array for no history', () => {
    const trend = getMetricsTrend(state, 24);
    expect(trend).toEqual([]);
  });

  it('returns metrics within time window', () => {
    recordMetricsEvent(state, 'sweep', 5);
    recordMetricsEvent(state, 'alert', 2);

    const trend = getMetricsTrend(state, 24);
    
    expect(trend).toHaveLength(1);
    expect(trend[0].sweeps).toBe(5);
    expect(trend[0].alerts).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isStateDegraded Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isStateDegraded', () => {
  it('returns false in normal operation', () => {
    // By default, state should not be degraded
    expect(isStateDegraded()).toBe(false);
  });
});
