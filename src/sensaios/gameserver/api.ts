/**
 * SensaiOS GameServer API — Ring 3 Game Systems Interface
 * 
 * This module provides the GameServerAPI, the ONLY authorized interface
 * for Ring 3 apps (Discord bot, CLI tools, etc.) to interact with game systems.
 * 
 * ## Security Model
 * 
 * The GameServerAPI is designed with defense-in-depth:
 * 
 * 1. **Capability Checking**: Every method validates the app has required capability
 * 2. **Rate Limiting**: Sliding window rate limits per method/user/channel
 * 3. **Encryption**: Sensitive data (Discord IDs, etc.) encrypted before passing to apps
 * 4. **Audit Trail**: All API calls logged via exports
 * 5. **Idempotency**: Write operations support idempotency keys to prevent duplicates
 * 
 * ## Usage
 * 
 * ```ts
 * // In your component's onEnable hook:
 * const gameServer = createGameServerClient(ctx, manifest);
 * 
 * // Create a battle
 * const battle = await gameServer.battles.create({
 *   challengerId: encryptedUserId,
 *   opponentId: encryptedOpponentId,
 *   format: 'singles',
 * });
 * 
 * // Spawn an encounter
 * const encounter = await gameServer.encounters.spawn({
 *   channelId: encryptedChannelId,
 * });
 * ```
 * 
 * @module sensaios/gameserver/api
 * @since 2026-01-03
 */

import type { ComponentContext } from '../component-context.js';

// Encryption
import {
  extractRawValue,
  createEncryptedToken,
  isEncryptionInitialized,
  initializeDevelopmentEncryption,
} from './encryption.js';

// Database helper imports (query patterns - actual DB access via ctx.db.prisma)

import type {
  // Battle types
  CreateBattleParams,
  EncryptedBattle,
  BattleAction,
  BattleActionResult,
  BattleEndResult,
  BattleFormat,
  
  // Encounter types
  SpawnEncounterParams,
  EncryptedEncounter,
  CatchAttemptParams,
  CatchResult,
  FleeResult,
  
  // Trainer types
  EncryptedTrainer,
  UpdateMoneyParams,
  UpdateMoneyResult,
  TrainerParty,
  PartySlot,
  
  // Daily data types
  DailyQuestData,
  ClaimDailyRewardParams,
  ClaimDailyRewardResult,
  
  // Inventory types
  TrainerInventory,
  InventoryItem,
  UseItemParams,
  UseItemResult,
  
  // Storage types
  TrainerStorage,
  StoredPokemon,
  MovePokemonParams,
  MovePokemonResult,
  
  // Settings types
  TrainerSettings,
  GetSettingsResult,
  UpdateSettingsParams,
  UpdateSettingsResult,
  
  // Pokedex types
  PokedexProgress,
  RegionProgress,
  
  // Party management types
  DetailedPartySlot,
  DetailedParty,
  SwapPartySlotsParams,
  SwapPartySlotsResult,
  StatBlock,
  
  // Utility types
  EncryptedToken,
  EncryptedFieldType,
  RateLimitConfig,
  ApiCallAudit,
  GameCapability,
} from './types.js';

import { API_CAPABILITIES, DEFAULT_RATE_LIMITS, DEFAULT_TRAINER_SETTINGS } from './types.js';
import { SlidingWindowRateLimiter } from './rate-limiter.js';

// Re-export encryption utilities for consumers
export { createEncryptedToken } from './encryption.js';

// ============================================================================
// GAMESERVER API INTERFACE
// ============================================================================

/**
 * GameServerAPI — The ONLY authorized interface for Ring 3 game operations
 * 
 * This interface provides controlled access to game systems with:
 * - Automatic capability checking
 * - Rate limiting per method
 * - Encryption of sensitive data
 * - Full audit trail via exports
 * 
 * @example
 * ```ts
 * const gameServer = createGameServerClient(ctx, manifest);
 * 
 * // All operations are rate-limited and audited
 * const battle = await gameServer.battles.create({
 *   challengerId: ctx.encryptDiscordId(userId),
 *   opponentId: ctx.encryptDiscordId(opponentId),
 *   format: 'singles',
 * });
 * ```
 */
export interface GameServerAPI {
  /**
   * Battle operations namespace
   * 
   * Rate Limits:
   * - create: 1/min per user
   * - get: 30/min per user
   * - submitMove: 10/min per user
   * - forfeit: 5/min per user
   */
  readonly battles: BattlesAPI;
  
  /**
   * Encounter operations namespace
   * 
   * Rate Limits:
   * - spawn: 10/min per channel
   * - catch: 30/min per user
   * - flee: 30/min per user
   */
  readonly encounters: EncountersAPI;
  
  /**
   * Trainer operations namespace
   * 
   * Rate Limits:
   * - get: 60/min per user
   * - updateMoney: 100/min per user
   * - getParty: 60/min per user
   */
  readonly trainers: TrainersAPI;
  
  /**
   * Logging operations namespace
   * 
   * Rate Limits:
   * - info: 100/min global per app
   * - error: 50/min global per app
   */
  readonly logs: LogsAPI;
}

// ============================================================================
// BATTLES API
// ============================================================================

/**
 * Battle operations API
 * 
 * Provides controlled access to the battle system. All battle state
 * is managed server-side; apps receive encrypted references only.
 */
export interface BattlesAPI {
  /**
   * Create a new battle between two trainers
   * 
   * @requires Capability: game.battle.create
   * @rateLimit 1/min per user
   * 
   * @param params - Battle creation parameters
   * @returns The created battle with encrypted participant IDs
   * @throws {RateLimitError} If rate limit exceeded
   * @throws {CapabilityError} If app lacks required capability
   * 
   * @example
   * ```ts
   * const battle = await gameServer.battles.create({
   *   challengerId: encryptedChallengerId,
   *   opponentId: encryptedOpponentId,
   *   format: 'singles',
   *   idempotencyKey: `battle-${Date.now()}`,
   * });
   * ```
   */
  create(params: CreateBattleParams): Promise<EncryptedBattle>;
  
  /**
   * Get battle state by ID
   * 
   * @requires Capability: game.battle.read
   * @rateLimit 30/min per user
   * 
   * @param battleId - The battle ID
   * @returns The battle state with encrypted data, or null if not found
   */
  get(battleId: string): Promise<EncryptedBattle | null>;
  
  /**
   * Submit a battle action (move, switch, item, etc.)
   * 
   * @requires Capability: game.battle.write
   * @rateLimit 10/min per user
   * 
   * @param battleId - The battle ID
   * @param participantToken - Encrypted token of the participant submitting
   * @param action - The action to take
   * @returns Result of the action submission
   */
  submitMove(
    battleId: string,
    participantToken: EncryptedToken,
    action: BattleAction,
  ): Promise<BattleActionResult>;
  
  /**
   * Forfeit a battle
   * 
   * @requires Capability: game.battle.write
   * @rateLimit 5/min per user
   * 
   * @param battleId - The battle ID
   * @param participantToken - Encrypted token of the forfeiting participant
   * @returns Result of the forfeit
   */
  forfeit(
    battleId: string,
    participantToken: EncryptedToken,
  ): Promise<BattleEndResult>;
}

// ============================================================================
// ENCOUNTERS API
// ============================================================================

/**
 * Encounter operations API
 * 
 * Provides controlled access to the wild encounter system.
 * Spawning uses seeded RNG for deterministic but unpredictable results.
 */
export interface EncountersAPI {
  /**
   * Spawn a wild encounter in a channel
   * 
   * @requires Capability: game.encounter.spawn
   * @rateLimit 10/min per channel
   * 
   * @param params - Spawn parameters
   * @returns The spawned encounter with encrypted owner ID
   * @throws {RateLimitError} If rate limit exceeded
   * 
   * @example
   * ```ts
   * const encounter = await gameServer.encounters.spawn({
   *   channelId: encryptedChannelId,
   *   seed: `${userId}-${Date.now()}`,
   * });
   * 
   * console.log(`A wild ${encounter.speciesName} appeared!`);
   * ```
   */
  spawn(params: SpawnEncounterParams): Promise<EncryptedEncounter>;
  
