/**
 * Error Module
 * ============
 *
 * Central export for all application error types.
 *
 * @module errors
 * @since 2025-12-16
 *
 * @example
 * ```typescript
 * import {
 *   // Base
 *   AppError,
 *   isAppError,
 *
 *   // Database
 *   DatabaseError,
 *   ConnectionError,
 *   QueryError,
 *   RecordNotFoundError,
 *
 *   // Game Engine
 *   GameEngineError,
 *   BattleError,
 *   EncounterError,
 *   PartyError,
 *
 *   // Discord
 *   DiscordBotError,
 *   CommandError,
 *   InteractionError,
 *   HomesteadError,
 *
 *   // Validation
 *   ValidationError,
 *   RequiredFieldError,
 *   InvalidFormatError,
 * } from './errors/index.js';
 * ```
 */

// Base error types
export {
  // Classes
  AppError,
  // Types
  type ErrorContext,
  type ErrorDomain,
  type ErrorSeverity,
  type ErrorType,
  type SerializedError,
  // Constants
  ERROR_DOMAIN_PREFIX,
  // Utilities
  generateErrorId,
  getDomainFromCode,
  // Type guards
  isAppError,
  hasErrorCode,
  isInDomain,
} from "./base.js";

// Database error types
export {
  // Classes
  DatabaseError,
  ConnectionError,
  QueryError,
  TransactionError,
  RecordNotFoundError,
  DuplicateRecordError,
  // Types
  type DatabaseContext,
  type ConnectionContext,
  type QueryContext,
  type TransactionContext,
  type DatabaseErrorCodeType,
  // Constants
  DatabaseErrorCode,
  // Type guards
  isDatabaseError,
  isConnectionError,
  isRecordNotFoundError,
} from "./database.js";

// Game engine error types
export {
  // Classes
  GameEngineError,
  BattleError,
  BattleNotFoundError,
  EncounterError,
  EncounterNotFoundError,
  EncounterAlreadyResolvedError,
  PartyError,
  PartyFullError,
  PokemonError,
  PokemonFaintedError,
  // Types
  type GameContext,
  type BattleContext,
  type EncounterContext,
  type PartyContext,
  type PokemonContext,
  type GameEngineErrorCodeType,
  // Constants
  GameEngineErrorCode,
  // Type guards
  isGameEngineError,
  isBattleError,
  isEncounterError,
  isPartyError,
} from "./game-engine.js";

// Discord error types
export {
  // Classes
  DiscordBotError,
  CommandError,
  CommandPermissionError,
  InteractionError,
  InteractionTimeoutError,
  ChannelError,
  ChannelNotFoundError,
  HomesteadError,
  HomesteadNotFoundError,
  RateLimitError,
  // Types
  type DiscordContext,
  type CommandContext,
  type InteractionContext,
  type ChannelContext,
  type HomesteadContext,
  type DiscordErrorCodeType,
  // Constants
  DiscordErrorCode,
  // Type guards
  isDiscordBotError,
  isCommandError,
  isInteractionError,
  isRateLimitError,
  isHomesteadError,
} from "./discord.js";

// Validation error types
export {
  // Classes
  ValidationError,
  RequiredFieldError,
  InvalidFormatError,
  OutOfRangeError,
  InvalidEnumError,
  InvalidLengthError,
  InvalidTypeError,
  BusinessRuleError,
  // Types
  type ValidationContext,
  type RangeContext,
  type LengthContext,
  type EnumContext,
  type ValidationErrorCodeType,
  // Constants
  ValidationErrorCode,
  // Type guards
  isValidationError,
  isRequiredFieldError,
  isBusinessRuleError,
} from "./validation.js";
