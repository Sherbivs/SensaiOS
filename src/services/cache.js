import { log } from '../utils/logger.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
// Persistent caching utilities for the security role-healing bot
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// On Render with persistent disk mounted at /Store
// Locally falls back to Store/ in project directory
const PRIMARY_CACHE_DIR = process.env.RENDER 
  ? '/Store/discord-cache'
  : path.join(process.cwd(), 'Store', 'discord-cache');
const FALLBACK_CACHE_DIR = path.join(process.cwd(), 'Store', 'discord-cache');
const MAX_CACHE_PERCENT = 0.75;
const MAX_CACHE_FILE_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_WORKSPACE_BYTES = 1024 * 1024 * 1024; // 1 GB workspace budget reminder

function logCacheIssue(level, tag, err, meta = {}) {
  const contextParts = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${value}`);
  const message = getErrorMessage(err);
  const prefix = contextParts.length ? `${contextParts.join(' ')} ` : '';
  const fullMessage = `[CACHE ${tag}] ${prefix}${message}`;
  
  if (level === 'warn') {
    log('warn', fullMessage, { error: err, ...meta });
  } else {
    log('error', fullMessage, { error: err, ...meta });
    if (err instanceof Error && err.stack) {
      log('error', err.stack);
    }
  }
}

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const test = path.join(dir, '.write-test');
    fs.writeFileSync(test, String(Date.now()));
    fs.unlinkSync(test);
    return true;
  } catch (err) {
    logCacheIssue('error', 'DIR', err, { dir });
    return false;
  }
}
const CACHE_DIR = ensureDir(PRIMARY_CACHE_DIR) ? PRIMARY_CACHE_DIR : (ensureDir(FALLBACK_CACHE_DIR), FALLBACK_CACHE_DIR);

function getDiskStats(dir) {
  try {
    const stats = fs.statfsSync(dir);
    const free = Number(stats.bavail) * Number(stats.bsize);
    const total = Number(stats.blocks) * Number(stats.bsize);
    return { free, total };
  } catch (err) {
    logCacheIssue('warn', 'DISK-STATS', err, { dir });
    return { free: 0, total: 0 };
  }
}

function getCachePath(key) {
  const safe = key.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  return path.join(CACHE_DIR, `${safe}.json`);
}
function readCache(key) {
  try {
    const p = getCachePath(key);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    logCacheIssue('error', 'READ', err, { key });
    return null;
  }
}
function writeCache(key, data) {
  try {
    const p = getCachePath(key);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    pruneCache();
  } catch (err) {
    logCacheIssue('error', 'WRITE', err, { key });
  }
}
function getCacheSize() {
  try {
    return fs.readdirSync(CACHE_DIR).reduce((sum, f) => sum + (fs.statSync(path.join(CACHE_DIR, f)).size || 0), 0);
  } catch (err) {
    logCacheIssue('warn', 'SIZE', err, { cacheDir: CACHE_DIR });
    return 0;
  }
}

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

    snapshot.newestEntryMs = Number.isFinite(newest) && newest !== Number.NEGATIVE_INFINITY ? newest : null;
    snapshot.oldestEntryMs = Number.isFinite(oldest) && oldest !== Number.POSITIVE_INFINITY ? oldest : null;
  } catch (err) {
    logCacheIssue('warn', 'SNAPSHOT', err, { cacheDir: CACHE_DIR });
  }

  return snapshot;
}
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
function getCacheBudget() {
  const disk = getDiskStats(CACHE_DIR);
  const approxBytes = approxFreeBytes();
  const maxAllowedBytes = Math.min(
    Math.floor(approxBytes * MAX_CACHE_PERCENT),
    Math.floor(MAX_WORKSPACE_BYTES * MAX_CACHE_PERCENT)
  );
  return {
    approxBytes,
    maxAllowedBytes,
    percent: MAX_CACHE_PERCENT,
    diskFreeBytes: disk.free,
    diskTotalBytes: disk.total,
    workspaceLimitBytes: MAX_WORKSPACE_BYTES,
  };
}
function pruneCache() {
  let entries = [];
  try {
    entries = fs.readdirSync(CACHE_DIR).map(f => {
      const fp = path.join(CACHE_DIR, f);
      const st = fs.statSync(fp);
      return { filePath: fp, mtime: st.mtimeMs, size: st.size || 0 };
    }).sort((a, b) => a.mtime - b.mtime);
  } catch (err) {
    logCacheIssue('warn', 'PRUNE-LIST', err, { cacheDir: CACHE_DIR });
    return;
  }
  let total = getCacheSize();
  const budget = getCacheBudget();
  for (const e of entries) {
    if (total <= budget.maxAllowedBytes) break;
    try {
      fs.unlinkSync(e.filePath);
      total -= e.size;
      log('info', '[CACHE PRUNE] File removed', { file: path.basename(e.filePath) });
    } catch (err) {
      logCacheIssue('warn', 'PRUNE', err, { file: path.basename(e.filePath) });
    }
  }
}
function cleanOldCache() {
  const now = Date.now();
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR).map(f => path.join(CACHE_DIR, f));
  } catch (err) {
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
    } catch (err) {
      logCacheIssue('warn', 'CLEAN', err, { file: path.basename(fp) });
    }
  }
}
export {
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