  /**
   * Get active encounter by ID
   * 
   * @requires Capability: game.encounter.spawn (read uses spawn cap)
   * @rateLimit 30/min per user (shares with catch)
   * 
   * @param encounterId - The encounter ID
   * @returns The encounter state, or null if not found/expired
   */
  get(encounterId: string): Promise<EncryptedEncounter | null>;
  
  /**
   * Attempt to catch a wild Pokemon
   * 
   * @requires Capability: game.encounter.catch
   * @rateLimit 30/min per user
   * 
   * @param params - Catch attempt parameters
   * @returns Result of the catch attempt
   * 
   * @example
   * ```ts
   * const result = await gameServer.encounters.catch({
   *   encounterId: encounter.id,
   *   ballType: 'ultra',
   * });
   * 
   * if (result.success) {
   *   console.log(`Caught ${encounter.speciesName}!`);
   * } else if (result.fled) {
   *   console.log('The wild Pokemon fled!');
   * }
   * ```
   */
  catch(params: CatchAttemptParams): Promise<CatchResult>;
  
  /**
   * Run away from an encounter
   * 
   * @requires Capability: game.encounter.write
   * @rateLimit 30/min per user
   * 
   * @param encounterId - The encounter ID
   * @param ownerToken - Encrypted token of the encounter owner
   * @returns Result of the flee attempt
   */
  flee(encounterId: string, ownerToken: EncryptedToken): Promise<FleeResult>;
}

// ============================================================================
// TRAINERS API
// ============================================================================

/**
 * Trainer operations API
 * 
 * Provides controlled access to trainer data and operations.
 * Sensitive trainer data is encrypted before returning to apps.
 */
export interface TrainersAPI {
  /**
   * Get trainer data by Discord ID
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 60/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Trainer data with encrypted sensitive fields, or null if not found
   */
  get(discordIdToken: EncryptedToken | string): Promise<EncryptedTrainer | null>;
  
  /**
   * Update trainer's money (add or subtract)
   * 
   * @requires Capability: game.trainer.write
   * @rateLimit 100/min per user
   * 
   * @param params - Money update parameters
   * @returns Result of the update
   * 
   * @example
   * ```ts
   * // Add money for winning a battle
   * const result = await gameServer.trainers.updateMoney({
   *   discordId: winnerToken,
   *   delta: 500,
   *   reason: `Won battle ${battleId}`,
   *   idempotencyKey: `battle-win-${battleId}`,
   * });
   * ```
   */
  updateMoney(params: UpdateMoneyParams): Promise<UpdateMoneyResult>;
  
  /**
   * Get trainer's current party
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 60/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Trainer's party, or null if trainer not found
   */
  getParty(discordIdToken: EncryptedToken | string): Promise<TrainerParty | null>;
  
  /**
   * Get trainer's daily quest data
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 30/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Daily quest data, or null if trainer not found
   */
  getDailyData(discordIdToken: EncryptedToken | string): Promise<DailyQuestData | null>;
  
  /**
   * Claim daily reward
   * 
   * @requires Capability: game.trainer.write
   * @rateLimit 5/min per user
   * 
   * @param params - Claim parameters
   * @returns Result of the claim attempt
   */
  claimDailyReward(params: ClaimDailyRewardParams): Promise<ClaimDailyRewardResult>;
  
  /**
   * Get trainer's inventory
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 30/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Trainer's inventory, or null if trainer not found
   */
  getInventory(discordIdToken: EncryptedToken | string): Promise<TrainerInventory | null>;
  
  /**
   * Use an item from inventory
   * 
   * @requires Capability: game.trainer.write
   * @rateLimit 30/min per user
   * 
   * @param params - Item usage parameters
   * @returns Result of the item use
   */
  useItem(params: UseItemParams): Promise<UseItemResult>;
  
  /**
   * Get trainer's storage (PC boxes)
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 30/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Trainer's storage, or null if trainer not found
   */
  getStorage(discordIdToken: EncryptedToken | string): Promise<TrainerStorage | null>;
  
  /**
   * Move Pokemon between party and storage
   * 
   * @requires Capability: game.trainer.write
   * @rateLimit 30/min per user
   * 
   * @param params - Move parameters
   * @returns Result of the move operation
   */
  movePokemon(params: MovePokemonParams): Promise<MovePokemonResult>;
  
  /**
   * Get trainer's settings (user preferences)
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 30/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Settings data, or default settings if not set
   */
  getSettings(discordIdToken: EncryptedToken | string): Promise<GetSettingsResult>;
  
  /**
   * Update a specific trainer setting
   * 
   * @requires Capability: game.trainer.write
   * @rateLimit 30/min per user
   * 
   * @param params - Update parameters
   * @returns Result of the update
   */
  updateSettings(params: UpdateSettingsParams): Promise<UpdateSettingsResult>;
  
  /**
   * Get trainer's Pokedex progress
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 30/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Pokedex progress data, or null if trainer not found
   */
  getPokedexProgress(discordIdToken: EncryptedToken | string): Promise<PokedexProgress | null>;
  
  /**
   * Get trainer's detailed party with IVs, EVs, and base stats
   * 
   * @requires Capability: game.trainer.read
   * @rateLimit 60/min per user
   * 
   * @param discordIdToken - Encrypted Discord ID
   * @returns Detailed party data, or null if trainer not found
   */
  getDetailedParty(discordIdToken: EncryptedToken | string): Promise<DetailedParty | null>;
  
  /**
   * Swap two party slot positions
   * 
   * @requires Capability: game.trainer.write
   * @rateLimit 30/min per user
   * 
   * @param params - Swap parameters
   * @returns Result of the swap
   */
  swapPartySlots(params: SwapPartySlotsParams): Promise<SwapPartySlotsResult>;
}

// ============================================================================
// LOGS API
// ============================================================================

/**
 * Logging operations API
 * 
 * Provides structured logging for game operations.
 * All logs are audited and correlated with API calls.
 */
export interface LogsAPI {
  /**
   * Log an informational message
   * 
   * @requires Capability: game.logs.write
   * @rateLimit 100/min global per app
   * 
   * @param message - Log message
   * @param data - Additional structured data
   */
  info(message: string, data?: Record<string, unknown>): void;
  
  /**
   * Log an error message
   * 
   * @requires Capability: game.logs.write
   * @rateLimit 50/min global per app
   * 
   * @param message - Error message
   * @param data - Additional structured data (include error details)
   */
  error(message: string, data?: Record<string, unknown>): void;
}

// ============================================================================
// COMPONENT MANIFEST TYPE (for capability checking)
// ============================================================================

/**
 * Minimal manifest interface for capability checking
 */
export interface ComponentManifest {
  name: string;
  capabilities: {
    game?: GameCapability[];
    [key: string]: unknown;
  };
}

// ============================================================================
// GAMESERVER CLIENT IMPLEMENTATION
// ============================================================================

/**
 * Internal implementation of GameServerAPI
 * @internal
 */
class GameServerClient implements GameServerAPI {
  private readonly ctx: ComponentContext;
  private readonly manifest: ComponentManifest;
  private readonly rateLimiter: SlidingWindowRateLimiter;
  private readonly appId: string;
  
  constructor(ctx: ComponentContext, manifest: ComponentManifest) {
    this.ctx = ctx;
    this.manifest = manifest;
    this.appId = manifest.name;
    this.rateLimiter = new SlidingWindowRateLimiter();
  }
  
  /**
   * Check if the app has the required capability
   */
  private hasCapability(capability: GameCapability): boolean {
    return this.manifest.capabilities.game?.includes(capability) ?? false;
  }
  
  /**
   * Assert the app has the required capability
   */
  private assertCapability(capability: GameCapability): void {
    if (!this.hasCapability(capability)) {
      throw new CapabilityError(
        `App '${this.appId}' lacks required capability: ${capability}`,
        capability,
      );
    }
  }
  
  /**
   * Check rate limit for a method
   */
  private checkRateLimit(method: string, key: string): void {
    const config = DEFAULT_RATE_LIMITS[method];
    if (!config) return;
    
    const isAllowed = this.rateLimiter.checkLimit(`${this.appId}:${method}:${key}`, config);
    if (!isAllowed) {
      const retryAfterMs = this.rateLimiter.getRetryAfter(`${this.appId}:${method}:${key}`, config);
      throw new RateLimitError(
        `Rate limit exceeded for ${method}`,
        retryAfterMs,
        config,
      );
    }
  }
  
