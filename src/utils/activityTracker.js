const subscribers = new Set();
const pendingActivities = [];
const lifetimeCounts = new Map();
let totalEvents = 0;
let lastActivityAt = null;
let lastSummaryAt = null;
let sequence = 0;

function cloneDate(value) {
  return value instanceof Date ? new Date(value.getTime()) : null;
}

function toDate(value) {
  if (value instanceof Date) return value;
  const asDate = new Date(value);
  return Number.isNaN(asDate.getTime()) ? new Date() : asDate;
}

function notify() {
  const snapshot = getStats();
  for (const handler of subscribers) {
    try {
      handler(snapshot);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[activity-tracker notify]', err instanceof Error ? err.message : err);
      if (err instanceof Error && err.stack) {
        // eslint-disable-next-line no-console
        console.error(err.stack);
      }
    }
  }
}

function recordActivity(type, summary, meta = {}) {
  const timestamp = new Date();
  const entry = {
    id: `${Date.now()}-${sequence++}`,
    type,
    summary,
    meta,
    timestamp,
  };

  pendingActivities.push(entry);
  totalEvents += 1;
  lifetimeCounts.set(type, (lifetimeCounts.get(type) || 0) + 1);
  lastActivityAt = timestamp;
  notify();
  return entry;
}

function drainActivities() {
  const drained = pendingActivities.splice(0, pendingActivities.length);
  notify();
  return drained;
}

function requeueActivities(entries = []) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }
  for (const entry of entries) {
    if (!entry || !entry.timestamp) {
      entry.timestamp = new Date();
    } else {
      entry.timestamp = toDate(entry.timestamp);
    }
  }
  pendingActivities.unshift(...entries);
  pendingActivities.sort((a, b) => a.timestamp - b.timestamp);
  notify();
}

function getPendingActivities() {
  return pendingActivities.map((activity) => ({
    ...activity,
    timestamp: cloneDate(activity.timestamp),
  }));
}

function getStats() {
  return {
    totalEvents,
    pendingEvents: pendingActivities.length,
    lifetimeCounts: Object.fromEntries(lifetimeCounts.entries()),
    lastActivityAt: cloneDate(lastActivityAt),
    lastSummaryAt: cloneDate(lastSummaryAt),
  };
}

function subscribe(handler) {
  if (typeof handler !== 'function') {
    return () => {};
  }
  subscribers.add(handler);
  try {
    handler(getStats());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[activity-tracker subscribe]', err instanceof Error ? err.message : err);
    if (err instanceof Error && err.stack) {
      // eslint-disable-next-line no-console
      console.error(err.stack);
    }
  }
  return () => {
    subscribers.delete(handler);
  };
}

function markSummarySent(at = new Date()) {
  lastSummaryAt = toDate(at);
  notify();
}

module.exports = {
  recordActivity,
  drainActivities,
  requeueActivities,
  getPendingActivities,
  getStats,
  subscribe,
  markSummarySent,
};
