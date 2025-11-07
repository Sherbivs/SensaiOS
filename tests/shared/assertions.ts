/**
 * Custom Test Assertions - Vitest Matchers
 * 
 * Provides domain-specific assertions for:
 * - Pokémon validation (stats, moves, status)
 * - Battle state verification
 * - Database integrity checks
 * - Version comparison
 * - Error handling patterns
 * 
 * @module tests/shared/assertions
 */

import { expect } from 'vitest';

// ============================================================================
// POKÉMON ASSERTIONS
// ============================================================================

/**
 * Assert Pokémon has valid stats within expected ranges
 */
export function expectValidPokemonStats(pokemon: any, level: number = 5) {
  expect(pokemon).toBeDefined();
  expect(pokemon.level).toBe(level);
  expect(pokemon.hp).toBeGreaterThan(0);
  expect(pokemon.hp).toBeLessThanOrEqual(pokemon.maxHp);
  expect(pokemon.maxHp).toBeGreaterThan(0);
  expect(pokemon.attack).toBeGreaterThan(0);
  expect(pokemon.defense).toBeGreaterThan(0);
  expect(pokemon.spAttack).toBeGreaterThan(0);
  expect(pokemon.spDefense).toBeGreaterThan(0);
  expect(pokemon.speed).toBeGreaterThan(0);
}

/**
 * Assert Pokémon is fainted (HP = 0)
 */
export function expectPokemonFainted(pokemon: any) {
  expect(pokemon).toBeDefined();
  expect(pokemon.hp).toBe(0);
}

/**
 * Assert Pokémon is healthy (HP > 0)
 */
export function expectPokemonHealthy(pokemon: any) {
  expect(pokemon).toBeDefined();
  expect(pokemon.hp).toBeGreaterThan(0);
  expect(pokemon.hp).toBeLessThanOrEqual(pokemon.maxHp);
}

/**
 * Assert Pokémon has valid move set
 */
export function expectValidMoveSet(pokemon: any, minMoves: number = 1, maxMoves: number = 4) {
  expect(pokemon).toBeDefined();
  expect(pokemon.moves).toBeDefined();
  expect(Array.isArray(pokemon.moves)).toBe(true);
  expect(pokemon.moves.length).toBeGreaterThanOrEqual(minMoves);
  expect(pokemon.moves.length).toBeLessThanOrEqual(maxMoves);
  pokemon.moves.forEach((move: string) => {
    expect(move).toBeTruthy();
    expect(typeof move).toBe('string');
  });
}

// ============================================================================
// PARTY ASSERTIONS
// ============================================================================

/**
 * Assert party has valid structure with slots
 */
export function expectValidParty(party: any, expectedSlots: number = 6) {
  expect(party).toBeDefined();
  expect(party.id).toBeTruthy();
  expect(party.userId).toBeTruthy();
  expect(party.slots).toBeDefined();
  expect(Array.isArray(party.slots)).toBe(true);
  expect(party.slots.length).toBeLessThanOrEqual(expectedSlots);
}

/**
 * Assert party has at least one healthy Pokémon
 */
export function expectPartyHasHealthyPokemon(party: any) {
  expectValidParty(party);
  const healthyCount = party.slots.filter((slot: any) => 
    slot.pokemon && slot.pokemon.hp > 0
  ).length;
  expect(healthyCount).toBeGreaterThan(0);
}

/**
 * Assert all party Pokémon are fainted
 */
export function expectPartyAllFainted(party: any) {
  expectValidParty(party);
  party.slots.forEach((slot: any) => {
    if (slot.pokemon) {
      expectPokemonFainted(slot.pokemon);
    }
  });
}

// ============================================================================
// BATTLE ASSERTIONS
// ============================================================================

/**
 * Assert battle has valid structure and state
 */
export function expectValidBattle(battle: any) {
  expect(battle).toBeDefined();
  expect(battle.id).toBeTruthy();
  expect(battle.trainerId).toBeTruthy();
  expect(battle.opponentId).toBeTruthy();
  expect(battle.status).toBeTruthy();
  expect(['active', 'completed', 'forfeit']).toContain(battle.status);
  expect(battle.turn).toBeGreaterThanOrEqual(1);
}

