/**
 * Test Fixtures - Centralized Sample Data Factories
 * 
 * Provides consistent test data generators for:
 * - Database migrations
 * - Pokémon species and instances
 * - Users and trainers
 * - Parties and team composition
 * - Battles and encounters
 * - Moves and abilities
 * 
 * @module tests/shared/fixtures
 */

import type { MockMigration } from './prisma-mocks.js';

// ============================================================================
// MIGRATION FIXTURES
// ============================================================================

/**
 * Create sample migration data for version tracking tests
 * 
 * @param count Number of migrations to generate
 * @param startDate Starting date for migrations (defaults to 30 days ago)
 * @returns Array of mock migration objects
 */
export function createMigrations(count: number, startDate?: Date): MockMigration[] {
  const base = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const migrations: MockMigration[] = [];

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    migrations.push({
      migration_name: `${timestamp.toISOString().split('T')[0].replace(/-/g, '')}_migration_${i + 1}`,
      checksum: `checksum_${i + 1}_${Math.random().toString(36).substring(7)}`,
      applied_steps_count: 1,
      started_at: timestamp,
      finished_at: new Date(timestamp.getTime() + 5000),
    });
  }

  return migrations;
}

/**
 * Create migration with specific properties
 */
export function createMigration(overrides?: Partial<MockMigration>): MockMigration {
  const timestamp = new Date();
  return {
    migration_name: `20251107000000_test_migration`,
    checksum: `checksum_${Math.random().toString(36).substring(7)}`,
    applied_steps_count: 1,
    started_at: timestamp,
    finished_at: new Date(timestamp.getTime() + 5000),
    ...overrides,
  };
}

// ============================================================================
// POKÉMON FIXTURES
// ============================================================================

/**
 * Create sample Pokémon species data
 */
export function createSpecies(overrides?: Partial<{
  id: number;
  name: string;
  nationalDex: number;
  types: string[];
  baseStats: Record<string, number>;
}>) {
  return {
    id: 1,
    name: 'Bulbasaur',
    nationalDex: 1,
    types: ['Grass', 'Poison'],
    baseStats: {
      hp: 45,
      attack: 49,
      defense: 49,
      spAttack: 65,
      spDefense: 65,
      speed: 45,
    },
    ...overrides,
  };
}

/**
 * Create sample Pokémon instance data
 */
export function createPokemon(overrides?: Partial<{
  id: string;
  nickname: string;
  level: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  speciesId: number;
  moves: string[];
}>) {
  return {
    id: `poke_${Math.random().toString(36).substring(7)}`,
    nickname: 'TestMon',
    level: 5,
    hp: 20,
    maxHp: 20,
    attack: 10,
    defense: 10,
    spAttack: 10,
    spDefense: 10,
    speed: 10,
    speciesId: 1,
    moves: ['Tackle', 'Growl'],
    ...overrides,
  };
}

// ============================================================================
// USER & TRAINER FIXTURES
// ============================================================================

/**
 * Create sample user/trainer data
 */
