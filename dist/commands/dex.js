/**
 * /dex Command
 *
 * Pokédex lookup with autocomplete.
 *
 * @module commands/dex
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPokemon, suggestPokemon, meta, disabled } from '../lib/dex-api.js';
import { GAME_CONSTANTS } from '../shared/constants.js';
import { getSpriteUrl } from '../lib/assets.js';
const { TYPE_COLORS } = GAME_CONSTANTS;
const data = new SlashCommandBuilder()
    .setName('dex')
    .setDescription('Show Pokédex info for a Pokémon (latest ruleset)')
    .addStringOption((opt) => opt
    .setName('name')
    .setDescription('Name or ID')
    .setRequired(true)
    .setAutocomplete(true))
    .setDMPermission(false);
async function autocomplete(interaction) {
    if (disabled) {
        await interaction.respond([]);
        return;
    }
    const focused = interaction.options.getFocused();
    const list = suggestPokemon(focused)
        .map((n) => ({ name: n, value: n }))
        .slice(0, 25);
    await interaction.respond(list);
}
const command = {
    data,
    cooldownMs: 1000,
    autocomplete,
    async execute(interaction) {
        if (disabled) {
            await interaction.reply({
                content: 'Dex data is not available on this deployment. Try again later or ask an admin to run `npm run build:data`.',
                ephemeral: true,
            });
            return;
        }
        const query = interaction.options.getString('name', true);
        const mon = /^\d+$/.test(query) ? getPokemon(Number(query)) : getPokemon(query);
        if (!mon) {
            await interaction.reply({
                content: 'Pokémon not found. Try `/dex pikachu`.',
                ephemeral: true,
            });
            return;
        }
        const primaryType = Array.isArray(mon.types) && mon.types.length
            ? String(mon.types[0]).toLowerCase()
            : 'normal';
        const color = TYPE_COLORS[primaryType] ?? 0x2F3136;
        // Extract stats with multiple fallback keys
        const statsSource = mon.stats || mon.base_stats || mon.baseStats || {};
        const statEntries = Object.entries(statsSource)
            .filter((entry) => entry[1] !== null);
        const statLines = statEntries
            .map(([k, v]) => `${String(k).replace('-', ' ')}: **${v}**`)
            .join('  •  ');
        const abilities = Array.isArray(mon.abilities)
            ? mon.abilities
                .map((a) => (a && a.name ? `${a.hidden ? '(H) ' : ''}${a.name}` : null))
                .filter(Boolean)
            : [];
        const embed = new EmbedBuilder()
            .setTitle(`#${mon.id} — ${mon.name}`)
            .setColor(color)
            .addFields({ name: 'Types', value: Array.isArray(mon.types) ? mon.types.join(' / ') : '—', inline: true }, { name: 'Abilities', value: abilities.length ? abilities.join(', ') : '—', inline: true }, { name: 'Base Stats', value: statLines || '—', inline: false })
            .setFooter({ text: `Ruleset: ${meta.version_group || 'latest'}` });
        // Add sprite if available
        const spriteUrl = getSpriteUrl(mon.id, 'artwork') || getSpriteUrl(mon.id, 'sprite');
        if (spriteUrl) {
            embed.setThumbnail(spriteUrl);
        }
        await interaction.reply({ embeds: [embed] });
    }
};
export const { cooldownMs, execute } = command;
export { data, autocomplete };
export default command;
