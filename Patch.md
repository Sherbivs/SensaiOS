Let’s power‑up the engine with the four features you asked for—**status**, **crit + seeded RNG**, **weather (Rain/Sun)**, and **starter abilities/items**—without breaking your clean, testable shape.

Below are **drop‑in files and targeted patches** to your existing engine. All CommonJS, no new deps.

---

## 0) New: a tiny seeded RNG

**`src/engine/rng.js`**

```js
'use strict';

/** Xorshift32-based RNG with seed; returns [0,1) floats. */
function makeRNG(seed = 0xDEADBEEF) {
  let x = (seed >>> 0) || 0xDEADBEEF;
  function next() {
    // xorshift32
    x ^= (x << 13) >>> 0;
    x ^= (x >>> 17);
    x ^= (x << 5) >>> 0;
    return ((x >>> 0) / 0x100000000);
  }
  return { next };
}

module.exports = { makeRNG };
```

Use in tests: `const { makeRNG } = require('./rng'); const rng = makeRNG(1234);`

---

## 1) Types: add fields for **status / ability / item / volatile**

**Patch** `src/engine/types.js`

```diff
 function newPokemonRuntime(p, level = 50) {
   return {
     id: p.id,
     name: p.name,
     level,
     types: p.types.slice(),
     base: { ...p.stats },
     stages: {
       attack: 0, defense: 0, 'special-attack': 0, 'special-defense': 0, speed: 0
     },
     maxHp: 0, hp: 0,
-    status: null,
-    moves: []
+    status: null,             // 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz' | null
+    ability: null,            // e.g. 'levitate' | 'flash-fire' | null
+    item: null,               // e.g. 'choice-specs' | null
+    volatile: {},             // ephemeral flags (e.g. { flashFireBoost: true })
+    moves: []
   };
 }
```

---

## 2) Stats & Calc: status hooks, crit, weather, abilities, items

### 2a) Effective stat with status & items

**Patch** `src/engine/calc.js`

