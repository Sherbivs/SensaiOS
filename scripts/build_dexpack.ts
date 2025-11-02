import { gzipSync } from "node:zlib";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const BOOTSTRAP_DIR = path.join(ROOT, "data", "bootstrap");
const CACHE_DIR = path.join(ROOT, "data", "cache");
const OUTPUT_DIR = path.join(ROOT, "assets");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "dexpack.v1.json");
const OUTPUT_GZ = `${OUTPUT_JSON}.gz`;

const TYPE_ORDER = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
] as const;

type TypeSlug = (typeof TYPE_ORDER)[number];

type TypeChartBands = {
  double?: TypeSlug[];
  half?: TypeSlug[];
  zero?: TypeSlug[];
};

const TYPE_CHART: Record<TypeSlug, TypeChartBands> = {
  normal: { double: [], half: ["rock", "steel"], zero: ["ghost"] },
  fire: { double: ["grass", "ice", "bug", "steel"], half: ["fire", "water", "rock", "dragon"], zero: [] },
  water: { double: ["fire", "ground", "rock"], half: ["water", "grass", "dragon"], zero: [] },
  electric: { double: ["water", "flying"], half: ["electric", "grass", "dragon"], zero: ["ground"] },
  grass: { double: ["water", "ground", "rock"], half: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"], zero: [] },
  ice: { double: ["grass", "ground", "flying", "dragon"], half: ["fire", "water", "ice", "steel"], zero: [] },
  fighting: { double: ["normal", "ice", "rock", "dark", "steel"], half: ["poison", "flying", "psychic", "bug", "fairy"], zero: ["ghost"] },
  poison: { double: ["grass", "fairy"], half: ["poison", "ground", "rock", "ghost"], zero: ["steel"] },
  ground: { double: ["fire", "electric", "poison", "rock", "steel"], half: ["grass", "bug"], zero: ["flying"] },
  flying: { double: ["grass", "fighting", "bug"], half: ["electric", "rock", "steel"], zero: [] },
  psychic: { double: ["fighting", "poison"], half: ["psychic", "steel"], zero: ["dark"] },
  bug: { double: ["grass", "psychic", "dark"], half: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"], zero: [] },
  rock: { double: ["fire", "ice", "flying", "bug"], half: ["fighting", "ground", "steel"], zero: [] },
  ghost: { double: ["psychic", "ghost"], half: ["dark"], zero: ["normal"] },
  dragon: { double: ["dragon"], half: ["steel"], zero: ["fairy"] },
  dark: { double: ["psychic", "ghost"], half: ["fighting", "dark", "fairy"], zero: [] },
  steel: { double: ["ice", "rock", "fairy"], half: ["fire", "water", "electric", "steel"], zero: [] },
  fairy: { double: ["fighting", "dragon", "dark"], half: ["fire", "poison", "steel"], zero: [] },
};

type LearnsetEntry = { name: string; level?: number | null };

type DexEntry = {
  id: number;
  name: string;
  types: string[];
  height?: number | null;
  weight?: number | null;
  stats?: Record<string, number>;
  abilities?: Array<{ name: string; hidden?: boolean; slot?: number }>;
  learnset?: {
    levelUp?: LearnsetEntry[];
    machine?: LearnsetEntry[];
    tutor?: LearnsetEntry[];
    egg?: LearnsetEntry[];
  } | null;
  matchups?: Record<string, number>;
};

type MoveEntry = {
  id: number;
  name?: string;
  type?: string | null;
  power?: number | null;
  accuracy?: number | null;
  pp?: number | null;
  priority?: number | null;
  class?: string | null;
  target?: string | null;
  effect?: string | null;
  meta?: Record<string, unknown> | null;
};

type VersionMeta = {
  version_group?: string;
  version_group_id?: number;
  built_at?: string;
};

type TriggerMeta = {
  checksum?: string;
  count?: number;
  updatedAt?: string;
};

type SpeciesDoc = {
  id: number;
  slug: string;
  name: string;
  typing: string[];
  abilities: Array<{ name: string; hidden: boolean; slot: number }>;
  baseStats: { hp: number; atk: number; def: number; spAtk: number; spDef: number; spe: number };
  height: number | null;
  weight: number | null;
  learnsets: {
    level: Array<{ move: string; level: number | null }>;
    machine: string[];
    tutor: string[];
    egg: string[];
  };
  matchups: Record<string, number>;
  aliases: string[];
};

type MoveDoc = {
  id: number;
  name: string;
  slug: string;
  type: string | null;
  category: string | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  target: string | null;
  effect: string | null;
  meta: Record<string, unknown> | null;
};

type DexPack = {
  meta: {
    schema: string;
    generatedAt: string;
    source: {
      versionGroup: string | null;
      versionGroupId: number | null;
      builtAt: string | null;
      cacheChecksum: string | null;
      cacheCount: number | null;
      cacheUpdatedAt: string | null;
    };
    counts: {
      species: number;
      moves: number;
    };
  };
  byId: Record<string, SpeciesDoc>;
  byName: Record<string, number>;
  byAlias: Record<string, number>;
  moves: Record<string, MoveDoc>;
  types: {
    order: TypeSlug[];
    chart: Record<string, Record<string, number>>;
  };
};

const ALIASES: Record<string, string> = {
  "mr mime": "mr-mime",
  "mr. mime": "mr-mime",
  "nidoran♀": "nidoran-f",
  "nidoran♂": "nidoran-m",
  "type null": "type-null",
  "jangmo o": "jangmo-o",
  "hakamo o": "hakamo-o",
  "kommo o": "kommo-o",
  "tapu koko": "tapu-koko",
  "tapu lele": "tapu-lele",
  "tapu bulu": "tapu-bulu",
  "tapu fini": "tapu-fini",
};

function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeLookup(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadJson<T>(relativePath: string): Promise<T> {
  const filePath = path.join(ROOT, relativePath);
  const contents = await fs.readFile(filePath, "utf8");
  return JSON.parse(contents) as T;
}

function toBaseStats(raw: Record<string, number> | undefined): SpeciesDoc["baseStats"] {
  const stats = raw ?? {};
  const pick = (key: string, fallback: number): number => {
    const value = stats[key];
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };
  return {
    hp: pick("hp", 1),
    atk: pick("attack", 1),
    def: pick("defense", 1),
    spAtk: pick("special-attack", pick("special_attack", 1)),
    spDef: pick("special-defense", pick("special_defense", 1)),
    spe: pick("speed", 1),
  };
}

function dedupe<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function toLearnset(entries: LearnsetEntry[] | undefined, method: "level" | "machine" | "tutor" | "egg"): SpeciesDoc["learnsets"][keyof SpeciesDoc["learnsets"]] {
  if (!entries || entries.length === 0) {
    return method === "level" ? [] : [];
  }

  if (method === "level") {
    return entries
      .map((entry) => ({
        move: normalizeKey(entry.name ?? ""),
        level: typeof entry.level === "number" && Number.isFinite(entry.level) ? entry.level : null,
      }))
      .filter((entry) => Boolean(entry.move))
      .sort((a, b) => {
        const la = a.level ?? Number.POSITIVE_INFINITY;
        const lb = b.level ?? Number.POSITIVE_INFINITY;
        if (la === lb) {
          return a.move.localeCompare(b.move);
        }
        return la - lb;
      });
  }

  return entries
    .map((entry) => normalizeKey(entry.name ?? ""))
    .filter((slug): slug is string => Boolean(slug))
    .sort((a, b) => a.localeCompare(b));
}

function buildMatchups(entry: DexEntry): Record<string, number> {
  const matchups = entry.matchups ?? {};
  const result: Record<string, number> = {};
  for (const type of TYPE_ORDER) {
    const value = matchups[type] ?? 1;
    result[type] = typeof value === "number" && Number.isFinite(value) ? value : 1;
  }
  return result;
}

function buildSpeciesDoc(entry: DexEntry): SpeciesDoc {
  const slug = normalizeKey(entry.name);
  const typing = (entry.types ?? []).map((type) => normalizeKey(type)).filter(Boolean);
  const abilities = (entry.abilities ?? [])
    .map((ability, index) => {
      const slotRaw = ability?.slot;
      const fallback = ability?.hidden ? 3 : index + 1;
      const slot = typeof slotRaw === "number" && Number.isFinite(slotRaw) ? slotRaw : fallback;
      return {
        name: normalizeKey(ability?.name ?? ""),
        hidden: Boolean(ability?.hidden),
        slot,
      };
    })
    .filter((ability) => Boolean(ability.name));

  const level = toLearnset(entry.learnset?.levelUp ?? [], "level") as Array<{ move: string; level: number | null }>;
  const machine = toLearnset(entry.learnset?.machine ?? [], "machine") as string[];
  const tutor = toLearnset(entry.learnset?.tutor ?? [], "tutor") as string[];
  const egg = toLearnset(entry.learnset?.egg ?? [], "egg") as string[];

  const aliasCandidates = dedupe([
    slug,
    entry.name.toLowerCase(),
    entry.name.replace(/-/g, " ").toLowerCase(),
  ]);

  return {
    id: entry.id,
    slug,
    name: entry.name,
    typing,
    abilities,
    baseStats: toBaseStats(entry.stats),
    height: typeof entry.height === "number" ? entry.height : null,
    weight: typeof entry.weight === "number" ? entry.weight : null,
    learnsets: { level, machine, tutor, egg },
    matchups: buildMatchups(entry),
    aliases: aliasCandidates,
  };
}

function buildTypeChart(): Record<string, Record<string, number>> {
  const chart: Record<string, Record<string, number>> = {};
  for (const atk of TYPE_ORDER) {
    const row: Record<string, number> = {};
    const bands = TYPE_CHART[atk];
    for (const def of TYPE_ORDER) {
      let value = 1;
      if (bands.zero?.includes(def)) {
        value = 0;
      } else if (bands.double?.includes(def)) {
        value = 2;
      } else if (bands.half?.includes(def)) {
        value = 0.5;
      }
      row[def] = value;
    }
    chart[atk] = row;
  }
  return chart;
}

function sortRecord<T>(record: Record<string, T>, numericKeys = false): Record<string, T> {
  const entries = Object.entries(record);
  entries.sort((a, b) => {
    if (numericKeys) {
      return Number(a[0]) - Number(b[0]);
    }
    return a[0].localeCompare(b[0]);
  });
  return Object.fromEntries(entries);
}

async function ensureOutputDir(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function buffersEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

async function readFileIfExists(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeFileIfChanged(filePath: string, data: string | Buffer): Promise<boolean> {
  const buffer = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const existing = await readFileIfExists(filePath);
  if (existing && buffersEqual(existing, buffer)) {
    return false;
  }
  await fs.writeFile(filePath, buffer);
  return true;
}

async function verifyOutputs(jsonContents: string, gzBuffer: Buffer): Promise<void> {
  const expectedJsonBuffer = Buffer.from(jsonContents, "utf8");
  const expectedGzBuffer = gzBuffer;

  const currentJson = await readFileIfExists(OUTPUT_JSON);
  const currentGz = await readFileIfExists(OUTPUT_GZ);

  const mismatches: string[] = [];
  if (!currentJson) {
    mismatches.push(`${path.relative(ROOT, OUTPUT_JSON)} is missing`);
  } else if (!buffersEqual(currentJson, expectedJsonBuffer)) {
    mismatches.push(`${path.relative(ROOT, OUTPUT_JSON)} differs from generated output`);
  }

  if (!currentGz) {
    mismatches.push(`${path.relative(ROOT, OUTPUT_GZ)} is missing`);
  } else if (!buffersEqual(currentGz, expectedGzBuffer)) {
    mismatches.push(`${path.relative(ROOT, OUTPUT_GZ)} differs from generated output`);
  }

  if (mismatches.length > 0) {
    const message = [`Dexpack artifacts are stale:`]
      .concat(mismatches.map((entry) => `- ${entry}`))
      .concat(['Run "npm run data:dexpack" to regenerate and commit the updated assets.'])
      .join("\n");
    throw new Error(message);
  }
}

async function writeOutputs(jsonContents: string, gzBuffer: Buffer): Promise<boolean> {
  const wroteJson = await writeFileIfChanged(OUTPUT_JSON, jsonContents);
  const wroteGz = await writeFileIfChanged(OUTPUT_GZ, gzBuffer);
  return wroteJson || wroteGz;
}

type CliOptions = {
  check?: boolean;
  quiet?: boolean;
};

function parseCliArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = { check: false, quiet: false };
  for (const arg of args) {
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: tsx scripts/build_dexpack.ts [--check] [--quiet]");
      console.log("  --check   Verify committed artifacts match regenerated output (no writes)");
      console.log("  --quiet   Suppress success logging");
      process.exit(0);
    } else {
      console.warn(`Unknown flag: ${arg}`);
    }
  }
  return options;
}

async function main(options: CliOptions = {}): Promise<void> {
  const checkOnly = Boolean(options.check);
  const quiet = Boolean(options.quiet);

  const [dexEntries, moveEntries, versionMeta, triggerMeta] = await Promise.all([
    loadJson<DexEntry[]>("data/bootstrap/dex.min.json"),
    loadJson<Record<string, MoveEntry>>("data/bootstrap/moves.min.json"),
    loadJson<VersionMeta>("data/bootstrap/version.json"),
    fs
      .readFile(path.join(CACHE_DIR, "dex-sync-trigger.json"), "utf8")
      .then((contents) => JSON.parse(contents) as TriggerMeta)
      .catch(() => ({}) as TriggerMeta),
  ]);

  if (!Array.isArray(dexEntries) || dexEntries.length === 0) {
    throw new Error("dex.min.json did not contain any species records");
  }

  const moves: Record<string, MoveDoc> = {};
  for (const [slugRaw, move] of Object.entries(moveEntries)) {
    const slug = normalizeKey(slugRaw);
    if (!slug || typeof move?.id !== "number") continue;
    const category = move.class?.toLowerCase() ?? null;
    moves[slug] = {
      id: move.id,
      name: move.name ?? slugRaw,
      slug,
      type: move.type ? normalizeKey(move.type) : null,
      category,
      power: typeof move.power === "number" ? move.power : null,
      accuracy: typeof move.accuracy === "number" ? move.accuracy : null,
      pp: typeof move.pp === "number" ? move.pp : null,
      priority: typeof move.priority === "number" ? move.priority : 0,
      target: move.target ?? null,
      effect: move.effect ?? null,
      meta: move.meta ?? null,
    } satisfies MoveDoc;
  }

  const speciesDocs = dexEntries
    .map((entry) => buildSpeciesDoc(entry))
    .sort((a, b) => a.id - b.id);

  const byId: Record<string, SpeciesDoc> = {};
  const byName: Record<string, number> = {};
  const byAlias: Record<string, number> = {};

  for (const doc of speciesDocs) {
    byId[String(doc.id)] = doc;
    const canonicalKeys = dedupe([normalizeLookup(doc.name), normalizeLookup(doc.slug)]);
    for (const key of canonicalKeys) {
      if (key) {
        byName[key] = doc.id;
      }
    }
    for (const alias of doc.aliases) {
      const key = normalizeLookup(alias);
      if (key && !(key in byAlias)) {
        byAlias[key] = doc.id;
      }
    }
  }

  for (const [aliasRaw, target] of Object.entries(ALIASES)) {
    const key = normalizeLookup(aliasRaw);
    const normalizedTarget = normalizeLookup(target);
    const id = byName[normalizedTarget];
    if (key && id) {
      byAlias[key] = id;
    }
  }

  const pack: DexPack = {
    meta: {
      schema: "dexpack.v1",
      generatedAt:
        (typeof triggerMeta.updatedAt === "string" && triggerMeta.updatedAt.length > 0
          ? triggerMeta.updatedAt
          : null) ??
        (typeof versionMeta.built_at === "string" && versionMeta.built_at.length > 0
          ? versionMeta.built_at
          : null) ??
        "1970-01-01T00:00:00.000Z",
      source: {
        versionGroup: versionMeta.version_group ?? null,
        versionGroupId: typeof versionMeta.version_group_id === "number" ? versionMeta.version_group_id : null,
        builtAt: versionMeta.built_at ?? null,
        cacheChecksum: typeof triggerMeta.checksum === "string" ? triggerMeta.checksum : null,
        cacheCount: typeof triggerMeta.count === "number" ? triggerMeta.count : null,
        cacheUpdatedAt: triggerMeta.updatedAt ?? null,
      },
      counts: {
        species: speciesDocs.length,
        moves: Object.keys(moves).length,
      },
    },
    byId: sortRecord(byId, true),
    byName: sortRecord(byName),
    byAlias: sortRecord(byAlias),
    moves: sortRecord(moves),
    types: {
      order: [...TYPE_ORDER],
      chart: (() => {
        const chart = buildTypeChart();
        const sorted: Record<string, Record<string, number>> = {};
        for (const atk of TYPE_ORDER) {
          const row = chart[atk];
          const sortedRow: Record<string, number> = {};
          for (const def of TYPE_ORDER) {
            sortedRow[def] = row[def];
          }
          sorted[atk] = sortedRow;
        }
        return sorted;
      })(),
    },
  } satisfies DexPack;

  await ensureOutputDir();
  const json = JSON.stringify(pack);
  const jsonWithNewline = `${json}\n`;
  const gzBuffer = gzipSync(Buffer.from(json));

  if (checkOnly) {
    await verifyOutputs(jsonWithNewline, gzBuffer);
    if (!quiet) {
      console.log(
        `Dexpack verified (${pack.meta.counts.species} species, ${pack.meta.counts.moves} moves)`
      );
    }
    return;
  }

  const updated = await writeOutputs(jsonWithNewline, gzBuffer);
  if (!quiet) {
    const message = updated
      ? `Dexpack generated → ${path.relative(ROOT, OUTPUT_JSON)} (${pack.meta.counts.species} species, ${pack.meta.counts.moves} moves)`
      : `Dexpack already up to date (${pack.meta.counts.species} species, ${pack.meta.counts.moves} moves)`;
    console.log(message);
  }
}

const invokedDirectly = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === __filename;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const cliOptions = parseCliArgs();
  main(cliOptions).catch((error) => {
    console.error("build_dexpack failed:", error);
    process.exitCode = 1;
  });
}
