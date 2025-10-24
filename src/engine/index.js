'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { newPokemonRuntime, newBattleState, newAction } = require('./types');
const { derivedStats } = require('./stats');
const { resolveTurn } = require('./turn');

function loadJSON(rel) { return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')); }

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
  const dex = loadJSON('dist/data/dex.min.json');
  const movesIndex = loadJSON('dist/data/moves.min.json');
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
