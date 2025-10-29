import fs from 'node:fs/promises';
import path from 'node:path';

import { log } from '../utils/logger.js';

let axios = null;
try {
  const axiosModule = await import('axios');
  axios = axiosModule?.default ?? axiosModule;
} catch {
  axios = null;
}

let cron = null;
try {
  const cronModule = await import('node-cron');
  cron = cronModule?.default ?? cronModule;
} catch {
  cron = null;
}

const POKE_API_URL = 'https://pokeapi.co/api/v2/pokemon';
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 200;
const CONCURRENCY_LIMIT = 20;
const CACHE_FILE_PATH = path.join(process.cwd(), 'data', 'pokemon.json');
const CACHE_FILE_VERSION = 1;
const CRON_SCHEDULE = '0 0 * * 4'; // 12 AM every Thursday
const DEFAULT_TIMEZONE = process.env.POKEMON_CACHE_TZ || 'Etc/UTC';

const HTTP_HEADERS = Object.freeze({
  'User-Agent': 'Infinity-Gauntlet-PokemonService/1.0 (+https://pokeapi.co/)',
});

const DEFAULT_STATS = Object.freeze({
  hp: 0,
  attack: 0,
  defense: 0,
  special_attack: 0,
  special_defense: 0,
  speed: 0,
});

const DEFAULT_SPRITES = Object.freeze({
  default: null,
  shiny: null,
  official_artwork: null,
  home: null,
});

function ensureAxios() {
  if (!axios) {
    throw new Error('axios dependency missing. Install axios to enable Pokémon cache refresh.');
  }
  return axios;
}

function ensureCron() {
  if (!cron) {
    throw new Error('node-cron dependency missing. Install node-cron to schedule Pokémon cache refresh jobs.');
  }
  return cron;
}

let pokemonList = [];
let pokemonById = new Map();
let pokemonByName = new Map();
let lastFetchedAt = null;
let lastFetchAttemptAt = null;
let initializationPromise = null;
let refreshPromise = null;
let cronTask = null;

function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

async function ensureCacheDirectory() {
  await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
}

function normaliseAbility(ability) {
  if (typeof ability === 'string') {
    return { name: ability, is_hidden: false, slot: null };
  }
  if (!ability || typeof ability !== 'object') {
    return null;
  }
  const abilityName = ability.name || ability?.ability?.name;
  if (!abilityName) {
    return null;
  }
  return {
    name: String(abilityName),
    is_hidden: Boolean(ability.is_hidden),
    slot: ability.slot ?? null,
  };
}

function normaliseBaseStats(stats) {
  const output = { ...DEFAULT_STATS };
  if (!Array.isArray(stats)) {
    if (stats && typeof stats === 'object') {
      for (const [key, value] of Object.entries(stats)) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && key in output) {
          output[key] = numeric;
        }
      }
    }
    return output;
  }

  for (const stat of stats) {
    if (!stat || typeof stat !== 'object') {
      continue;
    }
    const name = stat.stat?.name || stat.name;
    const baseValue = Number(stat.base_stat ?? stat.base ?? stat.value);
    if (!name || !Number.isFinite(baseValue)) {
      continue;
    }
    switch (name.toLowerCase()) {
      case 'hp':
        output.hp = baseValue;
        break;
      case 'attack':
        output.attack = baseValue;
        break;
      case 'defense':
        output.defense = baseValue;
        break;
      case 'special-attack':
      case 'special_attack':
      case 'specialattack':
        output.special_attack = baseValue;
        break;
      case 'special-defense':
      case 'special_defense':
      case 'specialdefense':
        output.special_defense = baseValue;
        break;
      case 'speed':
        output.speed = baseValue;
        break;
      default:
        break;
    }
  }
  return output;
}