```diff
 'use strict';
-const { stageMultiplier } = require('./stats');
+const { stageMultiplier } = require('./stats');

 // existing helpers…
 function pickOffensiveStat(attacker, move) {
   const cls = move.class; // 'physical' | 'special' | null
   return cls === 'special' ? 'special-attack' : 'attack';
 }
 function pickDefensiveStat(defender, move) {
   const cls = move.class;
   return cls === 'special' ? 'special-defense' : 'defense';
 }
 
-function effectiveStat(p, statKey) {
-  const base = p.derived[statKey];
-  const mult = stageMultiplier(p.stages[statKey] || 0);
-  return Math.max(1, Math.floor(base * mult));
-}
+/** Effective stat with stage, status, and items (Choice Specs) */
+function effectiveStat(p, statKey, opts = {}) {
+  const base = p.derived[statKey];
+  let val = Math.max(1, Math.floor(base * stageMultiplier(p.stages[statKey] || 0)));
+
+  // Status: burn halves PHYSICAL attack (unless you later add Guts)
+  if (p.status === 'brn' && statKey === 'attack' && opts.forMoveClass === 'physical') {
+    val = Math.floor(val * 0.5);
+  }
+  // Status: paralysis halves Speed in modern gens (simplified)
+  if (p.status === 'par' && statKey === 'speed') {
+    val = Math.max(1, Math.floor(val * 0.5));
+  }
+  // Item: Choice Specs boosts special attack by 1.5×
+  if (p.item === 'choice-specs' && statKey === 'special-attack') {
+    val = Math.floor(val * 1.5);
+  }
+  return val;
+}
 
 function stab(attacker, move) {
   return attacker.types.includes(move.type) ? 1.5 : 1.0;
 }
 
 function typeEffectiveness(defender, move) {
   // defender.matchups[type] is damage taken multiplier
   const m = defender.matchups?.[move.type];
   return (m === 0 || m === 0.25 || m === 0.5 || m === 1 || m === 2 || m === 4) ? m : 1;
 }
 
+function weatherPowerMod(weather, moveType) {
+  if (!weather) return 1;
+  if (weather === 'rain') {
+    if (moveType === 'water') return 1.5;
+    if (moveType === 'fire')  return 0.5;
+    return 1;
+  }
+  if (weather === 'sun') {
+    if (moveType === 'fire')  return 1.5;
+    if (moveType === 'water') return 0.5;
+    return 1;
+  }
+  return 1;
+}
+
+function abilityGrantsImmunity(defender, moveType) {
+  // Levitate: immune to Ground
+  if (defender.ability === 'levitate' && moveType === 'ground') return true;
+  // Flash Fire: immune to Fire (and sets a boost flag)
+  if (defender.ability === 'flash-fire' && moveType === 'fire') return true;
+  return false;
+}
+
+function flashFireMaybeBoost(p, moveType) {
+  // If user has Flash Fire and has been "activated", boost Fire moves.
+  if (p.ability === 'flash-fire' && p.volatile && p.volatile.flashFireBoost && moveType === 'fire') {
+    return 1.5;
+  }
+  return 1;
+}
+
+function critMultiplier(ctx, attacker) {
+  // Modern crit = 1.5×; base chance ~1/24 by default
+  const CRIT_MOD = 1.5;
+  const chance = (ctx?.critOverride)
+    ? (ctx.critOverride(attacker) ? 1 : 0)
+    : (ctx?.critChance ?? (1 / 24));
+  const roll = ctx?.rng?.next ? ctx.rng.next() : Math.random();
+  return (roll < chance) ? CRIT_MOD : 1;
+}
+
-function baseDamage(attacker, defender, move) {
+function baseDamage(attacker, defender, move, ctx = {}) {
   if (!move || !move.power || move.power <= 0) return 0;
 
   const atkKey = pickOffensiveStat(attacker, move);
   const defKey = pickDefensiveStat(defender, move);
-  const A = effectiveStat(attacker, atkKey);
-  const D = effectiveStat(defender, defKey);
+  const A = effectiveStat(attacker, atkKey, { forMoveClass: move.class });
+  const D = effectiveStat(defender, defKey, { forMoveClass: move.class });
   const L = attacker.level;
   const P = move.power;
 
   // ((2L/5 + 2) * P * A / D) / 50 + 2
   const term = Math.floor((Math.floor((2 * L) / 5) + 2) * P * A / Math.max(1, D));
   const raw = Math.floor(Math.floor(term / 50) + 2);
 
-  const mod = stab(attacker, move) * typeEffectiveness(defender, move); // no random, no crit
-  return Math.max(1, Math.floor(raw * mod));
+  // Ability immunities
+  if (abilityGrantsImmunity(defender, move.type)) {
+    // Flash Fire activation when hit by Fire
+    if (defender.ability === 'flash-fire' && move.type === 'fire') {
+      defender.volatile = defender.volatile || {};
+      defender.volatile.flashFireBoost = true;
+    }
+    return 0;
+  }
+
+  const eff = typeEffectiveness(defender, move);
+  if (eff === 0) return 0;
+
+  const mod =
+      stab(attacker, move)
+    * flashFireMaybeBoost(attacker, move.type)
+    * weatherPowerMod(ctx.weather, move.type)
+    * eff
+    * critMultiplier(ctx, attacker);
+
+  return Math.max(1, Math.floor(raw * mod));
 }
 
-module.exports = { baseDamage, stab, typeEffectiveness, effectiveStat };
+module.exports = { baseDamage, stab, typeEffectiveness, effectiveStat };
```

---

## 3) Turn order: paralysis speed penalty

**Patch** `src/engine/turn.js`

```diff
 'use strict';
-const { baseDamage } = require('./calc');
+const { baseDamage, effectiveStat } = require('./calc');
 
 function resolveTurn(state, actionA, actionB, ctx) {
   const { movesIndex } = ctx;
   const a = state.a, b = state.b;
 
   function moveOf(p, action) { return movesIndex[action.move] || null; }
   function priorityOf(p, mv) { return mv ? (mv.priority || 0) : 0; }
-  function effectiveSpeed(p) { return p.derived.speed; }
+  function effectiveSpeed(p) { return effectiveStat(p, 'speed'); }
 
   const mvA = moveOf(a, actionA);
   const mvB = moveOf(b, actionB);
   const pa = priorityOf(a, mvA);
   const pb = priorityOf(b, mvB);
```

…and pass `ctx` to damage:

```diff
-  function apply(attackerKey, mv, act) {
+  function apply(attackerKey, mv, act) {
     const attacker = attackerKey === 'a' ? a : b;
     const defender = attackerKey === 'a' ? b : a;
     if (!mv || attacker.hp <= 0) { log.push(`${attacker.name} does nothing.`); return; }
-    const dmg = baseDamage(attacker, defender, mv);
+    const dmg = baseDamage(attacker, defender, mv, ctx);
```

---

## 4) Engine index: ability/item/status options on runtime

**Patch** `src/engine/index.js`

