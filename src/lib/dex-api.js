import {
  getDexpack,
  getSpecies as lookupSpecies,
  getMove as lookupMove,
  suggestSpecies,
  getSpeciesBaseStats,
  getSpeciesMatchups,
} from '../data/dexpack.js';

const DEFAULT_META = { version_group: 'latest' };

let disabled = false;
let meta = { ...DEFAULT_META };
let dex = [];
let moves = {};
let speciesCache = new Map();
let moveByName = new Map();
let typeChart = {};

function toLegacyStats(baseStats = {}) {
  return {
    hp: baseStats.hp ?? null,
    attack: baseStats.atk ?? null,
    defense: baseStats.def ?? null,
    'special-attack': baseStats.spAtk ?? null,
    'special-defense': baseStats.spDef ?? null,
    speed: baseStats.spe ?? null,
  };
}

function cloneAbilities(list = []) {
  return list.map((ability, index) => ({
    name: ability?.name ?? '',
    hidden: Boolean(ability?.hidden),
    slot: typeof ability?.slot === 'number' ? ability.slot : index + 1,
  }));
}

function cloneLearnsets(learnsets) {
  const level = Array.isArray(learnsets?.level)
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

function deriveMatchups(types, chart) {
  const normalized = Array.isArray(types)
    ? types.map((value) => String(value || '').toLowerCase()).filter(Boolean)
    : [];
  const result = {};
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

function hydrateSpecies(doc) {
  const baseStatsSource = getSpeciesBaseStats(doc.id) || doc.baseStats || {};
  const stats = toLegacyStats(baseStatsSource);
  const learnsets = cloneLearnsets(doc.learnsets);
  const typing = Array.isArray(doc.typing) ? [...doc.typing] : [];
  const fastMatchups = getSpeciesMatchups(doc.id);
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

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildMoveIndex(packMoves) {
  const index = new Map();
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

function initialise() {
  try {
    const pack = getDexpack();
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
      .filter(Boolean);
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
    console.warn('⚠️  dex-api: Failed to load dexpack:', err?.message || err);
  }
}

initialise();

function getPokemon(query) {
  if (disabled) return null;
  if (typeof query === 'number' && Number.isFinite(query)) {
    return speciesCache.get(Number(query)) ?? null;
  }
  const doc = lookupSpecies(query);
  if (!doc) return null;
  const existing = speciesCache.get(doc.id);
  if (existing) return existing;
  const hydrated = hydrateSpecies(doc);
  speciesCache.set(hydrated.id, hydrated);
  return hydrated;
}

function getMove(name) {
  if (disabled || !name) return null;
  const doc = lookupMove(name);
  if (doc) return doc;
  const key = normalizeKey(name);
  if (!key) return null;
  return moveByName.get(key) || moveByName.get(key.replace(/\s+/g, '-')) || null;
}

function suggestPokemon(prefix, limit = 25) {
  if (disabled) return [];
  return suggestSpecies(prefix, limit);
}

export { getPokemon, getMove, suggestPokemon, meta, dex, moves, disabled };

const api = { getPokemon, getMove, suggestPokemon, meta, dex, moves, disabled };

export default api;