function normaliseSprites(sprites) {
  const source = sprites && typeof sprites === 'object' ? sprites : {};
  const artwork = source.other?.['official-artwork']?.front_default
    ?? source.other?.['official_artwork']?.front_default
    ?? source.other?.official_artwork?.front_default
    ?? source.official_artwork
    ?? source.officialArtwork
    ?? null;
  const ensureString = (value) => (typeof value === 'string' && value.length ? value : null);
  return {
    default: ensureString(source.front_default ?? source.default),
    shiny: ensureString(source.front_shiny ?? source.shiny),
    official_artwork: ensureString(artwork),
    home: ensureString(source.other?.home?.front_default ?? (typeof source.home === 'object' ? source.home?.front_default : source.home)),
  };
}

function buildPokemonRecord(detail) {
  const types = Array.isArray(detail.types)
    ? detail.types
        .slice()
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        .map((type) => type?.type?.name || type?.name)
        .filter(Boolean)
        .map((name) => String(name))
    : [];

  const abilities = Array.isArray(detail.abilities)
    ? detail.abilities
        .map((ability) => {
          const abilityName = ability?.ability?.name || ability?.name;
          if (!abilityName) {
            return null;
          }
          return {
            name: String(abilityName),
            is_hidden: ability?.is_hidden ?? false,
            slot: ability?.slot ?? null,
          };
        })
        .filter(Boolean)
    : [];

  return {
    id: detail.id,
    name: String(detail.name),
    types,
    abilities,
    base_stats: normaliseBaseStats(detail.stats),
    sprites: normaliseSprites(detail.sprites),
  };
}

function freezePokemonEntry(entry) {
  const abilities = Array.isArray(entry.abilities)
    ? entry.abilities
        .map(normaliseAbility)
        .filter(Boolean)
        .map((ability) => Object.freeze({
          name: ability.name,
          is_hidden: Boolean(ability.is_hidden),
          slot: ability.slot ?? null,
        }))
    : [];

  const types = Array.isArray(entry.types)
    ? entry.types.map((type) => type && String(type).toLowerCase()).filter(Boolean)
    : [];

  const baseStats = normaliseBaseStats(entry.base_stats ?? entry.baseStats ?? entry.stats);
  const sprites = { ...DEFAULT_SPRITES, ...normaliseSprites(entry.sprites) };

  const frozen = Object.freeze({
    id: Number(entry.id),
    name: String(entry.name),
    types: Object.freeze(types),
    abilities: Object.freeze(abilities),
    base_stats: Object.freeze(baseStats),
    sprites: Object.freeze(sprites),
  });

  return frozen;
}

function normaliseCachedEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const id = Number(entry.id);
  const name = entry.name ?? entry.pokemon;
  if (!Number.isFinite(id) || !name) {
    return null;
  }
  return {
    id,
    name: String(name),
    types: Array.isArray(entry.types) ? entry.types : Array.isArray(entry.type) ? entry.type : [],
    abilities: Array.isArray(entry.abilities) ? entry.abilities : [],
    base_stats: entry.base_stats ?? entry.baseStats ?? entry.stats ?? {},
    sprites: entry.sprites ?? {},
  };
}

function setPokemonCache(list, fetchedAt) {
  const frozenList = list
    .map(normaliseCachedEntry)
    .filter(Boolean)
    .map(freezePokemonEntry)
    .sort((a, b) => a.id - b.id);

  pokemonList = Object.freeze(frozenList);
  pokemonById = new Map();
  pokemonByName = new Map();
  for (const entry of frozenList) {
    pokemonById.set(entry.id, entry);
    pokemonByName.set(entry.name.toLowerCase(), entry);
  }

  if (fetchedAt instanceof Date && !Number.isNaN(fetchedAt.getTime())) {
    lastFetchedAt = new Date(fetchedAt.getTime());
  } else if (typeof fetchedAt === 'string') {
    const parsed = new Date(fetchedAt);
    if (!Number.isNaN(parsed.getTime())) {
      lastFetchedAt = parsed;
    }
  } else {
    lastFetchedAt = new Date();
  }
}

