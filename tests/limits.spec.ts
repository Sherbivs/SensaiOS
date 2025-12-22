import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg-connection to prevent database connection requirement
vi.mock('../src/shared/pg-connection.js', () => ({
  getProdDb: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
  getConnection: vi.fn().mockReturnValue({
    pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  }),
  initializeConnection: vi.fn().mockResolvedValue(undefined),
  closeConnection: vi.fn().mockResolvedValue(undefined),
}));

// Mock the query modules directly for fine-grained control
const mockEncounterQueries = vi.hoisted(() => ({
  findActiveEncounterForUser: vi.fn().mockResolvedValue(null),
}));

const mockBattleQueries = vi.hoisted(() => ({
  findActiveOrPendingBattleForUser: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/shared/models/encounter-queries-pg.js', () => mockEncounterQueries);
vi.mock('../src/shared/models/battle-queries-pg.js', () => mockBattleQueries);

import { hasActiveEncounter, hasActiveOrPendingBattle, canStartWalk, canChallengeBattle } from '../src/bot/middleware/limits';

describe('limits middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncounterQueries.findActiveEncounterForUser.mockResolvedValue(null);
    mockBattleQueries.findActiveOrPendingBattleForUser.mockResolvedValue(null);
  });

  it('detects active encounter', async () => {
    mockEncounterQueries.findActiveEncounterForUser.mockResolvedValue({ id: 'enc1' });
    expect(await hasActiveEncounter('u')).toBe(true);
  });
  
  it('allows walk when no active encounter', async () => {
    mockEncounterQueries.findActiveEncounterForUser.mockResolvedValue(null);
    const res = await canStartWalk('u');
    expect(res.ok).toBe(true);
  });
  
  it('detects active/pending battle', async () => {
    mockBattleQueries.findActiveOrPendingBattleForUser.mockResolvedValue({ id: 'bat1' });
    expect(await hasActiveOrPendingBattle('u')).toBe(true);
  });
  
  it('blocks challenge if either side busy', async () => {
    // Challenger is busy
    mockBattleQueries.findActiveOrPendingBattleForUser.mockResolvedValue({ id: 'bat1' });
    const r1 = await canChallengeBattle('a', 'b');
    expect(r1.ok).toBe(false);
    
    // Self challenge
    mockBattleQueries.findActiveOrPendingBattleForUser.mockResolvedValue(null);
    const r2 = await canChallengeBattle('a', 'a');
    expect(r2.ok).toBe(false);
  });
});
