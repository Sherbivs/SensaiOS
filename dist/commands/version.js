import { SlashCommandBuilder } from 'discord.js';
import { dex, moves, meta, disabled } from '../lib/dex-api.js';

const data = new SlashCommandBuilder()
  .setName('version')
  .setDescription('Show live ruleset, data counts, and uptime');

const cooldownMs = 1000;

async function execute(interaction) {
  if (disabled) {
    return interaction.reply({
      content: 'Dex data is not available on this deployment. Try again later or ask an admin to run the dexpack build pipeline.',
      ephemeral: true,
    });
  }
  const mem = process.memoryUsage();
  const fmtMb = (n) => (n / (1024 * 1024)).toFixed(1) + ' MB';

  const fields = [
  { name: 'Ruleset', value: meta.version_group || 'latest', inline: true },
  { name: 'Pokémon', value: String(Array.isArray(dex) ? dex.length : 0), inline: true },
  { name: 'Moves', value: String(moves ? Object.keys(moves).length : 0), inline: true },
    { name: 'Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
    { name: 'Memory', value: `RSS ${fmtMb(mem.rss)}  Heap ${fmtMb(mem.heapUsed)}`, inline: true },
    { name: 'Built At', value: meta.built_at || '—', inline: false },
  ];

  return interaction.reply({ embeds: [{ title: 'Infinity-Gauntlet — Live Version', fields }] });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