async function loadCacheFromDisk() {
  try {
    const raw = await fs.readFile(CACHE_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed) {
      return null;
    }
    if (Array.isArray(parsed)) {
      return { list: parsed, fetchedAt: null };
    }
    const list = Array.isArray(parsed.pokemon) ? parsed.pokemon : null;
    if (!list) {
      return null;
    }
    const fetchedAt = parsed.lastFetchedAt || parsed.fetchedAt || null;
    return { list, fetchedAt };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    log('warn', 'Failed to read Pokémon cache from disk', { error, cacheFile: CACHE_FILE_PATH });
    return null;
  }
}

async function writeCacheToDisk(list, fetchedAt) {
  try {
    await ensureCacheDirectory();
    const iso = (fetchedAt instanceof Date && !Number.isNaN(fetchedAt.getTime()))
      ? fetchedAt.toISOString()
      : new Date().toISOString();
    const payload = {
      version: CACHE_FILE_VERSION,
      lastFetchedAt: iso,
      total: Array.isArray(list) ? list.length : 0,
      pokemon: Array.isArray(list) ? list : [],
    };
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(payload, null, 2), 'utf8');
  } catch (error) {
    log('warn', 'Failed to write Pokémon cache to disk', { error, cacheFile: CACHE_FILE_PATH });
  }
}

async function getJson(url) {
  const http = ensureAxios();
  const response = await http.get(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: HTTP_HEADERS,
  });
  return response.data;
}

async function fetchPokemonRoster() {
  const startedAt = Date.now();
  log('info', 'Fetching Pokémon roster index from PokéAPI', {
    url: POKE_API_URL,
    startedAt: new Date(startedAt).toISOString(),
  });

  const listings = [];
  let nextUrl = `${POKE_API_URL}?limit=${PAGE_SIZE}&offset=0`;
  while (nextUrl) {
    const page = await getJson(nextUrl);
    const results = Array.isArray(page?.results) ? page.results : [];
    listings.push(...results);
    nextUrl = page?.next || null;
    log('detail', 'Fetched Pokémon index page', {
      accumulated: listings.length,
      pageSize: results.length,
      total: page?.count ?? null,
    });
  }

  if (listings.length === 0) {
    throw new Error('PokéAPI returned an empty roster.');
  }

  log('info', 'Fetching detailed Pokémon data', {
    total: listings.length,
    concurrency: CONCURRENCY_LIMIT,
  });

  const fetchStarted = Date.now();
  const details = await runWithConcurrency(listings, CONCURRENCY_LIMIT, async (entry, index) => {
    const detail = await getJson(entry.url);
    const normalised = buildPokemonRecord(detail);

    if ((index + 1) % 50 === 0 || index + 1 === listings.length) {
      log('detail', 'Fetched Pokémon details progress', {
        fetched: index + 1,
        total: listings.length,
      });
    }

    return normalised;
  });

  log('info', 'Completed Pokémon roster fetch', {
    total: details.length,
    indexDurationMs: fetchStarted - startedAt,
    detailDurationMs: Date.now() - fetchStarted,
  });

  return details;
}

