/**
 * Shared Pokémon starting-move utilities.
 *
 * Resolves which moves a Pokémon should know when first obtained (starter
 * selection or wild catch).  The lookup order is:
 *
 *   1. **Learnset-derived** — Filter the species' level-up learnset to moves
 *      learnable at or below the Pokémon's level, take the most recently
 *      learned (up to `maxMoves`), look up each in the dexpack move table.
 *   2. **Type-aware fallback** — If no learnset data or no matching moves,
 *      always include Tackle, then try to add a STAB move matching the
 *      species' primary typing.
 *   3. **Universal fallback** — When the dexpack has no data at all for the
 *      species (or moves), return Tackle + Growl with canonical PP values.
 *
 * Every returned entry includes the numeric PokeAPI move ID, display name,
 * and PP values so callers can store it directly into `movesJson`.
 *
 * @module shared/pokemon/initial-moves
 */

import { getSpecies, getMove } from '../../data/dexpack.js';
import type { SpeciesDoc, MoveDoc } from '../../data/dexpack.js';

// ============================================================================
// Types
// ============================================================================

/** Shape stored in PokemonInstance.movesJson */
export interface MoveEntry {
  id: number;
  name: string;
  pp: number;
  maxPP: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Universal Normal physical move — every Pokémon can learn this */
const TACKLE: MoveEntry = { id: 33, name: 'Tackle', pp: 35, maxPP: 35 };

/** Universal Normal status move — safe second-slot default */
const GROWL: MoveEntry = { id: 45, name: 'Growl', pp: 40, maxPP: 40 };

/**
 * Map of typing → preferred early STAB move slug to look up in the dexpack.
 * Values are ordered by preference (earlier = more suitable for low levels).
 */
const TYPE_STAB_CANDIDATES: Record<string, string[]> = {
  fire: ['flamethrower', 'flare-blitz'],
  water: ['surf'],
  grass: ['giga-drain'],
  electric: ['thunderbolt', 'thunder-wave', 'thunder'],
  poison: ['sludge-bomb'],
  ground: ['earthquake'],
  ice: ['ice-beam'],
  dragon: ['dragon-rage', 'dragon-pulse'],
  dark: ['bite'],
  fighting: ['close-combat'],
  normal: ['fury-swipes', 'double-edge'],
};

// ============================================================================
// Core logic
// ============================================================================

/** Convert a MoveDoc into the MoveEntry shape we persist. */
function toEntry(doc: MoveDoc): MoveEntry {
  return {
    id: (doc as MoveDoc & { id?: number }).id ?? 0,
    name: doc.name,
    pp: doc.pp,
    maxPP: doc.pp,
  };
}

/**
 * Try to derive starting moves from the species' level-up learnset.
 *
 * Returns `null` when the species isn't in the dexpack or has no
 * level-up moves at or below `level`.
 */
function movesFromLearnset(
  species: SpeciesDoc,
  level: number,
  maxMoves: number,
): MoveEntry[] | null {
  const levelMoves = species.learnsets?.level;
  if (!levelMoves || levelMoves.length === 0) return null;

  // Filter to moves learnable at or below the Pokémon's current level
  const eligible = levelMoves
    .filter((lm) => lm.level <= level)
    .sort((a, b) => b.level - a.level); // most recently learned first

  if (eligible.length === 0) return null;

  // De-duplicate by slug (keep highest-level entry) and resolve MoveDoc
  const seen = new Set<string>();
  const entries: MoveEntry[] = [];

  for (const lm of eligible) {
    if (seen.has(lm.move)) continue;
    seen.add(lm.move);

    const doc = getMove(lm.move);
    if (doc) {
      entries.push(toEntry(doc));
    }
    if (entries.length >= maxMoves) break;
  }

  return entries.length > 0 ? entries : null;
}

/**
 * Build a type-aware fallback moveset.
 *
 * Always starts with Tackle, then tries to find a STAB move that matches
 * the species' primary typing in the dexpack move table.
 */
function typeAwareFallback(
  species: SpeciesDoc | null,
  maxMoves: number,
): MoveEntry[] {
  const result: MoveEntry[] = [TACKLE];
  if (maxMoves <= 1) return result;

  // Try to find a STAB move for the primary type
  const primaryType = species?.typing?.[0]?.toLowerCase();

  if (primaryType && primaryType !== 'normal') {
    const candidates = TYPE_STAB_CANDIDATES[primaryType];
    if (candidates) {
      for (const slug of candidates) {
        const doc = getMove(slug);
        if (doc) {
          result.push(toEntry(doc));
          break; // one STAB move is enough
        }
      }
    }
  }

  // Fill remaining slots with Growl if we still have room
  if (result.length < maxMoves) {
    result.push(GROWL);
  }

  return result.slice(0, maxMoves);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Determine which moves a Pokémon should know when first obtained.
 *
 * @param speciesId - Dex number to look up in the dexpack
 * @param level     - Pokémon's current level (filters learnset)
 * @param maxMoves  - Maximum move count (default 4, starters get 2)
 * @returns Array of {@link MoveEntry} objects ready for `movesJson`
 *
 * @example
 * // Starter Bulbasaur at level 5 — tries learnset, falls back to Tackle + Giga Drain
 * const moves = getStartingMoves(1, 5, 2);
 *
 * // Wild catch — single move
 * const moves = getStartingMoves(25, 8, 1);
 */
export function getStartingMoves(
  speciesId: number,
  level: number,
  maxMoves: number = 4,
): MoveEntry[] {
  const species = getSpecies(speciesId);

  // 1. Try learnset-derived moves
  if (species) {
    const fromLearnset = movesFromLearnset(species, level, maxMoves);
    if (fromLearnset) return fromLearnset;
  }

  // 2. Type-aware fallback
  return typeAwareFallback(species, maxMoves);
}

/**
 * Universal fallback when dexpack is completely unavailable.
 *
 * Returns Tackle + Growl with canonical PP values.
 * Callers should use this when `getStartingMoves()` might throw
 * (e.g., dexpack not loaded yet).
 */
export function getFallbackMoves(maxMoves: number = 2): MoveEntry[] {
  return [TACKLE, GROWL].slice(0, maxMoves);
}
