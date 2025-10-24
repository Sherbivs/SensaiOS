'use strict';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Latency & liveness check'),
  cooldownMs: 1000,
  async execute(interaction) {
    const sent = Date.now();
    const msg = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = Date.now() - sent;
    const api = Math.round(interaction.client.ws.ping);
    return interaction.editReply(`Pong! Client ${latency}ms • API ${api}ms`);
  },
};
