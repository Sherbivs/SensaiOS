import { SlashCommandBuilder } from 'discord.js';

import { buildTrainerProfileEmbed } from '../bot/profile/embed.js';
import { loadTrainerProfile, invalidateTrainerProfile } from '../services/cache/recipes.js';
import { updateTrainerProfile } from '../models/index.js';

const MAX_TAGLINE_LENGTH = 120;
const MAX_BIO_LENGTH = 600;

const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View or manage your trainer profile')
  .addSubcommand((sub) =>
    sub.setName('view').setDescription('View your trainer profile')
  )
  .addSubcommand((sub) =>
    sub
      .setName('edit')
      .setDescription('Update your trainer profile fields')
      .addStringOption((opt) =>
        opt
          .setName('tagline')
          .setDescription(`Short tagline (max ${MAX_TAGLINE_LENGTH} characters)`)
          .setMaxLength(MAX_TAGLINE_LENGTH)
      )
      .addStringOption((opt) =>
        opt
          .setName('bio')
          .setDescription(`Longer bio shown on your profile (max ${MAX_BIO_LENGTH} characters)`)
          .setMaxLength(MAX_BIO_LENGTH)
      )
      .addIntegerOption((opt) =>
        opt
          .setName('favorite_species')
          .setDescription('Favorite Pokémon species ID (1-1025)')
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('clear')
      .setDescription('Clear a profile field')
      .addStringOption((opt) =>
        opt
          .setName('field')
          .setDescription('The profile field to clear')
          .setRequired(true)
          .addChoices(
            { name: 'Tagline', value: 'tagline' },
            { name: 'Bio', value: 'bio' },
            { name: 'Favorite species', value: 'favorite_species' },
          )
      )
  );

const cooldownMs = 1000;

async function sendProfileEmbed(interaction, { ackMessage = 'Sent your trainer profile to your DMs.' } = {}) {
  const summary = await loadTrainerProfile(interaction.user.id);
  if (!summary) {
    await interaction.reply({
      content: 'I could not load your trainer profile right now. Please try again later.',
      ephemeral: true,
    });
    return;
  }

  const embed = buildTrainerProfileEmbed(summary);

  try {
    const dm = await interaction.user.createDM();
    await dm.send({ embeds: [embed] });
    if (ackMessage) {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: ackMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: ackMessage, ephemeral: true });
      }
    }
  } catch (error) {
    console.warn('[profile] Failed to deliver DM profile view; falling back to ephemeral reply', error);
    const payload = { embeds: [embed], ephemeral: true, content: ackMessage };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  }
}

async function handleEdit(interaction) {
  const tagline = interaction.options.getString('tagline');
  const bio = interaction.options.getString('bio');
  const favoriteSpecies = interaction.options.getInteger('favorite_species');

  const updates = {};
  if (typeof tagline === 'string') updates.tagline = tagline;
  if (typeof bio === 'string') updates.bio = bio;
  if (typeof favoriteSpecies === 'number') updates.favoriteSpeciesId = favoriteSpecies;

  if (!Object.keys(updates).length) {
    await interaction.reply({ content: 'Provide at least one field to update.', ephemeral: true });
    return;
  }

  try {
    await updateTrainerProfile(interaction.user.id, updates);
    await invalidateTrainerProfile(interaction.user.id);
    await sendProfileEmbed(interaction, { ackMessage: 'Profile updated — sent the latest version to your DMs.' });
  } catch (error) {
    if (error?.name === 'TrainerProfileUnknownSpecies') {
      await interaction.reply({
        content: 'I could not find that species ID. Double-check the Pokédex number and try again.',
        ephemeral: true,
      });
      return;
    }
    console.error('[profile] Failed to update trainer profile:', error?.message || error);
    await interaction.reply({ content: 'Failed to update your profile. Please try again later.', ephemeral: true });
  }
}

async function handleClear(interaction) {
  const field = interaction.options.getString('field', true);
  const updates = {};
  if (field === 'tagline') updates.tagline = null;
  if (field === 'bio') updates.bio = null;
  if (field === 'favorite_species') updates.favoriteSpeciesId = null;

  try {
    await updateTrainerProfile(interaction.user.id, updates);
    await invalidateTrainerProfile(interaction.user.id);
    await sendProfileEmbed(interaction, { ackMessage: 'Cleared that field and sent your updated profile to DMs.' });
  } catch (error) {
    console.error('[profile] Failed to clear field:', error?.message || error);
    await interaction.reply({ content: 'Failed to clear that field. Please try again later.', ephemeral: true });
  }
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand?.(false) ?? 'view';

  if (sub === 'edit') {
    await handleEdit(interaction);
    return;
  }

  if (sub === 'clear') {
    await handleClear(interaction);
    return;
  }

  await sendProfileEmbed(interaction);
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
