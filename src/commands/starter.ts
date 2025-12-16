/**
 * /starter Command
 * 
 * Choose your starter Pokémon (one-time selection).
 * Redirects to homestead channel for starter selection.
 * 
 * @module commands/starter
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';

const data = new SlashCommandBuilder()
  .setName('starter')
  .setDescription('Choose your starter (one-time)');

const command: Command = {
  data,
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ 
      content: 'Starter selection is available in your homestead channel. Use /home to access it.', 
      ephemeral: true 
    });
  }
};

export const { cooldownMs, execute } = command;
export { data };
export default command;
