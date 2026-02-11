/**
 * /battle Command
 * 
 * Battle orchestration - challenge another trainer.
 * 
 * @module commands/battle
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder } from 'discord.js';
import type { Command } from './types.js';

const data = new SlashCommandBuilder()
  .setName('battle')
  .setDescription('Battle orchestration commands')
  .addSubcommand((sub) =>
    sub
      .setName('challenge')
      .setDescription('Challenge another trainer to a battle')
      .addUserOption((opt) =>
        opt
          .setName('opponent')
          .setDescription('Trainer to challenge')
          .setRequired(true)
      )
  )
  .setDMPermission(false);

const command: Command = {
  data,
  cooldownMs: 1000,
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'challenge') {
      const opponent = interaction.options.getUser('opponent', true);
      
      if (opponent.id === interaction.user.id) {
        await interaction.reply({
          content: 'You cannot challenge yourself to a battle!',
          ephemeral: true,
        });
        return;
      }
      
      if (opponent.bot) {
        await interaction.reply({
          content: 'You cannot challenge a bot to a battle!',
          ephemeral: true,
        });
        return;
      }
      
      // Button-First redirect (Game Design Bible § 2)
      // Battle challenges are handled via homestead channel buttons
      await interaction.reply({
        content: `🎮 **Battles are available in your homestead channel!**\n\n` +
                 `👉 Use \`/start\` to open your homestead, then navigate to the battle arena.\n\n` +
                 `💡 *Pokémon Infinity Gauntlet is a button-first game — no commands to memorize, just click and play!*`,
        ephemeral: true,
      });
    }
  }
};

export const { data: commandData, cooldownMs, execute } = command;
export { data };
export default command;
