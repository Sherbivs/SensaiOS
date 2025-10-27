import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder().setName('profile').setDescription('View your trainer profile');

const cooldownMs = 1000;

async function execute(interaction) {
  await interaction.reply({ content: 'Profile placeholder: shows your coins, stats, and trainer info.', ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
