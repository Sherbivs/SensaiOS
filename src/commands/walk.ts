/**
 * /walk Command
 * 
 * Walk in the wild to encounter Pokémon.
 * Must be used in public field channels.
 * 
 * @module commands/walk
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';

const data = new SlashCommandBuilder()
  .setName('walk')
  .setDescription('Walk in the wild to encounter Pokémon');

const command: Command = {
  data,
  cooldownMs: 5000, // 5 second cooldown for encounters
  async execute(interaction) {
    // Button-First redirect (Game Design Bible § 2)
    // Walking is done via the Explore screen in homestead channels
    await interaction.reply({ 
      content: '🎮 **Walking is available in your homestead channel!**\n\n' +
               '👉 Use `/start` to open your homestead, then click **🚶 Explore** → **👟 Walk** to encounter wild Pokémon.\n\n' +
               '💡 *Pokémon Infinity Gauntlet is a button-first game — no commands to memorize, just click and play!*', 
      ephemeral: true 
    });
  }
};

export const { cooldownMs, execute } = command;
export { data };
export default command;
