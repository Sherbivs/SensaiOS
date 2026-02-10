/**
 * /battle-turn Command
 *
 * Resolve one battle turn for your session (A vs B).
 *
 * @module commands/battle-turn
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../shared/logging/index.js';
const logger = getLogger();
import { SlashCommandBuilder } from 'discord.js';
import * as dexApi from '../lib/dex-api.js';
import { makeRNG } from '../engine/rng.js';
import engine from '../engine/index.js';
import { engineWriteBuffer } from '../services/cache/engine-write-buffer.js';
// Extract from dex API with type casting
const typedDexApi = dexApi;
const { getPokemon, disabled, moves: dexMoves } = typedDexApi.default;
// Extract engine functions
const typedEngine = engine;
const { makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = typedEngine;
const TYPE_EMOJIS = {
    normal: '⚪', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿', ice: '❄️',
    fighting: '🥊', poison: '☠️', ground: '🌎', flying: '🪽', psychic: '🔮', bug: '🐛',
    rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑', steel: '⚙️', fairy: '✨'
};
const STATUS_LABELS = {
    brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ'
};
/**
 * Format a monster's summary line for battle display
 */
function formatSummaryLine(mon) {
    if (!mon)
        return '';
    const hpText = `${Math.max(0, mon.hp)}/${mon.maxHp}`;
    const typeIcons = Array.isArray(mon.types)
        ? mon.types.map((t) => TYPE_EMOJIS[String(t).toLowerCase()] || null).filter(Boolean)
        : [];
    const typePart = typeIcons.length ? ` ${typeIcons.join(' ')}` : '';
    const statusKey = mon.status ? String(mon.status).toLowerCase() : '';
    const statusPart = `[${STATUS_LABELS[statusKey] || 'OK'}]`;
    return `${mon.name} ${hpText} HP${typePart} ${statusPart}`;
}
// In-memory battle sessions keyed by user id
const SESSIONS = new Map();
let totalSessions = 0;
let cleanedSessions = 0;
/** 10-minute inactivity timeout for battle sessions. */
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
/** Cleanup interval for stale sessions (every 60 seconds). */
const CLEANUP_INTERVAL_MS = 60 * 1000;
let cleanupInterval = null;
function cleanupStaleSessions(now = Date.now()) {
    let cleaned = 0;
    for (const [userId, session] of SESSIONS.entries()) {
        if (now - session.lastActivity > SESSION_TIMEOUT_MS) {
            SESSIONS.delete(userId);
            cleaned += 1;
        }
    }
    if (cleaned > 0) {
        cleanedSessions += cleaned;
    }
    return cleaned;
}
function startCleanupInterval() {
    if (cleanupInterval)
        return;
    cleanupInterval = setInterval(() => {
        const cleaned = cleanupStaleSessions();
        if (cleaned > 0) {
            logger.info('BattleTurn', 'cleanup', `Removed ${cleaned} stale session(s)`);
        }
    }, CLEANUP_INTERVAL_MS);
}
function stopCleanupInterval() {
    if (!cleanupInterval)
        return;
    clearInterval(cleanupInterval);
    cleanupInterval = null;
}
process.on('SIGTERM', () => {
    stopCleanupInterval();
});
startCleanupInterval();
/**
 * Ensure a battle state exists for the user, creating default if needed
 */
function ensureBattleState(userId) {
    let session = SESSIONS.get(userId);
    if (session) {
        session.lastActivity = Date.now();
        return session;
    }
    // Initialize a simple default matchup if none exists
    const aDex = getPokemon('charizard') || getPokemon(6);
    const bDex = getPokemon('venusaur') || getPokemon(3);
    if (!aDex || !bDex) {
        // Defer creation until dex is available
        return null;
    }
    const a = makeRuntimeFromDexEntry(aDex, 50, []);
    const b = makeRuntimeFromDexEntry(bDex, 50, []);
    const state = newBattleState(a, b);
    session = { state, lastActivity: Date.now() };
    totalSessions += 1;
    SESSIONS.set(userId, session);
    return session;
}
/**
 * Get session metrics for observability.
 */
export function getSessionMetrics() {
    return {
        active: SESSIONS.size,
        cleaned: cleanedSessions,
        total: totalSessions,
    };
}
/**
 * Parse battle actions from interaction options
 */
function parseActions(options) {
    const aMove = options.getString('a_move') || 'tackle';
    const bMove = options.getString('b_move') || 'tackle';
    return { a: newAction('a', aMove), b: newAction('b', bMove) };
}
const data = new SlashCommandBuilder()
    .setName('battle-turn')
    .setDescription('Resolve one battle turn for your session (A vs B).')
    .addStringOption((o) => o.setName('a_move').setDescription('Move for side A').setRequired(true))
    .addStringOption((o) => o.setName('b_move').setDescription('Move for side B').setRequired(true))
    .setDMPermission(false);
