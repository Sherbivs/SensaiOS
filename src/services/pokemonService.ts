/**
 * Pokemon Service - Cache Management and API Integration
 * @module services/pokemonService
 *
 * Provides Pokemon data access with caching and scheduled refresh from PokéAPI.
 *
 * FEATURES:
 *   - File-based cache persistence to Store directory
 *   - Automatic weekly refresh via cron
 *   - Concurrent batch fetching from PokéAPI
 *   - Frozen immutable Pokemon entries
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { log } from '../utils/logger.js';
import { deepClone, normalizeString } from '../shared/utils/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  special_attack: number;
  special_defense: number;
  speed: number;
}

interface Sprites {
  default: string | null;
  shiny: string | null;
  official_artwork: string | null;
  home: string | null;
}

interface Ability {
  name: string;
  is_hidden: boolean;
  slot: number | null;
}

interface PokemonEntry {
  id: number;
  name: string;
  types: readonly string[];
  abilities: readonly Ability[];
  base_stats: Readonly<BaseStats>;
  sprites: Readonly<Sprites>;
}

interface CacheMetadata {
  cacheFile: string;
  total: number;
  lastFetchedAt: Date | null;
  lastFetchAttemptAt: Date | null;
  cron: string;
  timezone: string;
}

interface RefreshResult {
  total: number;
  lastFetchedAt: Date | null;
}

interface RefreshOptions {
  reason?: string;
}

interface CachePayload {
  version: number;
  lastFetchedAt: string;
  total: number;
  pokemon: unknown[];
}

interface DiskCache {
  list: unknown[];
  fetchedAt: string | null;
}

interface RawAbility {
  name?: string;
  ability?: { name?: string };
  is_hidden?: boolean;
  slot?: number | null;
}

interface RawStat {
  stat?: { name?: string };
  name?: string;
  base_stat?: number;
  base?: number;
  value?: number;
}

interface RawSprites {
  front_default?: string;
  default?: string;
  front_shiny?: string;
  shiny?: string;
  official_artwork?: string;
  officialArtwork?: string;
  home?: string | { front_default?: string };
  other?: {
    'official-artwork'?: { front_default?: string };
    official_artwork?: { front_default?: string };
    home?: { front_default?: string };
  };
}

interface RawType {
  slot?: number;
  type?: { name?: string };
  name?: string;
}

interface RawPokemonDetail {
  id: number;
  name: string;
  types?: RawType[];
  abilities?: RawAbility[];
  stats?: RawStat[] | Record<string, number>;
  sprites?: RawSprites;
}

interface RawCacheEntry {
  id?: number;
  name?: string;
  pokemon?: string;
  types?: string[];
  type?: string[];
  abilities?: unknown[];
  base_stats?: Record<string, number>;
  baseStats?: Record<string, number>;
  stats?: Record<string, number>;
  sprites?: RawSprites;
}

interface PokemonListing {
  name: string;
  url: string;
}

interface PageResponse {
  results?: PokemonListing[];
  next?: string | null;
  count?: number;
}

type ScheduledTask = { stop: () => void };
type AxiosInstance = {
  get: (url: string, config?: { timeout?: number; headers?: Record<string, string> }) => Promise<{ data: unknown }>;
};
type CronScheduler = {
  schedule: (
    schedule: string,
    callback: () => void,
    options?: { timezone?: string }
  ) => ScheduledTask;
};

// ─────────────────────────────────────────────────────────────────────────────
// Lazy Dependencies
// ─────────────────────────────────────────────────────────────────────────────

let axios: AxiosInstance | null = null;
let cron: CronScheduler | null = null;

async function loadAxios(): Promise<AxiosInstance | null> {
  if (axios) return axios;
  try {
    const axiosModule = await import('axios');
    axios = (axiosModule?.default ?? axiosModule) as AxiosInstance;
    return axios;
  } catch {
    return null;
  }
}

async function loadCron(): Promise<CronScheduler | null> {
  if (cron) return cron;
  try {
    const cronModule = await import('node-cron');
    cron = (cronModule?.default ?? cronModule) as unknown as CronScheduler;
    return cron;
  } catch {
    return null;
  }
}

// Initialize lazy dependencies
void loadAxios();
void loadCron();

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const POKE_API_URL = 'https://pokeapi.co/api/v2/pokemon';
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 200;
const CONCURRENCY_LIMIT = 20;

// Store directory: /Store on Render, Store/ locally
const storeRoot = process.env['RENDER'] ? '/Store' : path.join(process.cwd(), 'Store');

const CACHE_FILE_PATH = path.join(storeRoot, 'pokemon-cache.json');
const CACHE_FILE_VERSION = 1;
const CRON_SCHEDULE = '0 0 * * 4'; // 12 AM every Thursday
const DEFAULT_TIMEZONE = process.env['POKEMON_CACHE_TZ'] || 'Etc/UTC';

const HTTP_HEADERS = Object.freeze({
  'User-Agent': 'Infinity-Gauntlet-PokemonService/1.0 (+https://pokeapi.co/)',
});

const DEFAULT_STATS: Readonly<BaseStats> = Object.freeze({
  hp: 0,
  attack: 0,
  defense: 0,
  special_attack: 0,
  special_defense: 0,
  speed: 0,
});

const DEFAULT_SPRITES: Readonly<Sprites> = Object.freeze({
  default: null,
  shiny: null,
  official_artwork: null,
  home: null,
});

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let pokemonList: readonly PokemonEntry[] = [];
let pokemonById = new Map<number, PokemonEntry>();
let pokemonByName = new Map<string, PokemonEntry>();
let lastFetchedAt: Date | null = null;
let lastFetchAttemptAt: Date | null = null;
let initializationPromise: Promise<RefreshResult> | null = null;
let refreshPromise: Promise<RefreshResult> | null = null;
let cronTask: ScheduledTask | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Dependency Helpers
// ─────────────────────────────────────────────────────────────────────────────

function ensureAxios(): AxiosInstance {
  if (!axios) {
    throw new Error('axios dependency missing. Install axios to enable Pokémon cache refresh.');
  }
  return axios;
}

function ensureCron(): CronScheduler {
  if (!cron) {
    throw new Error('node-cron dependency missing. Install node-cron to schedule Pokémon cache refresh jobs.');
  }
  return cron;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────

function cloneValue<T>(value: T): T {
  return deepClone(value) as T;
}

async function ensureCacheDirectory(): Promise<void> {
  await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
}

function normaliseAbility(ability: unknown): Ability | null {
  if (typeof ability === 'string') {
    return { name: ability, is_hidden: false, slot: null };
  }
  if (!ability || typeof ability !== 'object') {
    return null;
  }
  const raw = ability as RawAbility;
  const abilityName = raw.name || raw?.ability?.name;
  if (!abilityName) {
    return null;
  }
  return {
    name: String(abilityName),
    is_hidden: Boolean(raw.is_hidden),
    slot: raw.slot ?? null,
  };
}

function normaliseBaseStats(stats: unknown): BaseStats {
  const output: BaseStats = { ...DEFAULT_STATS };
  if (!Array.isArray(stats)) {
    if (stats && typeof stats === 'object') {
      for (const [key, value] of Object.entries(stats)) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && key in output) {
          (output as unknown as Record<string, number>)[key] = numeric;
        }
      }
    }
    return output;
  }

  for (const stat of stats as RawStat[]) {
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

function normaliseSprites(sprites: unknown): Sprites {
  const source = sprites && typeof sprites === 'object' ? (sprites as RawSprites) : {};
  const artwork =
    source.other?.['official-artwork']?.front_default ??
    source.other?.official_artwork?.front_default ??
    source.official_artwork ??
    source.officialArtwork ??
    null;
  const ensureString = (value: unknown): string | null =>
    typeof value === 'string' && value.length ? value : null;
  const homeValue = source.other?.home?.front_default ??
    (typeof source.home === 'object' ? (source.home as { front_default?: string })?.front_default : source.home);
  return {
    default: ensureString(source.front_default ?? source.default),
    shiny: ensureString(source.front_shiny ?? source.shiny),
    official_artwork: ensureString(artwork),
    home: ensureString(homeValue),
  };
}

function buildPokemonRecord(detail: RawPokemonDetail): {
  id: number;
  name: string;
  types: string[];
  abilities: Ability[];
  base_stats: BaseStats;
  sprites: Sprites;
} {
  const types = Array.isArray(detail.types)
    ? detail.types
        .slice()
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        .map((type) => type?.type?.name || type?.name)
        .filter((name): name is string => Boolean(name))
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
        .filter((a): a is Ability => a !== null)
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

function freezePokemonEntry(entry: {
  id: number;
  name: string;
  types: string[];
  abilities: unknown[];
  base_stats?: Record<string, number>;
  baseStats?: Record<string, number>;
  stats?: Record<string, number>;
  sprites?: RawSprites;
}): PokemonEntry {
  const abilities = Array.isArray(entry.abilities)
    ? entry.abilities
        .map(normaliseAbility)
        .filter((a): a is Ability => a !== null)
        .map((ability) =>
          Object.freeze({
            name: ability.name,
            is_hidden: Boolean(ability.is_hidden),
            slot: ability.slot ?? null,
          })
        )
    : [];

  const types = Array.isArray(entry.types)
    ? entry.types.map((type) => type && String(type).toLowerCase()).filter((t): t is string => Boolean(t))
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

function normaliseCachedEntry(entry: unknown): {
  id: number;
  name: string;
  types: string[];
  abilities: unknown[];
  base_stats: Record<string, number>;
  sprites: RawSprites;
} | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const raw = entry as RawCacheEntry;
  const id = Number(raw.id);
  const name = raw.name ?? raw.pokemon;
  if (!Number.isFinite(id) || !name) {
    return null;
  }
  return {
    id,
    name: String(name),
    types: Array.isArray(raw.types) ? raw.types : Array.isArray(raw.type) ? raw.type : [],
    abilities: Array.isArray(raw.abilities) ? raw.abilities : [],
    base_stats: raw.base_stats ?? raw.baseStats ?? raw.stats ?? {},
    sprites: raw.sprites ?? {},
  };
}

function setPokemonCache(list: unknown[], fetchedAt: Date | string | null): void {
  const frozenList = list
    .map(normaliseCachedEntry)
    .filter((e): e is NonNullable<ReturnType<typeof normaliseCachedEntry>> => e !== null)
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

async function loadCacheFromDisk(): Promise<DiskCache | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed) {
      return null;
    }
    if (Array.isArray(parsed)) {
      return { list: parsed, fetchedAt: null };
    }
    const payload = parsed as { pokemon?: unknown[]; lastFetchedAt?: string; fetchedAt?: string };
    const list = Array.isArray(payload.pokemon) ? payload.pokemon : null;
    if (!list) {
      return null;
    }
    const fetchedAt = payload.lastFetchedAt || payload.fetchedAt || null;
    return { list, fetchedAt };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === 'ENOENT') {
      return null;
    }
    log('warn', 'Failed to read Pokémon cache from disk', { error, cacheFile: CACHE_FILE_PATH });
    return null;
  }
}

async function writeCacheToDisk(list: unknown[], fetchedAt: Date | null): Promise<void> {
  try {
    await ensureCacheDirectory();
    const iso =
      fetchedAt instanceof Date && !Number.isNaN(fetchedAt.getTime())
        ? fetchedAt.toISOString()
        : new Date().toISOString();
    const payload: CachePayload = {
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

async function getJson<T>(url: string): Promise<T> {
  const http = ensureAxios();
  const response = await http.get(url, {
    timeout: REQUEST_TIMEOUT_MS,
    headers: HTTP_HEADERS as Record<string, string>,
  });
  return response.data as T;
}

async function fetchPokemonRoster(): Promise<ReturnType<typeof buildPokemonRecord>[]> {
  const startedAt = Date.now();
  log('info', 'Fetching Pokémon roster index from PokéAPI', {
    url: POKE_API_URL,
    startedAt: new Date(startedAt).toISOString(),
  });

  const listings: PokemonListing[] = [];
  let nextUrl: string | null = `${POKE_API_URL}?limit=${PAGE_SIZE}&offset=0`;
  while (nextUrl) {
    const page: PageResponse = await getJson<PageResponse>(nextUrl);
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
    const detail = await getJson<RawPokemonDetail>(entry.url);
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

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  iterator: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;

  async function worker(): Promise<void> {
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

function scheduleWeeklyRefresh(): void {
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

function assertCacheReady(): void {
  if (!pokemonList.length) {
    throw new Error('Pokémon cache has not been initialized. Call initializePokemonCache() first.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresh the Pokemon cache from PokéAPI.
 */
