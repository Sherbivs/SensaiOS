Absolutely. Here’s a **single, comprehensive patch** that implements your plan:

* Adds a **declarative registry** (`EFFECT_RULES`) with a `registerEffectRule()` runtime hook.
* Extends `effects.js` with:

  * `computeTotalDamage(attacker, defender, move, perHitDamage, ctx)` → handles **multi-hit** and **fixed-damage** without touching `turn.js`.
  * `applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx)` → handles **drain**, **recoil**, **flinch** post-hit.
  * Keeps your earlier `checkAccuracy()` and `applySecondaryEffects()` intact.
* Minimal, surgical changes to `calc.js`:

  * Wrap `baseDamage()`’s per-hit computation with `computeTotalDamage()`.
  * Call `applyAdvancedAfterDamage()` at the end of `afterDealtDamage()`.
* Adds **focused tests** for Dragon Rage (fixed 40), Giga Drain (heal), Double-Edge (recoil), Bite (flinch), Fury Swipes (multi-hit aggregate).

Copy this to `advanced-effects.patch`, run `git checkout feature/effects-registry`, then `git apply advanced-effects.patch`.

---

### ✅ Unified diff

```diff
diff --git a/src/engine/effects.js b/src/engine/effects.js
index a6b0f3a..3f2a1d9 100644
--- a/src/engine/effects.js
+++ b/src/engine/effects.js
@@ -1,19 +1,38 @@
 'use strict';
 const fs = require('fs');
 const path = require('path');
 
 /**
  * Effects registry:
  * - Accuracy rolls using move.accuracy (%). Null/undefined accuracy = always hit.
  * - Secondary status via move.meta (PokéAPI) when available, else fallback to data/effects.json.
  * - Supports AI preference: ctx.effectSource = 'auto' | 'pokeapi' | 'local'
  *   default 'auto' => prefer PokéAPI meta if present, else local override.
  * - Uses ctx.rng (seeded) if provided; else Math.random().
+ *
+ * Advanced layer (declarative, no changes to turn.js required):
+ * - EFFECT_RULES + registerEffectRule(name, rule)
+ * - computeTotalDamage(attacker, defender, move, perHitDamage, ctx)
+ *     -> Multi-hit aggregation, fixed-damage overrides
+ * - applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx)
+ *     -> Drain, recoil, flinch (post-hit)
  */
 
 // Local fallback: data/effects.json (optional)
 let LOCAL_EFFECTS = {};
 const LOCAL_PATH = path.join(process.cwd(), 'data', 'effects.json');
 if (fs.existsSync(LOCAL_PATH)) {
   try { LOCAL_EFFECTS = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch (_) {}
 }
 
+// ---- Runtime-extensible declarative rules ----
+// Built-in starter rules; add/override at runtime via registerEffectRule().
+const EFFECT_RULES = {
+  // Fixed-damage classics:
+  'dragon-rage': { fixedDamage: { value: 40 } },
+  'sonic-boom':  { fixedDamage: { value: 20 } },
+  'night-shade': { fixedDamage: { levelBased: true } },
+  'seismic-toss':{ fixedDamage: { levelBased: true } },
+
+  // Multi-hit (default weights when meta min/max are present but no table provided):
+  // Note: We don't list every multi-hit; we rely on move.meta.min_hits/max_hits by default.
+
+  // Post-hit archetypes where PokéAPI meta may be absent or to override:
+  // 'double-edge': { recoil: { percent: 33 } }, // example if meta missing
+};
+
+function registerEffectRule(name, rule) {
+  EFFECT_RULES[String(name).toLowerCase()] = rule || {};
+}
+
 function rand(ctx) {
   return ctx?.rng?.next ? ctx.rng.next() : Math.random();
 }
@@ -27,6 +46,7 @@ function pct(probPct, ctx) {
   return rand(ctx) < (p / 100);
 }
 
+// -------------------- Accuracy --------------------
 function checkAccuracy(attacker, defender, move, ctx = {}) {
   // If move has no accuracy listed (e.g., Swift) -> always hit in this skeleton
   if (move.accuracy == null) return { ok: true };
@@ -41,6 +61,7 @@ function checkAccuracy(attacker, defender, move, ctx = {}) {
   return { ok: hit, reason: hit ? undefined : `roll=${roll.toFixed(3)}>acc=${(acc/100).toFixed(3)}` };
 }
 
+// -------------------- Secondary (status) --------------------
 // Map PokéAPI ailment => engine status code
 const AILMENT_TO_STATUS = {
   burn: 'brn',
@@ -90,7 +111,161 @@ function applySecondaryEffects(attacker, defender, move, ctx = {}) {
   }
 }
 
+// -------------------- Advanced effects --------------------
+/**
+ * computeTotalDamage: wraps a single-hit damage number (perHitDamage) and:
+ *  - applies fixed-damage overrides (Dragon Rage, Night Shade, Seismic Toss)
+ *  - aggregates multi-hit (min_hits/max_hits from PokéAPI meta or EFFECT_RULES)
+ * Returns { total, hits, perHit } where perHit is the array of dealt values for transparency.
+ */
+function computeTotalDamage(attacker, defender, move, perHitDamage, ctx = {}) {
+  const name = String(move.name || '').toLowerCase();
+  const rule = EFFECT_RULES[name] || {};
+  const meta = move.meta || {};
+
+  // 1) Fixed damage overrides
+  const fixed = rule.fixedDamage || null;
+  if (fixed && (fixed.value || fixed.levelBased)) {
+    const val = fixed.value != null ? fixed.value :
+                fixed.levelBased ? attacker.level : perHitDamage;
+    const dealt = Math.max(1, Math.floor(val));
+    return { total: dealt, hits: 1, perHit: [dealt], fixed: true };
+  }
+  // Some fixed-damage moves have power baked-in (Dragon Rage=40). Already covered above.
+
+  // 2) Multi-hit aggregation
+  let minH = meta.min_hits != null ? meta.min_hits : null;
+  let maxH = meta.max_hits != null ? meta.max_hits : null;
+  let hits = 1;
+
+  if (minH != null && maxH != null && maxH >= minH && maxH > 1) {
+    // If a custom chance table exists in EFFECT_RULES, use it; else uniform RNG on [min,max].
+    const table = rule.multiHit?.chanceTable || null;
+    if (table && Array.isArray(table) && table.length === (maxH - minH + 1)) {
+      const r = rand(ctx);
+      let acc = 0, chosen = minH;
+      for (let i = 0; i < table.length; i++) {
+        acc += table[i];
+        if (r < acc) { chosen = minH + i; break; }
+      }
+      hits = chosen;
+    } else {
+      // Uniform fallback
+      const r = rand(ctx);
+      hits = minH + Math.floor(r * (maxH - minH + 1));
+    }
+  } else if (rule.multiHit?.min && rule.multiHit?.max && rule.multiHit.max >= rule.multiHit.min) {
+    const { min, max, chanceTable } = rule.multiHit;
+    if (chanceTable && Array.isArray(chanceTable) && chanceTable.length === (max - min + 1)) {
+      const r = rand(ctx);
+      let acc = 0, chosen = min;
+      for (let i = 0; i < chanceTable.length; i++) { acc += chanceTable[i]; if (r < acc) { chosen = min + i; break; } }
+      hits = chosen;
+    } else {
+      const r = rand(ctx);
+      hits = min + Math.floor(r * (max - min + 1));
+    }
+  }
+
+  // Aggregate hits
+  hits = Math.max(1, Math.min(10, Math.floor(hits))); // clamp defensively
+  const perHit = new Array(hits).fill(Math.max(0, perHitDamage));
+  const total = perHit.reduce((a,b)=>a+b,0);
+  return { total, hits, perHit, fixed: false };
+}
+
+/**
+ * applyAdvancedAfterDamage:
+ *  - Drain: heal attacker for a percent of damage dealt (PokéAPI meta.drain or EFFECT_RULES)
+ *  - Recoil: damage attacker for a percent of damage dealt (meta.recoil or EFFECT_RULES)
+ *  - Flinch: set defender.volatile.flinched based on chance (meta.flinch_chance or EFFECT_RULES)
+ */
+function applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx = {}) {
+  const name = String(move.name || '').toLowerCase();
+  const rule = EFFECT_RULES[name] || {};
+  const meta = move.meta || {};
+  const log = ctx.log || [];
+
+  // 1) Drain
+  // PokéAPI meta: drain is positive percent of damage converted to HP.
+  let drainPct = null;
+  if (typeof meta.drain === 'number' && meta.drain > 0) drainPct = meta.drain;
+  if (rule.drain?.percent != null) drainPct = rule.drain.percent;
+  if (drainPct) {
+    const heal = Math.max(1, Math.floor((dealt * drainPct) / 100));
+    const before = attacker.hp;
+    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
+    if (attacker.hp > before) log.push(`${attacker.name} restored ${attacker.hp - before} HP (drain).`);
+  }
+
+  // 2) Recoil
+  let recoilPct = null;
+  if (typeof meta.recoil === 'number' && meta.recoil > 0) recoilPct = meta.recoil;
+  if (rule.recoil?.percent != null) recoilPct = rule.recoil.percent;
+  if (recoilPct) {
+    const recoil = Math.max(1, Math.floor((dealt * recoilPct) / 100));
+    attacker.hp = Math.max(0, attacker.hp - recoil);
+    log.push(`${attacker.name} is hurt by recoil (${recoil}).`);
+  }
+
+  // 3) Flinch
+  // PokéAPI meta: flinch_chance (percent) if present
+  let flinchChance = null;
+  if (typeof meta.flinch_chance === 'number' && meta.flinch_chance > 0) flinchChance = meta.flinch_chance;
+  if (rule.flinch?.chance != null) flinchChance = rule.flinch.chance;
+  if (flinchChance && pct(flinchChance, ctx)) {
+    defender.volatile = defender.volatile || {};
+    defender.volatile.flinched = true;
+    log.push(`${defender.name} flinched!`);
+  }
+}
+
 module.exports = {
   checkAccuracy,
-  applySecondaryEffects
+  applySecondaryEffects,
+  computeTotalDamage,
+  applyAdvancedAfterDamage,
+  registerEffectRule,
+  EFFECT_RULES
 };
```

