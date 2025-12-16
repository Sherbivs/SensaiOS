/**
 * /box Command
 * 
 * Open your PC storage box.
 * 
 * @module commands/box
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';
import { log } from '../shared/logger.js';
import { loadHomeViews } from './dm-home-loader.js';

const data = new SlashCommandBuilder()
  .setName('box')
  .setDescription('Open your PC storage box');

const command: Command = {
  data,
  cooldownMs: 1000,
  async execute(interaction) {
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
      const error = err as Error;
      log.error('[box] Failed to open box view:', error?.message || error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'Failed to load your storage box. Please try again later.',
          ephemeral: true,
        });
      }
    }
  }
};

export const { cooldownMs, execute } = command;
export { data };
export default command;
