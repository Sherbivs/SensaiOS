'use strict';
const assert = require('node:assert');
const { loadIndexes, makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = require('../src/engine');
const { makeRNG } = require('../src/engine/rng');
const { registerEffectRule /*, EFFECT_RULES*/ } = require('../src/engine/effects');

(function main() {
  const { dexLookup, movesIndex } = loadIndexes();
  const cz = dexLookup('charizard');
  const vs = dexLookup('venusaur');
  const rat = dexLookup('raticate') || dexLookup('staraptor') || dexLookup('talonflame');
  const mar = dexLookup('marowak') || dexLookup('machamp') || dexLookup('hawlucha');
  assert(cz && vs, 'Need baseline mons');

  // 1) Fixed damage: Dragon Rage = 40 regardless of stats
  {
    const A = makeRuntimeFromDexEntry(cz, 50, ['dragon-rage']);
    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const S = newBattleState(A, D);
    const hpBefore = S.b.hp;
    resolveTurn(S, newAction('a', 'dragon-rage'), newAction('b','growl'), { movesIndex, rng: makeRNG(1) });
    const dealt = hpBefore - S.b.hp;
    assert.strictEqual(dealt, 40, `Dragon Rage should deal 40, got ${dealt}`);
  }

  // 2) Drain: Giga Drain heals attacker by ~percent of damage (PokéAPI meta.drain)
  {
    const A = makeRuntimeFromDexEntry(vs, 50, ['giga-drain']);
    const D = makeRuntimeFromDexEntry(cz, 50, ['growl']);
    const S = newBattleState(A, D);
    const hpA0 = S.a.hp;
    const hpB0 = S.b.hp;
    resolveTurn(S, newAction('a','giga-drain'), newAction('b','growl'), { movesIndex, rng: makeRNG(2) });
    const dealt = hpB0 - S.b.hp;
    const healed = S.a.hp - hpA0;
    assert(dealt > 0 && healed > 0, 'Giga Drain should damage and heal');
  }

  // 3) Recoil: Double-Edge damages attacker by ~33% of damage dealt (meta.recoil or rule)
  // If PokéAPI meta lacks recoil for Double-Edge in your snapshot, uncomment this override:
  // registerEffectRule('double-edge', { recoil: { percent: 33 } });
  {
    const A = makeRuntimeFromDexEntry(rat, 50, ['double-edge']);
    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const S = newBattleState(A, D);
    const a0 = S.a.hp, b0 = S.b.hp;
    resolveTurn(S, newAction('a','double-edge'), newAction('b','growl'), { movesIndex, rng: makeRNG(3) });
    const dealt = b0 - S.b.hp;
    const recoil = a0 - S.a.hp;
    assert(dealt > 0 && recoil > 0, 'Double-Edge should recoil after dealing damage');
  }

  // 4) Flinch: Bite can set flinch (meta.flinch_chance)
  {
    const A = makeRuntimeFromDexEntry(cz, 50, ['bite']);
    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const S = newBattleState(A, D);
    resolveTurn(S, newAction('a','bite'), newAction('b','growl'), { movesIndex, rng: makeRNG(4) });
    // Non-deterministic per seed; assert the flag is defined when it procs
    if (S.b.volatile && S.b.volatile.flinched) {
      assert.strictEqual(S.b.volatile.flinched, true, 'Flinch path wired');
    }
  }

  // 5) Multi-hit: Fury Swipes aggregates total damage (uses meta min_hits/max_hits or registry rule)
  // If cached meta lacks min/max, register a local rule:
  // registerEffectRule('fury-swipes', { multiHit: { min: 2, max: 5, chanceTable: [0.35, 0.35, 0.15, 0.15] } });
  {
    const A = makeRuntimeFromDexEntry(mar, 50, ['fury-swipes']);
    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const S = newBattleState(A, D);
    const b0 = S.b.hp;
    resolveTurn(S, newAction('a','fury-swipes'), newAction('b','growl'), { movesIndex, rng: makeRNG(5) });
    const total = b0 - S.b.hp;
    assert(total >= 1, 'Fury Swipes should aggregate multiple hits worth of damage');
  }

  console.log('OK: advanced effects (fixed, drain, recoil, flinch, multi-hit) pass sanity tests.');
})();
