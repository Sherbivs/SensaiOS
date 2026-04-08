import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  Collection,
  LimitedCollection,
  AuditLogEvent,
  OverwriteType,
  PermissionsBitField,
  type Guild,
  type GuildMember,
  type PartialGuildMember,
  type Role,
  type User,
  type PartialUser,
  type GuildAuditLogsEntry,
  type GuildChannel,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type PermissionsString,
} from 'discord.js';

import { loadCommands } from '../command-loader.js';
import { toEasternString, toEasternDate, toEasternTime } from '../shared/datetime.js';
import { formatBytes, formatDuration, getErrorMessage, normalizeString, ensureError } from '../shared/utils/index.js';
import { TIME_CONSTANTS, MONITORING_CONSTANTS, DISCORD_CONSTANTS } from '../shared/constants.js';
import {
  CLI_DEBUG_MODE,
  ROLE_PERMISSIONS_AUDIT,
  ROLE_PERMISSIONS_REMEDIATE,
  ROLE_PERMISSION_POLICY,
  ROLE_PERMISSION_SNAPSHOT_UPDATE,
  ALERT_WEBHOOK_URL,
  ALERT_CHANNEL_ID,
  ALERT_USER_ID,
  BOT_TOKEN,
  ROLE_NAME,
  TRAINER_ROLE_ID,
  GYM_LEADER_ROLE_ID,
  MODERATOR_ONLY_CHANNEL_ID,
  BACKFILL_CONCURRENCY,
  BACKFILL_DELAY_MS,
  BACKFILL_INTERVAL_SECONDS,
  ROLE_REMEDIATION_INTERVAL_SECONDS,
  CACHE_TTL_HOURS,
  ENABLE_CONTINUOUS_SWEEP,
  OPS_REPORT_INTERVAL_SECONDS,
  STANDARD_ENFORCE_ALL,
  UNLISTED_PERMISSIONS,
  STANDARD_EXEMPT_ROLE_IDS,
  STANDARD_ALL_PERMS_ROLE_IDS,
  ADMIN_ROLE_ID,
  SERVER_ADMIN_ROLE_ID,
  SUPER_ADMIN_ROLE_ID,
  DRIP_ROLE_ID,
  DRIP_USER_ID,
  DRIP_ROLE_EXCLUDE_CHANNEL_IDS,
  ZAPIER_ROLE_ID,
  FRESHTOK_ROLE_ID,
  POKETWO_ROLE_ID,
  DND_CANDIDATE_ROLE_ID,
  RESTART_DM_RECIPIENT,
  SUMMARY_REPORT_RECIPIENT,
  SUMMARY_REPORT_HOUR,
  SUMMARY_REPORT_MINUTE,
  DRIP_ALERT_RECIPIENT,
  DRIP_ALERT_HOUR,
  DRIP_ALERT_MINUTE,
  DRIP_ALERT_TIMEZONE,
} from '../config/env.js';
import { checkAndSet } from '../lib/cooldown.js';
import cache from '../services/cache.js';
import activityTracker from '../utils/activityTracker.js';
import cliStatus from '../utils/cliStatus.js';
import { installFatalErrorHandlers } from '../utils/fatalErrorGuard.js';
import { log as baseLog, report } from '../shared/logging/index.js';
import opsNotifier from '../utils/opsNotifier.js';
import { resourceMonitor } from '../services/monitoring/resource-monitor.js';
import { prisma, ensurePrisma } from '../shared/prisma.js';
import { TIER } from '../config/resource-tiers.js';
import { engineCache } from '../services/cache/index.js';

import { createDripAlertManager, DRIP_ALERT_SEVERITY, type DripAlertManager, type DescribeUserFunction } from './dripAlerts.js';
import { SecurityEventService } from './security/services/security-event-service.js';
import { RoleAuditService } from './security/services/role-audit-service.js';
import { SecuritySeverity, RoleChangeType } from './security/types/database-models.js';
import { buildRestartSummary } from './state/context.js';
import { initializeState, shutdownState, startAutoSave, stopAutoSave } from './state/persistence.js';
import { recordSweep, recordMemberFetchTimeout } from './state/stats.js';
import { getRecentActivitySummary } from './state/timeline.js';
import type { SecurityBotState, TimelineEvent, GuildState } from './state/types.js';
import { handleDmMessage, handleConsoleInteraction, isConsoleInteraction, type ConsoleContext } from './dm-console/index.js';
import { startMemberSnapshotScheduler } from './security/member-snapshot-scheduler.js';

// ============================================================================
// Type Definitions
// ============================================================================

/** Log level for the log helper */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'success' | 'detail';

/** Timeout configuration stored in JSON */
interface TimeoutConfig {
  timeoutMs: number;
  adjustments: number;
  lastAdjusted: string;
  reason: string;
  history: Array<{
    timestamp: string;
    timeoutMs: number;
    reason: string;
  }>;
}

/** Options for fetching guild members */
interface EnsureGuildMembersCachedOptions {
  origin?: string;
  chunkTimeoutMs?: number;
  chunkRetries?: number;
  pageLimit?: number;
  maxPages?: number;
  restDelayMs?: number;
}

/** Guild statistics entry */
interface GuildStatsEntry {
  guildId: string;
  guild: string;
  memberCount: number;
  eligibleMemberCount: number;
  roleCount: number;
  complete: boolean;
}

/** Member statistics snapshot
 * 
 * TRAINER COVERAGE CALCULATION:
 * Coverage % = (totalWithRole / denominator) × 100
 * - Denominator: totalEligibleMembers if available, else totalMembers
 * - totalWithRole: Members with the Trainor/Drip role
 * - totalEligibleMembers: Guild members excluding bot accounts
 * - totalMembers: All guild members (including bots)
 * 
 * Bots are excluded from the denominator because they do not require trainer assignments;
 * only human members count toward coverage metrics.
 * 
 * Used by:
 * - DM Console Overview panel (renderOverview)
 * - Logger metrics output (formatSecurityMetrics)
 */
interface MemberStatsSnapshot {
  /** Total guild members (including bots and humans) */
  totalMembers: number;
  
  /** Total eligible members (humans only) — used as coverage denominator */
  totalEligibleMembers: number;
  
  /** Members with the Trainer/Drip role — numerator for coverage % */
  totalWithRole: number;
  
  guilds: GuildStatsEntry[];
  updatedAt: Date;
  
  /** True if data is estimated (partial guild member fetch); false if complete */
  partial: boolean;
  
  /** Reason for stats refresh (e.g., 'sweep complete', 'unspecified') */
  reason: string;
}

/** Security CLI state structure */
interface SecurityCliState {
  status: string;
  lastSweepStartedAt: Date | null;
  lastSweepCompletedAt: Date | null;
  lastSweepDurationMs: number | null;
  lastSweepOrigin: string | null;
  lastSweepGuild: string | null;
  lastSweepCandidates: number;
  lastSweepAssigned: number;
  lastSweepFailed: number;
  lastSweepResult: string | null;
  totalSweeps: number;
  totalAssignments: number;
  totalFailures: number;
  lastAlertSentAt: Date | null;
  lastAlertMessage: string | null;
  memberStats: MemberStatsSnapshot | null;
}

/** Continuous sweep state */
interface ContinuousSweepState {
  running: boolean;
  abortController: AbortController | null;
  loopPromise: Promise<void> | undefined;
}

/** Ops error event */
interface OpsErrorEvent {
  id: string;
  message: string;
  timestamp: Date;
  attempts?: number;
  meta?: Record<string, unknown>;
}

/** Revert member roles result */
interface RevertMemberRolesResult {
  success: boolean;
  removed: string[];
  added: string[];
  errors: Array<{ action: string; message: string }>;
}

/** Revert member roles options */
interface RevertMemberRolesOptions {
  rolesToRemove?: (Role | string)[];
  rolesToAdd?: (Role | string)[];
  reason?: string;
}

/** Role analysis result */
interface RoleAnalysis {
  policy: string;
  current: PermissionsString[];
  expected: PermissionsString[] | string | 'all' | null;
  missing: PermissionsString[];
  extra: PermissionsString[];
}

/** Executor authorization result */
interface ExecutorAuthorizationResult {
  authorized: boolean;
  reason: string;
  member: GuildMember | null;
}

/** Sweep result */
interface SweepResult {
  startedAt: Date;
  assigned: number;
  failed: number;
  candidates: number;
  reason?: string;
}

/** Role change result */
interface RoleChangeResult {
  changed: boolean;
  skipped?: boolean;
  unauthorized?: boolean;
  revertStatus?: string;
}

/** Activity entry for summary reports */
interface ActivityEntry {
  type: string;
  timestamp: string | Date;
  summary: string;
}

// Note: BotState is imported as SecurityBotState from './state/types.js'
// GuildStateEntry is imported as GuildState from './state/types.js'
// TimelineEntry is imported as TimelineEvent from './state/types.js'

/** Local alias for timeline entry with optional details */
type TimelineEntryWithDetails = TimelineEvent & { details?: { error?: string } };

/** Command structure */
interface SlashCommand {
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  cooldownMs?: number;
}

/** Extended client with commands property */
interface ExtendedClient extends Client {
  commands?: Collection<string, SlashCommand>;
}

// Global state is set via global.securityBotState and global.securityBotClient for telemetry
// These globals are declared in src/utils/logger.ts with compatible types

// Extract constants from centralized constants
const { DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS, MAX_TIMEOUT_MS, MEMBER_STATS_REFRESH_INTERVAL_MS } = TIME_CONSTANTS;
const { MAX_OPS_ERROR_QUEUE_SIZE } = MONITORING_CONSTANTS;
const {
  CLI_SWEEP_WARNING_THRESHOLD_SECONDS,
  CONTINUOUS_SWEEP_IDLE_DELAY_MS,
  GUILD_MEMBER_FETCH_CHUNK_RETRIES,
  GUILD_MEMBER_FETCH_RATE_LIMIT_FLOOR_MS,
  GUILD_MEMBER_FETCH_RATE_LIMIT_CEIL_MS,
  TIMEOUT_INCREMENT_MS
} = DISCORD_CONSTANTS;

// Auto-adjusting timeout for GuildMembersTimeout errors
// Increases by 250ms each time a timeout occurs, persists across restarts
// MIGRATION (2025-12-27): Moved from /Store to PostgreSQL CacheEntry table
const TIMEOUT_CONFIG_KEY = 'guild-member-timeout-config';

// Load timeout from database
async function loadTimeoutConfig(): Promise<number> {
  try {
    baseLog('info', `[timeout-config] Loading from database: ${TIMEOUT_CONFIG_KEY}`);
    
    const entry = await prisma.cacheEntry.findUnique({
      where: { key: TIMEOUT_CONFIG_KEY },
    });
    
    if (entry) {
      const config = entry.value as unknown as TimeoutConfig;
      if (config.timeoutMs && typeof config.timeoutMs === 'number') {
        const clamped = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, config.timeoutMs));
        baseLog('info', `[timeout-config] Loaded from database`, {
          timeoutMs: clamped,
          adjustments: config.adjustments || 0,
          lastAdjusted: config.lastAdjusted || 'never',
          lastReason: config.reason || 'unknown',
        });
        return clamped;
      }
    } else {
      baseLog('info', `[timeout-config] No database entry, using default: ${DEFAULT_TIMEOUT_MS}ms`);
    }
  } catch (err) {
    baseLog('warn', '[timeout-config] Failed to load from database, using default', { 
      error: getErrorMessage(err),
      default: DEFAULT_TIMEOUT_MS
    });
  }
  return DEFAULT_TIMEOUT_MS;
}

// Save timeout to database
async function saveTimeoutConfig(timeoutMs: number, reason = 'manual'): Promise<void> {
  try {
    let adjustments = 0;
    let history: Array<{ timestamp: string; timeoutMs: number; reason: string }> = [];
    
    // Load existing config if any
    try {
      const existing = await prisma.cacheEntry.findUnique({
        where: { key: TIMEOUT_CONFIG_KEY },
      });
      if (existing) {
        const existingConfig = existing.value as unknown as TimeoutConfig;
        adjustments = (existingConfig.adjustments || 0) + 1;
        if (Array.isArray(existingConfig.history)) {
          history = existingConfig.history.slice(-10); // Keep last 10
        }
      }
    } catch {
      // Ignore history loading errors
    }
    
    history.push({
      timestamp: new Date().toISOString(),
      timeoutMs,
      reason,
    });
    
    const config: TimeoutConfig = {
      timeoutMs,
      adjustments,
      lastAdjusted: new Date().toISOString(),
      reason,
      history,
    };
    
    await prisma.cacheEntry.upsert({
      where: { key: TIMEOUT_CONFIG_KEY },
      update: {
        value: JSON.parse(JSON.stringify(config)),
        updatedAt: new Date(),
      },
      create: {
        key: TIMEOUT_CONFIG_KEY,
        namespace: 'bot-config',
        value: JSON.parse(JSON.stringify(config)),
      },
    });
    
    baseLog('info', '[timeout-config] Saved to database', { 
      timeoutMs, 
      reason, 
      adjustments,
    });
  } catch (err) {
    baseLog('error', '[timeout-config] Failed to save to database', { 
      error: getErrorMessage(err),
      stack: ensureError(err).stack
    });
  }
}

// Auto-increment timeout on error (fire-and-forget save)
function incrementTimeout(currentTimeout: number, reason = 'timeout_error'): number {
  const newTimeout = Math.min(MAX_TIMEOUT_MS, currentTimeout + TIMEOUT_INCREMENT_MS);
  if (newTimeout > currentTimeout) {
    baseLog('info', '[timeout-config] Auto-incrementing', { 
      from: currentTimeout, 
      to: newTimeout, 
      increment: TIMEOUT_INCREMENT_MS, 
      reason 
    });
    // Fire-and-forget: don't block on database write
    saveTimeoutConfig(newTimeout, reason).catch((err) => {
      baseLog('error', '[timeout-config] Background save failed', { error: getErrorMessage(err) });
    });
    return newTimeout;
  }
  baseLog('info', '[timeout-config] Already at maximum', { max: MAX_TIMEOUT_MS });
  return currentTimeout;
}

// Initialize timeout from config (starts with default, loads async)
let GUILD_MEMBER_FETCH_CHUNK_TIMEOUT_MS: number = DEFAULT_TIMEOUT_MS;

// Async initialization of timeout config (runs immediately)
void (async () => {
  try {
    GUILD_MEMBER_FETCH_CHUNK_TIMEOUT_MS = await loadTimeoutConfig();
    baseLog('info', '[timeout-config] Loaded from database', { timeoutMs: GUILD_MEMBER_FETCH_CHUNK_TIMEOUT_MS });
  } catch (err) {
    baseLog('warn', '[timeout-config] Failed to load from database, using default', { 
      default: DEFAULT_TIMEOUT_MS,
      error: getErrorMessage(err) 
    });
  }
})();

const GUILD_MEMBER_FETCH_PAGE_LIMIT = 1_000;
const GUILD_MEMBER_FETCH_MAX_PAGES = 200;
const GUILD_MEMBER_FETCH_REST_DELAY_MS = 250;

// Warm the disk cache on boot so CLI telemetry reflects current assignments.
cache.cleanOldCache();

cliStatus.startStatusDisplay();
cliStatus.setPhase('Booting');
cliStatus.setGuildCount(0);

/** Debug mode logging wrapper - 4th arg (debugMode options) is ignored by baseLog but kept for compatibility */
const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
  // Note: debugMode option was previously passed but baseLog only takes 3 args
  // If CLI_DEBUG_MODE is needed, conditionally enhance logging here
  baseLog(level, message, context);
};

installFatalErrorHandlers({ log, report });
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.User, Partials.Channel],
  // MEMORY MANAGEMENT: Aggressive cache sweeping to prevent memory leaks
  sweepers: {
    // Sweep messages every 15 minutes, keep only 30 minutes
    messages: {
      interval: 900, // Every 15 minutes
      lifetime: 1800, // Keep 30 minutes
    },
    // Sweep guild members every 15 minutes, aggressive cleanup
    guildMembers: {
      interval: 900, // Every 15 minutes
      filter: () => (member) => {
        // Keep bot owner and important users
        if (member.id === '1049161859555643433') return false; // DripTVDD
        // Keep members with roles beyond @everyone
        if (member.roles.cache.size > 1) return false;
        // Keep recently joined members (last 2 hours)
        if (Date.now() - (member.joinedTimestamp || 0) < 2 * 60 * 60 * 1000) return false;
        return true; // Sweep inactive members
      },
    },
    // Sweep users every 15 minutes
    users: {
      interval: 900, // Every 15 minutes
      filter: () => (user) => {
        // Keep bot owner
        if (user.id === '1049161859555643433') return false; // DripTVDD
        // Sweep all other users
        return true;
      },
    },
    // Sweep threads every 15 minutes
    threads: {
      interval: 900, // Every 15 minutes
      lifetime: 1800, // Keep 30 minutes
    },
    // Sweep voice states
    voiceStates: {
      interval: 900,
      filter: () => (state) => !state.channel, // Remove disconnected voice states
    },
  },
  // Limit cache sizes to prevent unbounded growth
  // Values are adaptive based on detected Render plan tier (see resource-tiers.ts)
  makeCache: (manager) => {
    // Limit messages per channel (adaptive memory optimization)
    if (manager.name === 'MessageManager') {
      return new LimitedCollection({ maxSize: TIER.discord.messagesPerChannel });
    }
    // Limit guild members cached
    if (manager.name === 'GuildMemberManager') {
      return new LimitedCollection({ maxSize: TIER.discord.guildMembers });
    }
    // Limit threads cached
    if (manager.name === 'ThreadManager') {
      return new LimitedCollection({ maxSize: TIER.discord.threads });
    }
    // Default caching for other managers
    return new Collection();
  },
}) as ExtendedClient;


// Load slash commands (optional; safe if none present)
let commands: Collection<string, SlashCommand> | null = null;
try {
  const loadedCommands = await loadCommands();
  if (loadedCommands && loadedCommands.size > 0) {
    // Attach to client for convenience - cast to SlashCommand type
    commands = loadedCommands as unknown as Collection<string, SlashCommand>;
    client.commands = new Collection([...commands.entries()]);
  }
} catch (err) {
  log('warn', '[commands] loader failed', { error: getErrorMessage(err) });
}

// --- Persistent Member Snapshot Scheduler Integration ---
client.once(Events.ClientReady, () => {
  try {
    startMemberSnapshotScheduler(client);
    log('info', '[member-snapshot] Scheduler started on bot ready');
  } catch (err) {
    log('error', '[member-snapshot] Failed to start scheduler', { error: getErrorMessage(err) });
  }
});

const GUILD_MEMBERS_TIMEOUT_FRAGMENT = "Members didn't arrive in time.";
const guildMemberFetchCooldowns = new Map<string, number>();

function isGatewayRateLimitError(error: unknown): boolean {
  if (!error) return false;
  const errorObj = error as { name?: string; message?: string };
  if (errorObj.name === 'GatewayRateLimitError') {
    return true;
  }
  const message = typeof errorObj.message === 'string' ? errorObj.message : String(error);
  return message.includes('rate limited') && message.includes('opcode 8');
}

function extractGatewayRateLimitDelayMs(error: unknown): number | null {
  if (!error) return null;
  const errorObj = error as { retryAfter?: number; retry_after?: number; data?: { retry_after?: number }; message?: string };
  const retryAfterRaw = errorObj.retryAfter ?? errorObj.retry_after ?? errorObj.data?.retry_after;
  if (typeof retryAfterRaw === 'number' && Number.isFinite(retryAfterRaw)) {
    return retryAfterRaw >= 1000 ? retryAfterRaw : retryAfterRaw * 1000;
  }
  const message = typeof errorObj.message === 'string' ? errorObj.message : String(error);
  const match = /retry after\s+([\d.]+)\s*seconds/i.exec(message);
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }
  return null;
}

function applyGuildMemberFetchCooldown(guildId: string, delayMs: number): number {
  const boundedDelayMs = Math.min(
    GUILD_MEMBER_FETCH_RATE_LIMIT_CEIL_MS,
    Math.max(GUILD_MEMBER_FETCH_RATE_LIMIT_FLOOR_MS, delayMs)
  );
  const until = Date.now() + boundedDelayMs;
  guildMemberFetchCooldowns.set(guildId, until);
  return boundedDelayMs;
}

function isGuildMembersTimeout(error: unknown): boolean {
  if (!error) return false;
  const errorObj = error as { code?: string; name?: string; message?: string };
  const code = errorObj.code || errorObj.name;
  if (code === 'GuildMembersTimeout') {
    return true;
  }
  const message = typeof errorObj.message === 'string' ? errorObj.message : String(error);
  return message.includes(GUILD_MEMBERS_TIMEOUT_FRAGMENT);
}

