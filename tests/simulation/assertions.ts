/**
 * Custom Vitest Assertion Matchers for Simulation Tests
 * 
 * Provides expressive, domain-specific assertions for:
 * - Pokemon ownership and party state
 * - Battle outcomes and results
 * - Encounter outcomes
 * - Homestead channel validation
 * - Player state validation
 * 
 * **USAGE:**
 * ```typescript
 * import { expect } from "vitest";
 * import "./assertions.js"; // Extend Vitest expect
 * 
 * expect(player).toHavePokemon(3);
 * expect(player).toHaveStarter("Charmander");
 * expect(validation).toHaveValidHomestead();
 * expect(result).toHaveBattleWinner(player1);
 * expect(result).toHaveEncounterOutcome("caught");
 * ```
 * 
 * @module tests/simulation/assertions
 */

import { expect } from "vitest";
import type { SimulatedPlayer, Pokemon } from "./simulated-player.js";

/**
 * Battle result interface from simulation-engine
 */
export interface BattleResult {
  battleId: string;
  winner: SimulatedPlayer | null;
  loser: SimulatedPlayer | null;
  isDraw: boolean;
  turnCount: number;
  moveHistory: Array<{
    turn: number;
    player1Action: any;
    player2Action: any;
  }>;
  rewards?: { winner: number; loser: number };
}

/**
 * Encounter result interface from simulation-engine
 */
export interface EncounterResult {
  encounterId: string;
  action: any;
  outcome: "caught" | "fled" | "fainted" | "escaped";
  turns: number;
}

/**
 * Validation result interface for homestead channels
 */
export interface HomesteadValidation {
  exists: boolean;
  name?: string;
  category?: string;
  permissions?: {
    user: boolean;
    bot: boolean;
    everyone: boolean;
  };
  messages?: number;
}

/**
 * Custom matcher: Check if player has specific number of Pokemon in party
 */
export function toHavePokemon(
  player: SimulatedPlayer,
  expectedCount: number
): { pass: boolean; message: () => string } {
  const actualCount = player.party.length;
  const pass = actualCount === expectedCount;

  return {
    pass,
    message: () =>
      pass
        ? `Expected player NOT to have ${expectedCount} Pokemon, but has ${actualCount}`
        : `Expected player to have ${expectedCount} Pokemon, but has ${actualCount}`,
  };
}

/**
 * Custom matcher: Check if player has specific starter Pokemon
 */
export function toHaveStarter(
  player: SimulatedPlayer,
  expectedStarter: string
): { pass: boolean; message: () => string } {
  const hasParty = player.party.length > 0;
  const actualStarter = hasParty ? player.party[0].speciesName : "none";
  const pass = hasParty && actualStarter === expectedStarter;

  return {
    pass,
    message: () =>
      pass
        ? `Expected player NOT to have starter "${expectedStarter}", but has "${actualStarter}"`
        : hasParty
        ? `Expected player to have starter "${expectedStarter}", but has "${actualStarter}"`
        : `Expected player to have starter "${expectedStarter}", but has no party`,
  };
}

/**
 * Custom matcher: Check if player has Pokemon with specific name
 */
export function toHavePokemonNamed(
  player: SimulatedPlayer,
  speciesName: string
): { pass: boolean; message: () => string } {
  const hasPokemon = player.party.some((p) => p.speciesName === speciesName);

  return {
    pass: hasPokemon,
    message: () =>
      hasPokemon
        ? `Expected player NOT to have Pokemon named "${speciesName}"`
        : `Expected player to have Pokemon named "${speciesName}", but party contains: ${player.party
            .map((p) => p.speciesName)
            .join(", ")}`,
  };
}

/**
 * Custom matcher: Check if player has full party (6 Pokemon)
 */
export function toHaveFullParty(
  player: SimulatedPlayer
): { pass: boolean; message: () => string } {
  const pass = player.party.length === 6;

  return {
    pass,
    message: () =>
      pass
        ? `Expected player NOT to have full party, but has 6 Pokemon`
        : `Expected player to have full party (6 Pokemon), but has ${player.party.length}`,
  };
}

