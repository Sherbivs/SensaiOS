/*
Persistent disk-backed caching for Discord bot data
Features:
- Store/retrieve JSON data keyed by strings
- Automatic pruning of old cache files
- Max 25% disk usage limit
- Clean cache files older than 7 days
*/

const fs = require('fs');
const path = require('path');
const os = require('os');

const PRIMARY_CACHE_DIR = '/Store/discord-cache';
const FALLBACK_CACHE_DIR = path.join(process.cwd(), 'Store/discord-cache');
const MAX_CACHE_PERCENT = 0.25;
const MAX_CACHE_FILE_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const testFile = path.join(dir, '.write-test');
    fs.writeFileSync(testFile, String(Date.now()));
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

const CACHE_DIR = ensureDir(PRIMARY_CACHE_DIR) ? PRIMARY_CACHE_DIR : (ensureDir(FALLBACK_CACHE_DIR), FALLBACK_CACHE_DIR);

function getCachePath(key) {
  const safeName = key.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
  return path.join(CACHE_DIR, `${safeName}.json`);
}

function readCache(key) {
  try {
    const filePath = getCachePath(key);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`[CACHE READ ERROR] Key: ${key}`, err);
    return null;
  }
}

function writeCache(key, data) {
  try {
    fs.writeFileSync(getCachePath(key), JSON.stringify(data, null, 2), 'utf8');
    pruneCache();
  } catch (err) {
    console.error(`[CACHE WRITE ERROR] Key: ${key}`, err);
  }
}

function getCacheSize() {
  const files = fs.readdirSync(CACHE_DIR).map(f => path.join(CACHE_DIR, f));
  return files.reduce((total, file) => {
    try {
      return total + fs.statSync(file).size;
    } catch {
      return total;
    }
  }, 0);
}

function getDiskFreeSpace() {
  return Math.max(os.freemem(), 512 * 1024 * 1024);
}

function pruneCache() {
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR)
      .map(f => {
        const full = path.join(CACHE_DIR, f);
        const stats = fs.statSync(full);
        return { filePath: full, mtime: stats.mtimeMs, size: stats.size };
      })
      .sort((a, b) => a.mtime - b.mtime);
  } catch {
    return;
  }

  let totalCacheSize = getCacheSize();
  const maxAllowed = getDiskFreeSpace() * MAX_CACHE_PERCENT;

  for (const file of files) {
    if (totalCacheSize <= maxAllowed) break;
    try {
      fs.unlinkSync(file.filePath);
      totalCacheSize -= file.size;
      console.log(`[CACHE PRUNE] Deleted ${path.basename(file.filePath)}`);
    } catch {
      // ignore
    }
  }
}

function cleanOldCache() {
  const now = Date.now();
  try {
    fs.readdirSync(CACHE_DIR).forEach(file => {
      const full = path.join(CACHE_DIR, file);
      const stats = fs.statSync(full);
      if (now - stats.mtimeMs > MAX_CACHE_FILE_AGE_MS) {
        fs.unlinkSync(full);
      }
    });
  } catch {
    // ignore
  }
}

module.exports = { CACHE_DIR, readCache, writeCache, pruneCache, cleanOldCache, getCacheSize };
