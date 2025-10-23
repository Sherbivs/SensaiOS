const { Client, GatewayIntentBits, Partials } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
dotenv.config();

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

// Normalize and validate token early for clearer errors (especially on Render)
const envPath = path.resolve(process.cwd(), '.env');
const rawToken = (process.env.BOT_TOKEN || '').trim();
// Some guides mistakenly include the "Bot " prefix; discord.js expects the raw token only.
const token = rawToken.startsWith('Bot ') ? rawToken.slice(4).trim() : rawToken;

if (!token) {
  const hasDotEnv = fs.existsSync(envPath);
  console.error('❌ BOT_TOKEN is missing. Set it in your environment or .env (without quotes or the "Bot " prefix).');
  console.error(`   Working directory: ${process.cwd()}`);
  console.error(`   .env present here: ${hasDotEnv ? 'yes' : 'no'} (${envPath})`);
  console.error('   PowerShell quick test (temporary for this session):');
  console.error('     $env:BOT_TOKEN = "your_token_here"');
  console.error('     npm start');
  process.exit(1);
}

console.log('🚀 Starting Discord bot...');
client.login(token);
