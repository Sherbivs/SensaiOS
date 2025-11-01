import { SlashCommandBuilder } from 'discord.js';

import { loadHomeViews } from './dm-home-loader.js';

const data = new SlashCommandBuilder().setName('box').setDescription('Open your PC box (in DMs)');

const cooldownMs = 1000;

async function execute(interaction) {
  const views = await loadHomeViews();
  if (!views?.openBoxView) {
    await interaction.reply({
      content: 'I could not load your storage box right now. Please try again shortly.',
      ephemeral: true,
    });
    return;
  }

  try {
    await views.openBoxView(interaction, {
      respond: 'dm',
      page: 1,
      ackContent: 'Sent your storage box listing to your DMs.',
    });
  } catch (err) {
    console.error('[box] Failed to open box view:', err?.message || err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Failed to load your storage box. Please try again later.',
        ephemeral: true,
      });
    }
  }
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
