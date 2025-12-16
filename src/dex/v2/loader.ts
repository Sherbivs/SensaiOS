import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

import { DEX_V2_BINARY, DEX_V2_MANIFEST_HASH, DEX_V2_SIGNATURE } from './accessors.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SectionEntry {
  id: number;
  offset: number;
  length: number;
}

export interface HashTable {
  size: number;
  ids: Int32Array;
  keys: string[];
}

export interface DexV2Manifest {
  binary?: string;
  signature?: string;
  hash?: string;
  alignment?: number;
}

export interface DexV2Pack {
  byId?: Record<string, unknown>;
  byName?: Record<string, number>;
  byAlias?: Record<string, number>;
  meta?: unknown;
  [key: string]: unknown;
}

export interface DexV2Runtime {
  manifest: DexV2Manifest;
  binary: Buffer;
  signature: string;
  alignment: number;
  pack: DexV2Pack;
  stringsBlob: Uint8Array;
  statIndex: Int32Array;
  baseStats: Uint16Array;
  matchupIndex: Int32Array;
  matchups: Float32Array;
  nameHash: HashTable;
  aliasHash: HashTable;
}

export interface DexV2FastTables {
  statIndex: Int32Array;
  baseStats: Uint16Array;
  matchupIndex: Int32Array;
  matchups: Float32Array;
  nameHash: HashTable;
  aliasHash: HashTable;
}

export interface LoadOptions {
  rootDir?: string;
}

// ============================================================================
// Constants
// ============================================================================

const TEXT_DECODER = new TextDecoder('utf8');

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
} as const;

// ============================================================================
// Module State
// ============================================================================

let runtimeCache: DexV2Runtime | null = null;

// ============================================================================
// Internal Helpers
// ============================================================================

function computeSignature(buffer: Buffer): string {
  return createHash('sha512').update(buffer).digest('hex');
}

