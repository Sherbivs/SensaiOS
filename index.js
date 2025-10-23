const { Client, GatewayIntentBits, Partials } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
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

// Feature flags (off by default for safety)
const ROLE_PERMISSIONS_AUDIT = process.env.ROLE_PERMISSIONS_AUDIT === '1' || process.env.ROLE_PERMISSIONS_AUDIT === 'true';
const ROLE_PERMISSIONS_REMEDIATE = process.env.ROLE_PERMISSIONS_REMEDIATE === '1' || process.env.ROLE_PERMISSIONS_REMEDIATE === 'true';

cache.cleanOldCache();


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
// Unified report helper to standardize section headings
function report(title, meta = {}, level = 'info') {
  const heading = `=== ${title} ===`;
  const timestamp = new Date().toISOString();
  const label = level.toUpperCase();
  const writer = level === 'error' ? console.error : console.log;
  writer(`[${timestamp}] [${label}] ${heading}`);
  if (meta && typeof meta === 'object') {
    try {
      for (const [key, value] of Object.entries(meta)) {
        writer(`    ${key}: ${value}`);
      }
    } catch {}
  }
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
const OPS_REPORT_INTERVAL_MIN = Math.max(0, Number(process.env.OPS_REPORT_INTERVAL_MIN || 0)); // 0 = disabled

const describeRole = (role) => `${role.name} (#${role.id})`;
const describeMember = (member) => `${member.user.tag} (#${member.id})`;
const describeGuild = (guild) => `${guild.name} (#${guild.id})`;

function canAssignRole(guild, role) {
  const me = guild.members.me;
  if (!me) return true; // assume true; discord.js will error if not
  const hasManage = me.permissions.has('ManageRoles');
  const above = me.roles.highest.position > role.position;
  if (!hasManage || !above) {
    report('Permission Check', {
      guild: describeGuild(guild),
      botHighestRole: me.roles.highest ? describeRole(me.roles.highest) : 'unknown',
      targetRole: describeRole(role),
      hasManageRoles: hasManage,
      botAboveTarget: above,
      hint: 'Ensure bot role is above target and has Manage Roles.'
    }, 'warn');
  }
  return hasManage && above;
}

// ----- Operational reporting -----
function formatBytes(n) {
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function reportOperationalStats(where = 'startup') {
  const budget = cache.getCacheBudget();
  const cacheSize = cache.getCacheSize();
  const mem = process.memoryUsage();

  log('info', '=== Cache & Resource Report ===', {
    at: where,
    cacheDir: cache.CACHE_DIR,
    cacheSize: formatBytes(cacheSize),
    cacheBudgetMax: formatBytes(budget.maxAllowedBytes),
    cacheBudgetPercent: `${Math.round(budget.percent * 100)}% of approx free`,
    approxFree: formatBytes(budget.approxBytes),
    node: process.version,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    rss: formatBytes(mem.rss),
    heapUsed: formatBytes(mem.heapUsed),
    external: formatBytes(mem.external || 0),
    backfillConcurrency: BACKFILL_CONCURRENCY,
    backfillDelayMs: BACKFILL_DELAY_MS,
    cacheTtlHours: CACHE_TTL_HOURS,
  });
}

const STANDARD_PERMISSIONS = {
  'Super Admin': [
    'KickMembers','BanMembers','ManageMessages','ModerateMembers','ManageNicknames','ViewAuditLog','CreateEvents',
    'UseApplicationCommands','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages','EmbedLinks',
    'AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','DeafenMembers','MoveMembers',
    'UseVAD','PrioritySpeaker','Stream','UseEmbeddedActivities','UseSoundboard','CreateGuildExpressions','UseExternalSounds',
    'SendPolls','UseExternalApps'
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
  'Drip': 'ALL',
  'Pokétwo': ['SendMessages','ManageMessages','AddReactions','EmbedLinks','AttachFiles','ReadMessageHistory','UseExternalEmojis'],
  'D&D Candidate': [],
  
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
      report('Roles Empty', { guild: guildSummary });
      return;
    }

    const sortedRoles = roles.sort((a, b) => b.position - a.position);
    report('Role Inventory', {
      guild: guildSummary,
      totalRoles: sortedRoles.size
    });

    sortedRoles.forEach(role => {
      const permissions = role.permissions.toArray();
      report('Role Permissions', {
        guild: guildSummary,
        role: describeRole(role),
        permissionsCount: permissions.length,
        permissions: permissions.length ? permissions.join(', ') : 'none'
      }, 'detail');
    });
  } catch (error) {
    report('Role Enumeration Error', {
      guild: guildSummary,
      error: error.message
    }, 'error');
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
      report('Role Permissions Match', {
        guild: guildSummary,
        role: describeRole(role)
      }, 'success');
    } else {
      report('Role Permissions Differ', {
        guild: guildSummary,
        role: describeRole(role),
        missingPermissions: analysis.missing.length ? analysis.missing.join(', ') : 'none',
        extraPermissions: analysis.extra.length ? analysis.extra.join(', ') : 'none'
      }, 'warn');
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
      report('Role Permissions Updated', {
        guild: guildSummary,
        role: describeRole(role),
        missingPermissions: analysis.missing.length ? analysis.missing.join(', ') : 'none',
        extraPermissions: analysis.extra.length ? analysis.extra.join(', ') : 'none'
      }, 'success');
    } catch (error) {
      report('Role Permissions Update Error', {
        guild: guildSummary,
        role: describeRole(role),
        error: error.message
      }, 'error');
    }
  }
}
async function ensureTrainerFor(member, origin = 'unspecified') {
  const guildSummary = describeGuild(member.guild);
  const memberSummary = describeMember(member);

  const role = findRole(member.guild);
  if (!role) {
    report('Role Missing', {
      origin,
      guild: guildSummary,
      roleName: ROLE_NAME,
      roleId: ROLE_ID || 'resolved at runtime'
    }, 'warn');
    return;
  }

  if (!hasNoAssignableRoles(member)) {
    const assignableRoles = member.roles.cache
      .filter(r => r.id !== member.guild.roles.everyone.id)
      .map(describeRole);
    report('Member Skipped', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      existingRoles: assignableRoles.length ? assignableRoles.join(', ') : 'n/a'
    }, 'detail');
    return;
  }

  // Pre-check hierarchy/permissions
  canAssignRole(member.guild, role);

  // Cache: skip if we recently assigned this member
  const cacheKey = `assign:${member.guild.id}:${member.id}:${role.id}`;
  const cached = cache.readCache(cacheKey);
  if (cached && cached.assigned && Date.now() - cached.timestamp < CACHE_TTL_HOURS * 3600 * 1000) {
    report('Assignment Skipped (Cache)', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      cachedAt: new Date(cached.timestamp).toISOString(),
      ttlHours: CACHE_TTL_HOURS
    }, 'detail');
    return;
  }

  try {
    await member.roles.add(role);
    report('Assignment Success', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role)
    }, 'success');
    cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });
  } catch (error) {
    const hint = (error && (String(error.message).includes('Missing Permissions') || error.code === 50013))
      ? 'Check role hierarchy: bot role must be above target role and have Manage Roles.'
      : undefined;
    report('Assignment Failure', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      error: error.message,
      hint
    }, 'error');
  }
}

