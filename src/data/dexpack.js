import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import {
  PACK,
  NAME_HASH_SIZE,
  NAME_HASH_IDS,
  NAME_HASH_KEYS,
  ALIAS_HASH_SIZE,
  ALIAS_HASH_IDS,
  ALIAS_HASH_KEYS,
  SPECIES_STAT_INDEX,
  SPECIES_BASE_STATS,
  SPECIES_MATCHUP_INDEX,
  SPECIES_MATCHUPS,
} from "../../assets/dexpack.gen.mjs";
import { loadDexV2Runtime, resetDexV2Runtime } from "../dex/v2/loader.js";
import { recordDexLoad, recordDexFallback, recordDexLookup, recordDexLookupMiss } from "../dex/metrics.js";
import { DEX_V2_ENABLED } from "../config/env.js";

/**
 * @typedef {{ move: string; level: number | null }} LearnsetLevelEntry
 *
 * @typedef {{
 *   id: number;
 *   slug: string;
 *   name: string;
 *   typing: string[];
 *   abilities: Array<{ name: string; hidden: boolean; slot: number }>;
 *   baseStats: { hp: number; atk: number; def: number; spAtk: number; spDef: number; spe: number };
 *   height: number | null;
 *   weight: number | null;
 *   learnsets: {
 *     level: LearnsetLevelEntry[];
 *     machine: string[];
 *     tutor: string[];
 *     egg: string[];
 *   };
 *   matchups: Record<string, number>;
 *   aliases: string[];
 * }} SpeciesDoc
 *
 * @typedef {{
 *   id: number;
 *   name: string;
 *   slug: string;
 *   type: string | null;
 *   category: string | null;
 *   power: number | null;
 *   accuracy: number | null;
 *   pp: number | null;
 *   priority: number;
 *   target: string | null;
 *   effect: string | null;
 *   meta: Record<string, unknown> | null;
 * }} MoveDoc
 *
 * @typedef {{
 *   meta: {
 *     schema: string;
 *     generatedAt: string;
 *     source: {
 *       versionGroup: string | null;
 *       versionGroupId: number | null;
 *       builtAt: string | null;
 *       cacheChecksum: string | null;
 *       cacheCount: number | null;
 *       cacheUpdatedAt: string | null;
 *     };
 *     counts: {
 *       species: number;
 *       moves: number;
 *     };
 *   };
 *   byId: Record<string, SpeciesDoc>;
 *   byName: Record<string, number>;
 *   byAlias: Record<string, number>;
 *   moves: Record<string, MoveDoc>;
 *   types: {
 *     order: string[];
 *     chart: Record<string, Record<string, number>>;
 *   };
 * }} DexPack
 *
 * @typedef {{
 *   size: number;
 *   ids: Int32Array;
 *   keys: string[];
 * }} DexpackHashTable
 *
 * @typedef {{
 *   statIndex: Int32Array;
 *   baseStats: Uint16Array;
 *   matchupIndex: Int32Array;
 *   matchups: Float32Array;
 *   typeOrder: string[];
 *   nameTable: DexpackHashTable | null;
 *   aliasTable: DexpackHashTable | null;
 * }} FastDexpack
 */

const MODULE_ORIGIN = "module:assets/dexpack.gen.mjs";

const RUNTIME_SOURCE = {
  MODULE: "module",
  V2: "v2",
  CUSTOM: "custom",
};

/** @type {{ pack: DexPack | null; loadedFrom: string | null; fast: FastDexpack | null; runtime: string | null }} */
const state = {
  pack: PACK,
  loadedFrom: MODULE_ORIGIN,
  fast: createFastFromModule(),
  runtime: RUNTIME_SOURCE.MODULE,
};

let v2RuntimeFailed = false;

