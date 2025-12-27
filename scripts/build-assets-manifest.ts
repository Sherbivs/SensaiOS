#!/usr/bin/env tsx
/**
 * build-assets-manifest.ts - Generate asset manifest for Pokemon sprites
 *
 * PURPOSE:
 *   Generates dist/assets/manifest.json:
 *   - Maps each Pokémon id -> { name, cdnSprite, cdnArt, devSprite, devArt, preferred }
 *   - Uses your CDN base if ASSET_CDN_BASE is set, otherwise prefers PokéAPI dev art.
 *
 * FALLBACK:
 *   If dist/data/dex.min.json is missing, will attempt to read data/pokemon.json.
 *
 * USAGE:
 *   npx tsx scripts/build-assets-manifest.ts
 *
 * ENVIRONMENT VARIABLES:
 *   ASSET_CDN_BASE - Optional: CDN base URL for assets
 *
 * EXIT CODES:
 *   0 - Manifest generated successfully
 *   1 - No dex data found
 */

import fs from 'node:fs';
import path from 'node:path';
import { scopedLogger } from '../src/observability/envelope/console.js';

const log = scopedLogger('scripts.build-assets-manifest');

const ROOT: string = process.cwd();
const DIST_DIR: string = path.join(ROOT, 'dist');
const DEX_PATH: string = path.join(DIST_DIR, 'data', 'dex.min.json');
const META_PATH: string = path.join(DIST_DIR, 'meta', 'version.json');
const FALLBACK_DATA_PATH: string = path.join(ROOT, 'data', 'pokemon.json');

interface PokemonEntry {
  id: number;
  name?: string;
  pokemon?: string;
}

interface DexMeta {
  version_group?: string;
  built_at?: string;
}

interface SpriteEntry {
  id: number;
  name: string;
  cdnSprite: string | null;
  cdnArt: string | null;
  devSprite: string;
  devArt: string;
  preferred: string;
}

interface AssetManifest {
  version_group: string;
  built_at: string;
  sprites: Record<number, SpriteEntry>;
}

function loadJSON<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

interface RawDexPayload {
  pokemon?: PokemonEntry[];
  list?: PokemonEntry[];
}

function normalizeDexList(payload: PokemonEntry[] | RawDexPayload): PokemonEntry[] {
  // Expect array of entries with id, name at minimum
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.pokemon)) return payload.pokemon;
  if (payload && Array.isArray(payload.list)) return payload.list;
  return [];
}

interface DexData {
  list: PokemonEntry[];
  meta: DexMeta;
}

function readDexData(): DexData {
  if (fs.existsSync(DEX_PATH)) {
    return {
      list: loadJSON<PokemonEntry[]>(DEX_PATH),
      meta: fs.existsSync(META_PATH) ? loadJSON<DexMeta>(META_PATH) : {}
    };
  }
  if (fs.existsSync(FALLBACK_DATA_PATH)) {
    const raw = loadJSON<PokemonEntry[] | RawDexPayload>(FALLBACK_DATA_PATH);
    return { list: normalizeDexList(raw), meta: {} };
  }
  throw new Error('No dex data found. Expected dist/data/dex.min.json or data/pokemon.json');
}

function main(): void {
  const { list, meta } = readDexData();
  const cdnBase = String(process.env.ASSET_CDN_BASE || '').replace(/\/+$/, '');
  const hasCDN = Boolean(cdnBase);

  const DEV_SPRITE = (id: number): string =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const DEV_ART = (id: number): string =>
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

  const manifest: AssetManifest = {
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
  log.info('build', 'Assets manifest built', {
    entries: Object.keys(manifest.sprites).length,
    output: 'dist/assets/manifest.json'
  });
}

main();
