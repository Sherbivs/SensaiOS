import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";

import { DEX_V2_BINARY, DEX_V2_MANIFEST_HASH } from "./accessors.js";

const TEXT_DECODER = new TextDecoder("utf8");
const SECTION_ID = {
  PACK_JSON: 0x0001,
  SPECIES_STAT_INDEX: 0x0100,
  SPECIES_BASE_STATS: 0x0101,
  SPECIES_MATCHUP_INDEX: 0x0102,
  SPECIES_MATCHUPS: 0x0103,
  NAME_HASH_IDS: 0x0200,
  NAME_HASH_KEY_OFFSETS: 0x0201,
  ALIAS_HASH_IDS: 0x0202,
  ALIAS_HASH_KEY_OFFSETS: 0x0203,
  STRINGS_BLOB: 0x0300,
};

let runtimeCache = null;

function parseHeader(buffer) {
  if (buffer.length < 8) {
    throw new Error("dexpack.v2 binary too small");
  }
  const magic = buffer.toString("utf8", 0, 4);
  if (magic !== "DEX2") {
    throw new Error(`dexpack.v2 binary has invalid magic: ${magic}`);
  }
  const version = buffer.readUInt16LE(4);
  if (version !== 2) {
    throw new Error(`dexpack.v2 binary version mismatch (expected 2, got ${version})`);
  }
  const sectionCount = buffer.readUInt16LE(6);
  let cursor = 8;
  const entries = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const id = buffer.readUInt16LE(cursor);
    // uint16 reserved at cursor + 2
    const offset = buffer.readUInt32LE(cursor + 4);
    const length = buffer.readUInt32LE(cursor + 8);
    entries.push({ id, offset, length });
    cursor += 12;
  }
  return entries;
}

function slice(buffer, entry) {
  return buffer.subarray(entry.offset, entry.offset + entry.length);
}

function decodeString(blob, offset) {
  if (offset === 0xffffffff) {
    return "";
  }
  let end = offset;
  while (end < blob.length && blob[end] !== 0) {
    end += 1;
  }
  return TEXT_DECODER.decode(blob.subarray(offset, end));
}

function buildHashTable(idsView, offsetsView, stringBlob) {
  const keys = new Array(offsetsView.length);
  for (let index = 0; index < offsetsView.length; index += 1) {
    keys[index] = decodeString(stringBlob, offsetsView[index]);
  }
  return {
    size: idsView.length,
    ids: idsView,
    keys,
  };
}

function view(buffer, entry, TypedArrayCtor) {
  const sliceView = slice(buffer, entry);
  return new TypedArrayCtor(sliceView.buffer, sliceView.byteOffset, sliceView.byteLength / TypedArrayCtor.BYTES_PER_ELEMENT);
}

