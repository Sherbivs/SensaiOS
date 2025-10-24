const { msUntilNextZonedTime, formatInTimeZone } = require('../utils/timezone');

const DEFAULT_TIME_ZONE = 'America/New_York';
const SEVERITY = Object.freeze({
  critical: 'critical',
  security: 'security',
  warning: 'warning',
  notice: 'notice',
});

const SEVERITY_ICON = Object.freeze({
  [SEVERITY.critical]: '🚨',
  [SEVERITY.security]: '🚨',
  [SEVERITY.warning]: '⚠️',
  [SEVERITY.notice]: 'ℹ️',
});

function normalizeMeta(meta) {
  if (meta === null || meta === undefined) {
    return undefined;
  }
  if (typeof meta === 'string') {
    return meta;
  }
  try {
    return JSON.stringify(meta, null, 2);
  } catch (error) {
    return String(meta);
  }
}

function createDripAlertManager({
  recipient,
  resolveAlertUser,
  describeUser,
  log,
  recordActivity,
  timeZone = DEFAULT_TIME_ZONE,
  digestHour = 2,
  digestMinute = 0,
} = {}) {
  const queue = [];
  let digestTimer = null;
  let started = false;
  let cachedRecipient = null;
  let resolving = null;

  function logContext(level, message, context = {}) {
    if (typeof log === 'function') {
      const payload = level === 'error'
        ? {
            ...context,
            opsNotificationSource: context && context.opsNotificationSource
              ? context.opsNotificationSource
              : 'drip-alerts',
          }
        : context;
      log(level, message, payload);
    }
  }

  function record(type, summary, meta) {
    if (typeof recordActivity === 'function') {
      recordActivity(type, summary, meta);
    }
  }

  async function ensureRecipient() {
    if (!recipient) {
      return null;
    }
    if (cachedRecipient) {
      return cachedRecipient;
    }
    if (resolving) {
      return resolving;
    }
    resolving = Promise.resolve()
      .then(() => resolveAlertUser(recipient))
      .then((user) => {
        if (!user) {
          logContext('warn', 'Drip alert recipient unavailable', { recipient });
          return null;
        }
        cachedRecipient = user;
        logContext('info', 'Drip alert recipient resolved', { recipient: describeUser ? describeUser(user) : recipient });
        return user;
      })
      .catch((error) => {
        logContext('error', 'Drip alert recipient resolution failed', {
          recipient,
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
      .finally(() => {
        resolving = null;
      });
    return resolving;
  }

  function scheduleDigest() {
    if (digestTimer) {
      clearTimeout(digestTimer);
    }
    const delay = msUntilNextZonedTime(digestHour, digestMinute, timeZone);
    const safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : 0;
    const nextRun = new Date(Date.now() + safeDelay);
    logContext('info', 'Drip alert digest scheduled', {
      recipient: recipient || 'unset',
      nextRunIso: nextRun.toISOString(),
      nextRunLocal: nextRun.toLocaleString(),
      nextRunEastern: formatInTimeZone(nextRun, timeZone, {
        dateStyle: 'short',
        timeStyle: 'short',
      }),
    });
    digestTimer = setTimeout(async () => {
      try {
        await flushDigest();
      } finally {
        scheduleDigest();
      }
    }, safeDelay);
  }

  function stop() {
    if (digestTimer) {
      clearTimeout(digestTimer);
      digestTimer = null;
    }
    started = false;
  }

  async function flushDigest() {
    if (queue.length === 0) {
      logContext('info', 'Drip alert digest skipped (no pending alerts)', {
        recipient: recipient || 'unset',
      });
      return false;
    }
    const user = await ensureRecipient();
    if (!user) {
      logContext('warn', 'Drip alert digest could not be delivered (recipient missing)', {
        pendingAlerts: queue.length,
      });
      return false;
    }
    const items = queue.splice(0, queue.length);
    const generatedAt = new Date();
    const headerTime = formatInTimeZone(generatedAt, timeZone, {
      dateStyle: 'long',
      timeStyle: 'short',
    });
    const lines = [
      '💧 DripTVDD Daily Alert Digest',
      `Generated ${headerTime} (${timeZone})`,
      '',
    ];
    items.forEach((item, index) => {
      const icon = SEVERITY_ICON[item.severity] || '•';
      const when = formatInTimeZone(item.timestamp, timeZone, { timeStyle: 'short' });
      lines.push(`${index + 1}. [${when}] ${icon} ${item.title}`);
      if (item.meta) {
        lines.push('```json');
        lines.push(item.meta);
        lines.push('```');
      }
      lines.push('');
    });
    const message = lines.join('\n').trim();
    try {
      await user.send(message);
      logContext('info', 'Drip alert digest delivered', {
        recipient: describeUser ? describeUser(user) : recipient,
        alertsIncluded: items.length,
      });
      record('drip-alert-digest', `${items.length} alert(s) delivered`, {
        alertsIncluded: items.length,
        generatedAt: generatedAt.toISOString(),
      });
      return true;
    } catch (error) {
      logContext('error', 'Drip alert digest delivery failed', {
        recipient: describeUser ? describeUser(user) : recipient,
        error: error instanceof Error ? error.message : String(error),
      });
      queue.unshift(...items);
      return false;
    }
  }

  function buildImmediateMessage({ title, severity, meta, timestamp }) {
    const icon = SEVERITY_ICON[severity] || '⚠️';
    const header = `${icon} DripTVDD Alert — ${title}`;
    const parts = [header, `Severity: ${severity.toUpperCase()}`, `Timestamp: ${formatInTimeZone(timestamp, timeZone, {
      dateStyle: 'short',
      timeStyle: 'short',
    })} (${timeZone})`];
    if (meta) {
      parts.push('', '```json', meta, '```');
    }
    return parts.join('\n');
  }

  async function deliverImmediate(entry) {
    const user = await ensureRecipient();
    if (!user) {
      logContext('warn', 'Drip alert immediate delivery skipped (recipient missing)', {
        title: entry.title,
        severity: entry.severity,
      });
      queue.unshift(entry);
      record('drip-alert-warning', entry.title, {
        severity: entry.severity,
        meta: entry.meta,
        reason: 'recipient-missing',
      });
      return false;
    }
    const message = buildImmediateMessage(entry);
    try {
      await user.send(message);
      logContext('info', 'Drip alert delivered', {
        recipient: describeUser ? describeUser(user) : recipient,
        severity: entry.severity,
        title: entry.title,
      });
      record('drip-alert-critical', entry.title, {
        severity: entry.severity,
        meta: entry.meta ? entry.meta : undefined,
      });
      return true;
    } catch (error) {
      logContext('error', 'Drip alert immediate delivery failed', {
        recipient: describeUser ? describeUser(user) : recipient,
        severity: entry.severity,
        title: entry.title,
        error: error instanceof Error ? error.message : String(error),
      });
      queue.unshift(entry);
      record('drip-alert-warning', entry.title, {
        severity: entry.severity,
        meta: entry.meta,
        reason: 'delivery-failed',
      });
      return false;
    }
  }

  async function recordAlert(severity, title, meta = {}) {
    const normalizedSeverity = SEVERITY[severity] ? severity : SEVERITY.warning;
    const normalizedMeta = normalizeMeta(meta);
    const entry = {
      severity: normalizedSeverity,
      title,
      meta: normalizedMeta,
      timestamp: new Date(),
    };

    if (normalizedSeverity === SEVERITY.critical || normalizedSeverity === SEVERITY.security) {
      return deliverImmediate(entry);
    }

    queue.push(entry);
    record('drip-alert-warning', title, {
      severity: normalizedSeverity,
      meta: normalizedMeta,
    });
    return true;
  }

  function start() {
    if (started) {
      return;
    }
    started = true;
    if (!recipient) {
      logContext('warn', 'Drip alert system inactive (recipient unset)', {});
      return;
    }
    scheduleDigest();
  }

  return {
    start,
    stop,
    flushDigest,
    recordAlert,
    constants: SEVERITY,
  };
}

module.exports = {
  createDripAlertManager,
  DRIP_ALERT_SEVERITY: SEVERITY,
};
