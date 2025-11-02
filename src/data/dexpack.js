import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

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
 */

/** @type {{ pack: DexPack | null; loadedFrom: string | null }} */
const state = {
  pack: null,
  loadedFrom: null,
};

const DEFAULT_FILES = [
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
  const candidates = customPath ? [path.resolve(customPath)] : DEFAULT_FILES;
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

export function loadDexpack(customPath) {
  const { buffer, path: resolvedPath } = pickSource(customPath);
  const pack = parseDexpack(buffer);
  state.pack = pack;
  state.loadedFrom = resolvedPath;
  return pack;
}

function requirePack() {
  if (!state.pack) {
    return loadDexpack();
  }
  return state.pack;
}

export function getDexpack() {
  return requirePack();
}

export function getLoadedPath() {
  return state.loadedFrom;
}

export function getSpecies(query) {
  const pack = requirePack();
  if (typeof query === "number" && Number.isFinite(query)) {
    return pack.byId[String(query)] ?? null;
  }
  const key = normalizeLookup(query);
  if (!key) return null;
  const id = pack.byName[key] ?? pack.byAlias[key] ?? null;
  return id ? pack.byId[String(id)] ?? null : null;
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

export function resetDexpack() {
  state.pack = null;
  state.loadedFrom = null;
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
  resetDexpack,
  dexpackState,
};
