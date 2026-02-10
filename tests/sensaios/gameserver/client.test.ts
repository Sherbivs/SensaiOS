/**
 * GameServer Client Tests
 * 
 * Tests for the SensaiOS GameServer API client including:
 * - Encryption/decryption of sensitive data
 * - Capability checking and authorization
 * - Rate limiting
 * - API operations (battles, encounters, trainers)
 * 
 * @module tests/sensaios/gameserver/client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initializeDevelopmentEncryption,
  isEncryptionInitialized,
  createEncryptedToken,
  extractRawValue,
} from '../../../src/sensaios/gameserver/encryption.js';
import {
  createGameServerClient,
  type GameServerAPI,
} from '../../../src/sensaios/gameserver/api.js';
import {
  API_CAPABILITIES,
  DEFAULT_RATE_LIMITS,
  type EncryptedToken,
  type GameCapability,
} from '../../../src/sensaios/gameserver/types.js';
import type { ComponentContext } from '../../../src/sensaios/component-context.js';
import type { ComponentManifest } from '../../../src/sensaios/component-manifest.js';

// ============================================================================// GLOBAL TEST SETUP
// ============================================================================

// Initialize encryption ONCE for all tests in this file
// This must be called before any test that uses encryption
beforeEach(() => {
  initializeDevelopmentEncryption();
});

// ============================================================================// TEST UTILITIES
// ============================================================================

/**
 * Create a mock ComponentContext for testing
 * 
 * The mocks are designed to work with the actual GameServerAPI implementation
 * which uses ctx.db.prisma for database access.
 */