const command = {
    data,
    cooldownMs: 2000,
    async execute(interaction) {
        if (disabled) {
            await interaction.reply({ content: 'Dex data is not available on this deployment.', ephemeral: true });
            return;
        }
        const userId = interaction.user.id;
        const session = ensureBattleState(userId);
        if (!session) {
            await interaction.reply({ content: 'Battle data not available yet. Try again after snapshots are seeded.', ephemeral: true });
            return;
        }
        const { state } = session;
        const actions = parseActions(interaction.options);
        // Resolve turn with public and developer logs enabled
        const ctx = {
            rng: makeRNG(Date.now() >>> 0),
            log: [],
            publicLog: [],
            allowFlinchSkip: true,
            movesIndex: dexMoves,
        };
        const result = resolveTurn(state, actions.a, actions.b, ctx);
        // ============================================================================
        // ENGINE WRITE BUFFER INTEGRATION (Phase 17-22)
        // ============================================================================
        //
        // Log battle turn outcomes to Write Buffer (synchronous, <10μs).
        // Data flows: Write Buffer → (30s flush) → Write-DB → (10min validation) → PROD
        //
        if (global.engineReady && engineWriteBuffer) {
            try {
                const battleId = `${userId}_${Date.now()}`;
                // Log move usage for side A
                if (actions.a && actions.a.move) {
                    engineWriteBuffer.logMoveUsage({
                        battleId,
                        trainerId: userId,
                        pokemonId: state.a.id || 0,
                        moveId: 0,
                        targetPokemonId: state.b.id || 0,
                        damage: (state.b.maxHp - state.b.hp) || 0,
                        effectiveness: 1.0,
                        isCritical: false,
                        timestamp: new Date()
                    });
                }
                // Log move usage for side B
                if (actions.b && actions.b.move) {
                    engineWriteBuffer.logMoveUsage({
                        battleId,
                        trainerId: 'ai_opponent',
                        pokemonId: state.b.id || 0,
                        moveId: 0,
                        targetPokemonId: state.a.id || 0,
                        damage: (state.a.maxHp - state.a.hp) || 0,
                        effectiveness: 1.0,
                        isCritical: false,
                        timestamp: new Date()
                    });
                }
                // Log battle completion when KO occurs
                if (state.a.hp <= 0 || state.b.hp <= 0) {
                    const winnerId = state.a.hp > 0 ? userId : 'ai_opponent';
                    engineWriteBuffer.logBattle({
                        battleId,
                        trainerId1: userId,
                        trainerId2: 'ai_opponent',
                        winnerId,
                        durationMs: (state.turn - 1) * 1000,
                        turnCount: state.turn - 1,
                        timestamp: new Date()
                    });
                }
            }
            catch (error) {
                const err = error;
                if (err.message && err.message.includes('Backpressure active')) {
                    logger.warn('BattleTurn', 'execute', 'Engine Write Buffer backpressure active - skipping battle log');
                }
                else {
                    logger.error('BattleTurn', 'execute', 'Engine Write Buffer logging failed', { metadata: { error: err } });
                }
            }
        }
        // Public battle log broadcasting with HP/status summaries appended
        const battleLog = ctx.publicLog && ctx.publicLog.length > 0
            ? ctx.publicLog.slice()
            : result.log.slice();
        const summaryLines = [state.a, state.b]
            .filter(Boolean)
            .map(formatSummaryLine)
            .filter(Boolean);
        if (summaryLines.length) {
            if (battleLog.length)
                battleLog.push('');
            battleLog.push(...summaryLines);
        }
        const description = battleLog.join('\n');
        const embed = {
            title: 'Battle Log',
            description,
            color: 0xE0A000,
            footer: { text: `Turn ${state.turn - 1} completed • ${new Date().toLocaleTimeString()}` }
        };
        // If the session reaches a KO, append a faint message and reset the session
        const extras = [];
        if (state.a.hp <= 0 || state.b.hp <= 0) {
            const fainted = state.a.hp <= 0 ? state.a.name : state.b.name;
            extras.push({ type: 'content', payload: `💀 ${fainted} fainted!` });
            SESSIONS.delete(userId);
        }
        try {
            await interaction.reply({ embeds: [embed] });
            for (const x of extras) {
                if (x.type === 'content')
                    await interaction.followUp({ content: x.payload });
            }
        }
        catch (err) {
            logger.error('BattleTurn', 'execute', 'Battle log send failed', { metadata: { error: err } });
            const text = `Battle Log\n${state.a.name} ${state.a.hp}/${state.a.maxHp} vs ${state.b.name} ${state.b.hp}/${state.b.maxHp}\n${description}`;
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: text });
            }
            else {
                await interaction.reply({ content: text });
            }
        }
    },
};
// Testing utilities - avoid in production code paths
export const __testing = {
    reset() {
        SESSIONS.clear();
        totalSessions = 0;
        cleanedSessions = 0;
    },
    ensureBattleState,
    getSession: (userId) => SESSIONS.get(userId) ?? null,
    setSession: (userId, session) => {
        SESSIONS.set(userId, session);
    },
    cleanupStaleSessions,
    startCleanupInterval,
    stopCleanupInterval,
    getCleanupInterval: () => cleanupInterval,
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