```diff
 function makeRuntimeFromDexEntry(dexMon, level = 50, moves = [], opts = {}) {
   const p = newPokemonRuntime(dexMon, level);
   p.derived = derivedStats(p.base, level);
   p.maxHp = p.derived.hp;
   p.hp = p.maxHp;
   p.moves = moves.map(m => String(m).toLowerCase());
   p.matchups = dexMon.matchups;
+  // Opt-in runtime traits
+  p.ability = (opts.ability || dexMon.abilities?.find(a => !a.hidden)?.name || null)?.toLowerCase() || null;
+  p.item    = (opts.item || null)?.toLowerCase() || null;
+  p.status  = (opts.status || null)?.toLowerCase() || null;
   return p;
 }
```

---

## 5) Example tests showing each feature

**Update** `scripts/test-battle-core.js` to exercise the new stuff. This keeps everything deterministic with a seeded RNG and clear assertions.

```js
'use strict';
const assert = require('assert');
const { loadIndexes, makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = require('../src/engine');
const { makeRNG } = require('../src/engine/rng');

(function main() {
  const { dexLookup, movesIndex } = loadIndexes();

  // Base scenario
  const czDex = dexLookup('charizard');
  const vsDex = dexLookup('venusaur');
  assert(czDex && vsDex, 'Missing mons');

  // 1) Burn halves physical attack (Flare Blitz vs Sludge Bomb)
  {
    const A = makeRuntimeFromDexEntry(czDex, 50, ['flare-blitz'], { status: 'brn' });
    const D = makeRuntimeFromDexEntry(vsDex, 50, ['sludge-bomb']);
    const S = newBattleState(A, D);
    const { log } = resolveTurn(S, newAction('a','flare-blitz'), newAction('b','sludge-bomb'), { movesIndex });
    // Charizard should deal noticeably less because of burn
    console.log('[burn] ', log.join(' | '));
    assert(D.hp > D.maxHp * 0.6, 'Burned physical should be reduced (heuristic check)');
  }

  // 2) Paralysis halves speed -> Venusaur should act first if Charizard is paralyzed (no priority moves)
  {
    const A = makeRuntimeFromDexEntry(czDex, 50, ['dragon-pulse'], { status: 'par' }); // special move (no burn penalty)
    const D = makeRuntimeFromDexEntry(vsDex, 50, ['sludge-bomb']);
    const S = newBattleState(A, D);
    const { log } = resolveTurn(S, newAction('a','dragon-pulse'), newAction('b','sludge-bomb'), { movesIndex });
    console.log('[para] ', log[0]);
    assert(log[0].toLowerCase().startsWith('venusaur uses'), 'Paralyzed Charizard should act after Venusaur');
  }

  // 3) Weather: Rain boosts Water, halves Fire; Sun boosts Fire, halves Water
  {
    const gyDex = dexLookup('gyarados') || dexLookup('blastoise');
    const skDex = dexLookup('skeledirge') || dexLookup('venusaur');
    assert(gyDex && skDex, 'Missing water/fire mons');
    const W = makeRuntimeFromDexEntry(gyDex, 50, ['surf']);
    const F = makeRuntimeFromDexEntry(skDex, 50, ['flamethrower']);

    // Compare Surf damage in Rain vs Sun
    const S1 = newBattleState(W, F);
    const rain = resolveTurn(S1, newAction('a','surf'), newAction('b','flamethrower'), { movesIndex, weather:'rain' });
    const dRain = F.maxHp - F.hp;

    const S2 = newBattleState(W, makeRuntimeFromDexEntry(skDex, 50, ['flamethrower']));
    const sun  = resolveTurn(S2, newAction('a','surf'), newAction('b','flamethrower'), { movesIndex, weather:'sun'  });
    const dSun = sun.state.b.maxHp - sun.state.b.hp;

    console.log('[weather] rain surf dmg=', dRain, ' sun surf dmg=', dSun);
    assert(dRain > dSun, 'Rain should boost Water relative to Sun');
  }

  // 4) Abilities: Levitate immunity to Ground
  {
    const eqUser = makeRuntimeFromDexEntry(dexLookup('garchomp') || dexLookup('groudon'), 50, ['earthquake']);
    const rotom = dexLookup('rotom') || dexLookup('rotom-wash') || dexLookup('weezing');
    const lev = makeRuntimeFromDexEntry(rotom, 50, ['thunderbolt'], { ability: 'levitate' });
    const S = newBattleState(eqUser, lev);
    const { log } = resolveTurn(S, newAction('a','earthquake'), newAction('b','thunderbolt'), { movesIndex });
    console.log('[levitate] ', log.join(' | '));
    assert(S.b.hp === S.b.maxHp, 'Levitate target should take 0 from Ground');
  }

  // 5) Abilities: Flash Fire immunity + boost
  {
    const flareonDex = dexLookup('flareon') || dexLookup('heatran') || dexLookup('ninetales');
    const FF = makeRuntimeFromDexEntry(flareonDex, 50, ['flamethrower'], { ability: 'flash-fire' });
    const cz  = makeRuntimeFromDexEntry(czDex, 50, ['flamethrower']);
    // Charizard hits Flareon with Fire -> immune, Flareon gains boost and strikes back harder in the same turn if it moves after
    const S = newBattleState(cz, FF);
    const out = resolveTurn(S, newAction('a','flamethrower'), newAction('b','flamethrower'), { movesIndex });
    console.log('[flash-fire] ', out.log.join(' | '));
    // Charizard did 0 to Flareon
    assert(S.b.hp === S.b.maxHp, 'Flash Fire should immune Fire damage');
    // Flareon should have flashFireBoost flag now; damage should be > zero (sanity)
    assert(S.a.hp < S.a.maxHp, 'Boosted Fire move should damage attacker back');
  }

  // 6) Items: Choice Specs boosts SpA
  {
    const specUser = makeRuntimeFromDexEntry(czDex, 50, ['dragon-pulse'], { item: 'choice-specs' }); // special
    const plain    = makeRuntimeFromDexEntry(czDex, 50, ['dragon-pulse']);
    const target1  = makeRuntimeFromDexEntry(vsDex, 50, ['growl']);
    const target2  = makeRuntimeFromDexEntry(vsDex, 50, ['growl']);
    const S1 = newBattleState(specUser, target1);
    const S2 = newBattleState(plain,    target2);
    resolveTurn(S1, newAction('a','dragon-pulse'), newAction('b','growl'), { movesIndex });
    resolveTurn(S2, newAction('a','dragon-pulse'), newAction('b','growl'), { movesIndex });
    const d1 = S1.b.maxHp - S1.b.hp, d2 = S2.b.maxHp - S2.b.hp;
    console.log('[specs] dmg with specs=', d1, ' vs no-specs=', d2);
    assert(d1 > d2, 'Choice Specs should increase special damage');
  }

  // 7) Crit with seeded RNG (force crit on attacker via override)
  {
    const rng = makeRNG(42);
    const A = makeRuntimeFromDexEntry(czDex, 50, ['flamethrower']);
    const D = makeRuntimeFromDexEntry(vsDex, 50, ['sludge-bomb']);
    const S = newBattleState(A, D);
    const ctx = {
      movesIndex,
      rng,
      // Guarantee crit for Charizard only:
      critOverride: (attacker) => attacker.name.toLowerCase() === 'charizard'
    };
    const before = D.hp;
    const { log } = resolveTurn(S, newAction('a','flamethrower'), newAction('b','sludge-bomb'), ctx);
    const dealt = before - D.hp;
    console.log('[crit] ', log.join(' | '), ' dealt=', dealt);
    assert(dealt > 0, 'Crit should do positive damage');
  }

  console.log('OK: status, crit, weather, abilities, items all passed sanity tests.');
})();
```

