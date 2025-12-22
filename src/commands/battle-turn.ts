/**
 * /battle-turn Command
 * 
 * Resolve one battle turn for your session (A vs B).
 * 
 * @module commands/battle-turn
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { Command } from './types.js';
import { getLogger } from '../shared/logging/index.js';
import * as dexApi from '../lib/dex-api.js';

const logger = getLogger();
import { makeRNG } from '../engine/rng.js';
import engine from '../engine/index.js';
import { engineWriteBuffer } from '../services/cache/engine-write-buffer.js';

// Extract from dex API with type casting
const typedDexApi = dexApi as unknown as {
  default: {
    getPokemon: (query: string | number) => unknown;
    disabled: boolean;
    moves: Record<string, unknown>;
  };
};
const { getPokemon, disabled, moves: dexMoves } = typedDexApi.default;

// Extract engine functions
const typedEngine = engine as unknown as {
  makeRuntimeFromDexEntry: (entry: unknown, level: number, moves: unknown[]) => RuntimeMon;
  newBattleState: (a: RuntimeMon, b: RuntimeMon) => BattleState;
  newAction: (side: string, move: string) => BattleAction;
  resolveTurn: (state: BattleState, a: BattleAction, b: BattleAction, ctx: BattleContext) => BattleResult;
};
const { makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = typedEngine;

/** Runtime monster state */
interface RuntimeMon {
  id?: number;
  name: string;
  hp: number;
  maxHp: number;
  types?: string[];
  status?: string;
}

/** Battle state */
interface BattleState {
  a: RuntimeMon;
  b: RuntimeMon;
  turn: number;
}

/** Battle action */
interface BattleAction {
  side: string;
  move: string;
}

/** Battle context with RNG and logging */
interface BattleContext {
  rng: { next: () => number };
  log: string[];
  publicLog: string[];
  allowFlinchSkip: boolean;
  movesIndex: Record<string, unknown>;
}

/** Battle result */
interface BattleResult {
  log: string[];
}

/** Battle session */
interface BattleSession {
  state: BattleState;
}

declare global {
  // Declared in src/index.ts - indicates Engine DB is initialized
   
  var engineReady: boolean;
}

const TYPE_EMOJIS: Record<string, string> = {
  normal: '⚪', fire: '🔥', water: '💧', electric: '⚡', grass: '🌿', ice: '❄️',
  fighting: '🥊', poison: '☠️', ground: '🌎', flying: '🪽', psychic: '🔮', bug: '🐛',
  rock: '🪨', ghost: '👻', dragon: '🐉', dark: '🌑', steel: '⚙️', fairy: '✨'
};

const STATUS_LABELS: Record<string, string> = {
  brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ'
};

/**
 * Format a monster's summary line for battle display
 */
function formatSummaryLine(mon: RuntimeMon | null): string {
  if (!mon) return '';
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
const SESSIONS = new Map<string, BattleSession>();

/**
 * Ensure a battle state exists for the user, creating default if needed
 */
function ensureBattleState(userId: string): BattleSession | null {
  let session = SESSIONS.get(userId);
  if (session) return session;

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
  session = { state };
  SESSIONS.set(userId, session);
  return session;
}

interface CommandOptions {
  getString: (name: string) => string | null;
}

/**
 * Parse battle actions from interaction options
 */
function parseActions(options: CommandOptions): { a: BattleAction; b: BattleAction } {
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

const command: Command = {
  data,
  cooldownMs: 2000,
  async execute(interaction: ChatInputCommandInteraction) {
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
    const ctx: BattleContext = {
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
        
      } catch (error) {
        const err = error as Error;
        if (err.message && err.message.includes('Backpressure active')) {
          logger.warn('BattleTurn', 'execute', 'Engine Write Buffer backpressure active - skipping battle log');
        } else {
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
      if (battleLog.length) battleLog.push('');
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
    const extras: Array<{ type: string; payload: string }> = [];
    if (state.a.hp <= 0 || state.b.hp <= 0) {
      const fainted = state.a.hp <= 0 ? state.a.name : state.b.name;
      extras.push({ type: 'content', payload: `💀 ${fainted} fainted!` });
      SESSIONS.delete(userId);
    }

    try {
      await interaction.reply({ embeds: [embed] });
      for (const x of extras) {
        if (x.type === 'content') await interaction.followUp({ content: x.payload });
      }
    } catch (err) {
      logger.error('BattleTurn', 'execute', 'Battle log send failed', { metadata: { error: err as Error } });
      const text = `Battle Log\n${state.a.name} ${state.a.hp}/${state.a.maxHp} vs ${state.b.name} ${state.b.hp}/${state.b.maxHp}\n${description}`;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: text });
      } else {
        await interaction.reply({ content: text });
      }
    }
  },
};

export const { cooldownMs, execute } = command;
export { data };
export default command;
