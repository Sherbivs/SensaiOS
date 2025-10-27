import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder().setName('starter').setDescription('Choose your starter (one-time)');

const cooldownMs = 1000;

async function execute(interaction) {
  await interaction.reply({ content: 'Starter placeholder: choose your first Pokémon in DM Home.', ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
