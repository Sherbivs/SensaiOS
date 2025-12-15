import { stageMultiplier } from './stats.js';
import { ABILITIES, ITEMS } from './tables.js';
import { computeTotalDamage, applyAdvancedAfterDamage } from './effects.js';
/** Helpers to read ability/item config */
const A = (p) => (p?.ability ? ABILITIES[p.ability] : null);
const I = (p) => (p?.item ? ITEMS[p.item] : null);
function pickOffensiveStat(attacker, move) {
    return move.class === 'special' ? 'special-attack' : 'attack';
}
function pickDefensiveStat(defender, move) {
    return move.class === 'special' ? 'special-defense' : 'defense';
}
/** Is the mon currently statused with any major status? */
function hasAnyStatus(p) {
    return !!p.status;
}
/** Effective stat with stages, status, ability & item modifiers. */
function effectiveStat(p, statKey, opts = {}) {
    const forMoveClass = opts.forMoveClass || null;
    let val = Math.max(1, Math.floor(p.derived[statKey] * stageMultiplier(p.stages[statKey] || 0)));
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
        if (!needStatus || hasAnyStatus(p))
            val = Math.floor(val * abl.offensiveStatBoost.multiplier);
    }
    // Item-based offensive stat boost (Choice items)
    const itm = I(p);
    if (itm?.offensiveStatBoost?.stat === statKey) {
        val = Math.floor(val * itm.offensiveStatBoost.multiplier);
    }
    return Math.max(1, val);
}
function stab(attacker, move) {
    return attacker.types.includes(move.type) ? 1.5 : 1.0;
}
function typeEffectiveness(defender, move) {
    const m = defender.matchups?.[move.type];
    return m === 0 || m === 0.25 || m === 0.5 || m === 1 || m === 2 || m === 4 ? m : 1;
}
function weatherPowerMod(weather, moveType) {
    if (!weather)
        return 1;
    if (weather === 'rain') {
        if (moveType === 'water')
            return 1.5;
        if (moveType === 'fire')
            return 0.5;
    }
    else if (weather === 'sun') {
        if (moveType === 'fire')
            return 1.5;
        if (moveType === 'water')
            return 0.5;
    }
    return 1;
}
/** Ability immunities (Levitate, Flash Fire, Water Absorb). */
function abilityImmunity(defender, moveType, ctx) {
    const abl = A(defender);
    const immuneList = abl?.immunity?.types || [];
    if (immuneList.includes(moveType)) {
        if (typeof abl.immunity.onImmune === 'function') {
            abl.immunity.onImmune(defender, ctx);
        }
        return true;
    }
    return false;
}
/** Attacking ability multipliers (e.g., Flash Fire boost when flagged). */
function attackerAbilityDamageMod(attacker, moveType) {
    const abl = A(attacker);
    const rule = abl?.attackerTypeBoostIfFlag;
    if (rule && rule.type === moveType) {
        const flag = rule.flag;
        if (flag && attacker.volatile && attacker.volatile[flag])
            return rule.multiplier || 1;
    }
    return 1;
}
/** Item multipliers that apply directly to damage (e.g., Life Orb). */
function itemDamageMod(attacker) {
    const itm = I(attacker);
    return itm?.damageMultiplier || 1;
}
/** Modern crit: 1.5×, seeded RNG if provided in ctx. */
function critMultiplier(ctx, attacker) {
    const CRIT_MOD = 1.5;
    if (ctx?.critOverride)
        return ctx.critOverride(attacker) ? CRIT_MOD : 1;
    const chance = ctx?.critChance ?? 1 / 24;
    const roll = ctx?.rng?.next ? ctx.rng.next() : Math.random();
    return roll < chance ? CRIT_MOD : 1;
}
function baseDamage(attacker, defender, move, ctx = {}) {
    if (!move)
        return 0;
    // Ability-based immunities (some also trigger side effects like Flash Fire boost or Water Absorb heal)
    if (abilityImmunity(defender, move.type, ctx))
        return 0;
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
        if (eff === 0)
            return 0;
        const mod = stab(attacker, move) *
            weatherPowerMod(ctx.weather, move.type) *
            attackerAbilityDamageMod(attacker, move.type) *
            itemDamageMod(attacker) *
            eff *
            critMultiplier(ctx, attacker);
        perHit = Math.max(1, Math.floor(raw * mod));
    }
    const totals = computeTotalDamage(attacker, defender, move, perHit, ctx);
    return Math.max(0, totals.total);
}
/** After-damage hooks (e.g., Life Orb recoil). */
function afterDealtDamage(attacker, defender, move, dealt, ctx = {}) {
    const itm = I(attacker);
    if (itm?.afterDealDamage)
        itm.afterDealDamage(attacker, dealt, ctx);
    // Advanced post-hit layer: drain, recoil (meta/registry), flinch
    applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx);
}
export { baseDamage, effectiveStat, stab, typeEffectiveness, afterDealtDamage };
export default { baseDamage, effectiveStat, stab, typeEffectiveness, afterDealtDamage };