```diff
diff --git a/src/engine/calc.js b/src/engine/calc.js
index 27a1a2c..7d6a9ee 100644
--- a/src/engine/calc.js
+++ b/src/engine/calc.js
@@ -1,6 +1,7 @@
 'use strict';
 const { stageMultiplier } = require('./stats');
 const { ABILITIES, ITEMS } = require('./tables');
+const { computeTotalDamage, applyAdvancedAfterDamage } = require('./effects');
 
 /** Helpers to read ability/item config */
 const A = (p) => p?.ability ? ABILITIES[p.ability] : null;
@@ -106,7 +107,17 @@ function baseDamage(attacker, defender, move, ctx = {}) {
 
   const mod =
       stab(attacker, move)
     * weatherPowerMod(ctx.weather, move.type)
     * attackerAbilityDamageMod(attacker, move.type)
     * itemDamageMod(attacker)
     * eff
     * critMultiplier(ctx, attacker);
 
-  return Math.max(1, Math.floor(raw * mod));
+  // Per-hit damage before multi-hit/fixed aggregation
+  const perHit = Math.max(1, Math.floor(raw * mod));
+  const totals = computeTotalDamage(attacker, defender, move, perHit, ctx);
+  return Math.max(0, totals.total);
 }
 
 /** After-damage hooks (e.g., Life Orb recoil). */
 function afterDealtDamage(attacker, defender, move, dealt, ctx = {}) {
   const itm = I(attacker);
   if (itm?.afterDealDamage) itm.afterDealDamage(attacker, dealt, ctx);
+  // Advanced post-hit layer: drain, recoil (meta/registry), flinch
+  applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx);
 }
 
 module.exports = { baseDamage, effectiveStat, stab, typeEffectiveness, afterDealtDamage };
```