async function refreshPokemonCache(options: RefreshOptions = {}): Promise<RefreshResult> {
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

/**
 * Initialize the Pokemon cache.
 * Loads from disk, refreshes from API, and schedules weekly refresh.
 */
async function initializePokemonCache(): Promise<RefreshResult> {
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

/**
 * Get a Pokemon by ID or name.
 */
async function getPokemon(identifier: number | string): Promise<PokemonEntry | null> {
  if (initializationPromise) {
    await initializationPromise;
  }
  if (refreshPromise) {
    await refreshPromise.catch(() => {});
  }
  assertCacheReady();

  let entry: PokemonEntry | undefined;
  if (typeof identifier === 'number') {
    entry = pokemonById.get(identifier);
  } else if (typeof identifier === 'string') {
    const trimmed = normalizeString(identifier);
    if (/^\d+$/.test(trimmed)) {
      entry = pokemonById.get(Number(trimmed));
    }
    if (!entry) {
      entry = pokemonByName.get(trimmed);
    }
  }

  return entry ? cloneValue(entry) : null;
}

/**
 * Get all Pokemon.
 */
async function getAllPokemon(): Promise<PokemonEntry[]> {
  if (initializationPromise) {
    await initializationPromise;
  }
  if (refreshPromise) {
    await refreshPromise.catch(() => {});
  }
  assertCacheReady();
  return cloneValue(Array.from(pokemonList));
}

/**
 * Get cache metadata.
 */
function getCacheMetadata(): CacheMetadata {
  return {
    cacheFile: CACHE_FILE_PATH,
    total: pokemonList.length,
    lastFetchedAt: lastFetchedAt ? new Date(lastFetchedAt.getTime()) : null,
    lastFetchAttemptAt: lastFetchAttemptAt ? new Date(lastFetchAttemptAt.getTime()) : null,
    cron: CRON_SCHEDULE,
    timezone: DEFAULT_TIMEZONE,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export {
  initializePokemonCache,
  refreshPokemonCache,
  getPokemon,
  getAllPokemon,
  getCacheMetadata,
};

export type { PokemonEntry, CacheMetadata, RefreshResult, BaseStats, Sprites, Ability };

export default {
  initializePokemonCache,
  refreshPokemonCache,
  getPokemon,
  getAllPokemon,
  getCacheMetadata,
};
