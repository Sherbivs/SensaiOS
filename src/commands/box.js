'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('box').setDescription('Open your PC box (in DMs)'),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Box placeholder: shows stored Pokémon in DM Home.', ephemeral: true });
  },
};
