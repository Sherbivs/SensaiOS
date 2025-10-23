require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // needed for GuildMemberAdd
  ],
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.GuildMemberAdd, async (member) => {
  const roleName = 'Trainers';

  try {
    // Ensure we have the latest roles
    await member.guild.roles.fetch();
    const role = member.guild.roles.cache.find((r) => r.name === roleName);

    if (!role) {
      console.warn(`Role "${roleName}" not found in guild "${member.guild.name}"`);
      return;
    }

    await member.roles.add(role);
    console.log(`Assigned "${roleName}" to ${member.user.tag}`);
  } catch (err) {
    console.error('Failed to assign role:', err);
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('Missing DISCORD_TOKEN environment variable.');
  process.exit(1);
}
client.login(token);
