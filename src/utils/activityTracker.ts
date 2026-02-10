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

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../shared/logging/index.js';
const logger = getLogger();

import { toDate, cloneDate, getErrorMessage } from '../shared/utils/index.js';

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

export interface BufferMetrics {
  current: number;
  max: number;
  utilization: number;
  dropped: number;
}

export type ActivityHandler = (snapshot: ActivityStats) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum pending activities before circular buffer eviction kicks in.
 * When the buffer is full, the oldest entry is dropped on each new push.
 * Growth rate without this cap was ~4 MB/hour in production (MEMLEAK.PHASE1.1).
 */
export const MAX_PENDING_ACTIVITIES = 1000;

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
let droppedCount = 0;

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
 * Enforces circular buffer: when at MAX_PENDING_ACTIVITIES, the oldest
 * entry is evicted before the new one is pushed.
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

  // MEMORY SAFETY: Enforce circular buffer — drop oldest when at capacity
  if (pendingActivities.length >= MAX_PENDING_ACTIVITIES) {
    pendingActivities.shift();
    droppedCount += 1;
  }

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
 * Rejects the entire batch if it would exceed MAX_PENDING_ACTIVITIES.
 */
export function requeueActivities(entries: Partial<ActivityEntry>[] = []): void {
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }

  // MEMORY SAFETY: Reject batch if it would exceed the buffer limit
  if (pendingActivities.length + entries.length > MAX_PENDING_ACTIVITIES) {
    droppedCount += entries.length;
    logger.warn('ActivityTracker', 'requeueActivities',
      `Rejected requeue of ${entries.length} entries: would exceed MAX_PENDING_ACTIVITIES (${MAX_PENDING_ACTIVITIES}), current=${pendingActivities.length}`);
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

/**
 * Get buffer utilization metrics for observability.
 * Used by /ops memory command and memory-metrics service.
 */
export function getBufferMetrics(): BufferMetrics {
  return {
    current: pendingActivities.length,
    max: MAX_PENDING_ACTIVITIES,
    utilization: MAX_PENDING_ACTIVITIES > 0
      ? (pendingActivities.length / MAX_PENDING_ACTIVITIES) * 100
      : 0,
    dropped: droppedCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Testing Helpers (NOT for production use)
// ─────────────────────────────────────────────────────────────────────────────

/** @internal Reset all module-level state — test isolation only. */
export const __testing = {
  reset(): void {
    pendingActivities.length = 0;
    lifetimeCounts.clear();
    subscribers.clear();
    totalEvents = 0;
    lastActivityAt = null;
    lastSummaryAt = null;
    sequence = 0;
    droppedCount = 0;
  },
} as const;

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
  getBufferMetrics,
};
