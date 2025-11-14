# DM Admin Command Suite — Implementation Guide

**Status**: Ready for Development  
**Timeline**: Phase 26-27 (1.5 months)  
**Target**: DripTVDD (Discord ID from `DRIP_ALERT_RECIPIENT` env var)

This guide integrates AI-provided best practices with the Infinity-Gauntlet codebase structure.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Phase 1: Foundation](#phase-1-foundation-week-1-2)
3. [Phase 2: Core Commands](#phase-2-core-commands-week-3-4)
4. [Phase 3: Management Commands](#phase-3-management-commands-week-5)
5. [Phase 4: Service Control](#phase-4-service-control-week-6)
6. [Phase 5: Database Operations](#phase-5-database-operations-week-7)
7. [Phase 6: Polish & Testing](#phase-6-polish--testing-week-8-10)
8. [Integration Points](#integration-points)
9. [Testing Strategy](#testing-strategy)

---

## Architecture Overview

### Current Bot Structure

**Location**: `src/bot/main.js` (security bot)  
**Client Configuration** (lines 205-250):
```javascript
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    // ❌ Missing: GatewayIntentBits.DirectMessages
    // ❌ Missing: GatewayIntentBits.MessageContent
  ],
  partials: [Partials.User],
  // ❌ Missing: Partials.Channel, Partials.Message (for DMs)
  sweepers: { /* aggressive cache sweeping */ }
});
```

### Required Changes

**Add DM Support** (lines 205-212):
```javascript
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,      // NEW: Enable DM reception
    GatewayIntentBits.MessageContent,      // NEW: Read message.content
  ],
  partials: [
    Partials.User,
    Partials.Channel,                      // NEW: DM channel partials
    Partials.Message,                      // NEW: DM message partials
  ],
  sweepers: { /* ... */ }
});
```

**Discord Developer Portal**:
- ✅ Enable **Message Content Intent** (required to read DM text)
- ✅ Bot permissions allow DMs from server members

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Environment Configuration

**File**: `src/config/env.js`

```javascript
// DM Admin Feature Flags
export const DM_ADMIN_ENABLED =
  process.env.DM_ADMIN_ENABLED === 'true';

export const DM_ADMIN_PREFIX =
  process.env.DM_ADMIN_PREFIX || '!ops';

export const DM_ADMIN_RATE_LIMIT =
  parseInt(process.env.DM_ADMIN_RATE_LIMIT || '10', 10); // commands per minute

// Already exists in env.js (line 36)
export const DRIP_ALERT_RECIPIENT =
  process.env.DRIP_ALERT_RECIPIENT ?? '';
```

**Environment Variables** (add to `secrets/Infinity-Gauntlet.env`):
```bash
DM_ADMIN_ENABLED=true
DM_ADMIN_PREFIX=!ops
DM_ADMIN_RATE_LIMIT=10
DRIP_ALERT_RECIPIENT=1049161859555643433  # Already configured
```

---

### 1.2 Authentication Module

**File**: `src/utils/dm-auth.js` (NEW)

```javascript
import { ChannelType } from 'discord.js';
import { DRIP_ALERT_RECIPIENT } from '../config/env.js';

/**
 * Check if user is authorized for DM admin commands
 * @param {string} userId - Discord user ID
 * @returns {boolean}
 */
export function isAuthorizedDmAdmin(userId) {
  const authorizedIds = [DRIP_ALERT_RECIPIENT].filter(Boolean);
  return authorizedIds.includes(userId);
}

/**
 * Check if message is in a DM channel
 * @param {import('discord.js').Message} message
 * @returns {boolean}
 */
export function isDmCommand(message) {
  return message.channel.type === ChannelType.DM;
}

/**
 * Extract Discord username for logging
 * @param {import('discord.js').User} user
 * @returns {string}
 */
export function getUserIdentifier(user) {
  return `${user.username}#${user.discriminator} (${user.id})`;
}
```

---

### 1.3 Rate Limiting Module

**File**: `src/utils/dm-rate-limiter.js` (NEW)

```javascript
import { DM_ADMIN_RATE_LIMIT } from '../config/env.js';

/**
 * In-memory rate limiter for DM admin commands
 * Key: userId -> { count, resetAt }
 */
const commandCounts = new Map();

/**
 * Check if user is under rate limit
 * @param {string} userId - Discord user ID
 * @param {number} limit - Commands per minute (default from env)
 * @returns {boolean} - True if under limit, false if exceeded
 */
export function checkRateLimit(userId, limit = DM_ADMIN_RATE_LIMIT) {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute

  const userData = commandCounts.get(userId);

  // First command or window expired
  if (!userData || now >= userData.resetAt) {
    commandCounts.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }

  // Exceeded limit
  if (userData.count >= limit) {
    return false;
  }

  // Increment counter
  userData.count++;
  return true;
}

/**
 * Get remaining commands in current window
 * @param {string} userId
 * @returns {{remaining: number, resetsIn: number}}
 */
export function getRateLimitStatus(userId) {
  const now = Date.now();
  const userData = commandCounts.get(userId);

  if (!userData || now >= userData.resetAt) {
    return { remaining: DM_ADMIN_RATE_LIMIT, resetsIn: 60 };
  }

  const remaining = Math.max(0, DM_ADMIN_RATE_LIMIT - userData.count);
  const resetsIn = Math.ceil((userData.resetAt - now) / 1000);

  return { remaining, resetsIn };
}

/**
 * Cleanup expired entries (call periodically)
 */
export function cleanupRateLimits() {
  const now = Date.now();
  for (const [userId, userData] of commandCounts.entries()) {
    if (now >= userData.resetAt) {
      commandCounts.delete(userId);
    }
  }
}
```

---

### 1.4 Command Parser

**File**: `src/bot/dm-admin-parser.js` (NEW)

```javascript
import { DM_ADMIN_PREFIX } from '../config/env.js';

/**
 * @typedef {Object} ParsedDmCommand
 * @property {string} command - Command name (e.g., "stats")
 * @property {string[]} args - Positional arguments
 * @property {Record<string, string>} flags - Named flags (e.g., --limit 20)
 */

/**
 * Parse DM admin command text
 * 
 * Examples:
 *   !ops stats                          → {command: "stats", args: [], flags: {}}
 *   !ops stats --limit 20               → {command: "stats", args: [], flags: {limit: "20"}}
 *   !ops db query "SELECT * FROM User"  → {command: "db", args: ["query", "SELECT * FROM User"], flags: {}}
 * 
 * @param {string} content - Message content
 * @returns {ParsedDmCommand | null}
 */
export function parseDmCommand(content) {
  if (!content.startsWith(DM_ADMIN_PREFIX)) return null;

  const trimmed = content.slice(DM_ADMIN_PREFIX.length).trim();
  if (!trimmed) return null;

  // Split by spaces, but preserve quoted strings
  const parts = splitCommandLine(trimmed);
  const command = parts[0]?.toLowerCase();
  if (!command) return null;

  const args = [];
  const flags = {};

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    if (part.startsWith('--')) {
      // Named flag
      const key = part.slice(2);
      const nextPart = parts[i + 1];
      
      if (nextPart && !nextPart.startsWith('--')) {
        // Flag with value: --limit 20
        flags[key] = nextPart;
        i++; // Skip next part
      } else {
        // Boolean flag: --verbose
        flags[key] = 'true';
      }
    } else {
      // Positional argument
      args.push(part);
    }
  }

  return { command, args, flags };
}

/**
 * Split command line respecting quoted strings
 * @param {string} input
 * @returns {string[]}
 */
function splitCommandLine(input) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = null;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ((char === '"' || char === "'") && !inQuotes) {
      // Start quoted string
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      // End quoted string
      inQuotes = false;
      quoteChar = null;
    } else if (char === ' ' && !inQuotes) {
      // Word boundary
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      // Regular character
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Validate command name against whitelist
 * @param {string} command
 * @returns {boolean}
 */
export function isValidCommand(command) {
  const validCommands = [
    'stats', 'memory', 'state', 'cache', 'engine', 'errors',
    'user', 'guild', 'sweep', 'restart', 'logs', 'deploy',
    'db', 'monitor', 'alerts', 'ping', 'help'
  ];
  return validCommands.includes(command);
}
```

---

### 1.5 DM Router & Dispatcher

**File**: `src/bot/dm-admin-router.js` (NEW)

```javascript
import { isAuthorizedDmAdmin, isDmCommand, getUserIdentifier } from '../utils/dm-auth.js';
import { checkRateLimit, getRateLimitStatus } from '../utils/dm-rate-limiter.js';
import { parseDmCommand, isValidCommand } from './dm-admin-parser.js';
import { DM_ADMIN_ENABLED } from '../config/env.js';
import { log as baseLog } from '../utils/logger.js';

// Import command handlers (Phase 2+)
// import { handleStatsCommand } from './dm-commands/stats.js';
// import { handleMemoryCommand } from './dm-commands/memory.js';
// ... etc

const log = (level, message, context) => baseLog(level, `[dm-admin] ${message}`, context);

/**
 * Dispatch parsed DM command to appropriate handler
 * @param {import('discord.js').Message} message
 * @param {import('./dm-admin-parser.js').ParsedDmCommand} parsed
 */
async function executeDmCommand(message, parsed) {
  const { command, args, flags } = parsed;

  log('info', `Executing command: ${command}`, {
    user: getUserIdentifier(message.author),
    args,
    flags
  });

  switch (command) {
    case 'ping':
      return message.reply('🏓 Pong! DM admin commands are operational.');
    
    case 'help':
      return message.reply(
        '📚 **Available Commands:**\n' +
        '• `!ops stats` - System statistics\n' +
        '• `!ops memory` - Memory profiling\n' +
        '• `!ops state` - Bot operational state\n' +
        '• `!ops ping` - Connection test\n' +
        '• `!ops help` - This message\n\n' +
        '**More commands coming soon...**'
      );

    // Phase 2: Core monitoring commands
    // case 'stats':
    //   return handleStatsCommand(message, flags);
    // case 'memory':
    //   return handleMemoryCommand(message, flags);
    // case 'state':
    //   return handleStateCommand(message, flags);

    // Phase 3: Management commands
    // case 'cache':
    //   return handleCacheCommand(message, flags);
    // case 'engine':
    //   return handleEngineCommand(message, flags);
    // case 'errors':
    //   return handleErrorsCommand(message, flags);

    // Phase 4: Service control
    // case 'restart':
    //   return handleRestartCommand(message, flags);
    // case 'logs':
    //   return handleLogsCommand(message, flags);
    // case 'deploy':
    //   return handleDeployCommand(message, flags);

    // Phase 5: Database operations
    // case 'db':
    //   return handleDbCommand(message, args, flags);

    default:
      return message.reply(`❓ Unknown command: \`${command}\`. Try \`!ops help\`.`);
  }
}

/**
 * Main DM message handler
 * @param {import('discord.js').Message} message
 */
export async function onDmMessage(message) {
  // Ignore bot messages
  if (message.author.bot) return;

  // Only process DMs
  if (!isDmCommand(message)) return;

  // Feature flag check
  if (!DM_ADMIN_ENABLED) {
    log('debug', 'DM admin disabled, ignoring message', {
      user: getUserIdentifier(message.author)
    });
    return;
  }

  // Parse command
  const parsed = parseDmCommand(message.content);
  if (!parsed) {
    // Not an !ops command, ignore silently
    return;
  }

  // Authorization check
  if (!isAuthorizedDmAdmin(message.author.id)) {
    log('warn', 'Unauthorized DM admin attempt', {
      user: getUserIdentifier(message.author),
      command: parsed.command
    });
    await message.reply('⛔ **Unauthorized**\nAdmin commands are restricted to authorized users only.');
    return;
  }

  // Command validation
  if (!isValidCommand(parsed.command)) {
    await message.reply(`❓ Unknown command: \`${parsed.command}\`. Try \`!ops help\`.`);
    return;
  }

  // Rate limit check
  if (!checkRateLimit(message.author.id)) {
    const status = getRateLimitStatus(message.author.id);
    log('warn', 'Rate limit exceeded', {
      user: getUserIdentifier(message.author),
      command: parsed.command,
      resetsIn: status.resetsIn
    });
    await message.reply(
      `⏱️ **Rate Limit Exceeded**\n` +
      `Too many commands. Try again in ${status.resetsIn} seconds.`
    );
    return;
  }

  // Execute command
  try {
    await executeDmCommand(message, parsed);
    log('info', 'Command executed successfully', {
      user: getUserIdentifier(message.author),
      command: parsed.command
    });
  } catch (error) {
    log('error', 'Command execution failed', {
      user: getUserIdentifier(message.author),
      command: parsed.command,
      error: error.message,
      stack: error.stack
    });
    await message.reply(
      `❌ **Command Failed**\n` +
      `An error occurred while executing \`${parsed.command}\`.\n` +
      `Error: ${error.message}`
    );
  }
}
```

---

### 1.6 Integration with Main Bot

**File**: `src/bot/main.js` (MODIFY)

**Step 1: Add DM intents** (lines 205-212):
```javascript
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,      // ADD THIS
    GatewayIntentBits.MessageContent,      // ADD THIS
  ],
  partials: [
    Partials.User,
    Partials.Channel,                      // ADD THIS
    Partials.Message,                      // ADD THIS
  ],
  sweepers: { /* ... */ }
});
```

**Step 2: Wire DM router** (add after line 3215):
```javascript
// DM Admin Command Suite (Phase 26)
import { onDmMessage } from './dm-admin-router.js';
import { cleanupRateLimits } from '../utils/dm-rate-limiter.js';

client.on('messageCreate', async (message) => {
  try {
    await onDmMessage(message);
  } catch (error) {
    log('error', '[dm-admin] Message handler error', {
      error: error.message,
      stack: error.stack
    });
  }
});

// Cleanup rate limiter every 5 minutes
setInterval(() => {
  cleanupRateLimits();
  log('debug', '[dm-admin] Cleaned up expired rate limits');
}, 5 * 60 * 1000);
```

---

## Phase 2: Core Commands (Week 3-4)

### 2.1 Stats Command

**File**: `src/bot/dm-commands/stats.js` (NEW)

```javascript
import { EmbedBuilder } from 'discord.js';
import { prisma } from '../../shared/prisma.js';
import { subHours } from 'date-fns';

/**
 * Get system statistics from database
 * @returns {Promise<Object>}
 */
async function getOpsStats() {
  const [
    totalUsers,
    activeUsers24h,
    totalEncounters,
    totalBattles,
    activeBattles,
  ] = await Promise.all([
    // Total users
    prisma.user.count(),
    
    // Active users (last 24h) - using updatedAt as proxy for activity
    prisma.user.count({
      where: { updatedAt: { gte: subHours(new Date(), 24) } },
    }),
    
    // Total encounters
    prisma.encounter.count(),
    
    // Total battles
    prisma.battle.count(),
    
    // Active battles (not finished/aborted)
    prisma.battle.count({
      where: {
        state: {
          notIn: ['Finished', 'Aborted']
        }
      }
    }),
  ]);

  return {
    totalUsers,
    activeUsers24h,
    totalEncounters,
    totalBattles,
    activeBattles,
  };
}

/**
 * Get recent battles with optional filters
 * @param {Object} options
 * @returns {Promise<Array>}
 */
async function getRecentBattles(options = {}) {
  const { limit = 10, after, participantId } = options;

  const where = {};

  if (after) {
    where.startedAt = { gte: after };
  }

  if (participantId) {
    where.OR = [
      { p1Id: participantId },
      { p2Id: participantId },
    ];
  }

  return prisma.battle.findMany({
    take: Math.min(limit, 50),
    orderBy: { startedAt: 'desc' },
    where,
    select: {
      id: true,
      state: true,
      startedAt: true,
      endedAt: true,
      p1: { select: { discordId: true } },
      p2: { select: { discordId: true } },
    },
  });
}

/**
 * Format stats into Discord embed
 * @param {Object} stats
 * @param {Array} recentBattles
 * @returns {EmbedBuilder}
 */
function formatStatsEmbed(stats, recentBattles) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('📊 System Statistics')
    .setTimestamp();

  // Users
  embed.addFields({
    name: '👥 Users',
    value:
      `**Total:** ${stats.totalUsers.toLocaleString()}\n` +
      `**Active (24h):** ${stats.activeUsers24h.toLocaleString()}`,
    inline: true,
  });

  // Battles
  embed.addFields({
    name: '⚔️ Battles',
    value:
      `**Total:** ${stats.totalBattles.toLocaleString()}\n` +
      `**In Progress:** ${stats.activeBattles.toLocaleString()}`,
    inline: true,
  });

  // Encounters
  embed.addFields({
    name: '🎯 Encounters',
    value: `**Total:** ${stats.totalEncounters.toLocaleString()}`,
    inline: true,
  });

  // Recent battles
  if (recentBattles.length > 0) {
    const lines = recentBattles.map((b) => {
      const shortId = b.id.slice(0, 8);
      const state = b.state.toLowerCase();
      const timestamp = `<t:${Math.floor(b.startedAt.getTime() / 1000)}:R>`;
      return `\`${shortId}\` • ${state} • ${timestamp}`;
    });

    embed.addFields({
      name: `🕒 Recent Battles (${recentBattles.length})`,
      value: lines.join('\n').slice(0, 1024),
    });
  }

  return embed;
}

/**
 * Handle !ops stats command
 * @param {import('discord.js').Message} message
 * @param {Record<string, string>} flags
 */
export async function handleStatsCommand(message, flags) {
  // Parse flags
  const limitRaw = flags.limit ? parseInt(flags.limit, 10) : 10;
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitRaw) ? limitRaw : 10));
  
  const after = flags.after ? new Date(flags.after) : undefined;
  const participantId = flags.participant;

  // Validate date
  if (after && isNaN(after.getTime())) {
    return message.reply('❌ Invalid `--after` timestamp. Use ISO format (e.g., `2025-11-14T00:00:00.000Z`)');
  }

  // Query database
  const [stats, recentBattles] = await Promise.all([
    getOpsStats(),
    getRecentBattles({ limit, after, participantId }),
  ]);

  // Format and send embed
  const embed = formatStatsEmbed(stats, recentBattles);
  await message.reply({ embeds: [embed] });
}
```

**Wire into router** (`src/bot/dm-admin-router.js`):
```javascript
import { handleStatsCommand } from './dm-commands/stats.js';