const DEFAULT_JSON_FILES = [
  path.join(process.cwd(), "assets", "dexpack.v1.json.gz"),
  path.join(process.cwd(), "assets", "dexpack.v1.json"),
  path.join(process.cwd(), "data", "bootstrap", "dexpack.v1.json"),
];

function normalizeLookup(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function nextPowerOfTwo(value) {
  let size = 1;
  while (size < value) {
    size <<= 1;
  }
  return size;
}

function buildHashTableFromEntries(entries) {
  if (!entries || entries.length === 0) {
    return null;
  }

  const size = nextPowerOfTwo(entries.length * 2);
  const mask = size - 1;
  const ids = new Int32Array(size).fill(-1);
  const keys = new Array(size).fill("");

  for (const [key, value] of entries) {
    const hash = hashString(key);
    let index = hash & mask;
    let step = (hash >>> 16) & mask;
    if (step === 0) {
      step = 1;
    }

    for (let attempt = 0; attempt < size; attempt += 1) {
      if (ids[index] === -1) {
        ids[index] = value;
        keys[index] = key;
        break;
      }
      index = (index + step) & mask;
    }
  }

  return { size, ids, keys };
}

function lookupInHashTable(normalized, table) {
  if (!table || typeof normalized !== "string" || normalized.length === 0) {
    return null;
  }

  const { size, ids, keys } = table;
  if (!size || !ids || ids.length !== size) {
    return null;
  }

  const mask = size - 1;
  const hash = hashString(normalized);
  let index = hash & mask;
  let step = (hash >>> 16) & mask;
  if (step === 0) {
    step = 1;
  }

  for (let attempt = 0; attempt < size; attempt += 1) {
    const key = keys[index];
    if (!key) {
      return null;
    }
    if (key === normalized) {
      const id = ids[index];
      return typeof id === "number" && id >= 0 ? id : null;
    }
    index = (index + step) & mask;
  }

  return null;
}

function buildFastStateFromPack(pack) {
  if (!pack) {
    return null;
  }

  const species = Object.values(pack.byId || {}).sort((a, b) => a.id - b.id);
  if (species.length === 0) {
    return null;
  }

  const typeOrder = Array.isArray(pack.types?.order) ? [...pack.types.order] : [];
  const maxId = species.reduce((max, doc) => Math.max(max, doc.id), 0);
  const statIndex = new Int32Array(maxId + 1).fill(-1);
  const matchupIndex = new Int32Array(maxId + 1).fill(-1);
  const baseStats = new Uint16Array(species.length * 6);
  const matchups = new Float32Array(species.length * typeOrder.length);

  for (let i = 0; i < species.length; i += 1) {
    const doc = species[i];
    const statOffset = i * 6;
    baseStats[statOffset + 0] = doc.baseStats?.hp ?? 1;
    baseStats[statOffset + 1] = doc.baseStats?.atk ?? 1;
    baseStats[statOffset + 2] = doc.baseStats?.def ?? 1;
    baseStats[statOffset + 3] = doc.baseStats?.spAtk ?? 1;
    baseStats[statOffset + 4] = doc.baseStats?.spDef ?? 1;
    baseStats[statOffset + 5] = doc.baseStats?.spe ?? 1;
    statIndex[doc.id] = statOffset;

    const matchupOffset = i * typeOrder.length;
    for (let j = 0; j < typeOrder.length; j += 1) {
      const type = typeOrder[j];
      const value = doc.matchups?.[type];
      matchups[matchupOffset + j] = typeof value === "number" && Number.isFinite(value) ? value : 1;
    }
    matchupIndex[doc.id] = matchupOffset;
  }

  const nameTable = buildHashTableFromEntries(Object.entries(pack.byName || {}));
  const aliasTable = buildHashTableFromEntries(Object.entries(pack.byAlias || {}));

  return {
    statIndex,
    baseStats,
    matchupIndex,
    matchups,
    typeOrder,
    nameTable,
    aliasTable,
  };
}

function createFastFromModule() {
  const nameTable = NAME_HASH_SIZE
    ? { size: NAME_HASH_SIZE, ids: NAME_HASH_IDS, keys: NAME_HASH_KEYS }
    : null;
  const aliasTable = ALIAS_HASH_SIZE
    ? { size: ALIAS_HASH_SIZE, ids: ALIAS_HASH_IDS, keys: ALIAS_HASH_KEYS }
    : null;

  return {
    statIndex: SPECIES_STAT_INDEX,
    baseStats: SPECIES_BASE_STATS,
    matchupIndex: SPECIES_MATCHUP_INDEX,
    matchups: SPECIES_MATCHUPS,
    typeOrder: Array.isArray(PACK?.types?.order) ? [...PACK.types.order] : [],
    nameTable,
    aliasTable,
  };
}

function assignFastState(payload) {
  if (!payload) {
    state.fast = null;
    return;
  }
  state.fast = {
    statIndex: payload.statIndex,
    baseStats: payload.baseStats,
    matchupIndex: payload.matchupIndex,
    matchups: payload.matchups,
    typeOrder: Array.isArray(payload.typeOrder) ? [...payload.typeOrder] : [],
    nameTable: payload.nameTable ?? null,
    aliasTable: payload.aliasTable ?? null,
  };
}

function readCandidate(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return null;
    }
    const data = fs.readFileSync(filePath);
    if (filePath.endsWith(".gz")) {
      return { buffer: gunzipSync(data), path: filePath };
    }
    return { buffer: data, path: filePath };
  } catch {
    return null;
  }
}

