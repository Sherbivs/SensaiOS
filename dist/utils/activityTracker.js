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
// State
// ─────────────────────────────────────────────────────────────────────────────
const subscribers = new Set();
const pendingActivities = [];
const lifetimeCounts = new Map();
let totalEvents = 0;
let lastActivityAt = null;
let lastSummaryAt = null;
let sequence = 0;
// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────
function notify() {
    const snapshot = getStats();
    for (const handler of subscribers) {
        try {
            handler(snapshot);
        }
        catch (err) {
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
export function recordActivity(type, summary, meta = {}) {
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
/**
 * Drain all pending activities from the queue.
 */
export function drainActivities() {
    const drained = pendingActivities.splice(0, pendingActivities.length);
    notify();
    return drained;
}
/**
 * Requeue activities back into the pending queue (sorted by timestamp).
 */
export function requeueActivities(entries = []) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return;
    }
    for (const entry of entries) {
        if (!entry || !entry.timestamp) {
            entry.timestamp = new Date();
        }
        else {
            entry.timestamp = toDate(entry.timestamp) ?? new Date();
        }
    }
    pendingActivities.unshift(...entries);
    pendingActivities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    notify();
}
/**
 * Get a copy of all pending activities.
 */
export function getPendingActivities() {
    return pendingActivities.map((activity) => ({
        ...activity,
        timestamp: cloneDate(activity.timestamp),
    }));
}
/**
 * Get current activity statistics.
 */
export function getStats() {
    return {
        totalEvents,
        pendingEvents: pendingActivities.length,
        lifetimeCounts: Object.fromEntries(lifetimeCounts.entries()),
        lastActivityAt: lastActivityAt ? cloneDate(lastActivityAt) : null,
        lastSummaryAt: lastSummaryAt ? cloneDate(lastSummaryAt) : null,
    };
}
/**
 * Subscribe to activity changes.
 * Returns an unsubscribe function.
 */
export function subscribe(handler) {
    if (typeof handler !== 'function') {
        return () => { };
    }
    subscribers.add(handler);
    try {
        handler(getStats());
    }
    catch (err) {
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
export function markSummarySent(at = new Date()) {
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