// In executeDmCommand():
case 'stats':
  return handleStatsCommand(message, flags);
```

---

### 2.2 Memory Command

**File**: `src/bot/dm-commands/memory.js` (NEW)

```javascript
import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { getDatabaseStats } from '../../shared/prisma.js';
import { getLogBuffer } from '../../shared/intelligent-logger.js';
import { EventBus } from '../../shared/event-bus.js';

/**
 * Get comprehensive memory statistics
 * @param {boolean} verbose - Include detailed heap stats
 * @returns {Object}
 */
function getMemoryStats(verbose = false) {
  const memUsage = process.memoryUsage();
  
  const stats = {
    rss: memUsage.rss,
    heapUsed: memUsage.heapUsed,
    heapTotal: memUsage.heapTotal,
    external: memUsage.external,
    arrayBuffers: memUsage.arrayBuffers,
    uptime: process.uptime(),
  };

  if (verbose) {
    // Add V8 heap statistics
    const v8 = require('v8');
    stats.heapStats = v8.getHeapStatistics();
    stats.heapSpaceStats = v8.getHeapSpaceStatistics();
  }

  return stats;
}

/**
 * Get component memory breakdown
 * @returns {Object}
 */
function getComponentBreakdown() {
  const breakdown = {};

  // Log Buffer
  try {
    const logBuffer = getLogBuffer();
    const stats = logBuffer.getStats ? logBuffer.getStats() : null;
    breakdown.logBuffer = {
      buffered: stats?.buffered || 0,
      limit: 200,
      estimatedKB: Math.round((stats?.buffered || 0) * 2),
    };
  } catch (e) {
    breakdown.logBuffer = { error: e.message };
  }

  // Event Bus
  try {
    const eventBus = EventBus.getInstance();
    const stats = eventBus.getStats ? eventBus.getStats() : {};
    breakdown.eventBus = {
      subscribers: stats.subscribers || 0,
      replayBuffer: stats.replayBufferSize || 0,
      patternCache: stats.patternCacheSize || 0,
      patternCacheLimit: 500,
      estimatedKB: Math.round((stats.patternCacheSize || 0) * 0.5),
    };
  } catch (e) {
    breakdown.eventBus = { error: e.message };
  }

  // Discord.js Cache
  try {
    const client = global.discordClient;
    if (client) {
      breakdown.discordCache = {
        guilds: client.guilds.cache.size,
        channels: client.channels.cache.size,
        users: client.users.cache.size,
        messages: Array.from(client.channels.cache.values())
          .reduce((sum, ch) => sum + (ch.messages?.cache.size || 0), 0),
      };
    }
  } catch (e) {
    breakdown.discordCache = { error: e.message };
  }

  // Database Connections
  try {
    const dbStats = getDatabaseStats();
    breakdown.database = {
      prod: dbStats.prod.status,
      onPremiseDev: dbStats.onPremiseDev.status,
    };
  } catch (e) {
    breakdown.database = { error: e.message };
  }

  return breakdown;
}

