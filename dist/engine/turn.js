/**
 * Battle turn resolution engine
 * Resolves one simultaneous turn with two chosen actions.
 * Ordering: higher move priority, then effective speed, then coinflip.
 */
import { baseDamage, effectiveStat, afterDealtDamage } from './calc.js';
import { checkAccuracy, applySecondaryEffects } from './effects.js';
// ─────────────────────────────────────────────────────────────────────────────
// Turn Resolution
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Resolves one simultaneous turn with two chosen actions.
 * Ordering: higher move priority, then effective speed, then coinflip.
 * Returns nextState and a tiny log for debugging/UX.
 */
function resolveTurn(state, actionA, actionB, ctx) {
    const { movesIndex } = ctx;
    const a = state.a;
    const b = state.b;
    function moveOf(action) {
        const key = String(action.move || '').toLowerCase();
        const mv = movesIndex[key] || movesIndex[action.move] || null;
        return mv || null;
    }
    function priorityOf(mv) {
        if (!mv)
            return 0;
        return mv.priority || 0;
    }
    function effectiveSpeed(p) {
        // use effectiveStat to include status effects like paralysis
        return effectiveStat(p, 'speed');
    }
    // Prepare logs
    const log = [];
    const ctxWithLog = { ...ctx, log };
    const publicLog = ctx.publicLog || [];
    // --- Flinch enforcement (public + internal logging) ---
    function handleFlinch(combatant, key) {
        if (ctx.allowFlinchSkip !== false && combatant?.volatile?.flinched) {
            const msg = `⚡ ${combatant.name} flinched and couldn't move!`;
            log.push(msg);
            try {
                publicLog.push(msg);
            }
            catch { /* ignore */ }
            combatant.volatile.flinched = false;
            // Set to no-op to keep resolution safe
            if (key === 'a')
                actionA = { who: 'a', move: '' };
            else if (key === 'b')
                actionB = { who: 'b', move: '' };
        }
    }
    handleFlinch(a, 'a');
    handleFlinch(b, 'b');
    // Decide order
    const mvA = moveOf(actionA);
    const mvB = moveOf(actionB);
    const pa = priorityOf(mvA);
    const pb = priorityOf(mvB);
    let order = [['a', mvA, actionA], ['b', mvB, actionB]];
    function swap() {
        order = [order[1], order[0]];
    }
    if (pa !== pb) {
        if (pb > pa)
            swap();
    }
    else {
        const sa = effectiveSpeed(a);
        const sb = effectiveSpeed(b);
        if (sb > sa)
            swap();
        else if (sb === sa) {
            // deterministic coinflip by names to keep tests stable
            if (String(b.name).localeCompare(String(a.name)) < 0)
                swap();
        }
    }
    function apply(attackerKey, mv) {
        const attacker = attackerKey === 'a' ? a : b;
        const defender = attackerKey === 'a' ? b : a;
        if (!mv || attacker.hp <= 0) {
            log.push(`${attacker.name} does nothing.`);
            return;
        }
        // Accuracy gate
        const hit = checkAccuracy(attacker, defender, mv, ctxWithLog);
        if (!hit.ok) {
            log.push(`${attacker.name}'s ${mv.name} missed${hit.reason ? ' (' + hit.reason + ')' : ''}.`);
            return;
        }
        const dmg = baseDamage(attacker, defender, mv, ctxWithLog);
        const before = defender.hp;
        defender.hp = Math.max(0, defender.hp - dmg);
        log.push(`${attacker.name} uses ${mv.name} -> ${defender.name} takes ${dmg} (${before}→${defender.hp})`);
        afterDealtDamage(attacker, defender, mv, dmg, ctxWithLog);
        // Apply secondary effects after a successful hit
        applySecondaryEffects(attacker, defender, mv, ctxWithLog);
    }
    for (const [who, mv] of order) {
        if (state.a.hp <= 0 || state.b.hp <= 0)
            break; // someone fainted earlier in the turn
        apply(who, mv);
    }
    // Advance turn counter
    state.turn += 1;
    // Expose the mutated state on the battle container for legacy helpers/tests
    state.state = state;
    return { state, log };
}
export { resolveTurn };
