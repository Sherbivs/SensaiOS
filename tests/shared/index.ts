/**
 * Test Shared Utilities - Central Export
 * 
 * Re-exports all centralized test utilities:
 * - Prisma mocks (client factories, data generators)
 * - Test fixtures (sample data for all domains)
 * - Custom assertions (domain-specific matchers)
 * 
 * @module tests/shared
 * 
 * @example
 * ```typescript
 * import {
 *   createMockPrismaWithMigrations,
 *   createMigrations,
 *   expectValidPokemonStats
 * } from '../shared';
 * ```
 */

// Prisma mock utilities
export {
  createMockPrismaWithMigrations,
  createMockPrismaWithSchema,
  createMockPrisma,
  createBasicMockPrisma,
  generateSampleMigrations,
  generateSampleSchema,
  type MockMigration,
  type MockTable,
  type MockColumn,
  type MockIndex,
  type MockConstraint,
  type MockSchemaData,
} from './prisma-mocks.js';

// PostgreSQL Pool mock utilities
export {
  createMockPoolWithMigrations,
  createMockPoolWithSchema,
  createMockPool,
  createBasicMockPool,
} from './pool-mocks.js';

// Test fixtures
export {
  // Migrations
  createMigrations,
  createMigration,
  // Pokémon
  createSpecies,
  createPokemon,
  // Users & Trainers
  createUser,
  createUserWithParty,
  // Battles
  createBattle,
  createBattleWithTrainers,
  // Encounters
  createEncounter,
  createEncounterWithPokemon,
  // Moves & Abilities
  createMove,
  createAbility,
  // Schema
  createTableSchema,
  createMultiTableSchema,
} from './fixtures.js';

// Custom assertions
export {
  // Pokémon
  expectValidPokemonStats,
  expectPokemonFainted,
  expectPokemonHealthy,
  expectValidMoveSet,
  // Party
  expectValidParty,
  expectPartyHasHealthyPokemon,
  expectPartyAllFainted,
  // Battle
  expectValidBattle,
  expectBattleActive,
  expectBattleCompleted,
  // Encounter
  expectValidEncounter,
  expectEncounterActive,
  expectEncounterEnded,
  // Version
  expectValidVersionFingerprint,
  expectVersionsMatch,
  expectVersionStatus,
  // Integrity
  expectSchemaValid,
  expectSchemaInvalid,
  expectDataValid,
  expectDataIssues,
  // Errors
  expectThrowsWithMessage,
  expectThrowsErrorType,
  expectErrorWithProperties,
  // Sync
  expectValidSyncState,
  expectSyncSafe,
  expectSyncBlocked,
  // Arrays
  expectArrayContainsWhere,
  expectArrayUnique,
  expectArraySorted,
} from './assertions.js';
