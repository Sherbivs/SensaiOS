/**
 * Shared Application Constants
 * 
 * Centralized location for application-wide constant values to prevent duplication
 * and ensure consistency across all modules.
 * 
 * Usage:
 *   import { GAME_CONSTANTS, TIME_CONSTANTS, CACHE_CONSTANTS } from '../shared/constants.js';
 *   const coins = GAME_CONSTANTS.DEFAULT_STARTER_COINS;
 */

// ============================================================================
// GAME CONSTANTS
// ============================================================================

export const GAME_CONSTANTS = Object.freeze({
  /** Default starting coins for new trainers */
  DEFAULT_STARTER_COINS: 500,

  /** Default battle rewards (coins) */
  DEFAULT_REWARDS: Object.freeze({
    winner: 50,
    loser: 10
  }),

  /** Default role name for trainers */
  DEFAULT_ROLE_NAME: 'Trainer',

  /** Profile field limits */
  MAX_TAGLINE_LENGTH: 120,
  MAX_BIO_LENGTH: 600,

  /** Battle history display limit */
  BATTLE_HISTORY_LIMIT: 3,

  /** Pokémon type colors for Discord embeds (hex values) */
  TYPE_COLORS: Object.freeze({
    normal: 0xa8a77a,
    fire: 0xee8130,
    water: 0x6390f0,
    electric: 0xf7d02c,
    grass: 0x7ac74c,
    ice: 0x96d9d6,
    fighting: 0xc22e28,
    poison: 0xa33ea1,
    ground: 0xe2bf65,
    flying: 0xa98ff3,
    psychic: 0xf95587,
    bug: 0xa6b91a,
    rock: 0xb6a136,
    ghost: 0x735797,
    dragon: 0x6f35fc,
    dark: 0x705746,
    steel: 0xb7b7ce,
    fairy: 0xd685ad,
  })
});

// ============================================================================
// TIME CONSTANTS
// ============================================================================

export const TIME_CONSTANTS = Object.freeze({
  /** Default timezone for application */
  DEFAULT_TIME_ZONE: 'America/New_York',

  /** Default locale for formatting */
  DEFAULT_LOCALE: 'en-US',

  /** Timeout constraints for guild member fetching */
  DEFAULT_TIMEOUT_MS: 60_000,   // 60s default (reduced from 120s)
  MIN_TIMEOUT_MS: 30_000,       // 30s minimum (reduced from 60s)
  MAX_TIMEOUT_MS: 90_000,       // 90s max (reduced from 300s - 5min was excessive)

  /** Minimum delay between digest operations */
  MIN_DIGEST_DELAY_MS: 60_000,

  /** Daily quest cooldown (24 hours) */
  DAILY_COOLDOWN_MS: 24 * 60 * 60 * 1_000,

  /** Cooldown max age (1 hour) */
  MAX_COOLDOWN_AGE_MS: 60 * 60 * 1000,

  /** Time conversion constants */
  MS_PER_SECOND: 1000,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
  SECONDS_PER_DAY: 86400,

  /** Refresh intervals */
  MEMBER_STATS_REFRESH_INTERVAL_MS: 60_000, // 1 minute
  NORMAL_UPDATE_INTERVAL_MS: 5 * 60 * 1000, // 5 minutes  
  ALERT_UPDATE_INTERVAL_MS: 30 * 1000 // 30 seconds
});

// ============================================================================
// CACHE CONSTANTS
// ============================================================================

export const CACHE_CONSTANTS = Object.freeze({
  /** Cache TTL values (milliseconds) */
  DEFAULT_BATTLE_TTL_MS: 15_000,
  DEFAULT_ENCOUNTER_TTL_MS: 5_000,
  DEFAULT_QUEST_TTL_MS: 1_000,
  DEFAULT_PROFILE_TTL_MS: 10_000,

  /** Daily quest cooldown (24 hours) */
  DAILY_COOLDOWN_MS: 24 * 60 * 60 * 1_000,

  /** Cache size limits */
  MAX_CACHE_PERCENT: 0.75,
  MAX_CACHE_FILE_AGE_MS: 1000 * 60 * 60 * 24 * 7, // 7 days
  MAX_WORKSPACE_BYTES: 1024 * 1024 * 1024, // 1 GB

  /** Memory facade limits */
  DEFAULT_MAX_MEMORY_BYTES: 5 * 1024 * 1024, // 5 MiB
  DEFAULT_MAX_MEMORY_ITEMS: 200,

  /** Maintenance interval */
  DEFAULT_MAINTENANCE_INTERVAL_MS: 10 * 60_000 // 10 minutes
});

// ============================================================================
// MONITORING CONSTANTS
// ============================================================================

export const MONITORING_CONSTANTS = Object.freeze({
  /** Error tracking limits */
  MAX_RECENT_ERRORS: 10,
  MAX_OPS_ERROR_QUEUE_SIZE: 100,

  /** Recent activity limits */
  DEFAULT_RECENT_LIMIT: 5,
  MAX_RECENT_LIMIT: 20,

  /** Timeline limits */
  MAX_TIMELINE_EVENTS: 100,

  /** Cache sizes */
  MAX_FINGERPRINT_CACHE: 500,
  MAX_PATTERN_CACHE_SIZE: 500,
  MAX_CACHE_SIZE: 7 * 1024 * 1024 // 7MB
});

// ============================================================================
// DISCORD BOT CONSTANTS
// ============================================================================

export const DISCORD_CONSTANTS = Object.freeze({
  /** Guild member fetch configuration */
  GUILD_MEMBER_FETCH_CHUNK_RETRIES: 3,
  
  /** Sweep and monitoring intervals */
  CLI_SWEEP_WARNING_THRESHOLD_SECONDS: 5 * 60, // 5 minutes
  CONTINUOUS_SWEEP_IDLE_DELAY_MS: 15_000, // 15 seconds

  /** Timeout adjustments */
  TIMEOUT_INCREMENT_MS: 250
});
