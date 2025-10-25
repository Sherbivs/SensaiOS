'use strict';
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getSpriteUrl } = require('../lib/assets.js');

function buildHomeEmbed({ coins = 0, nextDaily = 'Not set', party = [] }) {
  const embed = new EmbedBuilder()
    .setTitle('Your Pokémon Home')
    .setDescription(`Coins: ${coins} • Next Daily: ${nextDaily}`)
    .setColor(0x35a7ff);

  const lines = [];
  if (party.length) {
    for (let i = 0; i < Math.min(6, party.length); i++) {
      const p = party[i];
      const sprite = getSpriteUrl(p.speciesId || p.name || p.id, 'sprite');
      const label = `#${i + 1} ${p.name || '???'} — HP ${p.hp ?? '?'} / ${p.maxHp ?? '?'}`;
      lines.push(`${label}${sprite ? `\n${sprite}` : ''}`);
    }
  } else {
    lines.push('No party yet. Use /starter to choose your first Pokémon.');
  }

  embed.addFields({ name: 'Party', value: lines.join('\n') });
  return embed;
}

function buildHomeButtons({ showStarters = true } = {}) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('HOME_HEAL').setLabel('Heal').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('HOME_PARTY').setLabel('Party').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('HOME_BOX').setLabel('Box').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('HOME_PROFILE').setLabel('Profile').setStyle(ButtonStyle.Secondary),
  );
  if (showStarters) {
    row.addComponents(
      new ButtonBuilder().setCustomId('HOME_STARTERS').setLabel('Starters').setStyle(ButtonStyle.Success),
    );
  }
  return [row];
}

module.exports = {
  data: new SlashCommandBuilder().setName('home').setDescription('Open your Pokémon home in DMs'),
  cooldownMs: 1000,
  async execute(interaction) {
    try {
      // Placeholder values until DB wiring for user/party is added
      const coins = 0;
      const nextDaily = 'Soon';
      const party = [];
      const showStarters = true;

      const embed = buildHomeEmbed({ coins, nextDaily, party });
      const components = buildHomeButtons({ showStarters });

      // DM the user their Home UI
      const dm = await interaction.user.createDM();
      await dm.send({ embeds: [embed], components });

      if (interaction.inGuild?.()) {
        await interaction.reply({ content: 'I opened your Home in DMs.', ephemeral: true });
      } else {
        // If invoked from DM, reply inline
        await interaction.reply({ content: 'Home opened above.', ephemeral: false });
      }
    } catch (err) {
      console.error('[home] Failed to open DM Home:', err?.message || err);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Could not open your DM Home. Check your privacy settings.', ephemeral: true });
        }
      } catch {}
    }
  },
};
