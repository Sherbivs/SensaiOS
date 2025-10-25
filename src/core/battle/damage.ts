// Thin TS wrapper around src/engine/calc.js to expose damage helpers
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import calc from '../../engine/calc.js';

export function computeDamage(attacker: any, defender: any, move: any, ctx: any = {}): number {
  return (calc as any).baseDamage(attacker, defender, move, ctx);
}

export function stab(attacker: any, move: any): number {
  return (calc as any).stab(attacker, move);
}

export function typeEffectiveness(defender: any, move: any): number {
  return (calc as any).typeEffectiveness(defender, move);
}

export function effectiveStat(p: any, key: string, opts: any = {}): number {
  return (calc as any).effectiveStat(p, key, opts);
}
