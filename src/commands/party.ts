/**
 * /party Command
 * 
 * View your party Pokemon.
 * 
 * @module commands/party
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { log } from '../shared/logger.js';
import { loadHomeViews } from './dm-home-loader.js';

const data = new SlashCommandBuilder()
  .setName('party')
  .setDescription('View your party');

const command: Command = {
  data,
  cooldownMs: 1000,
  async execute(interaction) {
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
      const error = err as Error;
      log.error('[party] Failed to open party view:', error?.message || error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Failed to load your party. Please try again later.',
          ephemeral: true,
        });
      }
    }
  }
};

export const { cooldownMs, execute } = command;
export { data };
export default command;
