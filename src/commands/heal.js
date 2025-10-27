import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder().setName('heal').setDescription('Heal your party (in DM Home)');

const cooldownMs = 1000;

async function execute(interaction) {
  await interaction.reply({ content: 'Heal placeholder: will fully restore your party in DM Home.', ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