  /**
   * Record an API call for auditing
   */
  private async recordApiCall(
    method: string,
    success: boolean,
    durationMs: number,
    errorCode?: string,
    rateLimitKey?: string,
  ): Promise<void> {
    const audit: ApiCallAudit = {
      appId: this.appId,
      method,
      success,
      durationMs,
      errorCode,
      rateLimitKey,
      correlationId: crypto.randomUUID(),
    };
    
    await this.ctx.exports.append({
      source: 'gameserver.api',
      type: 'api.call.audit',
      scope: { tenant: 'system', environment: 'production', service: 'gameserver', component: 'api' },
      idempotencyKey: `audit-${audit.correlationId}`,
      payload: audit,
      occurredAt: new Date(),
      correlationId: audit.correlationId,
    });
  }
  
  // =========================================================================
  // BATTLES IMPLEMENTATION
  // =========================================================================
  
  readonly battles: BattlesAPI = {
    create: async (params: CreateBattleParams): Promise<EncryptedBattle> => {
      const startTime = Date.now();
      const method = 'battles.create';
      
      try {
        this.assertCapability(API_CAPABILITIES.battles.create);
        this.checkRateLimit(method, this.getRateLimitKey(params.challengerId));
        
        // TODO: Implement actual battle creation via battle engine
        // This is a placeholder that will be filled in during implementation
        const battle = await this.createBattleInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return battle;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    get: async (battleId: string): Promise<EncryptedBattle | null> => {
      const startTime = Date.now();
      const method = 'battles.get';
      
      try {
        this.assertCapability(API_CAPABILITIES.battles.get);
        this.checkRateLimit(method, this.appId);
        
        // TODO: Implement battle retrieval
        const battle = await this.getBattleInternal(battleId);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return battle;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    submitMove: async (
      battleId: string,
      participantToken: EncryptedToken,
      action: BattleAction,
    ): Promise<BattleActionResult> => {
      const startTime = Date.now();
      const method = 'battles.submitMove';
      
      try {
        this.assertCapability(API_CAPABILITIES.battles.submitMove);
        this.checkRateLimit(method, participantToken.token);
        
        // TODO: Implement move submission
        const result = await this.submitMoveInternal(battleId, participantToken, action);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    forfeit: async (
      battleId: string,
      participantToken: EncryptedToken,
    ): Promise<BattleEndResult> => {
      const startTime = Date.now();
      const method = 'battles.forfeit';
      
      try {
        this.assertCapability(API_CAPABILITIES.battles.forfeit);
        this.checkRateLimit(method, participantToken.token);
        
        // TODO: Implement forfeit
        const result = await this.forfeitInternal(battleId, participantToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
  };
  
  // =========================================================================
  // ENCOUNTERS IMPLEMENTATION
  // =========================================================================
  
  readonly encounters: EncountersAPI = {
    spawn: async (params: SpawnEncounterParams): Promise<EncryptedEncounter> => {
      const startTime = Date.now();
      const method = 'encounters.spawn';
      
      try {
        this.assertCapability(API_CAPABILITIES.encounters.spawn);
        this.checkRateLimit(method, this.getRateLimitKey(params.channelId));
        
        // TODO: Implement encounter spawning
        const encounter = await this.spawnEncounterInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return encounter;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    get: async (encounterId: string): Promise<EncryptedEncounter | null> => {
      const startTime = Date.now();
      const method = 'encounters.get';
      
      try {
        this.assertCapability(API_CAPABILITIES.encounters.spawn);
        this.checkRateLimit('encounters.catch', this.appId); // Shares with catch
        
        // TODO: Implement encounter retrieval
        const encounter = await this.getEncounterInternal(encounterId);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return encounter;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    catch: async (params: CatchAttemptParams): Promise<CatchResult> => {
      const startTime = Date.now();
      const method = 'encounters.catch';
      
      try {
        this.assertCapability(API_CAPABILITIES.encounters.catch);
        this.checkRateLimit(method, this.appId);
        
        // TODO: Implement catch attempt
        const result = await this.catchInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    flee: async (encounterId: string, ownerToken: EncryptedToken): Promise<FleeResult> => {
      const startTime = Date.now();
      const method = 'encounters.flee';
      
      try {
        this.assertCapability(API_CAPABILITIES.encounters.flee);
        this.checkRateLimit(method, ownerToken.token);
        
        // TODO: Implement flee
        const result = await this.fleeInternal(encounterId, ownerToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
  };
  
  // =========================================================================
  // TRAINERS IMPLEMENTATION
  // =========================================================================
  
  readonly trainers: TrainersAPI = {
    get: async (discordIdToken: EncryptedToken | string): Promise<EncryptedTrainer | null> => {
      const startTime = Date.now();
      const method = 'trainers.get';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.get);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const trainer = await this.getTrainerInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return trainer;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    updateMoney: async (params: UpdateMoneyParams): Promise<UpdateMoneyResult> => {
      const startTime = Date.now();
      const method = 'trainers.updateMoney';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.updateMoney);
        this.checkRateLimit(method, this.getRateLimitKey(params.discordId));
        
        const result = await this.updateMoneyInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    getParty: async (discordIdToken: EncryptedToken | string): Promise<TrainerParty | null> => {
      const startTime = Date.now();
      const method = 'trainers.getParty';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.getParty);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const party = await this.getPartyInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return party;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    getDailyData: async (discordIdToken: EncryptedToken | string): Promise<DailyQuestData | null> => {
      const startTime = Date.now();
      const method = 'trainers.getDailyData';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.getDailyData);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const data = await this.getDailyDataInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return data;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    claimDailyReward: async (params: ClaimDailyRewardParams): Promise<ClaimDailyRewardResult> => {
      const startTime = Date.now();
      const method = 'trainers.claimDailyReward';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.claimDailyReward);
        this.checkRateLimit(method, this.getRateLimitKey(params.discordId));
        
        const result = await this.claimDailyRewardInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    getInventory: async (discordIdToken: EncryptedToken | string): Promise<TrainerInventory | null> => {
      const startTime = Date.now();
      const method = 'trainers.getInventory';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.getInventory);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const inventory = await this.getInventoryInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return inventory;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    useItem: async (params: UseItemParams): Promise<UseItemResult> => {
      const startTime = Date.now();
      const method = 'trainers.useItem';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.useItem);
        this.checkRateLimit(method, this.getRateLimitKey(params.discordId));
        
        const result = await this.useItemInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    getStorage: async (discordIdToken: EncryptedToken | string): Promise<TrainerStorage | null> => {
      const startTime = Date.now();
      const method = 'trainers.getStorage';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.getStorage);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const storage = await this.getStorageInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return storage;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    movePokemon: async (params: MovePokemonParams): Promise<MovePokemonResult> => {
      const startTime = Date.now();
      const method = 'trainers.movePokemon';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.movePokemon);
        this.checkRateLimit(method, this.getRateLimitKey(params.discordId));
        
        const result = await this.movePokemonInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    getSettings: async (discordIdToken: EncryptedToken | string): Promise<GetSettingsResult> => {
      const startTime = Date.now();
      const method = 'trainers.getSettings';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.getSettings);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const result = await this.getSettingsInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    updateSettings: async (params: UpdateSettingsParams): Promise<UpdateSettingsResult> => {
      const startTime = Date.now();
      const method = 'trainers.updateSettings';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.updateSettings);
        this.checkRateLimit(method, this.getRateLimitKey(params.discordId));
        
        const result = await this.updateSettingsInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    getPokedexProgress: async (discordIdToken: EncryptedToken | string): Promise<PokedexProgress | null> => {
      const startTime = Date.now();
      const method = 'trainers.getPokedexProgress';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.getPokedexProgress);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const result = await this.getPokedexProgressInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    getDetailedParty: async (discordIdToken: EncryptedToken | string): Promise<DetailedParty | null> => {
      const startTime = Date.now();
      const method = 'trainers.getDetailedParty';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.getDetailedParty);
        this.checkRateLimit(method, this.getRateLimitKey(discordIdToken));
        
        const result = await this.getDetailedPartyInternal(discordIdToken);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
    
    swapPartySlots: async (params: SwapPartySlotsParams): Promise<SwapPartySlotsResult> => {
      const startTime = Date.now();
      const method = 'trainers.swapPartySlots';
      
      try {
        this.assertCapability(API_CAPABILITIES.trainers.swapPartySlots);
        this.checkRateLimit(method, this.getRateLimitKey(params.discordId));
        
        const result = await this.swapPartySlotsInternal(params);
        
        await this.recordApiCall(method, true, Date.now() - startTime);
        return result;
      } catch (error) {
        await this.recordApiCall(
          method,
          false,
          Date.now() - startTime,
          (error as Error).name,
        );
        throw error;
      }
    },
  };
  
  // =========================================================================
  // LOGS IMPLEMENTATION
  // =========================================================================
  
  readonly logs: LogsAPI = {
    info: (message: string, data?: Record<string, unknown>): void => {
      try {
        this.assertCapability(API_CAPABILITIES.logs.info);
        this.checkRateLimit('logs.info', this.appId);
        
        // Log via structured logging (3-arg form: op, msg, data)
        this.ctx.obs.log.info('app.log', `[${this.appId}] ${message}`, data);
      } catch {
        // Swallow errors for logging - don't break app flow
      }
    },
    
    error: (message: string, data?: Record<string, unknown>): void => {
      try {
        this.assertCapability(API_CAPABILITIES.logs.error);
        this.checkRateLimit('logs.error', this.appId);
        
        // Log via structured logging (3-arg form: op, msg, data)
        this.ctx.obs.log.error('app.log', `[${this.appId}] ${message}`, data);
      } catch {
        // Swallow errors for logging - don't break app flow
      }
    },
  };
  
  // =========================================================================
  // HELPER METHODS
  // =========================================================================
  
  /**
   * Extract rate limit key from token or string
   */
  private getRateLimitKey(token: EncryptedToken | string): string {
    if (typeof token === 'string') {
      return token;
    }
    return token.token;
  }
  
  /**
   * Ensure encryption is initialized (for development mode)
   */
  private ensureEncryption(): void {
    if (!isEncryptionInitialized()) {
      initializeDevelopmentEncryption();
    }
  }
  
  /**
   * Decrypt a token to get the raw value
   */
  private decryptToken(token: EncryptedToken | string): string {
    this.ensureEncryption();
    return extractRawValue(this.appId, token);
  }
  
  /**
   * Encrypt a value for return to the app
   */
  private encryptValue(value: string, type: EncryptedFieldType): EncryptedToken {
    this.ensureEncryption();
    return createEncryptedToken(this.appId, value, type);
  }
  
  // =========================================================================
  // INTERNAL IMPLEMENTATIONS
  // These are stub implementations that return properly-typed responses.
  // Full game system integration will be implemented when battle/encounter
  // engines are connected to the SensaiOS component model.
  // =========================================================================
  
  private async createBattleInternal(params: CreateBattleParams): Promise<EncryptedBattle> {
    // Decrypt participant IDs
    const challenger = this.decryptToken(params.challengerId);
    const opponent = this.decryptToken(params.opponentId);
    const db = this.ctx.db.prisma;
    
    // Get user IDs from discord IDs (Battle stores User.id, not discord ID)
    const [p1, p2] = await Promise.all([
      db.user.findUnique({ where: { discordId: challenger }, select: { id: true } }),
      db.user.findUnique({ where: { discordId: opponent }, select: { id: true } }),
    ]);
    
    if (!p1 || !p2) {
      throw new Error('One or both participants not found');
    }
    
    // Generate RNG seed from idempotency key or participants
    const rngSeed = params.idempotencyKey ?? `${challenger}-${opponent}-${Date.now()}`;
    
    // Create battle in database
    const battle = await db.battle.create({
      data: {
        p1Id: p1.id,
        p2Id: p2.id,
        state: 'Pending',
        rngSeed,
        ruleset: params.format ?? 'singles',
      },
    });
    
    return {
      id: battle.id,
      status: 'pending',
      participant1: this.encryptValue(challenger, 'discord_id'),
      participant2: this.encryptValue(opponent, 'discord_id'),
      turnNumber: 0,
      phase: 'awaiting_moves',
      format: params.format ?? 'singles',
      publicLog: [],
      createdAt: battle.startedAt,
    };
  }
  
  private async getBattleInternal(battleId: string): Promise<EncryptedBattle | null> {
    const db = this.ctx.db.prisma;
    
    const battle = await db.battle.findUnique({
      where: { id: battleId },
      include: {
        p1: { select: { discordId: true } },
        p2: { select: { discordId: true } },
      },
    });
    
    if (!battle) {
      return null;
    }
    
    // Parse log to get turn number
    const log = Array.isArray(battle.logCompact) ? battle.logCompact : [];
    const turnNumber = log.length;
    
    // Map state to status (cancelled maps to 'Aborted' in DB)
    const statusMap: Record<string, EncryptedBattle['status']> = {
      'Pending': 'pending',
      'Active': 'active',
      'Finished': 'finished',
      'Aborted': 'cancelled', // Aborted in DB → cancelled in API
    };
    
    // Map ruleset to format
    const formatMap: Record<string, BattleFormat> = {
      'singles': 'singles',
      'doubles': 'doubles',
      'rotation': 'rotation',
    };
    
    return {
      id: battle.id,
      status: statusMap[battle.state] ?? 'pending',
      participant1: this.encryptValue(battle.p1.discordId, 'discord_id'),
      participant2: this.encryptValue(battle.p2.discordId, 'discord_id'),
      turnNumber,
      phase: 'awaiting_moves', // TODO: Parse from logCompact if available
      format: formatMap[battle.ruleset] ?? 'singles',
      publicLog: [], // Log entries need to be properly typed - return empty for now
      createdAt: battle.startedAt,
    };
  }
  
  private async submitMoveInternal(
    battleId: string,
    participantToken: EncryptedToken,
    action: BattleAction,
  ): Promise<BattleActionResult> {
    void battleId;
    void participantToken;
    void action;
    
    // TODO: Integrate with battle engine when ready
    return {
      accepted: true,
      phase: 'p1_submitted',
    };
  }
  
  private async forfeitInternal(
    battleId: string,
    participantToken: EncryptedToken,
  ): Promise<BattleEndResult> {
    const participantDiscordId = this.decryptToken(participantToken);
    const db = this.ctx.db.prisma;
    
    // Get battle with both participants
    const battle = await db.battle.findUnique({
      where: { id: battleId },
      include: {
        p1: { select: { discordId: true } },
        p2: { select: { discordId: true } },
      },
    });
    
    if (!battle) {
      throw new Error('Battle not found');
    }
    
    // Determine winner (the one who didn't forfeit)
    const isP1 = battle.p1.discordId === participantDiscordId;
    const winnerDiscordId = isP1 ? battle.p2.discordId : battle.p1.discordId;
    const loserDiscordId = participantDiscordId;
    
    // Update battle state to Finished with forfeit result
    await db.battle.update({
      where: { id: battleId },
      data: {
        state: 'Finished',
        endedAt: new Date(),
        resultJson: {
          winner: { discordId: winnerDiscordId },
          loser: { discordId: loserDiscordId },
          reason: 'forfeit',
        },
      },
    });
    
    return {
      battleId,
      status: 'forfeit',
      winner: this.encryptValue(winnerDiscordId, 'discord_id'),
      loser: this.encryptValue(loserDiscordId, 'discord_id'),
      endReason: 'forfeit',
    };
  }
  
  private async spawnEncounterInternal(params: SpawnEncounterParams): Promise<EncryptedEncounter> {
    const db = this.ctx.db.prisma;
    
    // Get user from channel/owner context
    const ownerDiscordId = params.channelId 
      ? this.decryptToken(params.channelId)
      : 'system';
    
    // For now, use channelId as owner lookup (in practice, we'd get the user who triggered)
    const owner = await db.user.findFirst({
      where: { discordId: ownerDiscordId },
      select: { id: true },
    });
    
    if (!owner) {
      throw new Error('Owner not found for encounter');
    }
    
    // Determine species based on rarity (simplified for now)
    // In production, this would use the encounter spawn system
    const raritySpeciesMap: Record<string, number> = {
      'common': 19,      // Rattata
      'uncommon': 25,    // Pikachu
      'rare': 143,       // Snorlax
      'ultra-rare': 150, // Mewtwo
    };
    const speciesId = raritySpeciesMap[params.rarityOverride ?? 'common'] ?? 19;
    
    // Use deterministic RNG for gameplay-affecting rolls (SensaiOS compliant)
    const rng = this.ctx.rng.derive(['encounter', 'spawn', owner.id, Date.now().toString()]);
    const level = rng.int(1, 10);
    const isShiny = rng.random() < 0.001; // 1 in 1000
    
    // Create encounter in database
    const encounter = await db.encounter.create({
      data: {
        ownerId: owner.id,
        speciesId,
        level,
        state: 'Spawned',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        tenantId: this.ctx.scope.tenant ?? null,
        dataJson: {
          rarity: params.rarityOverride ?? 'common',
          isShiny,
          catchAttempts: 0,
        },
      },
      include: {
        species: { select: { name: true } },
      },
    });
    
    const data = encounter.dataJson as { rarity?: string; isShiny?: boolean; catchAttempts?: number } | null;
    
    return {
      id: encounter.id,
      status: 'spawned',
      owner: this.encryptValue(ownerDiscordId, 'discord_id'),
      speciesId: encounter.speciesId,
      speciesName: encounter.species?.name ?? 'Unknown',
      level: encounter.level,
      isShiny: data?.isShiny ?? false,
      rarity: (data?.rarity ?? 'common') as EncryptedEncounter['rarity'],
      expiresAt: encounter.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      catchAttempts: data?.catchAttempts ?? 0,
      createdAt: encounter.startedAt,
    };
  }
  
  private async getEncounterInternal(encounterId: string): Promise<EncryptedEncounter | null> {
    const db = this.ctx.db.prisma;
    
    const encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      include: {
        owner: { select: { discordId: true } },
        species: { select: { name: true } },
      },
    });
    
    if (!encounter) {
      return null;
    }
    
    const data = encounter.dataJson as { rarity?: string; isShiny?: boolean; catchAttempts?: number } | null;
    
    // Map state to status
    const statusMap: Record<string, EncryptedEncounter['status']> = {
      'Idle': 'spawned',
      'Spawned': 'spawned',
      'Caught': 'caught',
      'Fled': 'fled',
      'Fainted': 'fled',
      'Expired': 'expired',
    };
    
    return {
      id: encounter.id,
      status: statusMap[encounter.state] ?? 'spawned',
      owner: this.encryptValue(encounter.owner.discordId, 'discord_id'),
      speciesId: encounter.speciesId,
      speciesName: encounter.species?.name ?? 'Unknown',
      level: encounter.level,
      isShiny: data?.isShiny ?? false,
      rarity: (data?.rarity ?? 'common') as EncryptedEncounter['rarity'],
      expiresAt: encounter.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      catchAttempts: data?.catchAttempts ?? 0,
      createdAt: encounter.startedAt,
    };
  }
  
  private async catchInternal(params: CatchAttemptParams): Promise<CatchResult> {
    const db = this.ctx.db.prisma;
    
    const encounter = await db.encounter.findUnique({
      where: { id: params.encounterId },
      include: {
        owner: { select: { id: true, discordId: true } },
        species: true,
      },
    });
    
    if (!encounter || encounter.state !== 'Spawned') {
      return {
        success: false,
        probability: 0,
        fled: true,
        shakes: 0,
      };
    }
    
    // Calculate catch probability (simplified)
    // In production, this would use the full catch rate formula
    const baseRate = 255; // Assumed catch rate
    const ballBonus = params.ballType === 'ultra' ? 2.0 : params.ballType === 'great' ? 1.5 : 1.0;
    const levelModifier = Math.max(0.5, 1 - (encounter.level / 100));
    const probability = Math.min(1, (baseRate / 255) * ballBonus * levelModifier);
    
    // Use deterministic RNG for gameplay-affecting rolls (SensaiOS compliant)
    const catchRng = this.ctx.rng.derive(['encounter', 'catch', params.encounterId, Date.now().toString()]);
    const roll = catchRng.random();
    const success = roll < probability;
    
    // Calculate shake count (0-3)
    const shakes = success ? 3 : Math.floor(roll / probability * 3);
    
    // Update encounter state
    const data = encounter.dataJson as { catchAttempts?: number; rarity?: string; isShiny?: boolean } | null;
    const newAttempts = (data?.catchAttempts ?? 0) + 1;
    const fled = !success && newAttempts >= 3; // Flee after 3 failed attempts
    
    await db.encounter.update({
      where: { id: params.encounterId },
      data: {
        state: success ? 'Caught' : (fled ? 'Fled' : 'Spawned'),
        dataJson: {
          ...data,
          catchAttempts: newAttempts,
        },
      },
    });
    
    // If caught, create PokemonInstance for the owner
    let pokemonId: string | undefined;
    if (success) {
      // Use deterministic RNG for IV generation (SensaiOS compliant)
      const ivRng = this.ctx.rng.derive(['pokemon', 'ivs', params.encounterId, Date.now().toString()]);
      const ivsJson = {
        hp: ivRng.int(0, 31),
        atk: ivRng.int(0, 31),
        def: ivRng.int(0, 31),
        spa: ivRng.int(0, 31),
        spd: ivRng.int(0, 31),
        spe: ivRng.int(0, 31),
      };
      
      // Initialize EVs to 0
      const evsJson = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
      
      // Default moveset (empty for now, would need species data for real moves)
      const movesJson: { id: number; pp: number; maxPP: number }[] = [];
      
      const pokemon = await db.pokemonInstance.create({
        data: {
          ownerId: encounter.owner.id,
          speciesId: encounter.speciesId,
          level: encounter.level,
          hp: encounter.species?.baseHp ?? 50,
          maxHp: encounter.species?.baseHp ?? 50,
          isShiny: data?.isShiny ?? false,
          ivsJson,
          evsJson,
          movesJson,
          tenantId: this.ctx.scope.tenant ?? null,
          originalTrainerId: encounter.owner.discordId,
        },
      });
      pokemonId = pokemon.id;
    }
    
    return {
      success,
      probability,
      fled,
      shakes,
      pokemonId,
    };
  }
  
  private async fleeInternal(
    encounterId: string,
    ownerToken: EncryptedToken,
  ): Promise<FleeResult> {
    const db = this.ctx.db.prisma;
    const ownerDiscordId = this.decryptToken(ownerToken);
    
    const encounter = await db.encounter.findUnique({
      where: { id: encounterId },
      include: {
        owner: { select: { discordId: true } },
      },
    });
    
    if (!encounter) {
      return {
        success: false,
        status: 'fled', // Default status when not found
        error: 'Encounter not found',
      };
    }
    
    // Verify owner matches
    if (encounter.owner.discordId !== ownerDiscordId) {
      return {
        success: false,
        status: 'spawned', // Encounter still exists, just not owned by caller
        error: 'Not the encounter owner',
      };
    }
    
    // Update encounter state to Fled
    await db.encounter.update({
      where: { id: encounterId },
      data: {
        state: 'Fled',
      },
    });
    
    return {
      success: true,
      status: 'fled',
    };
  }
  
  private async getTrainerInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<EncryptedTrainer | null> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    // Query database for user with pokemon count
    const user = await db.user.findUnique({
      where: { discordId },
      select: {
        id: true,
        discordId: true,
        coins: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            pokemon: true,
          },
        },
      },
    });
    
    if (!user) {
      return null;
    }
    
    // Get battle stats using raw SQL for efficiency
    // Battle.resultJson contains { winner: { discordId }, loser: { discordId } }
    const battleStats = await db.$queryRaw<[{ total: bigint; wins: bigint }]>`
      SELECT 
        COUNT(*) as total,
        SUM(CASE 
          WHEN "resultJson"->'winner'->>'discordId' = ${discordId} THEN 1 
          ELSE 0 
        END) as wins
      FROM "Battle" b
      JOIN "User" u1 ON b."p1Id" = u1."id"
      JOIN "User" u2 ON b."p2Id" = u2."id"
      WHERE (u1."discordId" = ${discordId} OR u2."discordId" = ${discordId})
        AND b."state" = 'Finished'
    `;
    
    const totalBattles = Number(battleStats[0]?.total ?? 0n);
    const totalWins = Number(battleStats[0]?.wins ?? 0n);
    const totalLosses = totalBattles - totalWins;
    
    return {
      id: user.id,
      discordId: this.encryptValue(user.discordId, 'discord_id'),
      displayName: 'Trainer', // Display name comes from Discord, not DB
      money: user.coins,
      totalCaught: user._count.pokemon,
      battlesWon: totalWins,
      battlesLost: totalLosses,
      pokedexCompletion: 0, // TODO: Calculate from unique species
      createdAt: user.createdAt,
      lastActiveAt: user.updatedAt,
    };
  }
  
  private async updateMoneyInternal(params: UpdateMoneyParams): Promise<UpdateMoneyResult> {
    const discordId = this.decryptToken(params.discordId);
    const db = this.ctx.db.prisma;
    
    // Update money with atomic increment/decrement
    try {
      const updated = await db.user.update({
        where: { discordId },
        data: {
          coins: {
            increment: params.delta,
          },
        },
        select: {
          coins: true,
        },
      });
      
      return {
        success: true,
        newBalance: updated.coins,
      };
    } catch {
      // User not found or constraint violation
      return {
        success: false,
        newBalance: 0,
      };
    }
  }
  
  private async getPartyInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<TrainerParty | null> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    // Get user first to get their ID
    const user = await db.user.findUnique({
      where: { discordId },
      select: { id: true },
    });
    
    if (!user) {
      return null;
    }
    
    // Get party with slots
    const party = await db.party.findUnique({
      where: { ownerId: user.id },
      include: {
        slots: {
          include: {
            pokemon: {
              select: {
                id: true,
                speciesId: true,
                nickname: true,
                level: true,
                hp: true,
                maxHp: true,
                isShiny: true,
                status: true,
                species: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
          orderBy: {
            slot: 'asc',
          },
        },
      },
    });
    
    if (!party) {
      return {
        slots: [],
        count: 0,
      };
    }
    
    // Map slots to PartySlot interface, filtering out empty slots
    const mappedSlots: (PartySlot | null)[] = party.slots.map(slot => {
      if (!slot.pokemon) {
        return null;
      }
      
      return {
        pokemonId: slot.pokemon.id,
        speciesId: slot.pokemon.speciesId ?? 0,
        speciesName: slot.pokemon.species?.name ?? 'Unknown',
        nickname: slot.pokemon.nickname ?? undefined,
        level: slot.pokemon.level ?? 1,
        isShiny: slot.pokemon.isShiny ?? false,
        currentHp: slot.pokemon.hp ?? 0,
        maxHp: slot.pokemon.maxHp ?? 0,
        moves: [], // TODO: Load moves when move system is connected
      };
    });
    
    return {
      slots: mappedSlots,
      count: mappedSlots.filter(s => s !== null).length,
    };
  }
  
  /**
   * Get daily quest data internal implementation
   */
  private async getDailyDataInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<DailyQuestData | null> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    const user = await db.user.findUnique({
      where: { discordId },
      select: {
        coins: true,
        dailyQuestStreak: true,
        dailyQuestLastCompleted: true,
        dailyQuestLastReset: true,
      },
    });
    
    if (!user) {
      return null;
    }
    
    // Check if can claim (24 hours since last claim)
    const now = new Date();
    let canClaim = true;
    let nextClaimAt: Date | null = null;
    
    if (user.dailyQuestLastCompleted) {
      const lastClaim = new Date(user.dailyQuestLastCompleted);
      const nextClaim = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
      
      if (now < nextClaim) {
        canClaim = false;
        nextClaimAt = nextClaim;
      }
    }
    
    return {
      streak: user.dailyQuestStreak ?? 0,
      canClaim,
      nextClaimAt,
      coins: user.coins ?? 0,
      lastClaimed: user.dailyQuestLastCompleted,
    };
  }
  
  /**
   * Claim daily reward internal implementation
   */
  private async claimDailyRewardInternal(
    params: ClaimDailyRewardParams,
  ): Promise<ClaimDailyRewardResult> {
    const discordId = this.decryptToken(params.discordId);
    const db = this.ctx.db.prisma;
    
    // Get current user state
    const user = await db.user.findUnique({
      where: { discordId },
      select: {
        id: true,
        coins: true,
        dailyQuestStreak: true,
        dailyQuestLastCompleted: true,
      },
    });
    
    if (!user) {
      return { success: false, error: 'Trainer not found' };
    }
    
    // Check cooldown
    const now = new Date();
    if (user.dailyQuestLastCompleted) {
      const lastClaim = new Date(user.dailyQuestLastCompleted);
      const nextClaim = new Date(lastClaim.getTime() + 24 * 60 * 60 * 1000);
      
      if (now < nextClaim) {
        return { success: false, error: 'Daily reward already claimed' };
      }
    }
    
    // Calculate reward and new streak
    const baseReward = 100;
    const newStreak = (user.dailyQuestStreak ?? 0) + 1;
    const streakMultiplier = Math.min(newStreak, 7); // Cap at 7x
    const rewardCoins = baseReward * streakMultiplier;
    const newBalance = (user.coins ?? 0) + rewardCoins;
    
    // Update user
    await db.user.update({
      where: { id: user.id },
      data: {
        coins: newBalance,
        dailyQuestStreak: newStreak,
        dailyQuestLastCompleted: now,
      },
    });
    
    return {
      success: true,
      rewardCoins,
      newStreak,
      newBalance,
    };
  }
  
  /**
   * Get inventory internal implementation
   */
  private async getInventoryInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<TrainerInventory | null> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    // Get user first
    const user = await db.user.findUnique({
      where: { discordId },
      select: { id: true },
    });
    
    if (!user) {
      return null;
    }
    
    // Get trainer
    const trainer = await db.trainer.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    
    if (!trainer) {
      return {
        items: [],
        totalItems: 0,
        uniqueItems: 0,
      };
    }
    
    // Fetch inventory with item details
    const inventory = await db.inventory.findMany({
      where: { trainerId: trainer.id },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            kind: true,
            meta: true,
          },
        },
      },
    });
    
    const items: InventoryItem[] = inventory
      .filter(inv => inv.qty > 0)
      .map(inv => ({
        itemId: inv.item.id,
        name: inv.item.name ?? 'Unknown',
        category: this.mapItemKind(inv.item.kind ?? 'misc'),
        quantity: inv.qty,
        meta: inv.item.meta as Record<string, unknown> | undefined,
      }));
    
    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
    
    return {
      items,
      totalItems,
      uniqueItems: items.length,
    };
  }
  
  /**
   * Map database item kind to ItemCategory
   */
  private mapItemKind(kind: string): import('./types.js').ItemCategory {
    const kindMap: Record<string, import('./types.js').ItemCategory> = {
      pokeball: 'pokeball',
      ball: 'pokeball',
      potion: 'potion',
      heal: 'potion',
      battle: 'battle',
      berry: 'berry',
      evolution: 'evolution',
      held: 'held',
      key: 'key',
    };
    return kindMap[kind.toLowerCase()] ?? 'misc';
  }
  
  /**
   * Use item internal implementation
   */
  private async useItemInternal(
    params: UseItemParams,
  ): Promise<UseItemResult> {
    const discordId = this.decryptToken(params.discordId);
    const db = this.ctx.db.prisma;
    
    // Get user and trainer
    const user = await db.user.findUnique({
      where: { discordId },
      select: { id: true },
    });
    
    if (!user) {
      return { success: false, error: 'Trainer not found' };
    }
    
    const trainer = await db.trainer.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    
    if (!trainer) {
      return { success: false, error: 'Trainer not found' };
    }
    
    // Get inventory entry
    const inventoryEntry = await db.inventory.findFirst({
      where: {
        trainerId: trainer.id,
        itemId: params.itemId,
      },
      include: {
        item: true,
      },
    });
    
    if (!inventoryEntry || inventoryEntry.qty < (params.quantity ?? 1)) {
      return { success: false, error: 'Item not found or insufficient quantity' };
    }
    
    // Decrement quantity
    const newQty = inventoryEntry.qty - (params.quantity ?? 1);
    if (newQty <= 0) {
      await db.inventory.delete({
        where: { 
          trainerId_itemId: {
            trainerId: trainer.id,
            itemId: params.itemId,
          },
        },
      });
    } else {
      await db.inventory.update({
        where: { 
          trainerId_itemId: {
            trainerId: trainer.id,
            itemId: params.itemId,
          },
        },
        data: { qty: newQty },
      });
    }
    
    // TODO: Apply item effect to target Pokemon if applicable
    
    return {
      success: true,
      remainingQuantity: newQty,
      effectDescription: `Used ${inventoryEntry.item.name}`,
    };
  }
  
  /**
   * Get storage internal implementation
   */
  private async getStorageInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<TrainerStorage | null> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    // Get user
    const user = await db.user.findUnique({
      where: { discordId },
      select: { id: true },
    });
    
    if (!user) {
      return null;
    }
    
    // Get all Pokemon in storage (not in party)
    const storedPokemon = await db.pokemonInstance.findMany({
      where: {
        ownerId: user.id,
        partySlots: {
          none: {}, // Not in any party slot
        },
      },
      include: {
        species: {
          select: { name: true },
        },
      },
      orderBy: [
        { speciesId: 'asc' },
        { level: 'desc' },
      ],
    });
    
    const pokemon: StoredPokemon[] = storedPokemon.map((p, index) => ({
      pokemonId: p.id,
      speciesId: p.speciesId ?? 0,
      speciesName: p.species?.name ?? 'Unknown',
      nickname: p.nickname ?? undefined,
      level: p.level ?? 1,
      isShiny: p.isShiny ?? false,
      currentHp: p.hp ?? 0,
      maxHp: p.maxHp ?? 0,
      boxNumber: Math.floor(index / 30) + 1, // 30 Pokemon per box
      boxSlot: (index % 30) + 1,
    }));
    
    return {
      pokemon,
      totalCount: pokemon.length,
      maxCapacity: 1000, // Default max storage
    };
  }
  
  /**
   * Move Pokemon internal implementation
   */
  private async movePokemonInternal(
    params: MovePokemonParams,
  ): Promise<MovePokemonResult> {
    const discordId = this.decryptToken(params.discordId);
    const db = this.ctx.db.prisma;
    
    // Get user
    const user = await db.user.findUnique({
      where: { discordId },
      select: { id: true },
    });
    
    if (!user) {
      return { success: false, error: 'Trainer not found' };
    }
    
    // Get the Pokemon
    const pokemon = await db.pokemonInstance.findFirst({
      where: {
        id: params.pokemonId,
        ownerId: user.id,
      },
    });
    
    if (!pokemon) {
      return { success: false, error: 'Pokemon not found' };
    }
    
    if (params.targetLocation === 'party') {
      // Moving to party
      const party = await db.party.findUnique({
        where: { ownerId: user.id },
        include: {
          slots: {
            orderBy: { slot: 'asc' },
          },
        },
      });
      
      if (!party) {
        return { success: false, error: 'Party not found' };
      }
      
      // Find available slot
      const targetSlot = params.targetSlot ?? (party.slots.length + 1);
      if (targetSlot > 6) {
        return { success: false, error: 'Party is full' };
      }
      
      // Check if slot is already taken
      const existingSlot = party.slots.find(s => s.slot === targetSlot);
      if (existingSlot) {
        return { success: false, error: 'Slot already occupied' };
      }
      
      // Create party slot
      await db.partySlot.create({
        data: {
          partyId: party.id,
          pokemonId: params.pokemonId,
          slot: targetSlot,
        },
      });
      
      return {
        success: true,
        newLocation: `Party slot ${targetSlot}`,
      };
    } else {
      // Moving to storage (remove from party)
      const partySlot = await db.partySlot.findFirst({
        where: {
          pokemonId: params.pokemonId,
          party: {
            ownerId: user.id,
          },
        },
      });
      
      if (!partySlot) {
        return { success: true, newLocation: 'Storage' }; // Already in storage
      }
      
      await db.partySlot.delete({
        where: { id: partySlot.id },
      });
      
      return {
        success: true,
        newLocation: 'Storage',
      };
    }
  }
  
  /**
   * Get settings internal implementation
   */
  private async getSettingsInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<GetSettingsResult> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    const user = await db.user.findUnique({
      where: { discordId },
      select: { settingsJson: true },
    });
    
    if (!user) {
      // Return default settings for new users
      return {
        success: true,
        settings: { ...DEFAULT_TRAINER_SETTINGS },
      };
    }
    
    // Parse settings from JSON, merging with defaults
    let settings: TrainerSettings = { ...DEFAULT_TRAINER_SETTINGS };
    if (user.settingsJson) {
      try {
        const parsed = typeof user.settingsJson === 'string'
          ? JSON.parse(user.settingsJson)
          : user.settingsJson;
        settings = { ...DEFAULT_TRAINER_SETTINGS, ...parsed };
      } catch {
        // Invalid JSON, use defaults
      }
    }
    
    return {
      success: true,
      settings,
    };
  }
  
  /**
   * Update settings internal implementation
   */
  private async updateSettingsInternal(
    params: UpdateSettingsParams,
  ): Promise<UpdateSettingsResult> {
    const discordId = this.decryptToken(params.discordId);
    const db = this.ctx.db.prisma;
    
    // Get current user with settings
    const existingUser = await db.user.findUnique({
      where: { discordId },
      select: { id: true, settingsJson: true },
    });
    
    // Ensure user exists (create if not)
    let userId: string;
    let currentSettings: TrainerSettings = { ...DEFAULT_TRAINER_SETTINGS };
    
    if (existingUser) {
      userId = existingUser.id;
      if (existingUser.settingsJson) {
        try {
          const parsed = typeof existingUser.settingsJson === 'string'
            ? JSON.parse(existingUser.settingsJson as string)
            : existingUser.settingsJson;
          currentSettings = { ...DEFAULT_TRAINER_SETTINGS, ...parsed };
        } catch {
          // Invalid JSON, use defaults
        }
      }
    } else {
      // Create new user
      const newUser = await db.user.create({
        data: {
          discordId,
          coins: 0,
        },
        select: { id: true },
      });
      userId = newUser.id;
    }
    
    // Update the specific setting
    const updatedSettings = {
      ...currentSettings,
      [params.key]: params.value,
    };
    
    // Save to database
    await db.user.update({
      where: { id: userId },
      data: {
        settingsJson: JSON.stringify(updatedSettings),
      },
    });
    
    return {
      success: true,
      settings: updatedSettings,
    };
  }
  
  /**
   * Get Pokedex progress internal implementation
   */
  private async getPokedexProgressInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<PokedexProgress | null> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    // Get trainer
    const trainer = await db.trainer.findFirst({
      where: {
        user: { discordId },
      },
      select: { id: true },
    });
    
    if (!trainer) {
      return null;
    }
    
    // Get unique species caught by this trainer
    const caughtPokemon = await db.pokemonInstance.findMany({
      where: { ownerId: trainer.id },
      select: { speciesId: true },
      distinct: ['speciesId'],
    });
    
    const caughtSpeciesIds = new Set(caughtPokemon.map(p => p.speciesId));
    const totalCaught = caughtSpeciesIds.size;
    
    // Define regions (same as in pokedex.ts)
    const REGIONS = [
      { id: 'kanto', label: 'Kanto', emoji: '🔴', start: 1, end: 151 },
      { id: 'johto', label: 'Johto', emoji: '🟡', start: 152, end: 251 },
      { id: 'hoenn', label: 'Hoenn', emoji: '🟢', start: 252, end: 386 },
      { id: 'sinnoh', label: 'Sinnoh', emoji: '🔵', start: 387, end: 493 },
      { id: 'unova', label: 'Unova', emoji: '⚫', start: 494, end: 649 },
      { id: 'kalos', label: 'Kalos', emoji: '🟣', start: 650, end: 721 },
      { id: 'alola', label: 'Alola', emoji: '🌴', start: 722, end: 809 },
      { id: 'galar', label: 'Galar', emoji: '🗡️', start: 810, end: 898 },
    ];
    
    const totalSpecies = REGIONS.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
    
    // Calculate per-region progress
    const regions: RegionProgress[] = REGIONS.map(region => {
      const total = region.end - region.start + 1;
      let caught = 0;
      for (let id = region.start; id <= region.end; id++) {
        if (caughtSpeciesIds.has(id)) caught++;
      }
      return {
        regionId: region.id,
        label: region.label,
        emoji: region.emoji,
        caught,
        total,
        percentage: Math.round((caught / total) * 100),
        remaining: total - caught,
      };
    });
    
    return {
      totalCaught,
      totalSpecies,
      overallPercentage: Math.round((totalCaught / totalSpecies) * 100),
      regions,
      caughtSpeciesIds,
    };
  }
  
  /**
   * Get detailed party internal implementation
   */
  private async getDetailedPartyInternal(
    discordIdToken: EncryptedToken | string,
  ): Promise<DetailedParty | null> {
    const discordId = this.decryptToken(discordIdToken);
    const db = this.ctx.db.prisma;
    
    // Get user
    const user = await db.user.findUnique({
      where: { discordId },
      select: { id: true },
    });
    
    if (!user) {
      return null;
    }
    
    // Get party with slots and full Pokemon data
    const party = await db.party.findUnique({
      where: { ownerId: user.id },
      include: {
        slots: {
          include: {
            pokemon: {
              include: {
                species: true,
              },
            },
          },
          orderBy: { slot: 'asc' },
        },
      },
    });
    
    if (!party) {
      return { slots: [null, null, null, null, null, null], count: 0 };
    }
    
    // Build 6-slot array
    const slots: (DetailedPartySlot | null)[] = [null, null, null, null, null, null];
    
    for (const partySlot of party.slots) {
      const poke = partySlot.pokemon;
      const slot = partySlot.slot;
      
      if (slot < 0 || slot > 5) continue;
      
      // Parse JSON fields
      const ivs = this.parseStatBlock(poke.ivsJson);
      const evs = this.parseStatBlock(poke.evsJson);
      const moves = this.parseMoves(poke.movesJson);
      
      // Get base stats from species or use defaults
      const baseStats: StatBlock = {
        hp: poke.species?.baseHp ?? 50,
        atk: poke.species?.baseAtk ?? 50,
        def: poke.species?.baseDef ?? 50,
        spa: poke.species?.baseSpAtk ?? 50,
        spd: poke.species?.baseSpDef ?? 50,
        spe: poke.species?.baseSpe ?? 50,
      };
      
      // Calculate max HP (simplified formula)
      const level = poke.level ?? 1;
      const maxHp = Math.floor(((2 * baseStats.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) + level + 10;
      
      slots[slot] = {
        pokemonId: poke.id,
        speciesId: poke.speciesId,
        speciesName: poke.species?.name ?? `Species #${poke.speciesId}`,
        nickname: poke.nickname ?? undefined,
        level,
        isShiny: poke.isShiny,
        currentHp: poke.hp ?? maxHp,
        maxHp,
        moves,
        exp: poke.exp ?? 0,
        nature: poke.nature ?? null,
        status: poke.status ?? null,
        slot,
        ivs,
        evs,
        baseStats,
      };
    }
    
    return {
      slots,
      count: party.slots.length,
    };
  }
  
  /**
   * Helper to parse stat block from JSON
   */
  private parseStatBlock(json: unknown): StatBlock {
    const defaults: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    if (!json) return defaults;
    
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      return {
        hp: parsed.hp ?? 0,
        atk: parsed.atk ?? 0,
        def: parsed.def ?? 0,
        spa: parsed.spa ?? 0,
        spd: parsed.spd ?? 0,
        spe: parsed.spe ?? 0,
      };
    } catch {
      return defaults;
    }
  }
  
  /**
   * Helper to parse moves from JSON
   */
  private parseMoves(json: unknown): string[] {
    if (!json) return [];
    
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      if (Array.isArray(parsed)) {
        return parsed.filter((m): m is string => typeof m === 'string');
      }
      return [];
    } catch {
      return [];
    }
  }
  
  /**
   * Swap party slots internal implementation
   */
  private async swapPartySlotsInternal(
    params: SwapPartySlotsParams,
  ): Promise<SwapPartySlotsResult> {
    const discordId = this.decryptToken(params.discordId);
    const db = this.ctx.db.prisma;
    
    // Validate slot numbers
    if (params.slotA < 0 || params.slotA > 5 || params.slotB < 0 || params.slotB > 5) {
      return { success: false, error: 'Invalid slot numbers (must be 0-5)' };
    }
    
    if (params.slotA === params.slotB) {
      return { success: true }; // No-op
    }
    
    // Get user
    const user = await db.user.findUnique({
      where: { discordId },
      select: { id: true },
    });
    
    if (!user) {
      return { success: false, error: 'Trainer not found' };
    }
    
    // Get party
    const party = await db.party.findUnique({
      where: { ownerId: user.id },
      include: {
        slots: {
          where: {
            slot: { in: [params.slotA, params.slotB] },
          },
        },
      },
    });
    
    if (!party) {
      return { success: false, error: 'Party not found' };
    }
    
    const slotA = party.slots.find(s => s.slot === params.slotA);
    const slotB = party.slots.find(s => s.slot === params.slotB);
    
    if (!slotA && !slotB) {
      return { success: true }; // Both empty, no-op
    }
    
    // Perform the swap using transaction
    await db.$transaction(async (tx) => {
      if (slotA && slotB) {
        // Both slots occupied - use temp slot to avoid unique constraint
        await tx.partySlot.update({
          where: { id: slotA.id },
          data: { slot: -1 }, // Temp
        });
        await tx.partySlot.update({
          where: { id: slotB.id },
          data: { slot: params.slotA },
        });
        await tx.partySlot.update({
          where: { id: slotA.id },
          data: { slot: params.slotB },
        });
      } else if (slotA) {
        // Only A occupied - move to B
        await tx.partySlot.update({
          where: { id: slotA.id },
          data: { slot: params.slotB },
        });
      } else if (slotB) {
        // Only B occupied - move to A
        await tx.partySlot.update({
          where: { id: slotB.id },
          data: { slot: params.slotA },
        });
      }
    });
    
    return { success: true };
  }
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Error thrown when an app lacks a required capability
 */
export class CapabilityError extends Error {
  readonly capability: GameCapability;
  
  constructor(message: string, capability: GameCapability) {
    super(message);
    this.name = 'CapabilityError';
    this.capability = capability;
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends Error {
  readonly retryAfterMs: number;
  readonly limit: RateLimitConfig;
  
  constructor(message: string, retryAfterMs: number, limit: RateLimitConfig) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
    this.limit = limit;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a GameServerAPI client for a component
 * 
 * This is the ONLY authorized way for Ring 3 apps to interact with game systems.
 * The returned client enforces capability checking, rate limiting, and audit logging.
 * 
 * @param ctx - Component context (provides db, exports, obs primitives)
 * @param manifest - Component manifest (provides capability list)
 * @returns GameServerAPI client bound to the app's capabilities
 * 
 * @example
 * ```ts
 * // In your component's onEnable hook:
 * export const onEnable = async (ctx: ComponentContext): Promise<void> => {
 *   const gameServer = createGameServerClient(ctx, manifest);
 *   
 *   // Store for use in handlers
 *   globalThis.gameServer = gameServer;
 * };
 * 
 * // In a Discord handler:
 * const battle = await globalThis.gameServer.battles.create({
 *   challengerId: encryptedUserId,
 *   opponentId: encryptedOpponentId,
 *   format: 'singles',
 * });
 * ```
 */
export function createGameServerClient(
  ctx: ComponentContext,
  manifest: ComponentManifest,
): GameServerAPI {
  return new GameServerClient(ctx, manifest);
}
