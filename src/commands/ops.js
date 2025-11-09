import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

// Registration only; handling is wired in src/bot/index.ts to the TS implementation
const data = new SlashCommandBuilder()
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
    sub
      .setName('stats')
      .setDescription('Show basic usage stats')
      .addIntegerOption((opt) =>
        opt
          .setName('limit')
          .setDescription('Maximum rows to show (1-20)')
          .setMinValue(1)
          .setMaxValue(20)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('after')
          .setDescription('Only include battles that ended after this ISO 8601 timestamp')
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('participant')
          .setDescription('Filter to battles involving a specific participant (Discord ID or mention)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('cache')
      .setDescription('Inspect runtime cache metrics and maintenance state')
      .addBooleanOption((opt) =>
        opt
          .setName('cleanup')
          .setDescription('Run maintenance before collecting metrics')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('engine')
      .setDescription('View Engine DB operational dashboard (cache, buffer, workers, databases)')
  )
  .addSubcommand((sub) =>
    sub
      .setName('state')
      .setDescription('View security bot operational state and history')
      .addBooleanOption((opt) =>
        opt
          .setName('timeline')
          .setDescription('Show detailed activity timeline')
          .setRequired(false)
      )
      .addBooleanOption((opt) =>
        opt
          .setName('guilds')
          .setDescription('Show per-guild monitoring status')
          .setRequired(false)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false);

const cooldownMs = 500;

async function execute(interaction) {
  // Actual handling occurs in bot/index.ts to call the TS implementation.
  await interaction.reply({ content: 'Routing /ops to runtime…', ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
