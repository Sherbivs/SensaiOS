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
      .setName('database')
      .setDescription('View database worker status and metrics')
      .addStringOption((opt) =>
        opt
          .setName('worker')
          .setDescription('Show specific worker details')
          .setRequired(false)
          .addChoices(
            { name: 'PROD PostgreSQL', value: 'prod' },
            { name: 'TimescaleDB', value: 'timescale' },
            { name: 'Engine Read', value: 'engine-read' },
            { name: 'Engine Write', value: 'engine-write' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('workers')
      .setDescription('View all worker health checks and uptime')
      .addBooleanOption((opt) =>
        opt
          .setName('detailed')
          .setDescription('Show detailed worker metrics')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('logs')
      .setDescription('Query TimescaleDB log entries')
      .addStringOption((opt) =>
        opt
          .setName('level')
          .setDescription('Filter by log level')
          .setRequired(false)
          .addChoices(
            { name: 'ERROR', value: 'error' },
            { name: 'WARN', value: 'warn' },
            { name: 'INFO', value: 'info' },
            { name: 'DEBUG', value: 'debug' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('category')
          .setDescription('Filter by category (e.g., database, bot, battle)')
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('limit')
          .setDescription('Maximum number of entries (1-50, default 20)')
          .setMinValue(1)
          .setMaxValue(50)
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName('since')
          .setDescription('Time period (e.g., 1h, 6h, 24h, 7d)')
          .setRequired(false)
      )
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
  .addSubcommand((sub) =>
    sub
      .setName('errors')
      .setDescription('View comprehensive error detection dashboard with learning insights')
      .addStringOption((opt) =>
        opt
          .setName('severity')
          .setDescription('Filter by severity level')
          .setRequired(false)
          .addChoices(
            { name: 'CRITICAL', value: 'CRITICAL' },
            { name: 'HIGH', value: 'HIGH' },
            { name: 'MEDIUM', value: 'MEDIUM' },
            { name: 'LOW', value: 'LOW' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('category')
          .setDescription('Filter by error category')
          .setRequired(false)
          .addChoices(
            { name: 'DATABASE', value: 'DATABASE' },
            { name: 'DISCORD', value: 'DISCORD' },
            { name: 'ENGINE', value: 'ENGINE' },
            { name: 'WORKER', value: 'WORKER' },
            { name: 'CACHE', value: 'CACHE' },
            { name: 'UNKNOWN', value: 'UNKNOWN' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('since')
          .setDescription('Time period (e.g., 1h, 6h, 24h, 7d, 30d)')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('snapshot')
      .setDescription('Capture memory heap snapshot for analysis')
      .addBooleanOption((opt) =>
        opt
          .setName('detailed')
          .setDescription('Include detailed heap space breakdown')
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('devmode')
      .setDescription('View/toggle development restricted access mode')
      .addStringOption((opt) =>
        opt
          .setName('action')
          .setDescription('Action to perform')
          .setRequired(false)
          .addChoices(
            { name: 'View Status', value: 'status' },
            { name: 'Enable Restricted Mode', value: 'enable' },
            { name: 'Disable Restricted Mode', value: 'disable' }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('alert')
      .setDescription('View alert throttle statistics and manage DM alert delivery')
      .addStringOption((opt) =>
        opt
          .setName('action')
          .setDescription('Action to perform')
          .setRequired(false)
          .addChoices(
            { name: 'View Statistics', value: 'stats' },
            { name: 'View Cooldowns', value: 'cooldowns' },
            { name: 'View Recent Alerts', value: 'history' },
            { name: 'Flush Batched Alerts', value: 'flush' },
            { name: 'Clear All Cooldowns', value: 'clear' }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName('severity')
          .setDescription('Filter by severity (for history) or target severity (for clear)')
          .setRequired(false)
          .addChoices(
            { name: 'Restart', value: 'restart' },
            { name: 'Critical', value: 'critical' },
            { name: 'Security', value: 'security' },
            { name: 'Warning', value: 'warning' },
            { name: 'Notice', value: 'notice' }
          )
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