function pickSource(customPath) {
  const candidates = customPath ? [path.resolve(customPath)] : DEFAULT_JSON_FILES;
  for (const candidate of candidates) {
    const resolved = readCandidate(candidate);
    if (resolved) {
      return resolved;
    }
  }
  throw new Error(
    `dexpack not found — looked for ${candidates.map((candidate) => path.relative(process.cwd(), candidate)).join(", ")}`,
  );
}

function parseDexpack(buffer) {
  return JSON.parse(buffer.toString("utf8"));
}

function loadDexpackFromModule() {
  state.pack = PACK;
  state.loadedFrom = MODULE_ORIGIN;
  assignFastState(createFastFromModule());
  state.runtime = RUNTIME_SOURCE.MODULE;
  recordDexLoad({
    runtime: RUNTIME_SOURCE.MODULE,
    source: "module",
    counts: PACK?.meta?.counts,
    path: MODULE_ORIGIN,
  });
  return state.pack;
}

function loadDexpackFromCustom(customPath) {
  const { buffer, path: resolvedPath } = pickSource(customPath);
  const pack = parseDexpack(buffer);
  state.pack = pack;
  state.loadedFrom = resolvedPath;
  assignFastState(buildFastStateFromPack(pack));
  state.runtime = RUNTIME_SOURCE.CUSTOM;
  recordDexLoad({
    runtime: RUNTIME_SOURCE.CUSTOM,
    source: "custom",
    counts: pack?.meta?.counts,
    path: resolvedPath,
  });
  return pack;
}

function loadDexpackFromV2(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const runtime = loadDexV2Runtime({ rootDir });
  state.pack = runtime.pack;
  state.loadedFrom = path.join(rootDir, "assets", "dexpack.v2.json");
  assignFastState({
    statIndex: runtime.statIndex,
    baseStats: runtime.baseStats,
    matchupIndex: runtime.matchupIndex,
    matchups: runtime.matchups,
    typeOrder: runtime.pack?.types?.order,
    nameTable: runtime.nameHash,
    aliasTable: runtime.aliasHash,
  });
  state.runtime = RUNTIME_SOURCE.V2;
  v2RuntimeFailed = false;
  recordDexLoad({
    runtime: RUNTIME_SOURCE.V2,
    source: "v2",
    counts: runtime.pack?.meta?.counts,
    manifestHash: runtime.manifest?.hash,
    path: state.loadedFrom,
  });
  return state.pack;
}

