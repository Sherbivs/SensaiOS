import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client, GatewayIntentBits, Partials, Events, Collection, AuditLogEvent, PermissionsBitField } from 'discord.js';

import { loadCommands } from '../command-loader.js';
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
  ROLE_ID,
  BACKFILL_CONCURRENCY,
  BACKFILL_DELAY_MS,
  BACKFILL_INTERVAL_SECONDS,
  ROLE_REMEDIATION_INTERVAL_SECONDS,
  CACHE_TTL_HOURS,
  ENABLE_CONTINUOUS_SWEEP,
  OPS_REPORT_INTERVAL_SECONDS,
  STANDARD_ENFORCE_ALL,
  UNLISTED_PERMISSIONS,
  STANDARD_EXEMPT_ROLES,
  STANDARD_ALL_PERMS_ROLES,
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
import { log as baseLog, report } from '../utils/logger.js';
import opsNotifier from '../utils/opsNotifier.js';

import { createDripAlertManager, DRIP_ALERT_SEVERITY } from './dripAlerts.js';
import { initializeGuild, buildRestartSummary } from './state/context.js';
import { initializeState, saveState, shutdownState, startAutoSave, stopAutoSave } from './state/persistence.js';
import { recordSweep, recordPermissionChange, recordAlert, recordError, recordMemberFetchTimeout, updateDatabaseStatus, getStatsSummary, getRecentEvents } from './state/stats.js';
import { getRecentActivitySummary } from './state/timeline.js';

// Escalate CLI warnings if sweeps lag and keep idle background cadence predictable.
const CLI_SWEEP_WARNING_THRESHOLD_SECONDS = 5 * 60;
const CONTINUOUS_SWEEP_IDLE_DELAY_MS = 15_000;
const MEMBER_STATS_REFRESH_INTERVAL_MS = 60_000;

// Auto-adjusting timeout for GuildMembersTimeout errors
// Increases by 250ms each time a timeout occurs, persists across restarts
// On Render with persistent disk mounted at /Store
// Locally falls back to Store/ in project directory
const TIMEOUT_CONFIG_FILE = process.env.RENDER
  ? '/Store/guild-member-timeout-config.json'
  : './Store/guild-member-timeout-config.json';
const DEFAULT_TIMEOUT_MS = 120_000;
const TIMEOUT_INCREMENT_MS = 250;
const MIN_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000; // 5 minutes max

// Load timeout from persistent config
function loadTimeoutConfig() {
  try {
    if (fs.existsSync(TIMEOUT_CONFIG_FILE)) {
      const data = fs.readFileSync(TIMEOUT_CONFIG_FILE, 'utf8');
      const config = JSON.parse(data);
      if (config.timeoutMs && typeof config.timeoutMs === 'number') {
        const clamped = Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, config.timeoutMs));
        baseLog('info', `[timeout-config] Loaded: ${clamped}ms (adjustments: ${config.adjustments || 0}, last: ${config.lastAdjusted || 'never'})`, {}, { debugMode: CLI_DEBUG_MODE });
        return clamped;
      }
    }
  } catch (err) {
    baseLog('warn', '[timeout-config] Failed to load, using default:', { error: err.message }, { debugMode: CLI_DEBUG_MODE });
  }
  return DEFAULT_TIMEOUT_MS;
}

