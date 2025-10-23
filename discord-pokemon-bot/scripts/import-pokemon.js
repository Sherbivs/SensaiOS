#!/usr/bin/env node
/**
 * Import a Pokémon CSV and update data/pokemon.json to our schema.
 *
 * Usage:
 *   node scripts/import-pokemon.js --input path/to/pokemon.csv [--out ./data/pokemon.json]
 *
 * The script attempts to auto-detect common column names for:
 *  - id (id, pokedex_number, number, dex)
 *  - name (name)
 *  - type(s) (type, type1, type2, Type 1, Type 2)
 *  - booleans: legendary (legendary,isLegendary), starter (starter,isStarter), pseudo (pseudo,pseudoLegendary,isPseudoLegendary)
 *  - stage (stage,evolution_stage)
 *  - stats: hp, attack/atk, defense/def, specialAttack/sp_attack/sp.atk, specialDefense/sp_defense/sp.def, speed
 */

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');

function arg(name, def) {
  const i = process.argv.findIndex(a => a === `--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return process.env[name.toUpperCase()] || def;
}

function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'y';
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return undefined;
}

function parseTypes(row) {
  const t = [];
  const t1 = pick(row, ['type1', 'type_1', 'type 1', 'Type 1', 'type', 'primary_type']);
  const t2 = pick(row, ['type2', 'type_2', 'type 2', 'Type 2', 'secondary_type']);
  const pushTypes = (val) => {
    if (!val) return;
    String(val)
      .split(/[\/,|]/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(x => { if (!t.includes(x)) t.push(x); });
  };
  pushTypes(t1);
  pushTypes(t2);
  return t;
}

function parseNumber(v, def = 0) {
  if (v == null || v === '') return def;
  const n = Number(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : def;
}

function mapRow(row) {
  const id = parseNumber(pick(row, ['id', 'pokedex_number', 'dex', 'number']));
  const name = pick(row, ['name', 'Name', 'pokemon']) || 'Unknown';
  const types = parseTypes(row);
  const legendary = toBool(pick(row, ['legendary', 'isLegendary', 'is_legendary']));
  const starter = toBool(pick(row, ['starter', 'isStarter', 'is_starter']));
  const pseudo = toBool(pick(row, ['pseudo', 'pseudoLegendary', 'isPseudoLegendary', 'is_pseudo']));
  const stage = parseNumber(pick(row, ['stage', 'evolution_stage', 'evo_stage']), 0);

  const hp = parseNumber(pick(row, ['hp', 'HP', 'base_hp', 'base HP', 'base stat hp']));
  const attack = parseNumber(pick(row, ['attack', 'atk', 'base_atk', 'base attack']));
  const defense = parseNumber(pick(row, ['defense', 'def', 'base_def', 'base defense']));
  const spAtk = parseNumber(pick(row, ['special_attack', 'sp_attack', 'sp.atk', 'sp_atk', 'spa', 'special attack']));
  const spDef = parseNumber(pick(row, ['special_defense', 'sp_defense', 'sp.def', 'sp_def', 'spd', 'special defense']));
  const speed = parseNumber(pick(row, ['speed', 'spe', 'base_speed']));

  const rarity = legendary ? 'Legendary' : (pseudo ? 'Pseudo-Legendary' : (starter ? 'Starter' : 'Common'));

  return {
    id: id || undefined,
    name,
    type: types,
    level: 5,
    stats: {
      hp: hp || 50,
      attack: attack || 10,
      defense: defense || 10,
      specialAttack: spAtk || 10,
      specialDefense: spDef || 10,
      speed: speed || 10,
    },
    rarity,
    starter,
    legendary,
    pseudoLegendary: pseudo,
    stage,
    caughtBy: [],
  };
}

(async function main() {
  const input = arg('input');
  const outPath = arg('out', path.join(__dirname, '..', 'data', 'pokemon.json'));
  if (!input) {
    console.error('Usage: node scripts/import-pokemon.js --input path/to/pokemon.csv [--out ./data/pokemon.json]');
    process.exit(2);
  }
  const csvRaw = fs.readFileSync(input, 'utf8');
  const records = parse(csvRaw, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true });
  const mapped = records.map(mapRow);

  // Remove obvious empties/duplicates by name
  const byName = new Map();
  for (const m of mapped) {
    const key = (m.name || '').toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, m);
  }

  const final = Array.from(byName.values());
  // Sort by id if available, else name
  final.sort((a, b) => (a.id && b.id ? a.id - b.id : String(a.name).localeCompare(String(b.name))));

  fs.writeFileSync(outPath, JSON.stringify(final, null, 2), 'utf8');
  console.log(`✅ Imported ${final.length} Pokémon -> ${outPath}`);
})();
