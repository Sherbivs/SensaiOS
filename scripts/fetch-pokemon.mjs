import { writeFile, mkdir } from 'node:fs/promises';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { delay } from '../src/shared/utils/async-utils.js';
import { formatStatus } from '../src/utils/output-formatter.js';

const CACHE_DIR = process.env.CACHE_DIR || './data/cache';
const TRIGGER_FILE = process.env.DEX_SYNC_TRIGGER_PATH || path.join(CACHE_DIR, 'dex-sync-trigger.json');
const LIST_URL = 'https://pokeapi.co/api/v2/pokemon?limit=20000&offset=0';
const CONCURRENCY = Number(process.env.POKE_CONCURRENCY || 10);
const REQ_TIMEOUT_MS = Number(process.env.POKE_TIMEOUT_MS || 15000);

const timeoutFetch = async (url, ms = REQ_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CacheBot/1.0 (+read-only)' },
      method: 'GET',
    });
    if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
};

async function mapPool(items, limit, mapper) {
  const results = [];
  let index = 0;
  let active = 0;
  return new Promise((resolve, reject) => {
    const launchNext = () => {
      if (index >= items.length && active === 0) {
        resolve(results);
        return;
      }

      while (active < limit && index < items.length) {
        const currentIndex = index++;
        const item = items[currentIndex];
        active++;
        Promise.resolve()
          .then(() => mapper(item, currentIndex))
          .then((value) => {
            results[currentIndex] = value;
          })
          .catch(reject)
          .finally(() => {
            active--;
            launchNext();
          });
      }
    };

    launchNext();
  });
}

function normalizePokemon(detail) {
  return {
    id: detail.id,
    name: detail.name,
    height: detail.height,
    weight: detail.weight,
    base_experience: detail.base_experience,
    types: detail.types.map((entry) => entry.type.name),
    stats: Object.fromEntries(detail.stats.map((stat) => [stat.stat.name, stat.base_stat])),
    abilities: detail.abilities.map((ability) => ({ name: ability.ability.name, hidden: ability.is_hidden })),
    moves: detail.moves.map((move) => move.move.name),
  };
}

async function fetchAllPokemon() {
  const listRes = await timeoutFetch(LIST_URL);
  const { results } = await listRes.json();
  const details = await mapPool(results, CONCURRENCY, async (entry, idx) => {
    if (idx && idx % 50 === 0) await delay(250);
    const res = await timeoutFetch(entry.url);
    const json = await res.json();
    return normalizePokemon(json);
  });
  details.sort((a, b) => a.id - b.id);
  return details;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function writeCache(pokemon) {
  await mkdir(CACHE_DIR, { recursive: true });
  const dataPath = path.join(CACHE_DIR, 'pokemon.json');
  const gzPath = path.join(CACHE_DIR, 'pokemon.json.gz');
  const metaPath = path.join(CACHE_DIR, 'meta.json');

  await writeFile(dataPath, JSON.stringify(pokemon, null, 0));
  await pipeline(createReadStream(dataPath), createGzip(), createWriteStream(gzPath));

  const checksum = await sha256File(dataPath);
  const meta = {
    source: 'pokéapi',
    updatedAt: new Date().toISOString(),
    count: pokemon.length,
    checksum: { algo: 'sha256', value: checksum },
    schema: 1,
  };
  await writeFile(metaPath, JSON.stringify(meta, null, 2));
  const trigger = {
    kind: 'dex-sync-trigger',
    version: 1,
    updatedAt: meta.updatedAt,
    checksum: meta.checksum.value,
    count: meta.count,
  };
  await writeFile(TRIGGER_FILE, JSON.stringify(trigger, null, 2));
  return { dataPath, gzPath, metaPath };
}

export async function main() {
  console.log(formatStatus('Fetching Pokémon index…', 'info'));
  const pokemon = await fetchAllPokemon();
  console.log(formatStatus(`Fetched ${pokemon.length} Pokémon.`, 'success'));
  const out = await writeCache(pokemon);
  console.log(formatStatus(`Cache written: ${out.dataPath}`, 'success'));
  console.log(formatStatus(`Meta: ${path.join(CACHE_DIR, 'meta.json')}`, 'info'));
}

const invokedDirectly = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    return import.meta.url === pathToFileURL(arg).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  main().catch((error) => {
    console.log(formatStatus('fetch_pokemon failed', 'error'));
    console.error(error);
    process.exit(1);
  });
}
