/**
 * Dexpack Loader
 *
 * Provides Pokemon species and move data from compiled dexpack files.
 * Supports V2 runtime with hash table lookups for <1μs performance.
 *
 * @module data/dexpack
 */
import { recordDexFallback, recordDexLookup, recordDexLookupMiss, recordDexLoad } from "../dex/metrics.js";
import { getLogger } from "../shared/logging/index.js";
import { DEX_V2_ENABLED } from "../config/env.js";
import { resetDexV2Runtime, loadDexV2Runtime, getDexV2Pack, getDexV2FastTables } from "../dex/v2/loader.js";
import { ensureError, getErrorMessage } from "../shared/utils/error-utils.js";
const logger = getLogger();
/** Runtime source identifiers */
export const RUNTIME_SOURCE = {
    MODULE: "module",
    V2: "v2",
    CUSTOM: "custom",
};
// ============================================================================
// Constants
// ============================================================================
const MODULE_ORIGIN = "assets/dexpack.v1.json";
const FNV_PRIME = 0x01000193;
const FNV_OFFSET = 0x811c9dc5;
// ============================================================================
// Module State
// ============================================================================
const state = {
    pack: null,
    loadedFrom: null,
    fast: null,
    runtime: null,
};
let v2RuntimeFailed = false;
// ============================================================================
// Hash Table Implementation
// ============================================================================
/**
 * Normalize a lookup key (lowercase, trim whitespace)
 */
export function normalizeLookup(input) {
    if (typeof input !== "string")
        return "";
    return input.toLowerCase().trim();
}
/**
 * FNV-1a hash function for strings
 */
function hashString(str) {
    let hash = FNV_OFFSET;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
}
/**
 * Get next power of two (for hash table sizing)
 */
function nextPowerOfTwo(n) {
    let v = n - 1;
    v |= v >> 1;
    v |= v >> 2;
    v |= v >> 4;
    v |= v >> 8;
    v |= v >> 16;
    return v + 1;
}
/**
 * Build a hash table from key-value entries
 */
function buildHashTableFromEntries(entries) {
    if (entries.length === 0)
        return null;
    const capacity = nextPowerOfTwo(Math.max(entries.length * 2, 16));
    const keys = new Uint32Array(capacity);
    const values = new Uint16Array(capacity);
    // Initialize with empty markers
    keys.fill(0);
    values.fill(0);
    for (const [key, value] of entries) {
        const hash = hashString(key);
        let idx = hash & (capacity - 1);
        let probes = 0;
        while (keys[idx] !== 0 && probes < capacity) {
            idx = (idx + 1) & (capacity - 1);
            probes++;
        }
        if (probes >= capacity) {
            logger.warn('dexpack', 'buildHashTable', 'Hash table overflow during build');
            return null;
        }
        keys[idx] = hash;
        values[idx] = value;
    }
    return { keys, values, capacity };
}
/**
 * Look up a value in a hash table
 */
function lookupInHashTable(key, table) {
    const hash = hashString(key);
    let idx = hash & (table.capacity - 1);
    let probes = 0;
    while (probes < table.capacity) {
        if (table.keys[idx] === 0)
            return null;
        if (table.keys[idx] === hash)
            return table.values[idx];
        idx = (idx + 1) & (table.capacity - 1);
        probes++;
    }
    return null;
}
// ============================================================================
// Fast State Building
// ============================================================================
/**
 * Build fast lookup state from a loaded pack
 */