async function sweepGuild(guild, origin) {
  const guildSummary = describeGuild(guild);
  report('Sweep Start', { origin, guild: guildSummary });

  try {
    await guild.members.fetch();
    report('Members Fetched', {
      guild: guildSummary,
      cachedMembers: guild.members.cache.size
    });
  } catch (error) {
    report('Members Fetch Error', {
      origin,
      guild: guildSummary,
      error: error.message
    }, 'error');
    return;
  }

  const toAssign = guild.members.cache.filter(member => hasNoAssignableRoles(member));
  if (toAssign.size === 0) {
    report('Sweep No-Op', {
      origin,
      guild: guildSummary
    });
    return;
  }

  const role = findRole(guild);
  if (!role) {
    report('Role Missing', {
      origin,
      guild: guildSummary,
      roleName: ROLE_NAME,
      roleId: ROLE_ID || 'resolved at runtime'
    }, 'warn');
    return;
  }

  // Pre-check hierarchy/permissions
  canAssignRole(guild, role);

  report('Assignment Plan', {
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
          report('Assignment Skipped (Cache)', {
            origin,
            guild: guildSummary,
            member: describeMember(member),
            role: describeRole(role)
          }, 'detail');
          return;
        }

        await member.roles.add(role);
        success += 1;
        report('Assignment Success', {
          origin,
          guild: guildSummary,
          member: describeMember(member),
          role: describeRole(role)
        }, 'detail');
        cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });
      } catch (error) {
        failed += 1;
        report('Assignment Failure', {
          origin,
          guild: guildSummary,
          member: describeMember(member),
          role: describeRole(role),
          error: error.message
        }, 'error');
      }
    }));

    if (BACKFILL_DELAY_MS > 0 && i + BACKFILL_CONCURRENCY < members.length) {
      await new Promise(resolve => setTimeout(resolve, BACKFILL_DELAY_MS));
    }
  }

  report('Sweep Summary', {
    origin,
    guild: guildSummary,
    assigned: success,
    failed,
    candidatesProcessed: members.length
  });
}

