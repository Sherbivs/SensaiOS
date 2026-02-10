/**
 * Phase 1 integration test — bounded memory safety for C1, C2, C7
 * @module tests/memory/phase1-integration
 */

import { describe, expect, it, vi } from 'vitest';

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
  recordActivity,
  getBufferMetrics,
  __testing as activityTesting,
  MAX_PENDING_ACTIVITIES,
} from '../../src/utils/activityTracker.js';

import {
  SESSION_TIMEOUT_MS,
  getSessionMetrics,
  __testing as sessionTesting,
} from '../../src/commands/battle-turn.js';

import {
  RUNTIME_TIMEOUT_MS,
  getRuntimeMetrics,
  __testing as runtimeTesting,
} from '../../src/core/battle/turn-manager.js';

import { MemoryAuditTrail } from '../../src/core/pbsl/audit.js';

describe('Phase 1 integration — bounded memory safety', () => {
  it('should handle 1000 activities, 50 battles, and audit flushes within bounds', () => {
    const startRss = process.memoryUsage().rss;

    activityTesting.reset();
    sessionTesting.stopCleanupInterval();
    sessionTesting.reset();
    runtimeTesting.stopCleanupInterval();
    runtimeTesting.clear();

    // C1: Activity Tracker — 1000 activities
    for (let i = 0; i < MAX_PENDING_ACTIVITIES; i++) {
      recordActivity('integration', `event-${i}`);
    }
    const buffer = getBufferMetrics();
    expect(buffer.current).toBe(MAX_PENDING_ACTIVITIES);
    expect(buffer.utilization).toBe(100);

    // C7a: Battle Sessions — 50 sessions
    for (let i = 0; i < 50; i++) {
      const session = sessionTesting.ensureBattleState(`user-${i}`);
      expect(session).not.toBeNull();
    }
    expect(getSessionMetrics().active).toBe(50);

    // C7b: Battle Runtimes — 50 runtimes
    for (let i = 0; i < 50; i++) {
      runtimeTesting.ensureRuntime(`battle-${i}`);
    }
    expect(getRuntimeMetrics().active).toBe(50);

    // C2: Audit Trail — bounded + flush clears
    const audit = new MemoryAuditTrail(undefined, 1000);
    for (let i = 0; i < 1000; i++) {
      audit.record({ phase: 'phase1', action: `event-${i}` });
    }
    expect(audit.getMetrics().current).toBe(1000);
    audit.flush();
    expect(audit.getMetrics().current).toBe(0);

    // Cleanup stale sessions/runtimes
    const now = Date.now();
    for (let i = 0; i < 50; i++) {
      const session = sessionTesting.getSession(`user-${i}`);
      if (session) session.lastActivity = now - SESSION_TIMEOUT_MS - 1;
      const runtime = runtimeTesting.getRuntime(`battle-${i}`);
      if (runtime) runtime.lastActivity = now - RUNTIME_TIMEOUT_MS - 1;
    }
    sessionTesting.cleanupStaleSessions(now);
    runtimeTesting.cleanupStaleRuntimes(now);

    expect(getSessionMetrics().active).toBe(0);
    expect(getRuntimeMetrics().active).toBe(0);

    const endRss = process.memoryUsage().rss;
    const delta = endRss - startRss;
    const maxDelta = 5 * 1024 * 1024;
    expect(delta).toBeLessThanOrEqual(maxDelta);
  });
});
