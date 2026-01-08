/**
 * SensaiOS GameServer Types — Type Definitions for Game Server API
 * 
 * This module defines all types for the GameServerAPI, the ONLY interface
 * that Ring 3 apps (Discord bot, etc.) can use to interact with game systems.
 * 
 * Key principles:
 * - Apps NEVER see raw Discord IDs, guild IDs, or sensitive data
 * - All sensitive fields are encrypted with per-app keys
 * - Rate limiting is enforced at the API boundary
 * - All operations are audited via exports
 * 
 * @module sensaios/gameserver/types
 * @since 2026-01-03
 */

// ============================================================================
// ENCRYPTION TYPES
// ============================================================================

/**
 * Encrypted token representing sensitive data
 * 
 * Apps receive these tokens instead of raw values. They can use tokens
 * for operations but cannot decrypt them.
 * 
 * @example
 * ```ts
 * // App receives:
 * const battle = await gameServer.battles.get(battleId);
 * console.log(battle.participant1); // { token: "enc_abc123...", type: "discord_id" }
 * 
 * // App can use the token:
 * await gameServer.trainers.get(battle.participant1); // Works!
 * 
 * // But cannot decrypt:
 * console.log(battle.participant1.token); // Just the encrypted string
 * ```
 */
export interface EncryptedToken {
  /** The encrypted value (AES-256-GCM) */
  readonly token: string;
  
  /** Type hint for validation */
  readonly type: EncryptedFieldType;
}

/**
 * Types of fields that can be encrypted
 */
export type EncryptedFieldType = 
  | 'discord_id'    // User Discord snowflake
  | 'guild_id'      // Guild Discord snowflake
  | 'channel_id'    // Channel Discord snowflake
  | 'trainer_data'  // Sensitive trainer information
  | 'ip_address'    // User IP (if tracked)
  | 'custom';       // App-specific sensitive data

// ============================================================================
// BATTLE TYPES
// ============================================================================

/**
 * Parameters for creating a new battle
 */
export interface CreateBattleParams {
  /** Encrypted challenger Discord ID (received from interaction) */
  challengerId: EncryptedToken | string;
  
  /** Encrypted opponent Discord ID */
  opponentId: EncryptedToken | string;
  
  /** Battle format */
  format: BattleFormat;
  
  /** Optional guild ID where battle occurs */
  guildId?: EncryptedToken | string;
  
  /** Optional channel ID for spectator broadcasting */
  channelId?: EncryptedToken | string;
  
  /** Idempotency key to prevent duplicate battles */
  idempotencyKey?: string;
}

/**
 * Supported battle formats
 */
export type BattleFormat = 
  | 'singles'      // 1v1 battle
  | 'doubles'      // 2v2 battle (future)
  | 'rotation';    // Rotation battle (future)

/**
 * Battle state for apps (sensitive data encrypted)
 */
export interface EncryptedBattle {
  /** Battle ID */
  id: string;
  
  /** Current battle status */
  status: BattleStatus;
  
  /** Encrypted participant 1 Discord ID */
  participant1: EncryptedToken;
  
  /** Encrypted participant 2 Discord ID */
  participant2: EncryptedToken;
  
  /** Current turn number (1-indexed) */
  turnNumber: number;
  
  /** Current turn phase */
  phase: BattleTurnPhase;
  
  /** Battle format */
  format: BattleFormat;
  
  /** Public battle log (safe to show to spectators) */
  publicLog: BattleLogEntry[];
  
  /** When battle was created */
  createdAt: Date;
  
  /** When battle ended (if ended) */
  endedAt?: Date;
  
  /** Winner participant token (if ended) */
  winner?: EncryptedToken;
}

/**
 * Battle status states
 */
export type BattleStatus = 
  | 'pending'      // Waiting for opponent acceptance
  | 'active'       // Battle in progress
  | 'finished'     // Battle completed normally
  | 'forfeit'      // One participant forfeited
  | 'expired'      // Challenge expired
  | 'cancelled';   // Battle was cancelled

/**
 * Battle turn phases
 */
export type BattleTurnPhase = 
  | 'awaiting_moves'   // Waiting for both players to submit
  | 'p1_submitted'     // Player 1 submitted, waiting for player 2
  | 'p2_submitted'     // Player 2 submitted, waiting for player 1
  | 'resolving'        // Turn is being resolved
  | 'resolved';        // Turn completed, ready for next