/**
 * Custom matcher: Check if player has empty party
 */
export function toHaveEmptyParty(
  player: SimulatedPlayer
): { pass: boolean; message: () => string } {
  const pass = player.party.length === 0;

  return {
    pass,
    message: () =>
      pass
        ? `Expected player NOT to have empty party, but has 0 Pokemon`
        : `Expected player to have empty party, but has ${player.party.length} Pokemon`,
  };
}

/**
 * Custom matcher: Check if player has Pokemon in box
 */
export function toHavePokemonInBox(
  player: SimulatedPlayer,
  expectedCount: number
): { pass: boolean; message: () => string } {
  const actualCount = player.box.length;
  const pass = actualCount === expectedCount;

  return {
    pass,
    message: () =>
      pass
        ? `Expected player NOT to have ${expectedCount} Pokemon in box, but has ${actualCount}`
        : `Expected player to have ${expectedCount} Pokemon in box, but has ${actualCount}`,
  };
}

/**
 * Custom matcher: Check if player has minimum coins
 */
export function toHaveMinimumCoins(
  player: SimulatedPlayer,
  minimumCoins: number
): { pass: boolean; message: () => string } {
  const actualCoins = player.coins;
  const pass = actualCoins >= minimumCoins;

  return {
    pass,
    message: () =>
      pass
        ? `Expected player NOT to have at least ${minimumCoins} coins, but has ${actualCoins}`
        : `Expected player to have at least ${minimumCoins} coins, but has ${actualCoins}`,
  };
}

/**
 * Custom matcher: Validate homestead channel exists with correct properties
 */
export function toHaveValidHomestead(
  validation: HomesteadValidation
): { pass: boolean; message: () => string } {
  const pass =
    validation.exists &&
    validation.name !== undefined &&
    validation.permissions !== undefined &&
    validation.permissions.user === true &&
    validation.permissions.bot === true &&
    validation.permissions.everyone === false;

  if (pass) {
    return {
      pass,
      message: () => `Expected homestead NOT to be valid, but it is`,
    };
  }

  const errors: string[] = [];
  if (!validation.exists) errors.push("homestead does not exist");
  if (!validation.name) errors.push("name is undefined");
  if (!validation.permissions) {
    errors.push("permissions are undefined");
  } else {
    if (!validation.permissions.user) errors.push("user access is false");
    if (!validation.permissions.bot) errors.push("bot access is false");
    if (validation.permissions.everyone) errors.push("everyone access is true");
  }

  return {
    pass,
    message: () =>
      `Expected homestead to be valid, but found issues: ${errors.join(", ")}`,
  };
}

/**
 * Custom matcher: Check if homestead has correct naming convention
 */
export function toHaveCorrectHomesteadName(
  validation: HomesteadValidation,
  username: string
): { pass: boolean; message: () => string } {
  const expectedName = `homestead-${username.toLowerCase()}`;
  const pass = validation.name === expectedName;

  return {
    pass,
    message: () =>
      pass
        ? `Expected homestead NOT to have name "${expectedName}", but it does`
        : `Expected homestead to have name "${expectedName}", but has "${validation.name}"`,
  };
}

/**
 * Custom matcher: Check if battle has winner
 */
export function toHaveBattleWinner(
  result: BattleResult,
  expectedWinner: SimulatedPlayer
): { pass: boolean; message: () => string } {
  const pass = result.winner === expectedWinner;
  const actualWinner = result.winner?.username || "none";
  const expectedWinnerName = expectedWinner.username;

  return {
    pass,
    message: () =>
      pass
        ? `Expected battle winner NOT to be "${expectedWinnerName}", but it is`
        : `Expected battle winner to be "${expectedWinnerName}", but is "${actualWinner}"`,
  };
}

/**
 * Custom matcher: Check if battle ended in draw
 */