function loadRuntime(rootDir = process.cwd()) {
  if (runtimeCache) {
    return runtimeCache;
  }

  const manifestPath = path.join(rootDir, "assets", "dexpack.v2.json");
  const manifestRaw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);

  const binaryName = manifest.binary || DEX_V2_BINARY;
  const binaryPath = path.join(rootDir, "assets", binaryName);
  const binary = fs.readFileSync(binaryPath);

  const actualHash = createHash("sha256").update(binary).digest("hex");
  const expectedHash = manifest.hash || DEX_V2_MANIFEST_HASH;
  if (actualHash !== expectedHash) {
    throw new Error(`dexpack.v2 hash mismatch (expected ${expectedHash}, got ${actualHash})`);
  }

  const alignment = manifest.alignment || 8;
  const headerEntries = parseHeader(binary);
  const layoutById = new Map();
  headerEntries.forEach((entry) => {
    layoutById.set(entry.id, entry);
  });

  const requireSection = (id, label) => {
    const entry = layoutById.get(id);
    if (!entry) {
      throw new Error(`dexpack.v2 missing section ${label}`);
    }
    return entry;
  };

  const packSection = requireSection(SECTION_ID.PACK_JSON, "pack.json");
  const stringsSection = requireSection(SECTION_ID.STRINGS_BLOB, "strings");
  const stringsBlob = new Uint8Array(slice(binary, stringsSection));

  const packJsonBuffer = slice(binary, packSection);
  const pack = JSON.parse(packJsonBuffer.toString("utf8"));

  const statIndex = view(binary, requireSection(SECTION_ID.SPECIES_STAT_INDEX, "species.statIndex"), Int32Array);
  const baseStats = view(binary, requireSection(SECTION_ID.SPECIES_BASE_STATS, "species.baseStats"), Uint16Array);
  const matchupIndex = view(binary, requireSection(SECTION_ID.SPECIES_MATCHUP_INDEX, "species.matchupIndex"), Int32Array);
  const matchups = view(binary, requireSection(SECTION_ID.SPECIES_MATCHUPS, "species.matchups"), Float32Array);

  const nameHashIds = view(binary, requireSection(SECTION_ID.NAME_HASH_IDS, "hash.name.ids"), Int32Array);
  const nameHashOffsets = view(binary, requireSection(SECTION_ID.NAME_HASH_KEY_OFFSETS, "hash.name.keys"), Uint32Array);
  const aliasHashIds = view(binary, requireSection(SECTION_ID.ALIAS_HASH_IDS, "hash.alias.ids"), Int32Array);
  const aliasHashOffsets = view(binary, requireSection(SECTION_ID.ALIAS_HASH_KEY_OFFSETS, "hash.alias.keys"), Uint32Array);

  const nameHash = buildHashTable(nameHashIds, nameHashOffsets, stringsBlob);
  const aliasHash = buildHashTable(aliasHashIds, aliasHashOffsets, stringsBlob);

  runtimeCache = {
    manifest,
    binary,
    alignment,
    pack,
    stringsBlob,
    statIndex,
    baseStats,
    matchupIndex,
    matchups,
    nameHash,
    aliasHash,
  };

  return runtimeCache;
}

function lookupInHash(normalized, table) {
  if (!table || typeof normalized !== "string" || normalized.length === 0) {
    return null;
  }
  const { size, ids, keys } = table;
  if (!size || !ids || ids.length !== size) {
    return null;
  }

  const mask = size - 1;
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  let probe = hash & mask;
  let step = (hash >>> 16) & mask;
  if (step === 0) {
    step = 1;
  }

  for (let attempt = 0; attempt < size; attempt += 1) {
    const key = keys[probe];
    if (!key) {
      return null;
    }
    if (key === normalized) {
      const id = ids[probe];
      return typeof id === "number" && id >= 0 ? id : null;
    }
    probe = (probe + step) & mask;
  }

  return null;
}

function normalizeLookup(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function resetDexV2Runtime() {
  runtimeCache = null;
}

export function loadDexV2Runtime(options = {}) {
  return loadRuntime(options.rootDir);
}

export function lookupSpeciesId(value, options = {}) {
  const runtime = loadRuntime(options.rootDir);
  const normalized = normalizeLookup(value);
  if (!normalized) {
    return null;
  }
  const fromName = lookupInHash(normalized, runtime.nameHash);
  if (fromName != null) {
    return fromName;
  }
  const fromAlias = lookupInHash(normalized, runtime.aliasHash);
  if (fromAlias != null) {
    return fromAlias;
  }
  return runtime.pack.byName?.[normalized] ?? runtime.pack.byAlias?.[normalized] ?? null;
}

export function getDexV2Pack(options = {}) {
  const runtime = loadRuntime(options.rootDir);
  return runtime.pack;
}

export function getDexV2FastTables(options = {}) {
  const runtime = loadRuntime(options.rootDir);
  return {
    statIndex: runtime.statIndex,
    baseStats: runtime.baseStats,
    matchupIndex: runtime.matchupIndex,
    matchups: runtime.matchups,
    nameHash: runtime.nameHash,
    aliasHash: runtime.aliasHash,
  };
}
