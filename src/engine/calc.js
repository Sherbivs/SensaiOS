'use strict';
const { stageMultiplier } = require('./stats');

/**
 * Damage calculation (simplified, deterministic):
 *  - Classic base formula with no random roll and no crit
 *  - STAB 1.5 if move type in attacker's types
 *  - Type effectiveness pulled from defender.matchups[type] (precomputed in your dex)
 *  - Uses physical/special split from moves.min.json
 */
function pickOffensiveStat(attacker, move) {
  const cls = move.class; // 'physical' | 'special' | null
  return cls === 'special' ? 'special-attack' : 'attack';
}

function pickDefensiveStat(defender, move) {
  const cls = move.class;
  return cls === 'special' ? 'special-defense' : 'defense';
}

/** Effective stat with stage, status, and items (Choice Specs) */
function effectiveStat(p, statKey, opts = {}) {
  const base = p.derived?.[statKey] ?? 1;
  let val = Math.max(1, Math.floor(base * stageMultiplier(p.stages?.[statKey] || 0)));

  // Status: burn halves PHYSICAL attack (unless Guts added later)
  if (p.status === 'brn' && statKey === 'attack' && opts.forMoveClass === 'physical') {
    val = Math.floor(val * 0.5);
  }
  // Status: paralysis halves Speed (simplified modern behavior)
  if (p.status === 'par' && statKey === 'speed') {
    val = Math.max(1, Math.floor(val * 0.5));
  }
  // Item: Choice Specs boosts special attack by 1.5×
  if (String(p.item || '').toLowerCase() === 'choice-specs' && statKey === 'special-attack') {
    val = Math.floor(val * 1.5);
  }
  return val;
}

function stab(attacker, move) {
  const t = String(move.type || '').toLowerCase();
  return Array.isArray(attacker.types) && attacker.types.map(String).map((s) => s.toLowerCase()).includes(t)
    ? 1.5
    : 1.0;
}

function typeEffectiveness(defender, move) {
  // Your dex precomputes "damage taken" multipliers as defender.matchups[type]
  const t = String(move.type || '').toLowerCase();
  const m = defender.matchups?.[t];
  return (m === 0 || m === 0.25 || m === 0.5 || m === 1 || m === 2 || m === 4) ? m : 1;
}

function weatherPowerMod(weather, moveType) {
  if (!weather) return 1;
  if (weather === 'rain') {
    if (moveType === 'water') return 1.5;
    if (moveType === 'fire') return 0.5;
    return 1;
  }
  if (weather === 'sun') {
    if (moveType === 'fire') return 1.5;
    if (moveType === 'water') return 0.5;
    return 1;
  }
  return 1;
}

function abilityGrantsImmunity(defender, moveType) {
  const ab = String(defender.ability || '').toLowerCase();
  if (ab === 'levitate' && moveType === 'ground') return true;
  if (ab === 'flash-fire' && moveType === 'fire') return true;
  return false;
}

function flashFireMaybeBoost(p, moveType) {
  const ab = String(p.ability || '').toLowerCase();
  if (ab === 'flash-fire' && p.volatile && p.volatile.flashFireBoost && moveType === 'fire') {
    return 1.5;
  }
  return 1;
}

function critMultiplier(ctx, attacker) {
  const CRIT_MOD = 1.5;
  const chance = ctx?.critOverride ? (ctx.critOverride(attacker) ? 1 : 0) : (ctx?.critChance ?? 1 / 24);
  const roll = ctx?.rng?.next ? ctx.rng.next() : Math.random();
  return roll < chance ? CRIT_MOD : 1;
}

function baseDamage(attacker, defender, move, ctx = {}) {
  if (!move || !move.power || move.power <= 0) return 0;

  const atkKey = pickOffensiveStat(attacker, move);
  const defKey = pickDefensiveStat(defender, move);
  const A = effectiveStat(attacker, atkKey, { forMoveClass: move.class });
  const D = effectiveStat(defender, defKey, { forMoveClass: move.class });
  const L = attacker.level || 50;
  const P = move.power;

  // ((2L/5 + 2) * P * A / D) / 50 + 2
  const term = Math.floor((Math.floor((2 * L) / 5) + 2) * P * A / Math.max(1, D));
  const raw = Math.floor(Math.floor(term / 50) + 2);

  const moveType = String(move.type || '').toLowerCase();
  // Ability immunities (and Flash Fire activation)
  if (abilityGrantsImmunity(defender, moveType)) {
    if (String(defender.ability || '').toLowerCase() === 'flash-fire' && moveType === 'fire') {
      defender.volatile = defender.volatile || {};
      defender.volatile.flashFireBoost = true;
    }
    return 0;
  }

  const eff = typeEffectiveness(defender, move);
  if (eff === 0) return 0;

  const mod =
    stab(attacker, move) *
    flashFireMaybeBoost(attacker, moveType) *
    weatherPowerMod(ctx.weather, moveType) *
    eff *
    critMultiplier(ctx, attacker);

  return Math.max(1, Math.floor(raw * mod));
}

module.exports = { baseDamage, stab, typeEffectiveness, effectiveStat };
