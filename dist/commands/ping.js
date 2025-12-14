import { SlashCommandBuilder } from 'discord.js';

const data = new SlashCommandBuilder().setName('ping').setDescription('Latency & liveness check');

const cooldownMs = 1000;

async function execute(interaction) {
  const sent = Date.now();
  await interaction.reply({ content: 'Pinging...', fetchReply: true });
  const latency = Date.now() - sent;
  const api = Math.round(interaction.client.ws.ping);
  return interaction.editReply(`Pong! Client ${latency}ms • API ${api}ms`);
}

export { data, cooldownMs, execute };

export default { data, cooldownMs, execute };