async function ensureGuildMembersCached(guild: Guild, options: EnsureGuildMembersCachedOptions = {}): Promise<Collection<string, GuildMember>> {
  const {
    origin = 'unspecified',
    chunkTimeoutMs = GUILD_MEMBER_FETCH_CHUNK_TIMEOUT_MS,
    chunkRetries = GUILD_MEMBER_FETCH_CHUNK_RETRIES,
    pageLimit = GUILD_MEMBER_FETCH_PAGE_LIMIT,
    maxPages = GUILD_MEMBER_FETCH_MAX_PAGES,
    restDelayMs = GUILD_MEMBER_FETCH_REST_DELAY_MS,
  } = options;

  const guildSummary = describeGuild(guild);
  const targetCount = Number.isFinite(guild.memberCount) ? guild.memberCount : null;
  const cooldownUntil = guildMemberFetchCooldowns.get(guild.id);
  if (cooldownUntil && Date.now() < cooldownUntil) {
    const remainingMs = Math.max(0, cooldownUntil - Date.now());
    report('Members Fetch Rate Limited (Cooldown Active)', {
      origin,
      guild: guildSummary,
      cooldownRemainingMs: remainingMs,
      nextAttemptAt: new Date(cooldownUntil).toISOString(),
      cachedMembers: guild.members.cache.size,
      targetMembers: targetCount ?? 'unknown',
      status: 'Skipped member fetch due to active rate limit cooldown'
    }, 'warn');
    return guild.members.cache;
  }

  let chunkAttempts = 0;
  let chunkSucceeded = false;

  while (chunkAttempts < Math.max(1, chunkRetries)) {
    chunkAttempts += 1;
    try {
      await guild.members.fetch({ time: chunkTimeoutMs });
      chunkSucceeded = true;
      break;
    } catch (error) {
      if (isGatewayRateLimitError(error)) {
        const delayMs = applyGuildMemberFetchCooldown(
          guild.id,
          extractGatewayRateLimitDelayMs(error) ?? GUILD_MEMBER_FETCH_RATE_LIMIT_FLOOR_MS
        );
        report('Members Fetch Rate Limited (Chunk Request)', mergeReportError({
          origin,
          guild: guildSummary,
          attempt: chunkAttempts,
          retries: chunkRetries,
          retryAfterMs: delayMs,
          status: 'Cooldown applied; skipping member fetch'
        }, error), 'warn');
        return guild.members.cache;
      }

      if (!isGuildMembersTimeout(error)) {
        throw error;
      }

      const isLastAttempt = chunkAttempts >= chunkRetries;
      const willFallback = isLastAttempt;
      
      report('Members Fetch Chunk Timeout (Handled Gracefully)', mergeReportError({
        origin,
        guild: guildSummary,
        attempt: chunkAttempts,
        retries: chunkRetries,
        timeoutMs: chunkTimeoutMs,
        willRetry: !isLastAttempt,
        willFallbackToPagination: willFallback,
        status: willFallback ? 'Falling back to paginated fetch' : `Retrying (attempt ${chunkAttempts + 1}/${chunkRetries})`,
      }, error), isLastAttempt ? 'warn' : 'info');

      // Auto-increment timeout on first occurrence (before retries)
      if (chunkAttempts === 1) {
        GUILD_MEMBER_FETCH_CHUNK_TIMEOUT_MS = incrementTimeout(
          GUILD_MEMBER_FETCH_CHUNK_TIMEOUT_MS,
          `GuildMembersTimeout in ${guildSummary} (origin: ${origin})`
        );
      }

      // Record timeout in persistent state for monitoring
      if (botState) {
        try {
          recordMemberFetchTimeout(botState as unknown as Parameters<typeof recordMemberFetchTimeout>[0], guild.id, guildSummary, origin, chunkAttempts, chunkRetries);
        } catch (err) {
          // Don't fail the sweep if state recording fails
          log('debug', 'Failed to record member fetch timeout in state', { err: getErrorMessage(err) });
        }
      }

      if (chunkAttempts >= chunkRetries) {
        log('info', 'Chunk fetch exhausted retries, switching to paginated fallback', {
          guild: guildSummary,
          origin,
          totalAttempts: chunkAttempts,
        });
        break;
      }

      await wait(Math.min(chunkTimeoutMs, 500 * chunkAttempts));
    }
  }

  const cachedAfterChunk = guild.members.cache.size;
  if (chunkSucceeded && (!targetCount || cachedAfterChunk >= targetCount)) {
    return guild.members.cache;
  }

  let after: string | undefined;
  let previousAfter: string | undefined;
  let newlyFetched = 0;
  let pages = 0;
  let fallbackUsed = false;

  while (pages < maxPages) {
    const pageOptions: { limit: number; after?: string } = { limit: pageLimit };
    if (after) {
      pageOptions.after = after;
    }

    let batch: Collection<string, GuildMember>;
    try {
      batch = await guild.members.fetch(pageOptions);
    } catch (error) {
      if (isGatewayRateLimitError(error)) {
        const delayMs = applyGuildMemberFetchCooldown(
          guild.id,
          extractGatewayRateLimitDelayMs(error) ?? GUILD_MEMBER_FETCH_RATE_LIMIT_FLOOR_MS
        );
        report('Members Fetch Rate Limited (Paginated Request)', mergeReportError({
          origin,
          guild: guildSummary,
          page: pages + 1,
          retryAfterMs: delayMs,
          status: 'Cooldown applied; pagination halted'
        }, error), 'warn');
        break;
      }
      throw error;
    }
    if (batch.size === 0) {
      break;
    }

    fallbackUsed = true;
    newlyFetched += batch.size;
    pages += 1;

    const lastKey = batch.lastKey();
    if (!lastKey || lastKey === previousAfter) {
      break;
    }
    previousAfter = lastKey;
    after = lastKey;

    if (targetCount && guild.members.cache.size >= targetCount) {
      break;
    }

    if (restDelayMs > 0) {
      await wait(restDelayMs);
    }
  }

  if (fallbackUsed) {
    const cached = guild.members.cache.size;
    const successful = !targetCount || cached >= targetCount;
    report('Members Fetch Paginated (Fallback Succeeded)', {
      origin,
      guild: guildSummary,
      cachedMembers: cached,
      targetMembers: targetCount ?? 'unknown',
      pages,
      newlyFetched,
      chunkAttempts,
      coverageStatus: successful ? 'Complete' : 'Partial',
      note: 'Paginated fallback completed successfully after chunk timeout',
    }, successful ? 'success' : 'warn');

    if (targetCount && cached < targetCount) {
      log('warn', 'Member pagination completed before reaching reported memberCount', {
        origin,
        guild: guildSummary,
        cachedMembers: cached,
        targetMembers: targetCount,
        pages,
        newlyFetched,
        chunkAttempts,
      });
    }
  }

  return guild.members.cache;
}
let loginPromise: Promise<string> | null = null;
let dripAlertManager: DripAlertManager | null = null;
let botState: SecurityBotState | null = null;
let autoSaveInterval: ReturnType<typeof setInterval> | null = null;

// Security audit services (HMAC + hash-chain SOC 2 compliance)
const securityEventService = new SecurityEventService(prisma);
const roleAuditService = new RoleAuditService(prisma);

const describeRole = (role: Role): string => `${role.name} (#${role.id})`;
const describeMember = (member: GuildMember | PartialGuildMember): string => `${member.user?.tag ?? member.displayName ?? 'unknown'} (#${member.id})`;
const describeGuild = (guild: Guild): string => `${guild.name} (#${guild.id})`;
const describeUser = (user: User | GuildMember | PartialUser | null | undefined): string => {
  if (!user) return 'unknown user';
  // Handle GuildMember by getting its user
  const actualUser = 'user' in user ? user.user : user;
  const tag = actualUser.tag || actualUser.username || 'unknown';
  return `${tag} (#${actualUser.id})`;
};

const securityCliState: SecurityCliState = {
  status: 'Booting',
  lastSweepStartedAt: null,
  lastSweepCompletedAt: null,
  lastSweepDurationMs: null,
  lastSweepOrigin: null,
  lastSweepGuild: null,
  lastSweepCandidates: 0,
  lastSweepAssigned: 0,
  lastSweepFailed: 0,
  lastSweepResult: null,
  totalSweeps: 0,
  totalAssignments: 0,
  totalFailures: 0,
  lastAlertSentAt: null,
  lastAlertMessage: null,
  memberStats: null,
};

const continuousSweepState: ContinuousSweepState = {
  running: false,
  abortController: null,
  loopPromise: undefined,
};

const pendingOpsErrorQueue: OpsErrorEventExtended[] = [];
// MEMORY FIX (2025-11-18): Bound deliveredOpsErrorIds to prevent unbounded growth
// Previous: Set grew indefinitely (47 MB/hour leak on idle bot)
// After: LRU with 200 entry cap (rolling window of recent deliveries)
const deliveredOpsErrorIds = new Set<string>();
const MAX_DELIVERED_IDS_SIZE = 200; // Cap to prevent memory leak
let deliveringOpsErrors = false;
let opsErrorRetryTimer: ReturnType<typeof setTimeout> | null = null;
let memberStatsInterval: ReturnType<typeof setInterval> | null = null;
let memberStatsRefreshing = false;

const memberRoleReversionsInProgress = new Set<string>();
const rolePermissionReversionsInProgress = new Set<string>();
const trainerRoleAssignmentInFlight = new Map<string, number>();

function scheduleCleanup<T>(container: Set<T>, key: T, ttlMs = 5000): void {
  const timer = setTimeout(() => {
    container.delete(key);
  }, ttlMs);
  timer.unref?.();
}

function trainerAssignmentKey(guildId: string, memberId: string): string {
  return `${guildId}:${memberId}`;
}

function markTrainerAssignmentInFlight(guildId: string, memberId: string, ttlMs = 120_000): void {
  const key = trainerAssignmentKey(guildId, memberId);
  const expiresAt = Date.now() + ttlMs;
  trainerRoleAssignmentInFlight.set(key, expiresAt);
  const timer = setTimeout(() => {
    const current = trainerRoleAssignmentInFlight.get(key);
    if (typeof current === 'number' && current <= Date.now()) {
      trainerRoleAssignmentInFlight.delete(key);
    }
  }, ttlMs);
  timer.unref?.();
}

/**
 * Backward-compatible alias kept to prevent deploy/build failures when
 * downstream branches still reference the previous helper name.
 */
function markExpectedBotRoleMutation(guildId: string, memberId: string, ttlMs = 120_000): void {
  markTrainerAssignmentInFlight(guildId, memberId, ttlMs);
}

function isTrainerAssignmentInFlight(guildId: string, memberId: string): boolean {
  const key = trainerAssignmentKey(guildId, memberId);
  const expiresAt = trainerRoleAssignmentInFlight.get(key);
  if (!expiresAt) {
    return false;
  }
  if (expiresAt <= Date.now()) {
    trainerRoleAssignmentInFlight.delete(key);
    return false;
  }
  return true;
}

function isClientReady(): boolean {
  if (typeof client.isReady === 'function') {
    return client.isReady();
  }
  return Boolean(client.readyAt);
}

// formatDurationShort now imported as formatDuration from shared/utils/format-utils.js (centralized)

function describeMomentForCli(value: Date | string | number | null | undefined): string {
  if (!value) {
    return 'never';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  let relative;
  if (abs < 1000) {
    relative = 'just now';
  } else if (abs < 60_000) {
    relative = `${Math.floor(abs / 1000)}s ${diff >= 0 ? 'ago' : 'from now'}`;
  } else if (abs < 3_600_000) {
    relative = `${Math.floor(abs / 60_000)}m ${diff >= 0 ? 'ago' : 'from now'}`;
  } else if (abs < 86_400_000) {
    relative = `${Math.floor(abs / 3_600_000)}h ${diff >= 0 ? 'ago' : 'from now'}`;
  } else {
    relative = `${Math.floor(abs / 86_400_000)}d ${diff >= 0 ? 'ago' : 'from now'}`;
  }
  return `${toEasternString(date)} (${relative})`;
}

async function refreshMemberStats(reason = 'unspecified'): Promise<void> {
  if (memberStatsRefreshing || !isClientReady()) {
    return;
  }

  memberStatsRefreshing = true;
  try {
    const snapshot: MemberStatsSnapshot = {
      totalMembers: 0,
      totalEligibleMembers: 0,
      totalWithRole: 0,
      guilds: [],
      updatedAt: new Date(),
      partial: false,
      reason,
    };

    for (const [, guild] of client.guilds.cache) {
      const guildSummary = describeGuild(guild);
      const memberCount = Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size;
      const cachedBots = guild.members.cache.filter((member) => member.user.bot).size;
      const eligibleMemberCount = Math.max(0, memberCount - cachedBots);
      let roleCount = 0;
      let complete = false;
      const role = findRole(guild);

      if (role) {
        if (role.members && role.members.size > 0) {
          roleCount = role.members.size;
          complete = guild.members.cache.size === memberCount || memberCount === 0;
        } else if (guild.members.cache.size > 0 && (memberCount === 0 || guild.members.cache.size === memberCount)) {
          roleCount = guild.members.cache.filter((member) => member.roles.cache.has(role.id)).size;
          complete = true;
        } else if ((role as unknown as { memberCount?: number }).memberCount != null) {
          roleCount = (role as unknown as { memberCount?: number }).memberCount ?? 0;
          complete = true;
        } else if (memberCount > 0 && memberCount <= 1000) {
          try {
            await ensureGuildMembersCached(guild, { origin: `member-stats:${reason}` });
            roleCount = guild.members.cache.filter((member) => member.roles.cache.has(role.id)).size;
            complete = true;
          } catch (err) {
            log('warn', 'Member fetch failed while refreshing role coverage', mergeLogError({
              guild: guildSummary,
              reason,
            }, err));
          }
        }
      }

      if (!complete && role) {
        snapshot.partial = true;
      }

      snapshot.totalMembers += memberCount;
      snapshot.totalEligibleMembers += eligibleMemberCount;
      snapshot.totalWithRole += roleCount;
      snapshot.guilds.push({
        guildId: guild.id,
        guild: guildSummary,
        memberCount,
        eligibleMemberCount,
        roleCount,
        complete,
      });
    }

    securityCliState.memberStats = snapshot;
    updateSecurityCliSection({});
  } catch (error) {
    log('warn', 'Failed to refresh member statistics', mergeLogError({ reason }, error));
  } finally {
    memberStatsRefreshing = false;
  }
}

function bumpRoleMemberCount(guild: Guild, delta = 1): void {
  if (!guild || !Number.isFinite(delta) || delta === 0) {
    return;
  }
  const stats = securityCliState.memberStats;
  const updatedAt = new Date();
  if (!stats) {
    securityCliState.memberStats = {
      totalMembers: Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size,
      totalEligibleMembers: Math.max(
        0,
        (Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size)
          - guild.members.cache.filter((member) => member.user.bot).size
      ),
      totalWithRole: Math.max(0, delta),
      guilds: [{
        guildId: guild.id,
        guild: describeGuild(guild),
        memberCount: Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size,
        eligibleMemberCount: Math.max(
          0,
          (Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size)
            - guild.members.cache.filter((member) => member.user.bot).size
        ),
        roleCount: 0,
        complete: false,
      }],
      updatedAt,
      partial: true,
      reason: 'incremental-update',
    };
    updateSecurityCliSection({});
    return;
  }

  stats.totalWithRole = Math.max(0, stats.totalWithRole + delta);
  stats.updatedAt = updatedAt;
  stats.partial = true;
  const entry = stats.guilds.find((item) => item.guildId === guild.id) ?? (() => {
    const created: GuildStatsEntry = {
      guildId: guild.id,
      guild: describeGuild(guild),
      memberCount: Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size,
      eligibleMemberCount: Math.max(
        0,
        (Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size)
          - guild.members.cache.filter((member) => member.user.bot).size
      ),
      roleCount: 0,
      complete: false,
    };
    stats.guilds.push(created);
    return created;
  })();
  entry.guild = describeGuild(guild);
  entry.memberCount = Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size;
  entry.eligibleMemberCount = Math.max(
    0,
    entry.memberCount - guild.members.cache.filter((member) => member.user.bot).size
  );
  entry.roleCount = Math.max(0, entry.roleCount + delta);
  entry.complete = false;
  updateSecurityCliSection({});
}

function updateSecurityCliSection(overrides: Partial<SecurityCliState> = {}): void {
  Object.assign(securityCliState, overrides);
  const metrics: Array<[string, string | number]> = [];
  if (client?.user?.tag) {
    metrics.push(['identity', client.user.tag]);
  }
  const guildCount = client?.guilds?.cache?.size ?? 0;
  metrics.push(['guilds', guildCount]);

  if (securityCliState.lastSweepCompletedAt) {
    const target = securityCliState.lastSweepGuild || 'unknown guild';
    const origin = securityCliState.lastSweepOrigin || 'unspecified';
    metrics.push(['last sweep', `${target} via ${origin}`]);
    metrics.push(['sweep finished', describeMomentForCli(securityCliState.lastSweepCompletedAt)]);
    if (Number.isFinite(securityCliState.lastSweepDurationMs) && securityCliState.lastSweepDurationMs !== null) {
      metrics.push(['sweep duration', formatDuration(securityCliState.lastSweepDurationMs)]);
    }
    const parts = [];
    if (securityCliState.lastSweepCandidates) {
      parts.push(`${securityCliState.lastSweepAssigned}/${securityCliState.lastSweepCandidates} assigned`);
    } else {
      parts.push(`${securityCliState.lastSweepAssigned} assigned`);
    }
    if (securityCliState.lastSweepFailed) {
      parts.push(`${securityCliState.lastSweepFailed} failed`);
    }
    if (securityCliState.lastSweepResult) {
      parts.push(securityCliState.lastSweepResult);
    }
    metrics.push(['sweep result', parts.filter(Boolean).join(' • ') || 'no changes']);
  } else if (securityCliState.lastSweepStartedAt) {
    metrics.push(['sweep started', describeMomentForCli(securityCliState.lastSweepStartedAt)]);
    if (securityCliState.lastSweepOrigin) {
      metrics.push(['sweep origin', securityCliState.lastSweepOrigin]);
    }
  }

  metrics.push(['sweeps', securityCliState.totalSweeps]);
  metrics.push(['assigned total', securityCliState.totalAssignments]);
  if (securityCliState.totalFailures > 0) {
    metrics.push(['failed total', securityCliState.totalFailures]);
  }

  if (securityCliState.memberStats) {
    const stats = securityCliState.memberStats;
    const denominator = !stats.partial && stats.totalEligibleMembers > 0 && stats.totalWithRole <= stats.totalEligibleMembers
      ? stats.totalEligibleMembers
      : stats.totalMembers;
    const coverageRatio = denominator > 0 ? stats.totalWithRole / denominator : 0;
    metrics.push(['role coverage', `${stats.totalWithRole}/${denominator || 0}`]);
    metrics.push(['coverage %', `${(coverageRatio * 100).toFixed(coverageRatio >= 0.1 ? 1 : 2)}%${stats.partial ? ' (est)' : ''}`]);
    const guildSummaryParts = stats.guilds
      .slice(0, 3)
      .map((entry) => {
        const suffix = entry.complete ? '' : ' (est)';
        const memberTotal = entry.eligibleMemberCount || entry.memberCount || 0;
        return `${entry.roleCount}/${memberTotal} ${entry.guild}${suffix}`;
      });
    if (guildSummaryParts.length > 0) {
      metrics.push(['top guilds', guildSummaryParts.join(' | ')]);
    }
    metrics.push(['members updated', describeMomentForCli(stats.updatedAt)]);
  }

  if (securityCliState.lastAlertSentAt) {
    metrics.push(['last alert', describeMomentForCli(securityCliState.lastAlertSentAt)]);
    if (securityCliState.lastAlertMessage) {
      metrics.push(['alert message', securityCliState.lastAlertMessage]);
    }
  }

  const now = Date.now();
  const lastCompletedAtMs = securityCliState.lastSweepCompletedAt instanceof Date
    ? securityCliState.lastSweepCompletedAt.getTime()
    : null;
  const lastStartedAtMs = securityCliState.lastSweepStartedAt instanceof Date
    ? securityCliState.lastSweepStartedAt.getTime()
    : null;
  const sweepInProgress = Boolean(
    lastStartedAtMs && (!lastCompletedAtMs || lastCompletedAtMs < lastStartedAtMs)
  );
  let displayStatus = securityCliState.status || 'Monitoring';
  if (!sweepInProgress && lastCompletedAtMs) {
    const elapsed = now - lastCompletedAtMs;
    if (elapsed >= CLI_SWEEP_WARNING_THRESHOLD_SECONDS * 1000) {
      displayStatus = `Warning: sweeps stale (${formatDuration(elapsed)})`;
    }
  }

  cliStatus.setSection('security', {
    title: 'Security Bot',
    status: displayStatus,
    metrics,
  });
}

function beginSecuritySweep(guild: Guild, origin: string): Date {
  const startedAt = new Date();
  updateSecurityCliSection({
    status: `Sweeping ${guild.name}`,
    lastSweepStartedAt: startedAt,
    lastSweepOrigin: origin,
    lastSweepGuild: describeGuild(guild),
    lastSweepCandidates: 0,
    lastSweepAssigned: 0,
    lastSweepFailed: 0,
    lastSweepResult: 'in progress',
  });
  return startedAt;
}

function completeSecuritySweep({ startedAt, assigned = 0, failed = 0, candidates = 0, reason = 'completed' }: SweepResult): void {
  const completedAt = new Date();
  const durationMs = startedAt instanceof Date ? completedAt.getTime() - startedAt.getTime() : null;
  updateSecurityCliSection({
    lastSweepCompletedAt: completedAt,
    lastSweepDurationMs: durationMs,
    lastSweepAssigned: assigned,
    lastSweepFailed: failed,
    lastSweepCandidates: candidates,
    lastSweepResult: reason,
    totalSweeps: securityCliState.totalSweeps + 1,
    totalAssignments: securityCliState.totalAssignments + Math.max(0, assigned),
    totalFailures: securityCliState.totalFailures + Math.max(0, failed),
  });
  void refreshMemberStats('sweep complete');
}

function safeSerialize(value: unknown, limit = 1800): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  try {
    const serialized = JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') {
        return val.toString();
      }
      if (val instanceof Map) {
        return Object.fromEntries(val.entries());
      }
      if (val instanceof Set) {
        return Array.from(val.values());
      }
      return val;
    }, 2);
    if (!serialized) {
      return undefined;
    }
    if (serialized.length <= limit) {
      return serialized;
    }
    return `${serialized.slice(0, limit - 3)}...`;
  } catch {
    // Ignore serialization errors
    return undefined;
  }
}

interface OpsErrorMeta {
  id: string;
  occurredAt: string;
  detail?: string;
  source?: string;
  context?: string;
  [key: string]: unknown; // Allow additional properties for Record<string, unknown> compatibility
}

interface OpsErrorEventExtended extends OpsErrorEvent {
  detail?: string;
  source?: string;
  context?: Record<string, unknown>;
  skipAlert?: boolean;
}

