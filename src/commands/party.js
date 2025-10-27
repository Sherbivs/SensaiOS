import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder().setName('party').setDescription('View your party (in DMs)');

const cooldownMs = 1000;

async function execute(interaction) {
  await interaction.reply({ content: 'Party placeholder: shows your active team in DM Home.', ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