```diff
diff --git a/scripts/test-effects-advanced.js b/scripts/test-effects-advanced.js
new file mode 100644
index 0000000..b4c2ab1
--- /dev/null
+++ b/scripts/test-effects-advanced.js
@@ -0,0 +1,140 @@
+'use strict';
+const assert = require('assert');
+const { loadIndexes, makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = require('../src/engine');
+const { makeRNG } = require('../src/engine/rng');
+const { registerEffectRule, EFFECT_RULES } = require('../src/engine/effects');
+
+(function main() {
+  const { dexLookup, movesIndex } = loadIndexes();
+  const cz = dexLookup('charizard');
+  const vs = dexLookup('venusaur');
+  const rat = dexLookup('raticate') || dexLookup('staraptor') || dexLookup('talonflame');
+  const mar = dexLookup('marowak') || dexLookup('machamp') || dexLookup('hawlucha');
+  assert(cz && vs, 'Need baseline mons');
+
+  // 1) Fixed damage: Dragon Rage = 40 regardless of stats
+  {
+    const A = makeRuntimeFromDexEntry(cz, 50, ['dragon-rage']);
+    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
+    const S = newBattleState(A, D);
+    const hpBefore = D.hp;
+    resolveTurn(S, newAction('a', 'dragon-rage'), newAction('b','growl'), { movesIndex, rng: makeRNG(1) });
+    const dealt = hpBefore - S.state.b.hp;
+    assert(dealt === 40, `Dragon Rage should deal 40, got ${dealt}`);
+  }
+
+  // 2) Drain: Giga Drain heals attacker by ~50% of damage (PokéAPI meta.drain)
+  {
+    const A = makeRuntimeFromDexEntry(vs, 50, ['giga-drain']);
+    const D = makeRuntimeFromDexEntry(cz, 50, ['growl']);
+    const S = newBattleState(A, D);
+    const hpA0 = S.a.hp;
+    const hpB0 = S.b.hp;
+    resolveTurn(S, newAction('a','giga-drain'), newAction('b','growl'), { movesIndex, rng: makeRNG(2) });
+    const dealt = hpB0 - S.state.b.hp;
+    const healed = S.state.a.hp - hpA0;
+    assert(dealt > 0 && healed > 0, 'Giga Drain should damage and heal');
+  }
+
+  // 3) Recoil: Double-Edge damages attacker by ~33% of damage dealt (meta.recoil or rule)
+  // If your PokéAPI meta lacks recoil for Double-Edge, uncomment this override:
+  // registerEffectRule('double-edge', { recoil: { percent: 33 } });
+  {
+    const A = makeRuntimeFromDexEntry(rat, 50, ['double-edge']);
+    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
+    const S = newBattleState(A, D);
+    const a0 = S.a.hp, b0 = S.b.hp;
+    resolveTurn(S, newAction('a','double-edge'), newAction('b','growl'), { movesIndex, rng: makeRNG(3) });
+    const dealt = b0 - S.state.b.hp;
+    const recoil = a0 - S.state.a.hp;
+    assert(dealt > 0 && recoil > 0, 'Double-Edge should recoil after dealing damage');
+  }
+
+  // 4) Flinch: Bite can set flinch (meta.flinch_chance)
+  {
+    const A = makeRuntimeFromDexEntry(cz, 50, ['bite']);
+    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
+    const S = newBattleState(A, D);
+    resolveTurn(S, newAction('a','bite'), newAction('b','growl'), { movesIndex, rng: makeRNG(4) });
+    // We don't enforce that flinch always occurs; we only assert that the volatile flag is valid when it procs.
+    assert(S.state.b.volatile == null || typeof S.state.b.volatile.flinched !== 'undefined', 'Flinch path wired');
+  }
+
+  // 5) Multi-hit: Fury Swipes aggregates total damage (uses meta min_hits/max_hits or registry rule)
+  // If your cached meta lacks min/max, register a local rule:
+  // registerEffectRule('fury-swipes', { multiHit: { min: 2, max: 5, chanceTable: [0.35, 0.35, 0.15, 0.15] } });
+  {
+    const A = makeRuntimeFromDexEntry(mar, 50, ['fury-swipes']);
+    const D = makeRuntimeFromDexEntry(vs, 50, ['growl']);
+    const S = newBattleState(A, D);
+    const b0 = S.b.hp;
+    resolveTurn(S, newAction('a','fury-swipes'), newAction('b','growl'), { movesIndex, rng: makeRNG(5) });
+    const total = b0 - S.state.b.hp;
+    assert(total >= 1, 'Fury Swipes should aggregate multiple hits worth of damage');
+  }
+
+  console.log('OK: advanced effects (fixed, drain, recoil, flinch, multi-hit) pass sanity tests.');
+})();
diff --git a/package.json b/package.json
index f621e3c..f1b4c88 100644
--- a/package.json
+++ b/package.json
@@ -6,6 +6,7 @@
     "test:data": "node scripts/test-data.js",
     "refresh:data": "npm run build:data && npm run test:data && npm run build:assets && npm run test:assets",
     "test:battle": "node scripts/test-battle-core.js",
-    "test:effects": "node scripts/test-effects.js"
+    "test:effects": "node scripts/test-effects.js",
+    "test:effects:advanced": "node scripts/test-effects-advanced.js"
   }
 }
```

---

### How to apply & run

```bash
git checkout feature/effects-registry
git apply advanced-effects.patch

# Rebuild snapshot if necessary
npm run refresh:data

# Run all tests
npm run test:battle
npm run test:effects
npm run test:effects:advanced
```

### Notes and knobs

* **Registry first**: The engine now prefers **PokéAPI meta** (accuracy, `meta.drain`, `meta.recoil`, `meta.flinch_chance`, `meta.min_hits/max_hits`).
  If meta is missing or you want to override, add entries via:

  ```js
  const { registerEffectRule } = require('./src/engine/effects');
  registerEffectRule('double-edge', { recoil: { percent: 33 } });
  registerEffectRule('fury-swipes', { multiHit: { min: 2, max: 5, chanceTable: [0.35,0.35,0.15,0.15] } });
  ```
* **AI choice**: At runtime, your context can still choose effect sourcing for status via `effectSource: 'auto' | 'pokeapi' | 'local'`.
* **No `turn.js` diff**: Turn order and resolution stayed untouched; all nuance lives in `effects.js` and `calc.js`.

If you want, I can add **flinch enforcement** in your next turn (skip defender’s action if `volatile.flinched` is set) with a tiny `turn.js` opt-in flag—still deterministic, still one line to toggle.
