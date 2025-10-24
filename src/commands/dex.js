'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { getPokemon, suggestPokemon, meta } = require('../lib/dex-api');
const TYPE_COLORS = require('../lib/type-colors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dex')
    .setDescription('Show Pokédex info for a Pokémon (latest ruleset)')
    .addStringOption((o) => o.setName('name').setDescription('Name or ID').setRequired(true))
    .setDMPermission(false),
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const list = suggestPokemon(focused)
      .map((n) => ({ name: n, value: n }))
      .slice(0, 25);
    await interaction.respond(list);
  },
  async execute(interaction) {
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
          footer: { text: `Ruleset: ${meta.version_group || 'latest'}` },
        },
      ],
    });
  },
};