/**
 * Battle action types
 */
export interface BattleAction {
  /** Type of action */
  type: 'move' | 'switch' | 'item' | 'forfeit';
  
  /** Move name (if type is 'move') */
  move?: string;
  
  /** Pokemon slot to switch to (if type is 'switch') */
  switchTo?: number;
  
  /** Item to use (if type is 'item') */
  item?: string;
}

/**
 * Result of submitting a battle action
 */
export interface BattleActionResult {
  /** Whether the action was accepted */
  accepted: boolean;
  
  /** Error message if not accepted */
  error?: string;
  
  /** Current turn phase after submission */
  phase: BattleTurnPhase;
  
  /** Turn result if both players submitted */
  turnResult?: TurnResult;
}

/**
 * Result of a battle turn
 */
export interface TurnResult {
  /** Turn number that was resolved */
  turnNumber: number;
  
  /** Log entries for this turn */
  log: BattleLogEntry[];
  
  /** Whether the battle ended this turn */
  battleEnded: boolean;
  
  /** Winner token if battle ended */
  winner?: EncryptedToken;
  
  /** Reason for ending (if applicable) */
  endReason?: 'knockout' | 'forfeit' | 'timeout';
}

/**
 * Battle log entry (safe for public display)
 */
export interface BattleLogEntry {
  /** Entry timestamp */
  timestamp: Date;
  
  /** Log entry type */
  type: BattleLogType;
  
  /** Human-readable message */
  message: string;
  
  /** Additional data (no sensitive info) */
  data?: Record<string, unknown>;
}

/**
 * Types of battle log entries
 */
export type BattleLogType = 
  | 'battle_start'
  | 'turn_start'
  | 'move_used'
  | 'damage_dealt'
  | 'status_applied'
  | 'status_cured'
  | 'pokemon_fainted'
  | 'pokemon_switched'
  | 'item_used'
  | 'battle_end'
  | 'forfeit';

/**
 * Result of ending a battle (forfeit, etc.)
 */
export interface BattleEndResult {
  /** Battle ID */
  battleId: string;
  
  /** Final status */
  status: BattleStatus;
  
  /** Winner token (if applicable) */
  winner?: EncryptedToken;
  
  /** Loser token (if applicable) */
  loser?: EncryptedToken;
  
  /** How the battle ended */
  endReason: 'knockout' | 'forfeit' | 'timeout' | 'cancelled';
}

// ============================================================================
// ENCOUNTER TYPES
// ============================================================================

/**
 * Parameters for spawning a wild encounter
 */
export interface SpawnEncounterParams {
  /** Encrypted channel ID where encounter spawns */
  channelId: EncryptedToken | string;
  
  /** RNG seed for deterministic spawning */
  seed?: string;
  
  /** Area/route for encounter tables */
  area?: string;
  
  /** Override spawn rarity tier */
  rarityOverride?: RarityTier;
  
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Rarity tiers for encounters
 */
export type RarityTier = 'common' | 'uncommon' | 'rare' | 'ultra-rare';

/**
 * Encounter state for apps (sensitive data encrypted)
 */
export interface EncryptedEncounter {
  /** Encounter ID */
  id: string;
  
  /** Encounter status */
  status: EncounterStatus;
  
  /** Encrypted owner Discord ID */
  owner: EncryptedToken;
  
  /** Pokemon species ID (national dex number) */
  speciesId: number;
  
  /** Pokemon species name */
  speciesName: string;
  
  /** Pokemon level */
  level: number;
  
  /** Whether the Pokemon is shiny */
  isShiny: boolean;
  
  /** Rarity tier */
  rarity: RarityTier;
  
  /** When encounter expires */
  expiresAt: Date;
  
  /** Number of catch attempts made */
  catchAttempts: number;
  
  /** When encounter was created */
  createdAt: Date;
}

/**
 * Encounter status states
 */
export type EncounterStatus = 
  | 'spawned'    // Wild Pokemon appeared
  | 'caught'     // Successfully caught
  | 'fled'       // Pokemon fled (ran or scared)
  | 'expired';   // Encounter timed out

/**
 * Parameters for attempting to catch
 */
export interface CatchAttemptParams {
  /** Encounter ID */
  encounterId: string;
  