function createMockContext(): ComponentContext {
  // Mock user data matching decrypted values from encrypted tokens
  const mockUser = {
    id: 'test-user-id',
    discordId: 'user-1',  // Matches createEncryptedToken('development', 'user-1', 'discord_id')
    coins: 1000,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: {
      pokemon: 5,
    },
  };
  
  const mockUser2 = {
    id: 'test-user-id-2',
    discordId: 'user-2',  // For opponent in battles
    coins: 500,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: {
      pokemon: 3,
    },
  };
  
  const mockParty = {
    id: 'party-1',
    ownerId: 'test-user-id',
    slots: [
      {
        id: 'slot-1',
        slot: 0,
        pokemon: {
          id: 'pokemon-1',
          speciesId: 25,
          nickname: 'Sparky',
          level: 10,
          hp: 35,
          maxHp: 35,
          isShiny: false,
          status: null,
          species: { name: 'Pikachu' },
        },
      },
    ],
  };
  
  const mockBattle = {
    id: 'test-battle-id',
    state: 'Pending',
    p1Id: 'test-user-id',
    p2Id: 'test-user-id-2',
    ruleset: 'singles',
    rngSeed: 'test-seed',
    logCompact: [],
    startedAt: new Date(),
    p1: { discordId: 'user-1' },
    p2: { discordId: 'user-2' },
  };
  
  const mockEncounter = {
    id: 'test-encounter-id',
    ownerId: 'test-user-id',
    speciesId: 25,
    level: 5,
    state: 'Spawned',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    startedAt: new Date(),
    dataJson: { rarity: 'common', isShiny: false, catchAttempts: 0 },
    owner: { id: 'test-user-id', discordId: 'user-1' },
    species: { name: 'Pikachu', baseHp: 35 },
  };
  
  return {
    db: {
      prisma: {
        battle: {
          create: vi.fn().mockResolvedValue(mockBattle),
          findUnique: vi.fn().mockImplementation(async (args: { where: { id: string } }) => {
            if (args.where.id === 'test-battle-id') {
              return mockBattle;
            }
            return null;
          }),
          update: vi.fn().mockResolvedValue(mockBattle),
        },
        encounter: {
          create: vi.fn().mockResolvedValue({
            ...mockEncounter,
            species: { name: 'Pikachu' },
          }),
          findUnique: vi.fn().mockImplementation(async (args: { where: { id: string } }) => {
            if (args.where.id === 'test-encounter-id') {
              return mockEncounter;
            }
            return null;
          }),
          update: vi.fn().mockResolvedValue(mockEncounter),
        },
        pokemonInstance: {
          create: vi.fn().mockResolvedValue({ id: 'new-pokemon-id' }),
        },
        user: {
          findUnique: vi.fn().mockImplementation(async (args: { where: { discordId: string }; select?: Record<string, unknown> }) => {
            if (args.where.discordId === 'user-1') {
              return mockUser;
            }
            if (args.where.discordId === 'user-2') {
              return mockUser2;
            }
            return null;
          }),
          findFirst: vi.fn().mockImplementation(async (args: { where: { discordId: string } }) => {
            if (args.where.discordId === 'user-1') {
              return mockUser;
            }
            if (args.where.discordId === 'user-2') {
              return mockUser2;
            }
            return null;
          }),
          update: vi.fn().mockImplementation(async (args: { where: { discordId: string }; data: { coins: { increment: number } } }) => {
            if (args.where.discordId === 'user-1') {
              return { coins: mockUser.coins + (args.data.coins?.increment ?? 0) };
            }
            throw new Error('User not found');
          }),
        },
        party: {
          findUnique: vi.fn().mockImplementation(async (args: { where: { ownerId: string } }) => {
            if (args.where.ownerId === 'test-user-id') {
              return mockParty;
            }
            return null;
          }),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ total: 10n, wins: 7n }]),
      } as unknown,
      transaction: vi.fn((fn) => fn({} as unknown)),
    } as unknown,
    exports: {
      append: vi.fn().mockResolvedValue({ seq: 1 }),
    } as unknown,
    rng: {
      derive: vi.fn(() => ({
        random: () => 0.5,
        int: (min: number) => min,
        weighted: <T,>(items: Array<{ weight: number; value: T }>) => items[0].value,
        shuffle: <T,>(array: T[]) => array.slice(),
      })),
    } as unknown,
    jobs: {
      enqueue: vi.fn().mockResolvedValue('job-id'),
    } as unknown,
    obs: {
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      metrics: {
        inc: vi.fn(),
        gauge: vi.fn(),
        timing: vi.fn(),
      },
      correlationId: 'test-correlation-id',
    } as unknown,
    scope: {
      tenant: 'test-tenant',
      environment: 'development',
    } as unknown,
    component: 'test-component',
  } as unknown as ComponentContext;
}

/**
 * Create a mock manifest with specified capabilities
 * Uses the actual GameCapability types from types.ts
 * Note: We use 'development' as the app name to match the appId used
 * when creating encrypted tokens with createEncryptedToken('development', ...)
 */
function createMockManifest(capabilities: GameCapability[] = []): ComponentManifest {
  return {
    name: 'development',
    version: '1.0.0',
    hosts: ['bot'],
    capabilities: {
      game: capabilities,
    },
  } as ComponentManifest;
}

// ============================================================================
// ENCRYPTION TESTS
// ============================================================================

describe('Encryption Module', () => {
  describe('initializeDevelopmentEncryption', () => {
    it('should initialize development encryption for testing', () => {
      initializeDevelopmentEncryption();
      expect(isEncryptionInitialized()).toBe(true);
    });
  });
  
  describe('createEncryptedToken / extractRawValue', () => {
    // Note: encryption is initialized in global beforeEach
    
    it('should create valid encrypted tokens', () => {
      // Signature: createEncryptedToken(appId, rawValue, fieldType)
      const token = createEncryptedToken('development', 'user-123', 'discord_id');
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('object');
      expect(token.token).toMatch(/^enc_v1_/);
      expect(token.type).toBe('discord_id');
    });
    
    it('should extract raw value from encrypted token', () => {
      const original = 'discord-user-456';
      // Signature: createEncryptedToken(appId, rawValue, fieldType)
      const token = createEncryptedToken('development', original, 'discord_id');
      
      // Signature: extractRawValue(appId, token)
      const extracted = extractRawValue('development', token);
      expect(extracted).toBe(original);
    });
    
    it('should work with different field types', () => {
      const fieldTypes = ['discord_id', 'channel_id'] as const;
      
      for (const fieldType of fieldTypes) {
        const value = `${fieldType}-12345`;
        // Signature: createEncryptedToken(appId, rawValue, fieldType)
        const token = createEncryptedToken('development', value, fieldType);
        // Signature: extractRawValue(appId, token)
        const extracted = extractRawValue('development', token);
        expect(extracted).toBe(value);
      }
    });
  });
});

