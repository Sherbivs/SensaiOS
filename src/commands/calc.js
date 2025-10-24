'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { baseDamage } = require('../engine/calc');
const { derivedStats } = require('../engine/stats');
const { getPokemon, getMove, disabled } = require('../lib/dex-api');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('calc')
    .setDescription('Preview damage: attacker uses move on defender (level 50)')
    .addStringOption((o) => o.setName('attacker').setDescription('Pokémon').setRequired(true))
    .addStringOption((o) => o.setName('move').setDescription('Move name').setRequired(true))
    .addStringOption((o) => o.setName('defender').setDescription('Pokémon').setRequired(true))
    .setDMPermission(false),
  cooldownMs: 1500,
  async execute(interaction) {
    if (disabled) return interaction.reply({ content: 'Dex data is not available on this deployment.', ephemeral: true });

    const attackerName = interaction.options.getString('attacker');
    const defenderName = interaction.options.getString('defender');
    const moveName = interaction.options.getString('move');

    const A = /^\d+$/.test(attackerName) ? getPokemon(Number(attackerName)) : getPokemon(attackerName);
    const D = /^\d+$/.test(defenderName) ? getPokemon(Number(defenderName)) : getPokemon(defenderName);
    const mv = getMove(moveName);

    if (!A || !D || !mv) {
      return interaction.reply({ content: 'Unknown attacker, defender, or move.', ephemeral: true });
    }

    const ar = { name: A.name, level: 50, types: A.types, derived: derivedStats(A.stats, 50), stages: {}, matchups: A.matchups };
    const dr = { name: D.name, level: 50, types: D.types, derived: derivedStats(D.stats, 50), stages: {}, matchups: D.matchups };

    const dmg = baseDamage(ar, dr, mv);
    const hp = Math.max(1, dr.derived.hp);
    const pct = ((dmg / hp) * 100).toFixed(1);

    return interaction.reply(`${A.name} uses ${mv.name} on ${D.name} → ${dmg} dmg (~${pct}% of HP)`);
  }
};