/**
 * Determine memory health status
 * @param {number} rss - RSS in bytes
 * @returns {{status: string, color: number, message: string}}
 */
function getMemoryHealth(rss) {
  const rssMB = Math.round(rss / 1024 / 1024);
  const limit = 512; // MB
  const percent = (rssMB / limit) * 100;

  if (percent < 70) {
    return {
      status: '✅ HEALTHY',
      color: 0x57f287,
      message: `${rssMB} MB / ${limit} MB (${percent.toFixed(1)}%)`,
    };
  } else if (percent < 85) {
    return {
      status: '⚠️ WARNING',
      color: 0xfee75c,
      message: `${rssMB} MB / ${limit} MB (${percent.toFixed(1)}%) - Approaching limit`,
    };
  } else {
    return {
      status: '❌ CRITICAL',
      color: 0xed4245,
      message: `${rssMB} MB / ${limit} MB (${percent.toFixed(1)}%) - Near limit!`,
    };
  }
}

/**
 * Format memory stats into Discord embed
 * @param {Object} memStats
 * @param {Object} components
 * @returns {EmbedBuilder}
 */
function formatMemoryEmbed(memStats, components) {
  const health = getMemoryHealth(memStats.rss);
  
  const embed = new EmbedBuilder()
    .setColor(health.color)
    .setTitle('💾 Memory Profile')
    .setTimestamp();

  // Overall status
  embed.addFields({
    name: health.status,
    value: health.message,
  });

  // Process memory
  embed.addFields({
    name: '📊 Process Memory',
    value:
      `**RSS:** ${(memStats.rss / 1024 / 1024).toFixed(1)} MB\n` +
      `**Heap Used:** ${(memStats.heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
      `**Heap Total:** ${(memStats.heapTotal / 1024 / 1024).toFixed(1)} MB\n` +
      `**External:** ${(memStats.external / 1024 / 1024).toFixed(1)} MB\n` +
      `**Uptime:** ${Math.floor(memStats.uptime / 3600)}h ${Math.floor((memStats.uptime % 3600) / 60)}m`,
    inline: true,
  });

  // Component breakdown
  const componentLines = [];

  if (components.logBuffer && !components.logBuffer.error) {
    componentLines.push(
      `**Log Buffer:** ${components.logBuffer.buffered}/${components.logBuffer.limit} (~${components.logBuffer.estimatedKB} KB)`
    );
  }

  if (components.eventBus && !components.eventBus.error) {
    componentLines.push(
      `**Event Bus:** ${components.eventBus.patternCache}/${components.eventBus.patternCacheLimit} patterns (~${components.eventBus.estimatedKB} KB)`
    );
  }

  if (components.discordCache && !components.discordCache.error) {
    componentLines.push(
      `**Discord Cache:** ${components.discordCache.guilds}g / ${components.discordCache.users}u / ${components.discordCache.messages}m`
    );
  }

  if (componentLines.length > 0) {
    embed.addFields({
      name: '🔧 Components',
      value: componentLines.join('\n'),
      inline: true,
    });
  }

  return embed;
}

/**
 * Handle !ops memory command
 * @param {import('discord.js').Message} message
 * @param {Record<string, string>} flags
 */
export async function handleMemoryCommand(message, flags) {
  const verbose = flags.verbose === 'true';
  const asJson = flags.json === 'true';

  // Gather stats
  const memStats = getMemoryStats(verbose);
  const components = getComponentBreakdown();

  // JSON output (as file attachment)
  if (asJson) {
    const data = JSON.stringify({ memStats, components }, null, 2);
    const attachment = new AttachmentBuilder(Buffer.from(data), {
      name: `memory-stats-${Date.now()}.json`,
    });
    return message.reply({
      content: '📄 Memory statistics (JSON format)',
      files: [attachment],
    });
  }

  // Embed output
  const embed = formatMemoryEmbed(memStats, components);
  await message.reply({ embeds: [embed] });
}
```

**Wire into router** (`src/bot/dm-admin-router.js`):
```javascript
import { handleMemoryCommand } from './dm-commands/memory.js';

case 'memory':
  return handleMemoryCommand(message, flags);
```

---

### 2.3 State Command

**File**: `src/bot/dm-commands/state.js` (NEW)

```javascript
import { EmbedBuilder } from 'discord.js';
import { getStatsSummary, getRecentEvents } from '../../bot/state/stats.js';
import { getRecentActivitySummary } from '../../bot/state/timeline.js';

/**
 * Format security bot state into embed
 * @param {Object} botState - From global.securityBotState
 * @param {Object} flags - Command flags
 * @returns {EmbedBuilder[]}
 */
function formatStateEmbeds(botState, flags) {
  if (!botState) {
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle('❌ State Unavailable')
      .setDescription('Security bot state not initialized')
      .setTimestamp();
    return [embed];
  }

  const embeds = [];

  // Main state embed
  const stats = getStatsSummary(botState);
  const mainEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🔒 Security Bot State')
    .setTimestamp();

  mainEmbed.addFields(
    {
      name: '📊 Operational Stats',
      value:
        `**Restarts:** ${stats.restarts}\n` +
        `**Total Uptime:** ${stats.totalUptime}\n` +
        `**Current Uptime:** ${stats.currentUptime}\n` +
        `**Last Restart:** ${stats.lastRestart}`,
      inline: true,
    },
    {
      name: '🔍 Activity Counts',
      value:
        `**Total Sweeps:** ${stats.totalSweeps}\n` +
        `**Permission Changes:** ${stats.permissionChanges}\n` +
        `**Alerts Sent:** ${stats.alerts}\n` +
        `**Errors:** ${stats.errors}`,
      inline: true,
    }
  );

  embeds.push(mainEmbed);

  // Timeline embed (if --timeline flag)
  if (flags.timeline === 'true') {
    const timeline = getRecentActivitySummary(botState, 20);
    const timelineEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('📅 Activity Timeline (Last 20 Events)')
      .setDescription(timeline || '*No recent activity*')
      .setTimestamp();
    embeds.push(timelineEmbed);
  }

  // Guild status embed (if --guilds flag)
  if (flags.guilds === 'true' && botState.guilds) {
    const guildLines = [];
    for (const [guildId, guildData] of Object.entries(botState.guilds)) {
      const name = guildData.name || 'Unknown';
      const lastSweep = guildData.lastSweepTime
        ? `<t:${Math.floor(new Date(guildData.lastSweepTime).getTime() / 1000)}:R>`
        : 'Never';
      guildLines.push(`**${name}** (${guildId})\nLast sweep: ${lastSweep}`);
    }

    const guildsEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🏰 Guild Status')
      .setDescription(guildLines.join('\n\n').slice(0, 4000) || '*No guilds monitored*')
      .setTimestamp();
    embeds.push(guildsEmbed);
  }

  return embeds;
}

/**
 * Handle !ops state command
 * @param {import('discord.js').Message} message
 * @param {Record<string, string>} flags
 */
export async function handleStateCommand(message, flags) {
  const botState = global.securityBotState;
  const embeds = formatStateEmbeds(botState, flags);

  // Send embeds (max 10 per message)
  await message.reply({ embeds: embeds.slice(0, 10) });
}
```

**Wire into router**:
```javascript
import { handleStateCommand } from './dm-commands/state.js';

case 'state':
  return handleStateCommand(message, flags);
```

---

## Integration Points

### Current Codebase Dependencies

**Prisma Client** (`src/shared/prisma.js`):
- ✅ Already exported: `prisma`, `onPremiseDevPrisma`
- ✅ Function: `getDatabaseStats()`
- 🔄 Schema: `User`, `Encounter`, `Battle` models (see `prisma/schema.prisma` lines 245-410)

**Logger** (`src/utils/logger.js`):
- ✅ Function: `log(level, message, context, options)`
- ✅ Function: `report(error, context)`
- 🔄 IntelligentLogger: `getLogBuffer()` exposed via `src/shared/intelligent-logger.js`

**Event Bus** (`src/shared/event-bus.ts`):
- ✅ Singleton: `EventBus.getInstance()`
- 🔄 Method: `getStats()` (returns subscribers, replay buffer, pattern cache size)

**Security Bot State** (`src/bot/state/persistence.js`):
- ✅ Global: `global.securityBotState`
- ✅ Functions: `getStatsSummary()`, `getRecentEvents()` (from `src/bot/state/stats.js`)
- ✅ Function: `getRecentActivitySummary()` (from `src/bot/state/timeline.js`)

**Discord Client**:
- 🔄 Global: Expose as `global.discordClient` in `src/bot/main.js` after client initialization (line ~260)

---

## Testing Strategy

### Unit Tests

**Test File**: `tests/bot/dm-admin.test.js`

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { parseDmCommand, isValidCommand } from '../../src/bot/dm-admin-parser.js';
import { checkRateLimit, cleanupRateLimits } from '../../src/utils/dm-rate-limiter.js';
import { isAuthorizedDmAdmin } from '../../src/utils/dm-auth.js';

describe('DM Admin Parser', () => {
  it('parses simple command', () => {
    const result = parseDmCommand('!ops stats');
    expect(result).toEqual({
      command: 'stats',
      args: [],
      flags: {},
    });
  });

  it('parses command with flags', () => {
    const result = parseDmCommand('!ops stats --limit 20 --verbose');
    expect(result).toEqual({
      command: 'stats',
      args: [],
      flags: { limit: '20', verbose: 'true' },
    });
  });

  it('parses command with quoted args', () => {
    const result = parseDmCommand('!ops db query "SELECT * FROM User"');
    expect(result).toEqual({
      command: 'db',
      args: ['query', 'SELECT * FROM User'],
      flags: {},
    });
  });

  it('validates command names', () => {
    expect(isValidCommand('stats')).toBe(true);
    expect(isValidCommand('memory')).toBe(true);
    expect(isValidCommand('invalid')).toBe(false);
  });
});

describe('Rate Limiter', () => {
  beforeEach(() => {
    cleanupRateLimits();
  });

  it('allows first command', () => {
    expect(checkRateLimit('user123', 10)).toBe(true);
  });

  it('tracks command count', () => {
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit('user123', 10)).toBe(true);
    }
    expect(checkRateLimit('user123', 10)).toBe(false);
  });

  it('isolates users', () => {
    for (let i = 0; i < 10; i++) {
      checkRateLimit('user1', 10);
    }
    expect(checkRateLimit('user1', 10)).toBe(false);
    expect(checkRateLimit('user2', 10)).toBe(true);
  });
});

describe('DM Auth', () => {
  it('authorizes configured user', () => {
    // Mock DRIP_ALERT_RECIPIENT in env
    process.env.DRIP_ALERT_RECIPIENT = '1049161859555643433';
    expect(isAuthorizedDmAdmin('1049161859555643433')).toBe(true);
  });

  it('rejects unknown users', () => {
    expect(isAuthorizedDmAdmin('999999999999')).toBe(false);
  });
});
```

### Integration Tests

**Manual Test Workflow**:

1. **Enable Feature**:
   ```bash
   DM_ADMIN_ENABLED=true
   DM_ADMIN_PREFIX=!ops
   ```

2. **Deploy Bot** with DM intents enabled

3. **Send Test Commands**:
   ```
   !ops ping         → Should reply "🏓 Pong!"
   !ops help         → Should show command list
   !ops stats        → Should show system stats embed
   !ops memory       → Should show memory profile embed
   !ops state        → Should show security bot state
   ```

4. **Test Rate Limiting**:
   - Send 11 commands rapidly
   - 11th should be rejected with rate limit message

5. **Test Authorization**:
   - DM from different account (not DripTVDD)
   - Should reply "⛔ Unauthorized"

6. **Test Error Handling**:
   ```
   !ops stats --limit invalid   → Should handle gracefully
   !ops memory --json           → Should send JSON file
   !ops unknown                 → Should reply "Unknown command"
   ```

---

## Implementation Timeline

### Phase 1 (Week 1-2): Foundation ✅
- [x] Environment configuration
- [x] Authentication module
- [x] Rate limiting
- [x] Command parser
- [x] DM router & dispatcher
- [x] Integration with main bot

### Phase 2 (Week 3-4): Core Commands
- [ ] `!ops stats` implementation
- [ ] `!ops memory` implementation  
- [ ] `!ops state` implementation
- [ ] Unit tests for parsers
- [ ] Integration tests for commands

### Phase 3 (Week 5): Management Commands
- [ ] `!ops cache` implementation
- [ ] `!ops engine` implementation
- [ ] `!ops errors` implementation

### Phase 4 (Week 6): Service Control
- [ ] `!ops restart` implementation (confirmation prompts)
- [ ] `!ops logs` implementation (file attachments)
- [ ] `!ops deploy` implementation (Render API integration)

### Phase 5 (Week 7): Database Operations
- [ ] `!ops db stats` - Connection info, table counts
- [ ] `!ops db query` - Read-only SELECT queries
- [ ] Query validation (prevent writes, DROP, etc.)
- [ ] Result pagination for large outputs

### Phase 6 (Week 8-10): Polish & Testing
- [ ] Error handling improvements
- [ ] Response formatting enhancements (pagination)
- [ ] Audit logging to `Store/logs/dm-admin-audit.log`
- [ ] Load testing (rate limiter stress test)
- [ ] Documentation updates
- [ ] Production deployment validation

---

## Success Criteria

- ✅ DripTVDD can execute all commands via DM
- ✅ Unauthorized users receive "⛔ Unauthorized" response
- ✅ Rate limiting prevents abuse (10 commands/minute)
- ✅ All responses render correctly (embeds, files, pagination)
- ✅ No breaking changes to existing `/ops` commands
- ✅ Audit logs capture all admin actions
- ✅ Error handling prevents crashes
- ✅ Memory footprint < 5 MB overhead

---

## Security Considerations

### Authentication
- ✅ Single-user authorization via `DRIP_ALERT_RECIPIENT`
- ✅ No command execution without valid Discord ID match
- ✅ DM channel type verification (prevents server exploitation)

### Rate Limiting
- ✅ Per-user command throttling (10/minute default)
- ✅ In-memory tracking (resets on bot restart)
- ✅ Configurable via `DM_ADMIN_RATE_LIMIT` env var

### Database Safety
- ✅ Read-only queries enforced (no `INSERT`, `UPDATE`, `DELETE`, `DROP`)
- ✅ Query validation before Prisma execution
- ✅ Result truncation (prevent memory exhaustion)
- ✅ Timeout limits on long-running queries

### Audit Trail
- ✅ All commands logged with user ID, timestamp, command, args
- ✅ Failed auth attempts logged
- ✅ Rate limit violations logged
- ✅ Errors logged with stack traces

---

**Implementation Guide Complete** — Ready for Phase 26 Development

**Next Steps:**
1. Review specification with stakeholders
2. Create GitHub project board (26 tasks)
3. Begin Phase 1 implementation
4. Schedule weekly progress reviews
