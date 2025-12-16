/**
 * Game Engine Error Types
 * =======================
 *
 * Error classes for game engine operations including battles,
 * encounters, party management, and Pokemon operations.
 *
 * @module errors/game-engine
 * @since 2025-12-16
 *
 * @example
 * ```typescript
 * import { BattleError, EncounterError, PartyError } from './game-engine.js';
 *
 * // Battle error
 * throw new BattleError('Invalid move for this Pokemon', {
 *   battleId: '12345',
 *   pokemonId: '67890',
 *   moveId: 'tackle',
 * });
 *
 * // Encounter error
 * throw new EncounterError('Encounter already resolved', {
 *   encounterId: '12345',
 *   state: 'CAUGHT',
 * });
 * ```
 */

import { AppError, type ErrorContext, type ErrorSeverity } from "./base.js";

// ============================================================================
// Error Codes
// ============================================================================

export const GameEngineErrorCode = {
  // Battle errors
  BATTLE_NOT_FOUND: "GAME_BTL_001",
  BATTLE_ALREADY_ENDED: "GAME_BTL_002",
  BATTLE_INVALID_MOVE: "GAME_BTL_003",
  BATTLE_INVALID_SWITCH: "GAME_BTL_004",
  BATTLE_POKEMON_FAINTED: "GAME_BTL_005",
  BATTLE_NOT_YOUR_TURN: "GAME_BTL_006",
  BATTLE_INVALID_TARGET: "GAME_BTL_007",
  
  // Encounter errors
  ENCOUNTER_NOT_FOUND: "GAME_ENC_001",
  ENCOUNTER_ALREADY_RESOLVED: "GAME_ENC_002",
  ENCOUNTER_INVALID_ACTION: "GAME_ENC_003",
  ENCOUNTER_COOLDOWN_ACTIVE: "GAME_ENC_004",
  ENCOUNTER_NO_POKEBALLS: "GAME_ENC_005",
  
  // Party errors
  PARTY_NOT_FOUND: "GAME_PTY_001",
  PARTY_FULL: "GAME_PTY_002",
  PARTY_EMPTY: "GAME_PTY_003",
  PARTY_INVALID_SLOT: "GAME_PTY_004",
  PARTY_POKEMON_NOT_FOUND: "GAME_PTY_005",
  
  // Pokemon errors
  POKEMON_NOT_FOUND: "GAME_PKM_001",
  POKEMON_INVALID_SPECIES: "GAME_PKM_002",
  POKEMON_INVALID_MOVE: "GAME_PKM_003",
  POKEMON_HP_ZERO: "GAME_PKM_004",
  POKEMON_PP_DEPLETED: "GAME_PKM_005",
  
  // Spawn/wild errors
  SPAWN_FAILED: "GAME_SPN_001",
  SPAWN_INVALID_AREA: "GAME_SPN_002",
  SPAWN_RATE_LIMITED: "GAME_SPN_003",
  
  // Engine errors
  ENGINE_CALCULATION_ERROR: "GAME_ENG_001",
  ENGINE_STATE_INVALID: "GAME_ENG_002",
  ENGINE_DESYNC: "GAME_ENG_003",
} as const;

export type GameEngineErrorCodeType = typeof GameEngineErrorCode[keyof typeof GameEngineErrorCode];

// ============================================================================
// Error Contexts
// ============================================================================

export interface GameContext extends ErrorContext {
  /** User's trainer ID */
  trainerId?: string;
}

export interface BattleContext extends GameContext {
  /** Battle ID */
  battleId?: string;
  /** Pokemon ID involved */
  pokemonId?: string;
  /** Move ID if applicable */
  moveId?: string;
  /** Current turn number */
  turn?: number;
  /** Battle phase */
  phase?: string;
}

export interface EncounterContext extends GameContext {
  /** Encounter ID */
  encounterId?: string;
  /** Wild Pokemon species ID */
  speciesId?: number;
  /** Encounter state */
  state?: string;
  /** Area/location */
  area?: string;
}

export interface PartyContext extends GameContext {
  /** Party ID */
  partyId?: string;
  /** Slot number */
  slot?: number;
  /** Pokemon ID */
  pokemonId?: string;
  /** Current party size */
  partySize?: number;
}

