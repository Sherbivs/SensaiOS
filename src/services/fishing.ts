/**
 * Fishing Service
 * 
 * Core fishing mechanics for water-type Pokémon encounters.
 * Implements the cast-wait-reel mini-game from the Game Design Bible.
 * 
 * FISHING MECHANICS (per doc 24):
 * - Cast → Wait (2-8s) → Bite! → React (3s window) → Encounter
 * - Rod progression: Old Rod → Good Rod → Super Rod
 * - Water-type Pokémon exclusively through fishing
 * - Shiny chain bonus for consecutive casts
 * 
 * @module services/fishing
 */

// === CRITICAL: Logger & Error Handling MUST be first imports ===
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

// === Application Imports ===
import { prisma as _prisma } from "../shared/prisma.js";
import { ensureUser as _ensureUser } from "../shared/models/user-queries-pg.js";
import { hasItems } from "./inventory.js";

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Fishing rod item IDs (key items)
 */
export const ROD_ITEM_IDS = {
  OLD_ROD: 100,
  GOOD_ROD: 101,
  SUPER_ROD: 102,
} as const;

export type RodTier = "OLD_ROD" | "GOOD_ROD" | "SUPER_ROD";

/**
 * Fishing configuration per Game Design Bible doc 24
 */
export const FISHING_CONFIG = {
  // Time before bite (random within range)
  MIN_WAIT_MS: 2000,   // 2 seconds minimum
  MAX_WAIT_MS: 8000,   // 8 seconds maximum
  
  // Reaction window
  BITE_WINDOW_MS: 3000, // 3 seconds to react
  
  // Chance of nothing biting
  NO_BITE_CHANCE: 0.15, // 15% chance
  
  // Cooldown between casts
  CAST_COOLDOWN_MS: 5000, // 5 seconds
  
  // Session timeout
  SESSION_TIMEOUT_MS: 60000, // 1 minute
} as const;

/**
 * Level ranges by rod tier
 */
export const LEVEL_RANGES: Record<RodTier, { min: number; max: number }> = {
  OLD_ROD:   { min: 5, max: 15 },
  GOOD_ROD:  { min: 10, max: 25 },
  SUPER_ROD: { min: 15, max: 40 },
};

/**
 * Shiny chain bonus rates
 * Chain count → shiny odds (base is 1/1000 = 0.001)
 */
export const SHINY_CHAIN_BONUS: Array<{ minChain: number; rate: number }> = [
  { minChain: 100, rate: 1 / 512 },  // 0.00195
  { minChain: 51, rate: 1 / 700 },   // 0.00143
  { minChain: 26, rate: 1 / 800 },   // 0.00125
  { minChain: 11, rate: 1 / 900 },   // 0.00111
  { minChain: 0, rate: 1 / 1000 },   // 0.001 (base)
];

// ============================================================================
// WATER POKEMON POOLS
// ============================================================================

/**
 * Water Pokémon pools by rod tier
 * Species IDs from dexpack
 */
export const FISHING_POOLS: Record<RodTier, Array<{ speciesId: number; rarity: string; rate: number }>> = {
  // Old Rod - Common only
  OLD_ROD: [
    { speciesId: 129, rarity: "common", rate: 0.60 },      // Magikarp
    { speciesId: 72, rarity: "common", rate: 0.25 },       // Tentacool
    { speciesId: 118, rarity: "common", rate: 0.15 },      // Goldeen
  ],
  
  // Good Rod - Common + Uncommon
  GOOD_ROD: [
    { speciesId: 129, rarity: "common", rate: 0.30 },      // Magikarp
    { speciesId: 72, rarity: "common", rate: 0.20 },       // Tentacool
    { speciesId: 118, rarity: "common", rate: 0.15 },      // Goldeen
    { speciesId: 60, rarity: "uncommon", rate: 0.15 },     // Poliwag
    { speciesId: 116, rarity: "uncommon", rate: 0.10 },    // Horsea
    { speciesId: 120, rarity: "uncommon", rate: 0.10 },    // Staryu
  ],
  
  // Super Rod - All rarities
  SUPER_ROD: [
    // Common (30%)
    { speciesId: 129, rarity: "common", rate: 0.15 },      // Magikarp
    { speciesId: 72, rarity: "common", rate: 0.10 },       // Tentacool
    { speciesId: 118, rarity: "common", rate: 0.05 },      // Goldeen
    // Uncommon (35%)
    { speciesId: 60, rarity: "uncommon", rate: 0.12 },     // Poliwag
    { speciesId: 116, rarity: "uncommon", rate: 0.12 },    // Horsea
    { speciesId: 120, rarity: "uncommon", rate: 0.11 },    // Staryu
    // Rare (25%)
    { speciesId: 130, rarity: "rare", rate: 0.15 },        // Gyarados
    { speciesId: 131, rarity: "rare", rate: 0.10 },        // Lapras
    // Ultra-rare (10%)
    { speciesId: 147, rarity: "ultra-rare", rate: 0.05 },  // Dratini
    { speciesId: 349, rarity: "ultra-rare", rate: 0.03 },  // Feebas
    { speciesId: 350, rarity: "ultra-rare", rate: 0.02 },  // Milotic
  ],
};

