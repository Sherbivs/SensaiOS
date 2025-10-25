'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('party').setDescription('View your party (in DMs)'),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Party placeholder: shows your active team in DM Home.', ephemeral: true });
  },
};
