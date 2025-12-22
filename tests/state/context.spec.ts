/**
 * @file Context Module Unit Tests
 * @description Test suite for security bot guild context management
 * 
 * Tests cover:
 * - initializeGuild() new vs existing guild detection
 * - restoreGuildContext() full context assembly
 * - getTimeSinceLastSweep() duration calculation
 * - isSweepOverdue() threshold checking
 * - getGuildsNeedingSweep() filtering logic
 * - enableGuildMonitoring() / disableGuildMonitoring()
 * - getMonitoringStatus() status aggregation
 * - buildRestartSummary() formatted output
 * - getRecoveryRecommendations() prioritized suggestions
 * 
 * @module tests/state/context.spec
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  initializeGuild,
  restoreGuildContext,
  getTimeSinceLastSweep,
  isSweepOverdue,
  getGuildsNeedingSweep,
  enableGuildMonitoring,
  disableGuildMonitoring,
  getMonitoringStatus,
  buildRestartSummary,
  getRecoveryRecommendations,
} from '../../src/bot/state/context.js';
import { createDefaultState } from '../../src/bot/state/persistence.js';
import type { SecurityBotState } from '../../src/bot/state/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function createTestState(): SecurityBotState {
  return createDefaultState();
}

function setupGuildWithSweep(state: SecurityBotState, guildId: string, guildName: string, lastSweepAgo: number = 0): void {
  state.guilds[guildId] = {
    id: guildId,
    name: guildName,
    lastSweep: lastSweepAgo > 0 
      ? new Date(Date.now() - lastSweepAgo).toISOString()
      : new Date().toISOString(),
    sweepCount: 1,
    alertCount: 0,
    permissionChanges: 0,
    monitoring: true,
    lastActivity: new Date().toISOString()
  };
  state.cumulative.guildCount = Object.keys(state.guilds).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// initializeGuild Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('initializeGuild', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns true for new guild', () => {
    const isNew = initializeGuild(state, 'guild-new', 'New Guild');
    expect(isNew).toBe(true);
  });

  it('returns false for existing guild', () => {
    initializeGuild(state, 'guild-1', 'Guild 1');
    const isNew = initializeGuild(state, 'guild-1', 'Guild 1');
    expect(isNew).toBe(false);
  });

  it('creates guild state entry', () => {
    initializeGuild(state, 'guild-1', 'Test Guild');
    
    expect(state.guilds['guild-1']).toBeDefined();
    expect(state.guilds['guild-1'].name).toBe('Test Guild');
    expect(state.guilds['guild-1'].id).toBe('guild-1');
  });

  it('sets default values for new guild', () => {
    initializeGuild(state, 'guild-1', 'Test Guild');
    
    const guild = state.guilds['guild-1'];
    expect(guild.sweepCount).toBe(0);
    expect(guild.alertCount).toBe(0);
    expect(guild.permissionChanges).toBe(0);
    expect(guild.monitoring).toBe(true);
    expect(guild.lastSweep).toBeNull();
  });

  it('increments cumulative guild count for new guilds', () => {
    expect(state.cumulative.guildCount).toBe(0);
    
    initializeGuild(state, 'guild-1', 'Guild 1');
    expect(state.cumulative.guildCount).toBe(1);
    
    initializeGuild(state, 'guild-2', 'Guild 2');
    expect(state.cumulative.guildCount).toBe(2);
    
    // Existing guild doesn't increment
    initializeGuild(state, 'guild-1', 'Guild 1');
    expect(state.cumulative.guildCount).toBe(2);
  });

  it('updates lastActivity timestamp', () => {
    const before = new Date().toISOString();
    initializeGuild(state, 'guild-1', 'Guild');
    const after = new Date().toISOString();

    const lastActivity = state.guilds['guild-1'].lastActivity;
    expect(lastActivity >= before).toBe(true);
    expect(lastActivity <= after).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// restoreGuildContext Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('restoreGuildContext', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns context for new guild with isNew=true', () => {
    const context = restoreGuildContext(state, 'guild-new');
    
    expect(context.isNew).toBe(true);
    expect(context.sweepCount).toBe(0);
    expect(context.lastSweep).toBeNull();
  });

  it('returns context for existing guild with isNew=false', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    
    const context = restoreGuildContext(state, 'guild-1');
    expect(context.isNew).toBe(false);
  });

  it('includes sweep count from guild state', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    state.guilds['guild-1'].sweepCount = 5;
    
    const context = restoreGuildContext(state, 'guild-1');
    expect(context.sweepCount).toBe(5);
  });

  it('includes last sweep timestamp', () => {
    setupGuildWithSweep(state, 'guild-1', 'Guild', 60000);
    
    const context = restoreGuildContext(state, 'guild-1');
    expect(context.lastSweep).toBeDefined();
  });

  it('includes shouldResumeSweep from monitoring status', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    state.guilds['guild-1'].monitoring = false;
    
    const context = restoreGuildContext(state, 'guild-1');
    expect(context.shouldResumeSweep).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getTimeSinceLastSweep Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getTimeSinceLastSweep', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns null for unknown guild', () => {
    const timeSince = getTimeSinceLastSweep(state, 'unknown');
    expect(timeSince).toBeNull();
  });

  it('returns null for guild with no sweeps', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    
    const timeSince = getTimeSinceLastSweep(state, 'guild-1');
    expect(timeSince).toBeNull();
  });

  it('returns elapsed time since last sweep', () => {
    // Set last sweep 60 seconds ago
    setupGuildWithSweep(state, 'guild-1', 'Guild', 60000);
    
    const timeSince = getTimeSinceLastSweep(state, 'guild-1');
    expect(timeSince).toBeGreaterThanOrEqual(59000);
    expect(timeSince).toBeLessThan(61000);
  });

  it('returns small value for recent sweep', () => {
    setupGuildWithSweep(state, 'guild-1', 'Guild', 0);
    
    const timeSince = getTimeSinceLastSweep(state, 'guild-1');
    expect(timeSince).toBeLessThan(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isSweepOverdue Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('isSweepOverdue', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns true for unknown guild', () => {
    const overdue = isSweepOverdue(state, 'unknown');
    expect(overdue).toBe(true);
  });

  it('returns true for guild with no sweeps', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    
    const overdue = isSweepOverdue(state, 'guild-1');
    expect(overdue).toBe(true);
  });

  it('returns false for recent sweep within default interval', () => {
    // Sweep 1 minute ago, default is 5 minutes
    setupGuildWithSweep(state, 'guild-1', 'Guild', 60000);
    
    const overdue = isSweepOverdue(state, 'guild-1');
    expect(overdue).toBe(false);
  });

  it('returns true when sweep exceeds default interval', () => {
    // Sweep 6 minutes ago, default is 5 minutes
    setupGuildWithSweep(state, 'guild-1', 'Guild', 6 * 60 * 1000);
    
    const overdue = isSweepOverdue(state, 'guild-1');
    expect(overdue).toBe(true);
  });

  it('respects custom interval parameter', () => {
    // Sweep 2 minutes ago
    setupGuildWithSweep(state, 'guild-1', 'Guild', 2 * 60 * 1000);
    
    // Not overdue with 5 minute interval
    expect(isSweepOverdue(state, 'guild-1', 5 * 60 * 1000)).toBe(false);
    
    // Overdue with 1 minute interval
    expect(isSweepOverdue(state, 'guild-1', 60 * 1000)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getGuildsNeedingSweep Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getGuildsNeedingSweep', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns empty array for no guilds', () => {
    const guilds = getGuildsNeedingSweep(state);
    expect(guilds).toEqual([]);
  });

  it('returns guilds that need sweeping', () => {
    // Guild 1: overdue (10 min ago)
    setupGuildWithSweep(state, 'guild-1', 'Guild 1', 10 * 60 * 1000);
    
    // Guild 2: recent (1 min ago)
    setupGuildWithSweep(state, 'guild-2', 'Guild 2', 60 * 1000);

    const guilds = getGuildsNeedingSweep(state);
    
    expect(guilds).toHaveLength(1);
    expect(guilds[0].id).toBe('guild-1');
  });

  it('excludes guilds with monitoring disabled', () => {
    setupGuildWithSweep(state, 'guild-1', 'Guild 1', 10 * 60 * 1000);
    state.guilds['guild-1'].monitoring = false;

    const guilds = getGuildsNeedingSweep(state);
    expect(guilds).toHaveLength(0);
  });

  it('includes guilds with null lastSweep', () => {
    initializeGuild(state, 'guild-1', 'Never Swept');
    
    const guilds = getGuildsNeedingSweep(state);
    expect(guilds).toHaveLength(1);
    expect(guilds[0].id).toBe('guild-1');
  });

  it('respects custom interval parameter', () => {
    // Both guilds swept 3 minutes ago
    setupGuildWithSweep(state, 'guild-1', 'Guild 1', 3 * 60 * 1000);
    setupGuildWithSweep(state, 'guild-2', 'Guild 2', 3 * 60 * 1000);

    // With 2 minute interval, both overdue
    const overdueWith2Min = getGuildsNeedingSweep(state, 2 * 60 * 1000);
    expect(overdueWith2Min).toHaveLength(2);

    // With 5 minute interval, neither overdue
    const overdueWith5Min = getGuildsNeedingSweep(state, 5 * 60 * 1000);
    expect(overdueWith5Min).toHaveLength(0);
  });

  it('includes time since last sweep in result', () => {
    setupGuildWithSweep(state, 'guild-1', 'Guild', 10 * 60 * 1000);
    
    const guilds = getGuildsNeedingSweep(state);
    expect(guilds[0].timeSinceLastSweep).toBeGreaterThanOrEqual(9 * 60 * 1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// enableGuildMonitoring / disableGuildMonitoring Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('enableGuildMonitoring', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('enables monitoring for guild', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    state.guilds['guild-1'].monitoring = false;
    
    enableGuildMonitoring(state, 'guild-1');
    expect(state.guilds['guild-1'].monitoring).toBe(true);
  });

  it('handles unknown guild gracefully', () => {
    // Should not throw
    expect(() => enableGuildMonitoring(state, 'unknown')).not.toThrow();
  });

  it('is idempotent', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    
    enableGuildMonitoring(state, 'guild-1');
    enableGuildMonitoring(state, 'guild-1');
    expect(state.guilds['guild-1'].monitoring).toBe(true);
  });
});

describe('disableGuildMonitoring', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('disables monitoring for guild', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    
    disableGuildMonitoring(state, 'guild-1');
    expect(state.guilds['guild-1'].monitoring).toBe(false);
  });

  it('handles unknown guild gracefully', () => {
    expect(() => disableGuildMonitoring(state, 'unknown')).not.toThrow();
  });

  it('is idempotent', () => {
    initializeGuild(state, 'guild-1', 'Guild');
    
    disableGuildMonitoring(state, 'guild-1');
    disableGuildMonitoring(state, 'guild-1');
    expect(state.guilds['guild-1'].monitoring).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getMonitoringStatus Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getMonitoringStatus', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns empty array for no guilds', () => {
    const status = getMonitoringStatus(state);
    expect(status).toEqual([]);
  });

  it('returns status for all guilds', () => {
    initializeGuild(state, 'guild-1', 'Guild 1');
    initializeGuild(state, 'guild-2', 'Guild 2');

    const status = getMonitoringStatus(state);
    expect(status).toHaveLength(2);
  });

  it('includes monitoring flag per guild', () => {
    initializeGuild(state, 'guild-1', 'Monitored');
    initializeGuild(state, 'guild-2', 'Not Monitored');
    state.guilds['guild-2'].monitoring = false;

    const status = getMonitoringStatus(state);
    const guild1 = status.find(s => s.id === 'guild-1')!;
    const guild2 = status.find(s => s.id === 'guild-2')!;

    expect(guild1.monitoring).toBe(true);
    expect(guild2.monitoring).toBe(false);
  });

  it('includes sweep count per guild', () => {
    initializeGuild(state, 'guild-1', 'Guild 1');
    state.guilds['guild-1'].sweepCount = 10;

    const status = getMonitoringStatus(state);
    expect(status[0].sweepCount).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRestartSummary Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('buildRestartSummary', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns formatted restart summary', () => {
    const summary = buildRestartSummary(state);

    expect(summary).toHaveProperty('restartNumber');
    expect(summary).toHaveProperty('timeSinceLastRestart');
    expect(summary).toHaveProperty('totalUptime');
    expect(summary).toHaveProperty('currentUptime');
    expect(summary).toHaveProperty('totalSweeps');
    expect(summary).toHaveProperty('totalAlerts');
    expect(summary).toHaveProperty('guildsMonitored');
    expect(summary).toHaveProperty('databaseStatus');
  });

  it('reflects restart count from cumulative stats', () => {
    state.cumulative.restartCount = 5;
    
    const summary = buildRestartSummary(state);
    expect(summary.restartNumber).toBe(5);
  });

  it('includes guild count', () => {
    initializeGuild(state, 'guild-1', 'Guild 1');
    initializeGuild(state, 'guild-2', 'Guild 2');

    const summary = buildRestartSummary(state);
    expect(summary.guildsMonitored).toBe(2);
  });

  it('includes cumulative sweep and alert counts', () => {
    state.cumulative.sweepCount = 100;
    state.cumulative.alertCount = 25;

    const summary = buildRestartSummary(state);
    expect(summary.totalSweeps).toBe(100);
    expect(summary.totalAlerts).toBe(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRecoveryRecommendations Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('getRecoveryRecommendations', () => {
  let state: SecurityBotState;

  beforeEach(() => {
    state = createTestState();
  });

  it('returns empty array when no issues', () => {
    const recommendations = getRecoveryRecommendations(state);
    expect(recommendations).toEqual([]);
  });

  it('recommends sweep for overdue guilds', () => {
    // Guild with sweep 10 minutes ago
    setupGuildWithSweep(state, 'guild-1', 'Overdue Guild', 10 * 60 * 1000);
    
    const recommendations = getRecoveryRecommendations(state);
    
    const sweepRec = recommendations.find(r => r.action === 'resume_sweeps');
    expect(sweepRec).toBeDefined();
  });

  it('recommends investigation for recent errors', () => {
    // Add error to timeline
    state.timeline.unshift({
      type: 'error',
      timestamp: new Date().toISOString(),
      guildId: 'system',
      guildName: 'System',
      details: { message: 'Test error' }
    });

    const recommendations = getRecoveryRecommendations(state);
    
    const errorRec = recommendations.find(r => r.action === 'review_errors');
    expect(errorRec).toBeDefined();
  });

  it('recommends review for revert failures', () => {
    state.cumulative.revertFailures = 3;

    const recommendations = getRecoveryRecommendations(state);
    
    const revertRec = recommendations.find(r => r.action === 'review_reverts');
    expect(revertRec).toBeDefined();
  });

  it('includes priority field for each recommendation', () => {
    // Setup multiple issues
    state.cumulative.revertFailures = 5;
    setupGuildWithSweep(state, 'guild-1', 'Overdue', 10 * 60 * 1000);

    const recommendations = getRecoveryRecommendations(state);
    
    // Should have multiple recommendations
    expect(recommendations.length).toBeGreaterThan(0);
    
    // Each should have priority
    recommendations.forEach(rec => {
      expect(['high', 'medium', 'low']).toContain(rec.priority);
    });
  });

  it('includes message for each recommendation', () => {
    state.cumulative.revertFailures = 1;

    const recommendations = getRecoveryRecommendations(state);
    
    expect(recommendations[0].message).toBeDefined();
    expect(typeof recommendations[0].message).toBe('string');
    expect(recommendations[0].message.length).toBeGreaterThan(0);
  });
});
