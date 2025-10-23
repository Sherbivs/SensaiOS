const { Client, GatewayIntentBits, Partials } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
const cache = require('./cachePatch');


dotenv.config();

const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR'
});

const CLI_DEBUG_MODE = process.env.CLI_DEBUG_MODE === '1'
  || process.env.CLI_DEBUG_MODE === 'true'
  || process.argv.includes('--debug-cli')
  || process.argv.includes('--cli-debug');

cache.cleanOldCache();

const CACHE_KEYS = Object.freeze({
  memberAttempt: (guildId, memberId) => `member-attempt:${guildId}:${memberId}`,
  sweep: (guildId, origin) => `sweep:${origin}:${guildId}`,
  audit: (guildId) => `audit:${guildId}`,
});

const MEMBER_ASSIGNMENT_RETRY_DELAY_MS = Number(process.env.MEMBER_ASSIGNMENT_RETRY_DELAY_MS || 60_000);
const SWEEP_COOLDOWN_MS = Number(process.env.SWEEP_COOLDOWN_MS || 5 * 60_000);
const AUDIT_CACHE_LIMIT = Number(process.env.AUDIT_CACHE_LIMIT || 25);


function normalizeContext(context) {
  if (context instanceof Map) {
    return Object.fromEntries(context.entries());
  }
  if (context instanceof Set) {
    return Array.from(context.values());
  }
  return context;
}

