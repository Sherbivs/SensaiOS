import { log } from './logger.js';
import { toDate, cloneDate } from '../shared/utils/index.js';

const subscribers = new Set();
const pendingActivities = [];
const lifetimeCounts = new Map();
let totalEvents = 0;
let lastActivityAt = null;
let lastSummaryAt = null;
let sequence = 0;

function notify() {
  const snapshot = getStats();
  for (const handler of subscribers) {
    try {
      handler(snapshot);
    } catch (err) {
      log('error', '[activity-tracker notify]', { error: err instanceof Error ? err.message : err });
      if (err instanceof Error && err.stack) {
        log('error', '[activity-tracker stack]', { stack: err.stack });
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
    log('error', '[activity-tracker subscribe]', { error: err instanceof Error ? err.message : err });
    if (err instanceof Error && err.stack) {
      log('error', '[activity-tracker stack]', { stack: err.stack });
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

export {
  recordActivity,
  drainActivities,
  requeueActivities,
  getPendingActivities,
  getStats,
  subscribe,
  markSummarySent,
};

export default {
  recordActivity,
  drainActivities,
  requeueActivities,
  getPendingActivities,
  getStats,
  subscribe,
  markSummarySent,
};