function buildOpsErrorMeta(event: OpsErrorEventExtended): OpsErrorMeta {
  const meta: OpsErrorMeta = {
    id: event.id,
    occurredAt: event.timestamp instanceof Date ? event.timestamp.toISOString() : new Date().toISOString(), // Keep ISO for metadata
  };
  if (event.detail) {
    meta.detail = event.detail;
  }
  if (event.source) {
    meta.source = event.source;
  }
  if (event.context && Object.keys(event.context).length) {
    const serialized = safeSerialize(event.context);
    if (serialized) {
      meta.context = serialized;
    }
  }
  return meta;
}

function scheduleOpsErrorRetry(): void {
  if (opsErrorRetryTimer) {
    return;
  }
  opsErrorRetryTimer = setTimeout(() => {
    opsErrorRetryTimer = null;
    if (isClientReady()) {
      void deliverOpsErrors();
    }
  }, 10_000);
  opsErrorRetryTimer.unref?.();
}

function queueOpsError(event: OpsErrorEventExtended | null | undefined): void {
  if (!event || event.skipAlert || event.source === 'drip-alerts') {
    return;
  }
  if (deliveredOpsErrorIds.has(event.id)) {
    return;
  }
  if (pendingOpsErrorQueue.some((item) => item.id === event.id)) {
    return;
  }
  // MEMORY CAP: Drop oldest if queue full (prevents unbounded growth under sustained failures)
  if (pendingOpsErrorQueue.length >= MAX_OPS_ERROR_QUEUE_SIZE) {
    const dropped = pendingOpsErrorQueue.shift();
    log('warn', '[ops-errors] Queue at capacity, dropping oldest alert', { 
      droppedMessage: dropped?.message,
      queueSize: pendingOpsErrorQueue.length 
    });
  }
  pendingOpsErrorQueue.push({ ...event, attempts: event.attempts || 0 });
  updateSecurityCliSection({
    lastAlertMessage: `queued: ${event.message}`,
  });
  if (isClientReady()) {
    void deliverOpsErrors();
  }
}

async function deliverOpsErrors() {
  if (deliveringOpsErrors) {
    return;
  }
  deliveringOpsErrors = true;
  try {
    while (pendingOpsErrorQueue.length > 0) {
      if (!isClientReady() || !dripAlertManager) {
        break;
      }
      const event = pendingOpsErrorQueue.shift();
      if (!event) {
        continue;
      }
      if (deliveredOpsErrorIds.has(event.id) || event.skipAlert || event.source === 'drip-alerts') {
        // MEMORY FIX (2025-11-18): Evict oldest IDs when Set exceeds cap
        if (deliveredOpsErrorIds.size >= MAX_DELIVERED_IDS_SIZE) {
          // Convert to array, remove first 20% (FIFO approximation)
          const idsArray = Array.from(deliveredOpsErrorIds);
          const toRemove = Math.ceil(idsArray.length * 0.2);
          for (let i = 0; i < toRemove; i++) {
            deliveredOpsErrorIds.delete(idsArray[i]);
          }
        }
        deliveredOpsErrorIds.add(event.id);
        continue;
      }
      try {
        const meta = buildOpsErrorMeta(event);
        const title = `Ops Error: ${event.message}`;
        const success = await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.critical, title, meta);
        if (success === false) {
          event.attempts = (event.attempts || 0) + 1;
          if (event.attempts < 3) {
            pendingOpsErrorQueue.push(event);
            updateSecurityCliSection({
              lastAlertMessage: `retry pending: ${event.message}`,
            });
            scheduleOpsErrorRetry();
          } else {
            // MEMORY FIX (2025-11-18): Evict oldest IDs when Set exceeds cap
            if (deliveredOpsErrorIds.size >= MAX_DELIVERED_IDS_SIZE) {
              const idsArray = Array.from(deliveredOpsErrorIds);
              const toRemove = Math.ceil(idsArray.length * 0.2);
              for (let i = 0; i < toRemove; i++) {
                deliveredOpsErrorIds.delete(idsArray[i]);
              }
            }
            deliveredOpsErrorIds.add(event.id);
          }
          break;
        }
        // MEMORY FIX (2025-11-18): Evict oldest IDs when Set exceeds cap
        if (deliveredOpsErrorIds.size >= MAX_DELIVERED_IDS_SIZE) {
          const idsArray = Array.from(deliveredOpsErrorIds);
          const toRemove = Math.ceil(idsArray.length * 0.2);
          for (let i = 0; i < toRemove; i++) {
            deliveredOpsErrorIds.delete(idsArray[i]);
          }
        }
        deliveredOpsErrorIds.add(event.id);
        updateSecurityCliSection({
          lastAlertSentAt: new Date(),
          lastAlertMessage: event.message,
        });
      } catch (error) {
        event.attempts = (event.attempts || 0) + 1;
        if (event.attempts < 3) {
          pendingOpsErrorQueue.push(event);
          updateSecurityCliSection({
            lastAlertMessage: `retry pending: ${event.message}`,
          });
          scheduleOpsErrorRetry();
        } else {
          // MEMORY FIX (2025-11-18): Evict oldest IDs when Set exceeds cap
          if (deliveredOpsErrorIds.size >= MAX_DELIVERED_IDS_SIZE) {
            const idsArray = Array.from(deliveredOpsErrorIds);
            const toRemove = Math.ceil(idsArray.length * 0.2);
            for (let i = 0; i < toRemove; i++) {
              deliveredOpsErrorIds.delete(idsArray[i]);
            }
          }
          deliveredOpsErrorIds.add(event.id);
        }
        log('error', 'Ops error alert dispatch failed', mergeLogError({ originalMessage: event.message }, error));
        break;
      }
    }
  } finally {
    deliveringOpsErrors = false;
  }
}

if (opsNotifier && typeof opsNotifier.subscribe === 'function') {
  opsNotifier.subscribe(queueOpsError as Parameters<typeof opsNotifier.subscribe>[0]);
  if (typeof opsNotifier.getRecentErrors === 'function') {
    opsNotifier.getRecentErrors().forEach((e: unknown) => queueOpsError(e as OpsErrorEventExtended));
  }
}

updateSecurityCliSection();

interface ErrorWithCode extends Error {
  code?: string | number;
}

function mergeLogError(base: Record<string, unknown>, error: unknown): Record<string, unknown> {
  const err = ensureError(error);
  return {
    ...base,
    error: err,
  };
}

function mergeReportError(base: Record<string, unknown>, error: unknown): Record<string, unknown> {
  const err = ensureError(error) as ErrorWithCode;
  const details: Record<string, unknown> = {
    ...base,
    errorMessage: err.message,
  };
  if (err.code !== undefined) {
    details.errorCode = err.code;
  }
  if (err.stack) {
    details.errorStack = err.stack;
  }
  return details;
}

interface AuditRoleChange {
  key?: string;
  old?: Array<{ id?: string; name?: string }> | string;
  new?: Array<{ id?: string; name?: string }> | string;
}

function extractAuditRoleIds(change: AuditRoleChange | null | undefined): string[] {
  if (!change) {
    return [];
  }
  const candidates: Array<{ id?: string }> = [];
  if (Array.isArray(change.new)) {
    candidates.push(...change.new);
  }
  if (Array.isArray(change.old)) {
    candidates.push(...change.old);
  }
  return candidates
    .map((item) => (item && typeof item.id === 'string' ? item.id : null))
    .filter((id): id is string => id !== null);
}

// Role IDs that are always treated as authorized executors by the security bot.
// Members holding these roles can make role/permission changes without triggering
// a revert. Uses imported constants from env.ts for consistency with ID-first pattern.
const AUTHORIZED_ROLE_IDS = new Set<string>([
  ADMIN_ROLE_ID,        // Admin
  SERVER_ADMIN_ROLE_ID, // Server Admin
]);

async function evaluateExecutorAuthorization(guild: Guild | null, executor: GuildMember | User | null): Promise<ExecutorAuthorizationResult> {
  if (!guild || !executor) {
    return { authorized: false, reason: 'unknown-executor', member: null };
  }

  const botId = client?.user?.id;
  if (botId && executor.id === botId) {
    return { authorized: true, reason: 'security-bot', member: guild.members.me ?? null };
  }

  if (guild.ownerId === executor.id) {
    let ownerMember: GuildMember | null = guild.members.cache.get(executor.id) || null;
    if (!ownerMember) {
      try {
        ownerMember = await guild.members.fetch(executor.id);
      } catch (error) {
        log('warn', 'Failed to resolve guild owner during authorization check', mergeLogError({
          guild: describeGuild(guild),
          executor: describeUser(executor),
        }, error));
      }
    }
    return { authorized: true, reason: 'guild-owner', member: ownerMember };
  }

  let member: GuildMember | null = guild.members.cache.get(executor.id) || null;
  if (!member) {
    try {
      member = await guild.members.fetch(executor.id);
    } catch (error) {
      log('warn', 'Failed to resolve executor member for authorization', mergeLogError({
        guild: describeGuild(guild),
        executor: describeUser(executor),
      }, error));
    }
  }

  if (member?.permissions?.has?.(PermissionsBitField.Flags.Administrator)) {
    return { authorized: true, reason: 'administrator', member };
  }

  // Authorize members holding a specifically named admin role by ID.
  // This covers "Admin" and "Server Admin" which may not carry the Discord
  // Administrator permission flag but are trusted to manage the server.
  if (member?.roles?.cache?.some((role) => AUTHORIZED_ROLE_IDS.has(role.id))) {
    const matchedRole = member.roles.cache.find((role) => AUTHORIZED_ROLE_IDS.has(role.id));
    return { authorized: true, reason: `authorized-role:${matchedRole?.name ?? matchedRole?.id}`, member };
  }

  return {
    authorized: false,
    reason: member ? 'insufficient-permissions' : 'member-unavailable',
    member,
  };
}

async function revertMemberRoles(member: GuildMember | PartialGuildMember | null, { rolesToRemove = [], rolesToAdd = [], reason = 'Security bot rollback' }: RevertMemberRolesOptions = {}): Promise<RevertMemberRolesResult> {
  if (!member) {
    return {
      success: false,
      removed: [],
      added: [],
      errors: [{ action: 'validation', message: 'member-unavailable' }],
    };
  }

  const normalize = (input: (Role | string)[] | undefined): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((role) => {
        if (!role) return null;
        if (typeof role === 'string') return role;
        return role.id || null;
      })
      .filter((id): id is string => id !== null);
  };

  const removeIds = normalize(rolesToRemove);
  const addIds = normalize(rolesToAdd);

  memberRoleReversionsInProgress.add(member.id);
  scheduleCleanup(memberRoleReversionsInProgress, member.id, 10_000);

  const errors = [];

  if (removeIds.length > 0) {
    try {
      await member.roles.remove(removeIds, reason);
    } catch (error) {
      errors.push({
        action: 'remove',
        roles: removeIds,
        message: getErrorMessage(error),
      });
      log('error', 'Failed to remove roles during security rollback', mergeLogError({
        guild: describeGuild(member.guild),
        member: describeMember(member),
        roles: removeIds,
        reason,
      }, error));
    }
  }

  if (addIds.length > 0) {
    try {
      await member.roles.add(addIds, reason);
    } catch (error) {
      errors.push({
        action: 'add',
        roles: addIds,
        message: getErrorMessage(error),
      });
      log('error', 'Failed to re-assign roles during security rollback', mergeLogError({
        guild: describeGuild(member.guild),
        member: describeMember(member),
        roles: addIds,
        reason,
      }, error));
    }
  }

  if (errors.length === 0) {
    return { success: true, removed: removeIds, added: addIds, errors: [] };
  }

  return {
    success: false,
    removed: removeIds,
    added: addIds,
    errors,
  };
}

async function wait(ms: number, signal?: AbortSignal): Promise<void> {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    };
    timeout = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, delay);
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}

function getContinuousSweepGuilds(signal: AbortSignal | undefined, transformer?: (guilds: Guild[], signal?: AbortSignal) => Guild[] | Collection<string, Guild> | Iterable<Guild>): Guild[] {
  if (signal?.aborted) {
    return [];
  }
  const base = Array.from(client.guilds.cache.values());
  if (typeof transformer !== 'function') {
    return base;
  }
  try {
    const transformed = transformer(base, signal);
    if (!transformed) {
      return base;
    }
    if (Array.isArray(transformed)) {
      return transformed.filter((g): g is Guild => Boolean(g));
    }
    if (transformed instanceof Collection) {
      return Array.from(transformed.values()).filter((g): g is Guild => Boolean(g));
    }
    if (typeof (transformed as Iterable<Guild>)[Symbol.iterator] === 'function') {
      return Array.from(transformed as Iterable<Guild>).filter((g): g is Guild => Boolean(g));
    }
    return base;
  } catch (error) {
    log('warn', 'Continuous sweep transformer failed', mergeLogError({
      guildCount: base.length,
    }, error));
    return base;
  }
}

function canAssignRole(guild: Guild, role: Role): boolean {
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
// formatBytes now imported from shared/utils/format-utils.js (centralized)

function reportOperationalStats(where = 'startup'): void {
  // Use resourceMonitor for accurate disk metrics (directory walk, not statfsSync)
  // Note: cache.getCacheBudget() uses statfsSync which returns container FS, not /Store volume
  const metrics = resourceMonitor.getMetrics();
  const mem = process.memoryUsage();

  log('info', '=== Cache & Resource Report ===', {
    at: where,
    cacheDir: metrics.cacheDir,
    cacheSize: formatBytes(metrics.cacheSize),
    cacheBudgetMax: formatBytes(metrics.cacheBudgetMax),
    cacheBudgetPercent: `${Math.round(metrics.cacheBudgetPercent * 100)}% of approx free`,
    approxFree: formatBytes(metrics.approxFree),
    workspaceLimit: formatBytes(metrics.workspaceLimit),
    diskFree: formatBytes(metrics.diskFree),
    diskTotal: formatBytes(metrics.diskTotal),
    diskUsed: formatBytes(metrics.diskUsed),
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

const ACTIVITY_LABELS: Record<string, string> = Object.freeze({
  'role-assignment': 'Role assignments',
  'role-permissions-healed': 'Permission heals',
  'security-alert': 'Security alerts',
  'drip-alert-critical': 'Critical DM alerts',
  'drip-alert-warning': 'Queued DM alerts',
  'drip-alert-digest': 'Alert digests',
});

let summaryTimer: ReturnType<typeof setTimeout> | null = null;

function msUntilNextReport(hour: number, minute: number): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function formatSummaryReport(entries: ActivityEntry[] | null | undefined, generatedAt: Date): string {
  const headerDate = toEasternDate(generatedAt);
  const headerTime = toEasternTime(generatedAt);
  const header = `🛡️ Daily Security Summary — ${headerDate} @ ${headerTime}`;
  if (!entries || entries.length === 0) {
    return `${header}\n\nNo role assignments or permission changes were recorded since the previous summary.\nMonitoring remains active.`;
  }

  const counts = entries.reduce((acc: Record<string, number>, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {});

  const totals = Object.entries(counts)
    .map(([type, count]) => `• ${ACTIVITY_LABELS[type] || type}: ${count}`)
    .join('\n');

  const details = entries
    .map((entry) => {
      const when = toEasternTime(new Date(entry.timestamp));
      return `• ${when} — ${entry.summary}`;
    })
    .join('\n');

  return `${header}\n\nTotals:\n${totals}\n\nDetails:\n${details}`;
}

async function sendDailySummaryReport(): Promise<void> {
  const pending: ActivityEntry[] = activityTracker.getPendingActivities();
  const generatedAt = new Date();
  const message = formatSummaryReport(pending, generatedAt);

  if (!SUMMARY_REPORT_RECIPIENT) {
    log('warn', 'Summary recipient missing; skipping scheduled report', {});
    if (dripAlertManager) {
      await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.notice, 'Daily summary recipient missing', {
        hint: 'Set SUMMARY_REPORT_RECIPIENT to enable reports.',
      });
    }
    return;
  }

  const recipient = await resolveAlertUser(SUMMARY_REPORT_RECIPIENT);
  if (!recipient) {
    log('warn', 'Unable to resolve summary recipient', { recipient: SUMMARY_REPORT_RECIPIENT });
    if (dripAlertManager) {
      await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.warning, 'Daily summary recipient could not be resolved', {
        recipient: SUMMARY_REPORT_RECIPIENT,
      });
    }
    return;
  }

  try {
    await recipient.send(message);
    log('success', 'Daily summary delivered', {
      target: describeUser(recipient),
      eventsIncluded: pending.length,
    });
    activityTracker.drainActivities();
    activityTracker.markSummarySent(generatedAt);
  } catch (error) {
    log('error', 'Daily summary delivery failed', mergeLogError({
      recipient: SUMMARY_REPORT_RECIPIENT,
    }, error));
    if (dripAlertManager) {
      await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.warning, 'Daily summary delivery failed', {
        recipient: SUMMARY_REPORT_RECIPIENT,
        error: getErrorMessage(error),
      });
    }
  }
}

async function scheduleDailySummaryReports(): Promise<void> {
  if (summaryTimer) {
    clearTimeout(summaryTimer);
  }
  const delay = msUntilNextReport(SUMMARY_REPORT_HOUR, SUMMARY_REPORT_MINUTE);
  const safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : 0;
  const nextRun = new Date(Date.now() + safeDelay);
  const { toEasternString, toEasternLogFormat } = await import('../shared/datetime.js');
  log('info', 'Daily summary scheduled', {
    recipient: SUMMARY_REPORT_RECIPIENT || 'unset',
    nextRunEastern: toEasternLogFormat(nextRun),
    nextRunFormatted: toEasternString(nextRun),
  });
  summaryTimer = setTimeout(async () => {
    await sendDailySummaryReport();
    await scheduleDailySummaryReports();
  }, safeDelay);
}

async function notifyServiceRestart(): Promise<void> {
  if (!RESTART_DM_RECIPIENT) {
    return;
  }
  try {
    const { toEasternString } = await import('../shared/datetime.js');
    const user = await resolveAlertUser(RESTART_DM_RECIPIENT);
    if (!user) {
      log('warn', 'Restart DM recipient not found', { recipient: RESTART_DM_RECIPIENT });
      if (dripAlertManager) {
        await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.notice, 'Restart notification recipient missing', {
          recipient: RESTART_DM_RECIPIENT,
        });
      }
      return;
    }
    
    let message = `🛡️ **Security Monitor - System Status Report**\n`;
    message += `Restarted at ${toEasternString(new Date())}\n`;
    message += `Continuous monitoring is active across ${client.guilds.cache.size} guild(s).`;
    
    // Add state persistence summary if available
    if (botState) {
      const summary = buildRestartSummary(botState);
      message += `\n\n📊 **Operational Continuity**`;
      message += `\n• Restart #${summary.restartNumber}`;
      message += `\n• Time since last restart: ${summary.timeSinceLastRestart}`;
      message += `\n• Total uptime (all time): ${summary.totalUptime}`;
      message += `\n• Total sweeps: ${summary.totalSweeps}`;
      message += `\n• Total alerts: ${summary.totalAlerts}`;
      message += `\n• Permission changes detected: ${summary.totalPermissionChanges}`;
      message += `\n• Successful reverts: ${summary.successfulReverts}`;
      
      // Add timeout configuration status (from database)
      try {
        const timeoutEntry = await prisma.cacheEntry.findUnique({
          where: { key: TIMEOUT_CONFIG_KEY },
        });
        if (timeoutEntry) {
          const timeoutConfig = timeoutEntry.value as unknown as TimeoutConfig;
          const timeoutSeconds = (timeoutConfig.timeoutMs / 1000).toFixed(1);
          message += `\n\n⚙️ **Configuration**`;
          message += `\n• Member fetch timeout: ${timeoutSeconds}s (${timeoutConfig.adjustments || 0} auto-adjustments)`;
          if (timeoutConfig.adjustments > 0) {
            message += `\n• Last adjusted: ${timeoutConfig.lastAdjusted ? toEasternString(new Date(timeoutConfig.lastAdjusted)) : 'unknown'}`;
          }
        }
      } catch {
        // Skip timeout config if unavailable
      }
      
      // Add guild-level health summary
      if (botState.guilds && Object.keys(botState.guilds).length > 0) {
        const guildsList = Object.values(botState.guilds) as GuildState[];
        const activeGuilds = guildsList.filter((g) => g.monitoring);
        const recentSweeps = guildsList.filter((g) => {
          if (!g.lastSweep) return false;
          const lastSweepTime = new Date(g.lastSweep).getTime();
          const hourAgo = Date.now() - (60 * 60 * 1000);
          return lastSweepTime > hourAgo;
        });
        
        message += `\n\n🏰 **Guild Health**`;
        message += `\n• Active monitoring: ${activeGuilds.length}/${guildsList.length} guilds`;
        message += `\n• Swept in last hour: ${recentSweeps.length} guilds`;
        
        // List guilds with their sweep counts
        if (guildsList.length <= 5) {
          for (const guild of guildsList) {
            const sweepCount = guild.sweepCount || 0;
            const alertCount = guild.alertCount || 0;
            message += `\n  • ${guild.name}: ${sweepCount} sweeps, ${alertCount} alerts`;
          }
        }
      }
      
      // Add recent activity timeline
      const recentActivity = getRecentActivitySummary(botState, 5);
      if (recentActivity && recentActivity !== 'No recent activity before restart') {
        message += `\n\n📜 **Recent Activity Before Restart**\n${recentActivity}`;
      }
      
      // Add error summary if any errors recorded
      if (botState.timeline && Array.isArray(botState.timeline)) {
        const recentErrors = (botState.timeline as TimelineEntryWithDetails[])
          .filter((e) => e.type === 'error')
          .slice(0, 3);
        
        if (recentErrors.length > 0) {
          message += `\n\n⚠️ **Recent Errors** (last ${recentErrors.length})`;
          for (const error of recentErrors) {
            const timeAgo = Math.round((Date.now() - new Date(error.timestamp || 0).getTime()) / 1000 / 60);
            message += `\n• ${timeAgo}m ago: ${error.details?.error || 'Unknown error'}`;
          }
        }
      }
    }
    
    // Wait for database connections to complete before collecting stats
    try {
      const prismaModule = await import('../shared/prisma.js');
      if (typeof prismaModule.ensurePrisma === 'function') {
        await prismaModule.ensurePrisma();
        log('info', 'Database connections initialized for restart DM stats');
      }
    } catch (error) {
      log('warn', 'Database initialization incomplete for restart DM', {
        error: getErrorMessage(error),
      });
    }
    
    // Wait for complete database stats (retry up to 30 seconds)
    // Check for MASTER, LOCAL-R, and LOCAL-W readiness (not just checking for 'loading')
    let stats = null;
    const maxWaitMs = 30_000;
    const retryDelayMs = 1_000;
    const startWaitTime = Date.now();
    
    try {
      const loggerModule = await import('../utils/logger.js');
      if (typeof loggerModule.getFormattedStats === 'function') {
        while (Date.now() - startWaitTime < maxWaitMs) {
          stats = await loggerModule.getFormattedStats();
          
          // Check if any database is still initializing
          // Look for "initializing" or "loading" in any database line
          const hasInitializingStatus = stats.includes('initializing') || stats.includes('loading');
          
          // Check for unavailable metrics that should be available
          const hasUnavailableMetrics = stats.includes('<unavailable: initializing>') 
            || stats.includes('<unavailable: not-queried-yet>');
          
          if (!hasInitializingStatus && !hasUnavailableMetrics) {
            log('info', 'Database stats ready for restart DM', {
              waitTimeMs: Date.now() - startWaitTime,
            });
            break;
          }
          
          log('debug', 'Waiting for database stats to complete initialization', {
            elapsedMs: Date.now() - startWaitTime,
            remainingMs: maxWaitMs - (Date.now() - startWaitTime),
            hasInitializing: hasInitializingStatus,
            hasUnavailable: hasUnavailableMetrics,
          });
          
          await wait(retryDelayMs);
        }
        
        // Check if we timed out
        if (stats && (stats.includes('initializing') || stats.includes('loading') || stats.includes('<unavailable: initializing>'))) {
          log('warn', 'Database stats still initializing after timeout, sending DM anyway', {
            waitTimeMs: Date.now() - startWaitTime,
            timeoutMs: maxWaitMs,
          });
        }
        
        if (stats) {
          message += `\n\n${stats}`;
          
          // Note: Legacy database status tracking removed - now using state/types.ts DatabaseStatus
          // The SecurityBotState.runtime.databaseStatus field is the canonical location
        }
      }
    } catch (error) {
      log('warn', 'Failed to append stats to restart DM', {
        error: getErrorMessage(error),
      });
    }
    
    await user.send(message);
    log('info', 'Restart notification delivered', { target: describeUser(user) });
  } catch (error) {
    log('error', 'Restart notification failed', mergeLogError({
      recipient: RESTART_DM_RECIPIENT,
    }, error));
    if (dripAlertManager) {
      await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.warning, 'Restart notification delivery failed', {
        recipient: RESTART_DM_RECIPIENT,
        error: getErrorMessage(error),
      });
    }
  }
}