  /** Type of Pokeball to use */
  ballType: BallType;
}

/**
 * Types of Pokeballs
 */
export type BallType = 'poke' | 'great' | 'ultra' | 'master';

/**
 * Result of a catch attempt
 */
export interface CatchResult {
  /** Whether the catch was successful */
  success: boolean;
  
  /** Catch probability that was rolled against */
  probability: number;
  
  /** Whether the Pokemon fled after failed catch */
  fled: boolean;
  
  /** Number of shakes before result (0-3) */
  shakes: number;
  
  /** If caught, the new Pokemon instance ID */
  pokemonId?: string;
  
  /** Error message if catch failed for non-RNG reasons */
  error?: string;
}

/**
 * Result of fleeing from an encounter
 */
export interface FleeResult {
  /** Whether flee was successful */
  success: boolean;
  
  /** New encounter status */
  status: EncounterStatus;
  
  /** Error message if flee failed */
  error?: string;
}

// ============================================================================
// TRAINER TYPES
// ============================================================================

/**
 * Trainer data for apps (sensitive data encrypted)
 */
export interface EncryptedTrainer {
  /** Trainer ID */
  id: string;
  
  /** Encrypted Discord ID */
  discordId: EncryptedToken;
  
  /** Trainer display name */
  displayName: string;
  
  /** Current money */
  money: number;
  
  /** Total Pokemon caught */
  totalCaught: number;
  
  /** Total battles won */
  battlesWon: number;
  
  /** Total battles lost */
  battlesLost: number;
  
  /** Pokedex completion percentage */
  pokedexCompletion: number;
  
  /** When trainer was created */
  createdAt: Date;
  
  /** When trainer was last active */
  lastActiveAt: Date;
}

/**
 * Parameters for updating trainer money
 */
export interface UpdateMoneyParams {
  /** Encrypted trainer Discord ID */
  discordId: EncryptedToken | string;
  
  /** Amount to add (positive) or subtract (negative) */
  delta: number;
  
  /** Reason for the change (for audit) */
  reason: string;
  
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Result of money update
 */
export interface UpdateMoneyResult {
  /** Whether update was successful */
  success: boolean;
  
  /** New balance after update */
  newBalance: number;
  
  /** Error message if failed */
  error?: string;
}

/**
 * Trainer's party for battle
 */
export interface TrainerParty {
  /** Party slot 1-6 */
  slots: (PartySlot | null)[];
  
  /** Total party count */
  count: number;
}

/**
 * A Pokemon in the party
 */
export interface PartySlot {
  /** Pokemon instance ID */
  pokemonId: string;
  
  /** Species ID */
  speciesId: number;
  
  /** Species name */
  speciesName: string;
  
  /** Pokemon nickname (if set) */
  nickname?: string;
  
  /** Current level */
  level: number;
  
  /** Whether shiny */
  isShiny: boolean;
  
  /** Current HP */
  currentHp: number;
  
  /** Maximum HP */
  maxHp: number;
  
  /** Move names */
  moves: string[];
}

// ============================================================================
// RATE LIMITING TYPES
// ============================================================================

/**
 * Rate limit configuration for an API method
 */
export interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  
  /** Window duration in milliseconds */
  windowMs: number;
  
  /** Key generator (per-user, per-channel, global) */
  keyType: RateLimitKeyType;
}

/**
 * Types of rate limit keys
 */
export type RateLimitKeyType = 
  | 'user'      // Per-user rate limiting
  | 'channel'   // Per-channel rate limiting
  | 'guild'     // Per-guild rate limiting
  | 'global';   // Global rate limiting

/**
 * Rate limit error thrown when limit exceeded
 */
export interface RateLimitError {
  /** Error code */
  code: 'RATE_LIMITED';
  
  /** Human-readable message */
  message: string;
  
  /** Milliseconds until rate limit resets */
  retryAfterMs: number;
  
  /** Rate limit configuration that was exceeded */
  limit: RateLimitConfig;
}

// ============================================================================
// API AUDIT TYPES
// ============================================================================

/**
 * API call audit entry (appended to exports)
 */
export interface ApiCallAudit {
  /** App that made the call */
  appId: string;
  
  /** API method called (e.g., "battles.create") */
  method: string;
  
  /** Whether call succeeded */
  success: boolean;
  
  /** Duration in milliseconds */
  durationMs: number;
  
  /** Error code if failed */
  errorCode?: string;
  
  /** Rate limit key used */
  rateLimitKey?: string;
  
