import { SlashCommandBuilder } from 'discord.js';
import { getPokemon, meta, disabled } from '../lib/dex-api.js';
import TYPE_COLORS from '../lib/type-colors.js';

const data = new SlashCommandBuilder()
  .setName('weak')
  .setDescription('Show type multipliers (damage taken) for a Pokémon')
  .addStringOption((o) => o.setName('name').setDescription('Name or ID').setRequired(true))
  .setDMPermission(false);

async function execute(interaction) {
  if (disabled) {
    return interaction.reply({ content: 'Dex data is not available on this deployment.', ephemeral: true });
  }
  const q = interaction.options.getString('name');
  const mon = /^\d+$/.test(q) ? getPokemon(Number(q)) : getPokemon(q);
  if (!mon) return interaction.reply({ content: 'Pokémon not found.', ephemeral: true });

  const primaryType = Array.isArray(mon.types) && mon.types.length ? String(mon.types[0]).toLowerCase() : 'normal';
  const color = TYPE_COLORS[primaryType] ?? 0x2f3136;

  const matchups = mon.matchups || mon.multipliers || {};
  const mults = Object.entries(matchups);
  const buckets = { '4×': [], '2×': [], '½×': [], '¼×': [], '0×': [] };

  for (const [t, m] of mults) {
    if (m === 4) buckets['4×'].push(t);
    else if (m === 2) buckets['2×'].push(t);
    else if (m === 0.5) buckets['½×'].push(t);
    else if (m === 0.25) buckets['¼×'].push(t);
    else if (m === 0) buckets['0×'].push(t);
  }

  const lines = Object.entries(buckets)
    .filter(([, arr]) => arr.length)
    .map(([k, arr]) => `**${k}**  ${arr.join(', ')}`)
    .join('\n') || 'All neutral (1×)';

  return interaction.reply({
    embeds: [
      {
        title: `${mon.name} — weaknesses & resistances`,
        color,
        fields: [{ name: 'Multipliers', value: lines }],
        footer: { text: `Ruleset: ${meta.version_group || 'latest'}` },
      },
    ],
  });
}

export { data, execute };

export default { data, execute };