function updateMonitoringPhase() {
  const count = client.guilds.cache.size;
  const label = `Monitoring ${count} guild${count === 1 ? '' : 's'}`;
  cliStatus.setPhase(label);
  cliStatus.setGuildCount(count);
  updateSecurityCliSection({ status: label });
}

// ── Role Policy Registry (ID-keyed) ─────────────────────────────────────────
// Discord role IDs are the source of truth. Names are display-only labels
// preserved for logging/audit readability. Never look up policy by name.
interface RolePolicy {
  /** Display name — for logging and auditing only */
  name: string;
  /** Permission policy: 'ALL' for full authority, or explicit list */
  permissions: PermissionsString[] | 'ALL';
}

const ROLE_POLICY_REGISTRY: Record<string, RolePolicy> = {
  // ── Admin-tier: full authority, never reduced by the security bot ──
  [ADMIN_ROLE_ID]:        { name: 'Admin',        permissions: 'ALL' },
  [SERVER_ADMIN_ROLE_ID]: { name: 'Server Admin',  permissions: 'ALL' },
  [DRIP_ROLE_ID]:         { name: 'Drip',          permissions: 'ALL' },
  // ── Elevated roles ──
  [SUPER_ADMIN_ROLE_ID]:  { name: 'Super Admin',   permissions: [
    'KickMembers','BanMembers','ManageMessages','ModerateMembers','ManageNicknames','ViewAuditLog','CreateEvents',
    'UseApplicationCommands','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages','EmbedLinks',
    'AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','DeafenMembers','MoveMembers',
    'MuteMembers','UseSoundboard','UseExternalSounds','RequestToSpeak',
  ]},
  [GYM_LEADER_ROLE_ID]:   { name: 'Gym Leader',    permissions: [
    'ManageMessages','ModerateMembers','ManageThreads','CreatePublicThreads','CreatePrivateThreads','SendMessages',
    'EmbedLinks','AttachFiles','ReadMessageHistory','MentionEveryone','UseExternalEmojis','Connect','Speak','UseVAD',
    'SendPolls','UseEmbeddedActivities'
  ]},
  // ── Member-tier: least-privilege baseline ──
  [TRAINER_ROLE_ID]:      { name: 'Trainer',        permissions: [
    'ViewChannel','SendMessages','ReadMessageHistory','AddReactions','UseExternalEmojis','EmbedLinks','AttachFiles'
  ]},
  // ── Integration roles ──
  [ZAPIER_ROLE_ID]:       { name: 'Zapier',         permissions: ['SendMessages','EmbedLinks','AttachFiles','ManageWebhooks','ViewChannel'] },
  [FRESHTOK_ROLE_ID]:     { name: 'FreshTok',       permissions: ['SendMessages','EmbedLinks','AttachFiles','ManageWebhooks','ViewChannel'] },
  [POKETWO_ROLE_ID]:      { name: 'Pokétwo',        permissions: ['SendMessages','ManageMessages','AddReactions','EmbedLinks','AttachFiles','ReadMessageHistory','UseExternalEmojis'] },
  // ── Inactive/empty roles ──
  [DND_CANDIDATE_ROLE_ID]: { name: 'D&D Candidate', permissions: [] },
};
// ─────────────────────────────────────────────────────────────────────────────
// Drip Role Channel Persistence
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Channel-level permissions the Drip role must be ALLOWED on every guild channel.
 * Applied on channelCreate, channelUpdate (tamper detection), boot, and periodic sweeps.
 * Individual channels can be excluded via DRIP_ROLE_EXCLUDE_CHANNEL_IDS env var.
 */
const DRIP_CHANNEL_OVERWRITE_PERMS: PermissionsString[] = [
  'ViewChannel', 'ManageChannels', 'ManageRoles', 'ManageWebhooks',
  'CreateInstantInvite', 'SendMessages', 'SendMessagesInThreads',
  'CreatePublicThreads', 'CreatePrivateThreads', 'ManageMessages',
  'ManageThreads', 'EmbedLinks', 'AttachFiles', 'AddReactions',
  'UseExternalEmojis', 'UseExternalStickers', 'MentionEveryone',
  'ReadMessageHistory', 'UseApplicationCommands', 'SendPolls',
  'Connect', 'Speak', 'Stream', 'UseEmbeddedActivities',
  'UseVAD', 'PrioritySpeaker', 'DeafenMembers', 'MoveMembers',
  'MuteMembers', 'UseSoundboard', 'UseExternalSounds', 'RequestToSpeak',
];
/** Pre-computed bitfield for fast overwrite comparison. */
const DRIP_REQUIRED_BITS = new PermissionsBitField(DRIP_CHANNEL_OVERWRITE_PERMS);

// ----- Snapshot helpers -----
function snapshotKey(guildId: string, roleId: string): string {
  return `role-perm-snapshot:${guildId}:${roleId}`;
}

function getSnapshot(role: Role): PermissionsString[] | 'ALL' | null {
  const key = snapshotKey(role.guild.id, role.id);
  return cache.readCache(key);
}

function setSnapshot(role: Role, permissionsArrayOrAll: PermissionsString[] | 'ALL'): void {
  const key = snapshotKey(role.guild.id, role.id);
  cache.writeCache(key, permissionsArrayOrAll);
}

interface DesiredPermissionsResult {
  policy: string;
  expected: PermissionsString[] | string | 'ALL' | null;
  seeded?: boolean;
}

function desiredPermissionsForRole(role: Role, currentPerms: PermissionsString[]): DesiredPermissionsResult {
  // ID-first: look up policy by role.id, not role.name
  const policy = ROLE_POLICY_REGISTRY[role.id];
  const standard = policy?.permissions;

  if (ROLE_PERMISSION_POLICY === 'snapshot') {
    const snap = getSnapshot(role);
    if (snap) return { policy: 'snapshot', expected: snap };
    if (ROLE_PERMISSION_SNAPSHOT_UPDATE) {
      // Seed snapshot from current on first sight
      const seed = Array.isArray(currentPerms) ? currentPerms : role.permissions.toArray();
      setSnapshot(role, seed);
      return { policy: 'snapshot', expected: seed, seeded: true };
    }
    // Fallbacks when snapshot is absent and auto-seed is disabled
    if (standard) return { policy: 'standard', expected: standard };
    if (STANDARD_ENFORCE_ALL && !STANDARD_EXEMPT_ROLE_IDS.has(role.id)) {
      if (STANDARD_ALL_PERMS_ROLE_IDS.has(role.id)) return { policy: 'all', expected: 'ALL' };
      return { policy: 'standard', expected: UNLISTED_PERMISSIONS as PermissionsString[] };
    }
    return { policy: 'unmanaged', expected: null };
  }

  if (!standard) {
    if (STANDARD_ENFORCE_ALL && !STANDARD_EXEMPT_ROLE_IDS.has(role.id)) {
      if (STANDARD_ALL_PERMS_ROLE_IDS.has(role.id)) return { policy: 'all', expected: 'ALL' };
      return { policy: 'standard', expected: UNLISTED_PERMISSIONS as PermissionsString[] };
    }
    return { policy: 'unmanaged', expected: null };
  }
  if (standard === 'ALL') return { policy: 'all', expected: 'ALL' };
  return { policy: 'standard', expected: standard };
}

function analyzeRolePermissions(role: Role): RoleAnalysis {
  const current = role.permissions.toArray();
  const desired = desiredPermissionsForRole(role, current);

  if (!desired.expected) {
    return { policy: 'unmanaged', expected: null, current, missing: [], extra: [] };
  }
  if (desired.expected === 'ALL') {
    return { policy: 'all', expected: 'all', current, missing: [], extra: [] };
  }

  const expected = Array.isArray(desired.expected) ? desired.expected : [];
  const missing = expected.filter((p) => !current.includes(p as PermissionsString));
  const extra = current.filter((p) => !expected.includes(p));
  return { policy: desired.policy, expected, current, missing, extra };
}

/** Check if member is missing the Trainer role specifically (not just "roleless").
 *  This catches members who have other roles (e.g. Gym Leader) but lack Trainer. */
function isMissingTrainerRole(member: GuildMember | PartialGuildMember): boolean {
  return !member.roles.cache.has(TRAINER_ROLE_ID);
}

function collectAssignableRoles(member: GuildMember | PartialGuildMember | null): Collection<string, Role> | null {
  if (!member || !member.roles?.cache || !member.guild?.roles?.everyone) {
    return null;
  }
  const everyoneId = member.guild.roles.everyone.id;
  return member.roles.cache.filter((role) => role && role.id !== everyoneId);
}

function listRoleSummaries(collection: Collection<string, Role> | null): string[] {
  if (!collection) {
    return [];
  }
  return Array.from(collection.values()).map((role) => describeRole(role));
}

function canViewAuditLogs(guild: Guild | null): boolean {
  try {
    return Boolean(guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog));
  } catch (error) {
    log('warn', 'Audit log permission check failed', mergeLogError({ guild: guild ? describeGuild(guild) : 'unknown' }, error));
    return false;
  }
}

interface LookupRoleAuditOptions {
  addedRoleIds?: string[];
  removedRoleIds?: string[];
}

async function lookupRoleAuditEntry(guild: Guild | null, memberId: string | null, { addedRoleIds = [], removedRoleIds = [] }: LookupRoleAuditOptions = {}): Promise<GuildAuditLogsEntry | null> {
  if (!guild || !memberId) {
    return null;
  }
  if (!canViewAuditLogs(guild)) {
    return null;
  }
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 10 });
    if (!logs || !logs.entries) {
      return null;
    }
    for (const [, entry] of logs.entries) {
      if (!entry || !entry.target || entry.target.id !== memberId) {
        continue;
      }
      const addedChange = Array.isArray(entry.changes)
        ? entry.changes.find((change) => change && change.key === '$add')
        : null;
      const removedChange = Array.isArray(entry.changes)
        ? entry.changes.find((change) => change && change.key === '$remove')
        : null;

      const addedIds = extractAuditRoleIds(addedChange);
      const removedIds = extractAuditRoleIds(removedChange);

      const addMatch = addedRoleIds.length === 0 || addedRoleIds.some((id) => addedIds.includes(id));
      const removeMatch = removedRoleIds.length === 0 || removedRoleIds.some((id) => removedIds.includes(id));

      if (addMatch && removeMatch) {
        return entry;
      }
    }
  } catch (error) {
    log('warn', 'Audit log lookup for role change failed', mergeLogError({
      guild: describeGuild(guild),
      memberId,
      addedRoleIds,
      removedRoleIds,
    }, error));
  }
  return null;
}

async function lookupRolePermissionAuditEntry(guild: Guild | null, roleId: string | null): Promise<GuildAuditLogsEntry | null> {
  if (!guild || !roleId) {
    return null;
  }
  if (!canViewAuditLogs(guild)) {
    return null;
  }

  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 10 });
    if (!logs || !logs.entries) {
      return null;
    }
    for (const [, entry] of logs.entries) {
      if (entry?.target?.id === roleId) {
        return entry;
      }
    }
  } catch (error) {
    log('warn', 'Audit log lookup for role permission change failed', mergeLogError({
      guild: describeGuild(guild),
      roleId,
    }, error));
  }
  return null;
}

async function maybeAlertRoleAssignments(oldMember: GuildMember | PartialGuildMember | null, newMember: GuildMember | PartialGuildMember | null): Promise<RoleChangeResult> {
  if (!newMember || !newMember.guild) {
    return { changed: false };
  }

  if (memberRoleReversionsInProgress.has(newMember.id)) {
    return { changed: false, skipped: true };
  }

  const guild = newMember.guild;
  const newRoles = collectAssignableRoles(newMember);
  const oldRoles = collectAssignableRoles(oldMember);

  if (!newRoles && !oldRoles) {
    return { changed: false };
  }

  const addedRoles: Role[] = [];
  const removedRoles: Role[] = [];

  if (newRoles) {
    newRoles.forEach((role) => {
      if (!role) {
        return;
      }
      if (!oldRoles || !oldRoles.has(role.id)) {
        addedRoles.push(role);
      }
    });
  }

  if (oldRoles) {
    oldRoles.forEach((role) => {
      if (!role) {
        return;
      }
      if (!newRoles || !newRoles.has(role.id)) {
        removedRoles.push(role);
      }
    });
  }

  if (addedRoles.length === 0 && removedRoles.length === 0) {
    return { changed: false };
  }

  const trainerRoleOnlyAddition = addedRoles.length === 1
    && addedRoles[0]?.id === TRAINER_ROLE_ID
    && removedRoles.length === 0;
  if (trainerRoleOnlyAddition && isTrainerAssignmentInFlight(guild.id, newMember.id)) {
    return { changed: false, skipped: true };
  }

  const auditEntry = await lookupRoleAuditEntry(guild, newMember.id, {
    addedRoleIds: addedRoles.map((role) => role.id),
    removedRoleIds: removedRoles.map((role) => role.id),
  });

  const executor = auditEntry?.executor ?? null;
  // evaluateExecutorAuthorization accepts User | GuildMember | null
  const authorization = await evaluateExecutorAuthorization(guild, executor as User | null);
  const executorSummary = executor ? describeUser(executor) : 'unknown user';
  const previousRoles = listRoleSummaries(oldRoles);
  const baseMeta = {
    guild: describeGuild(guild),
    member: describeMember(newMember),
    memberId: newMember.id,
    addedRoles: addedRoles.map((role) => describeRole(role)),
    removedRoles: removedRoles.map((role) => describeRole(role)),
    previousRoles,
    assignedBy: executorSummary,
    assignedById: executor?.id ?? null,
    auditId: auditEntry?.id ?? null,
    auditLoggedAt: auditEntry?.createdTimestamp ? new Date(auditEntry.createdTimestamp).toISOString() : null,
    auditReason: auditEntry?.reason ?? null,
    authorization: authorization.reason,
  };

  if (!authorization.authorized) {
    const revertOutcome = await revertMemberRoles(newMember, {
      rolesToRemove: addedRoles,
      rolesToAdd: removedRoles,
      reason: `Security bot rollback: unauthorized change by ${executorSummary} (${authorization.reason})`,
    });

    const title = `🚨 SECURITY: Unauthorized role change reverted`;
    const meta: Record<string, unknown> = {
      ...baseMeta,
      action: 'reverted',
      revertStatus: revertOutcome.success ? 'success' : 'failed',
      alertType: 'unauthorized-reversion',
    };

    if (!revertOutcome.success && Array.isArray(revertOutcome.errors) && revertOutcome.errors.length) {
      meta.revertErrors = revertOutcome.errors;
    }
    if (Array.isArray(revertOutcome.added) && revertOutcome.added.length) {
      meta.reappliedRoleIds = revertOutcome.added;
    }
    if (Array.isArray(revertOutcome.removed) && revertOutcome.removed.length) {
      meta.removedRoleIds = revertOutcome.removed;
    }

    if (dripAlertManager) {
      await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.security, title, meta);
    }
    activityTracker.recordActivity('security-alert', title, meta);
    updateSecurityCliSection({
      lastAlertSentAt: new Date(),
      lastAlertMessage: title,
    });

    // DB audit trail: record each unauthorized role change
    for (const role of [...addedRoles, ...removedRoles]) {
      const changeType = addedRoles.includes(role) ? RoleChangeType.ADDITION : RoleChangeType.REMOVAL;
      roleAuditService.recordRoleChange({
        memberId: newMember.id,
        memberTag: newMember.user.tag,
        guildId: guild.id,
        guildName: guild.name,
        changeType,
        roleId: role.id,
        roleName: role.name,
        rolePosition: role.position,
        executorId: executor?.id ?? 'unknown',
        executorTag: executor ? describeUser(executor) : 'unknown',
        authorized: false,
        origin: 'unauthorized-role-change',
        metadata: { revertStatus: revertOutcome.success ? 'success' : 'failed', auditId: auditEntry?.id ?? null },
      }).catch((err) =>
        report('Unauthorized Role Change — RoleChangeAudit Write Error', mergeReportError({
          guild: describeGuild(guild),
          userId: newMember.id,
          roleId: role.id,
        }, err), 'error'),
      );
    }
    securityEventService.recordEvent({
      eventType: 'unauthorized-role-change',
      severity: SecuritySeverity.HIGH,
      guildId: guild.id,
      guildName: guild.name,
      memberId: newMember.id,
      memberTag: newMember.user.tag,
      executorId: executor?.id ?? 'unknown',
      executorTag: executor ? describeUser(executor) : 'unknown',
      origin: 'role-assignment-monitor',
      metadata: {
        addedRoles: addedRoles.map((r) => r.id),
        removedRoles: removedRoles.map((r) => r.id),
        revertStatus: revertOutcome.success ? 'success' : 'failed',
        auditId: auditEntry?.id ?? null,
      },
    }).catch((err) =>
      report('Unauthorized Role Change — SecurityEvent Write Error', mergeReportError({
        guild: describeGuild(guild),
        userId: newMember.id,
      }, err), 'error'),
    );

    report('Unauthorized Role Change Reverted', meta, 'warn');
    return { changed: true, unauthorized: true, revertStatus: meta.revertStatus as string };
  }

  // Authorized role change detected
  const assignedRolesSummary = addedRoles.map((role) => role.name).join(', ') || 'role change';
  const removedRolesSummary = removedRoles.map((role) => role.name).join(', ') || 'none';
  
  // Check if this is a new member join (member created recently and receiving first role)
  const memberAge = Date.now() - (newMember.joinedTimestamp || 0);
  const isNewMember = memberAge < 60_000; // Joined within last minute
  const isFirstRole = (oldRoles?.size ?? 0) === 0 && addedRoles.length > 0;
  
  let title: string;
  let severity: typeof DRIP_ALERT_SEVERITY[keyof typeof DRIP_ALERT_SEVERITY];
  let alertType: string;
  let summary: string;
  
  if (isNewMember && isFirstRole) {
    // New member joining and receiving standard permissions
    title = `👋 New member joined: ${newMember.user.tag}`;
    severity = DRIP_ALERT_SEVERITY.notice;
    alertType = 'new-member-join';
    summary = `New member ${describeMember(newMember)} joined and received ${assignedRolesSummary}`;
  } else if (removedRoles.length > 0) {
    // Roles were modified (added and/or removed)
    title = `🔄 Role modification for ${newMember.user.tag}`;
    severity = DRIP_ALERT_SEVERITY.notice;
    alertType = 'authorized-role-modification';
    summary = `${describeMember(newMember)} roles modified by ${executorSummary}: +${assignedRolesSummary}, -${removedRolesSummary}`;
  } else {
    // Existing member received additional role(s)
    title = `➕ Role assigned to ${newMember.user.tag}`;
    severity = DRIP_ALERT_SEVERITY.notice;
    alertType = 'authorized-role-addition';
    summary = `${describeMember(newMember)} received ${assignedRolesSummary} from ${executorSummary}`;
  }
  
  const meta = {
    ...baseMeta,
    action: 'recorded',
    alertType,
    memberAge: isNewMember ? `${Math.floor(memberAge / 1000)}s` : 'existing',
    isFirstRole,
    userTag: newMember.user.tag,
    username: newMember.user.username,
    userCreatedAt: newMember.user.createdAt?.toISOString() || null,
    memberJoinedAt: newMember.joinedAt?.toISOString() || null,
  };

  if (dripAlertManager) {
    await dripAlertManager.recordAlert(severity, title, meta);
  }
  activityTracker.recordActivity('security-alert', summary, meta);
  updateSecurityCliSection({
    lastAlertSentAt: new Date(),
    lastAlertMessage: summary,
  });

  // DB audit trail: record each authorized role change
  for (const role of [...addedRoles, ...removedRoles]) {
    const changeType = addedRoles.includes(role) ? RoleChangeType.ADDITION : RoleChangeType.REMOVAL;
    roleAuditService.recordRoleChange({
      memberId: newMember.id,
      memberTag: newMember.user.tag,
      guildId: guild.id,
      guildName: guild.name,
      changeType,
      roleId: role.id,
      roleName: role.name,
      rolePosition: role.position,
      executorId: executor?.id ?? 'unknown',
      executorTag: executor ? describeUser(executor) : 'unknown',
      authorized: true,
      origin: 'authorized-role-change',
      metadata: { alertType, auditId: auditEntry?.id ?? null },
    }).catch((err) =>
      report('Authorized Role Change — RoleChangeAudit Write Error', mergeReportError({
        guild: describeGuild(guild),
        userId: newMember.id,
        roleId: role.id,
      }, err), 'error'),
    );
  }
  securityEventService.recordEvent({
    eventType: 'authorized-role-change',
    severity: SecuritySeverity.INFO,
    guildId: guild.id,
    guildName: guild.name,
    memberId: newMember.id,
    memberTag: newMember.user.tag,
    executorId: executor?.id ?? 'unknown',
    executorTag: executor ? describeUser(executor) : 'unknown',
    origin: 'role-assignment-monitor',
    metadata: {
      addedRoles: addedRoles.map((r) => r.id),
      removedRoles: removedRoles.map((r) => r.id),
      alertType,
      auditId: auditEntry?.id ?? null,
    },
  }).catch((err) =>
    report('Authorized Role Change — SecurityEvent Write Error', mergeReportError({
      guild: describeGuild(guild),
      userId: newMember.id,
    }, err), 'error'),
  );

  report('Role Assignment Alert', {
    guild: meta.guild,
    member: meta.member,
    addedRoles: meta.addedRoles.join(', '),
    removedRoles: meta.removedRoles.join(', ') || 'none',
    assignedBy: executorSummary,
    alertType,
  }, 'info');

  return { changed: true, unauthorized: false };
}