  /** Correlation ID for tracing */
  correlationId: string;
}

// ============================================================================
// DAILY DATA TYPES
// ============================================================================

/**
 * Daily quest data for apps
 */
export interface DailyQuestData {
  /** Current streak count */
  streak: number;
  
  /** Whether player can claim daily reward */
  canClaim: boolean;
  
  /** Next claim available at (if on cooldown) */
  nextClaimAt: Date | null;
  
  /** Current coin balance */
  coins: number;
  
  /** Last claimed timestamp */
  lastClaimed: Date | null;
}

/**
 * Parameters for claiming daily reward
 */
export interface ClaimDailyRewardParams {
  /** Encrypted Discord ID */
  discordId: EncryptedToken | string;
  
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Result of claiming daily reward
 */
export interface ClaimDailyRewardResult {
  /** Whether claim was successful */
  success: boolean;
  
  /** Reward coins granted (if successful) */
  rewardCoins?: number;
  
  /** New streak count (if successful) */
  newStreak?: number;
  
  /** New coin balance (if successful) */
  newBalance?: number;
  
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// INVENTORY TYPES
// ============================================================================

/**
 * Inventory item for apps
 */
export interface InventoryItem {
  /** Item ID */
  itemId: number;
  
  /** Item name */
  name: string;
  
  /** Item category */
  category: ItemCategory;
  
  /** Quantity owned */
  quantity: number;
  
  /** Item metadata (effects, etc.) */
  meta?: Record<string, unknown>;
}

/**
 * Item categories
 */
export type ItemCategory = 
  | 'pokeball'      // Poké Balls
  | 'potion'        // Healing items
  | 'battle'        // Battle items
  | 'berry'         // Berries
  | 'evolution'     // Evolution items
  | 'held'          // Hold items
  | 'key'           // Key items
  | 'misc';         // Miscellaneous

/**
 * Trainer inventory for apps
 */
export interface TrainerInventory {
  /** All items in inventory */
  items: InventoryItem[];
  
  /** Total item count (sum of quantities) */
  totalItems: number;
  
  /** Unique item count */
  uniqueItems: number;
}

/**
 * Parameters for using an item
 */
export interface UseItemParams {
  /** Encrypted Discord ID */
  discordId: EncryptedToken | string;
  
  /** Item ID to use */
  itemId: number;
  
  /** Target Pokemon ID (if applicable) */
  targetPokemonId?: string;
  
  /** Quantity to use */
  quantity?: number;
  
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Result of using an item
 */
export interface UseItemResult {
  /** Whether use was successful */
  success: boolean;
  
  /** Remaining quantity */
  remainingQuantity?: number;
  
  /** Effect description (for display) */
  effectDescription?: string;
  
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// STORAGE (PC) TYPES
// ============================================================================

/**
 * Pokemon in storage (PC boxes)
 */
export interface StoredPokemon {
  /** Pokemon instance ID */
  pokemonId: string;
  
  /** Species ID */
  speciesId: number;
  
  /** Species name */
  speciesName: string;
  
  /** Pokemon nickname (if set) */
  nickname?: string;
  
  /** Current level */
  level: number;
  
  /** Whether shiny */
  isShiny: boolean;
  
  /** Current HP */
  currentHp: number;
  
  /** Maximum HP */
  maxHp: number;
  
  /** Box number (1-indexed) */
  boxNumber: number;
  
  /** Slot in box (1-indexed) */
  boxSlot: number;
}

/**
 * Trainer storage (PC) for apps
 */
export interface TrainerStorage {
  /** All Pokemon in storage */
  pokemon: StoredPokemon[];
  
  /** Total Pokemon count */
  totalCount: number;
  
  /** Maximum storage capacity */
  maxCapacity: number;
}

/**
 * Parameters for moving Pokemon between party/storage
 */
export interface MovePokemonParams {
  /** Encrypted Discord ID */
  discordId: EncryptedToken | string;
  
  /** Pokemon instance ID to move */
  pokemonId: string;
  
  /** Target location: 'party' or 'storage' */
  targetLocation: 'party' | 'storage';
  
  /** Target slot (party: 1-6, storage: box.slot) */
  targetSlot?: number;
  
  /** Target box number (for storage) */
  targetBox?: number;
  
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Result of moving a Pokemon
 */
export interface MovePokemonResult {
  /** Whether move was successful */
  success: boolean;
  
