import fs from 'node:fs';
import path from 'node:path';
import { log } from '../utils/logger.js';
// In-memory cooldowns; suitable for a single running instance
const store = new Map(); // key -> timestamp (ms)
// Configuration
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const PERSIST_INTERVAL_MS = 30 * 1000; // 30 seconds (reduced from 1min for seamless restart optimization - 50% data loss reduction)
const MAX_COOLDOWN_AGE_MS = 60 * 60 * 1000; // 1 hour TTL
const STORAGE_DIR = process.env.RENDER ? '/Store/cooldowns' : path.join(process.cwd(), 'Store', 'cooldowns');
const STORAGE_FILE = path.join(STORAGE_DIR, 'cooldowns.json');
let cleanupTimer = null;
let persistTimer = null;
function keyFor(userId, commandName) {
    return `${userId}:${commandName}`;
}
/**
 * Returns { ok: boolean, waitMs: number }
 * If on cooldown, ok=false and waitMs=remaining.
 */
function checkAndSet(userId, commandName, cooldownMs = 2000) {
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
function cleanup() {
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
        log('info', `cooldown: Cleanup removed ${removed} expired entries (${store.size} remaining)`);
    }
}
/**
 * Persist cooldown state to disk for recovery after restarts.
 * Only saves entries that are still valid (not expired).
 */
async function persist() {
    try {
        const now = Date.now();
        const threshold = now - MAX_COOLDOWN_AGE_MS;
        const validEntries = {};
        for (const [key, until] of store.entries()) {
            if (until >= threshold) {
                validEntries[key] = until;
            }
        }
        // Ensure directory exists
        if (!fs.existsSync(STORAGE_DIR)) {
            fs.mkdirSync(STORAGE_DIR, { recursive: true });
        }
        const snapshot = {
            version: 1,
            savedAt: now,
            entries: validEntries,
            count: Object.keys(validEntries).length,
        };
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
        log('info', `cooldown: Persisted ${snapshot.count} entries to disk`);
    }
    catch (err) {
        log('warn', `cooldown: Persist failed: ${err.message}`);
    }
}
/**
 * Load cooldown state from disk on startup.
 * Filters out expired entries during load.
 */
function load() {
    try {
        if (!fs.existsSync(STORAGE_FILE)) {
            log('info', 'cooldown: No persisted state found (first startup)');
            return;
        }
        const content = fs.readFileSync(STORAGE_FILE, 'utf8');
        const snapshot = JSON.parse(content);
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
        log('info', `cooldown: Loaded ${loaded} entries from disk (${skipped} expired, skipped)`);
    }
    catch (err) {
        log('warn', `cooldown: Load failed: ${err.message}`);
    }
}
/**
 * Start periodic cleanup and persistence timers.
 */
function startMaintenance() {
    if (cleanupTimer || persistTimer) {
        log('warn', 'cooldown: Maintenance already running');
        return;
    }
    cleanupTimer = setInterval(cleanup, CLEANUP_INTERVAL_MS);
    persistTimer = setInterval(persist, PERSIST_INTERVAL_MS);
    log('info', 'cooldown: Started maintenance (cleanup: 10m, persist: 5m)');
}
/**
 * Stop periodic timers and save final state.
 */
async function stopMaintenance() {
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
    log('info', 'cooldown: Stopped maintenance, final state saved');
}
/**
 * Get current statistics for monitoring.
 */
function getStats() {
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
// Load persisted state on startup
load();
// Start maintenance timers
startMaintenance();
// Graceful shutdown handlers
process.on('SIGTERM', async () => {
    await stopMaintenance();
});
process.on('SIGINT', async () => {
    await stopMaintenance();
});
export { checkAndSet, cleanup, persist, load, startMaintenance, stopMaintenance, getStats };
export default { checkAndSet, cleanup, persist, load, startMaintenance, stopMaintenance, getStats };