function findRole(guild: Guild): Role | null {
  // ID-first: TRAINER_ROLE_ID always has a production default.
  // Name-based lookup removed — IDs are the sole authority.
  return guild.roles.cache.get(TRAINER_ROLE_ID) || null;
}

async function reportGuildRoles(guild: Guild): Promise<void> {
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
    report('Role Enumeration Error', mergeReportError({
      guild: guildSummary,
    }, error), 'error');
  }
}

async function validateGuildRoles(guild: Guild): Promise<void> {
  const guildSummary = describeGuild(guild);
  log('info', 'Validating guild role permissions', { guild: guildSummary });

  let roles: Collection<string, Role>;
  try {
    roles = await guild.roles.fetch();
  } catch (error) {
    log('error', 'Unable to fetch guild roles for validation', mergeLogError({
      guild: guildSummary,
    }, error));
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
      report('Role Permissions Match', {
        guild: guildSummary,
        role: describeRole(role),
        policy: 'all',
        note: 'Role configured for full permissions coverage'
      }, 'success');
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
async function fixGuildRoles(guild: Guild): Promise<void> {
  const guildSummary = describeGuild(guild);

  let roles: Collection<string, Role>;
  try {
    roles = await guild.roles.fetch();
  } catch (error) {
    log('error', 'Unable to fetch guild roles for remediation', mergeLogError({
      guild: guildSummary,
    }, error));
    return;
  }

  for (const [, role] of roles) {
    // Verify role still exists and is not @everyone
    if (!role || role.id === guild.roles.everyone?.id) {
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
      log('success', 'Role is set to full bot permissions', {
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

    // Verify bot can manage this role (hierarchy + permissions check)
    if (!canAssignRole(guild, role)) {
      log('warn', 'Cannot modify role: bot lacks ManageRoles permission or role is above bot in hierarchy', {
        guild: guildSummary,
        role: describeRole(role),
        missing: analysis.missing.join(', ') || 'none',
        extra: analysis.extra.join(', ') || 'none'
      });
      continue;
    }

    // Verify role is manageable (Discord.js built-in check)
    if (!role.editable) {
      log('warn', 'Cannot modify role: role is not editable by bot', {
        guild: guildSummary,
        role: describeRole(role),
        missing: analysis.missing.join(', ') || 'none',
        extra: analysis.extra.join(', ') || 'none'
      });
      continue;
    }

    // Ensure expected permissions are valid array
    const targetPermissions = Array.isArray(analysis.expected) ? analysis.expected : [];

    try {
      await role.setPermissions(targetPermissions);
      report('Role Permissions Updated', {
        guild: guildSummary,
        role: describeRole(role),
        missingPermissions: analysis.missing.length ? analysis.missing.join(', ') : 'none',
        extraPermissions: analysis.extra.length ? analysis.extra.join(', ') : 'none'
      }, 'success');
      activityTracker.recordActivity('role-permissions-healed', `Healed ${describeRole(role)} in ${guildSummary}`, {
        guild: guildSummary,
        role: describeRole(role),
        policy: analysis.policy,
        origin: 'periodic/startup',
      });
      await sendSecurityAlert('Role permissions healed (periodic/startup)', {
        guild: guildSummary,
        role: describeRole(role),
        policy: analysis.policy,
        missing: analysis.missing,
        extra: analysis.extra
      });
    } catch (error) {
      report('Role Permissions Update Error', mergeReportError({
        guild: guildSummary,
        role: describeRole(role),
      }, error), 'error');
    }
  }
}
// Enforce a single role's permissions if it's managed and remediation is enabled
async function enforceRolePermissions(role: Role | null): Promise<void> {
  // Verify role still exists
  if (!role || !role.guild) {
    log('warn', 'Cannot enforce permissions: role or guild is null', {
      roleId: role?.id || 'unknown',
      roleName: role?.name || 'unknown'
    });
    return;
  }

  const guildSummary = describeGuild(role.guild);
  
  // Skip @everyone role
  if (role.id === role.guild.roles.everyone?.id) {
    return;
  }

  const analysis = analyzeRolePermissions(role);
  if (analysis.policy === 'unmanaged' || analysis.policy === 'all') return;
  if (analysis.missing.length === 0 && analysis.extra.length === 0) return;
  
  if (!ROLE_PERMISSIONS_REMEDIATE) {
    report('Role Drift Detected (Remediation Disabled)', {
      guild: guildSummary,
      role: describeRole(role),
      missing: analysis.missing.join(', ') || 'none',
      extra: analysis.extra.join(', ') || 'none'
    }, 'warn');
    await sendSecurityAlert('Role drift detected (remediation disabled)', {
      guild: guildSummary,
      role: describeRole(role),
      policy: analysis.policy,
      missing: analysis.missing,
      extra: analysis.extra
    });
    return;
  }

  // Verify bot can manage this role (hierarchy + permissions check)
  if (!canAssignRole(role.guild, role)) {
    log('warn', 'Cannot enforce permissions: bot lacks ManageRoles permission or role is above bot in hierarchy', {
      guild: guildSummary,
      role: describeRole(role),
      missing: analysis.missing.join(', ') || 'none',
      extra: analysis.extra.join(', ') || 'none'
    });
    await sendSecurityAlert('Cannot enforce role permissions (permission/hierarchy issue)', {
      guild: guildSummary,
      role: describeRole(role),
      policy: analysis.policy,
      missing: analysis.missing,
      extra: analysis.extra,
      reason: 'Bot lacks ManageRoles or role is above bot in hierarchy'
    });
    return;
  }

  // Verify role is manageable (Discord.js built-in check)
  if (!role.editable) {
    log('warn', 'Cannot enforce permissions: role is not editable by bot', {
      guild: guildSummary,
      role: describeRole(role),
      missing: analysis.missing.join(', ') || 'none',
      extra: analysis.extra.join(', ') || 'none'
    });
    await sendSecurityAlert('Cannot enforce role permissions (role not editable)', {
      guild: guildSummary,
      role: describeRole(role),
      policy: analysis.policy,
      missing: analysis.missing,
      extra: analysis.extra,
      reason: 'Role is not editable by bot'
    });
    return;
  }

  // Ensure expected permissions are valid array
  const targetPermissions = Array.isArray(analysis.expected) ? analysis.expected : [];

  try {
    await role.setPermissions(targetPermissions);
    report('Role Permissions Healed', {
      guild: guildSummary,
      role: describeRole(role)
    }, 'success');
    activityTracker.recordActivity('role-permissions-healed', `Healed ${describeRole(role)} in ${guildSummary}`, {
      guild: guildSummary,
      role: describeRole(role),
      policy: analysis.policy,
      origin: 'event',
    });
    await sendSecurityAlert('Role permissions healed (event-based)', {
      guild: guildSummary,
      role: describeRole(role),
      policy: analysis.policy,
      missing: analysis.missing,
      extra: analysis.extra
    });
  } catch (error) {
    report('Role Permission Heal Error', mergeReportError({
      guild: guildSummary,
      role: describeRole(role),
    }, error), 'error');
  }
}
// ─────────────────────────────────────────────────────────────────────────────
// Drip Role Channel Overwrite Enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if actorId is allowed to intentionally weaken/remove the Drip
 * role's channel overwrite. Unauthorized changes are always restored.
 *
 * Authorized: the bot itself · DRIPTVDD (DRIP_USER_ID) · the guild owner.
 */
function isAuthorizedDripActor(actorId: string | null | undefined, guild: Guild): boolean {
  if (!actorId) return false;
  return (
    actorId === client.user?.id ||
    actorId === DRIP_USER_ID ||
    actorId === guild.ownerId
  );
}

function canUseDirectStatusCommand(userId: string): boolean {
  if (userId === DRIP_USER_ID) {
    return true;
  }

  for (const guild of client.guilds.cache.values()) {
    if (guild.ownerId === userId) {
      return true;
    }
  }

  return false;
}

/** Build the context object for the DM console module. */
function buildConsoleContext(): ConsoleContext {
  return {
    client,
    prisma,
    ensurePrisma,
    securityCliState,
    continuousSweepState,
    pendingOpsErrorQueue,
    botState: botState as ConsoleContext['botState'],
    dripRoleId: DRIP_ROLE_ID,
    dripUserId: DRIP_USER_ID,
    enableContinuousSweep: ENABLE_CONTINUOUS_SWEEP,
    startContinuousSweepLoop,
    sweepGuild,
    enforceDripRoleAllChannels,
    describeUser,
    syncModeratorChannelRoles,
    log: log as ConsoleContext['log'],
    report,
    engineCache,
    cache,
  };
}

function getDripChannelOverwriteEditability(channel: GuildChannel): {
  ok: boolean;
  missing: PermissionsString[];
} {
  const me = channel.guild.members.me;
  if (!me) {
    return { ok: false, missing: ['ViewChannel', 'ManageChannels'] };
  }

  const effectivePermissions = channel.permissionsFor(me);
  const required: PermissionsString[] = ['ViewChannel', 'ManageChannels'];
  const missing = required.filter((permission) => !effectivePermissions?.has(permission));

  return {
    ok: missing.length === 0,
    missing,
  };
}

/**
 * Ensures the Drip role has the required allow-overwrite on a single channel.
 * No-ops if the overwrite is already complete and nothing is denied.
 * Skips threads (they inherit from their parent) and excluded channels.
 *
 * @returns true if an overwrite was applied or updated.
 */
async function ensureDripRoleOnChannel(channel: GuildChannel, origin: string): Promise<boolean> {
  if (channel.isThread()) return false;
  if (DRIP_ROLE_EXCLUDE_CHANNEL_IDS.has(channel.id)) return false;
  if (!('permissionOverwrites' in channel)) return false;

  const editability = getDripChannelOverwriteEditability(channel);
  if (!editability.ok) {
    report('Drip Channel Overwrite Skipped', {
      channel: channel.id,
      channelName: channel.name,
      guild: describeGuild(channel.guild),
      origin,
      missingPermissions: editability.missing,
      hint: 'Grant the bot ViewChannel and ManageChannels on this channel or its parent category.',
    }, 'warn');
    return false;
  }

  const existing = channel.permissionOverwrites.cache.get(DRIP_ROLE_ID);
  if (existing) {
    const alreadyAllowed = existing.allow.has(DRIP_REQUIRED_BITS);
    const nothingDenied  = !existing.deny.any(DRIP_REQUIRED_BITS);
    if (alreadyAllowed && nothingDenied) return false; // already correct
  }

  try {
    await channel.permissionOverwrites.edit(
      DRIP_ROLE_ID,
      Object.fromEntries(DRIP_CHANNEL_OVERWRITE_PERMS.map((p) => [p, true])) as Record<PermissionsString, boolean>,
      { reason: `Drip role channel persistence — ${origin}` },
    );
    report('Drip Channel Overwrite Applied', {
      channel: channel.id,
      channelName: channel.name,
      guild: describeGuild(channel.guild),
      origin,
      action: existing ? 'restored' : 'created',
    }, existing ? 'warn' : 'success');
    activityTracker.recordActivity(
      'drip-channel-enforcement',
      `Drip overwrite ${existing ? 'restored' : 'applied'} on #${channel.name}`,
      { channelId: channel.id, channelName: channel.name, guild: describeGuild(channel.guild), origin, action: existing ? 'restored' : 'applied' },
    );
    securityEventService.recordEvent({
      eventType: 'drip-channel-overwrite',
      severity: existing ? SecuritySeverity.MEDIUM : SecuritySeverity.INFO,
      guildId: channel.guild.id,
      guildName: channel.guild.name,
      executorId: client.user?.id ?? 'SYSTEM',
      executorTag: client.user?.tag ?? 'SYSTEM#0000',
      origin: 'drip-channel-sync',
      metadata: { channelId: channel.id, channelName: channel.name, trigger: origin, action: existing ? 'restored' : 'applied' },
    }).catch((err) =>
      report('Drip Channel Overwrite — SecurityEvent Write Error', mergeReportError({ channelId: channel.id }, err), 'error'),
    );
    return true;
  } catch (error) {
    report('Drip Channel Overwrite Error', mergeReportError({
      channel: channel.id,
      channelName: channel.name,
      guild: describeGuild(channel.guild),
      origin,
    }, error), 'error');
    return false;
  }
}

/**
 * Enforces the Drip role overwrite on ALL non-thread channels in the guild.
 * Processes in batches of 8 with 150 ms separation to respect rate limits.
 */
async function enforceDripRoleAllChannels(guild: Guild, origin: string): Promise<void> {
  const guildSummary = describeGuild(guild);
  let applied = 0;
  let errored = 0;

  try {
    await guild.channels.fetch(); // populate cache via REST
    const channels = [...guild.channels.cache.values()].filter(
      (ch) => !ch.isThread() && !DRIP_ROLE_EXCLUDE_CHANNEL_IDS.has(ch.id),
    );

    const BATCH_SIZE = 8;
    for (let i = 0; i < channels.length; i += BATCH_SIZE) {
      const batch = channels.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((ch) => ensureDripRoleOnChannel(ch as GuildChannel, origin)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) applied++;
        if (r.status === 'rejected') errored++;
      }
      if (i + BATCH_SIZE < channels.length) await wait(150);
    }

    if (applied > 0 || errored > 0) {
      report('Drip Channel Enforcement Complete', {
        guild: guildSummary,
        origin,
        channelsUpdated: applied,
        errored,
      }, errored > 0 ? 'warn' : 'success');
      if (applied > 0) {
        activityTracker.recordActivity(
          'drip-channel-enforcement',
          `Drip overwrite sweep complete — ${applied} channel${applied === 1 ? '' : 's'} updated`,
          { guild: guildSummary, origin, applied, errored },
        );
      }
    }
  } catch (error) {
    report('Drip Channel Enforcement Error', mergeReportError({ guild: guildSummary, origin }, error), 'error');
    securityEventService.recordEvent({
      eventType: 'drip-channel-enforcement-error',
      severity: SecuritySeverity.MEDIUM,
      guildId: guild.id,
      guildName: guild.name,
      executorId: client.user?.id ?? 'SYSTEM',
      origin: 'drip-channel-enforcement',
      metadata: { trigger: origin, error: getErrorMessage(error) },
    }).catch((err) =>
      report('Drip Enforcement Error — SecurityEvent Write Error', mergeReportError({ guild: guildSummary }, err), 'error'),
    );
  }
}

interface AssignmentCacheEntry {
  assigned?: boolean;
  timestamp?: number;
}

async function ensureTrainerFor(member: GuildMember | PartialGuildMember | null, origin = 'unspecified'): Promise<void> {
  // Verify member object exists and is valid
  if (!member || !member.guild || !member.id || !member.user) {
    log('warn', 'Cannot assign role: invalid member object', {
      origin,
      memberId: member?.id || 'unknown',
      hasGuild: Boolean(member?.guild),
      hasUser: Boolean(member?.user)
    });
    return;
  }

  // Skip bots
  if (member.user.bot) {
    return;
  }

  const guildSummary = describeGuild(member.guild);
  const memberSummary = describeMember(member);

  const role = findRole(member.guild);
  if (!role) {
    report('Role Missing', {
      origin,
      guild: guildSummary,
      roleName: ROLE_NAME,
      roleId: TRAINER_ROLE_ID
    }, 'warn');
    return;
  }

  if (!isMissingTrainerRole(member)) {
    report('Member Skipped', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      reason: 'already has Trainer role'
    }, 'detail');
    return;
  }

  // Pre-check hierarchy/permissions
  if (!canAssignRole(member.guild, role)) {
    log('warn', 'Cannot assign role: bot lacks permission or role is above bot in hierarchy', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role)
    });
    return;
  }

  // Cache: skip if we recently assigned this member
  const cacheKey = `assign:${member.guild.id}:${member.id}:${role.id}`;
  const cached = cache.readCache(cacheKey) as AssignmentCacheEntry | null;
  if (cached && cached.assigned && cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL_HOURS * 3600 * 1000) {
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
    markExpectedBotRoleMutation(member.id, role.id);
    await member.roles.add(role);
    markExpectedBotRoleMutation(member.guild.id, member.id);
    markTrainerAssignmentInFlight(member.guild.id, member.id);
    report('Assignment Success', {
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role)
    }, 'success');
    activityTracker.recordActivity('role-assignment', `Assigned ${describeRole(role)} to ${memberSummary}`, {
      origin,
      guild: guildSummary,
      member: memberSummary,
    });
    bumpRoleMemberCount(member.guild, 1);
    cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });

    // DB audit trail: record bot-initiated Trainer role assignment
    const botId = client.user?.id ?? 'SYSTEM';
    const botTag = client.user?.tag ?? 'SYSTEM#0000';
    roleAuditService.recordRoleChange({
      memberId: member.id,
      memberTag: member.user.tag,
      guildId: member.guild.id,
      guildName: member.guild.name,
      changeType: RoleChangeType.ADDITION,
      roleId: role.id,
      roleName: role.name,
      rolePosition: role.position,
      executorId: botId,
      executorTag: botTag,
      authorized: true,
      origin: 'trainer-auto-assign',
      metadata: { trigger: origin },
    }).catch((err) =>
      report('Trainer Auto-Assign — RoleChangeAudit Write Error', mergeReportError({
        guild: guildSummary,
        userId: member.id,
      }, err), 'error'),
    );
    securityEventService.recordEvent({
      eventType: 'trainer-auto-assign',
      severity: SecuritySeverity.INFO,
      guildId: member.guild.id,
      guildName: member.guild.name,
      memberId: member.id,
      memberTag: member.user.tag,
      roleId: role.id,
      roleName: role.name,
      executorId: botId,
      executorTag: botTag,
      origin: 'trainer-auto-assign',
      metadata: { trigger: origin },
    }).catch((err) =>
      report('Trainer Auto-Assign — SecurityEvent Write Error', mergeReportError({
        guild: guildSummary,
        userId: member.id,
      }, err), 'error'),
    );
  } catch (error) {
    const err = error as ErrorWithCode;
    const hint = (err && (String(err.message).includes('Missing Permissions') || err.code === 50013))
      ? 'Check role hierarchy: bot role must be above target role and have Manage Roles.'
      : undefined;
    report('Assignment Failure', mergeReportError({
      origin,
      guild: guildSummary,
      member: memberSummary,
      role: describeRole(role),
      hint,
    }, error), 'error');
  }
}

