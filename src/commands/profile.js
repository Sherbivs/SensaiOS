import { SlashCommandBuilder } from 'discord.js';

import { loadHomeViews } from './dm-home-loader.js';

const data = new SlashCommandBuilder().setName('profile').setDescription('View your trainer profile');

const cooldownMs = 1000;

async function execute(interaction) {
  const views = await loadHomeViews();
  if (!views?.openProfileView) {
    await interaction.reply({
      content: 'I could not load your trainer profile right now. Please try again later.',
      ephemeral: true,
    });
    return;
  }

  try {
    await views.openProfileView(interaction, {
      respond: 'dm',
      ackContent: 'Sent your trainer profile to your DMs.',
    });
  } catch (err) {
    console.error('[profile] Failed to open profile view:', err?.message || err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Failed to load your profile. Please try again later.',
        ephemeral: true,
      });
    }
  }
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
