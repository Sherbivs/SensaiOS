import { SlashCommandBuilder } from 'discord.js';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadJSON(rel) {
  const p = path.join(process.cwd(), rel);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

const data = new SlashCommandBuilder()
  .setName('version')
  .setDescription('Show live ruleset, data counts, and uptime');

const cooldownMs = 1000;

async function execute(interaction) {
  const meta = loadJSON('dist/meta/version.json') || {};
  const dex = loadJSON('dist/data/dex.min.json') || [];
  const moves = loadJSON('dist/data/moves.min.json') || {};
  const mem = process.memoryUsage();
  const fmtMb = (n) => (n / (1024 * 1024)).toFixed(1) + ' MB';

  const fields = [
    { name: 'Ruleset', value: meta.version_group || 'latest', inline: true },
    { name: 'Pokémon', value: String(Array.isArray(dex) ? dex.length : 0), inline: true },
    { name: 'Moves', value: String(Object.keys(moves || {}).length), inline: true },
    { name: 'Uptime', value: `${Math.floor(process.uptime())}s`, inline: true },
    { name: 'Memory', value: `RSS ${fmtMb(mem.rss)}  Heap ${fmtMb(mem.heapUsed)}`, inline: true },
    { name: 'Built At', value: meta.built_at || '—', inline: false },
  ];

  return interaction.reply({ embeds: [{ title: 'Infinity-Gauntlet — Live Version', fields }] });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
