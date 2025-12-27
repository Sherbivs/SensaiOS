#!/usr/bin/env tsx
/**
 * build-data.ts - Build Pokemon data from PokeAPI cache
 *
 * PURPOSE:
 *   Process cached PokeAPI data into optimized JSON files for runtime use.
 *   Generates dex.min.json and moves.min.json for the battle engine.
 *
 * USAGE:
 *   npx tsx scripts/build-data.ts
 *
 * ENVIRONMENT VARIABLES:
 *   POKEAPI_DIR - Path to PokeAPI data directory (default: data/pokeapi/data/v2)
 *   VERSION_GROUP - Override version group selection (e.g., "sword-shield")
 *
 * EXIT CODES:
 *   0 - Build successful
 *   1 - Build failed (missing data or invariant failure)
 */

import fs from 'node:fs';
import path from 'node:path';

import { scopedLogger } from '../src/observability/envelope/console.js';

const log = scopedLogger('scripts.build-data');

const ROOT: string = process.cwd();
// Point this to your cached PokeAPI clone if different:
const DATA_ROOT: string =
  process.env.POKEAPI_DIR || path.join(ROOT, 'data', 'pokeapi', 'data', 'v2');
const VERSION_GROUP: string | null = process.env.VERSION_GROUP?.trim().toLowerCase() || null;

// Type definitions
interface VersionGroup {
  id: number;
  name: string | null;
}

interface MoveEntry {
  id: number;
  type: string | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  class: string | null;
  target: string | null;
  effect: string | null;
}

interface LearnsetEntry {
  name: string;
  level?: number;
}

interface Learnset {
  levelUp: LearnsetEntry[];
  machine: LearnsetEntry[];
  tutor: LearnsetEntry[];
  egg: LearnsetEntry[];
}

interface Ability {
  name: string | undefined;
  hidden: boolean;
}

interface PokemonEntry {
  id: number;
  name: string;
  height: number;
  weight: number;
  types: string[];
  abilities: Ability[];
  stats: Record<string, number>;
  learnset: Learnset;
  matchups: Record<string, number>;
}

interface DamageRelations {
  double_damage_from?: Array<{ name: string }>;
  half_damage_from?: Array<{ name: string }>;
  no_damage_from?: Array<{ name: string }>;
}

interface TypeChart {
  [typeName: string]: DamageRelations;
}

