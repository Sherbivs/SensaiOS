'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SHARED_DATA_PATH = path.join(process.cwd(), 'data', 'pokemon.json');
const LEGACY_DATA_PATH = path.join(__dirname, '..', 'data', 'pokemon.json');

const DEFAULT_STATS = Object.freeze({
  hp: 50,
  attack: 50,
  defense: 50,
  specialAttack: 50,
  specialDefense: 50,
  speed: 50,
});

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[Pokémon Data] Failed to read ${filePath}:`, error?.message || error);
    return null;
  }
}

function normaliseTypeName(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function fromStatsArray(statsArray = []) {
  const stats = { ...DEFAULT_STATS };
  for (const statEntry of statsArray) {
    if (!statEntry || typeof statEntry !== 'object') {
      continue;
    }
    const name = (statEntry.stat && statEntry.stat.name) || statEntry.name;
    const base = statEntry.base_stat ?? statEntry.base ?? statEntry.value;
    const numeric = Number(base);
    if (!name || !Number.isFinite(numeric)) {
      continue;
    }
    switch (name.toLowerCase().replace(/[^a-z]/g, '')) {
      case 'hp':
        stats.hp = numeric;
        break;
      case 'attack':
        stats.attack = numeric;
        break;
      case 'defense':
        stats.defense = numeric;
        break;
      case 'specialattack':
        stats.specialAttack = numeric;
        break;
      case 'specialdefense':
        stats.specialDefense = numeric;
        break;
      case 'speed':
        stats.speed = numeric;
        break;
      default:
        break;
    }
  }
  return stats;
}

function fromStatsObject(statsObject = {}) {
  const stats = { ...DEFAULT_STATS };
  for (const [key, value] of Object.entries(statsObject)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    switch (key.toLowerCase().replace(/[^a-z]/g, '')) {
      case 'hp':
        stats.hp = numeric;
        break;
      case 'attack':
        stats.attack = numeric;
        break;
      case 'defense':
        stats.defense = numeric;
        break;
      case 'specialattack':
        stats.specialAttack = numeric;
        break;
      case 'specialdefense':
        stats.specialDefense = numeric;
        break;
      case 'speed':
        stats.speed = numeric;
        break;
      default:
        break;
    }
  }
  return stats;
}

function normaliseStats(entry) {
  if (!entry || typeof entry !== 'object') {
    return { ...DEFAULT_STATS };
  }
  if (Array.isArray(entry.stats)) {
    return fromStatsArray(entry.stats);
  }
  if (Array.isArray(entry.base_stats)) {
    return fromStatsArray(entry.base_stats);
  }
  if (Array.isArray(entry.baseStats)) {
    return fromStatsArray(entry.baseStats);
  }
  if (Array.isArray(entry)) {
    return fromStatsArray(entry);
  }
  if (entry.stats && typeof entry.stats === 'object') {
    return fromStatsObject(entry.stats);
  }
  if (entry.base_stats && typeof entry.base_stats === 'object') {
    return fromStatsObject(entry.base_stats);
  }
  if (entry.baseStats && typeof entry.baseStats === 'object') {
    return fromStatsObject(entry.baseStats);
  }
  return fromStatsObject(entry);
}

function normaliseEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const id = Number(entry.id ?? entry.dex ?? entry.number);
  const name = entry.name ?? entry.pokemon;
  if (!Number.isFinite(id) || !name) {
    return null;
  }

  const rawTypes = Array.isArray(entry.types)
    ? entry.types
    : Array.isArray(entry.type)
      ? entry.type
      : [];
  const types = rawTypes
    .map(normaliseTypeName)
    .filter(Boolean);

  const statsSource = entry.stats ?? entry.base_stats ?? entry.baseStats ?? entry;
  const stats = normaliseStats(statsSource);

  const level = Number(entry.level);
  const caughtBy = Array.isArray(entry.caughtBy) ? entry.caughtBy.slice() : [];

  return {
    id,
    name: String(name),
    type: types,
    types,
    level: Number.isFinite(level) && level > 0 ? level : 5,
    stats,
    rarity: typeof entry.rarity === 'string' && entry.rarity.trim().length
      ? entry.rarity
      : 'Common',
    caughtBy,
  };
}

function extractList(payload) {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload.pokemon)) {
    return payload.pokemon;
  }
  if (Array.isArray(payload.list)) {
    return payload.list;
  }
  if (payload.roster && typeof payload.roster === 'object') {
    return Object.values(payload.roster);
  }
  return [];
}

function normaliseDataset(payload) {
  const list = extractList(payload);
  return list
    .map(normaliseEntry)
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

function loadPokemonDataset() {
  const sources = [SHARED_DATA_PATH, LEGACY_DATA_PATH];
  for (const source of sources) {
    const payload = readJson(source);
    if (!payload) {
      continue;
    }
    const dataset = normaliseDataset(payload);
    if (dataset.length) {
      return dataset;
    }
  }
  return [];
}

module.exports = {
  loadPokemonDataset,
  normaliseDataset,
  normaliseEntry,
};
