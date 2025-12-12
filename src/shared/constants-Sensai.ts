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
// PROJECT LEADERSHIP — ANTI-SPOOFING PROTECTION
// ============================================================================

/**
 * Project Leadership Identity Constants
 * 
 * CRITICAL: These values are used for authentication and authorization.
 * The Discord ID is the ONLY valid identifier for project leadership.
 * Any claims of leadership authority MUST be verified against this ID.
 * 
 * @security This prevents account spoofing by ensuring all admin operations
 *           verify against the immutable Discord snowflake ID.
 */
export const PROJECT_LEADERSHIP = Object.freeze({
  /** Creator & CEO: DRIPTVDD */
  CEO: Object.freeze({
    /** Display name (can be changed on Discord, DO NOT use for auth) */
    displayName: 'DRIPTVDD',
    
    /** 
     * Discord Snowflake ID — IMMUTABLE IDENTIFIER
     * This is the ONLY value that should be used for authentication.
     * Discord IDs are unique, permanent, and cannot be spoofed.
     */
    discordId: '563220840708177927',
    
    /** Role in the project */
    role: 'Creator & CEO',
    
    /** Authority scope */
    authority: 'All architectural decisions, policies, and project direction'
  }),
  
  /** 
   * Verify if a Discord ID matches the project CEO
   * Use this for all admin authentication checks
   */
  isCEO: (discordId: string): boolean => discordId === '563220840708177927',
  
  /**
   * List of all leadership Discord IDs (for future expansion)
   * Currently only CEO, but structured for adding trusted admins later
   */
  leadershipIds: Object.freeze(['563220840708177927'] as const)
});

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
// ALERT STRATEGY CONSTANTS
// ============================================================================

export const ALERT_STRATEGY_CONSTANTS = Object.freeze({
  /**
   * Cooldown periods for different alert types (milliseconds)
   * Prevents alert spam while ensuring important notifications get through
   */
  
  /** Restart alerts: Only one per hour (prevents rapid restart spam) */
  RESTART_ALERT_COOLDOWN_MS: 60 * 60 * 1000, // 1 hour
  
  /** Critical alerts: 5-minute cooldown between same type */
  CRITICAL_ALERT_COOLDOWN_MS: 5 * 60 * 1000, // 5 minutes
  
  /** Security alerts: 2-minute cooldown (higher priority) */
  SECURITY_ALERT_COOLDOWN_MS: 2 * 60 * 1000, // 2 minutes
  
  /** Warning alerts: 15-minute cooldown (batch into digests) */
  WARNING_ALERT_COOLDOWN_MS: 15 * 60 * 1000, // 15 minutes
  
  /** Notice alerts: 30-minute cooldown (low priority) */
  NOTICE_ALERT_COOLDOWN_MS: 30 * 60 * 1000, // 30 minutes
  
  /**
   * Digest batching configuration
   */
  
  /** Minimum time between digest deliveries */
  DIGEST_MIN_INTERVAL_MS: 30 * 60 * 1000, // 30 minutes
  
  /** Maximum alerts to batch before forcing immediate digest */
  DIGEST_BATCH_THRESHOLD: 10,
  
  /** Time window to accumulate similar alerts */
  DIGEST_BATCH_WINDOW_MS: 5 * 60 * 1000, // 5 minutes
  
  /**
   * Alert suppression rules
   */
  
  /** Max alerts per hour (across all types) to prevent DM flood */
  MAX_ALERTS_PER_HOUR: 20,
  
  /** Max critical alerts per hour before auto-batching */
  MAX_CRITICAL_PER_HOUR: 10,
  
  /** Duplicate detection window */
  DUPLICATE_DETECTION_WINDOW_MS: 10 * 60 * 1000, // 10 minutes
  
  /**
   * Alert priority weights (higher = more urgent)
   */
  PRIORITY_CRITICAL: 100,
  PRIORITY_SECURITY: 90,
  PRIORITY_WARNING: 50,
  PRIORITY_NOTICE: 10,
  
  /**
   * Quiet hours configuration (prevent non-critical alerts during sleep)
   * Note: Actual hours configured via environment variables
   */
  DEFAULT_QUIET_HOURS_START: 23, // 11 PM
  DEFAULT_QUIET_HOURS_END: 7,    // 7 AM
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
// RENDER ACCESS POLICY (2025-12-06)
// ============================================================================
// ⚠️ ABSOLUTE RULE: SSH-ONLY ACCESS TO RENDER
// Render API calls are PROHIBITED to minimize costs.
// All remote access MUST use SSH.
// ============================================================================

export const RENDER_ACCESS_POLICY = Object.freeze({
  /**
   * POLICY ENFORCEMENT DATE: 2025-12-06
   * 
   * Render REST API is PROHIBITED for cost control.
   * All remote access must use SSH (free).
   */
  
  /** SSH is the ONLY allowed remote access method */
  ALLOWED_ACCESS_METHOD: 'SSH_ONLY' as const,
  
  /** Render API is explicitly prohibited */
  API_ACCESS_PROHIBITED: true,
  
  /** Service ID for SSH access */
  PRIMARY_SERVICE_ID: 'srv-d3snk2ndiees73cn709g',
  
  /** SSH host for Virginia region */
  SSH_HOST: 'ssh.virginia.render.com',
  
  /** Full SSH address */
  SSH_ADDRESS: 'srv-d3snk2ndiees73cn709g@ssh.virginia.render.com',
  
  /** Allowed operations via SSH */
  ALLOWED_OPERATIONS: Object.freeze([
    'interactive-shell',  // render ssh / wsl ssh
    'disk-usage',         // df, du commands
    'log-viewing',        // tail, cat logs
    'process-monitoring', // ps, top
    'file-operations',    // ls, cat, rm for Store/
  ] as const),
  
  /** Operations requiring Dashboard (no API) */
  DASHBOARD_ONLY_OPERATIONS: Object.freeze([
    'deploy',             // Use Dashboard "Manual Deploy"
    'restart',            // Use Dashboard restart button
    'scale',              // Use Dashboard scaling settings
    'env-vars',           // Use Dashboard environment tab
    'logs-streaming',     // Use Dashboard logs tab
  ] as const),
  
  /** Deprecation notice for old scripts */
  DEPRECATED_SCRIPTS_LOCATION: 'scripts/archive/render-api-deprecated/',
});
