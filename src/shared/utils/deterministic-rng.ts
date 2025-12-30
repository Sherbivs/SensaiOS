/**
 * Deterministic RNG — Seeded Random Number Generator
 * 
 * Provides reproducible random number generation for game mechanics.
 * Uses Mulberry32 algorithm (fast, good distribution, 32-bit seed).
 * 
 * POLICY COMPLIANCE (Sensai OS):
 * - All game logic MUST use deterministic RNG for reproducibility
 * - Seeds should be logged for audit/replay capability
 * - Never use Math.random() for gameplay-affecting randomness
 * 
 * @module shared/utils/deterministic-rng
 */

// ============================================================================
// SEEDED PRNG IMPLEMENTATION
// ============================================================================

/**
 * Mulberry32 PRNG
 * Fast, good statistical properties, 32-bit state
 */
function createSeededPrng(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash string parts to numeric seed
 */
function hashSeedParts(parts: string[]): number {
  const str = parts.join(':');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// ============================================================================
// DETERMINISTIC RNG CLASS
// ============================================================================

/**
 * Deterministic RNG instance
 * 
 * Provides various random operations all derived from initial seed.
 * Same seed always produces same sequence of numbers.
 */
export class DeterministicRng {
  private nextRandom: () => number;
  private callCount = 0;
  public readonly seed: number;
  public readonly seedParts: string[];

  constructor(seedParts: string[]) {
    this.seedParts = seedParts;
    this.seed = hashSeedParts(seedParts);
    this.nextRandom = createSeededPrng(this.seed);
  }

  /**
   * Get next random float [0, 1)
   */
  random(): number {
    this.callCount++;
    return this.nextRandom();
  }

  /**
   * Alias for random() - compatibility with ctx.rng.next() pattern
   */
  next(): number {
    return this.random();
  }

  /**
   * Get random integer in range [min, max] (inclusive)
   */
  int(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Get random float in range [min, max]
   */
  float(min: number, max: number): number {
    return min + this.random() * (max - min);
  }

  /**
   * Roll against probability (returns true with given chance)
   */
  chance(probability: number): boolean {
    return this.random() < probability;
  }

  /**
   * Weighted random selection
   * 
   * @param items - Array of { weight, value } pairs
   * @returns Selected value based on weights
   */
  weighted<T>(items: Array<{ weight: number; value: T }>): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = this.random() * totalWeight;

    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) {
        return item.value;
      }
    }

    return items[items.length - 1].value;
  }

  /**
   * Weighted random selection with rate property
   * 
   * @param items - Array of objects with rate property
   * @returns Selected item based on rates
   */
  weightedByRate<T extends { rate: number }>(items: T[]): T {
    const roll = this.random();
    let cumulative = 0;
    
    for (const item of items) {
      cumulative += item.rate;
      if (roll <= cumulative) {
        return item;
      }
    }
    
    return items[items.length - 1];
  }

  /**
   * Shuffle array deterministically (Fisher-Yates)
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Pick random element from array
   */
  pick<T>(array: T[]): T {
    return array[Math.floor(this.random() * array.length)];
  }

  /**
   * Get RNG stats for logging/debugging
   */
  getStats(): { seed: number; seedParts: string[]; callCount: number } {
    return {
      seed: this.seed,
      seedParts: this.seedParts,
      callCount: this.callCount,
    };
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a deterministic RNG from seed parts
 * 
 * @param seedParts - String parts to combine into seed
 * @returns DeterministicRng instance
 * 
 * @example
 * ```ts
 * // Fishing encounter - reproducible based on user + timestamp
 * const rng = createDeterministicRng(['fishing', discordId, Date.now().toString()]);
 * const waitMs = rng.float(2000, 8000);
 * const willBite = rng.chance(0.85);
 * ```
 * 
 * @example
 * ```ts
 * // Battle turn - reproducible for replay
 * const rng = createDeterministicRng(['battle', battleId, `turn-${turnNumber}`]);
 * const criticalHit = rng.chance(0.0625); // 1/16
 * ```
 */
export function createDeterministicRng(seedParts: string[]): DeterministicRng {
  return new DeterministicRng(seedParts);
}

/**
 * Create RNG seeded from user context
 * Combines user ID with current timestamp for unique but reproducible sequences
 * 
 * @param userId - Discord user ID
 * @param context - Additional context (e.g., 'fishing', 'encounter')
 */
export function createUserRng(userId: string, context: string): DeterministicRng {
  return new DeterministicRng([context, userId, Date.now().toString()]);
}

/**
 * Create RNG seeded from session context
 * For multi-step operations that need consistent RNG across calls
 * 
 * @param sessionId - Session identifier
 * @param step - Step or phase identifier
 */
export function createSessionRng(sessionId: string, step: string): DeterministicRng {
  return new DeterministicRng(['session', sessionId, step]);
}
