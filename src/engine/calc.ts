/**
 * Battle damage calculation engine
 * Handles stat calculations, type effectiveness, abilities, items, and damage formulas.
 */

import { stageMultiplier } from './stats.js';
import { ABILITIES, ITEMS } from './tables.js';
import { computeTotalDamage, applyAdvancedAfterDamage } from './effects.js';
import type { PokemonRuntime, WeatherType } from './types.js';
import type { AbilityConfig, ItemConfig, BattleContext } from './tables.js';
import type { MoveData, EffectContext } from './effects.js';
import type { RNG } from './rng.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CalcContext extends EffectContext {
  weather?: WeatherType;
  critOverride?: (attacker: PokemonRuntime) => boolean;
  critChance?: number;
  rng?: RNG;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const A = (p: PokemonRuntime): AbilityConfig | null => (p?.ability ? ABILITIES[p.ability] : null);
const I = (p: PokemonRuntime): ItemConfig | null => (p?.item ? ITEMS[p.item] : null);

function pickOffensiveStat(_attacker: PokemonRuntime, move: MoveData): string {
  return move.class === 'special' ? 'special-attack' : 'attack';
}

function pickDefensiveStat(_defender: PokemonRuntime, move: MoveData): string {
  return move.class === 'special' ? 'special-defense' : 'defense';
}

/** Is the mon currently statused with any major status? */
function hasAnyStatus(p: PokemonRuntime): boolean {
  return !!p.status;
}

// ─────────────────────────────────────────────────────────────────────────────
// Effective Stat Calculation
// ─────────────────────────────────────────────────────────────────────────────

interface EffectiveStatOpts {
  forMoveClass?: string | null;
}

/** Effective stat with stages, status, ability & item modifiers. */
function effectiveStat(p: PokemonRuntime, statKey: string, opts: EffectiveStatOpts = {}): number {
  const forMoveClass = opts.forMoveClass || null;
  const derived = p.derived as unknown as Record<string, number>;
  const stages = p.stages as unknown as Record<string, number>;
  let val = Math.max(1, Math.floor(derived[statKey] * stageMultiplier(stages[statKey] || 0)));

  // Status: Burn halves PHYSICAL Attack (unless Guts ignores it)
  const abl = A(p);
  const ignoreBurn = !!abl?.ignoreBurnHalving;
  if (p.status === 'brn' && statKey === 'attack' && forMoveClass === 'physical' && !ignoreBurn) {
    val = Math.floor(val * 0.5);
  }
  // Status: Paralysis halves Speed
  if (p.status === 'par' && statKey === 'speed') {
    val = Math.max(1, Math.floor(val * 0.5));
  }

  // Ability-based offensive stat boost (e.g., Guts)
  if (abl?.offensiveStatBoost?.stat === statKey) {
    const needStatus = !!abl.offensiveStatBoost.requiresStatus;
    if (!needStatus || hasAnyStatus(p)) val = Math.floor(val * abl.offensiveStatBoost.multiplier);
  }

  // Item-based offensive stat boost (Choice items)
  const itm = I(p);
  if (itm?.offensiveStatBoost?.stat === statKey) {
    val = Math.floor(val * itm.offensiveStatBoost.multiplier);
  }

  return Math.max(1, val);
}

// ─────────────────────────────────────────────────────────────────────────────
// Damage Modifiers
// ─────────────────────────────────────────────────────────────────────────────

function stab(attacker: PokemonRuntime, move: MoveData): number {
  return attacker.types.includes(move.type || '') ? 1.5 : 1.0;
}

function typeEffectiveness(defender: PokemonRuntime, move: MoveData): number {
  const m = defender.matchups?.[move.type || ''];
  return m === 0 || m === 0.25 || m === 0.5 || m === 1 || m === 2 || m === 4 ? m : 1;
}

function weatherPowerMod(weather: WeatherType, moveType: string | undefined): number {
  if (!weather) return 1;
  if (weather === 'rain') {
    if (moveType === 'water') return 1.5;
    if (moveType === 'fire') return 0.5;
  } else if (weather === 'sun') {
    if (moveType === 'fire') return 1.5;
    if (moveType === 'water') return 0.5;
  }
  return 1;
}

