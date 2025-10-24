'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { newPokemonRuntime, newBattleState, newAction } = require('./types');
const { derivedStats } = require('./stats');
const { resolveTurn } = require('./turn');

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

function loadJSONWithFallback(primary, fallback) {
  const candidates = [primary, fallback].filter(Boolean);
  const baseDir = process.cwd();

  for (const relPath of candidates) {
    const absolute = path.join(baseDir, relPath);
    if (relPath && fs.existsSync(absolute)) {
      return JSON.parse(fs.readFileSync(absolute, 'utf8'));
    }
  }

  const formatted = candidates.map((relPath) => (relPath ? `"${relPath}"` : null)).filter(Boolean);
  const error = new Error(
    formatted.length
      ? `Unable to locate dataset. Checked ${formatted.join(', ')}.`
      : 'Unable to locate dataset. No candidate paths were provided.'
  );
  error.code = 'DATA_UNAVAILABLE';
  throw error;
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

function loadIndexes() {
  const dex = loadJSONWithFallback('dist/data/dex.min.json', 'data/bootstrap/dex.min.json');
  const movesIndex = loadJSONWithFallback('dist/data/moves.min.json', 'data/bootstrap/moves.min.json');

  const enrichedDex = dex.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      return entry;
    }
    const types = normaliseTypes(entry.types);
    const matchups = entry.matchups && Object.keys(entry.matchups).length > 0
      ? entry.matchups
      : deriveMatchupsFromTypes(types);
    return { ...entry, types, matchups };
  });

  const byName = new Map(enrichedDex.map((p) => [String(p.name).toLowerCase(), p]));
  const byId = new Map(enrichedDex.map((p) => [Number(p.id), p]));
  function dexLookup(q) {
    if (typeof q === 'number') return byId.get(q);
    return byName.get(String(q).toLowerCase());
  }
  return { dexLookup, movesIndex };
}

module.exports = {
  loadIndexes,
  makeRuntimeFromDexEntry,
  newBattleState,
  newAction,
  resolveTurn,
};
