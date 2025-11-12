import { msUntilNextZonedTime, formatInTimeZone } from '../utils/timezone.js';
import { EventBus } from '../shared/event-bus.js';

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

const MIN_DIGEST_DELAY_MS = 60_000; // guard against tight loops when clocks mismatch
const FALLBACK_DIGEST_DELAY_MS = 60 * 60 * 1000; // 1 hour safety delay
const MILLIS_IN_DAY = 24 * 60 * 60 * 1000;

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
  // Phase 2.3.3: Removed in-memory queue, using Event Bus exclusively
  let digestTimer = null;
  let started = false;
  let cachedRecipient = null;
  let resolving = null;
  
  // Phase 2.3.2: Event Bus subscription tracking
  const subscriptions = {
    immediate: null,  // For critical + security alerts
    digest: null,     // For warning + notice alerts
  };

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
    let safeDelay = Number.isFinite(delay) ? Math.max(0, delay) : NaN;
    if (!Number.isFinite(safeDelay) || safeDelay <= 0) {
      safeDelay = FALLBACK_DIGEST_DELAY_MS;
      logContext('info', 'Drip alert digest delay fallback applied', {
        recipient: recipient || 'unset',
        computedDelay: delay,
        fallbackDelayMs: safeDelay,
      });
    } else if (safeDelay < MIN_DIGEST_DELAY_MS) {
      safeDelay = Math.max(MIN_DIGEST_DELAY_MS, safeDelay + MILLIS_IN_DAY);
      logContext('info', 'Drip alert digest delay rolled forward to next window', {
        recipient: recipient || 'unset',
        computedDelay: delay,
        appliedDelayMs: safeDelay,
      });
    }
    const nextRun = new Date(Date.now() + safeDelay);
    logContext('info', 'Drip alert digest scheduled', {
      recipient: recipient || 'unset',
      nextRunIso: nextRun.toISOString(), // Keep ISO for logging
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
    
    // Phase 2.3.2: Unsubscribe from Event Bus
    const bus = EventBus.getInstance();
    if (subscriptions.immediate) {
      bus.unsubscribe(subscriptions.immediate);
      subscriptions.immediate = null;
    }
    if (subscriptions.digest) {
      bus.unsubscribe(subscriptions.digest);
      subscriptions.digest = null;
    }
    
    started = false;
  }

  async function flushDigest() {
    // Phase 2.3.3: Use Event Bus replay buffer for digest alerts
    const bus = EventBus.getInstance();
    const replayEvents = bus.getReplayBuffer();
    
    // Filter for warning/notice alerts since last digest
    const digestAlerts = replayEvents.filter(event => 
      event.topic === 'alert.warning' || event.topic === 'alert.notice'
    );
    
    if (digestAlerts.length === 0) {
      logContext('info', 'Drip alert digest skipped (no pending alerts)', {
        recipient: recipient || 'unset',
      });
      return false;
    }
    
    const user = await ensureRecipient();
    if (!user) {
      logContext('warn', 'Drip alert digest could not be delivered (recipient missing)', {
        pendingAlerts: digestAlerts.length,
      });
      return false;
    }
    
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
    
    digestAlerts.forEach((event, index) => {
      const { severity, title, meta, timestamp } = event.payload;
      const icon = SEVERITY_ICON[severity] || '•';
      const when = formatInTimeZone(new Date(timestamp), timeZone, { timeStyle: 'short' });
      lines.push(`${index + 1}. [${when}] ${icon} ${title}`);
      if (meta) {
        lines.push('```json');
        lines.push(meta);
        lines.push('```');
      }
      lines.push('');
    });
    
    const message = lines.join('\n').trim();
    try {
      await user.send(message);
      logContext('info', 'Drip alert digest delivered', {
        recipient: describeUser ? describeUser(user) : recipient,
        alertsIncluded: digestAlerts.length,
      });
      record('drip-alert-digest', `${digestAlerts.length} alert(s) delivered`, {
        alertsIncluded: digestAlerts.length,
        generatedAt: generatedAt.toISOString(),
      });
      return true;
    } catch (error) {
      logContext('error', 'Drip alert digest delivery failed', {
        recipient: describeUser ? describeUser(user) : recipient,
        error: error instanceof Error ? error.message : String(error),
      });
      // Phase 2.3.3: Event Bus replay buffer retains events automatically
      // No need to re-queue - they'll be in next digest attempt
      return false;
    }
  }

  function buildImmediateMessage({ title, severity, meta, timestamp }, correlationId) {
    const icon = SEVERITY_ICON[severity] || '⚠️';
    const header = `${icon} DripTVDD Alert — ${title}`;
    const parts = [header, `Severity: ${severity.toUpperCase()}`, `Timestamp: ${formatInTimeZone(timestamp, timeZone, {
      dateStyle: 'short',
      timeStyle: 'short',
    })} (${timeZone})`];
    
    if (correlationId && process.env.NODE_ENV !== 'production') {
      parts.push(`Correlation: ${correlationId}`);
    }
    
    if (meta) {
      parts.push('', '```json', meta, '```');
    }
    return parts.join('\n');
  }

  async function deliverImmediate(entry, correlationId) {
    const user = await ensureRecipient();
    if (!user) {
      logContext('warn', 'Drip alert immediate delivery skipped (recipient missing)', {
        title: entry.title,
        severity: entry.severity,
        correlationId,
      });
      
      // Phase 2.3.3: Re-emit as warning instead of queue
      const bus = EventBus.getInstance();
      bus.emit(`alert.warning`, {
        severity: 'warning',
        title: `[Retry] ${entry.title}`,
        meta: entry.meta,
        timestamp: new Date().toISOString(),
        recipient,
        originalSeverity: entry.severity,
        retryReason: 'recipient-missing',
      }, {
        emitter: 'drip-alert-manager',
        parentCorrelationId: correlationId,
      });
      
      record('drip-alert-warning', entry.title, {
        severity: entry.severity,
        meta: entry.meta,
        reason: 'recipient-missing',
        correlationId,
      });
      return false;
    }
    const message = buildImmediateMessage(entry, correlationId);
    try {
      await user.send(message);
      logContext('info', 'Drip alert delivered', {
        recipient: describeUser ? describeUser(user) : recipient,
        severity: entry.severity,
        title: entry.title,
        correlationId,
      });
      record('drip-alert-critical', entry.title, {
        severity: entry.severity,
        meta: entry.meta ? entry.meta : undefined,
        correlationId,
      });
      return true;
    } catch (error) {
      logContext('error', 'Drip alert immediate delivery failed', {
        recipient: describeUser ? describeUser(user) : recipient,
        severity: entry.severity,
        title: entry.title,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });
      
      // Phase 2.3.3: Re-emit as warning for retry instead of queue
      const bus = EventBus.getInstance();
      bus.emit(`alert.warning`, {
        severity: 'warning',
        title: `[Retry] ${entry.title}`,
        meta: entry.meta,
        timestamp: new Date().toISOString(),
        recipient,
        originalSeverity: entry.severity,
        retryReason: 'delivery-failed',
        retryError: error instanceof Error ? error.message : String(error),
      }, {
        emitter: 'drip-alert-manager',
        parentCorrelationId: correlationId,
      });
      
      record('drip-alert-warning', entry.title, {
        severity: entry.severity,
        meta: entry.meta,
        reason: 'delivery-failed',
        correlationId,
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

    // NEW: Emit to Event Bus (Phase 2.3.1)
    const bus = EventBus.getInstance();
    const topic = `alert.${normalizedSeverity}`;
    const correlationId = bus.emit(topic, {
      severity: normalizedSeverity,
      title,
      meta: normalizedMeta,
      timestamp: entry.timestamp.toISOString(),
      recipient,
    }, {
      emitter: 'drip-alert-manager',
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔗 Alert Correlation: ${correlationId} (${topic})`);
    }

    // Phase 2.3.3: All alerts handled by Event Bus subscribers
    if (normalizedSeverity === SEVERITY.critical || normalizedSeverity === SEVERITY.security) {
      return deliverImmediate(entry, correlationId);
    }

    // Digest alerts (warning/notice) are queued via Event Bus subscription handler
    record('drip-alert-warning', title, {
      severity: normalizedSeverity,
      meta: normalizedMeta,
      correlationId,
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
    
    // Phase 2.3.2: Subscribe to Event Bus for alert delivery
    const bus = EventBus.getInstance();
    
    // Subscribe to immediate alerts (critical + security) - high priority
    subscriptions.immediate = bus.subscribe(
      'alert.critical|alert.security',
      async (event) => {
        // Phase 2.3.3: Handle immediate delivery via Event Bus
        const { severity, title, meta, timestamp, recipient: eventRecipient } = event.payload;
        
        logContext('debug', 'Event Bus immediate alert received', {
          topic: event.topic,
          severity,
          title,
          correlationId: event.correlationId,
        });
        
        // Build entry matching recordAlert format
        const entry = {
          severity,
          title,
          meta: meta || {},
          timestamp: timestamp ? new Date(timestamp) : new Date(),
        };
        
        // Deliver immediately
        await deliverImmediate(entry, event.correlationId);
      },
      {
        priority: 20,
        maxQueueSize: 50,
      }
    );
    
    // Subscribe to digest alerts (warning + notice) - standard priority
    subscriptions.digest = bus.subscribe(
      'alert.warning|alert.notice',
      (event) => {
        // Phase 2.3.3: Digest alerts handled by flushDigest via Event Bus replay
        const { severity, title } = event.payload;
        
        logContext('debug', 'Event Bus digest alert received', {
          topic: event.topic,
          severity,
          title,
          correlationId: event.correlationId,
        });
        
        // Event stays in replay buffer for digest delivery
        // No action needed here - flushDigest will process via bus.getReplayBuffer()
      },
      {
        priority: 10,
        maxQueueSize: 100,
      }
    );
    
    logContext('info', 'Drip alert Event Bus subscriptions created', {
      immediate: subscriptions.immediate,
      digest: subscriptions.digest,
    });
    
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

export { createDripAlertManager, SEVERITY as DRIP_ALERT_SEVERITY };

export default {
  createDripAlertManager,
  DRIP_ALERT_SEVERITY: SEVERITY,
};
