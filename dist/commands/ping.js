/**
 * /ping Command
 *
 * Check bot latency and responsiveness.
 *
 * @module commands/ping
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder } from 'discord.js';
const data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency');
const command = {
    data,
    cooldownMs: 1000,
    async execute(interaction) {
        const sent = await interaction.reply({
            content: 'Pinging...',
            fetchReply: true,
            ephemeral: true
        });
        const roundTripLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const wsLatency = interaction.client.ws.ping;
        await interaction.editReply(`🏓 Pong!\n` +
            `• Round-trip: ${roundTripLatency}ms\n` +
            `• WebSocket: ${wsLatency}ms`);
    }
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