// ============================================================================
// FISHING SESSION STATE (In-Memory)
// ============================================================================

export type FishingState = "idle" | "waiting" | "bite" | "reeling" | "success" | "escaped" | "nothing";

export interface FishingSession {
  discordId: string;
  rodTier: RodTier;
  state: FishingState;
  castTime?: number;        // When line was cast
  biteTime?: number;        // When bite occurred
  chainCount: number;       // Consecutive casts
  lastCastTime?: number;    // For cooldown
  waitDuration?: number;    // How long until bite
}

// In-memory session storage (keyed by discordId)
const fishingSessions = new Map<string, FishingSession>();

// ============================================================================
// ROD HELPERS
// ============================================================================

/**
 * Check if user has a fishing rod and return the best one
 */
export async function getBestRod(discordId: string): Promise<RodTier | null> {
  // Check from best to worst
  if (await hasItems(discordId, ROD_ITEM_IDS.SUPER_ROD, 1)) {
    return "SUPER_ROD";
  }
  if (await hasItems(discordId, ROD_ITEM_IDS.GOOD_ROD, 1)) {
    return "GOOD_ROD";
  }
  if (await hasItems(discordId, ROD_ITEM_IDS.OLD_ROD, 1)) {
    return "OLD_ROD";
  }
  return null;
}

/**
 * Get rod display info
 */
export function getRodInfo(tier: RodTier): { name: string; stars: string; description: string } {
  switch (tier) {
    case "OLD_ROD":
      return { 
        name: "🎣 Old Rod", 
        stars: "★☆☆", 
        description: "Can catch common water Pokémon" 
      };
    case "GOOD_ROD":
      return { 
        name: "🎣 Good Rod", 
        stars: "★★☆", 
        description: "Can catch uncommon water Pokémon" 
      };
    case "SUPER_ROD":
      return { 
        name: "🎣 Super Rod", 
        stars: "★★★", 
        description: "Can catch rare water Pokémon" 
      };
  }
}

/**
 * Get rod price for shop
 */
export function getRodPrice(tier: RodTier): number {
  switch (tier) {
    case "OLD_ROD": return 500;
    case "GOOD_ROD": return 2500;
    case "SUPER_ROD": return 10000;
  }
}

/**
 * Get rod unlock requirements
 */