export function toHaveBattleDraw(
  result: BattleResult
): { pass: boolean; message: () => string } {
  const pass = result.winner === null || result.winner === undefined;

  return {
    pass,
    message: () =>
      pass
        ? `Expected battle NOT to be a draw, but it is`
        : `Expected battle to be a draw, but winner is "${result.winner?.username}"`,
  };
}

/**
 * Custom matcher: Check if battle has minimum turns
 */
export function toHaveMinimumBattleTurns(
  result: BattleResult,
  minimumTurns: number
): { pass: boolean; message: () => string } {
  const actualTurns = result.turnCount;
  const pass = actualTurns >= minimumTurns;

  return {
    pass,
    message: () =>
      pass
        ? `Expected battle NOT to have at least ${minimumTurns} turns, but has ${actualTurns}`
        : `Expected battle to have at least ${minimumTurns} turns, but has ${actualTurns}`,
  };
}

/**
 * Custom matcher: Check if battle has move history
 */
export function toHaveMoveHistory(
  result: BattleResult
): { pass: boolean; message: () => string } {
  const hasHistory =
    result.moveHistory !== undefined && result.moveHistory.length > 0;

  return {
    pass: hasHistory,
    message: () =>
      hasHistory
        ? `Expected battle NOT to have move history, but it does`
        : `Expected battle to have move history, but it's ${
            result.moveHistory === undefined ? "undefined" : "empty"
          }`,
  };
}

/**
 * Custom matcher: Check encounter outcome
 */
export function toHaveEncounterOutcome(
  result: EncounterResult,
  expectedOutcome: "caught" | "escaped" | "fled" | "fainted"
): { pass: boolean; message: () => string } {
  const pass = result.outcome === expectedOutcome;

  return {
    pass,
    message: () =>
      pass
        ? `Expected encounter outcome NOT to be "${expectedOutcome}", but it is`
        : `Expected encounter outcome to be "${expectedOutcome}", but is "${result.outcome}"`,
  };
}

/**
 * Custom matcher: Check if encounter resulted in capture
 */
export function toHaveCaptured(
  result: EncounterResult
): { pass: boolean; message: () => string } {
  const pass = result.outcome === "caught";

  return {
    pass,
    message: () =>
      pass
        ? `Expected NOT to capture Pokemon, but did`
        : `Expected to capture Pokemon, but outcome is "${result.outcome}"`,
  };
}

/**
 * Custom matcher: Check if player escaped encounter
 */
export function toHaveEscaped(
  result: EncounterResult
): { pass: boolean; message: () => string } {
  const pass = result.outcome === "fled" || result.outcome === "escaped";

  return {
    pass,
    message: () =>
      pass
        ? `Expected NOT to escape encounter, but did`
        : `Expected to escape encounter, but outcome is "${result.outcome}"`,
  };
}

/**
 * Custom matcher: Check if Pokemon has specific moves
 */
export function toHaveMoves(
  pokemon: Pokemon,
  expectedMoves: string[]
): { pass: boolean; message: () => string } {
  const hasAllMoves = expectedMoves.every((move) =>
    pokemon.moves.includes(move)
  );

  return {
    pass: hasAllMoves,
    message: () =>
      hasAllMoves
        ? `Expected Pokemon NOT to have moves ${expectedMoves.join(", ")}, but it does`
        : `Expected Pokemon to have moves ${expectedMoves.join(", ")}, but has ${pokemon.moves.join(", ")}`,
  };
}

/**
 * Custom matcher: Check if Pokemon is at full HP
 */
export function toBeAtFullHp(
  pokemon: Pokemon
): { pass: boolean; message: () => string } {
  const pass = pokemon.currentHp === pokemon.maxHp;

  return {
    pass,
    message: () =>
      pass
        ? `Expected Pokemon NOT to be at full HP, but is at ${pokemon.currentHp}/${pokemon.maxHp}`
        : `Expected Pokemon to be at full HP, but is at ${pokemon.currentHp}/${pokemon.maxHp}`,
  };
}

