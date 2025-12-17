/**
 * /help Command
 *
 * Display available commands and how to use them.
 *
 * @module commands/help
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
const data = new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available commands');
const command = {
    data,
    cooldownMs: 1000,
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎮 Pokémon Infinity Gauntlet - Commands')
            .setColor(0x5865F2)
            .setDescription('Welcome to the Infinity Gauntlet! Here are the available commands:')
            .addFields({
            name: '🏠 Homestead',
            value: '`/home` - Access your homestead (private channel)\n' +
                '`/heal` - Heal your party\n' +
                '`/daily` - Claim daily rewards',
            inline: false
        }, {
            name: '🌿 Exploration',
            value: '`/walk` - Walk to encounter wild Pokémon\n' +
                '`/dex` - View Pokédex information',
            inline: false
        }, {
            name: '⚔️ Battle',
            value: '`/battle` - Challenge another trainer\n' +
                '`/party` - View your party\n' +
                '`/box` - Access PC storage',
            inline: false
        }, {
            name: '📊 Info',
            value: '`/profile` - View your trainer profile\n' +
                '`/ping` - Check bot latency\n' +
                '`/version` - Show bot version',
            inline: false
        })
            .setFooter({ text: 'Use /starter in your homestead to choose your first Pokémon!' });
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
