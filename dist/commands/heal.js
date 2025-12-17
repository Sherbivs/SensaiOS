/**
 * /heal Command
 *
 * Heal your party (Pokemon Center functionality).
 * Redirects to homestead channel where healing is available.
 *
 * @module commands/heal
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder } from 'discord.js';
const data = new SlashCommandBuilder()
    .setName('heal')
    .setDescription('Heal your party (in Homestead)');
const command = {
    data,
    cooldownMs: 1000,
    async execute(interaction) {
        await interaction.reply({
            content: 'Party healing is available in your homestead channel. Use /home to access it.',
            ephemeral: true
        });
    }
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
