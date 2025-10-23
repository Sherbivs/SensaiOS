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

const ROLE_NAME = (process.env.ROLE_NAME || 'Trainer').trim();
const ROLE_ID = (process.env.ROLE_ID || '').trim();
const BACKFILL_CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY || 8); // higher = faster, mind rate limits
const BACKFILL_DELAY_MS = Number(process.env.BACKFILL_DELAY_MS || 20); // delay between batches
const BACKFILL_INTERVAL_MIN = Number(process.env.BACKFILL_INTERVAL_MIN || 0); // 0 = disabled

function hasNoAssignableRoles(member) {
  // members always have @everyone; size === 1 means no additional roles
  return member.roles.cache.size <= 1;
}

function findRole(guild) {
  if (ROLE_ID) {
    return guild.roles.cache.get(ROLE_ID) || null;
  }
  const target = ROLE_NAME.toLowerCase();
  return guild.roles.cache.find(r => r.name.toLowerCase() === target) || null;
}

async function ensureTrainerFor(member) {
  const role = findRole(member.guild);
  if (!role) {
    console.error(`⚠️ Role "${ROLE_NAME}"${ROLE_ID ? ` (#${ROLE_ID})` : ''} not found in ${member.guild.name}`);
    return;
  }

  if (!hasNoAssignableRoles(member)) {
    return; // member already has a role beyond @everyone; skip
  }

  try {
    await member.roles.add(role);
    console.log(`🎉 Added ${member.user.tag} to ${ROLE_NAME}`);
  } catch (error) {
    console.error(`❌ Failed to assign ${ROLE_NAME} to ${member.user.tag}:`, error);
  }
}

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  // Backfill: assign role to existing members with no roles (beyond @everyone)
  // This runs once on startup. Requires Server Members Intent enabled.
  (async () => {
    for (const [, guild] of client.guilds.cache) {
      console.log(`🔎 Scanning guild: ${guild.name}`);
      try {
        // Ensure we have members cached; fetch all if privileged intent is enabled
        await guild.members.fetch();
        const toAssign = guild.members.cache.filter(m => hasNoAssignableRoles(m));
        if (toAssign.size === 0) {
          console.log(`✅ No members need ${ROLE_NAME} in ${guild.name}`);
          continue;
        }

        const role = findRole(guild);
        if (!role) {
          console.error(`⚠️ Role "${ROLE_NAME}" not found in ${guild.name}; skipping backfill.`);
          continue;
        }

        const members = Array.from(toAssign.values());
        let success = 0, failed = 0;

        for (let i = 0; i < members.length; i += BACKFILL_CONCURRENCY) {
          const batch = members.slice(i, i + BACKFILL_CONCURRENCY);
          await Promise.all(batch.map(async (member) => {
            try {
              await member.roles.add(role);
              success++;
            } catch (err) {
              failed++;
            }
          }));
          if (BACKFILL_DELAY_MS > 0) {
            await new Promise(r => setTimeout(r, BACKFILL_DELAY_MS));
          }
        }
        console.log(`📌 Backfill in ${guild.name}: assigned=${success}, failed=${failed} (concurrency=${BACKFILL_CONCURRENCY}, delayMs=${BACKFILL_DELAY_MS})`);
      } catch (err) {
        console.error(`❌ Backfill failed in ${guild.name}:`, err);
      }
    }
  })();

  if (BACKFILL_INTERVAL_MIN > 0) {
    const intervalMs = BACKFILL_INTERVAL_MIN * 60 * 1000;
    console.log(`⏱️ Periodic sweep enabled: every ${BACKFILL_INTERVAL_MIN} minute(s)`);
    setInterval(async () => {
      for (const [, guild] of client.guilds.cache) {
        try {
          await guild.members.fetch();
          const toAssign = guild.members.cache.filter(m => hasNoAssignableRoles(m));
          if (toAssign.size === 0) continue;
          const role = findRole(guild);
          if (!role) continue;
          const members = Array.from(toAssign.values());
          for (let i = 0; i < members.length; i += BACKFILL_CONCURRENCY) {
            const batch = members.slice(i, i + BACKFILL_CONCURRENCY);
            await Promise.all(batch.map(m => m.roles.add(role).catch(() => {})));
            if (BACKFILL_DELAY_MS > 0) {
              await new Promise(r => setTimeout(r, BACKFILL_DELAY_MS));
            }
          }
        } catch {}
      }
    }, intervalMs);
  }
});

client.on('guildMemberAdd', async (member) => {
  await ensureTrainerFor(member);
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
