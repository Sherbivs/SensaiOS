/**
 * /profile Command
 *
 * View or manage your trainer profile.
 *
 * @module commands/profile
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder } from 'discord.js';
import { log } from '../shared/logging/index.js';
import { buildTrainerProfileEmbed } from '../bot/profile/embed.js';
import { loadTrainerProfile, invalidateTrainerProfile } from '../services/cache/recipes.js';
import { updateTrainerProfile } from '../models/index.js';
import { HomesteadChannelManager } from '../services/homestead-manager.js';
const MAX_TAGLINE_LENGTH = 120;
const MAX_BIO_LENGTH = 600;
const data = new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View or manage your trainer profile')
    .addSubcommand((sub) => sub.setName('view').setDescription('View your trainer profile'))
    .addSubcommand((sub) => sub
    .setName('edit')
    .setDescription('Update your trainer profile fields')
    .addStringOption((opt) => opt
    .setName('tagline')
    .setDescription(`Short tagline (max ${MAX_TAGLINE_LENGTH} characters)`)
    .setMaxLength(MAX_TAGLINE_LENGTH))
    .addStringOption((opt) => opt
    .setName('bio')
    .setDescription(`Longer bio shown on your profile (max ${MAX_BIO_LENGTH} characters)`)
    .setMaxLength(MAX_BIO_LENGTH))
    .addIntegerOption((opt) => opt
    .setName('favorite_species')
    .setDescription('Favorite Pokémon species ID (1-1025)')))
    .addSubcommand((sub) => sub
    .setName('clear')
    .setDescription('Clear a profile field')
    .addStringOption((opt) => opt
    .setName('field')
    .setDescription('The profile field to clear')
    .setRequired(true)
    .addChoices({ name: 'Tagline', value: 'tagline' }, { name: 'Bio', value: 'bio' }, { name: 'Favorite species', value: 'favorite_species' })));
/**
 * Send profile embed to user's homestead channel
 */
async function sendProfileEmbed(interaction, { ackMessage = 'Sent your trainer profile to your homestead channel.' } = {}) {
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
        // Get or create user's homestead channel
        if (!interaction.client || !interaction.guildId) {
            throw new Error('Cannot access homestead channel: missing client or guild context');
        }
        const manager = new HomesteadChannelManager(interaction.client, interaction.guildId);
        const result = await manager.getOrCreateChannel(interaction.user);
        const homesteadChannel = result.channel;
        await homesteadChannel.send({ embeds: [embed] });
        if (ackMessage) {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp({ content: ackMessage, ephemeral: true });
            }
            else {
                await interaction.reply({ content: ackMessage, ephemeral: true });
            }
        }
    }
    catch (error) {
        const err = error;
        log.warn('[profile] Failed to deliver homestead profile view; falling back to ephemeral reply', err);
        const payload = { embeds: [embed], ephemeral: true, content: ackMessage };
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(payload);
        }
        else {
            await interaction.reply(payload);
        }
    }
}
/**
 * Handle profile edit subcommand
 */
async function handleEdit(interaction) {
    const tagline = interaction.options.getString('tagline');
    const bio = interaction.options.getString('bio');
    const favoriteSpecies = interaction.options.getInteger('favorite_species');
    const updates = {};
    if (typeof tagline === 'string')
        updates.tagline = tagline;
    if (typeof bio === 'string')
        updates.bio = bio;
    if (typeof favoriteSpecies === 'number')
        updates.favoriteSpeciesId = favoriteSpecies;
    if (!Object.keys(updates).length) {
        await interaction.reply({ content: 'Provide at least one field to update.', ephemeral: true });
        return;
    }
    try {
        await updateTrainerProfile(interaction.user.id, updates);
        await invalidateTrainerProfile(interaction.user.id);
        await sendProfileEmbed(interaction, { ackMessage: 'Profile updated — sent the latest version to your DMs.' });
    }
    catch (error) {
        const err = error;
        if (err?.name === 'TrainerProfileUnknownSpecies') {
            await interaction.reply({
                content: 'I could not find that species ID. Double-check the Pokédex number and try again.',
                ephemeral: true,
            });
            return;
        }
        log.error('[profile] Failed to update trainer profile:', err?.message || err);
        await interaction.reply({ content: 'Failed to update your profile. Please try again later.', ephemeral: true });
    }
}
/**
 * Handle profile clear subcommand
 */
async function handleClear(interaction) {
    const field = interaction.options.getString('field', true);
    const updates = {};
    if (field === 'tagline')
        updates.tagline = null;
    if (field === 'bio')
        updates.bio = null;
    if (field === 'favorite_species')
        updates.favoriteSpeciesId = null;
    try {
        await updateTrainerProfile(interaction.user.id, updates);
        await invalidateTrainerProfile(interaction.user.id);
        await sendProfileEmbed(interaction, { ackMessage: 'Cleared that field and sent your updated profile to DMs.' });
    }
    catch (error) {
        const err = error;
        log.error('[profile] Failed to clear field:', err?.message || err);
        await interaction.reply({ content: 'Failed to clear that field. Please try again later.', ephemeral: true });
    }
}
const command = {
    data,
    cooldownMs: 1000,
    async execute(interaction) {
        const sub = interaction.options.getSubcommand(false) ?? 'view';
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
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
