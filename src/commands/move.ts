/**
 * /move Command
 * 
 * Show move details with autocomplete.
 * 
 * @module commands/move
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */

import { SlashCommandBuilder, EmbedBuilder, type AutocompleteInteraction } from 'discord.js';
import type { Command } from './types.js';
import { getMove, moves, disabled } from '../lib/dex-api.js';
import { GAME_CONSTANTS } from '../shared/constants.js';

const { TYPE_COLORS } = GAME_CONSTANTS;

const MOVE_LIST = Object.keys(moves || {}).sort();

const data = new SlashCommandBuilder()
  .setName('move')
  .setDescription('Show move details')
  .addStringOption((opt) =>
    opt
      .setName('name')
      .setDescription('Move name')
      .setRequired(true)
      .setAutocomplete(true)
  )
  .setDMPermission(false);

async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  if (disabled) {
    await interaction.respond([]);
    return;
  }
  
  const focused = String(interaction.options.getFocused() || '').toLowerCase();
  const picks = MOVE_LIST
    .filter((n) => n.toLowerCase().startsWith(focused) || n.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((n) => ({ name: n, value: n }));
  
  await interaction.respond(picks);
}

const command: Command = {
  data,
  cooldownMs: 1000,
  autocomplete,
  async execute(interaction) {
    if (disabled) {
      await interaction.reply({
        content: 'Move data is not available on this deployment.',
        ephemeral: true,
      });
      return;
    }

    const query = interaction.options.getString('name', true);
    const move = getMove(query);

    if (!move) {
      await interaction.reply({
        content: `Move "${query}" not found.`,
        ephemeral: true,
      });
      return;
    }

    const typeName = String(move.type || '').toLowerCase();
    const color = (TYPE_COLORS as Record<string, number>)[typeName] ?? 0x2F3136;

    const embed = new EmbedBuilder()
      .setTitle(move.name)
      .setColor(color)
      .addFields(
        { name: 'Type', value: move.type || '—', inline: true },
        { name: 'Class', value: move.class || move.category || '—', inline: true },
        { name: 'Power', value: String(move.power ?? '—'), inline: true },
        { name: 'Accuracy', value: move.accuracy != null ? `${move.accuracy}%` : '—', inline: true },
        { name: 'PP', value: String(move.pp ?? '—'), inline: true },
        { name: 'Priority', value: String(move.priority ?? 0), inline: true },
        { name: 'Effect', value: move.effect || move.short_effect || '—', inline: false },
      );

    await interaction.reply({ embeds: [embed] });
  }
};

export const { cooldownMs, execute } = command;
export { data, autocomplete };
export default command;
