/**
 * Shared Pokémon IV (Individual Value) generation utilities.
 *
 * IVs range 0–31 per stat and determine a Pokémon's natural potential.
 * They're rolled once at creation time and never change.
 *
 * Generation policies:
 *   - **Starters** — Guaranteed good IVs (floor of 20) as a reward for
 *     choosing your first partner. Uses `['starter', discordId, speciesId]`
 *     as the RNG seed so the same player+species always gets the same IVs.
 *   - **Wild catches** — Full random range 0–31. Uses `['wild-iv', encounterId]`
 *     as seed so IVs are deterministic for a given encounter (auditable/replayable).
 *   - **Fallback** — Non-seeded random IVs for edge cases where no seed context
 *     is available. Uses `Math.random()` (acceptable only outside gameplay).
 *
 * @module shared/pokemon/generate-ivs
 */

import { createDeterministicRng } from '../utils/deterministic-rng.js';

// ============================================================================
// Types
// ============================================================================

/** IV spread stored in PokemonInstance.ivsJson */
export interface IVSpread {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

/** Stat names in IV order */
const IV_STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;

// ============================================================================
// Core generation
// ============================================================================

/**
 * Roll a full IV spread using the given RNG.
 *
 * @param rng - Deterministic RNG instance
 * @param floor - Minimum IV value per stat (0 for wild, 20 for starters)
 * @param ceiling - Maximum IV value per stat (always 31)
 */
function rollIVs(
  rng: { int(min: number, max: number): number },
  floor: number,
  ceiling: number = 31,
): IVSpread {
  const spread: Record<string, number> = {};
  for (const stat of IV_STATS) {
    spread[stat] = rng.int(floor, ceiling);
  }
  return spread as unknown as IVSpread;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate IVs for a **starter** Pokémon.
 *
 * Floor of 20 ensures every starter has at least "good" IVs — a tangible
 * reward for choosing your first partner. The spread is deterministic:
 * the same player picking the same species always gets the same IVs.
 *
 * @param discordId - Player's Discord snowflake (seed component)
 * @param speciesId - Chosen species Dex number (seed component)
 * @returns IV spread with each stat ∈ [20, 31]
 */
export function generateStarterIVs(discordId: string, speciesId: number): IVSpread {
  const rng = createDeterministicRng(['starter', discordId, speciesId.toString()]);
  return rollIVs(rng, 20);
}

/**
 * Generate IVs for a **wild-caught** Pokémon.
 *
 * Full 0–31 range per stat. Seeded from the encounter ID so a given
 * encounter always produces the same IVs regardless of when the catch
 * attempt succeeds (deterministic and auditable).
 *
 * @param encounterId - Encounter UUID (seed component)
 * @returns IV spread with each stat ∈ [0, 31]
 */
export function generateWildIVs(encounterId: string): IVSpread {
  const rng = createDeterministicRng(['wild-iv', encounterId]);
  return rollIVs(rng, 0);
}

/**
 * Generate IVs with no deterministic seed (non-gameplay fallback).
 *
 * Uses `Math.random()` internally — acceptable only for edge cases
 * where no encounter/player context is available.
 *
 * @param floor - Minimum IV per stat (default 0)
 * @returns IV spread
 */
export function generateFallbackIVs(floor: number = 0): IVSpread {
  const spread: Record<string, number> = {};
  for (const stat of IV_STATS) {
    spread[stat] = Math.floor(Math.random() * (31 - floor + 1)) + floor;
  }
  return spread as unknown as IVSpread;
}
