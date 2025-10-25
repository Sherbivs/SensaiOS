'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('heal').setDescription('Heal your party (in DM Home)'),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ content: 'Heal placeholder: will fully restore your party in DM Home.', ephemeral: true });
  },
};
