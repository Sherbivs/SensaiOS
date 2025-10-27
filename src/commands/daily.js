import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder()
  .setName('daily')
  .setDescription('Daily quest utilities')
  .addSubcommand((sub) => sub.setName('claim').setDescription('Claim your daily quest reward'));

const cooldownMs = 1000;

async function execute(interaction) {
  await interaction.reply({ content: 'Use `/daily claim` to claim your daily reward.', ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };