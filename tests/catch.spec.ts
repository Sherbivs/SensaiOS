import { describe, it, expect, vi, afterEach } from "vitest";

// Create mock party data that the test can control
const mockPartyData = {
  party: null as { id: string; ownerId: string } | null,
  slots: [] as Array<{ slot: number; pokemonId: string }>,
};

// Mock pg-connection to prevent real database calls
vi.mock("../src/shared/pg-connection.js", () => ({
  initializeConnection: vi.fn().mockResolvedValue({}),
  closeConnection: vi.fn().mockResolvedValue(undefined),
  getConnection: vi.fn().mockReturnValue({
    isConnected: vi.fn().mockReturnValue(true),
    getPool: vi.fn().mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
    }),
  }),
  getProdDb: vi.fn().mockReturnValue({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  }),
}));

// Mock party-queries-pg to return test-controlled data
vi.mock("../src/shared/models/party-queries-pg.js", () => ({
  getPartyWithSlots: vi.fn().mockImplementation(async () => {
    if (!mockPartyData.party) return null;
    return {
      ...mockPartyData.party,
      slots: mockPartyData.slots,
    };
  }),
  addPokemonToParty: vi.fn().mockResolvedValue({ slot: 1 }),
}));

import { catchChance, attemptCatch } from "../src/core/encounter/catch.js";
import { UserRepo } from "../src/models/index.js";

// Export mockPartyData for tests to control
export { mockPartyData };

function inRange(x: number, lo: number, hi: number) {
  return x >= lo && x <= hi;
}

describe('catchChance', () => {
  it('returns a probability between 0.05 and 0.95', () => {
    for (let lvl = 2; lvl <= 30; lvl++) {
      const p = catchChance(lvl, 'poke');
      expect(inRange(p, 0.05, 0.95)).toBe(true);
    }
  });

  it('great and ultra balls increase chance vs poke ball', () => {
    for (let lvl = 2; lvl <= 10; lvl++) {
      const base = catchChance(lvl, 'poke');
      const great = catchChance(lvl, 'great');
      const ultra = catchChance(lvl, 'ultra');
      expect(great).toBeGreaterThanOrEqual(base);
      expect(ultra).toBeGreaterThanOrEqual(great);
    }
  });
});

function createState() {
  const usersByDiscord = new Map<string, any>();
  const usersById = new Map<string, any>();
  const encounters = new Map<string, any>();
  const pokemonInstances = new Map<string, any>();
  const parties = new Map<string, any>();
  const partySlots: any[] = [];
  return { usersByDiscord, usersById, encounters, pokemonInstances, parties, partySlots };
}

function createPrismaStub(state: ReturnType<typeof createState>) {
  let pokemonCounter = 1;
  let partyCounter = 1;
  return {
    user: {
      upsert: async ({ where, create }: any) => {
        const existing = state.usersByDiscord.get(where.discordId);
        if (existing) return existing;
        const id = create.id ?? `user_${state.usersByDiscord.size + 1}`;
        const record = { id, ...create };
        state.usersByDiscord.set(where.discordId, record);
        state.usersById.set(id, record);
        return record;
      },
      findUnique: async ({ where }: any) => {
        if (where.id) return state.usersById.get(where.id) ?? null;
        if (where.discordId) return state.usersByDiscord.get(where.discordId) ?? null;
        return null;
      },
    },
    encounter: {
      findUnique: async ({ where }: any) => {
        const record = state.encounters.get(where.id);
        if (!record) return null;
        return { ...record };
      },
      update: async ({ where, data }: any) => {
        const record = state.encounters.get(where.id);
        if (!record) throw new Error('encounter not found');
        Object.assign(record, data);
        if (data.dataJson !== undefined) {
          record.dataJson = data.dataJson;
        }
        return { ...record };
      },
    },
    pokemonInstance: {
      create: async ({ data }: any) => {
        const id = data.id ?? `poke_${pokemonCounter++}`;
        const record = { ...data, id };
        state.pokemonInstances.set(id, record);
        return { ...record };
      },
    },
    party: {
      findFirst: async ({ where }: any) => {
        for (const party of state.parties.values()) {
          if (party.ownerId === where.ownerId) return { ...party };
        }
        return null;
      },
      create: async ({ data }: any) => {
        const id = data.id ?? `party_${partyCounter++}`;
        const party = { id, ownerId: data.ownerId, createdAt: new Date() };
        state.parties.set(id, party);
        return { ...party };
      },
    },
    partySlot: {
      findMany: async ({ where }: any) =>
        state.partySlots.filter((slot) => slot.partyId === where.partyId).map((slot) => ({ ...slot })),
      create: async ({ data }: any) => {
        const record = { ...data, id: data.id ?? `slot_${state.partySlots.length + 1}` };
        state.partySlots.push(record);
        return { ...record };
      },
    },
  } as any;
}

describe('attemptCatch persistence', () => {
  const originalUpsert = UserRepo.upsertByDiscordId;

  afterEach(() => {
    UserRepo.upsertByDiscordId = originalUpsert;
    vi.restoreAllMocks();
    // Reset mock party data
    mockPartyData.party = null;
    mockPartyData.slots = [];
  });

  it('persists captured Pokémon and updates encounter metadata', async () => {
    const state = createState();
    const prisma = createPrismaStub(state);

    const user = { id: 'user_1', discordId: 'trainer', coins: 200 };
    state.usersByDiscord.set('trainer', user);
    state.usersById.set('user_1', user);
    const party = { id: 'party_1', ownerId: 'user_1', createdAt: new Date() };
    state.parties.set('party_1', party);
    state.encounters.set('enc_1', {
      id: 'enc_1',
      ownerId: 'user_1',
      speciesId: 25,
      level: 5,
      state: 'Spawned',
      expiresAt: new Date(Date.now() + 60_000),
      dataJson: {},
    });

    // Set up mock party data to match test state
    mockPartyData.party = { id: 'party_1', ownerId: 'user_1' };
    mockPartyData.slots = [];

    UserRepo.upsertByDiscordId = async (discordId: string, clientOverride: any) => {
      const client = clientOverride ?? prisma;
      return client.user.upsert({ where: { discordId }, create: { discordId, coins: 0 }, update: {} });
    };

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    const res = await attemptCatch({ discordId: 'trainer', encounterId: 'enc_1', prisma });

    expect(res.ok).toBe(true);
    expect(res.caught).toBe(true);
    expect(res.pokemonId).toBeTruthy();

    const stored = state.pokemonInstances.get(res.pokemonId!);
    expect(stored).toBeTruthy();
    expect(stored.ownerId).toBe('user_1');
    expect(stored.speciesId).toBe(25);

    const partySlots = state.partySlots.filter((slot) => slot.partyId === 'party_1');
    expect(partySlots).toHaveLength(1);
    expect(partySlots[0].pokemonId).toBe(res.pokemonId);

    const encounter = state.encounters.get('enc_1');
    expect(encounter.state).toBe('Caught');
    expect(encounter.dataJson.pokemonId).toBe(res.pokemonId);
    expect(encounter.dataJson.ball).toBe('poke');

    randomSpy.mockRestore();
  });
});