export function loadDexpack(customPath) {
  if (customPath) {
    return loadDexpackFromCustom(customPath);
  }

  if (DEX_V2_ENABLED && state.runtime !== RUNTIME_SOURCE.CUSTOM && !v2RuntimeFailed) {
    if (state.runtime === RUNTIME_SOURCE.V2 && state.pack) {
      return state.pack;
    }
    try {
      return loadDexpackFromV2({ rootDir: process.cwd() });
    } catch (error) {
      recordDexFallback({ runtime: RUNTIME_SOURCE.V2, reason: "load_error", error });
      if (!v2RuntimeFailed) {
        console.warn(
          `[dexpack] failed to load dexpack.v2 runtime, falling back to v1: ${error instanceof Error ? error.message : error}`,
        );
      }
      v2RuntimeFailed = true;
      return loadDexpackFromModule();
    }
  }

  if (state.pack) {
    return state.pack;
  }

  return loadDexpackFromModule();
}

function requirePack() {
  if (DEX_V2_ENABLED) {
    if (state.runtime !== RUNTIME_SOURCE.V2 && state.runtime !== RUNTIME_SOURCE.CUSTOM && !v2RuntimeFailed) {
      loadDexpack();
    }
  } else if (!state.pack) {
    loadDexpack();
  }

  if (!state.pack) {
    throw new Error("dexpack not loaded");
  }

  return state.pack;
}

export function getDexpack() {
  return requirePack();
}

export function getLoadedPath() {
  return state.loadedFrom ?? MODULE_ORIGIN;
}

export function getSpecies(query) {
  const pack = requirePack();
  const runtimeTag = state.runtime ?? RUNTIME_SOURCE.MODULE;
  const startedAt = Date.now();
  if (typeof query === "number" && Number.isFinite(query)) {
    const doc = pack.byId[String(query)] ?? null;
    recordDexLookup({ runtime: runtimeTag, query, resolution: "id", found: Boolean(doc), durationMs: Date.now() - startedAt });
    return doc;
  }
  const key = normalizeLookup(query);
  if (!key) {
    recordDexLookupMiss({ runtime: runtimeTag, query, attemptedResolutions: ["empty"] });
    recordDexLookup({ runtime: runtimeTag, query, resolution: "empty", found: false, durationMs: Date.now() - startedAt });
    return null;
  }
  const fast = state.fast;
  const attempted = [];
  let resolution = "unknown";
  let id = null;

  if (fast?.nameTable) {
    attempted.push("name-hash");
    const lookupId = lookupInHashTable(key, fast.nameTable);
    if (lookupId != null) {
      id = lookupId;
      resolution = "name-hash";
    }
  }

  if (id == null && fast?.aliasTable) {
    attempted.push("alias-hash");
    const aliasId = lookupInHashTable(key, fast.aliasTable);
    if (aliasId != null) {
      id = aliasId;
      resolution = "alias-hash";
    }
  }

  if (id == null) {
    attempted.push("maps");
    const mapId = pack.byName?.[key] ?? pack.byAlias?.[key] ?? null;
    if (mapId != null) {
      id = mapId;
      resolution = "maps";
    }
  }

  const doc = id ? pack.byId[String(id)] ?? null : null;
  const durationMs = Date.now() - startedAt;
  if (doc) {
    recordDexLookup({ runtime: runtimeTag, query: key, resolution, found: true, durationMs });
    return doc;
  }

  recordDexLookupMiss({ runtime: runtimeTag, query: key, attemptedResolutions: attempted });
  recordDexLookup({ runtime: runtimeTag, query: key, resolution, found: false, durationMs });
  return null;
}

