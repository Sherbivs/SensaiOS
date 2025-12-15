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
    /** Timeout constraints */
    DEFAULT_TIMEOUT_MS: 120_000,
    MIN_TIMEOUT_MS: 60_000,
    MAX_TIMEOUT_MS: 300_000,
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
// ============================================================================
// ALERT STRATEGY CONSTANTS
// ============================================================================
export const ALERT_STRATEGY_CONSTANTS = Object.freeze({
    /** Cooldown periods by severity (milliseconds) */
    RESTART_ALERT_COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes - allow restart alerts frequently
    CRITICAL_ALERT_COOLDOWN_MS: 15 * 60 * 1000, // 15 minutes between critical alerts
    SECURITY_ALERT_COOLDOWN_MS: 30 * 60 * 1000, // 30 minutes between security alerts
    WARNING_ALERT_COOLDOWN_MS: 60 * 60 * 1000, // 1 hour between warnings
    NOTICE_ALERT_COOLDOWN_MS: 4 * 60 * 60 * 1000, // 4 hours between notices
    /** Digest/batch configuration */
    DIGEST_MIN_INTERVAL_MS: 30 * 60 * 1000, // Minimum 30 minutes between digests
    DIGEST_BATCH_THRESHOLD: 5, // Batch after 5 pending alerts
    /** Duplicate detection */
    DUPLICATE_DETECTION_WINDOW_MS: 60 * 60 * 1000, // 1 hour window for duplicate detection
    /** Rate limiting */
    MAX_ALERTS_PER_HOUR: 20, // Maximum total alerts per hour
    MAX_CRITICAL_PER_HOUR: 10, // Maximum critical alerts per hour
    /** Priority values (higher = more urgent) */
    PRIORITY_CRITICAL: 100,
    PRIORITY_SECURITY: 80,
    PRIORITY_WARNING: 50,
    PRIORITY_NOTICE: 20,
    /** Quiet hours defaults */
    DEFAULT_QUIET_HOURS_START: 22, // 10 PM
    DEFAULT_QUIET_HOURS_END: 8, // 8 AM
});
// ============================================================================
// BACKWARDS COMPATIBILITY EXPORTS
// ============================================================================
/** @deprecated Use GAME_CONSTANTS.DEFAULT_STARTER_COINS */
export const DEFAULT_STARTER_COINS = GAME_CONSTANTS.DEFAULT_STARTER_COINS;
/** @deprecated Use TIME_CONSTANTS.DEFAULT_TIME_ZONE */
export const DEFAULT_TIME_ZONE = TIME_CONSTANTS.DEFAULT_TIME_ZONE;
/** @deprecated Use MONITORING_CONSTANTS.MAX_RECENT_ERRORS */
export const MAX_RECENT_ERRORS = MONITORING_CONSTANTS.MAX_RECENT_ERRORS;
