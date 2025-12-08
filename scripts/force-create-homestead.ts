/**
 * Force create homestead channel for DripTVDD
 * This bypasses the bootstrap and directly creates the channel
 * 
 * Run with: npx tsx scripts/force-create-homestead.ts
 */

import { Client, GatewayIntentBits } from 'discord.js';
import { prisma } from '../src/shared/prisma.js';
import { HomesteadChannelManager } from '../src/services/homestead-manager.js';
import { initializeConnection } from '../src/shared/pg-connection.js';

const GUILD_ID = '1100976155579912222';
const DISCORD_ID = '563220840708177927';

async function main() {
  console.log('=== FORCE CREATE HOMESTEAD FOR DRIPTVDD ===\n');

  // Force PROD-only mode by clearing local DB URLs
  process.env.DATABASE_ONPREMISE_DEV_PRIMARY = '';
  process.env.DATABASE_ONPREMISE_DEV_EXPERIMENT = '';

  // Initialize PostgreSQL pool first
  console.log('0. Initializing PostgreSQL connection...');
  await initializeConnection();
  console.log('   ✅ PostgreSQL pool initialized');

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  try {
    console.log('1. Logging into Discord...');
    await client.login(process.env.BOT_TOKEN);
    
    // Wait for ready
    await new Promise<void>((resolve) => {
      if (client.isReady()) resolve();
      else client.once('ready', () => resolve());
    });
    console.log(`   ✅ Logged in as: ${client.user?.tag}`);

    console.log('\n2. Fetching guild...');
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`   ✅ Guild: ${guild.name}`);

    console.log('\n3. Fetching user...');
    const user = await client.users.fetch(DISCORD_ID);
    console.log(`   ✅ User: ${user.tag} (${user.id})`);

    console.log('\n4. Creating HomesteadChannelManager...');
    const manager = new HomesteadChannelManager(client, GUILD_ID, guild);
    console.log('   ✅ Manager created');

    console.log('\n5. Calling getOrCreateChannel...');
    const result = await manager.getOrCreateChannel(user);
    console.log(`   ✅ Channel created/found:`);
    console.log(`      ID: ${result.channel.id}`);
    console.log(`      Name: ${result.channel.name}`);
    console.log(`      Is New: ${result.isNew}`);

    console.log('\n6. Sending welcome message...');
    await result.channel.send({
      content: `🏠 **Welcome to your Homestead, ${user.username}!**\n\n` +
               `This is your private channel for managing your Pokémon adventure.\n\n` +
               `Use \`/home\` to see your profile and party!`,
    });
    console.log('   ✅ Message sent!');

    console.log('\n7. Checking database status...');
    const homestead = await prisma.homesteadChannel.findFirst({
      where: { channelId: result.channel.id },
    });
    if (homestead) {
      console.log('   ✅ Database record:');
      console.log(`      ID: ${homestead.id}`);
      console.log(`      Status: ${homestead.status}`);
      console.log(`      Channel ID: ${homestead.channelId}`);
    } else {
      console.log('   ⚠️ No database record found!');
    }

    console.log('\n=== SUCCESS! Homestead channel created ===');
    console.log(`Channel: <#${result.channel.id}>`);

  } catch (err) {
    console.error('\n❌ ERROR:', err);
  } finally {
    client.destroy();
    await prisma.$disconnect();
  }
}

main().catch(console.error);
