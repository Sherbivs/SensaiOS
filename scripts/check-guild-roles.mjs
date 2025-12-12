#!/usr/bin/env node
/**
 * Emergency diagnostic: Check guild roles to identify missing Trainer role
 */

import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';

// Load environment
const envFile = process.env.IG_ENV_FILE || './secrets/Infinity-Gauntlet.env';
dotenv.config({ path: envFile });

const BOT_TOKEN = process.env.SECURITY_BOT_TOKEN || process.env.BOT_TOKEN;
const GUILD_ID = '1100976155579912222'; // Black Infinity Gauntlet

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not found');
  process.exit(1);
}

const client = new Client({ 
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] 
});

client.once('ready', async () => {
  console.log(`\n✅ Logged in as: ${client.user.tag}\n`);
  
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    console.log(`📋 Guild: ${guild.name} (ID: ${guild.id})`);
    console.log(`   Members: ${guild.memberCount}`);
    console.log('');
    
    // Fetch all roles (force fresh)
    await guild.roles.fetch();
    
    const roles = guild.roles.cache
      .filter(r => r.id !== guild.id) // Exclude @everyone
      .sort((a, b) => b.position - a.position);
    
    console.log('=== GUILD ROLES ===');
    console.log(`Total roles (excluding @everyone): ${roles.size}\n`);
    
    roles.forEach(role => {
      const pos = role.position.toString().padStart(3);
      const name = role.name.padEnd(30);
      const managed = role.managed ? '[MANAGED]' : '';
      console.log(`${pos} | ${name} | ID: ${role.id} ${managed}`);
    });
    
    console.log('');
    
    // Check for "Trainer" role specifically
    const trainerRole = roles.find(r => r.name.toLowerCase() === 'trainer');
    if (trainerRole) {
      console.log('✅ "Trainer" role FOUND');
      console.log(`   Name: ${trainerRole.name}`);
      console.log(`   ID: ${trainerRole.id}`);
      console.log(`   Position: ${trainerRole.position}`);
      console.log(`   Color: ${trainerRole.hexColor}`);
      console.log(`   Managed: ${trainerRole.managed ? 'YES' : 'NO'}`);
    } else {
      console.log('❌ "Trainer" role NOT FOUND');
      console.log('   This is why new members are not receiving roles!');
      console.log('   You need to either:');
      console.log('   1. Create a role named "Trainer" in your Discord server');
      console.log('   2. Set ROLE_ID environment variable to an existing role ID');
      console.log('   3. Set ROLE_NAME environment variable to match an existing role name');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
});

client.login(BOT_TOKEN);
