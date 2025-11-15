// Thin TS wrapper around src/engine/calc.js to expose damage helpers

// Legacy CommonJS module without TypeScript definitions
import calc from "../../engine/calc.js";

type DamageCalculator = {
  stab(attacker: unknown, move: unknown): number;
  typeEffectiveness(defender: unknown, move: unknown): number;
  effectiveStat(pokemon: unknown, key: string, options?: unknown): number;
};

const damageCalc = calc as DamageCalculator;

export function stab(attacker: unknown, move: unknown): number {
  return damageCalc.stab(attacker, move);
}

export function typeEffectiveness(defender: unknown, move: unknown): number {
  return damageCalc.typeEffectiveness(defender, move);
}

export function effectiveStat(pokemon: unknown, key: string, options: unknown = {}): number {
  return damageCalc.effectiveStat(pokemon, key, options);
}
