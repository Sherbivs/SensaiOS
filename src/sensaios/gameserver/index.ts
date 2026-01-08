/**
 * SensaiOS GameServer Module — Ring 3 Game Systems Interface
 * 
 * This module provides the GameServerAPI, the ONLY authorized interface
 * for Ring 3 apps (Discord bot, CLI tools, etc.) to interact with game systems.
 * 
 * ## Quick Start
 * 
 * ```ts
 * import { createGameServerClient } from '../sensaios/gameserver/index.js';
 * import type { GameServerAPI, EncryptedBattle } from '../sensaios/gameserver/index.js';
 * 
 * // In your component's onEnable hook:
 * const gameServer = createGameServerClient(ctx, manifest);
 * 
 * // Create a battle
 * const battle = await gameServer.battles.create({
 *   challengerId: encryptedUserId,
 *   opponentId: encryptedOpponentId,
 *   format: 'singles',
 * });
 * ```
 * 
 * ## Security Model
 * 
 * The GameServerAPI enforces:
 * 
 * 1. **Capability Checking** — Apps must declare required capabilities in their manifest
 * 2. **Rate Limiting** — Sliding window rate limits per method/user/channel
 * 3. **Encryption** — Sensitive data (Discord IDs) encrypted before passing to apps
 * 4. **Audit Trail** — All API calls logged via exports
 * 5. **Idempotency** — Write operations support idempotency keys
 * 
 * ## API Namespaces
 * 
 * - **battles** — Create battles, submit moves, forfeit
 * - **encounters** — Spawn wild Pokemon, catch attempts, flee
 * - **trainers** — Get trainer data, update money, get party
 * - **logs** — Structured logging for game operations
 * 
 * ## Rate Limits
 * 
 * | Method | Limit | Key Type |
 * |--------|-------|----------|
 * | battles.create | 1/min | per user |
 * | battles.get | 30/min | per user |
 * | battles.submitMove | 10/min | per user |
 * | battles.forfeit | 5/min | per user |
 * | encounters.spawn | 10/min | per channel |
 * | encounters.catch | 30/min | per user |
 * | encounters.flee | 30/min | per user |
 * | trainers.get | 60/min | per user |
 * | trainers.updateMoney | 100/min | per user |
 * | trainers.getParty | 60/min | per user |
 * | logs.info | 100/min | global per app |
 * | logs.error | 50/min | global per app |
 * 
 * @module sensaios/gameserver
 * @since 2026-01-03
 */

// ============================================================================
// API EXPORTS
// ============================================================================

export {
  // Main factory function
  createGameServerClient,
  
  // Error classes
  CapabilityError,
  RateLimitError,
  
  // Interfaces (for TypeScript consumers)
  type GameServerAPI,
  type BattlesAPI,
  type EncountersAPI,
  type TrainersAPI,
  type LogsAPI,
  type ComponentManifest,
} from './api.js';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export {
  // Encryption types
  type EncryptedToken,
  type EncryptedFieldType,
  
  // Battle types
  type CreateBattleParams,
  type BattleFormat,
  type EncryptedBattle,
  type BattleStatus,
  type BattleTurnPhase,
  type BattleAction,
  type BattleActionResult,
  type TurnResult,
  type BattleLogEntry,
  type BattleLogType,
  type BattleEndResult,
  
  // Encounter types
  type SpawnEncounterParams,
  type RarityTier,
  type EncryptedEncounter,
  type EncounterStatus,
  type CatchAttemptParams,
  type BallType,
  type CatchResult,
  type FleeResult,
  
  // Trainer types
  type EncryptedTrainer,
  type UpdateMoneyParams,
  type UpdateMoneyResult,
  type TrainerParty,
  type PartySlot,
  
  // Rate limiting types
  type RateLimitConfig,
  type RateLimitKeyType,
  type RateLimitError as RateLimitErrorType,
  
  // Audit types
  type ApiCallAudit,
  
  // Capability types
  type GameCapability,
  
  // Constants
  API_CAPABILITIES,
  DEFAULT_RATE_LIMITS,
} from './types.js';

// ============================================================================
// RATE LIMITER EXPORTS
// ============================================================================

export {
  // Rate limiter class
  SlidingWindowRateLimiter,
  
  // Helper functions
  generateRateLimitKey,
  createCompositeKey,
  
  // Stats type
  type RateLimiterStats,
} from './rate-limiter.js';

// ============================================================================
// ENCRYPTION EXPORTS
// ============================================================================

export {
  // Initialization functions
  initializeEncryption,
  initializeDevelopmentEncryption,
  isEncryptionInitialized,
  
  // Core encryption/decryption
  encryptForApp,
  decryptFromApp,
  verifyToken,
  
  // Internal helpers (for GameServerAPI use)
  createEncryptedToken,
  extractRawValue,
  
  // Bulk operations
  encryptFields,
  
  // Error class
  EncryptionError,
  type EncryptionErrorCode,
  
  // Utilities
  generateRandomKey,
  hashForLogging,
  isEncryptedToken,
  getTokenMetadata,
  type TokenMetadata,
} from './encryption.js';
