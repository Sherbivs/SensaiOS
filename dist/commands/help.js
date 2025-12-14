import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder().setName('help').setDescription('List available commands');

const cooldownMs = 1500;

async function execute(interaction) {
  const names = interaction.client && interaction.client.commands
    ? [...interaction.client.commands.keys()].sort()
    : [];
  const line = names.length
    ? `**Commands:** ${names.map((n) => '`/' + n + '`').join(' ')}`
    : 'No commands registered.';
  return interaction.reply({ content: line, ephemeral: true });
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