async function sweepGuild(guild: Guild, origin: string): Promise<void> {
  const guildSummary = describeGuild(guild);
  cliStatus.setPhase(`Sweeping ${guild.name} (${origin})`);
  const sweepStartedAt = beginSecuritySweep(guild, origin);
  let success = 0;
  let failed = 0;
  let candidates = 0;
  let sweepOutcome = 'completed';
  report('Sweep Start', { origin, guild: guildSummary });

  try {
    try {
      await ensureGuildMembersCached(guild, { origin: `sweep:${origin}` });
      report('Members Fetched', {
        guild: guildSummary,
        cachedMembers: guild.members.cache.size
      });
    } catch (error) {
      report('Members Fetch Error', mergeReportError({
        origin,
        guild: guildSummary,
      }, error), 'error');
      sweepOutcome = 'members fetch failed';
      return;
    }

    const toAssign = guild.members.cache.filter(member => isMissingTrainerRole(member) && !member.user.bot);
    candidates = toAssign.size;
    if (toAssign.size === 0) {
      report('Sweep No-Op', {
        origin,
        guild: guildSummary
      });
      sweepOutcome = 'no candidates';
      return;
    }

    const role = findRole(guild);
    if (!role) {
      report('Role Missing', {
        origin,
        guild: guildSummary,
        roleName: ROLE_NAME,
        roleId: TRAINER_ROLE_ID
      }, 'warn');
      sweepOutcome = 'role missing';
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

    const members: GuildMember[] = Array.from(toAssign.values());

    for (let i = 0; i < members.length; i += BACKFILL_CONCURRENCY) {
      const batch = members.slice(i, i + BACKFILL_CONCURRENCY);
      await Promise.all(batch.map(async (member: GuildMember) => {
        try {
          const cacheKey = `assign:${guild.id}:${member.id}:${role.id}`;
          const cached = cache.readCache(cacheKey) as AssignmentCacheEntry | null;
          if (cached && cached.assigned && cached.timestamp && Date.now() - cached.timestamp < CACHE_TTL_HOURS * 3600 * 1000) {
            report('Assignment Skipped (Cache)', {
              origin,
              guild: guildSummary,
              member: describeMember(member),
              role: describeRole(role)
            }, 'detail');
            return;
          }

          markExpectedBotRoleMutation(member.id, role.id);
          await member.roles.add(role);
          markExpectedBotRoleMutation(guild.id, member.id);
          markTrainerAssignmentInFlight(guild.id, member.id);
          success += 1;
          report('Assignment Success', {
            origin,
            guild: guildSummary,
            member: describeMember(member),
            role: describeRole(role)
          }, 'detail');
          activityTracker.recordActivity('role-assignment', `Assigned ${describeRole(role)} to ${describeMember(member)}`, {
            origin,
            guild: guildSummary,
            member: describeMember(member),
          });
          bumpRoleMemberCount(member.guild, 1);
          cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });
        } catch (error) {
          failed += 1;
          report('Assignment Failure', mergeReportError({
            origin,
            guild: guildSummary,
            member: describeMember(member),
            role: describeRole(role),
          }, error), 'error');
        }
      }));

      if (BACKFILL_DELAY_MS > 0 && i + BACKFILL_CONCURRENCY < members.length) {
        await wait(BACKFILL_DELAY_MS);
      }
    }

    report('Sweep Summary', {
      origin,
      guild: guildSummary,
      assigned: success,
      failed,
      candidatesProcessed: members.length
    });
  } catch (error) {
    report('Sweep Error', mergeReportError({
      origin,
      guild: guildSummary,
    }, error), 'error');
    sweepOutcome = 'error';
  } finally {
    completeSecuritySweep({
      startedAt: sweepStartedAt,
      assigned: success,
      failed,
      candidates,
      reason: sweepOutcome,
    });
    
    // Record sweep in persistent state
    if (botState) {
      try {
        const rolesChecked = guild.roles.cache.size;
        const changesDetected = success + failed;
        recordSweep(botState, guild.id, describeGuild(guild), rolesChecked, changesDetected);
      } catch (error) {
        log('warn', 'Failed to record sweep in state', mergeLogError({ guild: guildSummary }, error));
      }
    }

    // Persist guild/member/role snapshot to DB.
    // At startup, BLOCK until sync completes so downstream operations see accurate data.
    // During continuous/periodic sweeps, fire-and-forget to avoid blocking the loop.
    if (origin === 'startup') {
      try {
        await syncGuildSnapshot(guild);
      } catch (err) {
        log('warn', 'Startup guild snapshot sync failed', mergeLogError({ guild: guildSummary }, err));
      }
    } else {
      syncGuildSnapshot(guild).catch((err) =>
        log('warn', 'Guild snapshot sync failed (non-blocking)', mergeLogError({ guild: guildSummary }, err)),
      );
    }
    
    updateMonitoringPhase();
  }
}

// ============================================================================
// Guild Snapshot Sync — Persist Discord state to DiscordGuild/DiscordMember/DiscordRole
// The schema comment on DiscordGuild says "Synced by security bot periodic sweeps".
// These tables feed cross-reference validation, anomaly baselines, and historical queries.
// ============================================================================

async function syncGuildSnapshot(guild: Guild): Promise<void> {
  const guildSummary = describeGuild(guild);
  const now = new Date();

  try {
    // 1. Upsert DiscordGuild
    await prisma.discordGuild.upsert({
      where: { id: guild.id },
      update: {
        name: guild.name,
        ownerId: guild.ownerId,
        icon: guild.icon,
        memberCount: guild.memberCount ?? guild.members.cache.size,
        roleCount: guild.roles.cache.size,
        channelCount: guild.channels.cache.size,
        lastSweepAt: now,
        sweepCount: { increment: 1 },
        lastUpdatedAt: now,
      },
      create: {
        id: guild.id,
        name: guild.name,
        ownerId: guild.ownerId,
        icon: guild.icon,
        memberCount: guild.memberCount ?? guild.members.cache.size,
        roleCount: guild.roles.cache.size,
        channelCount: guild.channels.cache.size,
        monitoringEnabled: true,
        lastSweepAt: now,
        sweepCount: 1,
        firstSeenAt: now,
        lastUpdatedAt: now,
      },
    });

    // 2. Batch upsert DiscordMembers (chunked to avoid oversized transactions)
    const members = [...guild.members.cache.values()];
    const MEMBER_CHUNK = 50;
    for (let i = 0; i < members.length; i += MEMBER_CHUNK) {
      const chunk = members.slice(i, i + MEMBER_CHUNK);
      await prisma.$transaction(
        chunk.map((m) =>
          prisma.discordMember.upsert({
            where: {
              discordUserId_guildId: { discordUserId: m.id, guildId: guild.id },
            },
            update: {
              username: m.user.username,
              displayName: m.displayName ?? null,
              avatar: m.user.avatar,
              bot: m.user.bot,
              roles: m.roles.cache.filter((r) => r.id !== guild.roles.everyone.id).map((r) => r.id),
              joinedAt: m.joinedAt,
              premiumSince: m.premiumSince,
              pending: m.pending ?? false,
              communicationDisabledUntil: m.communicationDisabledUntil,
              roleCount: m.roles.cache.size - 1, // exclude @everyone
              highestRolePosition: m.roles.highest.position,
              isAdministrator: m.permissions.has('Administrator'),
              isOwner: m.id === guild.ownerId,
              lastUpdatedAt: now,
            },
            create: {
              discordUserId: m.id,
              guildId: guild.id,
              username: m.user.username,
              displayName: m.displayName ?? null,
              avatar: m.user.avatar,
              bot: m.user.bot,
              roles: m.roles.cache.filter((r) => r.id !== guild.roles.everyone.id).map((r) => r.id),
              joinedAt: m.joinedAt,
              premiumSince: m.premiumSince,
              pending: m.pending ?? false,
              communicationDisabledUntil: m.communicationDisabledUntil,
              roleCount: m.roles.cache.size - 1,
              highestRolePosition: m.roles.highest.position,
              isAdministrator: m.permissions.has('Administrator'),
              isOwner: m.id === guild.ownerId,
              firstSeenAt: now,
              lastUpdatedAt: now,
            },
          }),
        ),
      );
    }

    // 3. Batch upsert DiscordRoles
    const roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.roles.everyone.id);
    const ROLE_CHUNK = 25;
    for (let i = 0; i < roles.length; i += ROLE_CHUNK) {
      const chunk = roles.slice(i, i + ROLE_CHUNK);
      await prisma.$transaction(
        chunk.map((r) =>
          prisma.discordRole.upsert({
            where: {
              discordRoleId_guildId: { discordRoleId: r.id, guildId: guild.id },
            },
            update: {
              name: r.name,
              color: r.color,
              hoist: r.hoist,
              position: r.position,
              permissions: r.permissions.bitfield.toString(),
              mentionable: r.mentionable,
              managed: r.managed,
              isAdmin: r.permissions.has('Administrator'),
              isDangerous: r.permissions.has('Administrator') || r.permissions.has('BanMembers') || r.permissions.has('KickMembers'),
              memberCount: r.members.size,
              lastUpdatedAt: now,
            },
            create: {
              discordRoleId: r.id,
              guildId: guild.id,
              name: r.name,
              color: r.color,
              hoist: r.hoist,
              position: r.position,
              permissions: r.permissions.bitfield.toString(),
              mentionable: r.mentionable,
              managed: r.managed,
              isAdmin: r.permissions.has('Administrator'),
              isDangerous: r.permissions.has('Administrator') || r.permissions.has('BanMembers') || r.permissions.has('KickMembers'),
              memberCount: r.members.size,
              firstSeenAt: now,
              lastUpdatedAt: now,
            },
          }),
        ),
      );
    }

    report('Guild Snapshot Synced', {
      guild: guildSummary,
      members: members.length,
      roles: roles.length,
    }, 'detail');
  } catch (error) {
    report('Guild Snapshot Sync Error', mergeReportError({
      guild: guildSummary,
    }, error), 'error');
  }
}

async function runCliDebugDump() {
  report('CLI Debug Start', {
    guildsObserved: client.guilds.cache.size,
    roleResolution: `TRAINER_ROLE_ID:${TRAINER_ROLE_ID}`
  });

  for (const [, guild] of client.guilds.cache) {
    const guildSummary = describeGuild(guild);

    try {
      await guild.roles.fetch();
    } catch (error) {
      report('CLI Debug Roles Fetch Error', mergeReportError({
        guild: guildSummary,
      }, error), 'error');
      continue;
    }

    try {
      await ensureGuildMembersCached(guild, { origin: 'cli-debug' });
    } catch (error) {
      report('CLI Debug Members Fetch Error', mergeReportError({
        guild: guildSummary,
      }, error), 'error');
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

    // Build diagnostic payload (for future debugging)
    const _payload = {
      guild: guildSummary,
      totals: {
        roles: roleSummaries.length,
        members: memberSummaries.length,
        mismatchedRoles: mismatchDetails.length
      },
      targetRole: { mode: 'TRAINER_ROLE_ID', value: TRAINER_ROLE_ID },
      roles: roleSummaries,
      permissionDiffs: mismatchDetails,
      members: memberSummaries
    };

    // Debug output disabled in production
    // console.log(JSON.stringify(_payload, null, 2));
    // console.log('');
  }

  log('info', '[cli-debug] Completed diagnostic dump.');
  await client.destroy();
  process.exit(0);
}

function startContinuousSweepLoop(transformer?: (guilds: Guild[], signal?: AbortSignal) => Guild[] | Collection<string, Guild> | Iterable<Guild>): Promise<void> | undefined {
  if (continuousSweepState.running) {
    return continuousSweepState.loopPromise;
  }

  const abortController = new AbortController();
  continuousSweepState.running = true;
  continuousSweepState.abortController = abortController;
  const idleDelayMs = Math.max(BACKFILL_INTERVAL_SECONDS * 1000, CONTINUOUS_SWEEP_IDLE_DELAY_MS);

  const loop = async () => {
    updateSecurityCliSection({ status: 'Continuous sweep initializing' });
    cliStatus.setGuildCount(client.guilds.cache.size);
    cliStatus.setPhase('Continuous sweep initializing');

    while (!abortController.signal.aborted) {
      const cycleStarted = new Date();
      const guilds = getContinuousSweepGuilds(abortController.signal, transformer);
      report('Continuous Sweep Cycle Start', {
        cycleStarted: cycleStarted.toISOString(),
        guildsPlanned: guilds.length,
        idleDelayMs,
      });

      cliStatus.setPhase('Continuous sweep cycle');
      updateSecurityCliSection({ status: 'Continuous sweep cycle' });

      // Batched parallel guild sweeps (5 guilds at a time to respect rate limits)
      const GUILD_SWEEP_BATCH_SIZE = 5;
      for (let i = 0; i < guilds.length; i += GUILD_SWEEP_BATCH_SIZE) {
        if (abortController.signal.aborted) {
          break;
        }
        
        const batch = guilds.slice(i, i + GUILD_SWEEP_BATCH_SIZE);
        await Promise.all(batch.map(guild => sweepGuild(guild, 'continuous')));
        
        if (abortController.signal.aborted) {
          break;
        }
        cliStatus.setPhase('Continuous sweep cycle');
        updateSecurityCliSection({ status: 'Continuous sweep cycle' });
        if (abortController.signal.aborted) {
          break;
        }
        // Delay between batches (not between individual guilds)
        if (BACKFILL_DELAY_MS > 0 && i + GUILD_SWEEP_BATCH_SIZE < guilds.length) {
          await wait(BACKFILL_DELAY_MS, abortController.signal);
        }
      }

      cache.cleanOldCache();
      const cycleCompleted = new Date();
      report('Continuous Sweep Cycle Complete', {
        cycleStarted: cycleStarted.toISOString(),
        cycleCompleted: cycleCompleted.toISOString(),
        durationMs: cycleCompleted.getTime() - cycleStarted.getTime(),
        guildsVisited: guilds.length,
        cacheRefreshed: true,
        idleDelayMs,
      });

      log('info', 'security.sweep.health', {
        guildsVisited: guilds.length,
        idleDelayMs,
        cycleStarted: cycleStarted.toISOString(),
        cycleCompleted: cycleCompleted.toISOString(),
        totalSweeps: securityCliState.totalSweeps,
        totalAssignments: securityCliState.totalAssignments,
      });

      if (abortController.signal.aborted) {
        break;
      }

      cliStatus.setGuildCount(client.guilds.cache.size);
      cliStatus.setPhase('Continuous sweep idle');
      updateSecurityCliSection({ status: 'Continuous sweep idle' });

      await wait(idleDelayMs, abortController.signal);
    }
  };

  continuousSweepState.loopPromise = loop().catch((error) => {
    log('error', 'Continuous sweep loop encountered an error', mergeLogError({}, error));
  }).finally(() => {
    continuousSweepState.running = false;
    continuousSweepState.abortController = null;
    continuousSweepState.loopPromise = undefined;
  });

  return continuousSweepState.loopPromise;
}

/**
 * Sync Gym Leader role for all current members of the moderator-only channel.
 *
 * Members who have an explicit per-member overwrite on the channel receive the
 * Gym Leader role; members who have the role but no overwrite have it stripped.
 * Called at boot and can be called on demand.
 */
// Guards against concurrent invocations of syncModeratorChannelRoles for the
// same guild (e.g., bot restart racing with a periodic tick). Keyed by guildId.
const gymSyncInProgress = new Set<string>();

async function syncModeratorChannelRoles(trigger: string): Promise<void> {
  for (const [, guild] of client.guilds.cache) {
    // Skip if a sync is already running for this guild (e.g., periodic tick
    // fires while the boot sync is still in progress).
    if (gymSyncInProgress.has(guild.id)) {
      report('Gym Leader Role Sync Skipped — Already In Progress', {
        guild: describeGuild(guild),
        trigger,
      }, 'info');
      continue;
    }
    gymSyncInProgress.add(guild.id);
    try {
      // Always force-fetch the channel via REST so permission overwrites reflect
      // live Discord state. The local cache is empty or stale at boot-time,
      // which would cause memberIdsWithAccess to resolve as an empty Set and
      // silently skip every member who should receive the Gym Leader role.
      const channel = await guild.channels.fetch(MODERATOR_ONLY_CHANNEL_ID).catch((err) => {
        log('warn', 'Gym Leader Sync: Failed to fetch moderator channel', mergeLogError({
          guild: describeGuild(guild), channelId: MODERATOR_ONLY_CHANNEL_ID, trigger,
        }, err));
        return null;
      });

      if (!channel || !('permissionOverwrites' in channel)) {
        // Channel not found in this guild — not an error, bot may be in multiple guilds.
        continue;
      }

      // Always force-fetch the role so we use its live ID-based reference.
      const gymLeaderRole = await guild.roles.fetch(GYM_LEADER_ROLE_ID).catch((err) => {
        log('warn', 'Gym Leader Sync: Failed to fetch gym leader role', mergeLogError({
          guild: describeGuild(guild), roleId: GYM_LEADER_ROLE_ID, trigger,
        }, err));
        return null;
      });

      if (!gymLeaderRole) {
        report('Gym Leader Role Not Found', {
          guild: describeGuild(guild),
          roleId: GYM_LEADER_ROLE_ID,
          trigger,
        }, 'warn');
        continue;
      }

      // Collect member IDs that have an explicit per-member overwrite on the channel.
      const memberIdsWithAccess = new Set<string>(
        [...channel.permissionOverwrites.cache.values()]
          .filter((ow) => ow.type === OverwriteType.Member)
          .map((ow) => ow.id),
      );

      // Fetch all guild members so we can inspect their current roles.
      const members = await guild.members.fetch();

      let granted = 0;
      let revoked = 0;
      const errors: string[] = [];
      const botId = client.user?.id ?? 'SYSTEM';
      const botTag = client.user?.tag ?? 'SYSTEM#0000';

      // Collect audit inputs for batch write after the loop.
      const roleAuditInputs: Parameters<typeof roleAuditService.recordRoleChange>[0][] = [];

      for (const [memberId, member] of members) {
        const hasAccess = memberIdsWithAccess.has(memberId);
        const hasRole = member.roles.cache.has(GYM_LEADER_ROLE_ID);

        if (hasAccess && !hasRole) {
          try {
            await member.roles.add(GYM_LEADER_ROLE_ID, `Moderator-only channel sync (${trigger})`);
            granted++;
            roleAuditInputs.push({
              memberId: member.id,
              memberTag: member.user.tag,
              guildId: guild.id,
              guildName: guild.name,
              changeType: RoleChangeType.ADDITION,
              roleId: GYM_LEADER_ROLE_ID,
              roleName: gymLeaderRole.name,
              rolePosition: gymLeaderRole.position,
              executorId: botId,
              executorTag: botTag,
              authorized: true,
              origin: 'moderator-channel-sync',
              metadata: { trigger, channelId: MODERATOR_ONLY_CHANNEL_ID },
            });
          } catch (err) {
            errors.push(`grant:${memberId}:${getErrorMessage(err)}`);
          }
        } else if (!hasAccess && hasRole) {
          try {
            await member.roles.remove(GYM_LEADER_ROLE_ID, `Moderator-only channel sync (${trigger})`);
            revoked++;
            roleAuditInputs.push({
              memberId: member.id,
              memberTag: member.user.tag,
              guildId: guild.id,
              guildName: guild.name,
              changeType: RoleChangeType.REMOVAL,
              roleId: GYM_LEADER_ROLE_ID,
              roleName: gymLeaderRole.name,
              rolePosition: gymLeaderRole.position,
              executorId: botId,
              executorTag: botTag,
              authorized: true,
              origin: 'moderator-channel-sync',
              metadata: { trigger, channelId: MODERATOR_ONLY_CHANNEL_ID },
            });
          } catch (err) {
            errors.push(`revoke:${memberId}:${getErrorMessage(err)}`);
          }
        }
      }

      // Batch-write role change audit records with HMAC + hash-chain integrity.
      if (roleAuditInputs.length > 0) {
        roleAuditService.recordRoleChangesBatch(roleAuditInputs).catch((err) =>
          report('Gym Leader Sync — RoleChangeAudit Batch Write Error', mergeReportError({
            guild: describeGuild(guild),
            trigger,
            count: roleAuditInputs.length,
          }, err), 'error'),
        );
      }

      // Write a summary SecurityEvent for the sync operation.
      securityEventService.recordEvent({
        eventType: 'moderator-channel-sync',
        severity: (granted + revoked) > 10 ? SecuritySeverity.MEDIUM : SecuritySeverity.INFO,
        guildId: guild.id,
        guildName: guild.name,
        roleId: GYM_LEADER_ROLE_ID,
        roleName: gymLeaderRole.name,
        executorId: botId,
        executorTag: botTag,
        origin: `security-bot-sync:${trigger}`,
        metadata: {
          trigger,
          channelId: MODERATOR_ONLY_CHANNEL_ID,
          membersWithAccess: memberIdsWithAccess.size,
          granted,
          revoked,
          errors: errors.length > 0 ? errors : undefined,
        },
      }).catch((err) =>
        report('Gym Leader Sync — SecurityEvent Write Error', mergeReportError({
          guild: describeGuild(guild),
          trigger,
        }, err), 'error'),
      );

      // DRIP alert when the sync actually changed anything.
      if (dripAlertManager && (granted + revoked) > 0) {
        const alertSeverity = (granted + revoked) > 10
          ? DRIP_ALERT_SEVERITY.security
          : DRIP_ALERT_SEVERITY.notice;
        const alertTitle = `🔑 Gym Leader sync (${trigger}): +${granted} granted, -${revoked} revoked`;
        const alertMeta = {
          guild: describeGuild(guild),
          trigger,
          granted,
          revoked,
          channelId: MODERATOR_ONLY_CHANNEL_ID,
        };
        dripAlertManager.recordAlert(alertSeverity, alertTitle, alertMeta).catch((err) =>
          report('Gym Leader Sync — DRIP Alert Error', mergeReportError(alertMeta, err), 'error'),
        );
        activityTracker.recordActivity('gym-leader-sync', alertTitle, alertMeta);
        updateSecurityCliSection({
          lastAlertSentAt: new Date(),
          lastAlertMessage: alertTitle,
        });
      }

      report('Gym Leader Role Sync Complete', {
        guild: describeGuild(guild),
        trigger,
        membersWithAccess: memberIdsWithAccess.size,
        granted,
        revoked,
        errors: errors.length > 0 ? errors : undefined,
      }, errors.length > 0 ? 'warn' : 'info');
    } catch (err) {
      report('Gym Leader Role Sync Error', mergeReportError({
        guild: describeGuild(guild),
        trigger,
      }, err), 'error');
    } finally {
      gymSyncInProgress.delete(guild.id);
    }
  }
}

client.once(Events.ClientReady, async () => {
  // Initialize operational state persistence
  try {
    botState = await initializeState();
    autoSaveInterval = startAutoSave(botState);
    
    // Expose state to global for cross-module telemetry (e.g., logger.js)
    global.securityBotState = botState;
    global.securityBotClient = client;
    
    log('success', 'State persistence initialized', {
      restartNumber: botState.cumulative.restartCount,
      guildsMonitored: Object.keys(botState.guilds).length,
    });
  } catch (error) {
    log('error', 'State persistence initialization failed', mergeLogError({
      errorType: error?.constructor?.name || typeof error,
      errorMessage: getErrorMessage(error),
      errorStack: ensureError(error).stack,
    }, error));
    
    // Create minimal fallback state so bot can still function
    const now = new Date().toISOString();
    botState = {
      version: 1,
      schemaVersion: '1.0.0',
      metadata: {
        lastSaved: now,
        lastRestart: now,
        previousRestart: now,
        processStartTime: now,
        hostname: process.env.RENDER_SERVICE_NAME || 'local',
        nodeVersion: process.version,
        botVersion: '2.0.0'
      },
      cumulative: {
        totalUptime: 0,
        restartCount: 1,
        sweepCount: 0,
        alertCount: 0,
        permissionChangesDetected: 0,
        permissionChangesReverted: 0,
        revertFailures: 0,
        guildCount: 0,
        firstStartTime: now
      },
      metricsHistory: {
        hourly: [],
        lastPruned: now
      },
      runtime: {
        currentUptime: 0,
        currentRestartTime: now,
        databaseStatus: { dev: 'unknown', prod: 'unknown' },
        activeSweepIntervals: []
      },
      timeline: [{
        timestamp: now,
        type: 'restart' as const,
        guildId: undefined,
        guildName: undefined,
        details: { reason: 'fallback state (persistence unavailable)', previousUptime: 0 }
      }],
      guilds: {}
    } satisfies SecurityBotState;
    
    // Expose fallback state to globals
    global.securityBotState = botState;
    global.securityBotClient = client;
    
    log('warn', 'Using fallback state (persistence unavailable)', {
      restartNumber: 1,
      guildsMonitored: 0,
    });
  }
  
  if (CLI_DEBUG_MODE) {
    log('info', 'CLI debug mode active', {
      userTag: client.user?.tag ?? 'Unknown',
      userId: client.user?.id ?? 'Unknown'
    });
    await runCliDebugDump();
    return;
  }

  log('success', 'Your service is live💦', {
    connectedAs: client.user?.tag ?? 'Unknown',
    userId: client.user?.id ?? 'Unknown',
  });

  // Startup validation: verify critical role IDs resolve to actual Discord roles.
  // A silent lookup failure here means the security bot won't assign roles at all.
  for (const [, guild] of client.guilds.cache) {
    const trainerRole = guild.roles.cache.get(TRAINER_ROLE_ID);
    if (!trainerRole) {
      report('⚠️ TRAINER_ROLE_ID Not Found In Guild', {
        guild: describeGuild(guild),
        trainerRoleId: TRAINER_ROLE_ID,
        availableRoleCount: guild.roles.cache.size,
        impact: 'Trainer role assignment will silently fail for this guild',
      }, 'error');
    }
    const gymRole = guild.roles.cache.get(GYM_LEADER_ROLE_ID);
    if (!gymRole) {
      report('⚠️ GYM_LEADER_ROLE_ID Not Found In Guild', {
        guild: describeGuild(guild),
        gymLeaderRoleId: GYM_LEADER_ROLE_ID,
        impact: 'Gym Leader sync will skip this guild',
      }, 'warn');
    }
  }

  if (commands && commands.size) {
    log('info', 'Slash commands loaded', { count: commands.size });
  }
  updateSecurityCliSection({ status: `Ready as ${client.user?.tag ?? 'Unknown'}` });
  updateMonitoringPhase();
  await refreshMemberStats('ready');
  await notifyServiceRestart();
  scheduleDailySummaryReports();
  if (dripAlertManager) {
    dripAlertManager.start();
  }
  if (isClientReady()) {
    void deliverOpsErrors();
  }

  report('Runtime Configuration', {
    roleName: ROLE_NAME,
    roleId: TRAINER_ROLE_ID,
    roleDiscovery: 'TRAINER_ROLE_ID exact match',
    startupBackfill: 'enabled',
    continuousSweep: ENABLE_CONTINUOUS_SWEEP
      ? `continuous (idle target ${BACKFILL_INTERVAL_SECONDS}s)`
      : 'disabled (ENABLE_CONTINUOUS_SWEEP=false)',
    concurrency: BACKFILL_CONCURRENCY,
    delayMsBetweenBatches: BACKFILL_DELAY_MS,
    guildsObserved: client.guilds.cache.size,
    roleAudit: ROLE_PERMISSIONS_AUDIT ? 'enforced-on' : 'disabled',
    roleRemediation: ROLE_PERMISSIONS_REMEDIATE
      ? `enforced-on (${ROLE_REMEDIATION_INTERVAL_SECONDS}s cadence)`
      : 'disabled',
    opsReport: OPS_REPORT_INTERVAL_SECONDS > 0 ? `${OPS_REPORT_INTERVAL_SECONDS}s cadence` : 'disabled',
    rolePermissionPolicy: ROLE_PERMISSION_POLICY,
    snapshotAutoSeed: ROLE_PERMISSION_SNAPSHOT_UPDATE ? 'enabled' : 'disabled',
    enforceAllRoles: STANDARD_ENFORCE_ALL ? 'enabled' : 'disabled',
    unlistedBaselineCount: UNLISTED_PERMISSIONS.length
  });

  // One-time detailed operational report
  reportOperationalStats('ready');

  if (ENABLE_CONTINUOUS_SWEEP) {
    if (client.guilds.cache.size === 0) {
      report('No Guilds Joined', { action: 'Invite the bot to your server to begin assigning roles.' }, 'warn');
      updateMonitoringPhase();
    } else {
      cliStatus.setPhase('Startup sweep');
      updateSecurityCliSection({ status: 'Startup sweep' });
      
      // Batched parallel guild sweeps (5 guilds at a time to respect rate limits)
      const GUILD_SWEEP_BATCH_SIZE = 5;
      const guildArray = Array.from(client.guilds.cache.values());
      
      for (let i = 0; i < guildArray.length; i += GUILD_SWEEP_BATCH_SIZE) {
        const batch = guildArray.slice(i, i + GUILD_SWEEP_BATCH_SIZE);
        
        // Parallel audit/validation/remediation for batch
        if (ROLE_PERMISSIONS_AUDIT || ROLE_PERMISSIONS_REMEDIATE) {
          await Promise.all(batch.map(async (guild) => {
            if (ROLE_PERMISSIONS_AUDIT) {
              await reportGuildRoles(guild);
              await validateGuildRoles(guild);
            }
            if (ROLE_PERMISSIONS_REMEDIATE) {
              await fixGuildRoles(guild);
            }
          }));
        }
        
        // Parallel sweep for batch
        await Promise.all(batch.map(guild => sweepGuild(guild, 'startup')));
      }
      
      updateMonitoringPhase();
    }

    const idleDelayMs = Math.max(BACKFILL_INTERVAL_SECONDS * 1000, CONTINUOUS_SWEEP_IDLE_DELAY_MS);
    report('Continuous Sweep Loop Enabled', {
      idleDelayMs,
      targetIntervalSeconds: BACKFILL_INTERVAL_SECONDS,
      backfillDelayMs: BACKFILL_DELAY_MS,
    });
    void startContinuousSweepLoop();
  } else {
    report('Continuous Sweep Loop Disabled', {
      reason: 'ENABLE_CONTINUOUS_SWEEP=false',
      guildsObserved: client.guilds.cache.size,
    }, 'info');
    cliStatus.setPhase('Security sweeps disabled');
    updateSecurityCliSection({
      status: 'Continuous sweep disabled',
      lastSweepResult: 'disabled via ENABLE_CONTINUOUS_SWEEP',
    });
    updateMonitoringPhase();
  }

  // Optional recurring operational report
  if (OPS_REPORT_INTERVAL_SECONDS > 0) {
    const opsMs = OPS_REPORT_INTERVAL_SECONDS * 1000;
    report('Operational Report Scheduled', { everySeconds: OPS_REPORT_INTERVAL_SECONDS });
    setInterval(() => reportOperationalStats('periodic'), opsMs);
  }

  // Optional recurring role permission remediation
  if (ROLE_REMEDIATION_INTERVAL_SECONDS > 0) {
    const remMs = ROLE_REMEDIATION_INTERVAL_SECONDS * 1000;
    report('Periodic Role Remediation Enabled', { everySeconds: ROLE_REMEDIATION_INTERVAL_SECONDS });
    setInterval(async () => {
      for (const [, guild] of client.guilds.cache) {
        await fixGuildRoles(guild);
      }
    }, remMs);
  }

  if (!memberStatsInterval) {
    memberStatsInterval = setInterval(() => {
      if (isClientReady()) {
        void refreshMemberStats('periodic');
      }
    }, MEMBER_STATS_REFRESH_INTERVAL_MS);
    memberStatsInterval.unref?.();
  }

  // Boot-time sync: ensure everyone who already has a per-member overwrite in
  // the moderator-only channel holds the Gym Leader role, and anyone who
  // shouldn't (no overwrite) does not.
  // Blocking at boot so DB + channel state is consistent before periodic work begins.
  try {
    await syncModeratorChannelRoles('boot');
  } catch (err) {
    log('warn', 'Boot gym sync failed (non-fatal)', mergeLogError({}, err));
  }

  // Periodic re-sync every 4 hours: corrects any drift caused by missed
  // channelUpdate events (gateway reconnects, Discord outages, etc.).
  const GYM_SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
  const gymSyncTimer = setInterval(() => {
    if (isClientReady()) {
      void syncModeratorChannelRoles('periodic');
    }
  }, GYM_SYNC_INTERVAL_MS);
  gymSyncTimer.unref?.();

  // ── Drip Role Channel Persistence ──────────────────────────────────────────
  // Boot pass: apply the Drip overwrite to every channel that is missing it.
  // Blocking at boot so channel permissions are fully applied before periodic work begins.
  for (const [, guild] of client.guilds.cache) {
    try {
      await enforceDripRoleAllChannels(guild, 'boot');
    } catch (err) {
      log('warn', 'Boot Drip channel enforcement failed (non-fatal)', mergeLogError({ guild: guild.name }, err));
    }
  }

  // Periodic re-enforcement every 4 hours to heal any drift.
  const DRIP_CHANNEL_SYNC_MS = 4 * 60 * 60 * 1000;
  const dripChannelSyncTimer = setInterval(() => {
    if (isClientReady()) {
      void (async () => {
        for (const [, guild] of client.guilds.cache) {
          await enforceDripRoleAllChannels(guild, 'periodic');
        }
      })();
    }
  }, DRIP_CHANNEL_SYNC_MS);
  dripChannelSyncTimer.unref?.();
});

// Slash commands, autocomplete, and DM console interactions
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // ── DM Console button/select routing ──
    if ((interaction.isButton() || interaction.isStringSelectMenu()) && isConsoleInteraction(interaction)) {
      // Auth check: same gate as DM messages
      if (!canUseDirectStatusCommand(interaction.user.id)) return;
      const consoleCtx = buildConsoleContext();
      await handleConsoleInteraction(interaction, consoleCtx);
      return;
    }

    if (!commands || commands.size === 0) return;
    if (interaction.isAutocomplete()) {
      const cmd = commands.get(interaction.commandName);
      if (cmd?.autocomplete) return cmd.autocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return interaction.reply({ content: 'Unknown command.', ephemeral: true });
    // Per-user per-command cooldown (default 2000ms unless overridden)
    const cdMs = typeof cmd.cooldownMs === 'number' ? cmd.cooldownMs : 2000;
    const gate = checkAndSet(interaction.user.id, interaction.commandName, cdMs);
    if (!gate.ok) {
      const secs = Math.ceil(gate.waitMs / 1000);
      return interaction.reply({ content: `Slow down — ${secs}s cooldown`, ephemeral: true });
    }
    await cmd.execute(interaction);
  } catch (err) {
    log('error', '[commands] handler error', { error: err });
    if (interaction.isRepliable()) {
      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: 'Something went wrong.' });
      }
      return interaction.reply({ content: 'Something went wrong.', ephemeral: true });
    }
  }
});
client.on(Events.GuildCreate, () => {
  updateMonitoringPhase();
});
client.on(Events.GuildDelete, () => {
  updateMonitoringPhase();
});

