/**
 * /ops Command
 *
 * Admin operations and stats command.
 * Registration only - actual handling wired in src/bot/index.ts to TS implementation.
 *
 * @module commands/ops
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
const data = new SlashCommandBuilder()
    .setName('ops')
    .setDescription('Admin operations and stats')
    .addSubcommandGroup((grp) => grp
    .setName('cooldown')
    .setDescription('Cooldown operations')
    .addSubcommand((sub) => sub
    .setName('reset')
    .setDescription('Reset all cooldowns for a user')
    .addUserOption((opt) => opt
    .setName('user')
    .setDescription('User to reset')
    .setRequired(true))))
    // SensaiOS Ring Security dashboard commands
    // Task: SENSAI.VISIBILITY.DASHBOARD
    // Reference: docs/projects/SensaiOS/architecture/06-os-security-model.md
    .addSubcommandGroup((grp) => grp
    .setName('security')
    .setDescription('SensaiOS Ring Security audit dashboard')
    .addSubcommand((sub) => sub
    .setName('capabilities')
    .setDescription('List all granted capabilities')
    .addStringOption((opt) => opt
    .setName('component')
    .setDescription('Filter by component name')
    .setRequired(false))
    .addBooleanOption((opt) => opt
    .setName('expired')
    .setDescription('Include expired/revoked capabilities')
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('apps')
    .setDescription('List installed apps with ring levels')
    .addIntegerOption((opt) => opt
    .setName('ring')
    .setDescription('Filter by ring level (0=kernel, 1=sensaios, 3=apps)')
    .setMinValue(0)
    .setMaxValue(3)
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('violations')
    .setDescription('Show recent security violations')
    .addIntegerOption((opt) => opt
    .setName('limit')
    .setDescription('Maximum violations to show (default: 10)')
    .setMinValue(1)
    .setMaxValue(50)
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('export')
    .setDescription('Export security audit report as JSON')))
    .addSubcommand((sub) => sub
    .setName('stats')
    .setDescription('Show basic usage stats')
    .addIntegerOption((opt) => opt
    .setName('limit')
    .setDescription('Maximum rows to show (1-20)')
    .setMinValue(1)
    .setMaxValue(20)
    .setRequired(false))
    .addStringOption((opt) => opt
    .setName('after')
    .setDescription('Only include battles that ended after this ISO 8601 timestamp')
    .setRequired(false))
    .addStringOption((opt) => opt
    .setName('participant')
    .setDescription('Filter to battles involving a specific participant (Discord ID or mention)')
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('cache')
    .setDescription('Inspect runtime cache metrics and maintenance state')
    .addBooleanOption((opt) => opt
    .setName('cleanup')
    .setDescription('Run maintenance before collecting metrics')
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('engine')
    .setDescription('View Engine DB operational dashboard (cache, buffer, workers, databases)'))
    .addSubcommand((sub) => sub
    .setName('state')
    .setDescription('View security bot operational state and history')
    .addBooleanOption((opt) => opt
    .setName('timeline')
    .setDescription('Show detailed activity timeline')
    .setRequired(false))
    .addBooleanOption((opt) => opt
    .setName('guilds')
    .setDescription('Show per-guild monitoring status')
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('errors')
    .setDescription('View comprehensive error detection dashboard with learning insights')
    .addStringOption((opt) => opt
    .setName('severity')
    .setDescription('Filter by severity level')
    .setRequired(false)
    .addChoices({ name: 'CRITICAL', value: 'CRITICAL' }, { name: 'HIGH', value: 'HIGH' }, { name: 'MEDIUM', value: 'MEDIUM' }, { name: 'LOW', value: 'LOW' }))
    .addStringOption((opt) => opt
    .setName('category')
    .setDescription('Filter by error category')
    .setRequired(false)
    .addChoices({ name: 'DATABASE', value: 'DATABASE' }, { name: 'DISCORD', value: 'DISCORD' }, { name: 'ENGINE', value: 'ENGINE' }, { name: 'WORKER', value: 'WORKER' }, { name: 'CACHE', value: 'CACHE' }, { name: 'UNKNOWN', value: 'UNKNOWN' }))
    .addStringOption((opt) => opt
    .setName('since')
    .setDescription('Time period (e.g., 1h, 6h, 24h, 7d, 30d)')
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('snapshot')
    .setDescription('Capture memory heap snapshot for analysis')
    .addBooleanOption((opt) => opt
    .setName('detailed')
    .setDescription('Include detailed heap space breakdown')
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('metrics-history')
    .setDescription('View historical system metrics from Write-DB storage')
    .addIntegerOption((opt) => opt
    .setName('minutes')
    .setDescription('Time range in minutes (default: 60, max: 10080 = 7 days)')
    .setMinValue(1)
    .setMaxValue(10080)
    .setRequired(false)))
    .addSubcommand((sub) => sub
    .setName('memory')
    .setDescription('View memory profiling report with startup progression and current state'))
    .addSubcommand((sub) => sub
    .setName('restarts')
    .setDescription('View restart metrics dashboard with crash counts and uptime history'))
    .addSubcommand((sub) => sub
    .setName('test-alert')
    .setDescription('Send a test alert to verify alert routing configuration')
    .addStringOption((opt) => opt
    .setName('level')
    .setDescription('Alert severity level (default: WARNING)')
    .setRequired(false)
    .addChoices({ name: 'INFO', value: 'INFO' }, { name: 'WARNING', value: 'WARNING' }, { name: 'CRITICAL', value: 'CRITICAL' }, { name: 'EMERGENCY', value: 'EMERGENCY' })))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false);
const command = {
    data,
    cooldownMs: 500,
    async execute(interaction) {
        // Actual handling occurs in bot/index.ts to call the TS implementation.
        await interaction.reply({ content: 'Routing /ops to runtime…', ephemeral: true });
    }
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