/**
 * Custom matcher: Check if Pokemon is fainted
 */
export function toBeFainted(
  pokemon: Pokemon
): { pass: boolean; message: () => string } {
  const pass = pokemon.currentHp === 0;

  return {
    pass,
    message: () =>
      pass
        ? `Expected Pokemon NOT to be fainted, but HP is 0`
        : `Expected Pokemon to be fainted, but HP is ${pokemon.currentHp}/${pokemon.maxHp}`,
  };
}

/**
 * Custom matcher: Check if Pokemon HP is below threshold
 */
export function toHaveHpBelowThreshold(
  pokemon: Pokemon,
  threshold: number
): { pass: boolean; message: () => string } {
  const hpPercent = (pokemon.currentHp / pokemon.maxHp) * 100;
  const pass = hpPercent < threshold;

  return {
    pass,
    message: () =>
      pass
        ? `Expected Pokemon HP NOT to be below ${threshold}%, but is at ${hpPercent.toFixed(1)}%`
        : `Expected Pokemon HP to be below ${threshold}%, but is at ${hpPercent.toFixed(1)}%`,
  };
}

/**
 * Extend Vitest expect with custom matchers
 */
declare module "vitest" {
  interface Assertion<T = any> {
    toHavePokemon(count: number): T;
    toHaveStarter(starter: string): T;
    toHavePokemonNamed(name: string): T;
    toHaveFullParty(): T;
    toHaveEmptyParty(): T;
    toHavePokemonInBox(count: number): T;
    toHaveMinimumCoins(coins: number): T;
    toHaveValidHomestead(): T;
    toHaveCorrectHomesteadName(username: string): T;
    toHaveBattleWinner(winner: SimulatedPlayer): T;
    toHaveBattleDraw(): T;
    toHaveMinimumBattleTurns(turns: number): T;
    toHaveMoveHistory(): T;
    toHaveEncounterOutcome(
      outcome: "caught" | "escaped" | "fled" | "fainted"
    ): T;
    toHaveCaptured(): T;
    toHaveEscaped(): T;
    toHaveMoves(moves: string[]): T;
    toBeAtFullHp(): T;
    toBeFainted(): T;
    toHaveHpBelowThreshold(threshold: number): T;
  }

  interface AsymmetricMatchersContaining {
    toHavePokemon(count: number): any;
    toHaveStarter(starter: string): any;
    toHavePokemonNamed(name: string): any;
    toHaveFullParty(): any;
    toHaveEmptyParty(): any;
    toHavePokemonInBox(count: number): any;
    toHaveMinimumCoins(coins: number): any;
    toHaveValidHomestead(): any;
    toHaveCorrectHomesteadName(username: string): any;
    toHaveBattleWinner(winner: SimulatedPlayer): any;
    toHaveBattleDraw(): any;
    toHaveMinimumBattleTurns(turns: number): any;
    toHaveMoveHistory(): any;
    toHaveEncounterOutcome(
      outcome: "caught" | "escaped" | "fled" | "fainted"
    ): any;
    toHaveCaptured(): any;
    toHaveEscaped(): any;
    toHaveMoves(moves: string[]): any;
    toBeAtFullHp(): any;
    toBeFainted(): any;
    toHaveHpBelowThreshold(threshold: number): any;
  }
}

// Register all custom matchers with Vitest
expect.extend({
  toHavePokemon,
  toHaveStarter,
  toHavePokemonNamed,
  toHaveFullParty,
  toHaveEmptyParty,
  toHavePokemonInBox,
  toHaveMinimumCoins,
  toHaveValidHomestead,
  toHaveCorrectHomesteadName,
  toHaveBattleWinner,
  toHaveBattleDraw,
  toHaveMinimumBattleTurns,
  toHaveMoveHistory,
  toHaveEncounterOutcome,
  toHaveCaptured,
  toHaveEscaped,
  toHaveMoves,
  toBeAtFullHp,
  toBeFainted,
  toHaveHpBelowThreshold,
});
