// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../shared/logging/index.js';
const logger = getLogger();

import {
  getDexpack,
  getSpecies as lookupSpecies,
  getMove as lookupMove,
  suggestSpecies,
  getSpeciesBaseStats,
  getSpeciesMatchups,
} from '../data/dexpack.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface LegacyStats {
  hp: number | null;
  attack: number | null;
  defense: number | null;
  'special-attack': number | null;
  'special-defense': number | null;
  speed: number | null;
}

export interface BaseStats {
  hp?: number;
  atk?: number;
  def?: number;
  spAtk?: number;
  spDef?: number;
  spe?: number;
}

export interface Ability {
  name: string;
  hidden: boolean;
  slot: number;
}

export interface LevelMove {
  move: string;
  level: number | null;
}

export interface LegacyLevelMove {
  name: string;
  level: number | null;
}

export interface Learnsets {
  level: LevelMove[];
  machine: string[];
  tutor: string[];
  egg: string[];
}

export interface LegacyLearnsets {
  levelUp: LegacyLevelMove[];
  machine: string[];
  tutor: string[];
  egg: string[];
}

export interface HydratedSpecies {
  id: number;
  name: string;
  slug: string;
  height: number;
  weight: number;
  typing: string[];
  types: string[];
  abilities: Ability[];
  baseStats: BaseStats;
  base_stats: LegacyStats;
  stats: LegacyStats;
  learnsets: Learnsets;
  learnset: LegacyLearnsets;
  matchups: Record<string, number>;
  aliases: string[];
}

export interface DexMeta {
  version_group: string;
  version_group_id?: number | null;
  built_at?: string | null;
  generated_at?: string | null;
  cache_checksum?: string | null;
  cache_count?: number | null;
  cache_updated_at?: string | null;
}

export interface Move {
  slug?: string;
  name?: string;
  [key: string]: unknown;
}

export interface SpeciesDoc {
  id: number;
  name: string;
  slug: string;
  height: number;
  weight: number;
  typing?: string[];
  abilities?: Array<{ name?: string; hidden?: boolean; slot?: number }>;
  baseStats?: BaseStats;
  learnsets?: {
    level?: Array<{ move: string; level?: number }>;
    machine?: string[];
    tutor?: string[];
    egg?: string[];
  };
  matchups?: Record<string, number>;
  aliases?: string[];
}

export interface DexPack {
  byId: Record<string, SpeciesDoc>;
  byName?: Record<string, number>;
  byAlias?: Record<string, number>;
  types?: { chart?: Record<string, Record<string, number>> };
  moves: Record<string, Move>;
  meta?: {
    source?: {
      versionGroup?: string;
      versionGroupId?: number;
      builtAt?: string;
      cacheChecksum?: string;
      cacheCount?: number;
      cacheUpdatedAt?: string;
    };
    generatedAt?: string;
  };
}

// ============================================================================
// Module State
// ============================================================================

const DEFAULT_META: DexMeta = { version_group: 'latest' };

let disabled = false;
let meta: DexMeta = { ...DEFAULT_META };
let dex: HydratedSpecies[] = [];
let moves: Record<string, Move> = {};
let speciesCache = new Map<number, HydratedSpecies>();
let moveByName = new Map<string, Move>();
let typeChart: Record<string, Record<string, number>> = {};

// ============================================================================
// Internal Helpers
// ============================================================================

function toLegacyStats(baseStats: BaseStats = {}): LegacyStats {
  return {
    hp: baseStats.hp ?? null,
    attack: baseStats.atk ?? null,
    defense: baseStats.def ?? null,
    'special-attack': baseStats.spAtk ?? null,
    'special-defense': baseStats.spDef ?? null,
    speed: baseStats.spe ?? null,
  };
}

function cloneAbilities(list: Array<{ name?: string; hidden?: boolean; slot?: number }> = []): Ability[] {
  return list.map((ability, index) => ({
    name: ability?.name ?? '',
    hidden: Boolean(ability?.hidden),
    slot: typeof ability?.slot === 'number' ? ability.slot : index + 1,
  }));
}

function cloneLearnsets(learnsets?: SpeciesDoc['learnsets']): { level: LevelMove[]; machine: string[]; tutor: string[]; egg: string[]; legacy: LegacyLearnsets } {
  const level: LevelMove[] = Array.isArray(learnsets?.level)
    ? learnsets.level.map((entry) => ({ move: entry.move, level: entry.level ?? null }))
    : [];
  const machine = Array.isArray(learnsets?.machine) ? [...learnsets.machine] : [];
  const tutor = Array.isArray(learnsets?.tutor) ? [...learnsets.tutor] : [];
  const egg = Array.isArray(learnsets?.egg) ? [...learnsets.egg] : [];
  return {
    level,
    machine,
    tutor,
    egg,
    legacy: {
      levelUp: level.map((entry) => ({ name: entry.move, level: entry.level })),
      machine,
      tutor,
      egg,
    },
  };
}

