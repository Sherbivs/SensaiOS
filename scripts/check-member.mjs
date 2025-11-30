#!/usr/bin/env node
/**
 * Quick diagnostic script to check why a specific member hasn't been assigned a role
 * 
 * Usage: node scripts/check-member.mjs <member-id> [<guild-id>]
 */

import { Client, GatewayIntentBits } from 'discord.js';

const BOT_TOKEN = process.env.BOT_TOKEN || process.env.SECURITY_BOT_TOKEN;
const MEMBER_ID = process.argv[2];
const GUILD_ID = process.argv[3];

if (!BOT_TOKEN) {
  console.error('❌ Missing BOT_TOKEN or SECURITY_BOT_TOKEN environment variable');
  process.exit(1);
}

if (!MEMBER_ID) {
  console.error('❌ Usage: node scripts/check-member.mjs <member-id> [<guild-id>]');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  console.log(`✅ Connected as ${client.user.tag}`);
  console.log(`🔍 Checking member: ${MEMBER_ID}`);
  console.log('');

  try {
    // Get guilds to search
    const guildsToSearch = GUILD_ID
      ? [client.guilds.cache.get(GUILD_ID)]
      : Array.from(client.guilds.cache.values());

    if (!guildsToSearch.length || !guildsToSearch[0]) {
      console.error('❌ No guilds found or invalid guild ID');
      process.exit(1);
    }

    let memberFound = false;

    for (const guild of guildsToSearch) {
      console.log(`🏰 Checking guild: ${guild.name} (${guild.id})`);
      
      try {
        // Fetch member with fresh data from Discord API (bypass cache)
        const member = await guild.members.fetch({ user: MEMBER_ID, force: true });
        memberFound = true;

        console.log('');
        console.log('👤 MEMBER DETAILS:');
        console.log(`   Tag: ${member.user.tag}`);
        console.log(`   ID: ${member.id}`);
        console.log(`   Bot: ${member.user.bot ? '⚠️  YES' : '✅ NO'}`);
        console.log(`   Joined: ${member.joinedAt}`);
        console.log('');

        // Check roles
        const roles = member.roles.cache
          .filter(r => r.id !== guild.id) // Exclude @everyone
          .map(r => ({ name: r.name, id: r.id, position: r.position }))
          .sort((a, b) => b.position - a.position);

        console.log('🎭 MEMBER ROLES:');
        if (roles.length === 0) {
          console.log('   ⚠️  NO ROLES (only @everyone)');
        } else {
          roles.forEach(r => {
            console.log(`   - ${r.name} (ID: ${r.id}, Position: ${r.position})`);
          });
        }
        console.log('');

        // Check Trainer role
        const trainerRole = guild.roles.cache.find(r => r.name.toLowerCase() === 'trainer');
        if (!trainerRole) {
          console.log('❌ Trainer role NOT FOUND in guild');
        } else {
          console.log('✅ TRAINER ROLE FOUND:');
          console.log(`   Name: ${trainerRole.name}`);
          console.log(`   ID: ${trainerRole.id}`);
          console.log(`   Position: ${trainerRole.position}`);
          console.log(`   Color: ${trainerRole.hexColor}`);
          console.log('');

          const hasTrainer = member.roles.cache.has(trainerRole.id);
          if (hasTrainer) {
            console.log('✅ Member HAS Trainer role');
          } else {
            console.log('❌ Member MISSING Trainer role');
          }
        }
        console.log('');

        // Check bot permissions
        const botMember = guild.members.me;
        const canManageRoles = botMember.permissions.has('ManageRoles');
        const botHighestRole = botMember.roles.highest;

        console.log('🤖 BOT PERMISSIONS:');
        console.log(`   Can Manage Roles: ${canManageRoles ? '✅ YES' : '❌ NO'}`);
        console.log(`   Highest Role: ${botHighestRole.name} (Position: ${botHighestRole.position})`);
        
        if (trainerRole) {
          const canAssignTrainer = botHighestRole.position > trainerRole.position;
          console.log(`   Can Assign Trainer: ${canAssignTrainer ? '✅ YES' : '❌ NO (role hierarchy issue)'}`);
        }
        console.log('');

        // Check eligibility
        console.log('📊 ELIGIBILITY CHECK:');
        if (member.user.bot) {
          console.log('   ❌ INELIGIBLE: Member is a bot');
        } else if (!trainerRole) {
          console.log('   ❌ INELIGIBLE: Trainer role not found');
        } else if (!canManageRoles) {
          console.log('   ❌ INELIGIBLE: Bot lacks MANAGE_ROLES permission');
        } else if (botHighestRole.position <= trainerRole.position) {
          console.log('   ❌ INELIGIBLE: Bot role hierarchy too low');
        } else if (member.roles.cache.has(trainerRole.id)) {
          console.log('   ✅ Already has Trainer role');
        } else if (roles.length === 0) {
          console.log('   ✅ ELIGIBLE: Has no roles, should be assigned Trainer');
        } else {
          console.log('   ⚠️  Has other roles but missing Trainer (edge case)');
          console.log('      Sweep should catch this but may need manual assignment');
        }
        console.log('');

      } catch (error) {
        if (error.code === 10007) {
          console.log(`   ⚠️  Member not found in this guild`);
        } else {
          console.error(`   ❌ Error: ${error.message}`);
        }
      }
    }

    if (!memberFound) {
      console.error('❌ Member not found in any guild');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }

  process.exit(0);
});

client.login(BOT_TOKEN);
