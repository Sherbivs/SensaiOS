// cachePatch.js (shared)
// Persistent caching for guild/member operations to improve performance
// Disk-backed cache stored in /Store, with automatic pruning to 25% usage

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Primary target; if not writable, fall back to project-local Store directory
const PRIMARY_CACHE_DIR = '/Store/discord-cache';
const FALLBACK_CACHE_DIR = path.join(process.cwd(), 'Store', 'discord-cache');

const MAX_CACHE_PERCENT = 0.25; // Max 25% of approx free space
const MAX_CACHE_FILE_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days default

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // test write
    const testFile = path.join(dir, '.write-test');
    fs.writeFileSync(testFile, String(Date.now()));
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

const CACHE_DIR = ensureDir(PRIMARY_CACHE_DIR) ? PRIMARY_CACHE_DIR : (ensureDir(FALLBACK_CACHE_DIR), FALLBACK_CACHE_DIR);

/**
 * Get cache file path for a key
 * @param {string} key
 * @returns {string}
 */
function getCachePath(key) {
  const safeName = key.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
  return path.join(CACHE_DIR, `${safeName}.json`);
}

/**
 * Read cache for a key
 * @param {string} key
 * @returns {any|null}
 */
function readCache(key) {
  try {
    const filePath = getCachePath(key);
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[CACHE READ ERROR] Key: ${key}`, err);
    return null;
  }
}

/**
 * Write data to cache
 * @param {string} key
 * @param {any} data
 */
function writeCache(key, data) {
  try {
    const filePath = getCachePath(key);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    pruneCache();
  } catch (err) {
    console.error(`[CACHE WRITE ERROR] Key: ${key}`, err);
  }
}

/**
 * Calculate total cache size in bytes
 */
function getCacheSize() {
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR).map(f => path.join(CACHE_DIR, f));
  } catch {
    return 0;
  }
  return files.reduce((total, file) => {
    try {
      const stats = fs.statSync(file);
      return total + stats.size;
    } catch {
      return total;
    }
  }, 0);
}

/**
 * Get disk free space (approximation); Render doesn't expose disk info directly.
 */
function getDiskFreeSpace() {
  // Approximate with available memory as a conservative cap, minimum 512MB
  const approx = os.freemem();
  return Math.max(approx, 512 * 1024 * 1024);
}

/**
 * Budget helper for operational reporting
 */
function getCacheBudget() {
  const approxBytes = getDiskFreeSpace();
  const maxAllowedBytes = approxBytes * MAX_CACHE_PERCENT;
  return { approxBytes, maxAllowedBytes, percent: MAX_CACHE_PERCENT };
}

/**
 * Prune oldest cache files to stay within MAX_CACHE_PERCENT of disk
 */
function pruneCache() {
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR)
      .map(f => {
        const filePath = path.join(CACHE_DIR, f);
        const stats = fs.statSync(filePath);
        return { filePath, mtime: stats.mtimeMs, size: stats.size };
      })
      .sort((a, b) => a.mtime - b.mtime); // Oldest first
  } catch {
    return;
  }

  let totalCacheSize = getCacheSize();
  const budget = getCacheBudget();

  for (const file of files) {
    if (totalCacheSize <= budget.maxAllowedBytes) break;
    try {
      fs.unlinkSync(file.filePath);
      totalCacheSize -= file.size;
      console.log(`[CACHE PRUNE] Deleted ${path.basename(file.filePath)} to free space.`);
    } catch (err) {
      console.error('[CACHE PRUNE ERROR]', err);
    }
  }
}

/**
 * Utility: clean old files exceeding MAX_CACHE_FILE_AGE_MS
 */
function cleanOldCache() {
  const now = Date.now();
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR).map(f => path.join(CACHE_DIR, f));
  } catch {
    return;
  }

  for (const file of files) {
    try {
      const stats = fs.statSync(file);
      if (now - stats.mtimeMs > MAX_CACHE_FILE_AGE_MS) {
        fs.unlinkSync(file);
        console.log(`[CACHE CLEANUP] Removed old cache file: ${path.basename(file)}`);
      }
    } catch (err) {
      console.error('[CACHE CLEANUP ERROR]', err);
    }
  }
}

module.exports = {
  CACHE_DIR,
  readCache,
  writeCache,
  pruneCache,
  cleanOldCache,
  getCacheSize,
  MAX_CACHE_PERCENT,
  getCacheBudget,
};