/**
 * Assert battle is active
 */
export function expectBattleActive(battle: any) {
  expectValidBattle(battle);
  expect(battle.status).toBe('active');
}

/**
 * Assert battle is completed
 */
export function expectBattleCompleted(battle: any) {
  expectValidBattle(battle);
  expect(['completed', 'forfeit']).toContain(battle.status);
}

// ============================================================================
// ENCOUNTER ASSERTIONS
// ============================================================================

/**
 * Assert encounter has valid structure
 */
export function expectValidEncounter(encounter: any) {
  expect(encounter).toBeDefined();
  expect(encounter.id).toBeTruthy();
  expect(encounter.trainerId).toBeTruthy();
  expect(encounter.wildPokemonId).toBeTruthy();
  expect(encounter.status).toBeTruthy();
  expect(['active', 'caught', 'fled', 'defeated']).toContain(encounter.status);
}

/**
 * Assert encounter is active
 */
export function expectEncounterActive(encounter: any) {
  expectValidEncounter(encounter);
  expect(encounter.status).toBe('active');
}

/**
 * Assert encounter ended with specific outcome
 */
export function expectEncounterEnded(encounter: any, expectedStatus: 'caught' | 'fled' | 'defeated') {
  expectValidEncounter(encounter);
  expect(encounter.status).toBe(expectedStatus);
}

// ============================================================================
// DATABASE VERSION ASSERTIONS
// ============================================================================

/**
 * Assert version has valid fingerprint structure
 */
export function expectValidVersionFingerprint(version: any) {
  expect(version).toBeDefined();
  expect(version.environment).toBeTruthy();
  expect(version.fingerprint).toBeTruthy();
  expect(version.fingerprint).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  expect(version.migrationCount).toBeGreaterThanOrEqual(0);
  expect(version.lastMigration).toBeTruthy();
  expect(version.timestamp).toBeInstanceOf(Date);
}

/**
 * Assert two versions match (identical fingerprints)
 */
export function expectVersionsMatch(version1: any, version2: any) {
  expectValidVersionFingerprint(version1);
  expectValidVersionFingerprint(version2);
  expect(version1.fingerprint).toBe(version2.fingerprint);
  expect(version1.migrationCount).toBe(version2.migrationCount);
}

/**
 * Assert version comparison has expected status
 */
export function expectVersionStatus(
  comparison: any,
  expectedStatus: 'MATCH' | 'AHEAD' | 'BEHIND' | 'DIVERGED'
) {
  expect(comparison).toBeDefined();
  expect(comparison.status).toBe(expectedStatus);
  expect(comparison.source).toBeDefined();
  expect(comparison.target).toBeDefined();
  expectValidVersionFingerprint(comparison.source);
  expectValidVersionFingerprint(comparison.target);
}

// ============================================================================
// DATABASE INTEGRITY ASSERTIONS
// ============================================================================

/**
 * Assert schema integrity check passed
 */
export function expectSchemaValid(result: any) {
  expect(result).toBeDefined();
  expect(result.valid).toBe(true);
  expect(result.errors).toHaveLength(0);
  expect(result.warnings).toBeDefined();
}

/**
 * Assert schema integrity check failed with specific errors
 */
export function expectSchemaInvalid(result: any, expectedErrorCount: number = 1) {
  expect(result).toBeDefined();
  expect(result.valid).toBe(false);
  expect(result.errors).toBeDefined();
  expect(result.errors.length).toBeGreaterThanOrEqual(expectedErrorCount);
}

/**
 * Assert data integrity check passed
 */
export function expectDataValid(result: any) {
  expect(result).toBeDefined();
  expect(result.valid).toBe(true);
  expect(result.orphanedRecords).toHaveLength(0);
  expect(result.missingReferences).toHaveLength(0);
  expect(result.constraintViolations).toHaveLength(0);
}

/**
 * Assert data integrity check found issues
 */