export function getMove(name) {
  const pack = requirePack();
  if (!name) return null;
  const direct = pack.moves[name] ?? pack.moves[String(name).toLowerCase()];
  if (direct) return direct;
  const slug = normalizeLookup(name).replace(/\s+/g, "-");
  if (!slug) return null;
  return pack.moves[slug] ?? null;
}

export function getTypeChart() {
  const pack = requirePack();
  return pack.types;
}

export function listSpecies() {
  const pack = requirePack();
  return Object.values(pack.byId);
}

export function suggestSpecies(prefix, limit = 25) {
  const pack = requirePack();
  const normalized = normalizeLookup(prefix);
  if (!normalized) return [];
  const results = [];
  const seen = new Set();
  const push = (id) => {
    if (results.length >= limit) return;
    const species = pack.byId[String(id)];
    if (species && !seen.has(species.name)) {
      seen.add(species.name);
      results.push(species.name);
    }
  };

  for (const [key, id] of Object.entries(pack.byName)) {
    if (key.startsWith(normalized) || key.includes(normalized)) {
      push(id);
      if (results.length >= limit) {
        return results;
      }
    }
  }

  if (results.length < limit) {
    for (const [key, id] of Object.entries(pack.byAlias)) {
      if (key.startsWith(normalized) || key.includes(normalized)) {
        push(id);
        if (results.length >= limit) {
          break;
        }
      }
    }
  }

  return results;
}

function getFastStatSlice(id) {
  const fast = state.fast;
  if (!fast || !fast.statIndex || !fast.baseStats) {
    return null;
  }
  if (id < 0 || id >= fast.statIndex.length) {
    return null;
  }
  const offset = fast.statIndex[id];
  if (typeof offset !== "number" || offset < 0) {
    return null;
  }
  return fast.baseStats.subarray(offset, offset + 6);
}

function getFastMatchupSlice(id) {
  const fast = state.fast;
  if (!fast || !fast.matchupIndex || !fast.matchups) {
    return null;
  }
  if (id < 0 || id >= fast.matchupIndex.length) {
    return null;
  }
  const offset = fast.matchupIndex[id];
  if (typeof offset !== "number" || offset < 0) {
    return null;
  }
  const length = fast.typeOrder?.length ?? 0;
  if (!length) {
    return null;
  }
  return fast.matchups.subarray(offset, offset + length);
}

export function getSpeciesBaseStats(id) {
  const numericId = Number(id);
  const slice = Number.isFinite(numericId) ? getFastStatSlice(numericId) : null;
  if (slice) {
    return {
      hp: slice[0],
      atk: slice[1],
      def: slice[2],
      spAtk: slice[3],
      spDef: slice[4],
      spe: slice[5],
    };
  }
  const pack = requirePack();
  const doc = pack.byId?.[String(id)];
  return doc?.baseStats ? { ...doc.baseStats } : null;
}

export function getSpeciesMatchups(id) {
  const numericId = Number(id);
  const fast = state.fast;
  const slice = Number.isFinite(numericId) ? getFastMatchupSlice(numericId) : null;
  if (slice && fast?.typeOrder?.length) {
    const result = {};
    for (let index = 0; index < fast.typeOrder.length; index += 1) {
      const type = fast.typeOrder[index];
      result[type] = slice[index] ?? 1;
    }
    return result;
  }
  const pack = requirePack();
  const doc = pack.byId?.[String(id)];
  return doc?.matchups ? { ...doc.matchups } : {};
}

export function resetDexpack() {
  resetDexV2Runtime();
  state.pack = null;
  state.loadedFrom = null;
  state.fast = null;
  state.runtime = null;
  v2RuntimeFailed = false;
  loadDexpack();
}

export const dexpackState = state;

export default {
  loadDexpack,
  getDexpack,
  getLoadedPath,
  getSpecies,
  getMove,
  getTypeChart,
  listSpecies,
  suggestSpecies,
  getSpeciesBaseStats,
  getSpeciesMatchups,
  resetDexpack,
  dexpackState,
};
