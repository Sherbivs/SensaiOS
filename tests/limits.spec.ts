import { describe, it, expect } from 'vitest';

import { hasActiveEncounter, hasActiveOrPendingBattle, canStartWalk, canChallengeBattle } from '../src/bot/middleware/limits';

function makePrismaMock({ encounter = false, battle = false } = {}) {
  return {
    encounter: { findFirst: async () => (encounter ? { id: 'enc1' } : null) },
    battle: {
      findFirst: async (args?: any) => (battle ? { id: 'bat1', ...args } : null)
    },
  } as any;
}

describe('limits middleware', () => {
  it('detects active encounter', async () => {
    const prisma = makePrismaMock({ encounter: true });
    expect(await hasActiveEncounter('u', prisma)).toBe(true);
  });
  it('allows walk when no active encounter', async () => {
    const prisma = makePrismaMock({ encounter: false });
    const res = await canStartWalk('u', prisma);
    expect(res.ok).toBe(true);
  });
  it('detects active/pending battle', async () => {
    const prisma = makePrismaMock({ battle: true });
    expect(await hasActiveOrPendingBattle('u', prisma)).toBe(true);
  });
  it('blocks challenge if either side busy', async () => {
    const prismaBusySelf = makePrismaMock({ battle: true });
    const r1 = await canChallengeBattle('a', 'b', prismaBusySelf);
    expect(r1.ok).toBe(false);
    const prismaIdle = makePrismaMock({ battle: false });
    const r2 = await canChallengeBattle('a', 'a', prismaIdle);
    expect(r2.ok).toBe(false);
  });
});