// Save timeout to persistent config
function saveTimeoutConfig(timeoutMs, reason = 'manual') {
  try {
    const dir = path.dirname(TIMEOUT_CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    let adjustments = 0;
    try {
      if (fs.existsSync(TIMEOUT_CONFIG_FILE)) {
        const existing = JSON.parse(fs.readFileSync(TIMEOUT_CONFIG_FILE, 'utf8'));
        adjustments = (existing.adjustments || 0) + 1;
      }
    } catch {}
    
    const config = {
      timeoutMs,
      adjustments,
      lastAdjusted: new Date().toISOString(),
      reason,
      history: [],
    };
    
    // Load history if exists
    try {
      if (fs.existsSync(TIMEOUT_CONFIG_FILE)) {
        const existing = JSON.parse(fs.readFileSync(TIMEOUT_CONFIG_FILE, 'utf8'));
        if (Array.isArray(existing.history)) {
          config.history = existing.history.slice(-10); // Keep last 10
        }
      }
    } catch {}
    
    config.history.push({
      timestamp: new Date().toISOString(),
      timeoutMs,
      reason,
    });
    
    fs.writeFileSync(TIMEOUT_CONFIG_FILE, JSON.stringify(config, null, 2));
    log.info(`[timeout-config] Saved: ${timeoutMs}ms (reason: ${reason}, total adjustments: ${adjustments})`);
  } catch (err) {
    log.error('[timeout-config] Failed to save:', err.message);
  }
}

// Auto-increment timeout on error
function incrementTimeout(currentTimeout, reason = 'timeout_error') {
  const newTimeout = Math.min(MAX_TIMEOUT_MS, currentTimeout + TIMEOUT_INCREMENT_MS);
  if (newTimeout > currentTimeout) {
    log.info(`[timeout-config] Auto-incrementing: ${currentTimeout}ms → ${newTimeout}ms (+${TIMEOUT_INCREMENT_MS}ms) - ${reason}`);
    saveTimeoutConfig(newTimeout, reason);
    return newTimeout;
  }
  log.info(`[timeout-config] Already at maximum (${MAX_TIMEOUT_MS}ms), not incrementing`);
  return currentTimeout;
}

// Initialize timeout from config
let GUILD_MEMBER_FETCH_CHUNK_TIMEOUT_MS = loadTimeoutConfig();

const GUILD_MEMBER_FETCH_CHUNK_RETRIES = 3; // Increased from 2 to 3 for better resilience
const GUILD_MEMBER_FETCH_PAGE_LIMIT = 1_000;
const GUILD_MEMBER_FETCH_MAX_PAGES = 200;
const GUILD_MEMBER_FETCH_REST_DELAY_MS = 250;

// Warm the disk cache on boot so CLI telemetry reflects current assignments.
cache.cleanOldCache();

cliStatus.startStatusDisplay();
cliStatus.setPhase('Booting');
cliStatus.setGuildCount(0);

const log = (level, message, context) => baseLog(level, message, context, { debugMode: CLI_DEBUG_MODE });

installFatalErrorHandlers({ log, report });
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.User]
});
// Load slash commands (optional; safe if none present)
let commands = null;
try {
  commands = await loadCommands();
  if (commands && commands.size > 0) {
    // Attach to client for convenience
    client.commands = new Collection([...commands.entries()]);
  }
} catch (err) {
  log.warn('[commands] loader failed:', err?.message || err);
}

const GUILD_MEMBERS_TIMEOUT_FRAGMENT = "Members didn't arrive in time.";

function isGuildMembersTimeout(error) {
  if (!error) return false;
  const code = error.code || error.name;
  if (code === 'GuildMembersTimeout') {
    return true;
  }
  const message = typeof error.message === 'string' ? error.message : String(error);
  return message.includes(GUILD_MEMBERS_TIMEOUT_FRAGMENT);
}

