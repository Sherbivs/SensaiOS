/**
 * Shared Pokémon stat computation utilities.
 * 
 * Uses the canonical formula from src/engine/stats.ts (Gen III+):
 *   HP  = floor((2 × Base × Level) / 100) + Level + 10
 *   Stat = floor((2 × Base × Level) / 100) + 5
 * 
 * These are simplified (no IVs/EVs/nature) for the initial game implementation.
 * Phase 0.7 will add IV variation; full EV/nature support comes in Phase 3.
 * 
 * @module shared/pokemon/compute-stats
 */

import { getSpeciesBaseStats } from '../../data/dexpack.js';

/** Dexpack base-stat shape */
interface DexBaseStats {
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  spe: number;
}

/** Return type for initial stats bootstrap */
export interface InitialStats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  specialAttack: number;
  specialDefense: number;
  speed: number;
}

/**
 * Canonical HP formula (Gen III+, simplified — no IVs/EVs).
 * 
 *   HP = floor((2 × baseHP × level) / 100) + level + 10
 */
export function computeHp(baseHp: number, level: number): number {
  return Math.floor((2 * baseHp * level) / 100) + level + 10;
}

/**
 * Canonical non-HP stat formula (Gen III+, simplified — no IVs/EVs/nature).
 * 
 *   Stat = floor((2 × baseStat × level) / 100) + 5
 */
export function computeStat(baseStat: number, level: number): number {
  return Math.floor((2 * baseStat * level) / 100) + 5;
}

/**
 * Compute full initial stats for a Pokémon from dexpack base stats.
 * 
 * @param speciesId - Species ID to look up in dexpack
 * @param level - Pokémon level
 * @returns Full initial stats, or null if species not found
 * 
 * @example
 * const stats = computeInitialStats(1, 5); // Bulbasaur at level 5
 * // { hp: 21, maxHp: 21, attack: 9, defense: 9, specialAttack: 11, specialDefense: 11, speed: 9 }
 */
export function computeInitialStats(speciesId: number, level: number): InitialStats | null {
  const base = getSpeciesBaseStats(speciesId) as DexBaseStats | null;
  if (!base) return null;
  
  const hp = computeHp(base.hp, level);
  return {
    hp,
    maxHp: hp,
    attack: computeStat(base.atk, level),
    defense: computeStat(base.def, level),
    specialAttack: computeStat(base.spAtk, level),
    specialDefense: computeStat(base.spDef, level),
    speed: computeStat(base.spe, level),
  };
}

/**
 * Fallback initial stats when dexpack data is unavailable.
 * Uses conservative defaults so gameplay can continue.
 */
export function computeFallbackStats(level: number): InitialStats {
  const defaultBase = 50; // Average base stat
  const hp = computeHp(defaultBase, level);
  return {
    hp,
    maxHp: hp,
    attack: computeStat(defaultBase, level),
    defense: computeStat(defaultBase, level),
    specialAttack: computeStat(defaultBase, level),
    specialDefense: computeStat(defaultBase, level),
    speed: computeStat(defaultBase, level),
  };
}