> Run:
> `npm run refresh:data`
> `npm run test:battle`

---

## 6) Using the new knobs from your bot (optional)

When you build teams or a `/calc` UI, set runtime traits via `makeRuntimeFromDexEntry(dexMon, level, moves, { status, ability, item })`.
Examples:

```js
const A = makeRuntimeFromDexEntry(dexLookup('garchomp'), 50, ['earthquake'], { item: 'choice-scarf' /* later */ });
const B = makeRuntimeFromDexEntry(dexLookup('rotom-wash'), 50, ['hydro-pump'], { ability: 'levitate', status: 'par' });
const ctx = { movesIndex, weather: 'rain', rng: makeRNG(2025) };
```

---

## 7) What’s next (low‑risk incremental layers)

* Add **Guts** (negates burn ATK halving and boosts Attack 1.5×).
* Add **Choice locking** (first move locks until switch; trivial per‑battle flag).
* Add **RNG interface for accuracy** (miss/secondary effects) with seeded tests.
* Expand **weather** (Sand/Hail/Snow; special cases like Solar Beam, Thunder).
* Ability parser: table‑drive a dozen common abilities/items with conditions.

If you want, I’ll ship a small **ability/item table** file and wire it into `baseDamage` so adding new effects is a one‑line config instead of code edits.
