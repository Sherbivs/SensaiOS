/**
 * Event Tracking Type Definitions
 * 
 * Comprehensive type system for event tracking across all user interactions
 * and system events. Based on docs/event-tracking-schema.md.
 */

/**
 * Event categories organizing events by domain
 */
export type EventCategory = 
  | 'gameplay'    // Core game actions (battles, catching, evolution)
  | 'engagement'  // User engagement metrics (login, quests, achievements)
  | 'economy'     // Virtual currency transactions
  | 'social'      // Social interactions
  | 'system'      // System events & errors
  | 'admin';      // Administrative actions

/**
 * Event severity levels for logging and retention
 */
export type EventSeverity = 
  | 'info'      // Normal operations (30 days retention)
  | 'warning'   // Noteworthy but not errors (90 days retention)
  | 'error'     // Recoverable errors (1 year retention)
  | 'critical'; // System failures (indefinite retention)

/**
 * Base event structure
 */
export interface BaseEvent {
  userId: string;
  category: EventCategory;
  eventType: string;
  severity: EventSeverity;
  data?: Record<string, unknown>;
  sessionId?: string;
  ipAddress?: string; // Will be hashed with SHA-256
  userAgent?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  occurredAt?: Date;
}

// ============================================================================
// Gameplay Events
// ============================================================================

export interface BattleStartedEvent extends BaseEvent {
  category: 'gameplay';
  eventType: 'battle.started';
  severity: 'info';
  data: {
    battleId: string;
    opponentId: string;
    ruleset: string;
    arenaThreadId?: string;
  };
  relatedEntityType: 'Battle';
  relatedEntityId: string;
}

export interface BattleOutcomeEvent extends BaseEvent {
  category: 'gameplay';
  eventType: 'battle.won' | 'battle.lost';
  severity: 'info';
  data: {
    battleId: string;
    opponentId: string;
    opponentName: string;
    turns: number;
    duration_ms: number;
    pokemon_fainted: number;
    experience_gained: number;
    coins_earned?: number;
  };
  relatedEntityType: 'Battle';
  relatedEntityId: string;
}

export interface PokemonCaughtEvent extends BaseEvent {
  category: 'gameplay';
  eventType: 'pokemon.caught';
  severity: 'info';
  data: {
    pokemonId: string;
    speciesId: number;
    speciesName: string;
    level: number;
    isShiny: boolean;
    encounterId: string;
    catchMethod: 'pokeball' | 'greatball' | 'ultraball';
    attempts: number;
  };
  relatedEntityType: 'PokemonInstance';
  relatedEntityId: string;
}

export interface PokemonEvolvedEvent extends BaseEvent {
  category: 'gameplay';
  eventType: 'pokemon.evolved';
  severity: 'info';
  data: {
    pokemonId: string;
    fromSpeciesId: number;
    fromSpeciesName: string;
    toSpeciesId: number;
    toSpeciesName: string;
    level: number;
    evolutionMethod: string;
  };
  relatedEntityType: 'PokemonInstance';
  relatedEntityId: string;
}

// ============================================================================
// Engagement Events
// ============================================================================

export interface LoginEvent extends BaseEvent {
  category: 'engagement';
  eventType: 'login';
  severity: 'info';
  data: {
    loginMethod: 'discord' | 'token';
    isNewUser: boolean;
    consecutiveDays?: number;
  };
}

export interface AchievementUnlockedEvent extends BaseEvent {
  category: 'engagement';
  eventType: 'achievement.unlocked';
  severity: 'info';
  data: {
    achievementId: number;
    achievementSlug: string;
    achievementName: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    coinReward: number;
    progress?: {
      current: number;
      required: number;
    };
  };
  relatedEntityType: 'Achievement';
  relatedEntityId: string;
}

// ============================================================================
// Economy Events
// ============================================================================

export interface CoinsEvent extends BaseEvent {
  category: 'economy';
  eventType: 'coins.earned' | 'coins.spent';
  severity: 'info';
  data: {
    amount: number;
    source: string; // "battle", "achievement", "purchase", "admin"
    balance_after: number;
    relatedEntity?: {
      type: string;
      id: string;
    };
  };
}

// ============================================================================
// System Events
// ============================================================================

export interface ErrorEvent extends BaseEvent {
  category: 'system';
  eventType: 'error.occurred';
  severity: 'error' | 'critical';
  data: {
    errorType: string;
    errorMessage: string;
    errorCode?: string;
    stack?: string;
    context?: Record<string, unknown>;
  };
}

/**
 * Retention policy by category and severity
 * Based on docs/event-tracking-schema.md
 */
export const RETENTION_POLICIES: Record<EventCategory, Record<EventSeverity, number>> = {
  gameplay: {
    info: Infinity,      // Indefinite
    warning: 90,         // 90 days
    error: 365,          // 1 year
    critical: Infinity,  // Indefinite
  },
  engagement: {
    info: 90,            // 90 days
    warning: 90,         // 90 days
    error: 365,          // 1 year
    critical: Infinity,  // Indefinite
  },
  economy: {
    info: 365,           // 1 year
    warning: 365,        // 1 year
    error: 365,          // 1 year
    critical: Infinity,  // Indefinite
  },
  social: {
    info: 90,            // 90 days
    warning: 90,         // 90 days
    error: 365,          // 1 year
    critical: Infinity,  // Indefinite
  },
  system: {
    info: 30,            // 30 days
    warning: 90,         // 90 days
    error: 365,          // 1 year
    critical: Infinity,  // Indefinite
  },
  admin: {
    info: Infinity,      // Indefinite
    warning: Infinity,   // Indefinite
    error: Infinity,     // Indefinite
    critical: Infinity,  // Indefinite
  },
};

/**
 * Union type of all specific event types
 */
export type TrackedEvent = 
  | BattleStartedEvent
  | BattleOutcomeEvent
  | PokemonCaughtEvent
  | PokemonEvolvedEvent
  | LoginEvent
  | AchievementUnlockedEvent
  | CoinsEvent
  | ErrorEvent
  | BaseEvent; // Fallback for generic events
