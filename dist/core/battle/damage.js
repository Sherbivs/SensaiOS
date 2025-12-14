// Thin TS wrapper around src/engine/calc.js to expose damage helpers
// Legacy CommonJS module without TypeScript definitions
import calc from "../../engine/calc.js";
const damageCalc = calc;
export function stab(attacker, move) {
    return damageCalc.stab(attacker, move);
}
export function typeEffectiveness(defender, move) {
    return damageCalc.typeEffectiveness(defender, move);
}
export function effectiveStat(pokemon, key, options = {}) {
    return damageCalc.effectiveStat(pokemon, key, options);
}
