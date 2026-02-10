/**
 * battle-turn session cleanup tests
 * @module tests/commands/battle-turn.cleanup
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('discord.js', () => ({
  SlashCommandBuilder: class {
    setName(): this { return this; }
    setDescription(): this { return this; }
    addStringOption(): this { return this; }
    setDMPermission(): this { return this; }
  },
}));

vi.mock('../../src/shared/logging/index.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../src/lib/dex-api.js', () => ({
  default: {
    getPokemon: (query: string | number) => ({ id: typeof query === 'number' ? query : 1, name: String(query) }),
    disabled: false,
    moves: {},
  },
}));

vi.mock('../../src/engine/index.js', () => ({
  default: {
    makeRuntimeFromDexEntry: (entry: { name?: string; id?: number }, level: number) => ({
      id: entry.id ?? 1,
      name: entry.name ?? 'mon',
      hp: 100,
      maxHp: 100,
      level,
    }),
    newBattleState: (a: unknown, b: unknown) => ({ a, b, turn: 1 }),
    newAction: (side: string, move: string) => ({ side, move }),
    resolveTurn: () => ({ log: [] }),
  },
}));

vi.mock('../../src/engine/rng.js', () => ({
  makeRNG: () => ({ next: () => 0.5 }),
}));

vi.mock('../../src/services/cache/engine-write-buffer.js', () => ({
  engineWriteBuffer: null,
}));

import {
  SESSION_TIMEOUT_MS,
  getSessionMetrics,
  __testing,
} from '../../src/commands/battle-turn.js';

const CLEANUP_INTERVAL_MS = 60 * 1000;

describe('battle-turn session cleanup (MEMLEAK.PHASE1.2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T00:00:00Z'));
    __testing.stopCleanupInterval();
    __testing.reset();
  });

  afterEach(() => {
    __testing.stopCleanupInterval();
    __testing.reset();
    vi.useRealTimers();
  });

  it('should create a session and set lastActivity on first access', () => {
    const session = __testing.ensureBattleState('user-a');
    expect(session).not.toBeNull();
    expect(session?.lastActivity).toBe(Date.now());

    const metrics = getSessionMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.active).toBe(1);
    expect(metrics.cleaned).toBe(0);
  });

  it('should update lastActivity on repeated access', () => {
    const session = __testing.ensureBattleState('user-b');
    expect(session).not.toBeNull();

    const oldTimestamp = Date.now() - 5000;
    const stored = __testing.getSession('user-b');
    if (stored) stored.lastActivity = oldTimestamp;

    vi.setSystemTime(new Date(Date.now() + 1000));
    const refreshed = __testing.ensureBattleState('user-b');
    expect(refreshed?.lastActivity).toBe(Date.now());
    expect(refreshed?.lastActivity).toBeGreaterThan(oldTimestamp);
  });

  it('should cleanup stale sessions and increment cleaned count', () => {
    __testing.ensureBattleState('user-c');
    const stored = __testing.getSession('user-c');
    if (stored) stored.lastActivity = Date.now() - SESSION_TIMEOUT_MS - 1;

    const cleaned = __testing.cleanupStaleSessions(Date.now());
    expect(cleaned).toBe(1);
    expect(__testing.getSession('user-c')).toBeNull();

    const metrics = getSessionMetrics();
    expect(metrics.cleaned).toBe(1);
    expect(metrics.active).toBe(0);
  });

  it('should preserve active sessions within timeout', () => {
    __testing.ensureBattleState('user-d');
    const stored = __testing.getSession('user-d');
    if (stored) stored.lastActivity = Date.now() - SESSION_TIMEOUT_MS + 1;

    const cleaned = __testing.cleanupStaleSessions(Date.now());
    expect(cleaned).toBe(0);
    expect(__testing.getSession('user-d')).not.toBeNull();
  });

  it('should cleanup stale sessions via interval', () => {
    __testing.ensureBattleState('user-e');
    const stored = __testing.getSession('user-e');
    if (stored) stored.lastActivity = Date.now() - SESSION_TIMEOUT_MS - 1;

    __testing.startCleanupInterval();
    vi.advanceTimersByTime(CLEANUP_INTERVAL_MS);

    expect(__testing.getSession('user-e')).toBeNull();
    expect(getSessionMetrics().cleaned).toBe(1);
  });

  it('should stop cleanup interval on SIGTERM', () => {
    __testing.startCleanupInterval();
    expect(__testing.getCleanupInterval()).not.toBeNull();

    process.emit('SIGTERM');
    expect(__testing.getCleanupInterval()).toBeNull();
  });

  it('should report session metrics accurately', () => {
    __testing.ensureBattleState('user-f');
    __testing.ensureBattleState('user-g');

    const stale = __testing.getSession('user-f');
    if (stale) stale.lastActivity = Date.now() - SESSION_TIMEOUT_MS - 1;

    __testing.cleanupStaleSessions(Date.now());

    const metrics = getSessionMetrics();
    expect(metrics.total).toBe(2);
    expect(metrics.cleaned).toBe(1);
    expect(metrics.active).toBe(1);
  });

  it('should not increment total when accessing same session repeatedly', () => {
    __testing.ensureBattleState('user-h');
    __testing.ensureBattleState('user-h');

    const metrics = getSessionMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.active).toBe(1);
  });
});
