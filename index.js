const { Client, GatewayIntentBits, Partials } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');

dotenv.config();

const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR'
});

function log(level, message, context) {
  const timestamp = new Date().toISOString();
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  const writer = level === 'error' ? console.error : console.log;

  writer(`[${timestamp}] [${label}] ${message}`);
  if (!context) {
    return;
  }

  if (Array.isArray(context)) {
    context.forEach(item => writer(`    ${item}`));
    return;
  }

  if (context instanceof Map) {
    for (const [key, value] of context.entries()) {
      writer(`    ${key}: ${value}`);
    }
    return;
  }

  if (typeof context === 'object') {
    for (const [key, value] of Object.entries(context)) {
      writer(`    ${key}: ${value}`);
    }
    return;
  }

  writer(`    ${context}`);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.User]
});

const DEFAULT_ROLE_NAME = 'Trainer';
const ROLE_NAME = (process.env.ROLE_NAME || DEFAULT_ROLE_NAME).trim();
const ROLE_ID = (process.env.ROLE_ID || '').trim();
const BACKFILL_CONCURRENCY = Math.max(1, Number(process.env.BACKFILL_CONCURRENCY || 8)); // higher = faster, mind rate limits
const BACKFILL_DELAY_MS = Math.max(0, Number(process.env.BACKFILL_DELAY_MS || 20)); // delay between batches
const BACKFILL_INTERVAL_MIN = Math.max(0, Number(process.env.BACKFILL_INTERVAL_MIN || 0)); // 0 = disabled

const describeRole = (role) => `${role.name} (#${role.id})`;
const describeMember = (member) => `${member.user.tag} (#${member.id})`;
const describeGuild = (guild) => `${guild.name} (#${guild.id})`;

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

async function ensureTrainerFor(member, origin = 'unspecified') {
  const guildSummary = describeGuild(member.guild);
  const memberSummary = describeMember(member);

  const role = findRole(member.guild);
  if (!role) {
    log('warn', 'Target role not found; skipping assignment', {
      origin,
      guild: guildSummary,
      roleName: ROLE_NAME,
      roleId: ROLE_ID || 'resolved at runtime'
    });
    return;
  }

  if (!hasNoAssignableRoles(member)) {
    const assignableRoles = member.roles.cache
      .filter(r => r.id !== member.guild.roles.everyone.id)
      .map(describeRole);
    log('detail', 'Member already has assignable roles; no action taken', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      existingRoles: assignableRoles.length ? assignableRoles.join(', ') : 'n/a'
    });
    return;
  }

  try {
    await member.roles.add(role);
    log('success', 'Assigned target role to member', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role)
    });
  } catch (error) {
    log('error', 'Failed to assign target role to member', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      error: error.message
    });
  }
}

async function sweepGuild(guild, origin) {
  const guildSummary = describeGuild(guild);
  log('info', `Starting ${origin} sweep`, { guild: guildSummary });

  try {
    await guild.members.fetch();
    log('detail', 'Fetched guild member list', {
      guild: guildSummary,
      cachedMembers: guild.members.cache.size
    });
  } catch (error) {
    log('error', 'Unable to fetch guild members', {
      origin,
      guild: guildSummary,
      error: error.message
    });
    return;
  }

  const toAssign = guild.members.cache.filter(member => hasNoAssignableRoles(member));
  if (toAssign.size === 0) {
    log('info', 'No members require the target role after scan', {
      origin,
      guild: guildSummary
    });
    return;
  }

  const role = findRole(guild);
  if (!role) {
    log('warn', 'Target role missing; skipping sweep for guild', {
      origin,
      guild: guildSummary,
      roleName: ROLE_NAME,
      roleId: ROLE_ID || 'resolved at runtime'
    });
    return;
  }

  log('info', 'Assigning target role to members', {
    origin,
    guild: guildSummary,
    totalCandidates: toAssign.size,
    role: describeRole(role),
    concurrency: BACKFILL_CONCURRENCY,
    delayMsBetweenBatches: BACKFILL_DELAY_MS
  });

  const members = Array.from(toAssign.values());
  let success = 0;
  let failed = 0;

  for (let i = 0; i < members.length; i += BACKFILL_CONCURRENCY) {
    const batch = members.slice(i, i + BACKFILL_CONCURRENCY);
    await Promise.all(batch.map(async (member) => {
      try {
        await member.roles.add(role);
        success += 1;
        log('detail', 'Role assigned during sweep', {
          origin,
          guild: guildSummary,
          member: describeMember(member),
          role: describeRole(role)
        });
      } catch (error) {
        failed += 1;
        log('error', 'Failed to assign role during sweep', {
          origin,
          guild: guildSummary,
          member: describeMember(member),
          role: describeRole(role),
          error: error.message
        });
      }
    }));

    if (BACKFILL_DELAY_MS > 0 && i + BACKFILL_CONCURRENCY < members.length) {
      await new Promise(resolve => setTimeout(resolve, BACKFILL_DELAY_MS));
    }
  }

  log('info', 'Sweep finished', {
    origin,
    guild: guildSummary,
    assigned: success,
    failed,
    candidatesProcessed: members.length
  });
}