function parseHeader(buffer: Buffer): SectionEntry[] {
  if (buffer.length < 8) {
    throw new Error('dexpack.v2 binary too small');
  }
  const magic = buffer.toString('utf8', 0, 4);
  if (magic !== 'DEX2') {
    throw new Error(`dexpack.v2 binary has invalid magic: ${magic}`);
  }
  const version = buffer.readUInt16LE(4);
  if (version !== 2) {
    throw new Error(`dexpack.v2 binary version mismatch (expected 2, got ${version})`);
  }
  const sectionCount = buffer.readUInt16LE(6);
  let cursor = 8;
  const entries: SectionEntry[] = [];
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

function slice(buffer: Buffer, entry: SectionEntry): Buffer {
  return buffer.subarray(entry.offset, entry.offset + entry.length);
}

function decodeString(blob: Uint8Array, offset: number): string {
  if (offset === 0xffffffff) {
    return '';
  }
  let end = offset;
  while (end < blob.length && blob[end] !== 0) {
    end += 1;
  }
  return TEXT_DECODER.decode(blob.subarray(offset, end));
}

function buildHashTable(idsView: Int32Array, offsetsView: Uint32Array, stringBlob: Uint8Array): HashTable {
  const keys = new Array<string>(offsetsView.length);
  for (let index = 0; index < offsetsView.length; index += 1) {
    keys[index] = decodeString(stringBlob, offsetsView[index]);
  }
  return {
    size: idsView.length,
    ids: idsView,
    keys,
  };
}

type TypedArrayConstructor<T> = {
  new (buffer: ArrayBuffer, byteOffset: number, length: number): T;
  BYTES_PER_ELEMENT: number;
};

function view<T extends Int32Array | Uint16Array | Uint32Array | Float32Array>(
  buffer: Buffer,
  entry: SectionEntry,
  TypedArrayCtor: TypedArrayConstructor<T>
): T {
  const sliceView = slice(buffer, entry);
  return new TypedArrayCtor(
    sliceView.buffer as ArrayBuffer,
    sliceView.byteOffset,
    sliceView.byteLength / TypedArrayCtor.BYTES_PER_ELEMENT
  );
}

function loadRuntime(rootDir = process.cwd()): DexV2Runtime {
  if (runtimeCache) {
    return runtimeCache;
  }

  const manifestPath = path.join(rootDir, 'assets', 'dexpack.v2.json');
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw) as DexV2Manifest;

  const binaryName = manifest.binary || DEX_V2_BINARY;
  const binaryPath = path.join(rootDir, 'assets', binaryName);
  const binary = fs.readFileSync(binaryPath);

  const actualSignature = computeSignature(binary);
  const manifestSignature = typeof manifest.signature === 'string' ? manifest.signature : null;
  const trustedSignature =
    typeof DEX_V2_SIGNATURE === 'string' && DEX_V2_SIGNATURE.length > 0
      ? DEX_V2_SIGNATURE
      : manifestSignature;
  if (!trustedSignature) {
    throw new Error('dexpack.v2 signature unavailable — rebuild assets to record the trusted signature');
  }
  if (manifestSignature && manifestSignature !== trustedSignature) {
    throw new Error(
      `dexpack.v2 manifest signature mismatch (expected ${trustedSignature}, got ${manifestSignature})`
    );
  }

  const actualHash = createHash('sha256').update(binary).digest('hex');
  const expectedHash = manifest.hash || DEX_V2_MANIFEST_HASH;
  if (actualHash !== expectedHash) {
    throw new Error(`dexpack.v2 hash mismatch (expected ${expectedHash}, got ${actualHash})`);
  }
  if (actualSignature !== trustedSignature) {
    throw new Error(`dexpack.v2 signature mismatch (expected ${trustedSignature}, got ${actualSignature})`);
  }

  const alignment = manifest.alignment || 8;
  const headerEntries = parseHeader(binary);
  const layoutById = new Map<number, SectionEntry>();
  headerEntries.forEach((entry) => {
    layoutById.set(entry.id, entry);
  });

  const requireSection = (id: number, label: string): SectionEntry => {
    const entry = layoutById.get(id);
    if (!entry) {
      throw new Error(`dexpack.v2 missing section ${label}`);
    }
    return entry;
  };

  const packSection = requireSection(SECTION_ID.PACK_JSON, 'pack.json');
  const stringsSection = requireSection(SECTION_ID.STRINGS_BLOB, 'strings');
  const stringsBlob = new Uint8Array(slice(binary, stringsSection));

  const packJsonBuffer = slice(binary, packSection);
  const pack = JSON.parse(packJsonBuffer.toString('utf8')) as DexV2Pack;

  const statIndex = view(binary, requireSection(SECTION_ID.SPECIES_STAT_INDEX, 'species.statIndex'), Int32Array);
  const baseStats = view(binary, requireSection(SECTION_ID.SPECIES_BASE_STATS, 'species.baseStats'), Uint16Array);
  const matchupIndex = view(binary, requireSection(SECTION_ID.SPECIES_MATCHUP_INDEX, 'species.matchupIndex'), Int32Array);
  const matchups = view(binary, requireSection(SECTION_ID.SPECIES_MATCHUPS, 'species.matchups'), Float32Array);

  const nameHashIds = view(binary, requireSection(SECTION_ID.NAME_HASH_IDS, 'hash.name.ids'), Int32Array);
  const nameHashOffsets = view(binary, requireSection(SECTION_ID.NAME_HASH_KEY_OFFSETS, 'hash.name.keys'), Uint32Array);
  const aliasHashIds = view(binary, requireSection(SECTION_ID.ALIAS_HASH_IDS, 'hash.alias.ids'), Int32Array);
  const aliasHashOffsets = view(binary, requireSection(SECTION_ID.ALIAS_HASH_KEY_OFFSETS, 'hash.alias.keys'), Uint32Array);

  const nameHash = buildHashTable(nameHashIds, nameHashOffsets, stringsBlob);
  const aliasHash = buildHashTable(aliasHashIds, aliasHashOffsets, stringsBlob);

  runtimeCache = {
    manifest,
    binary,
    signature: trustedSignature,
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

function lookupInHash(normalized: string, table: HashTable): number | null {
  if (!table || typeof normalized !== 'string' || normalized.length === 0) {
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
      return typeof id === 'number' && id >= 0 ? id : null;
    }
    probe = (probe + step) & mask;
  }

  return null;
}

function normalizeLookup(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ============================================================================
// Exported Functions
// ============================================================================

/**
 * Reset the runtime cache (for testing)
 */
export function resetDexV2Runtime(): void {
  runtimeCache = null;
}

/**
 * Load the DexV2 runtime
 */
export function loadDexV2Runtime(options: LoadOptions = {}): DexV2Runtime {
  return loadRuntime(options.rootDir);
}

/**
 * Lookup species ID by name or alias
 */
export function lookupSpeciesId(value: unknown, options: LoadOptions = {}): number | null {
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

/**
 * Get the full DexV2 pack
 */
export function getDexV2Pack(options: LoadOptions = {}): DexV2Pack {
  const runtime = loadRuntime(options.rootDir);
  return runtime.pack;
}

/**
 * Get fast lookup tables
 */
export function getDexV2FastTables(options: LoadOptions = {}): DexV2FastTables {
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