export interface PokemonContext extends GameContext {
  /** Pokemon instance ID */
  pokemonId?: string;
  /** Species ID */
  speciesId?: number;
  /** Species name */
  speciesName?: string;
  /** Current HP */
  currentHp?: number;
  /** Max HP */
  maxHp?: number;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base class for all game engine errors.
 */
export class GameEngineError extends AppError {
  constructor(
    message: string,
    code: GameEngineErrorCodeType = GameEngineErrorCode.ENGINE_STATE_INVALID,
    context: GameContext = {},
    options?: { severity?: ErrorSeverity; cause?: Error }
  ) {
    super(message, code, context, {
      severity: options?.severity ?? "medium",
      type: "operational",
      cause: options?.cause,
    });
  }
}

/**
 * Battle-related errors.
 */
export class BattleError extends GameEngineError {
  readonly battleId?: string;

  constructor(
    message: string,
    context: BattleContext = {},
    code: GameEngineErrorCodeType = GameEngineErrorCode.BATTLE_INVALID_MOVE
  ) {
    super(message, code, context, { severity: "medium" });
    this.battleId = context.battleId;
  }
}

/**
 * Battle not found error.
 */
export class BattleNotFoundError extends BattleError {
  constructor(battleId: string, context: BattleContext = {}) {
    super(
      `Battle not found: ${battleId}`,
      { ...context, battleId },
      GameEngineErrorCode.BATTLE_NOT_FOUND
    );
  }
}

/**
 * Encounter-related errors.
 */
export class EncounterError extends GameEngineError {
  readonly encounterId?: string;

  constructor(
    message: string,
    context: EncounterContext = {},
    code: GameEngineErrorCodeType = GameEngineErrorCode.ENCOUNTER_INVALID_ACTION
  ) {
    super(message, code, context, { severity: "low" });
    this.encounterId = context.encounterId;
  }
}

/**
 * Encounter not found error.
 */
export class EncounterNotFoundError extends EncounterError {
  constructor(encounterId: string, context: EncounterContext = {}) {
    super(
      `Encounter not found: ${encounterId}`,
      { ...context, encounterId },
      GameEngineErrorCode.ENCOUNTER_NOT_FOUND
    );
  }
}

/**
 * Encounter already resolved (caught/fled/etc).
 */
export class EncounterAlreadyResolvedError extends EncounterError {
  readonly state: string;

  constructor(encounterId: string, state: string, context: EncounterContext = {}) {
    super(
      `Encounter ${encounterId} already resolved: ${state}`,
      { ...context, encounterId, state },
      GameEngineErrorCode.ENCOUNTER_ALREADY_RESOLVED
    );
    this.state = state;
  }
}

/**
 * Party-related errors.
 */
export class PartyError extends GameEngineError {
  readonly partyId?: string;

  constructor(
    message: string,
    context: PartyContext = {},
    code: GameEngineErrorCodeType = GameEngineErrorCode.PARTY_INVALID_SLOT
  ) {
    super(message, code, context, { severity: "medium" });
    this.partyId = context.partyId;
  }
}

/**
 * Party is full (6 Pokemon max).
 */
export class PartyFullError extends PartyError {
  constructor(partyId: string, context: PartyContext = {}) {
    super(
      "Party is full (maximum 6 Pokemon)",
      { ...context, partyId, partySize: 6 },
      GameEngineErrorCode.PARTY_FULL
    );
  }
}

/**
 * Pokemon-related errors.
 */
export class PokemonError extends GameEngineError {
  readonly pokemonId?: string;

  constructor(
    message: string,
    context: PokemonContext = {},
    code: GameEngineErrorCodeType = GameEngineErrorCode.POKEMON_NOT_FOUND
  ) {
    super(message, code, context, { severity: "medium" });
    this.pokemonId = context.pokemonId;
  }
}

/**
 * Pokemon has fainted (HP = 0).
 */
export class PokemonFaintedError extends PokemonError {
  constructor(pokemonId: string, speciesName?: string, context: PokemonContext = {}) {
    super(
      `${speciesName ?? "Pokemon"} has fainted and cannot battle`,
      { ...context, pokemonId, speciesName, currentHp: 0 },
      GameEngineErrorCode.POKEMON_HP_ZERO
    );
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isGameEngineError(error: unknown): error is GameEngineError {
  return error instanceof GameEngineError;
}

export function isBattleError(error: unknown): error is BattleError {
  return error instanceof BattleError;
}

export function isEncounterError(error: unknown): error is EncounterError {
  return error instanceof EncounterError;
}

export function isPartyError(error: unknown): error is PartyError {
  return error instanceof PartyError;
}
