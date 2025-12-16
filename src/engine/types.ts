/**
 * Minimal shapes for a deterministic battle engine.
 * Real games add items, abilities, weather, status, field effects, etc.
 */

import type { BaseStats, DerivedStats } from './stats.js';

// ─────────────────────────────────────────────────────────────────────────────
// Core Types
// ─────────────────────────────────────────────────────────────────────────────

export type StatusEffect = 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz' | null;
export type WeatherType = 'rain' | 'sun' | 'sand' | 'hail' | null;

export interface Matchups {
  [type: string]: number;
}

export interface VolatileFlags {
  flashFireBoost?: boolean;
  flinched?: boolean;
  [key: string]: boolean | undefined;
}

export interface StageModifiers {
  attack: number;
  defense: number;
  'special-attack': number;
  'special-defense': number;
  speed: number;
}

export interface PokemonInput {
  id: number | string;
  name: string;
  types?: string[];
  stats?: BaseStats;
  matchups?: Matchups;
}

export interface PokemonRuntime {
  id: number | string;
  name: string;
  level: number;
  types: string[];
  base: BaseStats;
  derived: DerivedStats;
  stages: StageModifiers;
  maxHp: number;
  hp: number;
  status: StatusEffect;
  ability: string | null;
  item: string | null;
  volatile: VolatileFlags;
  moves: string[];
  matchups: Matchups;
}

export interface BattleState {
  a: PokemonRuntime;
  b: PokemonRuntime;
  turn: number;
  weather: WeatherType;
  state: BattleState;
}

export interface BattleAction {
  who: 'a' | 'b';
  move: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

function newPokemonRuntime(p: PokemonInput, level: number = 50): Omit<PokemonRuntime, 'derived'> & { derived?: DerivedStats } {
  return {
    id: p.id,
    name: p.name,
    level,
    types: Array.isArray(p.types) ? p.types.slice() : [],
    base: { ...(p.stats || {}) },           // base stats from dex
    stages: {                               // stat stage modifiers (-6..+6)
      attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0
    },
    maxHp: 0, hp: 0,                        // set after computing derived stats
    status: null,                           // 'brn'|'par'|'psn'|'tox'|'slp'|'frz'|null
    ability: null,                          // e.g., 'levitate' | 'flash-fire'
    item: null,                             // e.g., 'choice-specs'
    volatile: {},                           // ephemeral flags like flashFireBoost
    moves: [],                              // array of move names (lowercase)
    matchups: p.matchups || {},
  };
}

function newBattleState(a: PokemonRuntime, b: PokemonRuntime): BattleState {
  const state = {
    a,
    b,
    turn: 1,
    weather: null as WeatherType,
  } as BattleState;
  state.state = state;
  return state;
}

function newAction(which: 'a' | 'b', moveName: string): BattleAction {
  return { who: which, move: String(moveName).toLowerCase() };
}

export { newPokemonRuntime, newBattleState, newAction };
