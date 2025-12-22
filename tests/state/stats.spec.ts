/**
 * @file Stats Module Unit Tests
 * @description Test suite for security bot runtime stats collector
 * 
 * Tests cover:
 * - recordSweep() event recording and state updates
 * - recordPermissionChange() with revert tracking
 * - recordAlert() delivery status
 * - recordError() timeline capture
 * - recordMemberFetchTimeout() chronic issue tracking
 * - getStatsSummary() formatted output
 * - getRecentEvents() timeline queries
 * - getGuildStats() and getAllGuildsSummary()
 * 
 * @module tests/state/stats.spec
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordSweep,
  recordPermissionChange,
  recordAlert,
  recordError,
  recordMemberFetchTimeout,
  updateDatabaseStatus,
  updateActiveSweeps,
  getStatsSummary,
  getRecentEvents,
  getGuildStats,
  getAllGuildsSummary,
  getTimeSinceRestart,
  formatUptime,
} from '../../src/bot/state/stats.js';
import { createDefaultState } from '../../src/bot/state/persistence.js';
import type { SecurityBotState } from '../../src/bot/state/types.js';

// Mock observabilityHub to avoid external dependencies
vi.mock('../../src/observability/index.js', () => ({
  observabilityHub: {
    ingest: vi.fn(),
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createTestState(): SecurityBotState {
  return createDefaultState();
}

// ─────────────────────────────────────────────────────────────────────────────
// recordSweep Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recordSweep', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('increments cumulative sweep count', () => {
    recordSweep(state, 'guild-1', 'Test Guild', 10, 0);
    expect(state.cumulative.sweepCount).toBe(1);

    recordSweep(state, 'guild-1', 'Test Guild', 15, 2);
    expect(state.cumulative.sweepCount).toBe(2);
  });

  it('initializes guild if not exists', () => {
    recordSweep(state, 'guild-new', 'New Guild', 5, 0);
    
    expect(state.guilds['guild-new']).toBeDefined();
    expect(state.guilds['guild-new'].name).toBe('New Guild');
    expect(state.guilds['guild-new'].sweepCount).toBe(1);
  });

  it('updates guild sweep count', () => {
    recordSweep(state, 'guild-1', 'Guild', 10, 0);
    recordSweep(state, 'guild-1', 'Guild', 10, 0);
    recordSweep(state, 'guild-1', 'Guild', 10, 0);

    expect(state.guilds['guild-1'].sweepCount).toBe(3);
  });

  it('sets lastSweep timestamp', () => {
    const before = new Date().toISOString();
    recordSweep(state, 'guild-1', 'Guild', 10, 0);
    const after = new Date().toISOString();

    const lastSweep = state.guilds['guild-1'].lastSweep!;
    expect(lastSweep >= before).toBe(true);
    expect(lastSweep <= after).toBe(true);
  });

  it('adds sweep event to timeline', () => {
    recordSweep(state, 'guild-1', 'Test Guild', 20, 5);

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].type).toBe('sweep');
    expect(state.timeline[0].guildName).toBe('Test Guild');
    
    const details = state.timeline[0].details as { rolesChecked: number; changesDetected: number };
    expect(details.rolesChecked).toBe(20);
    expect(details.changesDetected).toBe(5);
  });

  it('records sweep in metrics history', () => {
    recordSweep(state, 'guild-1', 'Guild', 10, 0);

    expect(state.metricsHistory.hourly).toHaveLength(1);
    expect(state.metricsHistory.hourly[0].sweeps).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordPermissionChange Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recordPermissionChange', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('increments permission changes detected', () => {
    recordPermissionChange(state, 'guild-1', 'Guild', 'user-1', 'User', 'role_added', false, 'not_attempted');
    expect(state.cumulative.permissionChangesDetected).toBe(1);
  });

  it('increments reverted count when reverted successfully', () => {
    recordPermissionChange(state, 'guild-1', 'Guild', 'user-1', 'User', 'role_added', true, 'success');
    
    expect(state.cumulative.permissionChangesDetected).toBe(1);
    expect(state.cumulative.permissionChangesReverted).toBe(1);
    expect(state.cumulative.revertFailures).toBe(0);
  });

  it('increments revert failures when revert fails', () => {
    recordPermissionChange(state, 'guild-1', 'Guild', 'user-1', 'User', 'role_added', true, 'failed');
    
    expect(state.cumulative.permissionChangesReverted).toBe(1);
    expect(state.cumulative.revertFailures).toBe(1);
  });

  it('does not count revert for non-reverted changes', () => {
    recordPermissionChange(state, 'guild-1', 'Guild', 'user-1', 'User', 'role_added', false, 'not_attempted');
    
    expect(state.cumulative.permissionChangesReverted).toBe(0);
    expect(state.cumulative.revertFailures).toBe(0);
  });

  it('adds permission change to timeline', () => {
    recordPermissionChange(state, 'guild-1', 'Test Guild', 'user-1', 'TestUser', 'role_removed', true, 'success');

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].type).toBe('permission_change');
    expect(state.timeline[0].guildName).toBe('Test Guild');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordAlert Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recordAlert', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('increments alert count', () => {
    recordAlert(state, 'guild-1', 'owner', 'Test reason', true);
    expect(state.cumulative.alertCount).toBe(1);

    recordAlert(state, 'guild-1', 'owner', 'Another reason', true);
    expect(state.cumulative.alertCount).toBe(2);
  });

  it('adds alert event to timeline', () => {
    recordAlert(state, 'guild-1', 'DripTVDD', 'Suspicious activity', true);

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].type).toBe('alert');
    
    const details = state.timeline[0].details as { recipient: string; reason: string; delivered: boolean };
    expect(details.recipient).toBe('DripTVDD');
    expect(details.reason).toBe('Suspicious activity');
    expect(details.delivered).toBe(true);
  });

  it('tracks failed delivery', () => {
    recordAlert(state, 'guild-1', 'owner', 'Test', false);

    const details = state.timeline[0].details as { delivered: boolean };
    expect(details.delivered).toBe(false);
  });

  it('records alert in metrics history', () => {
    recordAlert(state, 'guild-1', 'owner', 'Test', true);

    expect(state.metricsHistory.hourly[0].alerts).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordError Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recordError', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('adds error event to timeline', () => {
    recordError(state, 'Something went wrong');

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].type).toBe('error');
    
    const details = state.timeline[0].details as { message: string };
    expect(details.message).toBe('Something went wrong');
  });

  it('captures stack trace (truncated)', () => {
    const longStack = 'Error\n' + '    at func '.repeat(200);
    recordError(state, 'Error', longStack);

    const details = state.timeline[0].details as { stack: string };
    expect(details.stack).toBeDefined();
    expect(details.stack!.length).toBeLessThanOrEqual(500);
  });

  it('includes additional context', () => {
    recordError(state, 'API Error', null, { statusCode: 500, endpoint: '/test' });

    const details = state.timeline[0].details as unknown as { statusCode: number; endpoint: string };
    expect(details.statusCode).toBe(500);
    expect(details.endpoint).toBe('/test');
  });

  it('records error in metrics history', () => {
    recordError(state, 'Test error');

    expect(state.metricsHistory.hourly[0].errors).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// recordMemberFetchTimeout Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('recordMemberFetchTimeout', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
    // Initialize guild first
    state.guilds['guild-1'] = {
      id: 'guild-1',
      name: 'Test Guild',
      lastSweep: null,
      sweepCount: 0,
      alertCount: 0,
      permissionChanges: 0,
      monitoring: true,
      lastActivity: new Date().toISOString()
    };
  });

  it('tracks timeout in guild state', () => {
    recordMemberFetchTimeout(state, 'guild-1', 'Test Guild', 'roleCheck', 1, 3);

    expect(state.guilds['guild-1'].memberFetchTimeouts).toBe(1);
    expect(state.guilds['guild-1'].lastMemberFetchTimeout).toBeDefined();
  });

  it('increments timeout count on multiple timeouts', () => {
    recordMemberFetchTimeout(state, 'guild-1', 'Guild', 'roleCheck', 1, 3);
    recordMemberFetchTimeout(state, 'guild-1', 'Guild', 'roleCheck', 2, 3);
    recordMemberFetchTimeout(state, 'guild-1', 'Guild', 'roleCheck', 3, 3);

    expect(state.guilds['guild-1'].memberFetchTimeouts).toBe(3);
  });

  it('adds timeout event to timeline', () => {
    recordMemberFetchTimeout(state, 'guild-1', 'Test Guild', 'roleCheck', 2, 3);

    expect(state.timeline).toHaveLength(1);
    expect(state.timeline[0].type).toBe('member_fetch_timeout');
    
    const details = state.timeline[0].details as { attempt: number; maxRetries: number; isFinal: boolean };
    expect(details.attempt).toBe(2);
    expect(details.maxRetries).toBe(3);
    expect(details.isFinal).toBe(false);
  });

  it('marks final attempt correctly', () => {
    recordMemberFetchTimeout(state, 'guild-1', 'Guild', 'roleCheck', 3, 3);

    const details = state.timeline[0].details as { isFinal: boolean };
    expect(details.isFinal).toBe(true);
  });

  it('records timeout in metrics history', () => {
    recordMemberFetchTimeout(state, 'guild-1', 'Guild', 'roleCheck', 1, 3);

    expect(state.metricsHistory.hourly[0].memberFetchTimeouts).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getStatsSummary Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getStatsSummary', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns formatted summary with all fields', () => {
    const summary = getStatsSummary(state);

    expect(summary).toHaveProperty('currentUptime');
    expect(summary).toHaveProperty('totalUptime');
    expect(summary).toHaveProperty('timeSinceRestart');
    expect(summary).toHaveProperty('restartCount');
    expect(summary).toHaveProperty('sweepCount');
    expect(summary).toHaveProperty('alertCount');
    expect(summary).toHaveProperty('permissionChangesDetected');
    expect(summary).toHaveProperty('permissionChangesReverted');
    expect(summary).toHaveProperty('revertFailures');
    expect(summary).toHaveProperty('guildCount');
    expect(summary).toHaveProperty('databaseStatus');
  });

  it('reflects cumulative stats', () => {
    recordSweep(state, 'guild-1', 'Guild', 10, 0);
    recordSweep(state, 'guild-2', 'Guild2', 10, 0);
    recordAlert(state, 'guild-1', 'owner', 'test', true);

    const summary = getStatsSummary(state);

    expect(summary.sweepCount).toBe(2);
    expect(summary.alertCount).toBe(1);
  });

  it('counts guilds correctly', () => {
    recordSweep(state, 'guild-1', 'Guild 1', 10, 0);
    recordSweep(state, 'guild-2', 'Guild 2', 10, 0);
    recordSweep(state, 'guild-3', 'Guild 3', 10, 0);

    const summary = getStatsSummary(state);
    expect(summary.guildCount).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRecentEvents Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getRecentEvents', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns empty array for no events', () => {
    const events = getRecentEvents(state);
    expect(events).toEqual([]);
  });

  it('returns all events when less than limit', () => {
    recordSweep(state, 'guild-1', 'Guild', 10, 0);
    recordAlert(state, 'guild-1', 'owner', 'test', true);

    const events = getRecentEvents(state);
    expect(events).toHaveLength(2);
  });

  it('respects limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      recordSweep(state, `guild-${i}`, `Guild ${i}`, 10, 0);
    }

    const events = getRecentEvents(state, 5);
    expect(events).toHaveLength(5);
  });

  it('returns newest events first (timeline uses unshift)', () => {
    recordSweep(state, 'guild-1', 'First', 10, 0);
    recordSweep(state, 'guild-2', 'Second', 10, 0);
    recordSweep(state, 'guild-3', 'Third', 10, 0);

    const events = getRecentEvents(state, 2);
    expect(events[0].guildName).toBe('Third');
    expect(events[1].guildName).toBe('Second');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getGuildStats Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getGuildStats', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns null for unknown guild', () => {
    const stats = getGuildStats(state, 'unknown');
    expect(stats).toBeNull();
  });

  it('returns guild state for known guild', () => {
    recordSweep(state, 'guild-1', 'Test Guild', 15, 3);

    const stats = getGuildStats(state, 'guild-1');
    expect(stats).not.toBeNull();
    expect(stats!.name).toBe('Test Guild');
    expect(stats!.sweepCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getAllGuildsSummary Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getAllGuildsSummary', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns empty array for no guilds', () => {
    const summary = getAllGuildsSummary(state);
    expect(summary).toEqual([]);
  });

  it('returns summary for all guilds', () => {
    recordSweep(state, 'guild-1', 'Guild 1', 10, 0);
    recordSweep(state, 'guild-2', 'Guild 2', 10, 0);

    const summary = getAllGuildsSummary(state);
    expect(summary).toHaveLength(2);
    expect(summary.map(g => g.name)).toContain('Guild 1');
    expect(summary.map(g => g.name)).toContain('Guild 2');
  });

  it('includes sweep count per guild', () => {
    recordSweep(state, 'guild-1', 'Guild 1', 10, 0);
    recordSweep(state, 'guild-1', 'Guild 1', 10, 0);
    recordSweep(state, 'guild-1', 'Guild 1', 10, 0);
    recordSweep(state, 'guild-2', 'Guild 2', 10, 0);

    const summary = getAllGuildsSummary(state);
    const guild1 = summary.find(g => g.id === 'guild-1')!;
    const guild2 = summary.find(g => g.id === 'guild-2')!;

    expect(guild1.sweepCount).toBe(3);
    expect(guild2.sweepCount).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utility Function Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getTimeSinceRestart', () => {
  it('returns time since restart', () => {
    const state = createTestState();
    
    // Wait a tiny bit
    const timeSince = getTimeSinceRestart(state);
    
    expect(timeSince).toBeGreaterThanOrEqual(0);
    expect(timeSince).toBeLessThan(1000); // Should be < 1 second
  });
});

describe('formatUptime', () => {
  it('formats milliseconds to human readable', () => {
    // formatUptime delegates to formatDuration
    const formatted = formatUptime(3661000); // 1h 1m 1s
    
    // Should contain hours and minutes at minimum
    expect(formatted).toContain('1');
  });

  it('handles zero', () => {
    const formatted = formatUptime(0);
    expect(formatted).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateDatabaseStatus Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('updateDatabaseStatus', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('updates dev database status', () => {
    updateDatabaseStatus(state, 'connected', undefined);
    expect(state.runtime.databaseStatus.dev).toBe('connected');
  });

  it('updates prod database status', () => {
    updateDatabaseStatus(state, undefined, 'disconnected');
    expect(state.runtime.databaseStatus.prod).toBe('disconnected');
  });

  it('updates both statuses', () => {
    updateDatabaseStatus(state, 'connected', 'connected');
    expect(state.runtime.databaseStatus.dev).toBe('connected');
    expect(state.runtime.databaseStatus.prod).toBe('connected');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// updateActiveSweeps Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('updateActiveSweeps', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('updates active sweep intervals', () => {
    updateActiveSweeps(state, ['guild-1', 'guild-2', 'guild-3']);
    expect(state.runtime.activeSweepIntervals).toEqual(['guild-1', 'guild-2', 'guild-3']);
  });

  it('can clear active sweeps', () => {
    updateActiveSweeps(state, ['guild-1']);
    updateActiveSweeps(state, []);
    expect(state.runtime.activeSweepIntervals).toEqual([]);
  });
});