  /** New location description */
  newLocation?: string;
  
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// SETTINGS TYPES
// ============================================================================

/**
 * Trainer settings (user preferences)
 * 
 * Stored in User.settingsJson field as JSON
 */
export interface TrainerSettings {
  // Notification preferences
  battleNotifications: boolean;
  encounterNotifications: boolean;
  dailyReminder: boolean;
  
  // Display preferences
  compactMode: boolean;
  showShinySparkles: boolean;
  
  // Gameplay preferences
  confirmCatch: boolean;
  autoHeal: boolean;
}

/**
 * Default settings for new users
 */
export const DEFAULT_TRAINER_SETTINGS: TrainerSettings = {
  battleNotifications: true,
  encounterNotifications: true,
  dailyReminder: true,
  compactMode: false,
  showShinySparkles: true,
  confirmCatch: true,
  autoHeal: false,
};

/**
 * Result of getting settings
 */
export interface GetSettingsResult {
  /** Whether retrieval was successful */
  success: boolean;
  
  /** Trainer settings (if successful) */
  settings?: TrainerSettings;
  
  /** Error message if failed */
  error?: string;
}

/**
 * Parameters for updating a setting
 */
export interface UpdateSettingsParams {
  /** Encrypted Discord ID */
  discordId: EncryptedToken | string;
  
  /** Setting key to update */
  key: keyof TrainerSettings;
  
  /** New value */
  value: boolean;
  
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Result of updating a setting
 */
export interface UpdateSettingsResult {
  /** Whether update was successful */
  success: boolean;
  
  /** Updated settings (if successful) */
  settings?: TrainerSettings;
  
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// POKEDEX TYPES
// ============================================================================

/**
 * Pokedex progress data for apps
 */
export interface PokedexProgress {
  /** Total unique species caught */
  totalCaught: number;
  
  /** Total species available */
  totalSpecies: number;
  
  /** Overall completion percentage (0-100) */
  overallPercentage: number;
  
  /** Progress per region */
  regions: RegionProgress[];
  
  /** Set of caught species IDs (for quick lookup) */
  caughtSpeciesIds: Set<number>;
}

/**
 * Progress for a single region
 */
export interface RegionProgress {
  /** Region ID (e.g., 'kanto', 'johto') */
  regionId: string;
  
  /** Region display name */
  label: string;
  
  /** Region emoji */
  emoji: string;
  
  /** Species caught in this region */
  caught: number;
  
  /** Total species in this region */
  total: number;
  
  /** Completion percentage (0-100) */
  percentage: number;
  
  /** Remaining to complete region */
  remaining: number;
}

// ============================================================================
// PARTY MANAGEMENT TYPES
// ============================================================================

/**
 * Detailed party slot with IVs, EVs, and base stats
 * 
 * Extended version of PartySlot for detail view
 */
export interface DetailedPartySlot extends PartySlot {
  /** Experience points */
  exp: number;
  
  /** Nature (affects stats) */
  nature: string | null;
  
  /** Status condition (burn, poison, etc.) */
  status: string | null;
  
  /** Party slot position (0-5) */
  slot: number;
  
  /** Individual Values (IVs) */
  ivs: StatBlock;
  
  /** Effort Values (EVs) */
  evs: StatBlock;
  
  /** Base stats from species */
  baseStats: StatBlock;
}

/**
 * Block of stat values (HP, Atk, Def, SpA, SpD, Spe)
 */
export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/**
 * Detailed party with full stats
 */
export interface DetailedParty {
  /** Party slots with full details */
  slots: (DetailedPartySlot | null)[];
  
  /** Total party count */
  count: number;
}

/**
 * Parameters for swapping party slots
 */
export interface SwapPartySlotsParams {
  /** Encrypted Discord ID */
  discordId: EncryptedToken | string;
  
  /** First slot to swap (0-5) */
  slotA: number;
  
  /** Second slot to swap (0-5) */
  slotB: number;
  