async function runCliDebugDump() {
  report('CLI Debug Start', {
    guildsObserved: client.guilds.cache.size,
    roleResolution: ROLE_ID ? `ROLE_ID:${ROLE_ID}` : `ROLE_NAME:${ROLE_NAME}`
  });

  for (const [, guild] of client.guilds.cache) {
    const guildSummary = describeGuild(guild);

    try {
      await guild.roles.fetch();
    } catch (error) {
      report('CLI Debug Roles Fetch Error', {
        guild: guildSummary,
        error: error.message
      }, 'error');
      continue;
    }

    try {
      await guild.members.fetch();
    } catch (error) {
      report('CLI Debug Members Fetch Error', {
        guild: guildSummary,
        error: error.message
      }, 'error');
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
  report('Runtime Configuration', {
    roleName: ROLE_NAME,
    roleId: ROLE_ID || 'resolved at runtime',
    roleDiscovery: ROLE_ID ? 'ROLE_ID exact match' : 'ROLE_NAME case-insensitive search',
    startupBackfill: 'enabled',
    periodicSweep: BACKFILL_INTERVAL_MIN > 0 ? `every ${BACKFILL_INTERVAL_MIN} minute(s)` : 'disabled',
    concurrency: BACKFILL_CONCURRENCY,
    delayMsBetweenBatches: BACKFILL_DELAY_MS,
    guildsObserved: client.guilds.cache.size,
    roleAudit: ROLE_PERMISSIONS_AUDIT ? 'enabled' : 'disabled',
    roleRemediation: ROLE_PERMISSIONS_REMEDIATE ? 'enabled' : 'disabled'
  });

  // One-time detailed operational report
  reportOperationalStats('ready');

  if (client.guilds.cache.size === 0) {
    report('No Guilds Joined', { action: 'Invite the bot to your server to begin assigning roles.' }, 'warn');
  }

  for (const [, guild] of client.guilds.cache) {
    if (ROLE_PERMISSIONS_AUDIT) {
      await reportGuildRoles(guild);
      await validateGuildRoles(guild);
    }
    if (ROLE_PERMISSIONS_REMEDIATE) {
      await fixGuildRoles(guild);
    }
    await sweepGuild(guild, 'startup');
  }

  if (BACKFILL_INTERVAL_MIN > 0) {
    const intervalMs = BACKFILL_INTERVAL_MIN * 60 * 1000;
    report('Periodic Sweep Enabled', { intervalMinutes: BACKFILL_INTERVAL_MIN });
    setInterval(async () => {
      const cycleStarted = new Date().toISOString();
      report('Periodic Sweep Start', { cycleStarted });
      for (const [, guild] of client.guilds.cache) {
        await sweepGuild(guild, 'periodic');
      }
      report('Periodic Sweep Complete', {
        cycleStarted,
        cycleCompleted: new Date().toISOString()
      });
    }, intervalMs);
  }

  // Optional recurring operational report
  if (OPS_REPORT_INTERVAL_MIN > 0) {
    const opsMs = OPS_REPORT_INTERVAL_MIN * 60 * 1000;
  report('Operational Report Scheduled', { everyMinutes: OPS_REPORT_INTERVAL_MIN });
    setInterval(() => reportOperationalStats('periodic'), opsMs);
  }
});
client.on('guildMemberAdd', async (member) => {
  const guildSummary = describeGuild(member.guild);
  const memberSummary = describeMember(member);
  report('Member Join', {
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
  report('Configuration Error', {
    message: 'BOT_TOKEN is missing. Set it in your environment or .env (without quotes or the "Bot " prefix).',
    workingDirectory: process.cwd(),
    envFilePresent: hasDotEnv ? 'yes' : 'no',
    envFilePath: envPath,
    quickTest: '$env:BOT_TOKEN = "your_token_here"'
  }, 'error');
  process.exit(1);
}

report('Login Start', {});
client.login(token);