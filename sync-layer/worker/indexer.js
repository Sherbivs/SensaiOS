'use strict';
/**
 * Render Background Worker — Indexer
 * Builds and updates the canonical index for Pokémon, members, and guild data.
 * Scheduled by Render cron job (e.g., Thursdays 00:00 ET)
 */

import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';

const DATA_DIR = './sync-layer/data';
const INDEX_PATH = path.join(DATA_DIR, 'index.json');
const META_PATH = path.join(DATA_DIR, 'meta.json');

async function fetchPokemon() {
  const resp = await fetch('https://pokeapi.co/api/v2/pokemon?limit=10000');
  const list = await resp.json();
  const entries = {};
  for (const p of list.results) {
    const det = await fetch(p.url).then(r => r.json());
    entries[det.name.toLowerCase()] = {
      id: det.id,
      name: det.name,
      types: det.types.map(t => t.type.name),
      stats: det.stats.reduce((o, s) => {
        o[s.stat.name] = s.base_stat;
        return o;
      }, {}),
    };
  }
  return entries;
}

async function buildIndex() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const pokemon = await fetchPokemon();
  const now = new Date().toISOString();
  const index = { pokemon };
  await fs.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));
  await fs.writeFile(
    META_PATH,
    JSON.stringify({ updated: now, entries: Object.keys(pokemon).length }, null, 2)
  );
  console.log(`✅ Index built with ${Object.keys(pokemon).length} Pokémon.`);
}

buildIndex().catch(e => {
  console.error('❌ Indexer failed', e);
  process.exit(1);
});