function deriveMatchups(types: string[], chart: Record<string, Record<string, number>>): Record<string, number> {
  const normalized = Array.isArray(types)
    ? types.map((value) => String(value || '').toLowerCase()).filter(Boolean)
    : [];
  const result: Record<string, number> = {};
  for (const attack of Object.keys(chart || {})) {
    const row = chart?.[attack] || {};
    let multiplier = 1;
    for (const defender of normalized) {
      const value = Number(row?.[defender] ?? 1);
      if (value === 0) {
        multiplier = 0;
        break;
      }
      multiplier *= value;
    }
    result[attack] = multiplier;
  }
  return result;
}

function hydrateSpecies(doc: SpeciesDoc): HydratedSpecies {
  const baseStatsSource = (getSpeciesBaseStats(doc.id) as BaseStats | null) || doc.baseStats || {};
  const stats = toLegacyStats(baseStatsSource);
  const learnsets = cloneLearnsets(doc.learnsets);
  const typing = Array.isArray(doc.typing) ? [...doc.typing] : [];
  const fastMatchups = getSpeciesMatchups(doc.id) as Record<string, number> | null;
  const baseMatchups = fastMatchups && Object.keys(fastMatchups).length > 0 ? fastMatchups : doc?.matchups ?? {};
  const hasNonNeutral = Object.values(baseMatchups).some((value) => Number(value) !== 1);
  const matchups = hasNonNeutral ? { ...baseMatchups } : deriveMatchups(typing, typeChart);
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    height: doc.height,
    weight: doc.weight,
    typing,
    types: [...typing],
    abilities: cloneAbilities(doc.abilities),
    baseStats: { ...baseStatsSource },
    base_stats: { ...stats },
    stats,
    learnsets: {
      level: learnsets.level,
      machine: learnsets.machine,
      tutor: learnsets.tutor,
      egg: learnsets.egg,
    },
    learnset: learnsets.legacy,
    matchups,
    aliases: Array.isArray(doc.aliases) ? [...doc.aliases] : [],
  };
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildMoveIndex(packMoves: Record<string, Move>): Map<string, Move> {
  const index = new Map<string, Move>();
  for (const move of Object.values(packMoves)) {
    if (!move) continue;
    const canonical = String(move.slug ?? move.name ?? '').toLowerCase();
    const display = String(move.name ?? '').toLowerCase();
    if (canonical) {
      index.set(canonical, move);
      index.set(canonical.replace(/\s+/g, '-'), move);
    }
    if (display) {
      index.set(display, move);
      index.set(display.replace(/\s+/g, '-'), move);
    }
  }
  return index;
}

function initialise(): void {
  try {
    const pack = getDexpack() as unknown as DexPack;
    const orderedIds = Object.keys(pack.byId).sort((a, b) => Number(a) - Number(b));
    speciesCache = new Map();
    typeChart = pack.types?.chart ?? {};
    for (const id of orderedIds) {
      const doc = pack.byId[id];
      if (!doc) continue;
      const hydrated = hydrateSpecies(doc);
      speciesCache.set(hydrated.id, hydrated);
    }
    dex = orderedIds
      .map((id) => speciesCache.get(Number(id)))
      .filter((s): s is HydratedSpecies => s !== undefined);
    moves = pack.moves;
    moveByName = buildMoveIndex(pack.moves);
    meta = {
      version_group: pack.meta?.source?.versionGroup ?? DEFAULT_META.version_group,
      version_group_id: pack.meta?.source?.versionGroupId ?? null,
      built_at: pack.meta?.source?.builtAt ?? null,
      generated_at: pack.meta?.generatedAt ?? null,
      cache_checksum: pack.meta?.source?.cacheChecksum ?? null,
      cache_count: pack.meta?.source?.cacheCount ?? null,
      cache_updated_at: pack.meta?.source?.cacheUpdatedAt ?? null,
    };
  } catch (err) {
    disabled = true;
    logger.warn('DexApi', 'initialise', 'Failed to load dexpack', { metadata: { error: (err as Error)?.message ?? String(err) } });
  }
}

// Initialize on module load
initialise();

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Get Pokemon by ID or name
 */
export function getPokemon(query: string | number): HydratedSpecies | null {
  if (disabled) return null;
  if (typeof query === 'number' && Number.isFinite(query)) {
    return speciesCache.get(Number(query)) ?? null;
  }
  const doc = lookupSpecies(query) as SpeciesDoc | null;
  if (!doc) return null;
  const existing = speciesCache.get(doc.id);
  if (existing) return existing;
  const hydrated = hydrateSpecies(doc);
  speciesCache.set(hydrated.id, hydrated);
  return hydrated;
}

/**
 * Get Move by name
 */
export function getMove(name: string): Move | null {
  if (disabled || !name) return null;
  const doc = lookupMove(name) as Move | null;
  if (doc) return doc;
  const key = normalizeKey(name);
  if (!key) return null;
  return moveByName.get(key) || moveByName.get(key.replace(/\s+/g, '-')) || null;
}

/**
 * Suggest Pokemon names by prefix
 */
export function suggestPokemon(prefix: string, limit = 25): string[] {
  if (disabled) return [];
  return suggestSpecies(prefix, limit) as string[];
}

// ============================================================================
// Exports
// ============================================================================

export { meta, dex, moves, disabled };

const api = { getPokemon, getMove, suggestPokemon, meta, dex, moves, disabled };

export default api;
