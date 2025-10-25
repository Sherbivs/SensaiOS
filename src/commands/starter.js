'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('starter').setDescription('Choose your starter (one-time)'),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Starter placeholder: choose your first Pokémon in DM Home.', ephemeral: true });
  },
};
