'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Daily quest utilities')
    .addSubcommand((sub) => sub.setName('claim').setDescription('Claim your daily quest reward')),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Use `/daily claim` to claim your daily reward.', ephemeral: true });
  },
};