  /** Idempotency key */
  idempotencyKey?: string;
}

/**
 * Result of swapping party slots
 */
export interface SwapPartySlotsResult {
  /** Whether swap was successful */
  success: boolean;
  
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// CAPABILITY REQUIREMENTS
// ============================================================================

/**
 * Capabilities required for each API namespace
 */
export const API_CAPABILITIES = {
  battles: {
    create: 'game.battle.create',
    get: 'game.battle.read',
    submitMove: 'game.battle.write',
    forfeit: 'game.battle.write',
  },
  encounters: {
    spawn: 'game.encounter.spawn',
    catch: 'game.encounter.catch',
    flee: 'game.encounter.write',
  },
  trainers: {
    get: 'game.trainer.read',
    updateMoney: 'game.trainer.write',
    getParty: 'game.trainer.read',
    getDetailedParty: 'game.trainer.read',
    swapPartySlots: 'game.trainer.write',
    getDailyData: 'game.trainer.read',
    claimDailyReward: 'game.trainer.write',
    getInventory: 'game.trainer.read',
    useItem: 'game.trainer.write',
    getStorage: 'game.trainer.read',
    movePokemon: 'game.trainer.write',
    getSettings: 'game.trainer.read',
    updateSettings: 'game.trainer.write',
    getPokedexProgress: 'game.trainer.read',
  },
  logs: {
    info: 'game.logs.write',
    error: 'game.logs.write',
  },
} as const;

/**
 * All game capabilities
 */
export type GameCapability = 
  | 'game.battle.create'
  | 'game.battle.read'
  | 'game.battle.write'
  | 'game.encounter.spawn'
  | 'game.encounter.catch'
  | 'game.encounter.write'
  | 'game.trainer.read'
  | 'game.trainer.write'
  | 'game.logs.write';

// ============================================================================
// DEFAULT RATE LIMITS
// ============================================================================

/**
 * Default rate limits per API method
 */
export const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Battle operations
  'battles.create': { maxRequests: 1, windowMs: 60_000, keyType: 'user' },       // 1/min per user
  'battles.get': { maxRequests: 30, windowMs: 60_000, keyType: 'user' },         // 30/min per user
  'battles.submitMove': { maxRequests: 10, windowMs: 60_000, keyType: 'user' },  // 10/min per user
  'battles.forfeit': { maxRequests: 5, windowMs: 60_000, keyType: 'user' },      // 5/min per user
  
  // Encounter operations
  'encounters.spawn': { maxRequests: 10, windowMs: 60_000, keyType: 'channel' }, // 10/min per channel
  'encounters.catch': { maxRequests: 30, windowMs: 60_000, keyType: 'user' },    // 30/min per user
  'encounters.flee': { maxRequests: 30, windowMs: 60_000, keyType: 'user' },     // 30/min per user
  
  // Trainer operations
  'trainers.get': { maxRequests: 60, windowMs: 60_000, keyType: 'user' },        // 60/min per user
  'trainers.updateMoney': { maxRequests: 100, windowMs: 60_000, keyType: 'user' }, // 100/min per user
  'trainers.getParty': { maxRequests: 60, windowMs: 60_000, keyType: 'user' },   // 60/min per user
  'trainers.getDetailedParty': { maxRequests: 60, windowMs: 60_000, keyType: 'user' }, // 60/min per user
  'trainers.swapPartySlots': { maxRequests: 30, windowMs: 60_000, keyType: 'user' }, // 30/min per user
  'trainers.getDailyData': { maxRequests: 30, windowMs: 60_000, keyType: 'user' }, // 30/min per user
  'trainers.claimDailyReward': { maxRequests: 5, windowMs: 60_000, keyType: 'user' }, // 5/min per user
  'trainers.getInventory': { maxRequests: 30, windowMs: 60_000, keyType: 'user' }, // 30/min per user
  'trainers.useItem': { maxRequests: 30, windowMs: 60_000, keyType: 'user' },     // 30/min per user
  'trainers.getStorage': { maxRequests: 30, windowMs: 60_000, keyType: 'user' },  // 30/min per user
  'trainers.movePokemon': { maxRequests: 30, windowMs: 60_000, keyType: 'user' }, // 30/min per user
  'trainers.getSettings': { maxRequests: 30, windowMs: 60_000, keyType: 'user' }, // 30/min per user
  'trainers.updateSettings': { maxRequests: 30, windowMs: 60_000, keyType: 'user' }, // 30/min per user
  'trainers.getPokedexProgress': { maxRequests: 30, windowMs: 60_000, keyType: 'user' }, // 30/min per user
  
  // Log operations
  'logs.info': { maxRequests: 100, windowMs: 60_000, keyType: 'global' },        // 100/min global per app
  'logs.error': { maxRequests: 50, windowMs: 60_000, keyType: 'global' },        // 50/min global per app
} as const;