// ============================================================================
// GAMESERVER API TESTS
// ============================================================================

describe('GameServerAPI', () => {
  let ctx: ComponentContext;
  
  beforeEach(() => {
    initializeDevelopmentEncryption();
    ctx = createMockContext();
  });
  
  describe('createGameServerClient', () => {
    it('should create API client with valid manifest', () => {
      const manifest = createMockManifest(['game.battle.create', 'game.battle.read']);
      const client = createGameServerClient(ctx, manifest);
      
      expect(client).toBeDefined();
      expect(client.battles).toBeDefined();
      expect(client.encounters).toBeDefined();
      expect(client.trainers).toBeDefined();
    });
    
    it('should expose battle methods', () => {
      const manifest = createMockManifest(['game.battle.create', 'game.battle.read']);
      const client = createGameServerClient(ctx, manifest);
      
      expect(typeof client.battles.create).toBe('function');
      expect(typeof client.battles.get).toBe('function');
      expect(typeof client.battles.submitMove).toBe('function');
      expect(typeof client.battles.forfeit).toBe('function');
    });
    
    it('should expose encounter methods', () => {
      const manifest = createMockManifest(['game.encounter.spawn']);
      const client = createGameServerClient(ctx, manifest);
      
      expect(typeof client.encounters.spawn).toBe('function');
      expect(typeof client.encounters.get).toBe('function');
      expect(typeof client.encounters.catch).toBe('function');
      expect(typeof client.encounters.flee).toBe('function');
    });
    
    it('should expose trainer methods', () => {
      const manifest = createMockManifest(['game.trainer.read', 'game.trainer.write']);
      const client = createGameServerClient(ctx, manifest);
      
      expect(typeof client.trainers.get).toBe('function');
      expect(typeof client.trainers.updateMoney).toBe('function');
      expect(typeof client.trainers.getParty).toBe('function');
    });
  });
  
  describe('Capability Checking', () => {
    it('should reject operations without required capability', async () => {
      const manifest = createMockManifest([]); // No capabilities
      const client = createGameServerClient(ctx, manifest);
      
      const challengerId = createEncryptedToken('development', 'user-1', 'discord_id');
      const opponentId = createEncryptedToken('development', 'user-2', 'discord_id');
      
      await expect(
        client.battles.create({
          challengerId,
          opponentId,
          format: 'singles',
        }),
      ).rejects.toThrow(/lacks required capability/i);
    });
    
    it('should allow operations with required capability', async () => {
      const manifest = createMockManifest(['game.battle.create']);
      const client = createGameServerClient(ctx, manifest);
      
      const challengerId = createEncryptedToken('development', 'user-1', 'discord_id');
      const opponentId = createEncryptedToken('development', 'user-2', 'discord_id');
      
      // Should not throw (stub implementation)
      const result = await client.battles.create({
        challengerId,
        opponentId,
        format: 'singles',
      });
      
      expect(result).toBeDefined();
      expect(result.status).toBe('pending');
    });
  });
  
  describe('Battle Operations', () => {
    let client: GameServerAPI;
    
    beforeEach(() => {
      const manifest = createMockManifest([
        'game.battle.create',
        'game.battle.read',
        'game.battle.write',
      ]);
      client = createGameServerClient(ctx, manifest);
    });
    
    it('should create a battle', async () => {
      const challengerId = createEncryptedToken('development', 'user-1', 'discord_id');
      const opponentId = createEncryptedToken('development', 'user-2', 'discord_id');
      
      const battle = await client.battles.create({
        challengerId,
        opponentId,
        format: 'singles',
      });
      
      expect(battle.id).toBeDefined();
      expect(battle.status).toBe('pending');
      expect(battle.participant1).toBeDefined();
      expect(battle.participant2).toBeDefined();
      expect(battle.turnNumber).toBe(0);
    });
    
    it('should return null for non-existent battle', async () => {
      const battle = await client.battles.get('non-existent-id');
      expect(battle).toBeNull();
    });
    
    it('should submit a move', async () => {
      const participantToken = createEncryptedToken('development', 'user-1', 'discord_id');
      
      const result = await client.battles.submitMove('battle-id', participantToken, {
        type: 'move',
        moveId: 'tackle',
      });
      
      expect(result.accepted).toBe(true);
    });
    
    it('should forfeit a battle', async () => {
      const participantToken = createEncryptedToken('development', 'user-1', 'discord_id');
      
      const result = await client.battles.forfeit('test-battle-id', participantToken);
      
      expect(result.battleId).toBe('test-battle-id');
      expect(result.endReason).toBe('forfeit');
    });
  });
  
  describe('Encounter Operations', () => {
    let client: GameServerAPI;
    
    beforeEach(() => {
      const manifest = createMockManifest([
        'game.encounter.spawn',
        'game.encounter.catch',
        'game.encounter.write',
      ]);
      client = createGameServerClient(ctx, manifest);
    });
    
    it('should spawn an encounter', async () => {
      // Note: The spawn API takes channelId but internally looks up the user
      // For testing, we pass a user token since that's what the mock supports
      const channelId = createEncryptedToken('development', 'user-1', 'channel_id');
      
      const encounter = await client.encounters.spawn({
        channelId,
        seed: 'user-1-1234567890',
      });
      
      expect(encounter.id).toBeDefined();
      expect(encounter.status).toBe('spawned');
      expect(encounter.speciesId).toBeGreaterThan(0);
    });
    
    it('should return null for non-existent encounter', async () => {
      const encounter = await client.encounters.get('non-existent-id');
      expect(encounter).toBeNull();
    });
    
    it('should attempt a catch', async () => {
      const ownerToken = createEncryptedToken('development', 'user-1', 'discord_id');
      
      const result = await client.encounters.catch({
        encounterId: 'test-encounter-id', // Use mock encounter ID
        ownerToken,
        ballType: 'poke',
      });
      
      expect(result.success).toBeDefined();
      expect(result.probability).toBeDefined();
    });
    
    it('should flee from encounter', async () => {
      const ownerToken = createEncryptedToken('development', 'user-1', 'discord_id');
      
      const result = await client.encounters.flee('test-encounter-id', ownerToken);
      
      expect(result.success).toBe(true);
      expect(result.status).toBe('fled');
    });
  });
  
  describe('Trainer Operations', () => {
    let client: GameServerAPI;
    
    beforeEach(() => {
      const manifest = createMockManifest([
        'game.trainer.read',
        'game.trainer.write',
      ]);
      client = createGameServerClient(ctx, manifest);
    });
    
    it('should get trainer profile', async () => {
      const discordIdToken = createEncryptedToken('development', 'user-1', 'discord_id');
      
      const trainer = await client.trainers.get(discordIdToken);
      
      expect(trainer).toBeDefined();
      expect(trainer!.displayName).toBeDefined();
      expect(trainer!.money).toBeDefined();
    });
    
    it('should update trainer money', async () => {
      const discordIdToken = createEncryptedToken('development', 'user-1', 'discord_id');
      
      const result = await client.trainers.updateMoney({
        discordId: discordIdToken,
        delta: 100,
        reason: 'test-reward',
      });
      
      expect(result.success).toBe(true);
      expect(result.newBalance).toBeDefined();
    });
    
    it('should get trainer party', async () => {
      const discordIdToken = createEncryptedToken('development', 'user-1', 'discord_id');
      
      const party = await client.trainers.getParty(discordIdToken);
      
      expect(party).toBeDefined();
      expect(party!.slots).toBeDefined();
      expect(Array.isArray(party!.slots)).toBe(true);
    });
  });
});

