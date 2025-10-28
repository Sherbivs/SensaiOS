import { Client, GatewayIntentBits, Partials, Events, Collection, AuditLogEvent, PermissionsBitField } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

import cache from '../services/cache.js';
import activityTracker from '../utils/activityTracker.js';
import cliStatus from '../utils/cliStatus.js';
import opsNotifier from '../utils/opsNotifier.js';
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
import { log as baseLog, report } from '../utils/logger.js';
import { installFatalErrorHandlers } from '../utils/fatalErrorGuard.js';
import { createDripAlertManager, DRIP_ALERT_SEVERITY } from './dripAlerts.js';
import { loadCommands } from '../command-loader.js';
import { checkAndSet } from '../lib/cooldown.js';

// Escalate CLI warnings if sweeps lag and keep idle background cadence predictable.
const CLI_SWEEP_WARNING_THRESHOLD_SECONDS = 5 * 60;
const CONTINUOUS_SWEEP_IDLE_DELAY_MS = 15_000;
const MEMBER_STATS_REFRESH_INTERVAL_MS = 60_000;

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
  console.warn('[commands] loader failed:', err?.message || err);
}
let loginPromise = null;
let dripAlertManager = null;

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
            await guild.members.fetch();
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
    const message = `🛡️ Security monitor restarted at ${new Date().toLocaleString()}.\nContinuous monitoring is active across ${client.guilds.cache.size} guild(s).`;
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

async function lookupRoleAuditEntry(guild, memberId, roleIds) {
  if (!guild || !memberId || !Array.isArray(roleIds) || roleIds.length === 0) {
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
      if (!addedChange || !Array.isArray(addedChange.new)) {
        continue;
      }
      const addedIds = addedChange.new
        .map((item) => item && item.id)
        .filter((id) => typeof id === 'string');
      if (addedIds.some((id) => roleIds.includes(id))) {
        return entry;
      }
    }
  } catch (error) {
    log('warn', 'Audit log lookup for role change failed', mergeLogError({
      guild: describeGuild(guild),
      memberId,
      roleIds,
    }, error));
  }
  return null;
}

async function maybeAlertRoleAssignments(oldMember, newMember) {
  if (!dripAlertManager || !newMember || !newMember.guild) {
    return;
  }

  const guild = newMember.guild;
  const newRoles = collectAssignableRoles(newMember);
  if (!newRoles || newRoles.size === 0) {
    return;
  }

  const oldRoles = collectAssignableRoles(oldMember);
  const addedRoles = [];

  newRoles.forEach((role) => {
    if (!role) {
      return;
    }
    if (!oldRoles || !oldRoles.has(role.id)) {
      addedRoles.push(role);
    }
  });

  if (addedRoles.length === 0) {
    return;
  }

  const removedRoles = [];
  if (oldRoles) {
    oldRoles.forEach((role) => {
      if (!role) {
        return;
      }
      if (!newRoles.has(role.id)) {
        removedRoles.push(role);
      }
    });
  }

  const roleIds = addedRoles.map((role) => role.id);
  const auditEntry = await lookupRoleAuditEntry(guild, newMember.id, roleIds);
  const executor = auditEntry?.executor ?? null;
  const assignedBy = executor ? describeUser(executor) : 'unknown user';
  const assignedRolesSummary = addedRoles.map((role) => role.name).join(', ');
  const previousRoles = listRoleSummaries(oldRoles);
  const removedSummaries = removedRoles.length ? removedRoles.map((role) => describeRole(role)) : [];

  const meta = {
    guild: describeGuild(guild),
    member: describeMember(newMember),
    memberId: newMember.id,
    addedRoles: addedRoles.map((role) => describeRole(role)),
    removedRoles: removedSummaries,
    previousRoles,
    assignedBy,
    assignedById: executor?.id ?? null,
    auditId: auditEntry?.id ?? null,
    auditLoggedAt: auditEntry?.createdTimestamp ? new Date(auditEntry.createdTimestamp).toISOString() : null,
    auditReason: auditEntry?.reason ?? null,
  };

  const summary = `Assigned ${assignedRolesSummary} to ${describeMember(newMember)}`;
  const title = `Role assignment detected for ${describeMember(newMember)}`;

  const success = await dripAlertManager.recordAlert(DRIP_ALERT_SEVERITY.security, title, meta);
  if (success === false) {
    log('warn', 'Role assignment alert deferred (DRIP delivery pending)', meta);
    return;
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
    assignedBy,
  }, 'info');
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
      await guild.members.fetch();
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
      await guild.members.fetch();
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

    console.log(JSON.stringify(payload, null, 2));
    console.log('');
  }

  console.log('[cli-debug] Completed diagnostic dump.');
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
    continuousSweep: `continuous (idle target ${BACKFILL_INTERVAL_SECONDS}s)`,
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
    console.error('[commands] handler error:', err);
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
    await maybeAlertRoleAssignments(oldMember, newMember);
    if (hasNoAssignableRoles(newMember)) {
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
client.on('roleUpdate', async (_oldRole, newRole) => {
  try {
    await enforceRolePermissions(newRole);
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
      const members = await guild.members.fetch();
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
}

export { startSecurityBot, client };

export default { startSecurityBot, client };
