'use strict';
const assert = require('node:assert');
const { loadIndexes, makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = require('../src/engine');
const { makeRNG } = require('../src/engine/rng');

(function main() {
  const { dexLookup, movesIndex } = loadIndexes();

  const cz = dexLookup('charizard');
  const vs = dexLookup('venusaur');
  assert(cz && vs, 'Missing baseline mons');

  // Burn halves physical unless Guts; para halves speed:
  {
    const A = makeRuntimeFromDexEntry(cz, 50, ['flare-blitz'], { status: 'brn' });
    const D = makeRuntimeFromDexEntry(vs, 50, ['sludge-bomb']);
    const S = newBattleState(A, D);
    const { state } = resolveTurn(S, newAction('a', 'flare-blitz'), newAction('b', 'sludge-bomb'), { movesIndex });
    const dealt = state.b.maxHp - state.b.hp;
    assert(dealt > 0 && dealt < state.b.maxHp * 0.35, 'Burned physical should be reduced (heuristic)');
  }

  // Paralysis affects move order if no priority:
  {
    const A = makeRuntimeFromDexEntry(cz, 50, ['dragon-pulse'], { status: 'par' });
    const D = makeRuntimeFromDexEntry(vs, 50, ['sludge-bomb']);
    const S = newBattleState(A, D);
    const out = resolveTurn(S, newAction('a', 'dragon-pulse'), newAction('b', 'sludge-bomb'), { movesIndex });
    assert(out.log[0].toLowerCase().startsWith('venusaur uses'), 'Paralyzed attacker should often move second');
  }

  // Weather: Rain boosts Water compared to Sun:
  {
    const blastoise = dexLookup('blastoise') || dexLookup('gyarados');
    const fireMon = dexLookup('skeledirge') || dexLookup('charizard');
    const W = makeRuntimeFromDexEntry(blastoise, 50, ['surf']);
    const F1 = makeRuntimeFromDexEntry(fireMon, 50, ['flamethrower']);
    const S1 = newBattleState(W, F1);
    resolveTurn(S1, newAction('a', 'surf'), newAction('b', 'flamethrower'), { movesIndex, weather: 'rain' });
    const dRain = S1.state.b.maxHp - S1.state.b.hp;

    const F2 = makeRuntimeFromDexEntry(fireMon, 50, ['flamethrower']);
    const S2 = newBattleState(W, F2);
    resolveTurn(S2, newAction('a', 'surf'), newAction('b', 'flamethrower'), { movesIndex, weather: 'sun' });
    const dSun = S2.state.b.maxHp - S2.state.b.hp;

    assert(dRain > dSun, 'Rain should boost Water over Sun');
  }

  // Ability: Levitate immune to Ground
  {
    const garchomp = dexLookup('garchomp') || dexLookup('groudon');
    const rotom = dexLookup('rotom') || dexLookup('rotom-wash') || dexLookup('weezing');
    const EQ = makeRuntimeFromDexEntry(garchomp, 50, ['earthquake']);
    const LEV = makeRuntimeFromDexEntry(rotom, 50, ['thunderbolt'], { ability: 'levitate' });
    const S = newBattleState(EQ, LEV);
    const { state } = resolveTurn(S, newAction('a', 'earthquake'), newAction('b', 'thunderbolt'), { movesIndex });
    assert(state.b.hp === state.b.maxHp, 'Levitate target should take 0 Ground damage');
  }

  // Ability: Flash Fire immune + boost
  {
    const flareon = dexLookup('flareon') || dexLookup('heatran') || dexLookup('ninetales');
    const FF = makeRuntimeFromDexEntry(flareon, 50, ['flamethrower'], { ability: 'flash-fire' });
    const C = makeRuntimeFromDexEntry(cz, 50, ['flamethrower']);
    const S = newBattleState(C, FF);
    resolveTurn(S, newAction('a', 'flamethrower'), newAction('b', 'flamethrower'), { movesIndex });
    assert(S.state.b.hp === S.state.b.maxHp, 'Flash Fire should immune Fire hit');
    assert(S.state.a.hp < S.state.a.maxHp, 'Boosted Fire should damage back');
  }

  // Ability: Water Absorb immune + heal
  {
    const vaporeon = dexLookup('vaporeon') || dexLookup('lapras');
    const BL = makeRuntimeFromDexEntry(dexLookup('blastoise') || dexLookup('gyarados'), 50, ['surf']);
    const WA = makeRuntimeFromDexEntry(vaporeon, 50, ['ice-beam'], { ability: 'water-absorb' });
    const S = newBattleState(BL, WA);
    const before = S.b.hp;
    resolveTurn(S, newAction('a', 'surf'), newAction('b', 'ice-beam'), { movesIndex });
    assert(S.state.b.hp > before, 'Water Absorb should heal on immunity');
  }

  // Item: Choice Specs increases special damage
  {
    const specUser = makeRuntimeFromDexEntry(cz, 50, ['dragon-pulse'], { item: 'choice-specs' });
    const plain = makeRuntimeFromDexEntry(cz, 50, ['dragon-pulse']);
    const T1 = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const T2 = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const S1 = newBattleState(specUser, T1);
    resolveTurn(S1, newAction('a', 'dragon-pulse'), newAction('b', 'growl'), { movesIndex });
    const S2 = newBattleState(plain, T2);
    resolveTurn(S2, newAction('a', 'dragon-pulse'), newAction('b', 'growl'), { movesIndex });
    const d1 = S1.state.b.maxHp - S1.state.b.hp,
      d2 = S2.state.b.maxHp - S2.state.b.hp;
    assert(d1 > d2, 'Choice Specs should increase special damage');
  }

  // Item: Choice Band increases physical damage
  {
    const bandUser = makeRuntimeFromDexEntry(dexLookup('heracross') || dexLookup('dragonite'), 50, ['close-combat'], {
      item: 'choice-band'
    });
    const noBand = makeRuntimeFromDexEntry(dexLookup('heracross') || dexLookup('dragonite'), 50, ['close-combat']);
    const T1 = makeRuntimeFromDexEntry(dexLookup('snorlax') || dexLookup('blissey'), 50, ['growl']);
    const T2 = makeRuntimeFromDexEntry(dexLookup('snorlax') || dexLookup('blissey'), 50, ['growl']);
    const S1 = newBattleState(bandUser, T1);
    const S2 = newBattleState(noBand, T2);
    resolveTurn(S1, newAction('a', 'close-combat'), newAction('b', 'growl'), { movesIndex });
    resolveTurn(S2, newAction('a', 'close-combat'), newAction('b', 'growl'), { movesIndex });
    const d1 = S1.state.b.maxHp - S1.state.b.hp,
      d2 = S2.state.b.maxHp - S2.state.b.hp;
    assert(d1 > d2, 'Choice Band should increase physical damage');
  }

  // Item: Life Orb recoil applied
  {
    const LO = makeRuntimeFromDexEntry(cz, 50, ['flamethrower'], { item: 'life-orb' });
    const T = makeRuntimeFromDexEntry(vs, 50, ['growl']);
    const S = newBattleState(LO, T);
    const before = S.a.hp;
    resolveTurn(S, newAction('a', 'flamethrower'), newAction('b', 'growl'), { movesIndex });
    assert(S.state.a.hp < before, 'Life Orb should recoil after dealing damage');
  }

  // Crit with seeded RNG or forced override
  {
    const rng = makeRNG(42);
    const A = makeRuntimeFromDexEntry(cz, 50, ['flamethrower']);
    const D = makeRuntimeFromDexEntry(vs, 50, ['sludge-bomb']);
    const S = newBattleState(A, D);
    const before = S.b.hp;
    resolveTurn(S, newAction('a', 'flamethrower'), newAction('b', 'sludge-bomb'), {
      movesIndex,
      rng,
      critOverride: (attacker) => attacker.name.toLowerCase() === 'charizard'
    });
    const dealt = before - S.state.b.hp;
    assert(dealt > 0, 'Crit path should deal damage');
  }

  console.log('OK: table-driven abilities/items + status/crit/weather all pass sanity tests.');
})();
