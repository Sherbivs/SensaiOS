import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'dist', 'data');
const META_DIR = path.join(ROOT, 'dist', 'meta');

const SNAPSHOT_URL_BASE = process.env.SNAPSHOT_URL_BASE?.replace(/\/+$/, '') || null;
const DEX_URL = process.env.DEX_URL || (SNAPSHOT_URL_BASE ? `${SNAPSHOT_URL_BASE}/dex.min.json` : null);
const MOVES_URL = process.env.MOVES_URL || (SNAPSHOT_URL_BASE ? `${SNAPSHOT_URL_BASE}/moves.min.json` : null);

const GITHUB_RAW_URL = process.env.GITHUB_RAW_URL?.replace(/\/+$/, '') || null; // e.g. https://raw.githubusercontent.com/owner/repo/branch/data/cache
const FALLBACK_POKEMON_URL = GITHUB_RAW_URL ? `${GITHUB_RAW_URL}/pokemon.json` : null;
const FALLBACK_META_URL = GITHUB_RAW_URL ? `${GITHUB_RAW_URL}/meta.json` : null;

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'snapshot-fetch/1.0' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function ensureDirs() {
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(META_DIR, { recursive: true });
}

function synthesizeDexFromPokemonJson(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  return list.map((p) => ({
    id: p.id,
    name: p.name,
    height: p.height,
    weight: p.weight,
    types: Array.isArray(p.types) ? p.types : [],
    abilities: Array.isArray(p.abilities)
      ? p.abilities.map((a) => ({ name: a.name || a, hidden: !!a.hidden }))
      : [],
    stats: p.stats || {},
    learnset: { levelUp: [], machine: [], tutor: [], egg: [] },
    matchups: {},
  }));
}

async function main() {
  await ensureDirs();

  let dex = null;
  let moves = null;
  let meta = null;

  // Prefer direct snapshot URLs if provided
  if (DEX_URL && MOVES_URL) {
    try {
      dex = await fetchJSON(DEX_URL);
      moves = await fetchJSON(MOVES_URL);
    } catch (e) {
      console.warn('snapshots not available at SNAPSHOT_URL_BASE:', e.message);
    }
  }

  // Fallback: synthesize dex from cached pokemon.json and use empty moves
  if ((!dex || !moves) && FALLBACK_POKEMON_URL) {
    try {
      const pokemon = await fetchJSON(FALLBACK_POKEMON_URL);
      dex = synthesizeDexFromPokemonJson(pokemon);
      moves = moves || {};
      try {
        meta = await fetchJSON(FALLBACK_META_URL);
      } catch {}
    } catch (e) {
      console.warn('failed to synthesize from cached pokemon.json:', e.message);
    }
  }

  if (!dex || !moves) {
    console.log('No snapshot or fallback data available; nothing to write.');
    process.exit(0);
  }

  await writeFile(path.join(OUT_DIR, 'dex.min.json'), JSON.stringify(dex));
  await writeFile(path.join(OUT_DIR, 'moves.min.json'), JSON.stringify(moves));

  const metaPayload = {
    version_group: meta?.version_group || 'latest',
    version_group_id: meta?.version_group_id || null,
    built_at: new Date().toISOString(),
  };
  await writeFile(path.join(META_DIR, 'version.json'), JSON.stringify(metaPayload));

  console.log(`Snapshot ready -> dist/data (dex: ${Array.isArray(dex) ? dex.length : 0}, moves: ${Object.keys(moves || {}).length})`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('pull-snapshot failed:', err);
    process.exit(1);
  });
}
