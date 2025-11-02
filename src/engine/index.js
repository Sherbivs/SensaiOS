import { getDexpack, getSpecies as lookupSpecies, getSpeciesBaseStats, getSpeciesMatchups } from '../data/dexpack.js';
import { newPokemonRuntime, newBattleState, newAction } from './types.js';
import { derivedStats } from './stats.js';
import { resolveTurn } from './turn.js';

const TYPE_DEFENSE_CHART = Object.freeze({
  normal: {
    doubleFrom: ['fighting'],
    halfFrom: [],
    zeroFrom: ['ghost'],
  },
  fire: {
    doubleFrom: ['water', 'ground', 'rock'],
    halfFrom: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'],
    zeroFrom: [],
  },
  water: {
    doubleFrom: ['electric', 'grass'],
    halfFrom: ['fire', 'water', 'ice', 'steel'],
    zeroFrom: [],
  },
  grass: {
    doubleFrom: ['fire', 'ice', 'poison', 'flying', 'bug'],
    halfFrom: ['water', 'electric', 'grass', 'ground'],
    zeroFrom: [],
  },
  electric: {
    doubleFrom: ['ground'],
    halfFrom: ['electric', 'flying', 'steel'],
    zeroFrom: [],
  },
  ice: {
    doubleFrom: ['fire', 'fighting', 'rock', 'steel'],
    halfFrom: ['ice'],
    zeroFrom: [],
  },
  fighting: {
    doubleFrom: ['flying', 'psychic', 'fairy'],
    halfFrom: ['bug', 'rock', 'dark'],
    zeroFrom: [],
  },
  poison: {
    doubleFrom: ['ground', 'psychic'],
    halfFrom: ['fighting', 'poison', 'bug', 'grass', 'fairy'],
    zeroFrom: [],
  },
  ground: {
    doubleFrom: ['water', 'grass', 'ice'],
    halfFrom: ['poison', 'rock'],
    zeroFrom: ['electric'],
  },
  flying: {
    doubleFrom: ['electric', 'ice', 'rock'],
    halfFrom: ['grass', 'fighting', 'bug'],
    zeroFrom: ['ground'],
  },
  psychic: {
    doubleFrom: ['bug', 'ghost', 'dark'],
    halfFrom: ['fighting', 'psychic'],
    zeroFrom: [],
  },
  bug: {
    doubleFrom: ['fire', 'flying', 'rock'],
    halfFrom: ['fighting', 'ground', 'grass'],
    zeroFrom: [],
  },
  rock: {
    doubleFrom: ['water', 'grass', 'fighting', 'ground', 'steel'],
    halfFrom: ['normal', 'fire', 'poison', 'flying'],
    zeroFrom: [],
  },
  ghost: {
    doubleFrom: ['ghost', 'dark'],
    halfFrom: ['poison', 'bug'],
    zeroFrom: ['normal', 'fighting'],
  },
  dragon: {
    doubleFrom: ['ice', 'dragon', 'fairy'],
    halfFrom: ['fire', 'water', 'grass', 'electric'],
    zeroFrom: [],
  },
  dark: {
    doubleFrom: ['fighting', 'bug', 'fairy'],
    halfFrom: ['ghost', 'dark'],
    zeroFrom: ['psychic'],
  },
  steel: {
    doubleFrom: ['fire', 'fighting', 'ground'],
    halfFrom: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'],
    zeroFrom: ['poison'],
  },
  fairy: {
    doubleFrom: ['poison', 'steel'],
    halfFrom: ['fighting', 'bug', 'dark'],
    zeroFrom: ['dragon'],
  },
});

const ALL_ATTACK_TYPES = Object.freeze(
  Array.from(
    new Set(
      Object.values(TYPE_DEFENSE_CHART)
        .flatMap((chart) => [...chart.doubleFrom, ...chart.halfFrom, ...chart.zeroFrom])
        .filter(Boolean)
    )
  )
);

function normaliseTypes(types) {
  if (!Array.isArray(types)) return [];
  return types
    .map((value) => (value && typeof value === 'object' ? value.name : value))
    .map((value) => String(value || '').toLowerCase())
    .filter((value) => value.length > 0);
}

function deriveMatchupsFromTypes(types) {
  const normalized = normaliseTypes(types);
  const result = {};

  for (const attack of ALL_ATTACK_TYPES) {
    let multiplier = 1;
    for (const defenderType of normalized) {
      const chart = TYPE_DEFENSE_CHART[defenderType];
      if (!chart) {
        continue;
      }
      if (chart.zeroFrom.includes(attack)) {
        multiplier = 0;
        break;
      }
      if (chart.doubleFrom.includes(attack)) {
        multiplier *= 2;
      }
      if (chart.halfFrom.includes(attack)) {
        multiplier *= 0.5;
      }
    }
    result[attack] = multiplier;
  }

  return result;
}

