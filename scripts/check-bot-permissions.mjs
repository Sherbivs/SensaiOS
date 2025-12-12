#!/usr/bin/env node
/**
 * Emergency diagnostic: Check bot permissions for role management
 */

import { Client, GatewayIntentBits, PermissionsBitField } from 'discord.js';
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
    const botMember = guild.members.me;
    
    console.log('=== BOT MEMBER INFO ===');
    console.log(`Bot: ${botMember.user.tag}`);
    console.log(`Bot ID: ${botMember.id}`);
    console.log(`Nickname: ${botMember.nickname || '(none)'}`);
    console.log(`Joined: ${botMember.joinedAt?.toISOString()}`);
    console.log('');
    
    // Check critical permissions
    const permissions = botMember.permissions;
    console.log('=== BOT PERMISSIONS ===');
    console.log(`Administrator: ${permissions.has(PermissionsBitField.Flags.Administrator) ? '✅ YES' : '❌ NO'}`);
    console.log(`Manage Roles: ${permissions.has(PermissionsBitField.Flags.ManageRoles) ? '✅ YES' : '❌ NO'}`);
    console.log(`Manage Guild: ${permissions.has(PermissionsBitField.Flags.ManageGuild) ? '✅ YES' : '❌ NO'}`);
    console.log(`View Audit Log: ${permissions.has(PermissionsBitField.Flags.ViewAuditLog) ? '✅ YES' : '❌ NO'}`);
    console.log('');
    
    // Check bot role hierarchy
    const botHighestRole = botMember.roles.highest;
    console.log('=== BOT ROLE HIERARCHY ===');
    console.log(`Highest Role: ${botHighestRole.name}`);
    console.log(`Position: ${botHighestRole.position}`);
    console.log(`Color: ${botHighestRole.hexColor}`);
    console.log('');
    
    // Check Trainer role assignment capability
    const trainerRole = guild.roles.cache.find(r => r.name === 'Trainer');
    if (trainerRole) {
      console.log('=== TRAINER ROLE CHECK ===');
      console.log(`Trainer Role: ${trainerRole.name}`);
      console.log(`Position: ${trainerRole.position}`);
      console.log('');
      
      const canAssign = botHighestRole.position > trainerRole.position;
      console.log(`Can Bot Assign Trainer Role? ${canAssign ? '✅ YES' : '❌ NO'}`);
      
      if (!canAssign) {
        console.log('');
        console.log('⚠️  CRITICAL ISSUE FOUND:');
        console.log('   Bot\'s highest role position MUST be HIGHER than Trainer role');
        console.log(`   Current: Bot=${botHighestRole.position}, Trainer=${trainerRole.position}`);
        console.log('   Fix: Move bot\'s role above Trainer in Discord Server Settings > Roles');
      }
    } else {
      console.log('❌ Trainer role not found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
});

client.login(BOT_TOKEN);
