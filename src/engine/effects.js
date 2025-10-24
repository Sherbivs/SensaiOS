'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * Effects registry:
 * - Accuracy rolls using move.accuracy (%). Null/undefined accuracy = always hit.
 * - Secondary status via move.meta (PokéAPI) when available, else fallback to data/effects.json.
 * - Supports AI preference: ctx.effectSource = 'auto' | 'pokeapi' | 'local'
 *   default 'auto' => prefer PokéAPI meta if present, else local override.
 * - Uses ctx.rng (seeded) if provided; else Math.random().
 *
 * Advanced layer (declarative, no changes to turn.js required):
 * - EFFECT_RULES + registerEffectRule(name, rule)
 * - computeTotalDamage(attacker, defender, move, perHitDamage, ctx)
 *     -> Multi-hit aggregation, fixed-damage overrides
 * - applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx)
 *     -> Drain, recoil, flinch (post-hit)
 */

// Local fallback: data/effects.json (optional)
let LOCAL_EFFECTS = {};
const LOCAL_PATH = path.join(process.cwd(), 'data', 'effects.json');
if (fs.existsSync(LOCAL_PATH)) {
  try { LOCAL_EFFECTS = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8')); } catch (_) {}
}

// ---- Runtime-extensible declarative rules ----
// Built-in starter rules; add/override at runtime via registerEffectRule().
const EFFECT_RULES = {
  // Fixed-damage classics:
  'dragon-rage': { fixedDamage: { value: 40 } },
  'sonic-boom':  { fixedDamage: { value: 20 } },
  'night-shade': { fixedDamage: { levelBased: true } },
  'seismic-toss':{ fixedDamage: { levelBased: true } },

  // Multi-hit defaults are derived from move.meta when available.
  // Add entries here to override probabilities or define rules when meta is absent.

  // Example override if meta lacks it:
  // 'double-edge': { recoil: { percent: 33 } },
};

function registerEffectRule(name, rule) {
  EFFECT_RULES[String(name).toLowerCase()] = rule || {};
}

function rand(ctx) {
  return ctx?.rng?.next ? ctx.rng.next() : Math.random();
}

function pct(probPct, ctx) {
  if (probPct == null) return true;
  const p = Math.max(0, Math.min(100, Number(probPct)));
  return rand(ctx) < (p / 100);
}

function checkAccuracy(attacker, defender, move, ctx = {}) {
  // If move has no accuracy listed (e.g., Swift) -> always hit in this skeleton
  if (move.accuracy == null) return { ok: true };

  const acc = Number(move.accuracy);
  if (!Number.isFinite(acc) || acc <= 0) return { ok: false, reason: 'invalid-accuracy' };

  // Future: accuracy/evasion stages; bright powder; etc.
  const roll = rand(ctx);
  const hit = roll < (acc / 100);
  return { ok: hit, reason: hit ? undefined : `roll=${roll.toFixed(3)}>acc=${(acc/100).toFixed(3)}` };
}

// Map PokéAPI ailment => engine status code
const AILMENT_TO_STATUS = {
  burn: 'brn',
  paralysis: 'par',
  poison: 'psn',
  toxic: 'tox',
  sleep: 'slp',
  freeze: 'frz',
};

function pickEffectSource(move, ctx) {
  const pref = ctx?.effectSource || 'auto';
  const hasMeta = !!move?.meta;
  const rawName = String(move?.name || '').toLowerCase();
  const normName = rawName.replace(/\s+/g, '-');
  const hasLocal = !!(LOCAL_EFFECTS?.[rawName] || LOCAL_EFFECTS?.[normName]);
  if (pref === 'pokeapi') return hasMeta ? 'pokeapi' : null;
  if (pref === 'local')   return hasLocal ? 'local'   : null;
  // auto:
  if (hasMeta) return 'pokeapi';
  if (hasLocal) return 'local';
  return null;
}

function applySecondaryEffects(attacker, defender, move, ctx = {}) {
  const src = pickEffectSource(move, ctx);
  if (!src) return; // no known configured effects

  if (src === 'pokeapi') {
    // Use meta.ailment & meta.ailment_chance if present
    const meta = move.meta || {};
    const ailment = meta.ailment?.name || meta.ailment || null;
    const chance = meta.ailment_chance ?? move.effect_chance ?? null;
    const status = (ailment && AILMENT_TO_STATUS[ailment]) || null;
    if (!status || !chance) return;

    // Do not overwrite a major status if target is already statused
    if (defender.status) return;
    if (pct(chance, ctx)) {
      defender.status = status;
      ctx.log?.push?.(`${defender.name} is ${status.toUpperCase()}!`);
    }
    return;
  }

  if (src === 'local') {
    const rawName = String(move.name || '').toLowerCase();
    const normalized = rawName.replace(/\s+/g, '-');
    const rule = LOCAL_EFFECTS[rawName] || LOCAL_EFFECTS[normalized];
    if (!rule) return;
    // rule example: { "status": "par", "chance": 100 } or array of {status, chance}
    const rules = Array.isArray(rule) ? rule : [rule];
    for (const r of rules) {
      const status = String(r.status || '').toLowerCase();
      const chance = r.chance ?? null;
      if (!status) continue;
      if (defender.status) continue; // don't overwrite
      if (pct(chance, ctx)) {
        defender.status = status;
        ctx.log?.push?.(`${defender.name} is ${status.toUpperCase()}!`);
        // one effect per hit
        break;
      }
    }
  }
}

// -------------------- Advanced effects --------------------
/**
 * computeTotalDamage: wraps a single-hit damage number (perHitDamage) and:
 *  - applies fixed-damage overrides (Dragon Rage, Night Shade, Seismic Toss)
 *  - aggregates multi-hit (min_hits/max_hits from PokéAPI meta or EFFECT_RULES)
 * Returns { total, hits, perHit } where perHit is the array of dealt values for transparency.
 */
function computeTotalDamage(attacker, defender, move, perHitDamage, ctx = {}) {
  const rawName = String(move.name || '').toLowerCase();
  const normName = rawName.replace(/\s+/g, '-');
  const rule = EFFECT_RULES[rawName] || EFFECT_RULES[normName] || {};
  const meta = move.meta || {};

  // 1) Fixed damage overrides
  const fixed = rule.fixedDamage || null;
  if (fixed && (fixed.value != null || fixed.levelBased)) {
    const val = fixed.value != null ? fixed.value : (fixed.levelBased ? attacker.level : perHitDamage);
    const dealt = Math.max(1, Math.floor(val));
    return { total: dealt, hits: 1, perHit: [dealt], fixed: true };
  }

  // 2) Multi-hit aggregation
  let minH = meta.min_hits != null ? meta.min_hits : null;
  let maxH = meta.max_hits != null ? meta.max_hits : null;
  let hits = 1;

  if (minH != null && maxH != null && maxH >= minH && maxH > 1) {
    // If a custom chance table exists in EFFECT_RULES, use it; else uniform RNG on [min,max].
    const table = rule.multiHit?.chanceTable || null;
    if (table && Array.isArray(table) && table.length === (maxH - minH + 1)) {
      const r = rand(ctx);
      let acc = 0, chosen = minH;
      for (let i = 0; i < table.length; i++) {
        acc += table[i];
        if (r < acc) { chosen = minH + i; break; }
      }
      hits = chosen;
    } else {
      // Uniform fallback
      const r = rand(ctx);
      hits = minH + Math.floor(r * (maxH - minH + 1));
    }
  } else if (rule.multiHit?.min && rule.multiHit?.max && rule.multiHit.max >= rule.multiHit.min) {
    const { min, max, chanceTable } = rule.multiHit;
    if (chanceTable && Array.isArray(chanceTable) && chanceTable.length === (max - min + 1)) {
      const r = rand(ctx);
      let acc = 0, chosen = min;
      for (let i = 0; i < chanceTable.length; i++) { acc += chanceTable[i]; if (r < acc) { chosen = min + i; break; } }
      hits = chosen;
    } else {
      const r = rand(ctx);
      hits = min + Math.floor(r * (max - min + 1));
    }
  }

  // Aggregate hits
  hits = Math.max(1, Math.min(10, Math.floor(hits))); // clamp defensively
  const perHit = new Array(hits).fill(Math.max(0, perHitDamage));
  const total = perHit.reduce((a,b)=>a+b,0);
  return { total, hits, perHit, fixed: false };
}

/**
 * applyAdvancedAfterDamage:
 *  - Drain: heal attacker for a percent of damage dealt (PokéAPI meta.drain or EFFECT_RULES)
 *  - Recoil: damage attacker for a percent of damage dealt (meta.recoil or EFFECT_RULES)
 *  - Flinch: set defender.volatile.flinched based on chance (meta.flinch_chance or EFFECT_RULES)
 */
function applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx = {}) {
  const rawName = String(move.name || '').toLowerCase();
  const normName = rawName.replace(/\s+/g, '-');
  const rule = EFFECT_RULES[rawName] || EFFECT_RULES[normName] || {};
  const meta = move.meta || {};
  const log = ctx.log || [];

  // 1) Drain
  // PokéAPI meta: drain is positive percent of damage converted to HP.
  let drainPct = null;
  if (typeof meta.drain === 'number' && meta.drain > 0) drainPct = meta.drain;
  if (rule.drain?.percent != null) drainPct = rule.drain.percent;
  if (drainPct) {
    const heal = Math.max(1, Math.floor((dealt * drainPct) / 100));
    const before = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp + heal, attacker.hp + heal);
    if (attacker.hp > before) log.push(`${attacker.name} restored ${attacker.hp - before} HP (drain).`);
  }

  // 2) Recoil
  let recoilPct = null;
  if (typeof meta.recoil === 'number' && meta.recoil > 0) recoilPct = meta.recoil;
  if (rule.recoil?.percent != null) recoilPct = rule.recoil.percent;
  if (recoilPct) {
    const recoil = Math.max(1, Math.floor((dealt * recoilPct) / 100));
    attacker.hp = Math.max(0, attacker.hp - recoil);
    log.push(`${attacker.name} is hurt by recoil (${recoil}).`);
  }

  // 3) Flinch
  // PokéAPI meta: flinch_chance (percent) if present
  let flinchChance = null;
  if (typeof meta.flinch_chance === 'number' && meta.flinch_chance > 0) flinchChance = meta.flinch_chance;
  if (rule.flinch?.chance != null) flinchChance = rule.flinch.chance;
  if (flinchChance && pct(flinchChance, ctx)) {
    defender.volatile = defender.volatile || {};
    defender.volatile.flinched = true;
    log.push(`${defender.name} flinched!`);
  }
}

module.exports = {
  checkAccuracy,
  applySecondaryEffects,
  computeTotalDamage,
  applyAdvancedAfterDamage,
  registerEffectRule,
  EFFECT_RULES
};
