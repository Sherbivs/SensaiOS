'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { getMove, moves, disabled } = require('../lib/dex-api');
const TYPE_COLORS = require('../lib/type-colors');

const MOVE_LIST = Object.keys(moves || {}).sort();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('move')
    .setDescription('Show move details')
    .addStringOption((o) => o.setName('name').setDescription('Move name').setRequired(true))
    .setDMPermission(false),
  async autocomplete(interaction) {
    if (disabled) return interaction.respond([]);
    const focused = String(interaction.options.getFocused() || '').toLowerCase();
    const picks = MOVE_LIST.filter((n) => n.toLowerCase().startsWith(focused) || n.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((n) => ({ name: n, value: n }));
    await interaction.respond(picks);
  },
  async execute(interaction) {
    if (disabled) {
      return interaction.reply({ content: 'Move data is not available on this deployment.', ephemeral: true });
    }
    const q = interaction.options.getString('name');
    const m = getMove(q);
    if (!m) return interaction.reply({ content: 'Move not found.', ephemeral: true });

    const t = String(m.type || '').toLowerCase();
    const color = TYPE_COLORS[t] ?? 0x2f3136;

    return interaction.reply({
      embeds: [
        {
          title: m.name,
          color,
          fields: [
            { name: 'Type', value: m.type || '—', inline: true },
            { name: 'Class', value: m.class || m.category || '—', inline: true },
            { name: 'Power', value: String(m.power ?? '—'), inline: true },
            { name: 'Accuracy', value: m.accuracy != null ? `${m.accuracy}%` : '—', inline: true },
            { name: 'PP', value: String(m.pp ?? '—'), inline: true },
            { name: 'Priority', value: String(m.priority ?? 0), inline: true },
            { name: 'Effect', value: m.effect || m.short_effect || '—', inline: false },
          ],
        },
      ],
    });
  },
};