// ============================================================================
// API CAPABILITIES TESTS
// ============================================================================

describe('API Capabilities', () => {
  it('should define all required capabilities', () => {
    expect(API_CAPABILITIES.battles.create).toBe('game.battle.create');
    expect(API_CAPABILITIES.battles.get).toBe('game.battle.read');
    expect(API_CAPABILITIES.battles.submitMove).toBe('game.battle.write');
    expect(API_CAPABILITIES.battles.forfeit).toBe('game.battle.write');
    expect(API_CAPABILITIES.encounters.spawn).toBe('game.encounter.spawn');
    expect(API_CAPABILITIES.encounters.catch).toBe('game.encounter.catch');
    expect(API_CAPABILITIES.encounters.flee).toBe('game.encounter.write');
    expect(API_CAPABILITIES.trainers.get).toBe('game.trainer.read');
    expect(API_CAPABILITIES.trainers.updateMoney).toBe('game.trainer.write');
    expect(API_CAPABILITIES.trainers.getParty).toBe('game.trainer.read');
  });
  
  it('should define default rate limits for battle operations', () => {
    expect(DEFAULT_RATE_LIMITS['battles.create']).toBeDefined();
    expect(DEFAULT_RATE_LIMITS['battles.create'].maxRequests).toBeGreaterThan(0);
    expect(DEFAULT_RATE_LIMITS['battles.get']).toBeDefined();
    expect(DEFAULT_RATE_LIMITS['battles.submitMove']).toBeDefined();
    expect(DEFAULT_RATE_LIMITS['battles.forfeit']).toBeDefined();
  });
  
  it('should define default rate limits for encounter operations', () => {
    expect(DEFAULT_RATE_LIMITS['encounters.spawn']).toBeDefined();
    expect(DEFAULT_RATE_LIMITS['encounters.catch']).toBeDefined();
    expect(DEFAULT_RATE_LIMITS['encounters.flee']).toBeDefined();
  });
  
  it('should define default rate limits for trainer operations', () => {
    expect(DEFAULT_RATE_LIMITS['trainers.get']).toBeDefined();
    expect(DEFAULT_RATE_LIMITS['trainers.updateMoney']).toBeDefined();
    expect(DEFAULT_RATE_LIMITS['trainers.getParty']).toBeDefined();
  });
});

// ============================================================================
// AUDIT TRAIL TESTS
// ============================================================================

describe('Audit Trail', () => {
  let ctx: ComponentContext;
  let client: GameServerAPI;
  
  beforeEach(() => {
    initializeDevelopmentEncryption();
    ctx = createMockContext();
    const manifest = createMockManifest(['game.battle.create', 'game.battle.read']);
    client = createGameServerClient(ctx, manifest);
  });
  
  it('should log API calls to exports', async () => {
    const challengerId = createEncryptedToken('development', 'user-1', 'discord_id');
    const opponentId = createEncryptedToken('development', 'user-2', 'discord_id');
    
    await client.battles.create({
      challengerId,
      opponentId,
      format: 'singles',
    });
    
    // Verify exports.append was called for audit
    expect(ctx.exports.append).toHaveBeenCalled();
    
    const calls = (ctx.exports.append as ReturnType<typeof vi.fn>).mock.calls;
    const auditCall = calls.find((c: unknown[]) => (c[0] as { type: string }).type === 'api.call.audit');
    expect(auditCall).toBeDefined();
  });
});