function buildFastStateFromPack(pack) {
    const nameEntries = [];
    const aliasEntries = [];
    for (const [name, id] of Object.entries(pack.byName)) {
        nameEntries.push([name, id]);
    }
    for (const [alias, id] of Object.entries(pack.byAlias)) {
        aliasEntries.push([alias, id]);
    }
    const fast = {
        nameTable: buildHashTableFromEntries(nameEntries),
        aliasTable: buildHashTableFromEntries(aliasEntries),
        statIndex: null,
        baseStats: null,
        matchupIndex: null,
        matchups: null,
        typeOrder: null,
    };
    // Build stat index if we have species
    const speciesList = Object.values(pack.byId);
    if (speciesList.length > 0) {
        const maxId = Math.max(...speciesList.map((s) => s.id));
        fast.statIndex = new Uint16Array(maxId + 1);
        fast.baseStats = new Uint16Array(speciesList.length * 6);
        let offset = 0;
        for (const species of speciesList) {
            fast.statIndex[species.id] = offset;
            fast.baseStats[offset] = species.baseStats.hp;
            fast.baseStats[offset + 1] = species.baseStats.atk;
            fast.baseStats[offset + 2] = species.baseStats.def;
            fast.baseStats[offset + 3] = species.baseStats.spAtk;
            fast.baseStats[offset + 4] = species.baseStats.spDef;
            fast.baseStats[offset + 5] = species.baseStats.spe;
            offset += 6;
        }
    }
    // Build matchup index if we have type chart
    if (pack.types && Object.keys(pack.types).length > 0) {
        fast.typeOrder = Object.keys(pack.types);
        const typeCount = fast.typeOrder.length;
        const speciesList = Object.values(pack.byId);
        if (speciesList.length > 0) {
            const maxId = Math.max(...speciesList.map((s) => s.id));
            fast.matchupIndex = new Uint16Array(maxId + 1);
            fast.matchups = new Float32Array(speciesList.length * typeCount);
            let offset = 0;
            for (const species of speciesList) {
                fast.matchupIndex[species.id] = offset;
                for (let i = 0; i < typeCount; i++) {
                    const type = fast.typeOrder[i];
                    fast.matchups[offset + i] = species.matchups?.[type] ?? 1;
                }
                offset += typeCount;
            }
        }
    }
    return fast;
}
/**
 * Create fast state from module data
 */
function createFastFromModule(pack) {
    return buildFastStateFromPack(pack);
}
// ============================================================================
// Loading Functions
// ============================================================================
/**
 * Load dexpack from the V1 module
 */
function loadDexpackFromModule() {
    // Dynamic import for the V1 JSON pack
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pack = require("../../assets/dexpack.v1.json");
    state.pack = pack;
    state.loadedFrom = MODULE_ORIGIN;
    state.runtime = RUNTIME_SOURCE.MODULE;
    state.fast = createFastFromModule(pack);
    recordDexLoad({
        source: MODULE_ORIGIN,
        runtime: RUNTIME_SOURCE.MODULE,
        counts: {
            species: Object.keys(pack.byId).length,
            moves: Object.keys(pack.moves).length,
        },
    });
    return pack;
}
/**
 * Load dexpack from V2 runtime
 */
function loadDexpackFromV2(options) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const runtime = loadDexV2Runtime(options);
    const pack = getDexV2Pack(options);
    const fastTables = getDexV2FastTables(options);
    state.pack = pack;
    state.loadedFrom = "assets/dexpack.v2.json";
    state.runtime = RUNTIME_SOURCE.V2;
    state.fast = {
        nameTable: fastTables.nameHash
            ? {
                keys: new Uint32Array(fastTables.nameHash.ids.buffer),
                values: new Uint16Array(fastTables.nameHash.ids.length),
                capacity: fastTables.nameHash.size,
            }
            : null,
        aliasTable: fastTables.aliasHash
            ? {
                keys: new Uint32Array(fastTables.aliasHash.ids.buffer),
                values: new Uint16Array(fastTables.aliasHash.ids.length),
                capacity: fastTables.aliasHash.size,
            }
            : null,
        statIndex: fastTables.statIndex ? new Uint16Array(fastTables.statIndex) : null,
        baseStats: fastTables.baseStats,
        matchupIndex: fastTables.matchupIndex ? new Uint16Array(fastTables.matchupIndex) : null,
        matchups: fastTables.matchups,
        typeOrder: pack.types ? Object.keys(pack.types) : null,
    };
    recordDexLoad({
        source: "assets/dexpack.v2.json",
        runtime: RUNTIME_SOURCE.V2,
        counts: {
            species: Object.keys(pack.byId).length,
            moves: Object.keys(pack.moves).length,
        },
    });
    return pack;
}
/**
 * Main dexpack loading function
 */