function log(level, message, context) {
  const timestamp = new Date().toISOString();
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  const writer = level === 'error' ? console.error : console.log;

  writer(`[${timestamp}] [${label}] ${message}`);
  if (!context) {
    return;
  }

  const normalized = normalizeContext(context);

  if (CLI_DEBUG_MODE) {
    if (typeof normalized === 'string') {
      writer(`    ${normalized}`);
      return;
    }

    try {
      const serialized = JSON.stringify(normalized, null, 2);
      serialized.split('\n').forEach(line => writer(`    ${line}`));
      return;
    } catch {
      writer(`    ${String(normalized)}`);
      return;
    }
  }

  if (Array.isArray(normalized)) {
    normalized.forEach(item => writer(`    ${item}`));
    return;
  }

  if (normalized && typeof normalized === 'object') {
    for (const [key, value] of Object.entries(normalized)) {
      writer(`    ${key}: ${value}`);
    }
    return;
  }

  writer(`    ${normalized}`);
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
const CACHE_TTL_HOURS = Math.max(1, Number(process.env.CACHE_TTL_HOURS || 24));

const describeRole = (role) => `${role.name} (#${role.id})`;
const describeMember = (member) => `${member.user.tag} (#${member.id})`;
const describeGuild = (guild) => `${guild.name} (#${guild.id})`;

function canAssignRole(guild, role) {
  const me = guild.members.me;
  if (!me) return true; // assume true; discord.js will error if not
  const hasManage = me.permissions.has('ManageRoles');
  const above = me.roles.highest.position > role.position;
  if (!hasManage || !above) {
    log('warn', 'Bot may lack permission or hierarchy to assign role', {
      guild: describeGuild(guild),
      botHighestRole: me.roles.highest ? describeRole(me.roles.highest) : 'unknown',
      targetRole: describeRole(role),
      hasManageRoles: hasManage,
      botAboveTarget: above,
      hint: 'Ensure bot role is above target and has Manage Roles.'
    });
  }
  return hasManage && above;
}

const STANDARD_PERMISSIONS = {
  'Server admin': [
    'KickMembers','BanMembers','ManageChannels','ManageRoles','ManageGuild','ManageMessages','ModerateMembers',
    'ManageNicknames','ManageWebhooks','ManageEmojisAndStickers','ViewAuditLog','CreateEvents','UseApplicationCommands',
    'ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages','EmbedLinks','AttachFiles','ReadMessageHistory',
    'MentionEveryone','UseExternalEmojis','Connect','Speak','DeafenMembers','MoveMembers','UseVAD','PrioritySpeaker',
    'Stream','UseEmbeddedActivities','UseSoundboard','CreateGuildExpressions','UseExternalSounds','SendPolls','UseExternalApps'
  ],
  'Super Admin': [
    'KickMembers','BanMembers','ManageMessages','ModerateMembers','ManageNicknames','ViewAuditLog','CreateEvents',
    'UseApplicationCommands','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages','EmbedLinks',
    'AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','DeafenMembers','MoveMembers',
    'UseVAD','PrioritySpeaker','Stream','UseEmbeddedActivities','UseSoundboard','CreateGuildExpressions','UseExternalSounds',
    'SendPolls','UseExternalApps'
  ],
  'Admin': [
    'KickMembers','BanMembers','ManageMessages','ModerateMembers','ManageNicknames','ViewAuditLog','CreateEvents',
    'UseApplicationCommands','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages','EmbedLinks',
    'AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','DeafenMembers','MoveMembers',
    'UseVAD','PrioritySpeaker','Stream','UseEmbeddedActivities','UseSoundboard','CreateGuildExpressions','UseExternalSounds','SendPolls'
  ],
  'Gym Leader': [
    'ManageMessages','ModerateMembers','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages',
    'EmbedLinks','AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','UseVAD',
    'SendPolls','UseEmbeddedActivities'
  ],
  'Trainer': [
    'ManageMessages','ModerateMembers','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages',
    'EmbedLinks','AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','UseVAD',
    'SendPolls','UseEmbeddedActivities'
  ],
  'Trainers': [
    'ManageMessages','ModerateMembers','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages',
    'EmbedLinks','AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','UseVAD',
    'SendPolls','UseEmbeddedActivities'
  ],
  'Zapier': ['SendMessages','EmbedLinks','AttachFiles','ManageWebhooks','ViewChannel'],
  'FreshTok': ['SendMessages','EmbedLinks','AttachFiles','ManageWebhooks','ViewChannel'],
  'Server Booster': [
    'SendMessages','EmbedLinks','AttachFiles','Connect','Speak','UseVAD','CreatePublicThreads','CreatePrivateThreads',
    'UseSoundboard','UseExternalSounds'
  ],
  'Drip': 'ALL',
  'Pokétwo': ['SendMessages','ManageMessages','AddReactions','EmbedLinks','AttachFiles','ReadMessageHistory','UseExternalEmojis'],
  'Cards Against Discord': [
    'SendMessages','ManageMessages','AddReactions','EmbedLinks','AttachFiles','ReadMessageHistory','UseExternalEmojis','ManageThreads',
    'CreatePublicThreads','CreatePrivateThreads','UseExternalStickers','SendMessagesInThreads'
  ],
  'D&D Candidate': [],
  '@everyone': [
    'SendMessages','EmbedLinks','AttachFiles','ReadMessageHistory','Connect','Speak','CreatePublicThreads','CreatePrivateThreads',
    'UseApplicationCommands','AddReactions','UseExternalEmojis'
  ]
};
function analyzeRolePermissions(role) {
  const current = role.permissions.toArray();
  const standard = STANDARD_PERMISSIONS[role.name];

  if (!standard) {
    return {
      policy: 'unmanaged',
      expected: null,
      current,
      missing: [],
      extra: []
    };
  }

  if (standard === 'ALL') {
    return {
      policy: 'all',
      expected: 'ALL',
      current,
      missing: [],
      extra: []
    };
  }

  const missing = standard.filter(permission => !current.includes(permission));
  const extra = current.filter(permission => !standard.includes(permission));

  return {
    policy: 'standard',
    expected: standard,
    current,
    missing,
    extra
  };
}
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

async function reportGuildRoles(guild) {
  const guildSummary = describeGuild(guild);

  try {
    const roles = await guild.roles.fetch();
    if (!roles || roles.size === 0) {
      log('info', 'No roles discovered for guild', { guild: guildSummary });
      return;
    }

    const sortedRoles = roles.sort((a, b) => b.position - a.position);
    log('info', 'Role inventory snapshot', {
      guild: guildSummary,
      totalRoles: sortedRoles.size
    });

    sortedRoles.forEach(role => {
      const permissions = role.permissions.toArray();
      log('detail', 'Role permissions', {
        guild: guildSummary,
        role: describeRole(role),
        permissionsCount: permissions.length,
        permissions: permissions.length ? permissions.join(', ') : 'none'
      });
    });
  } catch (error) {
    log('error', 'Unable to enumerate guild roles', {
      guild: guildSummary,
      error: error.message
    });
  }
}

async function validateGuildRoles(guild) {
  const guildSummary = describeGuild(guild);
  log('info', 'Validating guild role permissions', { guild: guildSummary });

  let roles;
  try {
    roles = await guild.roles.fetch();
  } catch (error) {
    log('error', 'Unable to fetch guild roles for validation', {
      guild: guildSummary,
      error: error.message
    });
    return;
  }

  for (const [, role] of roles) {
    const analysis = analyzeRolePermissions(role);

    if (analysis.policy === 'unmanaged') {
      log('detail', 'No standard permissions defined for role; skipping', {
        guild: guildSummary,
        role: describeRole(role)
      });
      continue;
    }

    if (analysis.policy === 'all') {
      log('detail', 'Role configured for full permissions coverage', {
        guild: guildSummary,
        role: describeRole(role)
      });
      continue;
    }

    if (analysis.missing.length === 0 && analysis.extra.length === 0) {
      log('success', 'Role permissions match standard', {
        guild: guildSummary,
        role: describeRole(role)
      });
    } else {
      log('warn', 'Role permissions differ from standard', {
        guild: guildSummary,
        role: describeRole(role),
        missingPermissions: analysis.missing.length ? analysis.missing.join(', ') : 'none',
        extraPermissions: analysis.extra.length ? analysis.extra.join(', ') : 'none'
      });
    }
  }
}
async function fixGuildRoles(guild) {
  const guildSummary = describeGuild(guild);

  let roles;
  try {
    roles = await guild.roles.fetch();
  } catch (error) {
    log('error', 'Unable to fetch guild roles for remediation', {
      guild: guildSummary,
      error: error.message
    });
    return;
  }

  for (const [, role] of roles) {
    if (role.name === 'Admin') {
      log('info', 'Skipping Admin role; cannot modify', {
        guild: guildSummary,
        role: describeRole(role)
      });
      continue;
    }

    const analysis = analyzeRolePermissions(role);

    if (analysis.policy === 'unmanaged') {
      log('info', 'No standard permissions defined for role; skipping', {
        guild: guildSummary,
        role: describeRole(role)
      });
      continue;
    }

    if (analysis.policy === 'all') {
      log('detail', 'Role is set to full bot permissions', {
        guild: guildSummary,
        role: describeRole(role)
      });
      continue;
    }

    if (analysis.missing.length === 0 && analysis.extra.length === 0) {
      log('success', 'Role permissions match standard', {
        guild: guildSummary,
        role: describeRole(role)
      });
      continue;
    }

    try {
      await role.setPermissions(analysis.expected);
      log('success', 'Updated role permissions to standard', {
        guild: guildSummary,
        role: describeRole(role),
        missingPermissions: analysis.missing.length ? analysis.missing.join(', ') : 'none',
        extraPermissions: analysis.extra.length ? analysis.extra.join(', ') : 'none'
      });
    } catch (error) {
      log('error', 'Failed to update role permissions', {
        guild: guildSummary,
        role: describeRole(role),
        error: error.message
      });
    }
  }
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

  // Pre-check hierarchy/permissions
  canAssignRole(member.guild, role);

  // Cache: skip if we recently assigned this member
  const cacheKey = `assign:${member.guild.id}:${member.id}:${role.id}`;
  const cached = cache.readCache(cacheKey);
  if (cached && cached.assigned && Date.now() - cached.timestamp < CACHE_TTL_HOURS * 3600 * 1000) {
    log('detail', 'Skipping assignment due to cached recent success', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      cachedAt: new Date(cached.timestamp).toISOString(),
      ttlHours: CACHE_TTL_HOURS
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
    cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });
  } catch (error) {
    const hint = (error && (String(error.message).includes('Missing Permissions') || error.code === 50013))
      ? 'Check role hierarchy: bot role must be above target role and have Manage Roles.'
      : undefined;
    log('error', 'Failed to assign target role to member', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      error: error.message,
      hint
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

  // Pre-check hierarchy/permissions
  canAssignRole(guild, role);

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
        // Skip if cache indicates recent success
        const cacheKey = `assign:${guild.id}:${member.id}:${role.id}`;
        const cached = cache.readCache(cacheKey);
        if (cached && cached.assigned && Date.now() - cached.timestamp < CACHE_TTL_HOURS * 3600 * 1000) {
          log('detail', 'Sweep skip due to cached success', {
            origin,
            guild: guildSummary,
            member: describeMember(member),
            role: describeRole(role)
          });
          return;
        }

        await member.roles.add(role);
        success += 1;
        log('detail', 'Role assigned during sweep', {
          origin,
          guild: guildSummary,
          member: describeMember(member),
          role: describeRole(role)
        });
        cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });
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

async function runCliDebugDump() {
  log('info', 'CLI debug mode engaged; collecting guild diagnostics', {
    guildsObserved: client.guilds.cache.size,
    roleResolution: ROLE_ID ? `ROLE_ID:${ROLE_ID}` : `ROLE_NAME:${ROLE_NAME}`
  });

  for (const [, guild] of client.guilds.cache) {
    const guildSummary = describeGuild(guild);

    try {
      await guild.roles.fetch();
    } catch (error) {
      log('error', 'Failed to fetch roles for CLI debug mode', {
        guild: guildSummary,
        error: error.message
      });
      continue;
    }

    try {
      await guild.members.fetch();
    } catch (error) {
      log('error', 'Failed to fetch members for CLI debug mode', {
        guild: guildSummary,
        error: error.message
      });
      continue;
    }

    const orderedRoles = Array.from(guild.roles.cache.values()).sort((a, b) => b.position - a.position);
    const roleSummaries = [];
    const mismatchDetails = [];

    for (const role of orderedRoles) {
      const analysis = analyzeRolePermissions(role);
      const summary = {
        role: describeRole(role),
        permissionCount: analysis.current.length,
        status: analysis.policy,
        missing: analysis.missing,
        extra: analysis.extra
      };
      roleSummaries.push(summary);

      if (analysis.missing.length || analysis.extra.length) {
        mismatchDetails.push({
          role: describeRole(role),
          missing: analysis.missing,
          extra: analysis.extra,
          currentPermissions: analysis.current,
          expected: analysis.policy === 'standard' ? analysis.expected : analysis.policy
        });
      }
    }

    const memberSummaries = Array.from(guild.members.cache.values())
      .sort((a, b) => a.user.tag.localeCompare(b.user.tag))
      .map(member => ({
        member: describeMember(member),
        roles: member.roles.cache
          .filter(role => role.id !== guild.roles.everyone.id)
          .sort((a, b) => b.position - a.position)
          .map(role => role.name)
      }));

    const payload = {
      guild: guildSummary,
      totals: {
        roles: roleSummaries.length,
        members: memberSummaries.length,
        mismatchedRoles: mismatchDetails.length
      },
      targetRole: ROLE_ID
        ? { mode: 'ROLE_ID', value: ROLE_ID }
        : { mode: 'ROLE_NAME', value: ROLE_NAME },
      roles: roleSummaries,
      permissionDiffs: mismatchDetails,
      members: memberSummaries
    };

    console.log(JSON.stringify(payload, null, 2));
    console.log('');
  }

  console.log('[cli-debug] Completed diagnostic dump.');
  await client.destroy();
  process.exit(0);
}

client.once('ready', async () => {
  if (CLI_DEBUG_MODE) {
    log('info', 'CLI debug mode active', {
      userTag: client.user.tag,
      userId: client.user.id
    });
    await runCliDebugDump();
    return;
  }

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

  for (const [, guild] of client.guilds.cache) {
    await reportGuildRoles(guild);
    await validateGuildRoles(guild);
    await fixGuildRoles(guild);
    await sweepGuild(guild, 'startup');
  }

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