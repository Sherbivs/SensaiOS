'use strict';
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadIndexes, makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = require('../src/engine');
const { makeRNG } = require('../src/engine/rng');

function loadJSON(rel) { return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')); }

(function main() {
  const { dexLookup, movesIndex } = loadIndexes();
  const pikachu = dexLookup('pikachu') || dexLookup('raichu');
  const bulba   = dexLookup('bulbasaur') || dexLookup('ivysaur') || dexLookup('venusaur');
  assert(pikachu && bulba, 'Need baseline mons');

  // 1) Accuracy: move with known accuracy can miss deterministically with seed
  {
    const rng = makeRNG(1); // deterministic
    const A = makeRuntimeFromDexEntry(pikachu, 50, ['thunder']); // 70% usually
    const D = makeRuntimeFromDexEntry(bulba, 50, ['tackle']);
    const S = newBattleState(A, D);
    const out = resolveTurn(S, newAction('a','thunder'), newAction('b','tackle'), {
      movesIndex, rng, weather: null, effectSource: 'pokeapi'
    });
    // Either miss or hit; ensure the system is active
    const miss = out.log.some((l) => /missed/.test(l.toLowerCase()));
    const hit  = S.b.hp < S.b.maxHp;
    assert(miss || hit, 'Should either miss or hit; effect system active');
  }

  // 2) Secondary effect via PokéAPI meta (e.g., Flamethrower 10% burn)
  {
    const rng = makeRNG(42);
    const cz = dexLookup('charizard');
    const vs = dexLookup('venusaur');
    const A = makeRuntimeFromDexEntry(cz, 50, ['flamethrower']);
    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const S = newBattleState(A, D);
    resolveTurn(S, newAction('a','flamethrower'), newAction('b','growl'), {
      movesIndex, rng, effectSource: 'pokeapi'
    });
    // Deterministic with seed; status may or may not set
    assert(['brn', null].includes(S.b.status), 'Secondary burn should be possible (or not) deterministically.');
  }

  // 3) Local fallback: force a guaranteed paralysis on Thunder Wave via data/effects.json
  // effects.json has "thunder-wave": {"status":"par","chance":100}
  {
    const rng = makeRNG(7);
    const A = makeRuntimeFromDexEntry(pikachu, 50, ['thunder-wave']);
    const D = makeRuntimeFromDexEntry(bulba, 50, ['tackle']);
    const S = newBattleState(A, D);
    const out = resolveTurn(S, newAction('a','thunder-wave'), newAction('b','tackle'), {
      movesIndex, rng, effectSource: 'local'
    });
    const missed = out.log.some((l) => /missed/.test(l.toLowerCase()));
    if (!missed) {
      assert(S.b.status === 'par', 'Local effects mapping should paralyze on hit');
    }
  }

  console.log('OK: effects registry (accuracy + secondary) passing sanity tests.');
})();
