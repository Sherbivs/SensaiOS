/**
 * Activity Tracker - Event Recording and Subscription System
 * @module utils/activityTracker
 * 
 * Provides a centralized activity tracking system that:
 *   - Records activities with type, summary, and metadata
 *   - Maintains a queue of pending activities
 *   - Tracks lifetime event counts per type
 *   - Notifies subscribers of changes
 */

import { getLogger } from '../shared/logging/index.js';
import { toDate, cloneDate, getErrorMessage } from '../shared/utils/index.js';

const logger = getLogger();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ActivityEntry {
  id: string;
  type: string;
  summary: string;
  meta: Record<string, unknown>;
  timestamp: Date;
}

export interface ActivityStats {
  totalEvents: number;
  pendingEvents: number;
  lifetimeCounts: Record<string, number>;
  lastActivityAt: Date | null;
  lastSummaryAt: Date | null;
}

export type ActivityHandler = (snapshot: ActivityStats) => void;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const subscribers = new Set<ActivityHandler>();
const pendingActivities: ActivityEntry[] = [];
const lifetimeCounts = new Map<string, number>();
let totalEvents = 0;
let lastActivityAt: Date | null = null;
let lastSummaryAt: Date | null = null;
let sequence = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────

function notify(): void {
  const snapshot = getStats();
  for (const handler of subscribers) {
    try {
      handler(snapshot);
    } catch (err) {
      logger.error('ActivityTracker', 'notify', 'Handler error', { metadata: { error: getErrorMessage(err) } });
      if (err instanceof Error && err.stack) {
        logger.error('ActivityTracker', 'notify', 'Handler error stack', { metadata: { stack: err.stack } });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a new activity event.
 */
export function recordActivity(
  type: string, 
  summary: string, 
  meta: Record<string, unknown> = {}
): ActivityEntry {
  const timestamp = new Date();
  const entry: ActivityEntry = {
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

/**
 * Drain all pending activities from the queue.
 */
export function drainActivities(): ActivityEntry[] {
  const drained = pendingActivities.splice(0, pendingActivities.length);
  notify();
  return drained;
}

/**
 * Requeue activities back into the pending queue (sorted by timestamp).
 */
export function requeueActivities(entries: Partial<ActivityEntry>[] = []): void {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }
  
  for (const entry of entries) {
    if (!entry || !entry.timestamp) {
      (entry as ActivityEntry).timestamp = new Date();
    } else {
      (entry as ActivityEntry).timestamp = toDate(entry.timestamp) ?? new Date();
    }
  }
  
  pendingActivities.unshift(...(entries as ActivityEntry[]));
  pendingActivities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  notify();
}

/**
 * Get a copy of all pending activities.
 */
export function getPendingActivities(): ActivityEntry[] {
  return pendingActivities.map((activity) => ({
    ...activity,
    timestamp: cloneDate(activity.timestamp) as Date,
  }));
}

/**
 * Get current activity statistics.
 */
export function getStats(): ActivityStats {
  return {
    totalEvents,
    pendingEvents: pendingActivities.length,
    lifetimeCounts: Object.fromEntries(lifetimeCounts.entries()),
    lastActivityAt: lastActivityAt ? cloneDate(lastActivityAt) as Date : null,
    lastSummaryAt: lastSummaryAt ? cloneDate(lastSummaryAt) as Date : null,
  };
}

/**
 * Subscribe to activity changes.
 * Returns an unsubscribe function.
 */
export function subscribe(handler: ActivityHandler): () => void {
  if (typeof handler !== 'function') {
    return () => {};
  }
  
  subscribers.add(handler);
  
  try {
    handler(getStats());
  } catch (err) {
    logger.error('ActivityTracker', 'subscribe', 'Initial handler error', { metadata: { error: getErrorMessage(err) } });
    if (err instanceof Error && err.stack) {
      logger.error('ActivityTracker', 'subscribe', 'Initial handler error stack', { metadata: { stack: err.stack } });
    }
  }
  
  return () => {
    subscribers.delete(handler);
  };
}

/**
 * Mark that a summary was sent at a given time.
 */
export function markSummarySent(at: Date | string | number = new Date()): void {
  lastSummaryAt = toDate(at);
  notify();
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export default {
  recordActivity,
  drainActivities,
  requeueActivities,
  getPendingActivities,
  getStats,
  subscribe,
  markSummarySent,
};