function readDirSafe(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function loadJSON<T>(fp: string): T {
  return JSON.parse(fs.readFileSync(fp, 'utf8')) as T;
}

/** Choose the newest version-group by numeric id. */
function pickLatestVersionGroup(): VersionGroup {
  const vgDir = path.join(DATA_ROOT, 'version-group');
  const files = readDirSafe(vgDir).filter(f => f.endsWith('.json'));
  let best: VersionGroup = { id: -1, name: null };

  for (const f of files) {
    const j = loadJSON<{ id?: number; name?: string }>(path.join(vgDir, f));
    const name = j.name?.toLowerCase();
    if (VERSION_GROUP && name === VERSION_GROUP) {
      return { id: j.id ?? 0, name: j.name ?? null };
    }
    if (typeof j.id === 'number' && j.id > best.id) {
      best = { id: j.id, name: j.name ?? null };
    }
  }

  if (VERSION_GROUP) {
    throw new Error(`VERSION_GROUP override "${VERSION_GROUP}" was not found in ${vgDir}`);
  }
  if (!best.name) {
    throw new Error('No version-group data found under ' + vgDir);
  }
  return best;
}

interface PokemonMoveEntry {
  move?: { name?: string };
  name?: string;
  version_group_details?: Array<{
    version_group?: { name?: string };
    move_learn_method?: { name?: string };
    level_learned_at?: number;
  }>;
}

interface RawPokemon {
  id: number;
  name: string;
  height: number;
  weight: number;
  types?: Array<{ type?: { name?: string } }>;
  abilities?: Array<{ ability?: { name?: string }; is_hidden?: boolean }>;
  stats?: Array<{ stat?: { name?: string }; base_stat?: number }>;
  moves?: PokemonMoveEntry[];
}

function normalizeLearnset(p: RawPokemon, vgName: string): Learnset {
  const buckets: Learnset = { levelUp: [], machine: [], tutor: [], egg: [] };
  const seen = new Set<string>();

  for (const entry of p.moves || []) {
    const mvName = entry?.move?.name || entry?.name;
    if (!mvName) continue;

    const vgd = (entry.version_group_details || [])
      .filter(v => v?.version_group?.name === vgName);

    for (const v of vgd) {
      const method = v?.move_learn_method?.name;
      const level = v?.level_learned_at ?? null;

      const key: keyof Learnset | null =
        method === 'level-up' ? 'levelUp' :
        method === 'machine'  ? 'machine' :
        method === 'tutor'    ? 'tutor'   :
        method === 'egg'      ? 'egg'     : null;

      if (!key) continue;

      const sig = `${key}:${mvName}:${level ?? ''}`;
      if (seen.has(sig)) continue;
      seen.add(sig);

      const rec: LearnsetEntry = { name: mvName };
      if (level != null && key === 'levelUp') rec.level = level;
      buckets[key].push(rec);
    }
  }

  buckets.levelUp.sort((a, b) => (a.level ?? 999) - (b.level ?? 999));
  return buckets;
}

interface RawMove {
  id: number;
  name: string;
  type?: { name?: string };
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
  priority?: number;
  damage_class?: { name?: string };
  target?: { name?: string };
  effect_entries?: Array<{ short_effect?: string }>;
}

function gatherMoves(): Record<string, MoveEntry> {
  const mdir = path.join(DATA_ROOT, 'move');
  const files = readDirSafe(mdir).filter(f => f.endsWith('.json'));
  const out: Record<string, MoveEntry> = {};

  for (const f of files) {
    const m = loadJSON<RawMove>(path.join(mdir, f));
    out[m.name] = {
      id: m.id,
      type: m.type?.name || null,
      power: m.power ?? null,
      accuracy: m.accuracy ?? null,
      pp: m.pp ?? null,
      priority: m.priority ?? 0,
      class: m.damage_class?.name || null,
      target: m.target?.name || null,
      effect: m.effect_entries?.[0]?.short_effect || null
    };
  }
  return out;
}

interface RawType {
  name: string;
  damage_relations?: DamageRelations;
}

function computeTypeChart(): TypeChart {
  const tdir = path.join(DATA_ROOT, 'type');
  const files = readDirSafe(tdir).filter(f => f.endsWith('.json'));
  const chart: TypeChart = {};

  for (const f of files) {
    const t = loadJSON<RawType>(path.join(tdir, f));
    chart[t.name] = t.damage_relations || {};
  }
  return chart;
}

function matchups(types: string[], chart: TypeChart): Record<string, number> {
  const all = Object.keys(chart);
  const mult: Record<string, number> = Object.fromEntries(all.map(n => [n, 1]));

  for (const t of types) {
    const r = chart[t] || {};
    for (const n of r.double_damage_from || []) mult[n.name] *= 2;
    for (const n of r.half_damage_from   || []) mult[n.name] *= 0.5;
    for (const n of r.no_damage_from     || []) mult[n.name] *= 0;
  }
  return mult;
}

function build(): void {
  const latest = pickLatestVersionGroup();
  log.info('version-group', 'Using latest version group', {
    name: latest.name,
    id: latest.id
  });

  const movesIndex = gatherMoves();
  if (!movesIndex.tackle) {
    throw new Error('Invariant failed: expected move "tackle" to exist in move index');
  }
  const chart = computeTypeChart();

  const pdir = path.join(DATA_ROOT, 'pokemon');
  const pfiles = readDirSafe(pdir).filter(f => f.endsWith('.json'));
  const dex: PokemonEntry[] = [];

  for (const f of pfiles) {
    const p = loadJSON<RawPokemon>(path.join(pdir, f));
    const types = (p.types || []).map(t => t.type?.name).filter((n): n is string => Boolean(n));

    dex.push({
      id: p.id,
      name: p.name,
      height: p.height,
      weight: p.weight,
      types,
      abilities: (p.abilities || []).map(a => ({
        name: a.ability?.name,
        hidden: !!a.is_hidden
      })),
      stats: Object.fromEntries(
        (p.stats || []).map(s => [s.stat?.name || '', s.base_stat || 0])
      ),
      learnset: normalizeLearnset(p, latest.name!),
      matchups: matchups(types, chart)
    });
  }

  if (dex.length < 100) {
    throw new Error(`Invariant failed: expected >= 100 Pokémon entries, received ${dex.length}`);
  }

  const outDir = path.join(ROOT, 'dist', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'dex.min.json'), JSON.stringify(dex), 'utf8');
  fs.writeFileSync(path.join(outDir, 'moves.min.json'), JSON.stringify(movesIndex), 'utf8');

  const metaDir = path.join(ROOT, 'dist', 'meta');
  fs.mkdirSync(metaDir, { recursive: true });
  fs.writeFileSync(
    path.join(metaDir, 'version.json'),
    JSON.stringify({
      version_group: latest.name,
      version_group_id: latest.id,
      built_at: new Date().toISOString()
    }),
    'utf8'
  );

  log.info('build', 'Built dex and moves data', {
    pokemonCount: dex.length,
    moveCount: Object.keys(movesIndex).length,
    output: 'dist/data/*.json'
  });
}

// Run if executed directly
build();
