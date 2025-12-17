/**
 * /weak Command
 *
 * Show type weaknesses and resistances for a Pokémon.
 *
 * @module commands/weak
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getPokemon, meta, disabled } from '../lib/dex-api.js';
// Type chart for defensive calculations
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metaData = meta;
/** Standard type effectiveness chart */
const DEFAULT_TYPE_CHART = {
    normal: { rock: 0.5, ghost: 0, steel: 0.5 },
    fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
    water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
    electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
    grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
    ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
    fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
    poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
    ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
    flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
    psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
    bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
    rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
    ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
    dragon: { dragon: 2, steel: 0.5, fairy: 0 },
    dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
    steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
    fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};
const data = new SlashCommandBuilder()
    .setName('weak')
    .setDescription('Show type weaknesses and resistances for a Pokémon')
    .addStringOption((opt) => opt
    .setName('pokemon')
    .setDescription('Name of Pokémon to check')
    .setRequired(true));
const command = {
    data,
    cooldownMs: 1000,
    async execute(interaction) {
        if (disabled) {
            await interaction.reply({
                content: 'Dex data is not available on this deployment.',
                ephemeral: true,
            });
            return;
        }
        const name = interaction.options.getString('pokemon', true).toLowerCase();
        const pokemon = getPokemon(name);
        if (!pokemon) {
            await interaction.reply({
                content: `Could not find a Pokémon named "${name}".`,
                ephemeral: true,
            });
            return;
        }
        // Get type chart from meta or use default
        const typeChart = metaData?.typeChart || DEFAULT_TYPE_CHART;
        // Calculate defensive matchups
        const matchups = {};
        const types = pokemon.types || [];
        for (const attackingType of Object.keys(typeChart)) {
            let mult = 1;
            for (const defType of types) {
                const effectiveness = typeChart[attackingType]?.[defType.toLowerCase()];
                if (typeof effectiveness === 'number') {
                    mult *= effectiveness;
                }
            }
            if (mult !== 1) {
                if (!matchups[mult])
                    matchups[mult] = [];
                matchups[mult].push(attackingType);
            }
        }
        // Format display
        const formatMatchup = (mult, label) => {
            const types = matchups[mult];
            if (!types?.length)
                return null;
            return `**${label}:** ${types.join(', ')}`;
        };
        const lines = [];
        const weak4x = formatMatchup(4, '4× Weak');
        const weak2x = formatMatchup(2, '2× Weak');
        const resist = formatMatchup(0.5, '½× Resist');
        const resist4 = formatMatchup(0.25, '¼× Resist');
        const immune = formatMatchup(0, 'Immune');
        if (weak4x)
            lines.push(weak4x);
        if (weak2x)
            lines.push(weak2x);
        if (resist)
            lines.push(resist);
        if (resist4)
            lines.push(resist4);
        if (immune)
            lines.push(immune);
        const embed = new EmbedBuilder()
            .setTitle(`${pokemon.name} Type Matchups`)
            .setDescription(lines.length ? lines.join('\n') : 'No special weaknesses or resistances.')
            .setColor(0x3498DB)
            .setFooter({ text: `Types: ${types.join(' / ')}` });
        await interaction.reply({ embeds: [embed] });
    }
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
