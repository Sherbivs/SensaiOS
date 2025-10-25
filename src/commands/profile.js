'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('profile').setDescription('View your trainer profile'),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Profile placeholder: shows your coins, stats, and trainer info.', ephemeral: true });
  },
};