export function getRodUnlockRequirement(tier: RodTier): { requiredCatches: number } {
  switch (tier) {
    case "OLD_ROD": return { requiredCatches: 0 };
    case "GOOD_ROD": return { requiredCatches: 10 };
    case "SUPER_ROD": return { requiredCatches: 50 };
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get current fishing session for user
 */
export function getFishingSession(discordId: string): FishingSession | null {
  return fishingSessions.get(discordId) ?? null;
}

/**
 * Start a new fishing session
 */
export async function startFishingSession(discordId: string): Promise<FishingSession | { error: string }> {
  const rodTier = await getBestRod(discordId);
  
  if (!rodTier) {
    return { error: "You don't have a Fishing Rod! Visit the Shop to buy an Old Rod." };
  }
  
  // Check cooldown
  const existingSession = fishingSessions.get(discordId);
  if (existingSession?.lastCastTime) {
    const elapsed = Date.now() - existingSession.lastCastTime;
    if (elapsed < FISHING_CONFIG.CAST_COOLDOWN_MS) {
      const remaining = Math.ceil((FISHING_CONFIG.CAST_COOLDOWN_MS - elapsed) / 1000);
      return { error: `Wait ${remaining}s before casting again.` };
    }
  }
  
  const session: FishingSession = {
    discordId,
    rodTier,
    state: "idle",
    chainCount: existingSession?.chainCount ?? 0,
  };
  
  fishingSessions.set(discordId, session);
  
  logger.info('Fishing', 'startFishingSession', 'Started fishing session', {
    userId: discordId,
    metadata: { rodTier, chainCount: session.chainCount },
  });
  
  return session;
}

/**
 * Cast the fishing line
 * Returns the wait duration before bite
 */
export function castLine(discordId: string): { waitMs: number } | { error: string } {
  const session = fishingSessions.get(discordId);
  
  if (!session) {
    return { error: "No fishing session active." };
  }
  
  if (session.state !== "idle") {
    return { error: "Already fishing! Wait for the result." };
  }
  
  // Calculate random wait time
  const waitMs = FISHING_CONFIG.MIN_WAIT_MS + 
    Math.random() * (FISHING_CONFIG.MAX_WAIT_MS - FISHING_CONFIG.MIN_WAIT_MS);
  
  session.state = "waiting";
  session.castTime = Date.now();
  session.lastCastTime = Date.now();
  session.waitDuration = waitMs;
  
  logger.info('Fishing', 'castLine', 'Cast line', {
    userId: discordId,
    metadata: { waitMs: Math.round(waitMs), rodTier: session.rodTier },
  });
  
  return { waitMs };
}

/**
 * Check if bite occurs (called after wait duration)
 * Returns bite result or "nothing biting"
 */
export function checkForBite(discordId: string): { bite: true } | { nothing: true } | { error: string } {
  const session = fishingSessions.get(discordId);
  
  if (!session || session.state !== "waiting") {
    return { error: "Not currently waiting for a bite." };
  }
  
  // Roll for nothing biting
  if (Math.random() < FISHING_CONFIG.NO_BITE_CHANCE) {
    session.state = "nothing";
    session.chainCount = 0; // Chain breaks
    
    logger.info('Fishing', 'checkForBite', 'Nothing biting', {
      userId: discordId,
      metadata: { rodTier: session.rodTier },
    });
    
    return { nothing: true };
  }
  
  // Bite occurs!
  session.state = "bite";
  session.biteTime = Date.now();
  
  logger.info('Fishing', 'checkForBite', 'Something is biting!', {
    userId: discordId,
    metadata: { rodTier: session.rodTier, chainCount: session.chainCount },
  });
  
  return { bite: true };
}

/**
 * Reel in the fish (player reaction)
 * Must be called within BITE_WINDOW_MS of bite occurring
 */
export function reelIn(discordId: string): { success: true; reactionMs: number } | { escaped: true; reason: string } | { error: string } {
  const session = fishingSessions.get(discordId);
  
  if (!session) {
    return { error: "No fishing session active." };
  }
  
  if (session.state === "waiting") {
    // Player reeled in early
    session.state = "idle";
    session.chainCount = 0; // Chain breaks
    return { escaped: true, reason: "Reeled in before a bite. Chain broken." };
  }
  
  if (session.state !== "bite") {
    return { error: "Nothing to reel in right now." };
  }
  
  const now = Date.now();
  const reactionMs = now - (session.biteTime ?? now);
  
  if (reactionMs > FISHING_CONFIG.BITE_WINDOW_MS) {
    // Too slow!
    session.state = "escaped";
    session.chainCount = 0; // Chain breaks
    
    logger.info('Fishing', 'reelIn', 'Fish escaped - too slow', {
      userId: discordId,
      metadata: { reactionMs, rodTier: session.rodTier },
    });
    
    return { escaped: true, reason: "Too slow! The Pokémon got away." };
  }
  
  // Success!
  session.state = "success";
  session.chainCount++;
  
  logger.info('Fishing', 'reelIn', 'Successfully hooked!', {
    userId: discordId,
    metadata: { reactionMs, chainCount: session.chainCount, rodTier: session.rodTier },
  });
  
  return { success: true, reactionMs };
}

/**
 * Reel in early (cancel fishing)
 */
export function reelInEarly(discordId: string): { cancelled: true } | { error: string } {
  const session = fishingSessions.get(discordId);
  
  if (!session || session.state !== "waiting") {
    return { error: "Not currently fishing." };
  }
  
  session.state = "idle";
  // Don't break chain for early reel-in
  
  logger.info('Fishing', 'reelInEarly', 'Reeled in early', {
    userId: discordId,
    metadata: { rodTier: session.rodTier, chainCount: session.chainCount },
  });
  
  return { cancelled: true };
}

/**
 * Reset session to idle state for another cast
 */
export function resetToIdle(discordId: string): void {
  const session = fishingSessions.get(discordId);
  if (session) {
    session.state = "idle";
  }
}

/**
 * End fishing session
 */
export function endFishingSession(discordId: string): void {
  fishingSessions.delete(discordId);
  
  logger.info('Fishing', 'endFishingSession', 'Ended fishing session', {
    userId: discordId,
    metadata: {},
  });
}

// ============================================================================
// ENCOUNTER GENERATION
// ============================================================================

export interface FishingEncounter {
  speciesId: number;
  level: number;
  isShiny: boolean;
  rarity: string;
  rodUsed: RodTier;
}

/**
 * Generate a fishing encounter based on rod tier and chain
 */
export function rollFishingEncounter(session: FishingSession): FishingEncounter {
  const pool = FISHING_POOLS[session.rodTier];
  const levelRange = LEVEL_RANGES[session.rodTier];
  
  // Roll for species
  const roll = Math.random();
  let cumulative = 0;
  let selected = pool[0]; // Fallback
  
  for (const entry of pool) {
    cumulative += entry.rate;
    if (roll <= cumulative) {
      selected = entry;
      break;
    }
  }
  
  // Roll for level
  const level = Math.floor(
    levelRange.min + Math.random() * (levelRange.max - levelRange.min + 1)
  );
  
  // Roll for shiny with chain bonus
  let shinyRate = SHINY_CHAIN_BONUS[SHINY_CHAIN_BONUS.length - 1].rate; // Base rate
  for (const bonus of SHINY_CHAIN_BONUS) {
    if (session.chainCount >= bonus.minChain) {
      shinyRate = bonus.rate;
      break;
    }
  }
  const isShiny = Math.random() < shinyRate;
  
  logger.info('Fishing', 'rollFishingEncounter', 'Generated fishing encounter', {
    userId: session.discordId,
    metadata: { 
      speciesId: selected.speciesId, 
      level, 
      isShiny, 
      rarity: selected.rarity,
      chainCount: session.chainCount,
      shinyRate,
    },
  });
  
  return {
    speciesId: selected.speciesId,
    level,
    isShiny,
    rarity: selected.rarity,
    rodUsed: session.rodTier,
  };
}

/**
 * Get current shiny rate based on chain
 */
export function getCurrentShinyRate(chainCount: number): { rate: number; display: string } {
  let rate = SHINY_CHAIN_BONUS[SHINY_CHAIN_BONUS.length - 1].rate;
  for (const bonus of SHINY_CHAIN_BONUS) {
    if (chainCount >= bonus.minChain) {
      rate = bonus.rate;
      break;
    }
  }
  
  const odds = Math.round(1 / rate);
  return { rate, display: `1/${odds}` };
}

// ============================================================================
// STATISTICS (for analytics)
// ============================================================================

export interface FishingStats {
  activeSessions: number;
  totalCasts: number;
  totalCatches: number;
  totalEscapes: number;
}

let fishingStats = {
  totalCasts: 0,
  totalCatches: 0,
  totalEscapes: 0,
};

/**
 * Record fishing statistics
 */
export function recordFishingStat(event: "cast" | "catch" | "escape"): void {
  switch (event) {
    case "cast": fishingStats.totalCasts++; break;
    case "catch": fishingStats.totalCatches++; break;
    case "escape": fishingStats.totalEscapes++; break;
  }
}

/**
 * Get fishing statistics
 */
export function getFishingStats(): FishingStats {
  return {
    activeSessions: fishingSessions.size,
    ...fishingStats,
  };
}
