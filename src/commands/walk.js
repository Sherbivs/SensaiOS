'use strict';
const { SlashCommandBuilder } = require('discord.js');

// Registration stub; handling is wired in src/bot/index.ts to the TS module
module.exports = {
  data: new SlashCommandBuilder()
    .setName('walk')
    .setDescription('Walk in #wilds to find an encounter'),
  cooldownMs: 1000,
  async execute(interaction) {
    // Actual handling occurs in bot/index.ts to call the TS implementation.
    // This stub exists to ensure command registration.
    await interaction.reply({ content: 'Starting a walk…', ephemeral: true });
  },
};