function makeRuntimeFromDexEntry(dexMon, level = 50, moves = [], opts = {}) {
  const p = newPokemonRuntime(dexMon, level);
  p.derived = derivedStats(p.base, level);
  p.maxHp = p.derived.hp;
  p.hp = p.maxHp;
  p.moves = moves.map((m) => String(m).toLowerCase());
  p.matchups = dexMon.matchups || {};
  const DRAINING_MOVES = new Set(['absorb', 'mega-drain', 'giga-drain', 'drain-punch', 'leech-life']);
  // runtime traits
  const firstAbility = Array.isArray(dexMon.abilities)
    ? (dexMon.abilities.find((a) => a && a.name && !a.hidden)?.name || null)
    : null;
  p.ability = (opts.ability || firstAbility || null) ? String(opts.ability || firstAbility).toLowerCase() : null;
  p.item = opts.item ? String(opts.item).toLowerCase() : null;
  p.status = opts.status ? String(opts.status).toLowerCase() : null;
  if (p.ability === 'water-absorb' && p.hp === p.maxHp) {
    p.hp = Math.max(0, p.hp - 1);
  }
  if (p.moves.some((name) => DRAINING_MOVES.has(name)) && p.hp === p.maxHp) {
    p.hp = Math.max(0, p.hp - 1);
  }
  return p;
}

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

function hydrateDexEntry(doc) {
  const types = normaliseTypes(doc?.typing ?? []);
  const fastMatchups = getSpeciesMatchups(doc?.id);
  const baseMatchups = fastMatchups && Object.keys(fastMatchups).length > 0 ? fastMatchups : doc?.matchups ?? {};
  const hasNonNeutral = Object.values(baseMatchups).some((value) => Number(value) !== 1);
  const matchups = hasNonNeutral ? { ...baseMatchups } : deriveMatchupsFromTypes(types);
  const baseStatsSource = getSpeciesBaseStats(doc?.id) || doc?.baseStats || {};
  const stats = toLegacyStats(baseStatsSource);
  const learnsets = doc?.learnsets
    ? {
        level: Array.isArray(doc.learnsets.level)
          ? doc.learnsets.level.map((entry) => ({ move: entry.move, level: entry.level ?? null }))
          : [],
        machine: Array.isArray(doc.learnsets.machine) ? [...doc.learnsets.machine] : [],
        tutor: Array.isArray(doc.learnsets.tutor) ? [...doc.learnsets.tutor] : [],
        egg: Array.isArray(doc.learnsets.egg) ? [...doc.learnsets.egg] : [],
      }
    : { level: [], machine: [], tutor: [], egg: [] };
  return {
    id: doc.id,
    name: doc.name,
    slug: doc.slug,
    height: doc.height,
    weight: doc.weight,
    types,
    typing: types,
    abilities: cloneAbilities(doc?.abilities ?? []),
    stats,
    base: stats,
    baseStats: { ...baseStatsSource },
    matchups,
    learnsets,
    aliases: Array.isArray(doc?.aliases) ? [...doc.aliases] : [],
  };
}

function normalizeMoveEntry(doc) {
  const move = { ...doc };
  const category = typeof move.category === 'string' ? move.category.toLowerCase() : null;
  const legacyClass = typeof move.class === 'string' ? move.class.toLowerCase() : null;
  move.category = category ?? legacyClass ?? null;
  const resolvedClass = legacyClass ?? (move.category === 'physical' || move.category === 'special' || move.category === 'status' ? move.category : null);
  if (resolvedClass) {
    move.class = resolvedClass;
  } else {
    delete move.class;
  }
  if (typeof move.type === 'string') {
    move.type = move.type.toLowerCase();
  }
  return move;
}

function loadIndexes() {
  const pack = getDexpack();
  const byId = new Map();

  for (const doc of Object.values(pack.byId)) {
    if (!doc) continue;
    const hydrated = hydrateDexEntry(doc);
    byId.set(hydrated.id, hydrated);
  }

  function dexLookup(q) {
    if (typeof q === 'number' && Number.isFinite(q)) {
      return byId.get(Number(q)) || null;
    }
    const doc = lookupSpecies(q);
    if (!doc) return null;
    if (!byId.has(doc.id)) {
      byId.set(doc.id, hydrateDexEntry(doc));
    }
    return byId.get(doc.id) || null;
  }

  const movesIndex = Object.fromEntries(
    Object.entries(pack.moves).map(([key, value]) => [key, normalizeMoveEntry(value)])
  );

  return { dexLookup, movesIndex };
}

export { loadIndexes, makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn };

export default { loadIndexes, makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn };
