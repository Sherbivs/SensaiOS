/**
 * DRIPTVDD Test Initialization Script
 * 
 * Initializes the game for DRIPTVDD (Project CEO) for testing:
 * 1. Ensures user record exists in database
 * 2. Creates/verifies homestead channel (private guild channel)
 * 3. Sends starter Pokémon selection to homestead channel
 * 
 * Usage:
 *   npx tsx scripts/init-driptvdd-test.ts              # Uses PROJECT_LEADERSHIP.CEO.discordId
 *   npx tsx scripts/init-driptvdd-test.ts <discord_id> # Override with specific ID
 *   npm run test:init-ceo                              # Via npm script
 *   npm run test:init-ceo -- <discord_id>              # With ID override
 * 
 * Requirements:
 *   - BOT_TOKEN set in environment
 *   - PROD_DATABASE_URL set in environment
 *   - Bot must be in the target guild
 *   - User must be in the target guild
 * 
 * To find your Discord ID:
 *   1. Enable Developer Mode in Discord Settings → Advanced
 *   2. Right-click your username → Copy User ID
 * 
 * @security Only DRIPTVDD (Discord ID: 398910451420348448) should be initialized
 *           for production. CLI override is for testing only.
 */

/* eslint-disable no-console */

import { Client, GatewayIntentBits, User } from 'discord.js';
import pg from 'pg';
import { PROJECT_LEADERSHIP } from '../src/shared/constants.js';
import { buildStartersEmbed, buildStartersButtons } from '../src/bot/homestead/starters.js';

// Raw pg client for scripts (more reliable than Prisma adapter-pg for short-lived scripts)
const { Pool } = pg;

// ============================================================================
// Configuration
// ============================================================================

// Discord ID can be overridden via command line: npx tsx scripts/init-driptvdd-test.ts <discord_id>
const CLI_DISCORD_ID = process.argv[2];
const DRIPTVDD_DISCORD_ID = CLI_DISCORD_ID || PROJECT_LEADERSHIP.CEO.discordId; // 398910451420348448
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.DISCORD_TOKEN;

// Guild ID can be provided via env or auto-detected from bot's first guild
let GUILD_ID: string | undefined = process.env.DISCORD_GUILD_ID;

// ============================================================================
// Validation
// ============================================================================

function validateEnvironment(): void {
  const missing: string[] = [];
  
  if (!BOT_TOKEN) missing.push('BOT_TOKEN or DISCORD_TOKEN');
  if (!process.env.PROD_DATABASE_URL) missing.push('PROD_DATABASE_URL');
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    console.error('\nLoad environment first:');
    console.error('   pwsh -File scripts/setup_ai_env.ps1 -EnvFile "secrets/Infinity-Gauntlet.env"');
    process.exit(1);
  }
  
  // Note: GUILD_ID is optional - will auto-detect if not set
  if (!GUILD_ID) {
    console.log('ℹ️  DISCORD_GUILD_ID not set - will auto-detect from bot\'s guilds');
  }
  
  // Show if using CLI override
  if (CLI_DISCORD_ID) {
    console.log(`ℹ️  Using CLI-provided Discord ID: ${CLI_DISCORD_ID}`);
    console.log('   (Override PROJECT_LEADERSHIP.CEO.discordId)');
  }
}

// ============================================================================
// Main Initialization
// ============================================================================

