'use strict';

/**
 * Generates dist/assets/manifest.json:
 * - Maps each Pokémon id -> { name, cdnSprite, cdnArt, devSprite, devArt, preferred }
 * - Uses your CDN base if ASSET_CDN_BASE is set, otherwise prefers PokéAPI dev art.
 *
 * Fallback: if dist/data/dex.min.json is missing, will attempt to read data/pokemon.json.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const DEX_PATH = path.join(DIST_DIR, 'data', 'dex.min.json');
const META_PATH = path.join(DIST_DIR, 'meta', 'version.json');
const FALLBACK_DATA_PATH = path.join(ROOT, 'data', 'pokemon.json');

function loadJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function normalizeDexList(payload) {
  // Expect array of entries with id, name at minimum
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.pokemon)) return payload.pokemon;
  if (payload && Array.isArray(payload.list)) return payload.list;
  return [];
}

function readDexData() {
  if (fs.existsSync(DEX_PATH)) {
    return { list: loadJSON(DEX_PATH), meta: fs.existsSync(META_PATH) ? loadJSON(META_PATH) : {} };
  }
  if (fs.existsSync(FALLBACK_DATA_PATH)) {
    const raw = loadJSON(FALLBACK_DATA_PATH);
    return { list: normalizeDexList(raw), meta: {} };
  }
  throw new Error('No dex data found. Expected dist/data/dex.min.json or data/pokemon.json');
}

(function main() {
  const { list, meta } = readDexData();
  const cdnBase = String(process.env.ASSET_CDN_BASE || '').replace(/\/+$/, '');
  const hasCDN = Boolean(cdnBase);

  const DEV_SPRITE = (id) =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const DEV_ART = (id) =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

  const manifest = {
    version_group: meta.version_group || 'latest',
    built_at: new Date().toISOString(),
    sprites: {},
  };

  for (const p of list) {
    const id = Number(p.id);
    const name = String(p.name || p.pokemon || '').trim();
    if (!Number.isFinite(id) || !name) continue;

    const cdnSprite = hasCDN ? `${cdnBase}/pokemon/${id}.png` : null;
    const cdnArt = hasCDN ? `${cdnBase}/pokemon/artwork/${id}.png` : null;

    const devSprite = DEV_SPRITE(id);
    const devArt = DEV_ART(id);

    manifest.sprites[id] = {
      id,
      name,
      cdnSprite,
      cdnArt,
      devSprite,
      devArt,
      preferred: cdnArt || devArt,
    };
  }

  const outDir = path.join(DIST_DIR, 'assets');
  ensureDir(outDir);
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(
    `Assets manifest wrote ${Object.keys(manifest.sprites).length} entries -> dist/assets/manifest.json`
  );
})();
