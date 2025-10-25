'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Battle orchestration commands')
    .addSubcommand((sub) =>
      sub
        .setName('challenge')
        .setDescription('Challenge another trainer to a battle via DM prompt')
        .addUserOption((opt) =>
          opt
            .setName('opponent')
            .setDescription('Trainer to challenge')
            .setRequired(true)
        )
    )
    .setDMPermission(false),
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({
      content: 'Battle command routing through bot runtime.',
      ephemeral: true,
    });
  },
};