client.once('ready', () => {
  log('success', `Connected as ${client.user.tag}`, { userId: client.user.id });
  log('info', 'Runtime configuration', {
    roleName: ROLE_NAME,
    roleId: ROLE_ID || 'resolved at runtime',
    roleDiscovery: ROLE_ID ? 'ROLE_ID exact match' : 'ROLE_NAME case-insensitive search',
    startupBackfill: 'enabled',
    periodicSweep: BACKFILL_INTERVAL_MIN > 0 ? `every ${BACKFILL_INTERVAL_MIN} minute(s)` : 'disabled',
    concurrency: BACKFILL_CONCURRENCY,
    delayMsBetweenBatches: BACKFILL_DELAY_MS,
    guildsObserved: client.guilds.cache.size
  });

  if (client.guilds.cache.size === 0) {
    log('warn', 'Bot is not yet a member of any guilds. Invite the bot to begin assigning roles.');
  }

  (async () => {
    for (const [, guild] of client.guilds.cache) {
      await sweepGuild(guild, 'startup');
    }
  })();

  if (BACKFILL_INTERVAL_MIN > 0) {
    const intervalMs = BACKFILL_INTERVAL_MIN * 60 * 1000;
    log('info', 'Periodic sweep enabled', { intervalMinutes: BACKFILL_INTERVAL_MIN });
    setInterval(async () => {
      const cycleStarted = new Date().toISOString();
      log('info', 'Periodic sweep cycle started', { cycleStarted });
      for (const [, guild] of client.guilds.cache) {
        await sweepGuild(guild, 'periodic');
      }
      log('info', 'Periodic sweep cycle complete', {
        cycleStarted,
        cycleCompleted: new Date().toISOString()
      });
    }, intervalMs);
  }
});

client.on('guildMemberAdd', async (member) => {
  const guildSummary = describeGuild(member.guild);
  const memberSummary = describeMember(member);
  log('info', 'New member joined guild', {
    guild: guildSummary,
    member: memberSummary
  });

  await ensureTrainerFor(member, 'member-join');
});

// Normalize and validate token early for clearer errors (especially on Render)
const envPath = path.resolve(process.cwd(), '.env');
const rawToken = (process.env.BOT_TOKEN || '').trim();
// Some guides mistakenly include the "Bot " prefix; discord.js expects the raw token only.
const token = rawToken.startsWith('Bot ') ? rawToken.slice(4).trim() : rawToken;

if (!token) {
  const hasDotEnv = fs.existsSync(envPath);
  log('error', 'BOT_TOKEN is missing. Set it in your environment or .env (without quotes or the "Bot " prefix).', {
    workingDirectory: process.cwd(),
    envFilePresent: hasDotEnv ? 'yes' : 'no',
    envFilePath: envPath,
    quickTest: '$env:BOT_TOKEN = "your_token_here"'
  });
  process.exit(1);
}

log('info', 'Starting Discord bot login sequence');
client.login(token);
