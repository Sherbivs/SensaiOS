/**
 * /calc Command
 *
 * Damage calculator for battle planning.
 *
 * @module commands/calc
 * @since Phase 6.2 (2025-12-16) - Converted from JS
 */
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { calcSimpleDamage } from '../engine/calc.js';
import { derivedStats } from '../engine/stats.js';
const data = new SlashCommandBuilder()
    .setName('calc')
    .setDescription('Damage calculator (preview)')
    .addIntegerOption((opt) => opt
    .setName('power')
    .setDescription('Move base power')
    .setRequired(true)
    .setMinValue(1)
    .setMaxValue(250))
    .addIntegerOption((opt) => opt
    .setName('atk')
    .setDescription('Attacker\'s attack stat')
    .setRequired(true)
    .setMinValue(1))
    .addIntegerOption((opt) => opt
    .setName('def')
    .setDescription('Defender\'s defense stat')
    .setRequired(true)
    .setMinValue(1))
    .addIntegerOption((opt) => opt
    .setName('level')
    .setDescription('Attacker\'s level (default: 50)')
    .setMinValue(1)
    .setMaxValue(100));
const command = {
    data,
    cooldownMs: 1000,
    async execute(interaction) {
        const power = interaction.options.getInteger('power', true);
        const atk = interaction.options.getInteger('atk', true);
        const def = interaction.options.getInteger('def', true);
        const level = interaction.options.getInteger('level') ?? 50;
        // Get derived stats at level
        const atkDerived = derivedStats({ attack: atk }, level);
        const defDerived = derivedStats({ defense: def }, level);
        // Calculate base damage (no modifiers)
        const dmg = calcSimpleDamage(power, atkDerived.attack ?? atk, defDerived.defense ?? def, level);
        // Calculate min/max with damage roll (85-100%)
        const minDmg = Math.floor(dmg * 0.85);
        const maxDmg = dmg;
        const embed = new EmbedBuilder()
            .setTitle('Damage Calculator')
            .setColor(0xFF6B6B)
            .addFields({ name: 'Move Power', value: String(power), inline: true }, { name: 'Attack', value: String(atk), inline: true }, { name: 'Defense', value: String(def), inline: true }, { name: 'Level', value: String(level), inline: true }, { name: 'Damage Range', value: `${minDmg} – ${maxDmg}`, inline: true })
            .setFooter({ text: 'Base damage only. Does not include STAB, type effectiveness, or crits.' });
        await interaction.reply({ embeds: [embed] });
    }
};
export const { cooldownMs, execute } = command;
export { data };
export default command;
