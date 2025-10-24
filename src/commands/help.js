'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('List available commands'),
  cooldownMs: 1500,
  async execute(interaction) {
    const names = interaction.client && interaction.client.commands
      ? [...interaction.client.commands.keys()].sort()
      : [];
    const line = names.length
      ? `**Commands:** ${names.map((n) => '`/' + n + '`').join(' ')}`
      : 'No commands registered.';
    return interaction.reply({ content: line, ephemeral: true });
  },
};