export function expectDataIssues(result: any, issueType: 'orphans' | 'references' | 'constraints') {
  expect(result).toBeDefined();
  expect(result.valid).toBe(false);
  
  switch (issueType) {
    case 'orphans':
      expect(result.orphanedRecords.length).toBeGreaterThan(0);
      break;
    case 'references':
      expect(result.missingReferences.length).toBeGreaterThan(0);
      break;
    case 'constraints':
      expect(result.constraintViolations.length).toBeGreaterThan(0);
      break;
  }
}

// ============================================================================
// ERROR HANDLING ASSERTIONS
// ============================================================================

/**
 * Assert function throws with specific error message pattern
 */
export async function expectThrowsWithMessage(
  fn: () => Promise<any> | any,
  messagePattern: string | RegExp
) {
  await expect(fn).rejects.toThrow(messagePattern);
}

/**
 * Assert function throws specific error type
 */
export async function expectThrowsErrorType(
  fn: () => Promise<any> | any,
  errorType: new (...args: any[]) => Error
) {
  await expect(fn).rejects.toThrow(errorType);
}

/**
 * Assert error has expected properties
 */
export function expectErrorWithProperties(error: any, properties: Record<string, any>) {
  expect(error).toBeDefined();
  expect(error).toBeInstanceOf(Error);
  
  Object.entries(properties).forEach(([key, value]) => {
    expect(error).toHaveProperty(key, value);
  });
}

// ============================================================================
// SYNC STATE ASSERTIONS
// ============================================================================

/**
 * Assert sync state has valid structure
 */
export function expectValidSyncState(syncState: any) {
  expect(syncState).toBeDefined();
  expect(syncState.id).toBeTruthy();
  expect(syncState.sourceEnv).toBeTruthy();
  expect(syncState.targetEnv).toBeTruthy();
  expect(syncState.status).toBeTruthy();
  expect(['MATCH', 'AHEAD', 'BEHIND', 'DIVERGED', 'WAITING_FOR_MASTER']).toContain(syncState.status);
  expect(syncState.timestamp).toBeInstanceOf(Date);
}

/**
 * Assert sync is safe to proceed
 */
export function expectSyncSafe(syncState: any) {
  expectValidSyncState(syncState);
  expect(['MATCH', 'AHEAD']).toContain(syncState.status);
}

/**
 * Assert sync is blocked
 */
export function expectSyncBlocked(syncState: any, reason: 'BEHIND' | 'DIVERGED' | 'WAITING_FOR_MASTER') {
  expectValidSyncState(syncState);
  expect(syncState.status).toBe(reason);
}

// ============================================================================
// ARRAY HELPERS
// ============================================================================

/**
 * Assert array contains items matching predicate
 */
export function expectArrayContainsWhere<T>(
  array: T[],
  predicate: (item: T) => boolean,
  minCount: number = 1
) {
  expect(array).toBeDefined();
  expect(Array.isArray(array)).toBe(true);
  const matches = array.filter(predicate);
  expect(matches.length).toBeGreaterThanOrEqual(minCount);
}

/**
 * Assert array has unique values
 */
export function expectArrayUnique<T>(array: T[], selector?: (item: T) => any) {
  expect(array).toBeDefined();
  expect(Array.isArray(array)).toBe(true);
  
  const values = selector ? array.map(selector) : array;
  const uniqueValues = new Set(values);
  expect(uniqueValues.size).toBe(array.length);
}

/**
 * Assert array is sorted by selector
 */
export function expectArraySorted<T>(
  array: T[],
  selector: (item: T) => any,
  order: 'asc' | 'desc' = 'asc'
) {
  expect(array).toBeDefined();
  expect(Array.isArray(array)).toBe(true);
  
  for (let i = 1; i < array.length; i++) {
    const prev = selector(array[i - 1]);
    const curr = selector(array[i]);
    
    if (order === 'asc') {
      expect(curr).toBeGreaterThanOrEqual(prev);
    } else {
      expect(curr).toBeLessThanOrEqual(prev);
    }
  }
}