async function initializeDRIPTVDD(): Promise<void> {
  console.log('🎮 DRIPTVDD Test Initialization');
  console.log('================================');
  console.log(`Target User: ${PROJECT_LEADERSHIP.CEO.displayName}`);
  console.log(`Discord ID: ${DRIPTVDD_DISCORD_ID}`);
  console.log(`Role: ${PROJECT_LEADERSHIP.CEO.role}`);
  console.log('');

  // Step 1: Ensure user exists in database FIRST (before Discord ops)
  // Using raw pg for scripts (more reliable than Prisma adapter-pg for short-lived scripts)
  console.log('💾 Step 1: Ensuring database user record...');
  
  const dbUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  
  try {
    // Check if user exists
    const checkResult = await pool.query(
      'SELECT id, "discordId", coins FROM "User" WHERE "discordId" = $1',
      [DRIPTVDD_DISCORD_ID]
    );
    
    let dbUserId: number;
    let dbCoins: number;
    
    if (checkResult.rows.length === 0) {
      // Create new user
      console.log('   Creating new user record...');
      const createResult = await pool.query(
        'INSERT INTO "User" ("discordId", coins) VALUES ($1, 100) RETURNING id, coins',
        [DRIPTVDD_DISCORD_ID]
      );
      dbUserId = createResult.rows[0].id;
      dbCoins = createResult.rows[0].coins;
      console.log(`   ✅ Created new user (ID: ${dbUserId})`);
    } else {
      dbUserId = checkResult.rows[0].id;
      dbCoins = checkResult.rows[0].coins;
      console.log(`   ✅ Found existing user (ID: ${dbUserId})`);
    }
    console.log(`   Coins: ${dbCoins}`);
    
    // Close pool - we'll reconnect when needed
    await pool.end();
  } catch (dbError) {
    console.error('   ❌ Database error:', dbError);
    await pool.end();
    throw dbError;
  }

  // Step 2: Create Discord client
  console.log('\n📡 Step 2: Connecting to Discord...');
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
    ],
  });

  try {
    await client.login(BOT_TOKEN);
    console.log(`   ✅ Logged in as ${client.user?.tag}`);

    // Wait for client to be ready
    await new Promise<void>((resolve) => {
      if (client.isReady()) {
        resolve();
      } else {
        client.once('ready', () => resolve());
      }
    });

    // Step 2: Fetch guild (auto-detect if not provided)
    console.log('\n🏰 Step 3: Fetching guild...');
    
    // Auto-detect guild if not provided
    if (!GUILD_ID) {
      const guilds = client.guilds.cache;
      if (guilds.size === 0) {
        throw new Error('Bot is not in any guilds. Invite the bot to a server first.');
      }
      if (guilds.size === 1) {
        GUILD_ID = guilds.first()!.id;
        console.log(`   🔍 Auto-detected guild: ${guilds.first()!.name}`);
      } else {
        console.log('   ⚠️  Bot is in multiple guilds:');
        guilds.forEach(g => console.log(`      - ${g.name} (${g.id})`));
        console.log('\n   Set DISCORD_GUILD_ID to select one.');
        throw new Error('Multiple guilds found. Please set DISCORD_GUILD_ID.');
      }
    }
    
    const guild = await client.guilds.fetch(GUILD_ID!);
    console.log(`   ✅ Guild: ${guild.name} (${guild.id})`);
    console.log(`   Members: ${guild.memberCount}`);

    // Step 4: Fetch DRIPTVDD user
    console.log('\n👤 Step 4: Fetching DRIPTVDD...');
    let driptvddUser: User;
    try {
      // Fetch as guild member (more reliable than global user fetch)
      const member = await guild.members.fetch(DRIPTVDD_DISCORD_ID);
      if (member) {
        driptvddUser = member.user;
        console.log(`   ✅ Found as guild member: ${driptvddUser.tag} (${driptvddUser.id})`);
        console.log(`   Display Name: ${member.displayName}`);
        console.log(`   Roles: ${member.roles.cache.map((r: { name: string }) => r.name).join(', ')}`);
      } else {
        // Fallback to global user fetch
        driptvddUser = await client.users.fetch(DRIPTVDD_DISCORD_ID);
        console.log(`   ✅ Found globally: ${driptvddUser.tag} (${driptvddUser.id})`);
      }
    } catch (error) {
      // If member fetch fails, the user may not be in this guild
      console.error(`   ❌ Could not find user ${DRIPTVDD_DISCORD_ID} in guild ${guild.name}`);
      console.error('   Possible reasons:');
      console.error('   1. DRIPTVDD is not a member of this guild');
      console.error('   2. The Discord ID may be incorrect');
      console.error('   3. Bot lacks permission to view members');
      console.error('');
      console.error('   To find your Discord ID:');
      console.error('   1. Enable Developer Mode in Discord Settings');
      console.error('   2. Right-click your username → Copy User ID');
      throw error;
    }

    // Verify this is actually DRIPTVDD (anti-spoofing)
    if (!PROJECT_LEADERSHIP.isCEO(driptvddUser.id)) {
      throw new Error(`Security violation: User ${driptvddUser.id} is not DRIPTVDD`);
    }
    console.log('   🔐 Identity verified via PROJECT_LEADERSHIP.isCEO()');

    // Step 5: Create/get homestead channel (using raw Discord API + pg)
    console.log('\n🏠 Step 5: Creating homestead channel...');
    
    const channelName = `homestead-${driptvddUser.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    
    // Check for existing channel
    let homesteadChannel = guild.channels.cache.find(
      ch => ch.name === channelName && ch.type === 0 // 0 = GUILD_TEXT
    );
    
    let isNew = false;
    if (!homesteadChannel) {
      // Create new homestead channel
      console.log(`   Creating #${channelName}...`);
      
      // Find or create Homesteads category
      let homesteadsCategory = guild.channels.cache.find(
        ch => ch.name.toLowerCase() === 'homesteads' && ch.type === 4 // 4 = GUILD_CATEGORY
      );
      
      if (!homesteadsCategory) {
        console.log('   Creating Homesteads category...');
        homesteadsCategory = await guild.channels.create({
          name: 'Homesteads',
          type: 4, // GUILD_CATEGORY
          reason: 'Homestead channels for Pokémon Infinity Gauntlet'
        });
      }
      
      // Create channel with permissions (private to user)
      homesteadChannel = await guild.channels.create({
        name: channelName,
        type: 0, // GUILD_TEXT
        parent: homesteadsCategory.id,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone
            deny: ['ViewChannel'],
          },
          {
            id: driptvddUser.id, // The user
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
          },
          {
            id: client.user!.id, // The bot
            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageMessages', 'EmbedLinks'],
          },
        ],
        reason: `Homestead channel for ${driptvddUser.tag}`
      });
      isNew = true;
      console.log(`   ✅ Created #${channelName}`);
    } else {
      console.log(`   ✅ Found existing #${channelName}`);
    }
    
    console.log(`   Channel ID: ${homesteadChannel.id}`);
    console.log(`   Is New: ${isNew}`);
    console.log(`   Category: ${homesteadChannel.parent?.name || 'None'}`);

    // Step 6: Send starter selection
    console.log('\n🎁 Step 6: Sending starter Pokémon selection...');
    
    // Type guard - ensure it's a text channel
    if (!homesteadChannel.isTextBased()) {
      throw new Error('Homestead channel is not a text channel');
    }
    
    const embed = buildStartersEmbed();
    const components = buildStartersButtons();
    
    const welcomeMessage = await homesteadChannel.send({
      content: `# 🎉 Welcome to Pokémon Infinity Gauntlet, ${PROJECT_LEADERSHIP.CEO.displayName}!\n\nThis is your private **Homestead Channel** where all your Pokémon adventures take place.\n\n**Choose your first Pokémon below to begin your journey!**`,
    });
    console.log(`   ✅ Welcome message sent (ID: ${welcomeMessage.id})`);

    const starterMessage = await homesteadChannel.send({
      embeds: [embed],
      components,
    });
    console.log(`   ✅ Starter selection sent (ID: ${starterMessage.id})`);

    // Summary
    console.log('\n================================');
    console.log('✅ DRIPTVDD TEST INITIALIZATION COMPLETE');
    console.log('================================');
    console.log('');
    console.log('Next steps:');
    console.log(`1. Open Discord and go to server: ${guild.name}`);
    console.log(`2. Find channel: #${channelName}`);
    console.log('3. Click a starter Pokémon button to select your first Pokémon');
    console.log('4. Use /home to view your party and box');
    console.log('');

  } catch (error) {
    console.error('\n❌ Initialization failed:', error);
    throw error;
  } finally {
    // Clean up
    console.log('🔌 Disconnecting from Discord...');
    client.destroy();
    console.log('   ✅ Disconnected');
  }
}

// ============================================================================
// Entry Point
// ============================================================================

validateEnvironment();

initializeDRIPTVDD()
  .then(() => {
    console.log('\n👋 Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  });
