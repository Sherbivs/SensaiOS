import { SlashCommandBuilder } from 'discord.js';
import { getPokemon, suggestPokemon, meta, disabled } from '../lib/dex-api.js';
import TYPE_COLORS from '../lib/type-colors.js';
import { getSpriteUrl } from '../lib/assets.js';

const data = new SlashCommandBuilder()
  .setName('dex')
  .setDescription('Show Pokédex info for a Pokémon (latest ruleset)')
  .addStringOption((o) => o.setName('name').setDescription('Name or ID').setRequired(true))
  .setDMPermission(false);

async function autocomplete(interaction) {
  if (disabled) return interaction.respond([]);
  const focused = interaction.options.getFocused();
  const list = suggestPokemon(focused)
    .map((n) => ({ name: n, value: n }))
    .slice(0, 25);
  await interaction.respond(list);
}

async function execute(interaction) {
  if (disabled) {
    return interaction.reply({
      content: 'Dex data is not available on this deployment. Try again later or ask an admin to run `npm run build:data`.',
      ephemeral: true,
    });
  }
  const q = interaction.options.getString('name');
  const mon = /^\d+$/.test(q) ? getPokemon(Number(q)) : getPokemon(q);

  if (!mon) {
    return interaction.reply({ content: 'Pokémon not found. Try `/dex pikachu`.', ephemeral: true });
  }

  const primaryType = Array.isArray(mon.types) && mon.types.length ? String(mon.types[0]).toLowerCase() : 'normal';
  const color = TYPE_COLORS[primaryType] ?? 0x2f3136;

  const statsSource = mon.stats || mon.base_stats || mon.baseStats || {};
  const statEntries = Object.entries(statsSource);
  const statLines = statEntries
    .map(([k, v]) => `${String(k).replace('-', ' ')}: **${v}**`)
    .join('  •  ');

  const abilities = Array.isArray(mon.abilities)
    ? mon.abilities.map((a) => (a && a.name ? `${a.hidden ? '(H) ' : ''}${a.name}` : null)).filter(Boolean)
    : [];

  const fields = [
    { name: 'Types', value: Array.isArray(mon.types) ? mon.types.join(' / ') : '—', inline: true },
    { name: 'Abilities', value: abilities.length ? abilities.join(', ') : '—', inline: true },
    { name: 'Base Stats', value: statLines || '—', inline: false },
  ];

  return interaction.reply({
    embeds: [
      {
        title: `#${mon.id} — ${mon.name}`,
        color,
        fields,
        thumbnail: { url: getSpriteUrl(mon.id, 'artwork') || getSpriteUrl(mon.id, 'sprite') || undefined },
        footer: { text: `Ruleset: ${meta.version_group || 'latest'}` },
      },
    ],
  });
}

export { data, autocomplete, execute };

export default { data, autocomplete, execute };
