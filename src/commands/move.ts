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

    // Type helpers for index signature accessed properties
    const moveType = typeof move.type === 'string' ? move.type : '';
    const moveClass = typeof move.class === 'string' ? move.class : (typeof move.category === 'string' ? move.category : '');
    const movePower = typeof move.power === 'number' ? String(move.power) : '—';
    const moveAccuracy = typeof move.accuracy === 'number' ? `${move.accuracy}%` : '—';
    const movePP = typeof move.pp === 'number' ? String(move.pp) : '—';
    const movePriority = typeof move.priority === 'number' ? String(move.priority) : '0';
    const moveEffect = typeof move.effect === 'string' ? move.effect : (typeof move.short_effect === 'string' ? move.short_effect : '—');

    const typeName = moveType.toLowerCase();
    const color = (TYPE_COLORS as Record<string, number>)[typeName] ?? 0x2F3136;

    const embed = new EmbedBuilder()
      .setTitle(typeof move.name === 'string' ? move.name : query)
      .setColor(color)
      .addFields(
        { name: 'Type', value: moveType || '—', inline: true },
        { name: 'Class', value: moveClass || '—', inline: true },
        { name: 'Power', value: movePower, inline: true },
        { name: 'Accuracy', value: moveAccuracy, inline: true },
        { name: 'PP', value: movePP, inline: true },
        { name: 'Priority', value: movePriority, inline: true },
        { name: 'Effect', value: moveEffect, inline: false },
      );

    await interaction.reply({ embeds: [embed] });
  }
};

export const { cooldownMs, execute } = command;
export { data, autocomplete };
export default command;
