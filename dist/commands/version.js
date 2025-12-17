/**
 * /version Command
 *
 * Show live ruleset, data counts, and uptime information.
 *
 * @module commands/version
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import * as dexApi from '../lib/dex-api.js';
// Cast entire module to unknown first, then to typed shape
const typedApi = dexApi;
const { dex, moves, meta, disabled } = typedApi;
const data = new SlashCommandBuilder()
    .setName('version')
    .setDescription('Show live ruleset, data counts, and uptime');
const command = {
    data,
    cooldownMs: 1000,
    async execute(interaction) {
        if (disabled) {
            await interaction.reply({
                content: 'Dex data is not available on this deployment. Try again later or ask an admin to run the dexpack build pipeline.',
                ephemeral: true,
            });
            return;
        }
        const mem = process.memoryUsage();
        const fmtMb = (n) => (n / (1024 * 1024)).toFixed(1) + ' MB';
        const embed = new EmbedBuilder()
            .setTitle('Infinity-Gauntlet — Live Version')
            .setColor(0x5865F2)
            .addFields({ name: 'Ruleset', value: String(meta.version_group || 'latest'), inline: true }, { name: 'Pokémon', value: String(Array.isArray(dex) ? dex.length : 0), inline: true }, { name: 'Moves', value: String(moves ? Object.keys(moves).length : 0), inline: true }, { name: 'Uptime', value: `${Math.floor(process.uptime())}s`, inline: true }, { name: 'Memory', value: `RSS ${fmtMb(mem.rss)}  Heap ${fmtMb(mem.heapUsed)}`, inline: true }, { name: 'Built At', value: String(meta.built_at || '—'), inline: false });
        await interaction.reply({ embeds: [embed] });
    }
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
