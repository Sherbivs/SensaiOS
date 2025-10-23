// cache.js (pokemon bot)
// Simple JSON file-backed cache for Pokémon data

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const PRIMARY_CACHE_DIR = '/Store/pokemon-cache';
const FALLBACK_CACHE_DIR = path.join(process.cwd(), 'Store', 'pokemon-cache');
const MAX_CACHE_PERCENT = 0.25;
const MAX_CACHE_FILE_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function ensureDir(dir) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const test = path.join(dir, '.write-test');
    fs.writeFileSync(test, String(Date.now()));
    fs.unlinkSync(test);
    return true;
  } catch {
    return false;
  }
}

const CACHE_DIR = ensureDir(PRIMARY_CACHE_DIR) ? PRIMARY_CACHE_DIR : (ensureDir(FALLBACK_CACHE_DIR), FALLBACK_CACHE_DIR);

function getCachePath(key) {
  const safe = key.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
  return path.join(CACHE_DIR, `${safe}.json`);
}

function readCache(key) {
  try {
    const p = getCachePath(key);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    console.error('[CACHE READ ERROR]', key, err.message);
    return null;
  }
}

function writeCache(key, data) {
  try {
    const p = getCachePath(key);
    fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    pruneCache();
  } catch (err) {
    console.error('[CACHE WRITE ERROR]', key, err.message);
  }
}

function cachePokemonList(data) {
  if (!Array.isArray(data)) {
    return;
  }

  const names = Array.from(new Set(
    data
      .map((pokemon) => {
        if (!pokemon) return null;
        if (pokemon.name && typeof pokemon.name === 'string') {
          return pokemon.name;
        }
        if (pokemon.id !== undefined) {
          return String(pokemon.id);
        }
        return null;
      })
      .filter(Boolean)
  ));

  if (names.length === 0) {
    return;
  }

  writeCache('pokemonList', {
    cachedAt: new Date().toISOString(),
    total: names.length,
    names,
  });
}

function approxFreeBytes() {
  return Math.max(os.freemem(), 512 * 1024 * 1024);
}

function getCacheSize() {
  try {
    return fs.readdirSync(CACHE_DIR).reduce((sum, f) => sum + (fs.statSync(path.join(CACHE_DIR, f)).size || 0), 0);
  } catch {
    return 0;
  }
}

function pruneCache() {
  let entries = [];
  try {
    entries = fs.readdirSync(CACHE_DIR).map(f => {
      const fp = path.join(CACHE_DIR, f);
      const st = fs.statSync(fp);
      return { filePath: fp, mtime: st.mtimeMs, size: st.size || 0 };
    }).sort((a, b) => a.mtime - b.mtime);
  } catch {
    return;
  }
  let total = getCacheSize();
  const budget = Math.floor(approxFreeBytes() * MAX_CACHE_PERCENT);
  for (const e of entries) {
    if (total <= budget) break;
    try {
      fs.unlinkSync(e.filePath);
      total -= e.size;
      console.log(`[CACHE PRUNE] ${path.basename(e.filePath)} removed`);
    } catch (err) {
      console.error('[CACHE PRUNE ERROR]', err.message);
    }
  }
}

function cleanOldCache() {
  const now = Date.now();
  let files = [];
  try {
    files = fs.readdirSync(CACHE_DIR).map(f => path.join(CACHE_DIR, f));
  } catch { return; }
  for (const fp of files) {
    try {
      const st = fs.statSync(fp);
      if (now - st.mtimeMs > MAX_CACHE_FILE_AGE_MS) {
        fs.unlinkSync(fp);
        console.log(`[CACHE CLEANUP] ${path.basename(fp)} removed`);
      }
    } catch (err) {
      console.error('[CACHE CLEANUP ERROR]', err.message);
    }
  }
}

module.exports = {
  CACHE_DIR,
  readCache,
  writeCache,
  pruneCache,
  cleanOldCache,
  cachePokemonList,
};
