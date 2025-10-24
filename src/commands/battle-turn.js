'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { getPokemon, getMove, disabled } = require('../lib/dex-api');
const { makeRNG } = require('../engine/rng');
const { makeRuntimeFromDexEntry, newBattleState, newAction, resolveTurn } = require('../engine');

// In-memory battle sessions keyed by user id
const SESSIONS = new Map();

function ensureBattleState(userId) {
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

function parseActions(options) {
  const aMove = options.getString('a_move') || 'tackle';
  const bMove = options.getString('b_move') || 'tackle';
  return { a: newAction('a', aMove), b: newAction('b', bMove) };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle-turn')
    .setDescription('Resolve one battle turn for your session (A vs B).')
    .addStringOption((o) => o.setName('a_move').setDescription('Move for side A').setRequired(true))
    .addStringOption((o) => o.setName('b_move').setDescription('Move for side B').setRequired(true))
    .setDMPermission(false),
  cooldownMs: 2000,
  async execute(interaction) {
    if (disabled) {
      return interaction.reply({ content: 'Dex data is not available on this deployment.', ephemeral: true });
    }

    const userId = interaction.user.id;
    const session = ensureBattleState(userId);
    if (!session) {
      return interaction.reply({ content: 'Battle data not available yet. Try again after snapshots are seeded.', ephemeral: true });
    }

    const { state } = session;
    const actions = parseActions(interaction.options);

    // Resolve turn with public and developer logs enabled
    const ctx = {
      rng: makeRNG(Date.now() >>> 0),
      log: [],
      publicLog: [],
      allowFlinchSkip: true,
      movesIndex: require('../lib/dex-api').moves, // object map: name -> move
    };

    const result = resolveTurn(state, actions.a, actions.b, ctx);

    // Build a concise title showing HP/status
    const title = `${state.a.name} ${state.a.hp}/${state.a.maxHp} vs ${state.b.name} ${state.b.hp}/${state.b.maxHp}`;

    // Public battle log broadcasting
    const description = ctx.publicLog && ctx.publicLog.length > 0
      ? ctx.publicLog.join('\n')
      : result.log.join('\n');

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
      // Optionally clear the session
      SESSIONS.delete(userId);
    }

    try {
      await interaction.reply({ embeds: [embed] });
      for (const x of extras) {
        if (x.type === 'content') await interaction.followUp({ content: x.payload });
      }
    } catch (err) {
      console.error('Battle log send failed:', err);
      // Fallback to plain text
      const text = `Battle Log\n${title}\n${description}`;
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: text });
      } else {
        await interaction.reply({ content: text });
      }
    }
  }
};
