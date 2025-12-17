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
import fs from 'node:fs';
import path from 'node:path';
// ─────────────────────────────────────────────────────────────────────────────
// Local Effect Loading
// ─────────────────────────────────────────────────────────────────────────────
let LOCAL_EFFECTS = {};
const LOCAL_PATH = path.join(process.cwd(), 'data', 'effects.json');
if (fs.existsSync(LOCAL_PATH)) {
    try {
        LOCAL_EFFECTS = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
    }
    catch { /* ignore */ }
}
// ─────────────────────────────────────────────────────────────────────────────
// Runtime-extensible declarative rules
// ─────────────────────────────────────────────────────────────────────────────
const EFFECT_RULES = {
    // Fixed-damage classics:
    'dragon-rage': { fixedDamage: { value: 40 } },
    'sonic-boom': { fixedDamage: { value: 20 } },
    'night-shade': { fixedDamage: { levelBased: true } },
    'seismic-toss': { fixedDamage: { levelBased: true } },
};
function normaliseRuleKey(name) {
    const key = String(name || '').toLowerCase();
    const dashed = key.replace(/\s+/g, '-');
    return { key, dashed };
}
function registerEffectRule(name, rule) {
    const { key, dashed } = normaliseRuleKey(name);
    const value = rule || {};
    EFFECT_RULES[key] = value;
    EFFECT_RULES[dashed] = value;
}
// ─────────────────────────────────────────────────────────────────────────────
// RNG Utilities
// ─────────────────────────────────────────────────────────────────────────────
function rand(ctx) {
    return ctx?.rng?.next ? ctx.rng.next() : Math.random();
}
function pct(probPct, ctx) {
    if (probPct == null)
        return true;
    const p = Math.max(0, Math.min(100, Number(probPct)));
    return rand(ctx) < (p / 100);
}
// ─────────────────────────────────────────────────────────────────────────────
// Accuracy Check
// ─────────────────────────────────────────────────────────────────────────────
function checkAccuracy(_attacker, _defender, move, ctx = {}) {
    // If move has no accuracy listed (e.g., Swift) -> always hit in this skeleton
    if (move.accuracy == null)
        return { ok: true };
    const acc = Number(move.accuracy);
    if (!Number.isFinite(acc) || acc <= 0)
        return { ok: false, reason: 'invalid-accuracy' };
    // Future: accuracy/evasion stages; bright powder; etc.
    const roll = rand(ctx);
    const hit = roll < (acc / 100);
    return { ok: hit, reason: hit ? undefined : `roll=${roll.toFixed(3)}>acc=${(acc / 100).toFixed(3)}` };
}
// ─────────────────────────────────────────────────────────────────────────────
// Status Application
// ─────────────────────────────────────────────────────────────────────────────
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
    const key = String(move?.name || '').toLowerCase();
    const normalized = key.replace(/\s+/g, '-');
    const hasMeta = !!move?.meta;
    const hasLocal = !!(LOCAL_EFFECTS?.[key] || LOCAL_EFFECTS?.[normalized]);
    if (pref === 'pokeapi')
        return hasMeta ? 'pokeapi' : null;
    if (pref === 'local')
        return hasLocal ? 'local' : null;
    // auto:
    if (hasMeta)
        return 'pokeapi';
    if (hasLocal)
        return 'local';
    return null;
}
function applySecondaryEffects(_attacker, defender, move, ctx = {}) {
    const src = pickEffectSource(move, ctx);
    if (!src)
        return; // no known configured effects
    if (src === 'pokeapi') {
        const meta = move.meta || {};
        const ailmentRaw = meta.ailment;
        const ailment = typeof ailmentRaw === 'object' && ailmentRaw !== null ? ailmentRaw.name : ailmentRaw;
        const chance = meta.ailment_chance ?? move.effect_chance ?? null;
        const status = (ailment && AILMENT_TO_STATUS[ailment]) || null;
        if (!status || !chance)
            return;
        // Do not overwrite a major status if target is already statused
        if (defender.status)
            return;
        if (pct(chance, ctx)) {
            defender.status = status;
            ctx.log?.push?.(`${defender.name} is ${status.toUpperCase()}!`);
        }
        return;
    }
    if (src === 'local') {
        const key = String(move.name || '').toLowerCase();
        const normalized = key.replace(/\s+/g, '-');
        const rule = LOCAL_EFFECTS[key] || LOCAL_EFFECTS[normalized];
        if (!rule)
            return;
        const rules = Array.isArray(rule) ? rule : [rule];
        for (const r of rules) {
            const status = String(r.status || '').toLowerCase();
            const chance = r.chance ?? null;
            if (!status)
                continue;
            if (defender.status)
                continue;
            if (pct(chance, ctx)) {
                defender.status = status;
                ctx.log?.push?.(`${defender.name} is ${status.toUpperCase()}!`);
                break;
            }
        }
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Advanced Effects
// ─────────────────────────────────────────────────────────────────────────────
/**
 * computeTotalDamage: wraps a single-hit damage number (perHitDamage) and:
 *  - applies fixed-damage overrides (Dragon Rage, Night Shade, Seismic Toss)
 *  - aggregates multi-hit (min_hits/max_hits from PokéAPI meta or EFFECT_RULES)
 */
function computeTotalDamage(attacker, _defender, move, perHitDamage, ctx = {}) {
    const { key, dashed } = normaliseRuleKey(move?.name);
    const rule = EFFECT_RULES[key] || EFFECT_RULES[dashed] || {};
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
        const table = rule.multiHit?.chanceTable || null;
        if (table && Array.isArray(table) && table.length === (maxH - minH + 1)) {
            const r = rand(ctx);
            let acc = 0, chosen = minH;
            for (let i = 0; i < table.length; i++) {
                acc += table[i];
                if (r < acc) {
                    chosen = minH + i;
                    break;
                }
            }
            hits = chosen;
        }
        else {
            const r = rand(ctx);
            hits = minH + Math.floor(r * (maxH - minH + 1));
        }
    }
    else if (rule.multiHit?.min && rule.multiHit?.max && rule.multiHit.max >= rule.multiHit.min) {
        const { min, max, chanceTable } = rule.multiHit;
        if (chanceTable && Array.isArray(chanceTable) && chanceTable.length === (max - min + 1)) {
            const r = rand(ctx);
            let acc = 0, chosen = min;
            for (let i = 0; i < chanceTable.length; i++) {
                acc += chanceTable[i];
                if (r < acc) {
                    chosen = min + i;
                    break;
                }
            }
            hits = chosen;
        }
        else {
            const r = rand(ctx);
            hits = min + Math.floor(r * (max - min + 1));
        }
    }
    // Aggregate hits
    hits = Math.max(1, Math.min(10, Math.floor(hits)));
    const perHit = new Array(hits).fill(Math.max(0, perHitDamage));
    const total = perHit.reduce((a, b) => a + b, 0);
    return { total, hits, perHit, fixed: false };
}
/**
 * applyAdvancedAfterDamage:
 *  - Drain: heal attacker for a percent of damage dealt
 *  - Recoil: damage attacker for a percent of damage dealt
 *  - Flinch: set defender.volatile.flinched based on chance
 */
function applyAdvancedAfterDamage(attacker, defender, move, dealt, ctx = {}) {
    const { key, dashed } = normaliseRuleKey(move?.name);
    const rule = EFFECT_RULES[key] || EFFECT_RULES[dashed] || {};
    const meta = move.meta || {};
    const log = ctx.log || [];
    // 1) Drain
    let drainPct = null;
    if (typeof meta.drain === 'number' && meta.drain > 0)
        drainPct = meta.drain;
    if (rule.drain?.percent != null)
        drainPct = rule.drain.percent;
    if (drainPct) {
        const heal = Math.max(1, Math.floor((dealt * drainPct) / 100));
        const before = attacker.hp;
        attacker.hp = Math.min(attacker.maxHp + heal, attacker.hp + heal);
        if (attacker.hp > before)
            log.push(`${attacker.name} restored ${attacker.hp - before} HP (drain).`);
    }
    // 2) Recoil
    let recoilPct = null;
    if (typeof meta.recoil === 'number' && meta.recoil > 0)
        recoilPct = meta.recoil;
    if (rule.recoil?.percent != null)
        recoilPct = rule.recoil.percent;
    if (recoilPct) {
        const recoil = Math.max(1, Math.floor((dealt * recoilPct) / 100));
        attacker.hp = Math.max(0, attacker.hp - recoil);
        log.push(`${attacker.name} is hurt by recoil (${recoil}).`);
    }
    // 3) Flinch
    let flinchChance = null;
    if (typeof meta.flinch_chance === 'number' && meta.flinch_chance > 0)
        flinchChance = meta.flinch_chance;
    if (rule.flinch?.chance != null)
        flinchChance = rule.flinch.chance;
    if (flinchChance && pct(flinchChance, ctx)) {
        defender.volatile = defender.volatile || {};
        defender.volatile.flinched = true;
        log.push(`${defender.name} flinched!`);
    }
}
export { checkAccuracy, applySecondaryEffects, computeTotalDamage, applyAdvancedAfterDamage, registerEffectRule, EFFECT_RULES };
