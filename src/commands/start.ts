/**
 * /start Command
 * 
 * The ONLY slash command available to regular (non-dev) players.
 * Opens the home/homestead channel where all gameplay happens via buttons.
 * 
 * Per Game Design Bible: Button-first gameplay, minimal slash commands.
 * 
 * @module commands/start
 * @since Phase 7 (2025-12-24) - Player-facing entry point
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';

const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Begin your Pokémon adventure! Opens your homestead channel.');

const command: Command = {
  data,
  cooldownMs: 2000,
  async execute(interaction) {
    // This is handled specially in index.ts to open homestead
    // Fallback reply if somehow reached directly
    await interaction.reply({ 
      content: '🏠 Opening your homestead channel...', 
      ephemeral: true 
    });
  }
};

export const { cooldownMs, execute } = command;
export { data };
export default command;
