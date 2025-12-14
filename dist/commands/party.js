import { log } from '../utils/logger.js';
import { SlashCommandBuilder } from 'discord.js';

import { loadHomeViews } from './dm-home-loader.js';

const data = new SlashCommandBuilder().setName('party').setDescription('View your party (in DMs)');

const cooldownMs = 1000;

async function execute(interaction) {
  const views = await loadHomeViews();
  if (!views?.openPartyView) {
    await interaction.reply({
      content: 'I could not load your party right now. Please try again soon.',
      ephemeral: true,
    });
    return;
  }

  try {
    await views.openPartyView(interaction, {
      respond: 'dm',
      ackContent: 'Sent your party overview to your DMs.',
    });
  } catch (err) {
    log.error('[party] Failed to open party view:', err?.message || err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Failed to load your party. Please try again later.',
        ephemeral: true,
      });
    }
  }
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
