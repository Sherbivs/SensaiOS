/**
 * Diagnostic script to test homestead bootstrap prerequisites
 * Run with: npx tsx scripts/diagnose-homestead.ts
 */

import { Client, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { prisma } from '../src/shared/prisma.js';

const GUILD_ID = '1100976155579912222';
const DISCORD_ID = '563220840708177927';

async function main() {
  console.log('=== HOMESTEAD DIAGNOSTIC ===\n');

  // Step 1: Check database
  console.log('1. Checking database...');
  try {
    const homestead = await prisma.homesteadChannel.findFirst({
      where: {
        OR: [
          { status: 'deleted' },
          { channelId: 'pending-creation' },
        ],
      },
      include: { user: true },
    });
    
    if (homestead) {
      console.log('   ✅ Found homestead to recover:');
      console.log(`      ID: ${homestead.id}`);
      console.log(`      Status: ${homestead.status}`);
      console.log(`      Guild ID: ${homestead.guildId}`);
      console.log(`      User ID (internal): ${homestead.userId}`);
      console.log(`      Discord ID: ${homestead.user?.discordId || 'MISSING!'}`);
    } else {
      console.log('   ❌ No homesteads need recovery');
    }
  } catch (err) {
    console.log(`   ❌ Database error: ${err}`);
  }

  // Step 2: Test Discord client
  console.log('\n2. Testing Discord client...');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
    ],
  });

  try {
    await client.login(process.env.BOT_TOKEN);
    console.log('   ✅ Logged in as:', client.user?.tag);

    // Wait for ready
    await new Promise<void>((resolve) => {
      if (client.isReady()) resolve();
      else client.once('ready', () => resolve());
    });

    // Step 3: Test guild fetch
    console.log('\n3. Testing guild fetch...');
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      console.log(`   ✅ Guild found: ${guild.name}`);
      console.log(`   Members: ${guild.memberCount}`);
      
      // Check bot permissions
      const me = guild.members.me;
      if (me) {
        const perms = me.permissions;
        console.log(`   Bot permissions:`);
        console.log(`      - ManageChannels: ${perms.has(PermissionFlagsBits.ManageChannels) ? '✅' : '❌'}`);
        console.log(`      - ViewChannel: ${perms.has(PermissionFlagsBits.ViewChannel) ? '✅' : '❌'}`);
        console.log(`      - SendMessages: ${perms.has(PermissionFlagsBits.SendMessages) ? '✅' : '❌'}`);
        console.log(`      - ManageRoles: ${perms.has(PermissionFlagsBits.ManageRoles) ? '✅' : '❌'}`);
      } else {
        console.log('   ⚠️ Could not get bot member from guild');
      }
    } catch (err) {
      console.log(`   ❌ Guild fetch failed: ${err}`);
    }

    // Step 4: Test user fetch
    console.log('\n4. Testing user fetch...');
    try {
      const user = await client.users.fetch(DISCORD_ID);
      console.log(`   ✅ User found: ${user.tag} (${user.id})`);
    } catch (err) {
      console.log(`   ❌ User fetch failed: ${err}`);
    }

    // Step 5: List categories in guild
    console.log('\n5. Checking for Homesteads category...');
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const channels = await guild.channels.fetch();
      const categories = channels.filter(c => c?.type === 4); // CategoryChannel
      console.log(`   Categories in guild:`);
      categories.forEach(cat => {
        console.log(`      - ${cat?.name} (${cat?.id})`);
      });
      
      const homesteadsCategory = categories.find(c => c?.name.toLowerCase() === 'homesteads');
      if (homesteadsCategory) {
        console.log(`   ✅ Homesteads category exists: ${homesteadsCategory.id}`);
      } else {
        console.log(`   ⚠️ Homesteads category does not exist - will be created on first channel`);
      }
    } catch (err) {
      console.log(`   ❌ Channel fetch failed: ${err}`);
    }

  } catch (err) {
    console.log(`   ❌ Login failed: ${err}`);
  } finally {
    client.destroy();
    await prisma.$disconnect();
  }

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

main().catch(console.error);
