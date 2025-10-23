const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.User]
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  const roleName = "Trainers";
  const role = member.guild.roles.cache.find(r => r.name === roleName);

  if (!role) {
    console.error(`⚠️ Role "${roleName}" not found in ${member.guild.name}`);
    return;
  }

  try {
    await member.roles.add(role);
    console.log(`🎉 Added ${member.user.tag} to ${roleName}`);
  } catch (error) {
    console.error(`❌ Failed to assign role:`, error);
  }
});

client.login(process.env.BOT_TOKEN);
