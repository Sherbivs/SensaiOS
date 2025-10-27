import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder().setName('box').setDescription('Open your PC box (in DMs)');

const cooldownMs = 1000;

async function execute(interaction) {
  await interaction.reply({ content: 'Box placeholder: shows stored Pokémon in DM Home.', ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