export function createUser(overrides?: Partial<{
  id: string;
  discordId: string;
  username: string;
  coins: number;
  createdAt: Date;
}>) {
  const id = overrides?.discordId || `${Math.floor(Math.random() * 1000000000000000000)}`;
  return {
    id,
    discordId: id,
    username: `TestUser_${id.substring(0, 8)}`,
    coins: 1000,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create user with party and Pokémon
 */
export function createUserWithParty(overrides?: {
  user?: Partial<ReturnType<typeof createUser>>;
  pokemonCount?: number;
  pokemonOverrides?: Partial<ReturnType<typeof createPokemon>>[];
}) {
  const user = createUser(overrides?.user);
  const count = overrides?.pokemonCount || 1;
  const pokemon = Array.from({ length: count }, (_, i) => 
    createPokemon({
      ...(overrides?.pokemonOverrides?.[i] || {}),
      id: `${user.id}_poke_${i}`,
    })
  );

  return {
    user,
    party: {
      id: `party_${user.id}`,
      userId: user.id,
      slots: pokemon.map((p, i) => ({
        id: `slot_${i}`,
        position: i,
        pokemonId: p.id,
        pokemon: p,
      })),
    },
  };
}

// ============================================================================
// BATTLE FIXTURES
// ============================================================================

/**
 * Create sample battle data
 */
export function createBattle(overrides?: Partial<{
  id: string;
  trainerId: string;
  opponentId: string;
  status: string;
  turn: number;
  createdAt: Date;
}>) {
  return {
    id: `battle_${Math.random().toString(36).substring(7)}`,
    trainerId: 'user_1',
    opponentId: 'user_2',
    status: 'active',
    turn: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create battle with participants
 */
export function createBattleWithTrainers(overrides?: {
  trainer1?: Partial<ReturnType<typeof createUserWithParty>>;
  trainer2?: Partial<ReturnType<typeof createUserWithParty>>;
  battle?: Partial<ReturnType<typeof createBattle>>;
}) {
  const trainer1 = createUserWithParty(overrides?.trainer1);
  const trainer2 = createUserWithParty(overrides?.trainer2);
  
  const battle = createBattle({
    trainerId: trainer1.user.id,
    opponentId: trainer2.user.id,
    ...overrides?.battle,
  });

  return {
    battle,
    trainer1,
    trainer2,
  };
}

// ============================================================================
// ENCOUNTER FIXTURES
// ============================================================================

/**
 * Create sample wild encounter data
 */
export function createEncounter(overrides?: Partial<{
  id: string;
  trainerId: string;
  wildPokemonId: string;
  status: string;
  turn: number;
  createdAt: Date;
}>) {
  return {
    id: `encounter_${Math.random().toString(36).substring(7)}`,
    trainerId: 'user_1',
    wildPokemonId: `wild_${Math.random().toString(36).substring(7)}`,
    status: 'active',
    turn: 1,
    createdAt: new Date(),
    ...overrides,
  };
}

/**
 * Create encounter with trainer and wild Pokémon
 */
export function createEncounterWithPokemon(overrides?: {
  trainer?: Partial<ReturnType<typeof createUserWithParty>>;
  wildPokemon?: Partial<ReturnType<typeof createPokemon>>;
  encounter?: Partial<ReturnType<typeof createEncounter>>;
}) {
  const trainer = createUserWithParty(overrides?.trainer);
  const wildPokemon = createPokemon({
    ...overrides?.wildPokemon,
    id: `wild_${Math.random().toString(36).substring(7)}`,
  });

  const encounter = createEncounter({
    trainerId: trainer.user.id,
    wildPokemonId: wildPokemon.id,
    ...overrides?.encounter,
  });

  return {
    encounter,
    trainer,
    wildPokemon,
  };
}

// ============================================================================
// MOVE & ABILITY FIXTURES
// ============================================================================

/**
 * Create sample move data
 */
export function createMove(overrides?: Partial<{
  id: number;
  name: string;
  type: string;
  category: string;
  power: number;
  accuracy: number;
  pp: number;
  priority: number;
  effect: string;
}>) {
  return {
    id: 1,
    name: 'Tackle',
    type: 'Normal',
    category: 'Physical',
    power: 40,
    accuracy: 100,
    pp: 35,
    priority: 0,
    effect: 'Deals damage with no additional effect.',
    ...overrides,
  };
}

/**
 * Create sample ability data
 */
export function createAbility(overrides?: Partial<{
  id: number;
  name: string;
  description: string;
  effect: string;
}>) {
  return {
    id: 1,
    name: 'Overgrow',
    description: 'Powers up Grass-type moves when the Pokémon\'s HP is low.',
    effect: 'When HP is below 1/3, Grass-type moves deal 1.5x damage.',
    ...overrides,
  };
}

// ============================================================================
// SCHEMA FIXTURES (for integrity tests)
// ============================================================================

/**
 * Create sample table schema data
 */
export function createTableSchema(overrides?: Partial<{
  tableName: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
  indexes: Array<{ name: string; columns: string[] }>;
  constraints: Array<{ name: string; type: string; columns: string[] }>;
}>) {
  return {
    tableName: 'User',
    columns: [
      { name: 'id', type: 'text', nullable: false },
      { name: 'discordId', type: 'text', nullable: false },
      { name: 'username', type: 'text', nullable: false },
      { name: 'coins', type: 'integer', nullable: false },
    ],
    indexes: [
      { name: 'User_discordId_key', columns: ['discordId'] },
    ],
    constraints: [
      { name: 'User_pkey', type: 'PRIMARY KEY', columns: ['id'] },
    ],
    ...overrides,
  };
}

/**
 * Create multiple table schemas for complex integrity tests
 */
export function createMultiTableSchema(tableNames: string[]) {
  return tableNames.map((name) => createTableSchema({ tableName: name }));
}
