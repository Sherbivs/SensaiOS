// Seeds Prisma dex reference tables using the bootstrap JSON artifacts.
import { Prisma, PrismaClient } from "../../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scopedLogger } from "../../src/observability/envelope/console.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATA_DIR = path.join(ROOT, "data");

const log = scopedLogger("scripts.dex.seed-reference");

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

const TYPE_CHART: Record<TypeSlug, { double?: TypeSlug[]; half?: TypeSlug[]; zero?: TypeSlug[] }> = {
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

const DEFAULT_CAPTURE_RATE = 45;
const DEFAULT_GROWTH = "medium";

type DexEntry = {
  id: number;
  name: string;
  types: string[];
  height?: number;
  weight?: number;
  stats?: Record<string, number>;
  abilities?: Array<{ name: string; hidden?: boolean; slot?: number }>;
  learnset?: {
    levelUp?: Array<{ name: string; level?: number }>;
    machine?: Array<{ name: string }>;
    tutor?: Array<{ name: string }>;
    egg?: Array<{ name: string }>;
  };
};

type PokemonEntry = {
  id: number;
  name: string;
  types: string[];
  height?: number;
  weight?: number;
  base_stats?: Record<string, number>;
  abilities?: Array<{ name: string; is_hidden?: boolean; slot?: number }>;
  sprites?: Record<string, string | null>;
};

type MoveEntry = {
  id: number;
  name: string;
  type: string | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number | null;
  class: string | null;
  target?: string | null;
  effect?: string | null;
  meta?: Record<string, unknown> | null;
};

type MoveLookup = Map<string, MoveEntry>;

type AbilityRecord = { id: number; slug: string; name: string; desc: string | null };

type SpeciesRecord = Prisma.SpeciesCreateManyInput;

type SpeciesTypeRecord = Prisma.SpeciesTypeCreateManyInput;
type PendingSpeciesTypeRecord = SpeciesTypeRecord & { typeSlug: string };

type SpeciesAbilityRecord = Prisma.SpeciesAbilityCreateManyInput;
type PendingSpeciesAbilityRecord = SpeciesAbilityRecord & { abilitySlug: string };

type SpeciesLearnsetRecord = Prisma.SpeciesLearnsetCreateManyInput;
type PendingSpeciesLearnsetRecord = SpeciesLearnsetRecord & { moveSlug: string };

type MoveRecord = Prisma.MoveCreateManyInput;

type TypeRecord = Prisma.TypeCreateManyInput;

type TypeChartRecord = Prisma.TypeChartCreateManyInput;

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ensureInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function chunk<T>(items: T[], size = 500): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function loadJSON<T>(relative: string): Promise<T> {
  const filePath = path.join(DATA_DIR, relative);
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as T;
}

function buildTypeRecords(): { records: TypeRecord[]; map: Map<string, number> } {
  const map = new Map<string, number>();
  const records = TYPE_ORDER.map<TypeRecord>((slug, index) => {
    const id = index + 1;
    map.set(slug, id);
    return {
      id,
      slug,
      name: titleCase(slug),
    } satisfies TypeRecord;
  });
  return { records, map };
}

function buildAbilityRecords(pokemon: PokemonEntry[], dex: DexEntry[]): { records: AbilityRecord[]; map: Map<string, number> } {
  const abilitySet = new Set<string>();
  for (const entry of pokemon) {
    for (const ability of entry.abilities ?? []) {
      if (ability?.name) abilitySet.add(ability.name.toLowerCase());
    }
  }
  for (const entry of dex) {
    for (const ability of entry.abilities ?? []) {
      if (ability?.name) abilitySet.add(ability.name.toLowerCase());
    }
  }
  const sorted = Array.from(abilitySet).sort((a, b) => a.localeCompare(b));
  const map = new Map<string, number>();
  const records = sorted.map<AbilityRecord>((slug, index) => {
    const id = index + 1;
    map.set(slug, id);
    return {
      id,
      slug,
      name: titleCase(slug),
      desc: null,
    } satisfies AbilityRecord;
  });
  return { records, map };
}

function buildMoveLookup(rawMoves: Record<string, MoveEntry>): MoveLookup {
  const lookup: MoveLookup = new Map();
  for (const [slug, entry] of Object.entries(rawMoves)) {
    if (entry?.id) {
      lookup.set(slug.toLowerCase(), entry);
    }
  }
  return lookup;
}

function buildMoveRecords(moves: MoveLookup, typeMap: Map<string, number>): MoveRecord[] {
  const records: MoveRecord[] = [];
  for (const [slug, entry] of moves.entries()) {
    const rawType = entry.type?.toLowerCase();
    const typeId = rawType ? typeMap.get(rawType) : undefined;
    if (!typeId) continue;
    const category = entry.class?.toLowerCase();
    if (!category || (category !== "physical" && category !== "special" && category !== "status")) {
      continue;
    }
    const moveMeta: Prisma.JsonObject = {
      target: entry.target ?? null,
      effect: entry.effect ?? null,
      extra: entry.meta ? (entry.meta as unknown as Prisma.JsonValue) : null,
    };
    records.push({
      id: entry.id,
      slug,
      name: entry.name ?? titleCase(slug),
      typeId,
      power: entry.power ?? null,
      accuracy: entry.accuracy ?? null,
      pp: entry.pp ?? 0,
      priority: entry.priority ?? 0,
      category,
      meta: moveMeta,
    });
  }
  return records;
}

function buildTypeChartRecords(typeMap: Map<string, number>): TypeChartRecord[] {
  const records: TypeChartRecord[] = [];
  for (const atk of TYPE_ORDER) {
    const atkId = typeMap.get(atk);
    if (!atkId) continue;
    const effectiveness = TYPE_CHART[atk] ?? {};
    for (const def of TYPE_ORDER) {
      const defId = typeMap.get(def);
      if (!defId) continue;
      let mult = 100;
      if (effectiveness.zero?.includes(def)) mult = 0;
      else if (effectiveness.double?.includes(def)) mult = 200;
      else if (effectiveness.half?.includes(def)) mult = 50;
      records.push({ atkTypeId: atkId, defTypeId: defId, mult });
    }
  }
  return records;
}

function buildSpeciesRecords(
  dex: DexEntry[],
  pokemonMap: Map<number, PokemonEntry>
): {
  species: SpeciesRecord[];
  speciesTypes: PendingSpeciesTypeRecord[];
  speciesAbilities: PendingSpeciesAbilityRecord[];
  learnset: PendingSpeciesLearnsetRecord[];
} {
  const species: SpeciesRecord[] = [];
  const speciesTypes: PendingSpeciesTypeRecord[] = [];
  const speciesAbilities: PendingSpeciesAbilityRecord[] = [];
  const learnset: PendingSpeciesLearnsetRecord[] = [];

  for (const entry of dex) {
    const poke = pokemonMap.get(entry.id);
    const types = (poke?.types ?? entry.types ?? []).map((slug) => slug.toLowerCase());

    const abilitySources = poke?.abilities
      ? poke.abilities.map((ability) => ({
          name: ability.name?.toLowerCase() ?? "",
          slot: ability.slot ?? (ability.is_hidden ? 3 : 1),
        }))
      : (entry.abilities ?? []).map((ability, index) => ({
          name: ability.name?.toLowerCase() ?? "",
          slot: ability.hidden ? 3 : ability.slot ?? index + 1,
        }));

    const statsSource = poke?.base_stats ?? entry.stats ?? {};
    const statsCompat = {
      hp: ensureInt((statsSource as Record<string, number>)["hp"] ?? (statsSource as Record<string, number>)["base_hp"] ?? 0),
      attack: ensureInt((statsSource as Record<string, number>)["attack"] ?? (statsSource as Record<string, number>)["base_attack"] ?? 0),
      defense: ensureInt((statsSource as Record<string, number>)["defense"] ?? (statsSource as Record<string, number>)["base_defense"] ?? 0),
      special_attack: ensureInt(
        (statsSource as Record<string, number>)["special_attack"] ??
          (statsSource as Record<string, number>)["special-attack"] ??
          (statsSource as Record<string, number>)["base_spatk"] ??
          0
      ),
      special_defense: ensureInt(
        (statsSource as Record<string, number>)["special_defense"] ??
          (statsSource as Record<string, number>)["special-defense"] ??
          (statsSource as Record<string, number>)["base_spdef"] ??
          0
      ),
      speed: ensureInt((statsSource as Record<string, number>)["speed"] ?? (statsSource as Record<string, number>)["base_speed"] ?? 0),
    };

    const speciesSlug = entry.name.toLowerCase();

    species.push({
      id: entry.id,
      slug: speciesSlug,
      name: titleCase(entry.name),
      baseHp: statsCompat.hp,
      baseAtk: statsCompat.attack,
      baseDef: statsCompat.defense,
      baseSpAtk: statsCompat.special_attack,
      baseSpDef: statsCompat.special_defense,
      baseSpe: statsCompat.speed,
      growth: DEFAULT_GROWTH,
      captureRate: DEFAULT_CAPTURE_RATE,
      maleRate: null,
      hatchSteps: null,
      meta: {
        height: poke?.height ?? entry.height ?? null,
        weight: poke?.weight ?? entry.weight ?? null,
        sprites: poke?.sprites ?? null,
        learnset: entry.learnset ?? null,
      },
    });

    types.forEach((slug, index) => {
      speciesTypes.push({ speciesId: entry.id, typeId: 0, slot: index, typeSlug: slug.toLowerCase() });
    });

    abilitySources.forEach((ability) => {
      if (!ability.name) return;
      const slot = Math.max(1, ensureInt(ability.slot ?? 0));
      speciesAbilities.push({
        speciesId: entry.id,
        abilityId: 0,
        slot,
        abilitySlug: ability.name,
      });
    });

    const learn = entry.learnset ?? {};
    const addMoves = (items: Array<{ name: string; level?: number }> | undefined, method: "level" | "machine" | "tutor" | "egg") => {
      for (const item of items ?? []) {
        const slug = item?.name?.toLowerCase();
        if (!slug) continue;
        learnset.push({
          speciesId: entry.id,
          moveId: 0,
          method,
          level: method === "level" ? ensureInt(item.level ?? 0) : 0,
          machineId: null,
          moveSlug: slug,
        });
      }
    };

    addMoves(learn.levelUp, "level");
    addMoves(learn.machine as Array<{ name: string }>, "machine");
    addMoves(learn.tutor as Array<{ name: string }>, "tutor");
    addMoves(learn.egg as Array<{ name: string }>, "egg");
  }

  return { species, speciesTypes, speciesAbilities, learnset };
}

function attachTypeIds(records: PendingSpeciesTypeRecord[], typeMap: Map<string, number>) {
  for (const record of records) {
    const typeId = typeMap.get(record.typeSlug.toLowerCase());
    if (typeId) record.typeId = typeId;
  }
}

function attachAbilityIds(records: PendingSpeciesAbilityRecord[], abilityMap: Map<string, number>) {
  for (const record of records) {
    if (!record.abilitySlug) continue;
    const id = abilityMap.get(record.abilitySlug.toLowerCase());
    if (id) record.abilityId = id;
  }
}

function attachMoveIds(records: PendingSpeciesLearnsetRecord[], moveLookup: MoveLookup) {
  for (const record of records) {
    const move = moveLookup.get(record.moveSlug.toLowerCase());
    if (move) record.moveId = move.id;
  }
}

function sanitizeSpeciesRelationships(
  speciesTypes: PendingSpeciesTypeRecord[],
  speciesAbilities: PendingSpeciesAbilityRecord[],
  learnset: PendingSpeciesLearnsetRecord[]
) {
  const filteredTypes = speciesTypes
    .filter((record) => record.typeId && record.typeId > 0)
    .map<SpeciesTypeRecord>(({ typeSlug: _ignored, ...rest }) => rest);
  const filteredAbilities = speciesAbilities
    .filter((record) => record.abilityId && record.abilityId > 0)
    .map<SpeciesAbilityRecord>(({ abilitySlug: _ignored, ...rest }) => rest);
  const filteredLearnset = learnset
    .filter((record) => record.moveId && record.moveId > 0)
    .map<SpeciesLearnsetRecord>(({ moveSlug: _ignored, ...rest }) => rest);
  return { filteredTypes, filteredAbilities, filteredLearnset };
}

type CreateManyDelegate<T> = {
  createMany(args?: { data: T | T[]; skipDuplicates?: boolean }): Promise<Prisma.BatchPayload>;
};

async function createManyChunked<T>(delegate: CreateManyDelegate<T>, data: T[], chunkSize = 500) {
  const chunks = chunk(data, chunkSize);
  for (const chunkData of chunks) {
    if (chunkData.length === 0) continue;
    await delegate.createMany({ data: chunkData, skipDuplicates: true });
  }
}

export type SeedOptions = {
  onlySpeciesIds?: number[];
};

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("PROD_DATABASE_URL or DATABASE_URL must be set");
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export async function seedDex(options: SeedOptions = {}) {
  const prisma = createPrismaClient();
  try {
  const dexAll = await loadJSON<DexEntry[]>(path.join("bootstrap", "dex.min.json"));
  const pokemonDoc = await loadJSON<{ pokemon: PokemonEntry[] }>("pokemon.json");
  const movesRaw = await loadJSON<Record<string, MoveEntry>>(path.join("bootstrap", "moves.min.json"));

  const requestedIds = options.onlySpeciesIds?.length ? new Set(options.onlySpeciesIds) : null;
  log.info("seed", "Starting dex reference seed", {
    requestedIds: requestedIds ? requestedIds.size : 0,
  });
  const dex = requestedIds
    ? dexAll.filter((entry) => requestedIds.has(entry.id))
    : dexAll;

  if (!dex.length) {
    log.info("seed", "No dex entries matched the requested filter", {
      requestedIds: requestedIds ? requestedIds.size : 0,
    });
    console.log("No dex entries matched the requested filter. Nothing to seed.");
    return;
  }

  const pokemonAll = pokemonDoc.pokemon ?? [];
  const pokemon = requestedIds
    ? pokemonAll.filter((entry) => requestedIds.has(entry.id))
    : pokemonAll;
  const pokemonMap = new Map<number, PokemonEntry>(pokemon.map((p) => [p.id, p]));

  const { records: typeRecords, map: typeMap } = buildTypeRecords();
  const { records: abilityRecords, map: abilityMap } = buildAbilityRecords(pokemon, dex);
  const moveLookup = buildMoveLookup(movesRaw);
  const moveRecords = buildMoveRecords(moveLookup, typeMap);
  const typeChart = buildTypeChartRecords(typeMap);

  const { species, speciesTypes, speciesAbilities, learnset } = buildSpeciesRecords(dex, pokemonMap);
  attachTypeIds(speciesTypes, typeMap);
  attachAbilityIds(speciesAbilities, abilityMap);
  attachMoveIds(learnset, moveLookup);
  const { filteredTypes, filteredAbilities, filteredLearnset } = sanitizeSpeciesRelationships(
    speciesTypes,
    speciesAbilities,
    learnset
  );

  console.log(`Seeding ${typeRecords.length} types…`);
  await prisma.type.createMany({ data: typeRecords, skipDuplicates: true });

  console.log(`Seeding ${abilityRecords.length} abilities…`);
  await prisma.ability.createMany({ data: abilityRecords, skipDuplicates: true });

  console.log(`Seeding ${moveRecords.length} moves…`);
  await createManyChunked(prisma.move, moveRecords, 300);

  console.log(`Seeding ${typeChart.length} type chart entries…`);
  await createManyChunked(prisma.typeChart, typeChart, 500);

  console.log(`Seeding ${species.length} species…`);
  await createManyChunked(prisma.species, species, 200);

  console.log(`Seeding ${filteredTypes.length} species type records…`);
  await createManyChunked(prisma.speciesType, filteredTypes, 500);

  console.log(`Seeding ${filteredAbilities.length} species abilities…`);
  await createManyChunked(prisma.speciesAbility, filteredAbilities, 500);

  console.log(`Seeding ${filteredLearnset.length} learnset entries…`);
  await createManyChunked(prisma.speciesLearnset, filteredLearnset, 500);

  console.log("✅ Dex reference seeding complete.");
  log.info("seed", "Dex reference seeding complete", {
    types: typeRecords.length,
    abilities: abilityRecords.length,
    moves: moveRecords.length,
    species: species.length,
  });
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  await seedDex();
}

const isDirectExecution = process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;

if (isDirectExecution) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    log.error("seed", "Dex reference seeding failed", {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    console.error("Dex seeding failed:", error);
    process.exitCode = 1;
  });
}