export function loadDexpack() {
    if (DEX_V2_ENABLED) {
        if (state.runtime === RUNTIME_SOURCE.V2 && state.pack) {
            return state.pack;
        }
        try {
            return loadDexpackFromV2({ rootDir: process.cwd() });
        }
        catch (error) {
            recordDexFallback({
                runtime: RUNTIME_SOURCE.V2,
                reason: "load_error",
                error: ensureError(error),
            });
            if (!v2RuntimeFailed) {
                logger.warn('dexpack', 'loadDexpack', 'Failed to load dexpack.v2 runtime, falling back to v1', {
                    error: { name: 'DexpackLoadError', message: getErrorMessage(error) }
                });
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
/**
 * Require pack to be loaded (throws if not)
 */
function requirePack() {
    if (DEX_V2_ENABLED) {
        if (state.runtime !== RUNTIME_SOURCE.V2 && state.runtime !== RUNTIME_SOURCE.CUSTOM && !v2RuntimeFailed) {
            loadDexpack();
        }
    }
    else if (!state.pack) {
        loadDexpack();
    }
    if (!state.pack) {
        throw new Error("dexpack not loaded");
    }
    return state.pack;
}
// ============================================================================
// Public API
// ============================================================================
/**
 * Get the loaded dexpack
 */
export function getDexpack() {
    return requirePack();
}
/**
 * Get the path from which dexpack was loaded
 */
export function getLoadedPath() {
    return state.loadedFrom ?? MODULE_ORIGIN;
}
/**
 * Look up a species by ID or name
 */
export function getSpecies(query) {
    // NOTE: Engine L1 Cache integration was removed during TypeScript migration
    // due to type incompatibilities between PokemonCacheEntry and SpeciesDoc.
    // The engine cache uses different data structures (number types, different stat names).
    // This function now uses dexpack-only lookups which are still performant with V2 hash tables.
    const pack = requirePack();
    const runtimeTag = state.runtime ?? RUNTIME_SOURCE.MODULE;
    const startedAt = Date.now();
    if (typeof query === "number" && Number.isFinite(query)) {
        const doc = pack.byId[String(query)] ?? null;
        recordDexLookup({
            runtime: runtimeTag,
            query: String(query),
            resolution: "id",
            found: Boolean(doc),
            durationMs: Date.now() - startedAt,
        });
        return doc;
    }
    const key = normalizeLookup(query);
    if (!key) {
        recordDexLookupMiss({ runtime: runtimeTag, query: String(query), attemptedResolutions: ["empty"] });
        recordDexLookup({
            runtime: runtimeTag,
            query: String(query),
            resolution: "empty",
            found: false,
            durationMs: Date.now() - startedAt,
        });
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
/**
 * Look up a move by name
 */
export function getMove(name) {
    const pack = requirePack();
    if (!name)
        return null;
    const direct = pack.moves[name] ?? pack.moves[String(name).toLowerCase()];
    if (direct)
        return direct;
    const slug = normalizeLookup(name).replace(/\s+/g, "-");
    if (!slug)
        return null;
    return pack.moves[slug] ?? null;
}
/**
 * Get the type effectiveness chart
 */
export function getTypeChart() {
    const pack = requirePack();
    return pack.types;
}
/**
 * List all species
 */
export function listSpecies() {
    const pack = requirePack();
    return Object.values(pack.byId);
}
/**
 * Suggest species names matching a prefix
 */
export function suggestSpecies(prefix, limit = 25) {
    const pack = requirePack();
    const normalized = normalizeLookup(prefix);
    if (!normalized)
        return [];
    const results = [];
    const seen = new Set();
    const push = (id) => {
        if (results.length >= limit)
            return;
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
/**
 * Get fast stat slice for a species ID
 */
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
/**
 * Get fast matchup slice for a species ID
 */
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
/**
 * Get base stats for a species by ID
 */
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
/**
 * Get type matchups for a species by ID
 */
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
/**
 * Reset dexpack state and reload
 */
export function resetDexpack() {
    resetDexV2Runtime();
    state.pack = null;
    state.loadedFrom = null;
    state.fast = null;
    state.runtime = null;
    v2RuntimeFailed = false;
    loadDexpack();
}
/** Expose state for debugging */
export const dexpackState = state;
// ============================================================================
// Default Export
// ============================================================================
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
