/**
 * Cache Service - Persistent File-Based Caching
 * @module services/cache
 *
 * Provides persistent caching utilities for the security role-healing bot.
 * Features:
 *   - On Render: /Store/discord-cache persistent disk
 *   - Local fallback: Store/discord-cache in project directory
 *   - Automatic pruning based on disk budget
 *   - Age-based cleanup for stale entries
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { log } from '../utils/logger.js';
import { getErrorMessage } from '../shared/utils/index.js';
import { CACHE_CONSTANTS } from '../shared/constants.js';
// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const { MAX_CACHE_PERCENT, MAX_CACHE_FILE_AGE_MS, MAX_WORKSPACE_BYTES } = CACHE_CONSTANTS;
// On Render with persistent disk mounted at /Store
// Locally falls back to Store/ in project directory
const PRIMARY_CACHE_DIR = process.env['RENDER']
    ? '/Store/discord-cache'
    : path.join(process.cwd(), 'Store', 'discord-cache');
const FALLBACK_CACHE_DIR = path.join(process.cwd(), 'Store', 'discord-cache');
// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Log cache-related issues with consistent formatting.
 */
function logCacheIssue(level, tag, err, meta = {}) {
    const contextParts = Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}=${value}`);
    const message = getErrorMessage(err);
    const prefix = contextParts.length ? `${contextParts.join(' ')} ` : '';
    const fullMessage = `[CACHE ${tag}] ${prefix}${message}`;
    if (level === 'warn') {
        log('warn', fullMessage, { error: err, ...meta });
    }
    else {
        log('error', fullMessage, { error: err, ...meta });
        if (err instanceof Error && err.stack) {
            log('error', err.stack);
        }
    }
}
/**
 * Ensure a directory exists and is writable.
 */
function ensureDir(dir) {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const test = path.join(dir, '.write-test');
        fs.writeFileSync(test, String(Date.now()));
        fs.unlinkSync(test);
        return true;
    }
    catch (err) {
        logCacheIssue('error', 'DIR', err, { dir });
        return false;
    }
}
/**
 * Determine the active cache directory.
 */
function initCacheDir() {
    if (ensureDir(PRIMARY_CACHE_DIR)) {
        return PRIMARY_CACHE_DIR;
    }
    ensureDir(FALLBACK_CACHE_DIR);
    return FALLBACK_CACHE_DIR;
}
const CACHE_DIR = initCacheDir();
/**
 * Get disk statistics for a directory.
 */
function getDiskStats(dir) {
    try {
        const stats = fs.statfsSync(dir);
        const free = Number(stats.bavail) * Number(stats.bsize);
        const total = Number(stats.blocks) * Number(stats.bsize);
        return { free, total };
    }
    catch (err) {
        logCacheIssue('warn', 'DISK-STATS', err, { dir });
        return { free: 0, total: 0 };
    }
}
/**
 * Get the file path for a cache key.
 */
function getCachePath(key) {
    const safe = key.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    return path.join(CACHE_DIR, `${safe}.json`);
}
/**
 * Approximate free bytes available for caching.
 */
function approxFreeBytes() {
    const { free } = getDiskStats(CACHE_DIR);
    if (free > 0) {
        return Math.min(free, MAX_WORKSPACE_BYTES);
    }
    const fallback = os.freemem();
    if (fallback > 0) {
        return Math.min(fallback, MAX_WORKSPACE_BYTES);
    }
    return MAX_WORKSPACE_BYTES;
}
// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Read a value from the cache.
 */
function readCache(key) {
    try {
        const p = getCachePath(key);
        if (!fs.existsSync(p)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    catch (err) {
        logCacheIssue('error', 'READ', err, { key });
        return null;
    }
}
/**
 * Write a value to the cache.
 */
function writeCache(key, data) {
    try {
        const p = getCachePath(key);
        fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
        pruneCache();
    }
    catch (err) {
        logCacheIssue('error', 'WRITE', err, { key });
    }
}
/**
 * Get the total size of the cache in bytes.
 */
function getCacheSize() {
    try {
        return fs.readdirSync(CACHE_DIR).reduce((sum, f) => {
            const stats = fs.statSync(path.join(CACHE_DIR, f));
            return sum + (stats.size || 0);
        }, 0);
    }
    catch (err) {
        logCacheIssue('warn', 'SIZE', err, { cacheDir: CACHE_DIR });
        return 0;
    }
}
/**
 * Get a snapshot of the cache state.
 */
function getCacheSnapshot() {
    const now = Date.now();
    const snapshot = {
        timestamp: now,
        sizeBytes: 0,
        entryCount: 0,
        oldestEntryMs: null,
        newestEntryMs: null,
    };
    try {
        const entries = fs.readdirSync(CACHE_DIR);
        snapshot.entryCount = entries.length;
        let newest = Number.NEGATIVE_INFINITY;
        let oldest = Number.POSITIVE_INFINITY;
        for (const name of entries) {
            const filePath = path.join(CACHE_DIR, name);
            const stats = fs.statSync(filePath);
            const size = stats?.size || 0;
            snapshot.sizeBytes += size;
            if (typeof stats?.mtimeMs === 'number' && Number.isFinite(stats.mtimeMs)) {
                newest = Math.max(newest, stats.mtimeMs);
                oldest = Math.min(oldest, stats.mtimeMs);
            }
        }
        snapshot.newestEntryMs =
            Number.isFinite(newest) && newest !== Number.NEGATIVE_INFINITY ? newest : null;
        snapshot.oldestEntryMs =
            Number.isFinite(oldest) && oldest !== Number.POSITIVE_INFINITY ? oldest : null;
    }
    catch (err) {
        logCacheIssue('warn', 'SNAPSHOT', err, { cacheDir: CACHE_DIR });
    }
    return snapshot;
}
/**
 * Get the cache budget and disk statistics.
 */
function getCacheBudget() {
    const disk = getDiskStats(CACHE_DIR);
    const approxBytes = approxFreeBytes();
    const maxAllowedBytes = Math.min(Math.floor(approxBytes * MAX_CACHE_PERCENT), Math.floor(MAX_WORKSPACE_BYTES * MAX_CACHE_PERCENT));
    return {
        approxBytes,
        maxAllowedBytes,
        percent: MAX_CACHE_PERCENT,
        diskFreeBytes: disk.free,
        diskTotalBytes: disk.total,
        workspaceLimitBytes: MAX_WORKSPACE_BYTES,
    };
}
/**
 * Prune cache entries to stay within budget.
 */
function pruneCache() {
    let entries = [];
    try {
        entries = fs
            .readdirSync(CACHE_DIR)
            .map((f) => {
            const fp = path.join(CACHE_DIR, f);
            const st = fs.statSync(fp);
            return { filePath: fp, mtime: st.mtimeMs, size: st.size || 0 };
        })
            .sort((a, b) => a.mtime - b.mtime);
    }
    catch (err) {
        logCacheIssue('warn', 'PRUNE-LIST', err, { cacheDir: CACHE_DIR });
        return;
    }
    let total = getCacheSize();
    const budget = getCacheBudget();
    for (const e of entries) {
        if (total <= budget.maxAllowedBytes) {
            break;
        }
        try {
            fs.unlinkSync(e.filePath);
            total -= e.size;
            log('info', '[CACHE PRUNE] File removed', { file: path.basename(e.filePath) });
        }
        catch (err) {
            logCacheIssue('warn', 'PRUNE', err, { file: path.basename(e.filePath) });
        }
    }
}
/**
 * Clean cache entries older than MAX_CACHE_FILE_AGE_MS.
 */
function cleanOldCache() {
    const now = Date.now();
    let files = [];
    try {
        files = fs.readdirSync(CACHE_DIR).map((f) => path.join(CACHE_DIR, f));
    }
    catch (err) {
        logCacheIssue('warn', 'CLEAN-LIST', err, { cacheDir: CACHE_DIR });
        return;
    }
    for (const fp of files) {
        try {
            const st = fs.statSync(fp);
            if (now - st.mtimeMs > MAX_CACHE_FILE_AGE_MS) {
                fs.unlinkSync(fp);
                log('info', '[CACHE CLEANUP] File removed', { file: path.basename(fp) });
            }
        }
        catch (err) {
            logCacheIssue('warn', 'CLEAN', err, { file: path.basename(fp) });
        }
    }
}
// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────
export { CACHE_DIR, readCache, writeCache, pruneCache, cleanOldCache, getCacheSize, getCacheSnapshot, MAX_CACHE_PERCENT, MAX_CACHE_FILE_AGE_MS, getCacheBudget, };
export default {
    CACHE_DIR,
    readCache,
    writeCache,
    pruneCache,
    cleanOldCache,
    getCacheSize,
    getCacheSnapshot,
    MAX_CACHE_PERCENT,
    MAX_CACHE_FILE_AGE_MS,
    getCacheBudget,
};
