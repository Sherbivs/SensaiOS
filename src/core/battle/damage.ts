// Thin TS wrapper around src/engine/calc.js to expose damage helpers

// @ts-ignore — legacy JS module without types
import calc from "../../engine/calc.js";

type DamageCalculator = {
  baseDamage(attacker: unknown, defender: unknown, move: unknown, ctx?: unknown): number;
  stab(attacker: unknown, move: unknown): number;
  typeEffectiveness(defender: unknown, move: unknown): number;
  effectiveStat(pokemon: unknown, key: string, options?: unknown): number;
};

const damageCalc = calc as DamageCalculator;

export function computeDamage(
  attacker: unknown,
  defender: unknown,
  move: unknown,
  ctx: unknown = {}
): number {
  return damageCalc.baseDamage(attacker, defender, move, ctx);
}

export function stab(attacker: unknown, move: unknown): number {
  return damageCalc.stab(attacker, move);
}

export function typeEffectiveness(defender: unknown, move: unknown): number {
  return damageCalc.typeEffectiveness(defender, move);
}

export function effectiveStat(pokemon: unknown, key: string, options: unknown = {}): number {
  return damageCalc.effectiveStat(pokemon, key, options);
}
