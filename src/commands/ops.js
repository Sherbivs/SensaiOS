'use strict';
const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Registration only; handling is wired in src/bot/index.ts to the TS implementation
module.exports = {
  data: new SlashCommandBuilder()
    .setName('ops')
    .setDescription('Admin operations and stats')
    .addSubcommandGroup((grp) =>
      grp
        .setName('cooldown')
        .setDescription('Cooldown operations')
        .addSubcommand((sub) =>
          sub
            .setName('reset')
            .setDescription('Reset all cooldowns for a user')
            .addUserOption((opt) =>
              opt
                .setName('user')
                .setDescription('User to reset')
                .setRequired(true)
            )
        )
    )
    .addSubcommand((sub) =>
      sub.setName('stats').setDescription('Show basic usage stats')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),
  cooldownMs: 500,
  async execute(interaction) {
    // Actual handling occurs in bot/index.ts to call the TS implementation.
    await interaction.reply({ content: 'Routing /ops to runtime…', ephemeral: true });
  },
};