async function runWithConcurrency(items, limit, iterator) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const currentIndex = index++;
      if (currentIndex >= items.length) {
        break;
      }
      results[currentIndex] = await iterator(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function refreshPokemonCache(options = {}) {
  if (refreshPromise) {
    return refreshPromise;
  }

  const { reason = 'manual' } = options;
  refreshPromise = (async () => {
    const startedAt = new Date();
    lastFetchAttemptAt = startedAt;
    log('info', 'Refreshing Pokémon cache', {
      reason,
      startedAt: startedAt.toISOString(),
    });

    const roster = await fetchPokemonRoster();
    setPokemonCache(roster, startedAt);
    await writeCacheToDisk(roster, startedAt);

    log('info', 'pokemon.cache.count', {
      total: pokemonList.length,
      reason,
      fetchedAt: startedAt.toISOString(),
    });

    log('info', 'Pokémon cache refresh complete', {
      reason,
      total: pokemonList.length,
      durationMs: Date.now() - startedAt.getTime(),
      cacheFile: CACHE_FILE_PATH,
    });

    return {
      total: pokemonList.length,
      lastFetchedAt,
    };
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

function scheduleWeeklyRefresh() {
  if (cronTask) {
    return;
  }

  const cronApi = ensureCron();
  cronTask = cronApi.schedule(
    CRON_SCHEDULE,
    () => {
      refreshPokemonCache({ reason: 'scheduled' }).catch((error) => {
        log('error', 'Scheduled Pokémon cache refresh failed', { error });
      });
    },
    { timezone: DEFAULT_TIMEZONE }
  );

  log('info', 'Scheduled weekly Pokémon cache refresh', {
    cron: CRON_SCHEDULE,
    timezone: DEFAULT_TIMEZONE,
  });
}

async function initializePokemonCache() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    await ensureCacheDirectory();

    const disk = await loadCacheFromDisk();
    if (disk && Array.isArray(disk.list) && disk.list.length > 0) {
      setPokemonCache(disk.list, disk.fetchedAt);
      log('info', 'Loaded Pokémon cache from disk', {
        cacheFile: CACHE_FILE_PATH,
        total: pokemonList.length,
        lastFetchedAt: lastFetchedAt ? lastFetchedAt.toISOString() : null,
      });
    }

    try {
      await refreshPokemonCache({ reason: 'startup' });
    } catch (error) {
      if (!pokemonList.length) {
        log('error', 'Failed to initialize Pokémon cache and no cached data available', { error });
        throw error;
      }
      log('warn', 'Pokémon cache refresh failed during startup; continuing with cached data', { error });
    }

    scheduleWeeklyRefresh();

    return {
      total: pokemonList.length,
      lastFetchedAt,
    };
  })();

  try {
    return await initializationPromise;
  } finally {
    initializationPromise = null;
  }
}

function assertCacheReady() {
  if (!pokemonList.length) {
    throw new Error('Pokémon cache has not been initialized. Call initializePokemonCache() first.');
  }
}

async function getPokemon(identifier) {
  if (initializationPromise) {
    await initializationPromise;
  }
  if (refreshPromise) {
    await refreshPromise.catch(() => {});
  }
  assertCacheReady();

  let entry;
  if (typeof identifier === 'number') {
    entry = pokemonById.get(identifier);
  } else if (typeof identifier === 'string') {
    const trimmed = identifier.trim().toLowerCase();
    if (/^\d+$/.test(trimmed)) {
      entry = pokemonById.get(Number(trimmed));
    }
    if (!entry) {
      entry = pokemonByName.get(trimmed);
    }
  }

  return entry ? cloneValue(entry) : null;
}

async function getAllPokemon() {
  if (initializationPromise) {
    await initializationPromise;
  }
  if (refreshPromise) {
    await refreshPromise.catch(() => {});
  }
  assertCacheReady();
  return cloneValue(Array.from(pokemonList));
}

function getCacheMetadata() {
  return {
    cacheFile: CACHE_FILE_PATH,
    total: pokemonList.length,
    lastFetchedAt: lastFetchedAt ? new Date(lastFetchedAt.getTime()) : null,
    lastFetchAttemptAt: lastFetchAttemptAt ? new Date(lastFetchAttemptAt.getTime()) : null,
    cron: CRON_SCHEDULE,
    timezone: DEFAULT_TIMEZONE,
  };
}

export {
  initializePokemonCache,
  refreshPokemonCache,
  getPokemon,
  getAllPokemon,
  getCacheMetadata,
};

export default {
  initializePokemonCache,
  refreshPokemonCache,
  getPokemon,
  getAllPokemon,
  getCacheMetadata,
};

