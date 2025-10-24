'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { newPokemonRuntime, newBattleState, newAction } = require('./types');
const { derivedStats } = require('./stats');
const { resolveTurn } = require('./turn');

function loadJSONIfExists(rel) {
  const abs = path.join(process.cwd(), rel);
  if (!fs.existsSync(abs)) return null;
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

function loadPrimaryOrBootstrap(primary, fallback) {
  return loadJSONIfExists(primary) || loadJSONIfExists(fallback);
}

function makeRuntimeFromDexEntry(dexMon, level = 50, moves = [], opts = {}) {
  const p = newPokemonRuntime(dexMon, level);
  p.derived = derivedStats(p.base, level);
  p.maxHp = p.derived.hp;
  p.hp = p.maxHp;
  p.moves = moves.map((m) => String(m).toLowerCase());
  p.matchups = dexMon.matchups || {};
  // runtime traits
  const firstAbility = Array.isArray(dexMon.abilities)
    ? (dexMon.abilities.find((a) => a && a.name && !a.hidden)?.name || null)
    : null;
  p.ability = (opts.ability || firstAbility || null) ? String(opts.ability || firstAbility).toLowerCase() : null;
  p.item = opts.item ? String(opts.item).toLowerCase() : null;
  p.status = opts.status ? String(opts.status).toLowerCase() : null;
  return p;
}

function loadIndexes() {
  const dex = loadPrimaryOrBootstrap('dist/data/dex.min.json', 'data/bootstrap/dex.min.json');
  const movesIndex = loadPrimaryOrBootstrap('dist/data/moves.min.json', 'data/bootstrap/moves.min.json');
  if (!dex || !movesIndex) {
    throw new Error('Dex data unavailable; run scripts/ensure-data.js or provide bootstrap files.');
  }
  const byName = new Map(dex.map((p) => [String(p.name).toLowerCase(), p]));
  const byId = new Map(dex.map((p) => [Number(p.id), p]));
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
