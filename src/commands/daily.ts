/**
 * /daily Command
 * 
 * Claim your daily reward.
 * 
 * @module commands/daily
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';

const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Claim your daily reward');

const command: Command = {
  data,
  cooldownMs: 1000,
  async execute(interaction) {
    await interaction.reply({ 
      content: 'Daily rewards are available in your homestead channel. Use /home to access it.', 
      ephemeral: true 
    });
  }
};

export const { cooldownMs, execute } = command;
export { data };
export default command;
