'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
// Point this to your cached PokeAPI clone if different:
const DATA_ROOT =
  process.env.POKEAPI_DIR || path.join(ROOT, 'data', 'pokeapi', 'data', 'v2');
const VERSION_GROUP = process.env.VERSION_GROUP?.trim().toLowerCase() || null;

function readDirSafe(dir) { try { return fs.readdirSync(dir); } catch { return []; } }
function loadJSON(fp) { return JSON.parse(fs.readFileSync(fp, 'utf8')); }

/** Choose the newest version-group by numeric id. */
function pickLatestVersionGroup() {
  const vgDir = path.join(DATA_ROOT, 'version-group');
  const files = readDirSafe(vgDir).filter(f => f.endsWith('.json'));
  let best = { id: -1, name: null };
  for (const f of files) {
    const j = loadJSON(path.join(vgDir, f));
    const name = j.name?.toLowerCase();
    if (VERSION_GROUP && name === VERSION_GROUP) {
      return { id: j.id, name: j.name };
    }
    if (typeof j.id === 'number' && j.id > best.id) best = { id: j.id, name: j.name };
  }
  if (VERSION_GROUP) {
    throw new Error(`VERSION_GROUP override "${VERSION_GROUP}" was not found in ${vgDir}`);
  }
  if (!best.name) throw new Error('No version-group data found under ' + vgDir);
  return best;
}

function normalizeLearnset(p, vgName) {
  const buckets = { levelUp: [], machine: [], tutor: [], egg: [] };
  const seen = new Set();

  for (const entry of p.moves || []) {
    const mvName = entry?.move?.name || entry?.name;
    if (!mvName) continue;

    const vgd = (entry.version_group_details || [])
      .filter(v => v?.version_group?.name === vgName);

    for (const v of vgd) {
      const method = v?.move_learn_method?.name;
      const level = v?.level_learned_at ?? null;

      const key =
        method === 'level-up' ? 'levelUp' :
        method === 'machine'  ? 'machine' :
        method === 'tutor'    ? 'tutor'   :
        method === 'egg'      ? 'egg'     : null;

      if (!key) continue;

      const sig = `${key}:${mvName}:${level ?? ''}`;
      if (seen.has(sig)) continue;
      seen.add(sig);

      const rec = { name: mvName };
      if (level != null && key === 'levelUp') rec.level = level;
      buckets[key].push(rec);
    }
  }

  buckets.levelUp.sort((a, b) => (a.level ?? 999) - (b.level ?? 999));
  return buckets;
}

function gatherMoves() {
  const mdir = path.join(DATA_ROOT, 'move');
  const files = readDirSafe(mdir).filter(f => f.endsWith('.json'));
  const out = {};
  for (const f of files) {
    const m = loadJSON(path.join(mdir, f));
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

function computeTypeChart() {
  const tdir = path.join(DATA_ROOT, 'type');
  const files = readDirSafe(tdir).filter(f => f.endsWith('.json'));
  const chart = {};
  for (const f of files) {
    const t = loadJSON(path.join(tdir, f));
    chart[t.name] = t.damage_relations || {};
  }
  return chart;
}

function matchups(types, chart) {
  const all = Object.keys(chart);
  const mult = Object.fromEntries(all.map(n => [n, 1]));
  for (const t of types) {
    const r = chart[t] || {};
    for (const n of r.double_damage_from || []) mult[n] *= 2;
    for (const n of r.half_damage_from   || []) mult[n] *= 0.5;
    for (const n of r.no_damage_from     || []) mult[n] *= 0;
  }
  return mult;
}

function build() {
  const latest = pickLatestVersionGroup();
  console.log('Using latest version group:', latest.name, `(#${latest.id})`);

  const movesIndex = gatherMoves();
  if (!movesIndex.tackle) {
    throw new Error('Invariant failed: expected move "tackle" to exist in move index');
  }
  const chart = computeTypeChart();

  const pdir = path.join(DATA_ROOT, 'pokemon');
  const pfiles = readDirSafe(pdir).filter(f => f.endsWith('.json'));
  const dex = [];

  for (const f of pfiles) {
    const p = loadJSON(path.join(pdir, f));
    const types = (p.types || []).map(t => t.type?.name).filter(Boolean);

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
      stats: Object.fromEntries((p.stats || []).map(s => [s.stat?.name, s.base_stat])),
      learnset: normalizeLearnset(p, latest.name),
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

  console.log(
    `Built ${dex.length} Pokémon and ${Object.keys(movesIndex).length} moves -> dist/data/*.json`
  );
}

if (require.main === module) build();