async function handleRolePermissionUpdate(oldRole: Role | null, newRole: Role | null) {
  if (!oldRole || !newRole) {
    return { changed: false };
  }

  if (rolePermissionReversionsInProgress.has(newRole.id)) {
    return { changed: false, skipped: true };
  }

  const oldBitfield = oldRole.permissions?.bitfield;
  const newBitfield = newRole.permissions?.bitfield;
  if (oldBitfield === undefined || newBitfield === undefined || oldBitfield === newBitfield) {
    return { changed: false };
  }

  const guild = newRole.guild;
  const auditEntry = await lookupRolePermissionAuditEntry(guild, newRole.id);
  const executor = auditEntry?.executor ?? null;
  // PartialUser has same id/tag/username properties we need, safe to cast
  const authorization = await evaluateExecutorAuthorization(guild, executor as User | null);
  const executorSummary = executor ? describeUser(executor) : 'unknown user';

  if (authorization.authorized) {
    // DB audit trail: record authorized permission change for full visibility
    securityEventService.recordEvent({
      eventType: 'authorized-permission-change',
      severity: SecuritySeverity.INFO,
      guildId: guild.id,
      guildName: guild.name,
      roleId: newRole.id,
      roleName: newRole.name,
      executorId: executor?.id ?? 'unknown',
      executorTag: executor ? describeUser(executor) : 'unknown',
      origin: 'permission-update-monitor',
      metadata: {
        previousPermissions: oldRole.permissions.toArray(),
        newPermissions: newRole.permissions.toArray(),
        auditId: auditEntry?.id ?? null,
      },
    }).catch((err) =>
      report('Authorized Permission Change — SecurityEvent Write Error', mergeReportError({
        guild: describeGuild(guild),
        roleId: newRole.id,
      }, err), 'error'),
    );
    return { changed: true, unauthorized: false };
  }

  const meta = {
    guild: describeGuild(guild),
    role: describeRole(newRole),
    roleId: newRole.id,
    executor: executorSummary,
    executorId: executor?.id ?? null,
    auditId: auditEntry?.id ?? null,
    auditLoggedAt: auditEntry?.createdTimestamp ? new Date(auditEntry.createdTimestamp).toISOString() : null,
    authorization: authorization.reason,
    previousPermissions: oldRole.permissions.toArray(),
    attemptedPermissions: newRole.permissions.toArray(),
  };

  rolePermissionReversionsInProgress.add(newRole.id);
  scheduleCleanup(rolePermissionReversionsInProgress, newRole.id, 10_000);

  let revertError = null;
  try {
    await newRole.setPermissions(oldRole.permissions, `Security bot rollback: unauthorized permission change by ${executorSummary} (${authorization.reason})`);
  } catch (error) {
    revertError = error;
    log('error', 'Failed to revert unauthorized role permission change', mergeLogError(meta, error));
  }

  const title = `Unauthorized permission change reverted for ${describeRole(newRole)}`;
  const alertMeta: Record<string, unknown> = {
    ...meta,
    action: 'reverted',
    revertStatus: revertError ? 'failed' : 'success',
  };
  if (revertError) {
    const message = getErrorMessage(revertError);
    alertMeta.revertError = message;
    alertMeta.revertErrors = [{ action: 'setPermissions', message }];
  }

  if (dripAlertManager) {
    await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.security, title, alertMeta);
  }
  activityTracker.recordActivity('security-alert', title, alertMeta);
  updateSecurityCliSection({
    lastAlertSentAt: new Date(),
    lastAlertMessage: title,
  });

  // DB audit trail: record unauthorized permission change
  securityEventService.recordEvent({
    eventType: 'unauthorized-permission-change',
    severity: SecuritySeverity.HIGH,
    guildId: guild.id,
    guildName: guild.name,
    roleId: newRole.id,
    roleName: newRole.name,
    executorId: executor?.id ?? 'unknown',
    executorTag: executor ? describeUser(executor) : 'unknown',
    origin: 'permission-update-monitor',
    metadata: {
      previousPermissions: oldRole.permissions.toArray(),
      attemptedPermissions: newRole.permissions.toArray(),
      revertStatus: revertError ? 'failed' : 'success',
      auditId: auditEntry?.id ?? null,
    },
  }).catch((err) =>
    report('Unauthorized Permission Change — SecurityEvent Write Error', mergeReportError({
      guild: describeGuild(guild),
      roleId: newRole.id,
    }, err), 'error'),
  );

  report('Unauthorized Role Permission Change Reverted', alertMeta, 'warn');

  return { changed: true, unauthorized: true, revertStatus: alertMeta.revertStatus };
}

client.on('guildMemberAdd', async (member) => {
  const guildSummary = describeGuild(member.guild);
  const memberSummary = describeMember(member);
  report('Member Join', {
    guild: guildSummary,
    member: memberSummary
  });

  await ensureTrainerFor(member, 'member-join');

  // Check whether the rejoining member already has a per-member overwrite on
  // the moderator-only channel (e.g., they left and rejoined the server).
  // If so, grant the Gym Leader role immediately by ID — don't wait for the
  // next boot-time or periodic sync.
  try {
    const channel = member.guild.channels.cache.get(MODERATOR_ONLY_CHANNEL_ID)
      ?? await member.guild.channels.fetch(MODERATOR_ONLY_CHANNEL_ID).catch(() => null);
    if (channel && 'permissionOverwrites' in channel) {
      const overwrite = channel.permissionOverwrites.cache.get(member.id);
      if (overwrite && overwrite.type === OverwriteType.Member) {
        if (!member.roles.cache.has(GYM_LEADER_ROLE_ID)) {
          await member.roles.add(GYM_LEADER_ROLE_ID, 'Moderator-only channel access (member rejoin)');
          const botId = client.user?.id ?? 'SYSTEM';
          const botTag = client.user?.tag ?? 'SYSTEM#0000';
          const gymLeaderRole = member.guild.roles.cache.get(GYM_LEADER_ROLE_ID);
          roleAuditService.recordRoleChange({
            memberId: member.id,
            memberTag: member.user.tag,
            guildId: member.guild.id,
            guildName: member.guild.name,
            changeType: RoleChangeType.ADDITION,
            roleId: GYM_LEADER_ROLE_ID,
            roleName: gymLeaderRole?.name ?? 'Gym Leader',
            rolePosition: gymLeaderRole?.position ?? null,
            executorId: botId,
            executorTag: botTag,
            authorized: true,
            origin: 'moderator-channel-sync',
            metadata: { channelId: MODERATOR_ONLY_CHANNEL_ID, trigger: 'member-rejoin' },
          }).catch((err) =>
            report('Gym Leader Grant (rejoin) — RoleChangeAudit Write Error', mergeReportError({
              guild: guildSummary,
              userId: member.id,
            }, err), 'error'),
          );
          securityEventService.recordEvent({
            eventType: 'moderator-channel-sync',
            severity: SecuritySeverity.INFO,
            guildId: member.guild.id,
            guildName: member.guild.name,
            memberId: member.id,
            memberTag: member.user.tag,
            roleId: GYM_LEADER_ROLE_ID,
            roleName: gymLeaderRole?.name ?? 'Gym Leader',
            executorId: botId,
            executorTag: botTag,
            origin: 'moderator-channel-sync',
            metadata: { changeType: 'addition', channelId: MODERATOR_ONLY_CHANNEL_ID, trigger: 'member-rejoin' },
          }).catch((err) =>
            report('Gym Leader Grant (rejoin) — SecurityEvent Write Error', mergeReportError({
              guild: guildSummary,
              userId: member.id,
            }, err), 'error'),
          );
          report('Gym Leader Role Granted on Rejoin', {
            guild: guildSummary,
            member: memberSummary,
            channelId: MODERATOR_ONLY_CHANNEL_ID,
          });
        }
      }
    }
  } catch (err) {
    report('Gym Leader Rejoin Check Error', mergeReportError({
      guild: guildSummary,
      member: memberSummary,
    }, err), 'error');
  }
});

// Heal members who lose Trainer role (covers both roleless and members with other roles)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const result = await maybeAlertRoleAssignments(oldMember, newMember);
    if (!result?.unauthorized && isMissingTrainerRole(newMember) && !newMember.user.bot) {
      await ensureTrainerFor(newMember, 'member-update');
    }
  } catch (err) {
    report('Member Update Heal Error', mergeReportError({
      guild: describeGuild(newMember.guild),
      member: describeMember(newMember),
    }, err), 'error');
  }
});

// Track member departures — persist to DiscordMember + log security event
client.on('guildMemberRemove', async (member) => {
  const guild = member.guild;
  const guildSummary = describeGuild(guild);
  const now = new Date();
  try {
    // Mark the member record with a lastUpdatedAt bump (role list stays as-was at departure)
    await prisma.discordMember.upsert({
      where: {
        discordUserId_guildId: { discordUserId: member.id, guildId: guild.id },
      },
      update: {
        lastUpdatedAt: now,
        securityFlags: { push: 'DEPARTED' },
      },
      create: {
        discordUserId: member.id,
        guildId: guild.id,
        username: member.user?.username ?? 'unknown',
        bot: member.user?.bot ?? false,
        roles: [],
        roleCount: 0,
        highestRolePosition: 0,
        isAdministrator: false,
        isOwner: false,
        firstSeenAt: now,
        lastUpdatedAt: now,
        securityFlags: ['DEPARTED'],
      },
    });

    // Update guild member count
    await prisma.discordGuild.update({
      where: { id: guild.id },
      data: {
        memberCount: guild.memberCount ?? guild.members.cache.size,
        lastUpdatedAt: now,
      },
    }).catch(() => { /* guild row may not exist yet */ });

    report('Member Left Guild', {
      guild: guildSummary,
      user: member.user?.tag ?? member.id,
      wasBot: member.user?.bot ?? false,
    }, 'detail');
  } catch (err) {
    report('Member Remove Tracking Error', mergeReportError({
      guild: guildSummary,
      userId: member.id,
    }, err), 'error');
  }
});

