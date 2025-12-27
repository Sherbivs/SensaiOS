/**
 * Cooldown Manager - Rate limiting for Discord commands
 *
 * MIGRATION (2025-12-27): Moved from /Store/cooldowns to PostgreSQL
 * Reference: docs/projects/STORE-WRITE-ELIMINATION.md
 */
// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from '../shared/logging/index.js';
const logger = getLogger();
import { prisma } from '../shared/prisma.js';
// ============================================================================
// Module State
// ============================================================================
// In-memory cooldowns for fast access; database is backup
const store = new Map(); // key -> timestamp (ms)
// Configuration
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const PERSIST_INTERVAL_MS = 30 * 1000; // 30 seconds
const MAX_COOLDOWN_AGE_MS = 60 * 60 * 1000; // 1 hour TTL
const CACHE_KEY = 'cooldowns:state';
const CACHE_NAMESPACE = 'cooldowns';
let cleanupTimer = null;
let persistTimer = null;
// ============================================================================
// Internal Helpers
// ============================================================================
function keyFor(userId, commandName) {
    return `${userId}:${commandName}`;
}
// ============================================================================
// Exported Functions
// ============================================================================
/**
 * Check if user is on cooldown for command, and set new cooldown if not.
 * Returns { ok: boolean, waitMs: number }
 * If on cooldown, ok=false and waitMs=remaining.
 */
export function checkAndSet(userId, commandName, cooldownMs = 2000) {
    const now = Date.now();
    const key = keyFor(userId, commandName);
    const until = store.get(key) || 0;
    if (now < until)
        return { ok: false, waitMs: until - now };
    store.set(key, now + cooldownMs);
    return { ok: true, waitMs: 0 };
}
/**
 * Remove expired cooldown entries (older than MAX_COOLDOWN_AGE_MS).
 * Called periodically to prevent unbounded memory growth.
 */
export function cleanup() {
    const now = Date.now();
    const threshold = now - MAX_COOLDOWN_AGE_MS;
    let removed = 0;
    for (const [key, until] of store.entries()) {
        if (until < threshold) {
            store.delete(key);
            removed++;
        }
    }
    if (removed > 0) {
        logger.info('Cooldown', 'cleanup', `Cleanup removed ${removed} expired entries (${store.size} remaining)`);
    }
}
/**
 * Persist cooldown state to database for recovery after restarts.
 * Only saves entries that are still valid (not expired).
 */
export async function persist() {
    try {
        const now = Date.now();
        const threshold = now - MAX_COOLDOWN_AGE_MS;
        const validEntries = {};
        for (const [key, until] of store.entries()) {
            if (until >= threshold) {
                validEntries[key] = until;
            }
        }
        const snapshot = {
            version: 1,
            savedAt: now,
            entries: validEntries,
            count: Object.keys(validEntries).length,
        };
        const dataStr = JSON.stringify(snapshot);
        const sizeBytes = Buffer.byteLength(dataStr, 'utf8');
        await prisma.cacheEntry.upsert({
            where: { key: CACHE_KEY },
            update: {
                value: snapshot,
                sizeBytes,
                accessCount: { increment: 1 },
                lastAccessedAt: new Date(),
                expiresAt: new Date(now + MAX_COOLDOWN_AGE_MS),
            },
            create: {
                key: CACHE_KEY,
                namespace: CACHE_NAMESPACE,
                value: snapshot,
                sizeBytes,
                accessCount: 1,
                lastAccessedAt: new Date(),
                expiresAt: new Date(now + MAX_COOLDOWN_AGE_MS),
            },
        });
        logger.info('Cooldown', 'persist', `Persisted ${snapshot.count} entries to database`);
    }
    catch (err) {
        logger.warn('Cooldown', 'persist', `Persist failed: ${err.message}`);
    }
}
/**
 * Load cooldown state from database on startup.
 * Filters out expired entries during load.
 */
export function load() {
    // Async load in background
    void loadAsync();
}
async function loadAsync() {
    try {
        const entry = await prisma.cacheEntry.findUnique({
            where: { key: CACHE_KEY },
        });
        if (!entry) {
            logger.info('Cooldown', 'load', 'No persisted state found (first startup)');
            return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const snapshot = entry.value;
        const now = Date.now();
        const threshold = now - MAX_COOLDOWN_AGE_MS;
        let loaded = 0;
        let skipped = 0;
        for (const [key, until] of Object.entries(snapshot.entries || {})) {
            if (until >= threshold && until > now) {
                store.set(key, until);
                loaded++;
            }
            else {
                skipped++;
            }
        }
        logger.info('Cooldown', 'load', `Loaded ${loaded} entries from database (${skipped} expired, skipped)`);
    }
    catch (err) {
        logger.warn('Cooldown', 'load', `Load failed: ${err.message}`);
    }
}
/**
 * Start periodic cleanup and persistence timers.
 */
export function startMaintenance() {
    if (cleanupTimer || persistTimer) {
        logger.warn('Cooldown', 'startMaintenance', 'Maintenance already running');
        return;
    }
    cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
    persistTimer = setInterval(() => void persist(), PERSIST_INTERVAL_MS);
    logger.info('Cooldown', 'startMaintenance', 'Started maintenance (cleanup: 10m, persist: 5m)');
}
/**
 * Stop periodic timers and save final state.
 */
export async function stopMaintenance() {
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }
    if (persistTimer) {
        clearInterval(persistTimer);
        persistTimer = null;
    }
    // Final persist on shutdown
    await persist();
    logger.info('Cooldown', 'stopMaintenance', 'Stopped maintenance, final state saved');
}
/**
 * Get current statistics for monitoring.
 */
export function getStats() {
    const now = Date.now();
    const threshold = now - MAX_COOLDOWN_AGE_MS;
    let active = 0;
    let expired = 0;
    for (const [, until] of store.entries()) {
        if (until >= threshold && until > now) {
            active++;
        }
        else {
            expired++;
        }
    }
    return {
        total: store.size,
        active,
        expired,
        maxAgeSec: MAX_COOLDOWN_AGE_MS / 1000,
        cleanupIntervalSec: CLEANUP_INTERVAL_MS / 1000,
        persistIntervalSec: PERSIST_INTERVAL_MS / 1000,
    };
}
// ============================================================================
// Module Initialization
// ============================================================================
// Load persisted state on startup
load();
// Start maintenance timers
startMaintenance();
// Graceful shutdown handlers
process.on('SIGTERM', () => void stopMaintenance());
process.on('SIGINT', () => void stopMaintenance());
// ============================================================================
// Default Export
// ============================================================================
export default {
    checkAndSet,
    cleanup,
    persist,
    load,
    startMaintenance,
    stopMaintenance,
    getStats,
};
