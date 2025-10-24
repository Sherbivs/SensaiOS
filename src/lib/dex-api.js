'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const ROOT = process.cwd();
const DEX_PATH = path.join(ROOT, 'dist', 'data', 'dex.min.json');
const MOVES_PATH = path.join(ROOT, 'dist', 'data', 'moves.min.json');
const META_PATH = path.join(ROOT, 'dist', 'meta', 'version.json');

const hasDex = fs.existsSync(DEX_PATH);
const hasMoves = fs.existsSync(MOVES_PATH);

let dexArr = [];
let movesObj = {};
let meta = { version_group: 'latest' };
let disabled = false;

if (hasDex && hasMoves) {
  try {
    dexArr = loadJSON(DEX_PATH);
    movesObj = loadJSON(MOVES_PATH);
    meta = fs.existsSync(META_PATH) ? loadJSON(META_PATH) : meta;
  } catch (err) {
    console.warn('⚠️  dex-api: Failed to load snapshot data:', err?.message || err);
    disabled = true;
  }
} else {
  disabled = true;
}

// Indexes (empty when disabled)
const byName = new Map(disabled ? [] : dexArr.map((p) => [String(p.name).toLowerCase(), p]));
const byId = new Map(disabled ? [] : dexArr.map((p) => [Number(p.id), p]));
const moveByName = new Map(
  disabled ? [] : Object.entries(movesObj).map(([k, v]) => [String(k).toLowerCase(), v])
);

// Simple normalization + a few useful aliases
const ALIASES = new Map([
  ['mr mime', 'mr-mime'],
  ['mr. mime', 'mr-mime'],
  ['nidoran♀', 'nidoran-f'],
  ['nidoran♂', 'nidoran-m'],
  ['type null', 'type-null'],
  ['jangmo o', 'jangmo-o'],
  ['hakamo o', 'hakamo-o'],
  ['kommo o', 'kommo-o'],
  ['tapu koko', 'tapu-koko'],
  ['tapu lele', 'tapu-lele'],
  ['tapu bulu', 'tapu-bulu'],
  ['tapu fini', 'tapu-fini'],
]);

function normalize(q) {
  return String(q).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’'`]/g, "'");
}

function resolveName(q) {
  const n = normalize(q);
  if (byName.has(n)) return n;
  if (ALIASES.has(n)) return ALIASES.get(n);
  // soft search: try exact no-space, hyphenated, and includes
  const compact = n.replace(/[\s.]+/g, '-');
  if (byName.has(compact)) return compact;
  const withSpace = n.replace(/-/g, ' ');
  if (byName.has(withSpace)) return withSpace;
  // fallback: best "includes" match
  const cand = Array.from(byName.keys()).find((k) => k.includes(n)) || null;
  return cand;
}

function getPokemon(q) {
  if (disabled) return null;
  if (typeof q === 'number') return byId.get(q) || null;
  const name = resolveName(q);
  return name ? byName.get(name) || null : null;
}

function getMove(name) {
  if (disabled || !name) return null;
  const n = normalize(name);
  return moveByName.get(n) || moveByName.get(n.replace(/\s+/g, '-')) || null;
}

function suggestPokemon(prefix, limit = 25) {
  if (disabled) return [];
  const n = normalize(prefix);
  if (!n) return [];
  const seen = new Set();
  const out = [];
  for (const k of byName.keys()) {
    if (out.length >= limit) break;
    if (k.startsWith(n) || k.includes(n)) {
      if (!seen.has(k)) {
        out.push(k);
        seen.add(k);
      }
    }
  }
  return out.slice(0, limit);
}

module.exports = { getPokemon, getMove, suggestPokemon, meta, dex: dexArr, moves: movesObj, disabled };