/** Ability immunities (Levitate, Flash Fire, Water Absorb). */
function abilityImmunity(defender: PokemonRuntime, moveType: string | undefined, ctx?: BattleContext): boolean {
  const abl = A(defender);
  const immuneList = abl?.immunity?.types || [];
  if (moveType && immuneList.includes(moveType)) {
    if (typeof abl?.immunity?.onImmune === 'function') {
      abl.immunity.onImmune(defender, ctx);
    }
    return true;
  }
  return false;
}

/** Attacking ability multipliers (e.g., Flash Fire boost when flagged). */
function attackerAbilityDamageMod(attacker: PokemonRuntime, moveType: string | undefined): number {
  const abl = A(attacker);
  const rule = abl?.attackerTypeBoostIfFlag;
  if (rule && rule.type === moveType) {
    const flag = rule.flag;
    if (flag && attacker.volatile && attacker.volatile[flag]) return rule.multiplier || 1;
  }
  return 1;
}

/** Item multipliers that apply directly to damage (e.g., Life Orb). */
function itemDamageMod(attacker: PokemonRuntime): number {
  const itm = I(attacker);
  return itm?.damageMultiplier || 1;
}

/** Modern crit: 1.5×, seeded RNG if provided in ctx. */
function critMultiplier(ctx: CalcContext, _attacker: PokemonRuntime): number {
  const CRIT_MOD = 1.5;
  if (ctx?.critOverride) return ctx.critOverride(_attacker) ? CRIT_MOD : 1;
  const chance = ctx?.critChance ?? 1 / 24;
  const roll = ctx?.rng?.next ? ctx.rng.next() : Math.random();
  return roll < chance ? CRIT_MOD : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Base Damage Calculation
// ─────────────────────────────────────────────────────────────────────────────

function baseDamage(
  attacker: PokemonRuntime,
  defender: PokemonRuntime,
  move: MoveData,
  ctx: CalcContext = {}
): number {
  if (!move) return 0;

  // Ability-based immunities (some also trigger side effects like Flash Fire boost or Water Absorb heal)
  if (abilityImmunity(defender, move.type, ctx as BattleContext)) return 0;

  let perHit = 0;

  if (move.power && move.power > 0) {
    const atkKey = pickOffensiveStat(attacker, move);
    const defKey = pickDefensiveStat(defender, move);
    const Astat = effectiveStat(attacker, atkKey, { forMoveClass: move.class });
    const Dstat = effectiveStat(defender, defKey, { forMoveClass: move.class });

    const L = attacker.level;
    const P = move.power;

    // ((2L/5 + 2) * P * A / D) / 50 + 2
    const term = Math.floor((Math.floor((2 * L) / 5) + 2) * P * Astat / Math.max(1, Dstat));
    const raw = Math.floor(Math.floor(term / 50) + 2);

    const eff = typeEffectiveness(defender, move);
    if (eff === 0) return 0;

    const mod =
      stab(attacker, move) *
      weatherPowerMod(ctx.weather ?? null, move.type) *
      attackerAbilityDamageMod(attacker, move.type) *
      itemDamageMod(attacker) *
      eff *
      critMultiplier(ctx, attacker);

    perHit = Math.max(1, Math.floor(raw * mod));
  }

  const totals = computeTotalDamage(attacker, defender, move, perHit, ctx);
  return Math.max(0, totals.total);
}

// ─────────────────────────────────────────────────────────────────────────────
// After-Damage Hooks
// ─────────────────────────────────────────────────────────────────────────────

/** After-damage hooks (e.g., Life Orb recoil). */
function afterDealtDamage(
  attacker: PokemonRuntime,
  defender: PokemonRuntime,
  move: MoveData,
  dealt: number,
  ctx: CalcContext = {}
): void {
  const itm = I(attacker);
  if (itm?.afterDealDamage) itm.afterDealDamage(attacker, dealt, ctx as BattleContext);
  // Advanced post-hit layer: drain, recoil (meta/registry), flinch
  applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx);
}

/**
 * Simple damage calculation for basic calculator.
 * This is a pure function that doesn't require PokemonRuntime objects.
 */
function calcSimpleDamage(power: number, attack: number, defense: number, level: number): number {
  const term = Math.floor((Math.floor((2 * level) / 5) + 2) * power * attack / Math.max(1, defense));
  return Math.floor(Math.floor(term / 50) + 2);
}

export { baseDamage, effectiveStat, stab, typeEffectiveness, afterDealtDamage, calcSimpleDamage };
export default { baseDamage, effectiveStat, stab, typeEffectiveness, afterDealtDamage, calcSimpleDamage };