async function ensureGuildMembersCached(guild, options = {}) {
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

  let chunkAttempts = 0;
  let chunkSucceeded = false;

  while (chunkAttempts < Math.max(1, chunkRetries)) {
    chunkAttempts += 1;
    try {
      await guild.members.fetch({ time: chunkTimeoutMs });
      chunkSucceeded = true;
      break;
    } catch (error) {
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
          recordMemberFetchTimeout(botState, guild.id, guildSummary, origin, chunkAttempts, chunkRetries);
        } catch (err) {
          // Don't fail the sweep if state recording fails
          log('debug', 'Failed to record member fetch timeout in state', { err: err?.message });
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

  let after;
  let previousAfter;
  let newlyFetched = 0;
  let pages = 0;
  let fallbackUsed = false;

  while (pages < maxPages) {
    const pageOptions = { limit: pageLimit };
    if (after) {
      pageOptions.after = after;
    }

    const batch = await guild.members.fetch(pageOptions);
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
let loginPromise = null;
let dripAlertManager = null;
let botState = null;
let autoSaveInterval = null;

const describeRole = (role) => `${role.name} (#${role.id})`;
const describeMember = (member) => `${member.user.tag} (#${member.id})`;
const describeGuild = (guild) => `${guild.name} (#${guild.id})`;
const describeUser = (user) => {
  if (!user) return 'unknown user';
  const tag = user.tag || user.username || 'unknown';
  return `${tag} (#${user.id})`;
};

const securityCliState = {
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

const continuousSweepState = {
  running: false,
  abortController: null,
  loopPromise: null,
};

const pendingOpsErrorQueue = [];
const deliveredOpsErrorIds = new Set();
let deliveringOpsErrors = false;
let opsErrorRetryTimer = null;
let memberStatsInterval = null;
let memberStatsRefreshing = false;

const memberRoleReversionsInProgress = new Set();
const rolePermissionReversionsInProgress = new Set();

function scheduleCleanup(container, key, ttlMs = 5000) {
  const timer = setTimeout(() => {
    container.delete(key);
  }, ttlMs);
  timer.unref?.();
}

function isClientReady() {
  if (typeof client.isReady === 'function') {
    return client.isReady();
  }
  return Boolean(client.readyAt);
}

function formatDurationShort(ms) {
  if (!Number.isFinite(ms) || ms <= 0) {
    return '0s';
  }
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 48) {
    return `${totalHours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

function describeMomentForCli(value) {
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
  return `${date.toLocaleString()} (${relative})`;
}

async function refreshMemberStats(reason = 'unspecified') {
  if (memberStatsRefreshing || !isClientReady()) {
    return;
  }

  memberStatsRefreshing = true;
  try {
    const snapshot = {
      totalMembers: 0,
      totalWithRole: 0,
      guilds: [],
      updatedAt: new Date(),
      partial: false,
      reason,
    };

    for (const [, guild] of client.guilds.cache) {
      const guildSummary = describeGuild(guild);
      const memberCount = Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size;
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
        } else if (typeof role.memberCount === 'number') {
          roleCount = role.memberCount;
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
      snapshot.totalWithRole += roleCount;
      snapshot.guilds.push({
        guildId: guild.id,
        guild: guildSummary,
        memberCount,
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

function bumpRoleMemberCount(guild, delta = 1) {
  if (!guild || !Number.isFinite(delta) || delta === 0) {
    return;
  }
  const stats = securityCliState.memberStats;
  const updatedAt = new Date();
  if (!stats) {
    securityCliState.memberStats = {
      totalMembers: Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size,
      totalWithRole: Math.max(0, delta),
      guilds: [{
        guildId: guild.id,
        guild: describeGuild(guild),
        memberCount: Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size,
        roleCount: Math.max(0, delta),
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
  let entry = stats.guilds.find((item) => item.guildId === guild.id);
  if (!entry) {
    entry = {
      guildId: guild.id,
      guild: describeGuild(guild),
      memberCount: Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size,
      roleCount: 0,
      complete: false,
    };
    stats.guilds.push(entry);
  }
  entry.guild = describeGuild(guild);
  entry.memberCount = Number.isFinite(guild.memberCount) ? guild.memberCount : guild.members.cache.size;
  entry.roleCount = Math.max(0, entry.roleCount + delta);
  entry.complete = false;
  updateSecurityCliSection({});
}

function updateSecurityCliSection(overrides = {}) {
  Object.assign(securityCliState, overrides);
  const metrics = [];
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
    if (Number.isFinite(securityCliState.lastSweepDurationMs)) {
      metrics.push(['sweep duration', formatDurationShort(securityCliState.lastSweepDurationMs)]);
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
    const coverageRatio = stats.totalMembers > 0 ? stats.totalWithRole / stats.totalMembers : 0;
    metrics.push(['role coverage', `${stats.totalWithRole}/${stats.totalMembers || 0}`]);
    metrics.push(['coverage %', `${(coverageRatio * 100).toFixed(coverageRatio >= 0.1 ? 1 : 2)}%${stats.partial ? ' (est)' : ''}`]);
    const guildSummaryParts = stats.guilds
      .slice(0, 3)
      .map((entry) => {
        const suffix = entry.complete ? '' : ' (est)';
        const memberTotal = entry.memberCount || 0;
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
      displayStatus = `Warning: sweeps stale (${formatDurationShort(elapsed)})`;
    }
  }

  cliStatus.setSection('security', {
    title: 'Security Bot',
    status: displayStatus,
    metrics,
  });
}

function beginSecuritySweep(guild, origin) {
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

function completeSecuritySweep({ startedAt, assigned = 0, failed = 0, candidates = 0, reason = 'completed' }) {
  const completedAt = new Date();
  const durationMs = startedAt instanceof Date ? completedAt - startedAt : null;
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

function safeSerialize(value, limit = 1800) {
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
  } catch (error) {
    return undefined;
  }
}

function buildOpsErrorMeta(event) {
  const meta = {
    id: event.id,
    occurredAt: event.timestamp instanceof Date ? event.timestamp.toISOString() : new Date().toISOString(),
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

function scheduleOpsErrorRetry() {
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

function queueOpsError(event) {
  if (!event || event.skipAlert || event.source === 'drip-alerts') {
    return;
  }
  if (deliveredOpsErrorIds.has(event.id)) {
    return;
  }
  if (pendingOpsErrorQueue.some((item) => item.id === event.id)) {
    return;
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
            deliveredOpsErrorIds.add(event.id);
          }
          break;
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
  opsNotifier.subscribe(queueOpsError);
  if (typeof opsNotifier.getRecentErrors === 'function') {
    opsNotifier.getRecentErrors().forEach(queueOpsError);
  }
}

updateSecurityCliSection();

function mergeLogError(base, error) {
  if (error instanceof Error) {
    return {
      ...base,
      error,
    };
  }
  if (error === undefined || error === null) {
    return { ...base, error: String(error) };
  }
  return {
    ...base,
    error: String(error),
  };
}

function mergeReportError(base, error) {
  if (error instanceof Error) {
    const details = {
      ...base,
      errorMessage: error.message,
    };
    if (error.code !== undefined) {
      details.errorCode = error.code;
    }
    if (error.stack) {
      details.errorStack = error.stack;
    }
    return details;
  }
  if (error === undefined || error === null) {
    return { ...base, error: String(error) };
  }
  return {
    ...base,
    error: String(error),
  };
}

function extractAuditRoleIds(change) {
  if (!change) {
    return [];
  }
  const candidates = [];
  if (Array.isArray(change.new)) {
    candidates.push(...change.new);
  }
  if (Array.isArray(change.old)) {
    candidates.push(...change.old);
  }
  return candidates
    .map((item) => (item && typeof item.id === 'string' ? item.id : null))
    .filter(Boolean);
}

async function evaluateExecutorAuthorization(guild, executor) {
  if (!guild || !executor) {
    return { authorized: false, reason: 'unknown-executor', member: null };
  }

  const botId = client?.user?.id;
  if (botId && executor.id === botId) {
    return { authorized: true, reason: 'security-bot', member: guild.members.me ?? null };
  }

  if (guild.ownerId === executor.id) {
    let ownerMember = guild.members.cache.get(executor.id) || null;
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

  let member = guild.members.cache.get(executor.id) || null;
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

  return {
    authorized: false,
    reason: member ? 'insufficient-permissions' : 'member-unavailable',
    member,
  };
}

async function revertMemberRoles(member, { rolesToRemove = [], rolesToAdd = [], reason = 'Security bot rollback' } = {}) {
  if (!member) {
    return {
      success: false,
      removed: [],
      added: [],
      errors: [{ action: 'validation', message: 'member-unavailable' }],
    };
  }

  const normalize = (input) => {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((role) => {
        if (!role) return null;
        if (typeof role === 'string') return role;
        return role.id || null;
      })
      .filter(Boolean);
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
        message: error instanceof Error ? error.message : String(error),
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
        message: error instanceof Error ? error.message : String(error),
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
    return { success: true, removed: removeIds, added: addIds };
  }

  return {
    success: false,
    removed: removeIds,
    added: addIds,
    errors,
  };
}

async function wait(ms, signal) {
  const delay = Number(ms);
  if (!Number.isFinite(delay) || delay <= 0) {
    return;
  }
  await new Promise((resolve) => {
    let timeout;
    const onAbort = () => {
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

function getContinuousSweepGuilds(signal, transformer) {
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
      return transformed.filter(Boolean);
    }
    if (transformed instanceof Collection) {
      return Array.from(transformed.values()).filter(Boolean);
    }
    if (typeof transformed[Symbol.iterator] === 'function') {
      return Array.from(transformed).filter(Boolean);
    }
    return base;
  } catch (error) {
    log('warn', 'Continuous sweep transformer failed', mergeLogError({
      guildCount: base.length,
    }, error));
    return base;
  }
}

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
  const hasBudget = cache && typeof cache.getCacheBudget === 'function';
  const budget = hasBudget ? cache.getCacheBudget() : { approxBytes: 0, maxAllowedBytes: 0, percent: cache && cache.MAX_CACHE_PERCENT ? cache.MAX_CACHE_PERCENT : 0.25 };
  const cacheSize = (cache && typeof cache.getCacheSize === 'function') ? cache.getCacheSize() : 0;
  const mem = process.memoryUsage();

  log('info', '=== Cache & Resource Report ===', {
    at: where,
    cacheDir: cache && cache.CACHE_DIR ? cache.CACHE_DIR : 'unknown',
    cacheSize: formatBytes(cacheSize),
    cacheBudgetMax: formatBytes(budget.maxAllowedBytes),
    cacheBudgetPercent: `${Math.round(budget.percent * 100)}% of approx free`,
    approxFree: formatBytes(budget.approxBytes),
    workspaceLimit: budget.workspaceLimitBytes ? formatBytes(budget.workspaceLimitBytes) : 'unknown',
    diskFree: budget.diskFreeBytes ? formatBytes(budget.diskFreeBytes) : 'unknown',
    diskTotal: budget.diskTotalBytes ? formatBytes(budget.diskTotalBytes) : 'unknown',
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

const ACTIVITY_LABELS = Object.freeze({
  'role-assignment': 'Role assignments',
  'role-permissions-healed': 'Permission heals',
  'security-alert': 'Security alerts',
  'drip-alert-critical': 'Critical DM alerts',
  'drip-alert-warning': 'Queued DM alerts',
  'drip-alert-digest': 'Alert digests',
});

let summaryTimer = null;

function msUntilNextReport(hour, minute) {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

function formatSummaryReport(entries, generatedAt) {
  const headerDate = generatedAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const headerTime = generatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const header = `🛡️ Daily Security Summary — ${headerDate} @ ${headerTime}`;
  if (!entries || entries.length === 0) {
    return `${header}\n\nNo role assignments or permission changes were recorded since the previous summary.\nMonitoring remains active.`;
  }

  const counts = entries.reduce((acc, entry) => {
    acc[entry.type] = (acc[entry.type] || 0) + 1;
    return acc;
  }, {});

  const totals = Object.entries(counts)
    .map(([type, count]) => `• ${ACTIVITY_LABELS[type] || type}: ${count}`)
    .join('\n');

  const details = entries
    .map((entry) => {
      const when = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `• ${when} — ${entry.summary}`;
    })
    .join('\n');

  return `${header}\n\nTotals:\n${totals}\n\nDetails:\n${details}`;
}

async function sendDailySummaryReport() {
  const pending = activityTracker.getPendingActivities();
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
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function scheduleDailySummaryReports() {
  if (summaryTimer) {
    clearTimeout(summaryTimer);
  }
  const delay = msUntilNextReport(SUMMARY_REPORT_HOUR, SUMMARY_REPORT_MINUTE);
  const safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : 0;
  const nextRun = new Date(Date.now() + safeDelay);
  log('info', 'Daily summary scheduled', {
    recipient: SUMMARY_REPORT_RECIPIENT || 'unset',
    nextRunIso: nextRun.toISOString(),
    nextRunLocal: nextRun.toLocaleString(),
  });
  summaryTimer = setTimeout(async () => {
    await sendDailySummaryReport();
    scheduleDailySummaryReports();
  }, safeDelay);
}

async function notifyServiceRestart() {
  if (!RESTART_DM_RECIPIENT) {
    return;
  }
  try {
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
    
    let message = `🛡️ Security monitor restarted at ${new Date().toLocaleString()}.\nContinuous monitoring is active across ${client.guilds.cache.size} guild(s).`;
    
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
      
      // Add recent activity timeline
      const recentActivity = getRecentActivitySummary(botState, 5);
      if (recentActivity && recentActivity !== 'No recent activity before restart') {
        message += `\n\n📜 **Recent Activity Before Restart**\n${recentActivity}`;
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
        error: error instanceof Error ? error.message : String(error),
      });
    }
    
    // Wait for non-default database stats (retry up to 30 seconds)
    let stats = null;
    const maxWaitMs = 30_000;
    const retryDelayMs = 1_000;
    const startWaitTime = Date.now();
    
    try {
      const loggerModule = await import('../utils/logger.js');
      if (typeof loggerModule.getFormattedStats === 'function') {
        while (Date.now() - startWaitTime < maxWaitMs) {
          stats = await loggerModule.getFormattedStats();
          
          // Check if any database is still in "loading" state
          const hasLoadingStatus = stats.includes('Status: loading');
          
          if (!hasLoadingStatus) {
            log('info', 'Database stats ready for restart DM', {
              waitTimeMs: Date.now() - startWaitTime,
            });
            break;
          }
          
          log('debug', 'Waiting for database stats to complete initialization', {
            elapsedMs: Date.now() - startWaitTime,
            remainingMs: maxWaitMs - (Date.now() - startWaitTime),
          });
          
          await wait(retryDelayMs);
        }
        
        // Check if we timed out
        if (stats && stats.includes('Status: loading')) {
          log('warn', 'Database stats still loading after timeout, sending DM anyway', {
            waitTimeMs: Date.now() - startWaitTime,
            timeoutMs: maxWaitMs,
          });
        }
        
        if (stats) {
          message += `\n\n${stats}`;
          
          // Update bot state with current database status
          if (botState && stats.includes('DEV') && stats.includes('PROD')) {
            const devMatch = stats.match(/DEV.*?Status:\s*(\w+)/);
            const prodMatch = stats.match(/PROD.*?Status:\s*(\w+)/);
            if (devMatch && prodMatch) {
              updateDatabaseStatus(botState, devMatch[1], prodMatch[1]);
            }
          }
        }
      }
    } catch (error) {
      log('warn', 'Failed to append stats to restart DM', {
        error: error instanceof Error ? error.message : String(error),
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
        error: error instanceof Error ? error.message : String(error),
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
  // Least-privilege baseline for general members
  'Trainer': [
    'ViewChannel','SendMessages','ReadMessageHistory','AddReactions','UseExternalEmojis','EmbedLinks','AttachFiles'
  ],
  'Trainers': [
    'ViewChannel','SendMessages','ReadMessageHistory','AddReactions','UseExternalEmojis','EmbedLinks','AttachFiles'
  ],
  'Zapier': ['SendMessages','EmbedLinks','AttachFiles','ManageWebhooks','ViewChannel'],
  'FreshTok': ['SendMessages','EmbedLinks','AttachFiles','ManageWebhooks','ViewChannel'],
  'Drip': 'ALL',
  'Pokétwo': ['SendMessages','ManageMessages','AddReactions','EmbedLinks','AttachFiles','ReadMessageHistory','UseExternalEmojis'],
  'D&D Candidate': [],
  
};
// ----- Snapshot helpers -----
function snapshotKey(guildId, roleId) {
  return `role-perm-snapshot:${guildId}:${roleId}`;
}

function getSnapshot(role) {
  const key = snapshotKey(role.guild.id, role.id);
  return cache.readCache(key);
}

function setSnapshot(role, permissionsArrayOrAll) {
  const key = snapshotKey(role.guild.id, role.id);
  cache.writeCache(key, permissionsArrayOrAll);
}

function desiredPermissionsForRole(role, currentPerms) {
  const standard = STANDARD_PERMISSIONS[role.name];

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
    if (STANDARD_ENFORCE_ALL && !STANDARD_EXEMPT_ROLES.has(role.name)) {
      if (STANDARD_ALL_PERMS_ROLES.has(role.name)) return { policy: 'all', expected: 'ALL' };
      return { policy: 'standard', expected: UNLISTED_PERMISSIONS };
    }
    return { policy: 'unmanaged', expected: null };
  }

  if (!standard) {
    if (STANDARD_ENFORCE_ALL && !STANDARD_EXEMPT_ROLES.has(role.name)) {
      if (STANDARD_ALL_PERMS_ROLES.has(role.name)) return { policy: 'all', expected: 'ALL' };
      return { policy: 'standard', expected: UNLISTED_PERMISSIONS };
    }
    return { policy: 'unmanaged', expected: null };
  }
  if (standard === 'ALL') return { policy: 'all', expected: 'ALL' };
  return { policy: 'standard', expected: standard };
}

function analyzeRolePermissions(role) {
  const current = role.permissions.toArray();
  const desired = desiredPermissionsForRole(role, current);

  if (!desired.expected) {
    return { policy: 'unmanaged', expected: null, current, missing: [], extra: [] };
  }
  if (desired.expected === 'ALL') {
    return { policy: 'all', expected: 'ALL', current, missing: [], extra: [] };
  }

  const expected = desired.expected;
  const missing = expected.filter(p => !current.includes(p));
  const extra = current.filter(p => !expected.includes(p));
  return { policy: desired.policy, expected, current, missing, extra, seeded: desired.seeded === true };
}
function hasNoAssignableRoles(member) {
  // members always have @everyone; size === 1 means no additional roles
  return member.roles.cache.size <= 1;
}

function collectAssignableRoles(member) {
  if (!member || !member.roles?.cache || !member.guild?.roles?.everyone) {
    return null;
  }
  const everyoneId = member.guild.roles.everyone.id;
  return member.roles.cache.filter((role) => role && role.id !== everyoneId);
}

function listRoleSummaries(collection) {
  if (!collection) {
    return [];
  }
  return Array.from(collection.values()).map((role) => describeRole(role));
}

function canViewAuditLogs(guild) {
  try {
    return Boolean(guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog));
  } catch (error) {
    log('warn', 'Audit log permission check failed', mergeLogError({ guild: guild ? describeGuild(guild) : 'unknown' }, error));
    return false;
  }
}

async function lookupRoleAuditEntry(guild, memberId, { addedRoleIds = [], removedRoleIds = [] } = {}) {
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

async function lookupRolePermissionAuditEntry(guild, roleId) {
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

async function maybeAlertRoleAssignments(oldMember, newMember) {
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

  const addedRoles = [];
  const removedRoles = [];

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

  const auditEntry = await lookupRoleAuditEntry(guild, newMember.id, {
    addedRoleIds: addedRoles.map((role) => role.id),
    removedRoleIds: removedRoles.map((role) => role.id),
  });

  const executor = auditEntry?.executor ?? null;
  const authorization = await evaluateExecutorAuthorization(guild, executor);
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

    const title = `Unauthorized role change reverted for ${describeMember(newMember)}`;
    const meta = {
      ...baseMeta,
      action: 'reverted',
      revertStatus: revertOutcome.success ? 'success' : 'failed',
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
    report('Unauthorized Role Change Reverted', meta, 'warn');
    return { changed: true, unauthorized: true, revertStatus: meta.revertStatus };
  }

  const assignedRolesSummary = addedRoles.map((role) => role.name).join(', ') || 'role change';
  const summary = `Assigned ${assignedRolesSummary} to ${describeMember(newMember)} by ${executorSummary}`;
  const title = `Role assignment detected for ${describeMember(newMember)}`;
  const meta = {
    ...baseMeta,
    action: 'recorded',
  };

  if (dripAlertManager) {
    await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.security, title, meta);
  }
  activityTracker.recordActivity('security-alert', summary, meta);
  updateSecurityCliSection({
    lastAlertSentAt: new Date(),
    lastAlertMessage: summary,
  });
  report('Role Assignment Alert', {
    guild: meta.guild,
    member: meta.member,
    addedRoles: meta.addedRoles.join(', '),
    removedRoles: meta.removedRoles.join(', ') || 'none',
    assignedBy: executorSummary,
  }, 'info');

  return { changed: true, unauthorized: false };
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
    report('Role Enumeration Error', mergeReportError({
      guild: guildSummary,
    }, error), 'error');
  }
}

async function validateGuildRoles(guild) {
  const guildSummary = describeGuild(guild);
  log('info', 'Validating guild role permissions', { guild: guildSummary });

  let roles;
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
async function fixGuildRoles(guild) {
  const guildSummary = describeGuild(guild);

  let roles;
  try {
    roles = await guild.roles.fetch();
  } catch (error) {
    log('error', 'Unable to fetch guild roles for remediation', mergeLogError({
      guild: guildSummary,
    }, error));
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

    try {
      await role.setPermissions(analysis.expected);
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
async function enforceRolePermissions(role) {
  const guildSummary = describeGuild(role.guild);
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
  try {
    await role.setPermissions(analysis.expected);
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
    activityTracker.recordActivity('role-assignment', `Assigned ${describeRole(role)} to ${memberSummary}`, {
      origin,
      guild: guildSummary,
      member: memberSummary,
    });
    bumpRoleMemberCount(member.guild, 1);
    cache.writeCache(cacheKey, { assigned: true, timestamp: Date.now() });
  } catch (error) {
    const hint = (error && (String(error.message).includes('Missing Permissions') || error.code === 50013))
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

async function sweepGuild(guild, origin) {
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

    const toAssign = guild.members.cache.filter(member => hasNoAssignableRoles(member));
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
        roleId: ROLE_ID || 'resolved at runtime'
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

    const members = Array.from(toAssign.values());

    for (let i = 0; i < members.length; i += BACKFILL_CONCURRENCY) {
      const batch = members.slice(i, i + BACKFILL_CONCURRENCY);
      await Promise.all(batch.map(async (member) => {
        try {
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
    
    updateMonitoringPhase();
  }
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

    log.info(JSON.stringify(payload, null, 2));
    log.info('');
  }

  log.info('[cli-debug] Completed diagnostic dump.');
  await client.destroy();
  process.exit(0);
}

function startContinuousSweepLoop(transformer) {
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

      for (const guild of guilds) {
        if (abortController.signal.aborted) {
          break;
        }
        await sweepGuild(guild, 'continuous');
        if (abortController.signal.aborted) {
          break;
        }
        cliStatus.setPhase('Continuous sweep cycle');
        updateSecurityCliSection({ status: 'Continuous sweep cycle' });
        if (abortController.signal.aborted) {
          break;
        }
        if (BACKFILL_DELAY_MS > 0) {
          await wait(BACKFILL_DELAY_MS, abortController.signal);
        }
      }

      cache.cleanOldCache();
      const cycleCompleted = new Date();
      report('Continuous Sweep Cycle Complete', {
        cycleStarted: cycleStarted.toISOString(),
        cycleCompleted: cycleCompleted.toISOString(),
        durationMs: cycleCompleted - cycleStarted,
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
    continuousSweepState.loopPromise = null;
  });

  return continuousSweepState.loopPromise;
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
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    }, error));
  }
  
  if (CLI_DEBUG_MODE) {
    log('info', 'CLI debug mode active', {
      userTag: client.user.tag,
      userId: client.user.id
    });
    await runCliDebugDump();
    return;
  }

  log('success', 'Your service is live💦', {
    connectedAs: client.user.tag,
    userId: client.user.id,
  });
  if (commands && commands.size) {
    log('info', 'Slash commands loaded', { count: commands.size });
  }
  updateSecurityCliSection({ status: `Ready as ${client.user.tag}` });
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
    roleId: ROLE_ID || 'resolved at runtime',
    roleDiscovery: ROLE_ID ? 'ROLE_ID exact match' : 'ROLE_NAME case-insensitive search',
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
});

// Slash commands and autocomplete
client.on(Events.InteractionCreate, async (interaction) => {
  try {
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
    log.error('[commands] handler error:', err);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply({ content: 'Something went wrong.' });
    }
    return interaction.reply({ content: 'Something went wrong.', ephemeral: true });
  }
});
client.on(Events.GuildCreate, () => {
  updateMonitoringPhase();
});
client.on(Events.GuildDelete, () => {
  updateMonitoringPhase();
});

async function handleRolePermissionUpdate(oldRole, newRole) {
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
  const authorization = await evaluateExecutorAuthorization(guild, executor);
  const executorSummary = executor ? describeUser(executor) : 'unknown user';

  if (authorization.authorized) {
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
  const alertMeta = {
    ...meta,
    action: 'reverted',
    revertStatus: revertError ? 'failed' : 'success',
  };
  if (revertError) {
    const message = revertError instanceof Error ? revertError.message : String(revertError);
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
});

// Heal members who lose all assignable roles (drop to @everyone only)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const result = await maybeAlertRoleAssignments(oldMember, newMember);
    if (!result?.unauthorized && hasNoAssignableRoles(newMember)) {
      await ensureTrainerFor(newMember, 'member-update');
    }
  } catch (err) {
    report('Member Update Heal Error', mergeReportError({
      guild: describeGuild(newMember.guild),
      member: describeMember(newMember),
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

// ----- Alerting -----
function extractUserIdLike(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  // <@123> or <@!123>
  const mention = trimmed.match(/<@!?([0-9]{5,})>/);
  if (mention) return mention[1];
  // pure numeric
  if (/^[0-9]{5,}$/.test(trimmed)) return trimmed;
  return null; // not an ID-like string
}

async function resolveAlertUser(spec) {
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

  const needle = String(spec).trim().toLowerCase();
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
  describeUser,
  log,
  recordActivity: (type, summary, meta) => activityTracker.recordActivity(type, summary, meta),
  timeZone: DRIP_ALERT_TIMEZONE,
  digestHour: DRIP_ALERT_HOUR,
  digestMinute: DRIP_ALERT_MINUTE,
});

async function sendSecurityAlert(title, meta = {}) {
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
        if (ch && typeof ch.send === 'function') {
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
function normalizeToken(rawToken) {
  if (!rawToken) return '';
  const value = String(rawToken).trim();
  if (!value) return '';
  return value.startsWith('Bot ') ? value.slice(4).trim() : value;
}

function startSecurityBot({ token: tokenOverride } = {}) {
  const envPath = path.resolve(process.cwd(), '.env');
  const rawToken = tokenOverride !== undefined ? tokenOverride : BOT_TOKEN;
  const token = normalizeToken(rawToken);

  if (!token) {
    const hasDotEnv = fs.existsSync(envPath);
    const error = new Error('Security bot token missing. Set SECURITY_BOT_TOKEN or BOT_TOKEN.');
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
  async function handleShutdown(signal) {
    log.info(`\n[State] Received ${signal}, saving state before exit...`);
    if (autoSaveInterval) {
      stopAutoSave(autoSaveInterval);
    }
    if (botState) {
      await shutdownState(botState, signal);
    }
    log.info('[State] Shutdown complete');
    process.exit(0);
  }
  
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('uncaughtException', async (error) => {
    log.error('[State] Uncaught exception, saving state...', error);
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