// Track role creation — persist to DiscordRole + log security event
client.on('roleCreate', async (role) => {
  const guild = role.guild;
  const now = new Date();
  try {
    await prisma.discordRole.upsert({
      where: {
        discordRoleId_guildId: { discordRoleId: role.id, guildId: guild.id },
      },
      update: {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        mentionable: role.mentionable,
        managed: role.managed,
        isAdmin: role.permissions.has('Administrator'),
        isDangerous: role.permissions.has('Administrator') || role.permissions.has('BanMembers') || role.permissions.has('KickMembers'),
        memberCount: role.members.size,
        lastUpdatedAt: now,
      },
      create: {
        discordRoleId: role.id,
        guildId: guild.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        position: role.position,
        permissions: role.permissions.bitfield.toString(),
        mentionable: role.mentionable,
        managed: role.managed,
        isAdmin: role.permissions.has('Administrator'),
        isDangerous: role.permissions.has('Administrator') || role.permissions.has('BanMembers') || role.permissions.has('KickMembers'),
        memberCount: role.members.size,
        firstSeenAt: now,
        lastUpdatedAt: now,
      },
    });

    // Update guild role count
    await prisma.discordGuild.update({
      where: { id: guild.id },
      data: { roleCount: guild.roles.cache.size, lastUpdatedAt: now },
    }).catch(() => { /* guild row may not exist yet */ });

    report('Role Created', {
      guild: describeGuild(guild),
      role: describeRole(role),
      isAdmin: role.permissions.has('Administrator'),
      isDangerous: role.permissions.has('Administrator') || role.permissions.has('BanMembers') || role.permissions.has('KickMembers'),
    }, 'detail');
  } catch (err) {
    report('Role Create Tracking Error', mergeReportError({
      guild: describeGuild(guild),
      roleId: role.id,
    }, err), 'error');
  }
});

// Track role deletion — remove from DiscordRole + log security event
client.on('roleDelete', async (role) => {
  const guild = role.guild;
  const now = new Date();
  try {
    // Delete the DB row if it exists
    await prisma.discordRole.deleteMany({
      where: { discordRoleId: role.id, guildId: guild.id },
    });

    // Update guild role count
    await prisma.discordGuild.update({
      where: { id: guild.id },
      data: { roleCount: guild.roles.cache.size, lastUpdatedAt: now },
    }).catch(() => { /* guild row may not exist yet */ });

    report('Role Deleted', {
      guild: describeGuild(guild),
      roleId: role.id,
      roleName: role.name,
      wasAdmin: role.permissions.has('Administrator'),
    }, 'detail');
  } catch (err) {
    report('Role Delete Tracking Error', mergeReportError({
      guild: describeGuild(guild),
      roleId: role.id,
    }, err), 'error');
  }
});

// Heal role permissions when roles change
client.on('roleUpdate', async (oldRole, newRole) => {
  try {
    const permissionResult = await handleRolePermissionUpdate(oldRole, newRole);
    if (!permissionResult?.unauthorized) {
      await enforceRolePermissions(newRole);
    }
  } catch (err) {
    report('Role Update Heal Error', mergeReportError({
      guild: describeGuild(newRole.guild),
      role: describeRole(newRole),
    }, err), 'error');
  }
});

// ── Drip Role: apply overwrite immediately on every new channel ──────────────
client.on('channelCreate', async (channel) => {
  try {
    await ensureDripRoleOnChannel(channel as unknown as GuildChannel, 'channelCreate');
  } catch (err) {
    report('Drip Channel Overwrite Error (channelCreate)', mergeReportError({ channelId: channel.id }, err), 'error');
  }
});

// ── Drip Role: detect and restore tampered overwrites ────────────────────────
// The Drip role's channel overwrite must persist regardless of other conditions.
// If an unauthorized actor removes or weakens it the bot restores it instantly.
// Authorized actors (bot · DRIPTVDD · guild owner) who need to exclude a specific
// channel should add it to DRIP_ROLE_EXCLUDE_CHANNEL_IDS instead.
client.on('channelUpdate', async (oldChannel, newChannel) => {
  if (!('guild' in newChannel) || !('guild' in oldChannel)) return;
  if (DRIP_ROLE_EXCLUDE_CHANNEL_IDS.has(newChannel.id)) return;
  if ((newChannel as GuildChannel).isThread()) return;

  const oldOverwrite = oldChannel.permissionOverwrites.cache.get(DRIP_ROLE_ID);
  const newOverwrite = newChannel.permissionOverwrites.cache.get(DRIP_ROLE_ID);

  // Was the Drip overwrite previously in a correct state?
  const wasCorrect = Boolean(
    oldOverwrite &&
    oldOverwrite.allow.has(DRIP_REQUIRED_BITS) &&
    !oldOverwrite.deny.any(DRIP_REQUIRED_BITS),
  );
  // Is it still correct now?
  const isCorrect = Boolean(
    newOverwrite &&
    newOverwrite.allow.has(DRIP_REQUIRED_BITS) &&
    !newOverwrite.deny.any(DRIP_REQUIRED_BITS),
  );

  if (!wasCorrect || isCorrect) return; // Nothing to heal

  // Overwrite was correct before and is now degraded — check executor.
  const guild = newChannel.guild;
  let executorId: string | null = null;
  try {
    // Fetch recent audit log entries for channel overwrite changes.
    const auditTypes = [AuditLogEvent.ChannelOverwriteDelete, AuditLogEvent.ChannelOverwriteUpdate] as const;
    for (const auditType of auditTypes) {
      if (executorId) break;
      try {
        const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 });
        for (const [, entry] of logs.entries) {
          const t = entry.target;
          if (t && typeof t === 'object' && 'id' in t && (t as { id: string }).id === newChannel.id) {
            executorId = entry.executor?.id ?? null;
            break;
          }
        }
      } catch { /* audit log entry may not exist yet */ }
    }
  } catch { /* audit log unavailable — fall through to restore */ }

  if (isAuthorizedDripActor(executorId, guild)) {
    report('Drip Channel Overwrite Modified by Authorized Actor — Skipping Restore', {
      channel: newChannel.id, channelName: newChannel.name,
      guild: describeGuild(guild), executorId,
    }, 'info');
    return;
  }

  // Unauthorized modification — restore and alert.
  report('Drip Channel Overwrite Tampered — Restoring', {
    channel: newChannel.id, channelName: newChannel.name,
    guild: describeGuild(guild), executorId: executorId ?? 'unknown',
  }, 'warn');
  await ensureDripRoleOnChannel(newChannel as unknown as GuildChannel, 'channelUpdate-tamper-restore');
  if (dripAlertManager) {
    await dripAlertManager.recordAlert(
      DRIP_ALERT_SEVERITY.security,
      `Drip role overwrite tampered in #${newChannel.name} — restored`,
      { channelId: newChannel.id, channelName: newChannel.name,
        guild: describeGuild(guild), executorId: executorId ?? 'unknown' },
    );
  }
  securityEventService.recordEvent({
    eventType: 'drip-channel-tamper',
    severity: SecuritySeverity.HIGH,
    guildId: guild.id,
    guildName: guild.name,
    executorId: executorId ?? 'unknown',
    origin: 'drip-tamper-restore',
    metadata: { channelId: newChannel.id, channelName: newChannel.name, action: 'tamper-detected-restored' },
  }).catch((err) =>
    report('Drip Channel Tamper — SecurityEvent Write Error', mergeReportError({ channelId: newChannel.id }, err), 'error'),
  );
  activityTracker.recordActivity(
    'security-alert',
    `Drip overwrite tampered in #${newChannel.name} — restored`,
    { channelId: newChannel.id, channelName: newChannel.name, guild: describeGuild(guild), executorId: executorId ?? 'unknown' },
  );
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author?.bot) return;
  if (message.guildId) return;
  if (!canUseDirectStatusCommand(message.author.id)) return;

  const consoleCtx = buildConsoleContext();
  await handleDmMessage(message, consoleCtx);
});

// Sync Gym Leader role when members are added to or removed from the
// moderator-only channel (👑moderator-only👑, ID: MODERATOR_ONLY_CHANNEL_ID).
// Adding a per-member overwrite to that channel → grant Gym Leader role.
// Removing a per-member overwrite from that channel → strip Gym Leader role.
client.on('channelUpdate', async (oldChannel, newChannel) => {
  if (newChannel.id !== MODERATOR_ONLY_CHANNEL_ID) return;

  // DM channels carry no permission overwrites — bail out early.
  if (!('guild' in newChannel) || !('guild' in oldChannel)) return;

  const guild = newChannel.guild;
  const oldOverwrites = oldChannel.permissionOverwrites.cache;
  const newOverwrites = newChannel.permissionOverwrites.cache;

  // Member overwrites added (present in new, absent in old)
  const added = [...newOverwrites.values()].filter(
    (ow) => ow.type === OverwriteType.Member && !oldOverwrites.has(ow.id),
  );

  // Member overwrites removed (present in old, absent in new)
  const removed = [...oldOverwrites.values()].filter(
    (ow) => ow.type === OverwriteType.Member && !newOverwrites.has(ow.id),
  );

  const botId = client.user?.id ?? 'SYSTEM';
  const botTag = client.user?.tag ?? 'SYSTEM#0000';
  const gymLeaderRole = guild.roles.cache.get(GYM_LEADER_ROLE_ID);
  const gymLeaderRoleName = gymLeaderRole?.name ?? 'Gym Leader';
  const gymLeaderRolePosition = gymLeaderRole?.position ?? null;

  for (const ow of added) {
    try {
      const member = await guild.members.fetch(ow.id);
      // Idempotency: member was already given the role by a previous event or
      // a concurrent sync run. Skip the API call and audit record to avoid
      // duplicates and confusing log noise.
      if (member.roles.cache.has(GYM_LEADER_ROLE_ID)) {
        report('Gym Leader Role Already Held — Skipping Grant', {
          guild: describeGuild(guild),
          userId: ow.id,
        }, 'info');
        continue;
      }
      await member.roles.add(GYM_LEADER_ROLE_ID, 'Moderator-only channel access granted');
      report('Gym Leader Role Granted', {
        guild: describeGuild(guild),
        userId: ow.id,
        channelId: newChannel.id,
        channelName: newChannel.name,
      });
      // Write RoleChangeAudit + SecurityEvent with full channel context and proper origin tag.
      // (guildMemberUpdate will fire the DRIP notice and activityTracker entry automatically.)
      roleAuditService.recordRoleChange({
        memberId: member.id,
        memberTag: member.user.tag,
        guildId: guild.id,
        guildName: guild.name,
        changeType: RoleChangeType.ADDITION,
        roleId: GYM_LEADER_ROLE_ID,
        roleName: gymLeaderRoleName,
        rolePosition: gymLeaderRolePosition,
        executorId: botId,
        executorTag: botTag,
        authorized: true,
        origin: 'moderator-channel-sync',
        metadata: { channelId: newChannel.id, channelName: newChannel.name, trigger: 'channel-update' },
      }).catch((err) =>
        report('Gym Leader Grant — RoleChangeAudit Write Error', mergeReportError({
          guild: describeGuild(guild),
          userId: ow.id,
        }, err), 'error'),
      );
      securityEventService.recordEvent({
        eventType: 'moderator-channel-sync',
        severity: SecuritySeverity.INFO,
        guildId: guild.id,
        guildName: guild.name,
        memberId: member.id,
        memberTag: member.user.tag,
        roleId: GYM_LEADER_ROLE_ID,
        roleName: gymLeaderRoleName,
        executorId: botId,
        executorTag: botTag,
        origin: 'moderator-channel-sync',
        metadata: { changeType: 'addition', channelId: newChannel.id, channelName: newChannel.name },
      }).catch((err) =>
        report('Gym Leader Grant — SecurityEvent Write Error', mergeReportError({
          guild: describeGuild(guild),
          userId: ow.id,
        }, err), 'error'),
      );
    } catch (err) {
      report('Gym Leader Role Grant Error', mergeReportError({
        guild: describeGuild(guild),
        userId: ow.id,
      }, err), 'error');
    }
  }

  for (const ow of removed) {
    try {
      const member = await guild.members.fetch(ow.id);
      // Idempotency: member never held the role or it was already removed.
      // Skip to avoid a no-op Discord API call and a spurious audit record.
      if (!member.roles.cache.has(GYM_LEADER_ROLE_ID)) {
        report('Gym Leader Role Not Held — Skipping Revoke', {
          guild: describeGuild(guild),
          userId: ow.id,
        }, 'info');
        continue;
      }
      await member.roles.remove(GYM_LEADER_ROLE_ID, 'Moderator-only channel access revoked');
      report('Gym Leader Role Revoked', {
        guild: describeGuild(guild),
        userId: ow.id,
        channelId: newChannel.id,
        channelName: newChannel.name,
      });
      // Write RoleChangeAudit + SecurityEvent with full channel context and proper origin tag.
      // (guildMemberUpdate will fire the DRIP notice and activityTracker entry automatically.)
      roleAuditService.recordRoleChange({
        memberId: member.id,
        memberTag: member.user.tag,
        guildId: guild.id,
        guildName: guild.name,
        changeType: RoleChangeType.REMOVAL,
        roleId: GYM_LEADER_ROLE_ID,
        roleName: gymLeaderRoleName,
        rolePosition: gymLeaderRolePosition,
        executorId: botId,
        executorTag: botTag,
        authorized: true,
        origin: 'moderator-channel-sync',
        metadata: { channelId: newChannel.id, channelName: newChannel.name, trigger: 'channel-update' },
      }).catch((err) =>
        report('Gym Leader Revoke — RoleChangeAudit Write Error', mergeReportError({
          guild: describeGuild(guild),
          userId: ow.id,
        }, err), 'error'),
      );
      securityEventService.recordEvent({
        eventType: 'moderator-channel-sync',
        severity: SecuritySeverity.INFO,
        guildId: guild.id,
        guildName: guild.name,
        memberId: member.id,
        memberTag: member.user.tag,
        roleId: GYM_LEADER_ROLE_ID,
        roleName: gymLeaderRoleName,
        executorId: botId,
        executorTag: botTag,
        origin: 'moderator-channel-sync',
        metadata: { changeType: 'removal', channelId: newChannel.id, channelName: newChannel.name },
      }).catch((err) =>
        report('Gym Leader Revoke — SecurityEvent Write Error', mergeReportError({
          guild: describeGuild(guild),
          userId: ow.id,
        }, err), 'error'),
      );
    } catch (err) {
      report('Gym Leader Role Revoke Error', mergeReportError({
        guild: describeGuild(guild),
        userId: ow.id,
      }, err), 'error');
    }
  }
});

// ----- Alerting -----
function extractUserIdLike(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = String(input).trim();
  // <@123> or <@!123>
  const mention = trimmed.match(/<@!?([0-9]{5,})>/);
  if (mention) return mention[1];
  // pure numeric
  if (/^[0-9]{5,}$/.test(trimmed)) return trimmed;
  return null; // not an ID-like string
}

async function resolveAlertUser(spec: string | null | undefined): Promise<User | null> {
  // Try direct ID first (including mention format)
  const idFromSpec = extractUserIdLike(spec);
  if (idFromSpec) {
    try {
      return await client.users.fetch(idFromSpec);
    } catch (error) {
      log('warn', 'Alert user fetch failed by ID', mergeLogError({
        spec,
        attemptedId: idFromSpec,
      }, error));
    }
  }

  const needle = normalizeString(String(spec));
  // Try exact tag match (username#discriminator)
  for (const [, user] of client.users.cache) {
    if ((user.tag && user.tag.toLowerCase() === needle) || user.username.toLowerCase() === needle) {
      return user;
    }
  }

  // Search guild members if not found in user cache
  for (const [, guild] of client.guilds.cache) {
    try {
      const members = await ensureGuildMembersCached(guild, { origin: 'alert-resolve' });
      for (const [, member] of members) {
        const u = member.user;
        if ((u.tag && u.tag.toLowerCase() === needle) || u.username.toLowerCase() === needle || member.displayName.toLowerCase() === needle) {
          return u;
        }
      }
    } catch (error) {
      log('warn', 'Alert user resolution failed during guild scan', mergeLogError({
        spec,
        guild: describeGuild(guild),
      }, error));
    }
  }
  return null;
}

dripAlertManager = createDripAlertManager({
  recipient: DRIP_ALERT_RECIPIENT,
  resolveAlertUser,
  describeUser: describeUser as unknown as DescribeUserFunction,
  log,
  recordActivity: (type, summary, meta) => activityTracker.recordActivity(type, summary, meta),
  timeZone: DRIP_ALERT_TIMEZONE,
  digestHour: DRIP_ALERT_HOUR,
  digestMinute: DRIP_ALERT_MINUTE,
});

interface SecurityAlertMeta {
  guild?: string;
  role?: string;
  [key: string]: unknown;
}

async function sendSecurityAlert(title: string, meta: SecurityAlertMeta = {}) {
  try {
    const text = `🔒 ${title}`;
    const body = {
      title: text,
      ...meta,
      at: new Date().toISOString()
    };

    const summaryDetails = [];
    if (meta.guild) summaryDetails.push(meta.guild);
    if (meta.role) summaryDetails.push(meta.role);
    const summarySuffix = summaryDetails.length ? ` — ${summaryDetails.join(' • ')}` : '';
    activityTracker.recordActivity('security-alert', `${title}${summarySuffix}`, {
      destinations: {
        webhook: Boolean(ALERT_WEBHOOK_URL),
        channel: ALERT_CHANNEL_ID || 'unset',
        user: ALERT_USER_ID || 'unset',
      },
      meta,
    });

    // 1) Webhook
    if (ALERT_WEBHOOK_URL) {
      try {
        const url = new URL(ALERT_WEBHOOK_URL);
        const data = JSON.stringify(body);
        const opts = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        };
        await new Promise((resolve, reject) => {
          const req = https.request(url, opts, (res) => {
            res.on('data', () => {});
            res.on('end', resolve);
          });
          req.on('error', reject);
          req.write(data);
          req.end();
        });
      } catch (e) {
        log('error', 'Security alert webhook delivery failed', mergeLogError({
          destination: 'webhook',
          url: ALERT_WEBHOOK_URL,
        }, e));
      }
    }

    // 2) Channel message
    if (ALERT_CHANNEL_ID) {
      try {
        const ch = await client.channels.fetch(ALERT_CHANNEL_ID);
        if (ch && ch.isTextBased() && 'send' in ch) {
          await ch.send(`${text}\n${'```'}json\n${JSON.stringify(body, null, 2)}\n${'```'}`);
        }
      } catch (e) {
        log('error', 'Security alert channel delivery failed', mergeLogError({
          destination: 'channel',
          channelId: ALERT_CHANNEL_ID,
        }, e));
      }
    }

    // 3) Direct message to a user
    if (ALERT_USER_ID) {
      try {
        const user = await resolveAlertUser(ALERT_USER_ID);
        if (user && typeof user.send === 'function') {
          await user.send(`${text}\n${'```'}json\n${JSON.stringify(body, null, 2)}\n${'```'}`);
        }
      } catch (e) {
        log('error', 'Security alert DM delivery failed', mergeLogError({
          destination: 'dm',
          recipient: ALERT_USER_ID,
        }, e));
      }
    }

    if (dripAlertManager) {
      await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.security, title, body);
    }
  } catch (error) {
    log('error', 'Security alert dispatch failed', mergeLogError({
      title,
      meta,
    }, error));
  }
}

// Normalize and validate token early for clearer errors (especially on Render)
function normalizeToken(rawToken: string | undefined | null): string {
  if (!rawToken) return '';
  const value = String(rawToken).trim();
  if (!value) return '';
  return value.startsWith('Bot ') ? value.slice(4).trim() : value;
}

interface StartSecurityBotOptions {
  token?: string;
}

function startSecurityBot({ token: tokenOverride }: StartSecurityBotOptions = {}) {
  const envPath = path.resolve(process.cwd(), '.env');
  const rawToken = tokenOverride !== undefined ? tokenOverride : BOT_TOKEN;
  const token = normalizeToken(rawToken);

  if (!token) {
    const hasDotEnv = fs.existsSync(envPath);
    const error: ErrorWithCode = new Error('Security bot token missing. Set SECURITY_BOT_TOKEN or BOT_TOKEN.');
    report('Configuration Error', {
      message: 'BOT_TOKEN is missing. Set it in your environment or .env (without quotes or the "Bot " prefix).',
      workingDirectory: process.cwd(),
      envFilePresent: hasDotEnv ? 'yes' : 'no',
      envFilePath: envPath,
      quickTest: '$env:BOT_TOKEN = "your_token_here"'
    }, 'error');
    error.code = 'MISSING_SECURITY_TOKEN';
    throw error;
  }

  if (loginPromise) {
    return loginPromise;
  }

  report('Login Start', {});
  cliStatus.setPhase('Connecting to Discord');
  updateSecurityCliSection({ status: 'Connecting to Discord' });
  loginPromise = client.login(token);
  loginPromise.catch(() => {
    loginPromise = null;
  });
  return loginPromise;
}

const entryHref = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (entryHref && import.meta.url === entryHref) {
  startSecurityBot().catch((error) => {
    log('error', 'Security bot startup failed', mergeLogError({}, error));
    process.exit(1);
  });
  
  // Graceful shutdown hooks for state persistence
  async function handleShutdown(signal: string) {
    log('info', '[State] Received signal, saving state before exit', { signal });
    if (autoSaveInterval) {
      stopAutoSave(autoSaveInterval);
    }
    if (botState) {
      await shutdownState(botState, signal);
    }
    log('info', '[State] Shutdown complete');
    process.exit(0);
  }
  
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('uncaughtException', async (error) => {
    log('error', '[State] Uncaught exception, saving state', { error });
    if (autoSaveInterval) {
      stopAutoSave(autoSaveInterval);
    }
    if (botState) {
      await shutdownState(botState, 'uncaughtException');
    }
    process.exit(1);
  });
}

export { startSecurityBot, client, botState };

export default { startSecurityBot, client, botState };
