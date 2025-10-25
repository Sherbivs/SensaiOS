'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('home').setDescription('Open your Pokémon home in DMs'),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Home is coming soon. This will open your DM Home UI.', ephemeral: true });
  },
};
