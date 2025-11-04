import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import * as dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";

type NamedResource = { name: string; url: string };

type AbilityRecord = {
  id: number;
  slug: string;
  name: string;
  desc: string | null;
};

type MoveRecord = {
  id: number;
  slug: string;
  name: string;
  typeSlug: string;
  typeId: number | null;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  priority: number;
  category: "physical" | "special" | "status";
  meta: Prisma.JsonObject;
};

type LearnsetEntry = {
  moveSlug: string;
  method: "level" | "machine" | "tutor" | "egg";
  level: number;
};

type SpeciesRecord = {
  id: number;
  slug: string;
  name: string;
  baseStats: {
    hp: number;
    atk: number;
    def: number;
    spAtk: number;
    spDef: number;
    spe: number;
  };
  growth: string;
  captureRate: number;
  maleRate: number | null;
  hatchSteps: number | null;
  types: Array<{ slug: string; slot: number }>;
  abilities: Array<{ slug: string; slot: number; isHidden: boolean }>;
  learnset: LearnsetEntry[];
  nameVariant: { value: string; normalized: string };
  meta: Prisma.JsonObject;
};

type TypeChartRow = { atkTypeId: number; defTypeId: number; mult: number };

const prisma = new PrismaClient();

const API_BASE = "https://pokeapi.co/api/v2";
const DEFAULT_CONCURRENCY = Number.parseInt(process.env.POKEAPI_SEED_CONCURRENCY ?? "4", 10);
const MAX_FETCH_ATTEMPTS = 5;

const METHOD_MAP: Record<string, LearnsetEntry["method"] | undefined> = {
  "level-up": "level",
  machine: "machine",
  tutor: "tutor",
  egg: "egg",
};

function loadEnvironment(): void {
  const candidates = [process.env.IG_ENV_FILE, process.env.DOTENV_CONFIG_PATH]
    .map((value) => (value ? value.trim() : ""))
    .filter(Boolean);

  for (const candidate of candidates) {
    const abs = path.isAbsolute(candidate) ? candidate : path.join(process.cwd(), candidate);
    if (fs.existsSync(abs)) {
      const result = dotenv.config({ path: abs });
      if (!result.error) {
        return;
      }
    }
  }

  dotenv.config();
}

async function fetchJson<T>(url: string, attempt = 0): Promise<T> {
  const headers: Record<string, string> = {
    "User-Agent": "Infinity-Gauntlet/seed-dex (+https://github.com/Sherbivs/Infinity-Gauntlet)",
    "Accept-Encoding": "gzip,deflate",
  };

  const response = await fetch(url, { headers });
  if (response.status === 429) {
    if (attempt >= MAX_FETCH_ATTEMPTS) {
      throw new Error(`Rate limited fetching ${url}`);
    }
    const retryHeader = response.headers.get("retry-after");
    const retryMs = retryHeader ? Number.parseFloat(retryHeader) * 1000 : (attempt + 1) * 1000;
    await sleep(retryMs);
    return fetchJson<T>(url, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed fetch ${url} → ${response.status}: ${body.substring(0, 120)}`);
  }

  return (await response.json()) as T;
}

async function fetchAllResources(endpoint: string): Promise<NamedResource[]> {
  const resources: NamedResource[] = [];
  let nextUrl: string | null = `${API_BASE}/${endpoint}`;

  while (nextUrl) {
    const page: { results: NamedResource[]; next: string | null } = await fetchJson(nextUrl);
    resources.push(...page.results);
    nextUrl = page.next;
  }

  return resources;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  iterator: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  let active = 0;

  return new Promise<R[]>((resolve, reject) => {
    const launchNext = () => {
      if (index >= items.length && active === 0) {
        resolve(results);
        return;
      }

      while (active < limit && index < items.length) {
        const currentIndex = index++;
        active++;
        Promise.resolve(iterator(items[currentIndex], currentIndex))
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

function extractId(url: string): number {
  const match = /\/(\d+)\/?$/.exec(url);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function toTitleCase(slug: string): string {
  return slug
    .split(/[-\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadTypeMap(): Promise<Map<string, number>> {
  const types = await prisma.type.findMany({ select: { id: true, slug: true } });
  return new Map(types.map((t) => [t.slug, t.id]));
}

async function fetchAbilityDetail(entry: NamedResource): Promise<AbilityRecord> {
  const detail = await fetchJson<any>(entry.url);
  const englishName =
    detail.names?.find((n: any) => n.language?.name === "en")?.name ?? toTitleCase(detail.name);
  const shortEffect =
    detail.effect_entries?.find((e: any) => e.language?.name === "en")?.short_effect ??
    detail.effect_entries?.find((e: any) => e.language?.name === "en")?.effect ??
    null;

  return {
    id: detail.id,
    slug: detail.name,
    name: englishName,
    desc: shortEffect,
  };
}

async function fetchMoveDetail(
  entry: NamedResource,
  typeMap: Map<string, number>,
): Promise<MoveRecord> {
  const detail = await fetchJson<any>(entry.url);
  const englishName =
    detail.names?.find((n: any) => n.language?.name === "en")?.name ?? toTitleCase(detail.name);
  const typeSlug: string = detail.type?.name ?? "normal";
  const typeId = typeMap.get(typeSlug) ?? null;

  const effectEntry = detail.effect_entries?.find((e: any) => e.language?.name === "en");
  const meta: Prisma.JsonObject = {
    target: detail.target?.name ?? null,
    effect: effectEntry?.effect ?? null,
    shortEffect: effectEntry?.short_effect ?? null,
    effectChance: detail.effect_chance ?? null,
    statChanges: detail.stat_changes ?? null,
    ailment: detail.meta?.ailment ?? null,
    extra: detail.meta ?? null,
  };

  const power =
    typeof detail.power === "number" && Number.isFinite(detail.power) ? detail.power : null;
  const accuracy =
    typeof detail.accuracy === "number" && Number.isFinite(detail.accuracy)
      ? detail.accuracy
      : null;
  const pp = typeof detail.pp === "number" && Number.isFinite(detail.pp) ? detail.pp : null;
  const priority =
    typeof detail.priority === "number" && Number.isFinite(detail.priority) ? detail.priority : 0;

  const category =
    detail.damage_class?.name === "physical" ||
    detail.damage_class?.name === "special" ||
    detail.damage_class?.name === "status"
      ? (detail.damage_class.name as MoveRecord["category"])
      : "status";

  return {
    id: detail.id,
    slug: detail.name,
    name: englishName,
    typeSlug,
    typeId,
    power,
    accuracy,
    pp,
    priority,
    category,
    meta,
  };
}

async function fetchVersionOrder(): Promise<Map<string, number>> {
  const list = await fetchAllResources("version-group?limit=200");
  const map = new Map<string, number>();
  list.forEach((entry) => {
    map.set(entry.name, extractId(entry.url));
  });
  return map;
}

function deriveBaseStats(detail: any): SpeciesRecord["baseStats"] {
  const stats: Record<string, number> = {};
  for (const entry of detail.stats ?? []) {
    const key = entry.stat?.name;
    const value = entry.base_stat;
    if (typeof key === "string" && typeof value === "number") {
      stats[key] = value;
    }
  }

  return {
    hp: stats.hp ?? 1,
    atk: stats.attack ?? 1,
    def: stats.defense ?? 1,
    spAtk: stats["special-attack"] ?? 1,
    spDef: stats["special-defense"] ?? 1,
    spe: stats.speed ?? 1,
  };
}

function deriveMaleRate(genderRate: number | null | undefined): number | null {
  if (genderRate === null || genderRate === undefined || genderRate < 0) {
    return null;
  }
  const femalePercent = (genderRate / 8) * 100;
  return Math.max(0, Math.min(100, Math.round(100 - femalePercent)));
}

function deriveHatchSteps(hatchCounter: number | null | undefined): number | null {
  if (hatchCounter === null || hatchCounter === undefined || !Number.isFinite(hatchCounter)) {
    return null;
  }
  return (hatchCounter + 1) * 255;
}

function sanitizeFlavor(flavor: string | undefined): string | null {
  if (!flavor) return null;
  return flavor.replace(/\s+/g, " ").trim();
}

function selectLatestLearnset(
  move: any,
  versionOrder: Map<string, number>,
): LearnsetEntry[] {
  const best: Map<LearnsetEntry["method"], { level: number; version: number }> = new Map();

  for (const detail of move.version_group_details ?? []) {
    const methodKey = METHOD_MAP[detail.move_learn_method?.name ?? ""];
    if (!methodKey) continue;
    const versionName = detail.version_group?.name ?? "";
    const versionRank = versionOrder.get(versionName) ?? 0;
    const level = methodKey === "level" ? detail.level_learned_at ?? 0 : 0;

    const entry = best.get(methodKey);
    if (!entry || versionRank > entry.version || (versionRank === entry.version && level < entry.level)) {
      best.set(methodKey, { level, version: versionRank });
    }
  }

  const output: LearnsetEntry[] = [];
  for (const [method, { level }] of best.entries()) {
    output.push({ moveSlug: move.move?.name ?? "", method, level });
  }
  return output.filter((entry): entry is LearnsetEntry => Boolean(entry.moveSlug));
}

async function fetchSpeciesDetail(
  entry: NamedResource,
  versionOrder: Map<string, number>,
): Promise<SpeciesRecord | null> {
  const detail = await fetchJson<any>(entry.url);
  if (!detail.is_default) return null;

  const speciesDetail = await fetchJson<any>(detail.species?.url ?? "");
  const englishName =
    speciesDetail.names?.find((n: any) => n.language?.name === "en")?.name ??
    toTitleCase(speciesDetail.name ?? detail.name);

  const genus =
    speciesDetail.genera?.find((g: any) => g.language?.name === "en")?.genus ?? null;
  const flavor =
    speciesDetail.flavor_text_entries?.find((f: any) => f.language?.name === "en")?.flavor_text ??
    null;

  const meta: Prisma.JsonObject = {
    heightDecimetres: detail.height ?? null,
    weightHectograms: detail.weight ?? null,
    baseExperience: detail.base_experience ?? null,
    sprites: detail.sprites ?? null,
    forms: detail.forms ?? null,
    species: {
      genus,
      color: speciesDetail.color?.name ?? null,
      shape: speciesDetail.shape?.name ?? null,
      habitat: speciesDetail.habitat?.name ?? null,
      generation: speciesDetail.generation?.name ?? null,
      eggGroups: (speciesDetail.egg_groups ?? []).map((g: any) => g.name),
      flavorText: sanitizeFlavor(flavor),
    },
    abilities: (detail.abilities ?? []).map((a: any) => ({
      slug: a.ability?.name ?? "",
      isHidden: Boolean(a.is_hidden),
      slot: a.slot ?? null,
    })),
  };

  const types = (detail.types ?? [])
    .map((t: any) => ({
      slug: t.type?.name ?? "",
      slot: typeof t.slot === "number" ? t.slot - 1 : 0,
    }))
    .filter((t: { slug: string }) => t.slug);

  const abilities = (detail.abilities ?? [])
    .map((a: any) => ({
      slug: a.ability?.name ?? "",
      slot: a.is_hidden ? 3 : a.slot ?? 1,
      isHidden: Boolean(a.is_hidden),
    }))
    .filter((a: { slug: string }) => a.slug);

  const learnset = (detail.moves ?? [])
    .flatMap((move: any) => selectLatestLearnset(move, versionOrder))
    .filter((entry: LearnsetEntry) => Boolean(entry.moveSlug));

  const baseStats = deriveBaseStats(detail);
  const maleRate = deriveMaleRate(speciesDetail.gender_rate);
  const hatchSteps = deriveHatchSteps(speciesDetail.hatch_counter);

  return {
    id: detail.id,
    slug: detail.name,
    name: englishName,
    baseStats,
    growth: speciesDetail.growth_rate?.name ?? "medium",
    captureRate: speciesDetail.capture_rate ?? 0,
    maleRate,
    hatchSteps,
    types,
    abilities,
    learnset,
    nameVariant: { value: englishName, normalized: normalizeForSearch(englishName) },
    meta,
  };
}

async function fetchTypeChart(typeMap: Map<string, number>): Promise<TypeChartRow[]> {
  const resources = await fetchAllResources("type?limit=100");
  const relevant = resources.filter((entry) => typeMap.has(entry.name));
  const details = await mapWithConcurrency(relevant, DEFAULT_CONCURRENCY, (entry) =>
    fetchJson<any>(entry.url),
  );

  const rows: TypeChartRow[] = [];
  const typeSlugs = Array.from(typeMap.keys());

  for (const detail of details) {
    const atkSlug = detail.name;
    const atkId = typeMap.get(atkSlug);
    if (!atkId) continue;

    const multipliers = new Map<string, number>();
    typeSlugs.forEach((slug) => multipliers.set(slug, 100));

    for (const def of detail.damage_relations?.double_damage_to ?? []) {
      if (multipliers.has(def.name)) multipliers.set(def.name, 200);
    }
    for (const def of detail.damage_relations?.half_damage_to ?? []) {
      if (multipliers.has(def.name)) multipliers.set(def.name, 50);
    }
    for (const def of detail.damage_relations?.no_damage_to ?? []) {
      if (multipliers.has(def.name)) multipliers.set(def.name, 0);
    }

    for (const [defSlug, mult] of multipliers.entries()) {
      const defId = typeMap.get(defSlug);
      if (!defId) continue;
      rows.push({ atkTypeId: atkId, defTypeId: defId, mult });
    }
  }

  return rows;
}

async function createManyChunked<T>(
  name: string,
  items: T[],
  run: (chunk: T[]) => Promise<unknown>,
  chunkSize = 150,
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await run(chunk);
    process.stdout.write(`\rInserted ${name}: ${Math.min(i + chunk.length, items.length)}/${items.length}`);
  }
  if (items.length > 0) {
    process.stdout.write("\n");
  }
}

async function main(): Promise<void> {
  loadEnvironment();
  const dryRun = process.argv.includes("--dry-run");

  console.log("🔄 Preparing Pokédex seeding (dryRun=%s)…", dryRun);
  const concurrency = Math.max(1, DEFAULT_CONCURRENCY);

  const [typeMap, versionOrder] = await Promise.all([loadTypeMap(), fetchVersionOrder()]);
  console.log("✅ Loaded type map (%d types) and version ordering.", typeMap.size);

  const abilityResources = await fetchAllResources("ability?limit=2000");
  console.log("📥 Fetching %d abilities…", abilityResources.length);
  const abilities = await mapWithConcurrency(abilityResources, concurrency, fetchAbilityDetail);
  const abilitySlugToId = new Map(abilities.map((a) => [a.slug, a.id]));

  const moveResources = await fetchAllResources("move?limit=2000");
  console.log("📥 Fetching %d moves… this may take a few minutes.", moveResources.length);
  const moves = await mapWithConcurrency(moveResources, concurrency, (entry) =>
    fetchMoveDetail(entry, typeMap),
  );
  const moveSlugToId = new Map(moves.filter((m) => m.typeId !== null).map((m) => [m.slug, m.id]));

  const pokemonResources = await fetchAllResources("pokemon?limit=2000");
  console.log("📥 Fetching %d Pokémon entries…", pokemonResources.length);
  const speciesRaw = await mapWithConcurrency(pokemonResources, concurrency, (entry, idx) => {
    if (idx % 50 === 0) {
      process.stdout.write(`\r  → ${idx}/${pokemonResources.length} processed`);
    }
    return fetchSpeciesDetail(entry, versionOrder);
  });
  process.stdout.write("\r");

  const species = speciesRaw.filter((record): record is SpeciesRecord => Boolean(record));
  console.log("✅ Collected %d default species.", species.length);

  const typeChart = await fetchTypeChart(typeMap);
  console.log("✅ Built type effectiveness chart (%d rows).", typeChart.length);

  if (dryRun) {
    console.log("Dry-run complete — skipping database writes.");
    return;
  }

  console.log("🧹 Clearing existing dex tables…");
  await prisma.$transaction([
    prisma.speciesLearnset.deleteMany(),
    prisma.speciesAbility.deleteMany(),
    prisma.speciesType.deleteMany(),
    prisma.evolutionStep.deleteMany(),
    prisma.nameVariant.deleteMany({ where: { kind: "species" } }),
  ]);
  await prisma.species.deleteMany();
  await prisma.move.deleteMany();
  await prisma.ability.deleteMany();
  await prisma.typeChart.deleteMany();

  console.log("📝 Inserting abilities…");
  await createManyChunked(
    "abilities",
    abilities,
    (chunk) =>
      prisma.ability.createMany({
        data: chunk.map((a) => ({
          id: a.id,
          slug: a.slug,
          name: a.name,
          desc: a.desc,
        })),
      }),
  );

  const validMoves = moves.filter((m) => m.typeId !== null) as Array<
    MoveRecord & { typeId: number }
  >;
  const skippedMoves = moves.length - validMoves.length;
  if (skippedMoves > 0) {
    console.warn("⚠️  Skipping %d moves with unknown types.", skippedMoves);
  }

  console.log("📝 Inserting moves…");
  await createManyChunked(
    "moves",
    validMoves,
    (chunk) =>
      prisma.move.createMany({
        data: chunk.map((m) => ({
          id: m.id,
          slug: m.slug,
          name: m.name,
          typeId: m.typeId,
          power: m.power,
          accuracy: m.accuracy,
          pp: m.pp ?? 0,
          priority: m.priority,
          category: m.category,
          meta: m.meta,
        })),
      }),
  );

  console.log("📝 Inserting species…");
  await createManyChunked(
    "species",
    species,
    (chunk) =>
      prisma.species.createMany({
        data: chunk.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          baseHp: s.baseStats.hp,
          baseAtk: s.baseStats.atk,
          baseDef: s.baseStats.def,
          baseSpAtk: s.baseStats.spAtk,
          baseSpDef: s.baseStats.spDef,
          baseSpe: s.baseStats.spe,
          growth: s.growth,
          captureRate: s.captureRate,
          maleRate: s.maleRate,
          hatchSteps: s.hatchSteps,
          meta: s.meta,
        })),
      }),
  );

  const speciesTypes = species.flatMap((s) =>
    s.types
      .map((t) => {
        const typeId = typeMap.get(t.slug);
        if (!typeId) return null;
        return { speciesId: s.id, typeId, slot: t.slot };
      })
      .filter((entry): entry is { speciesId: number; typeId: number; slot: number } => Boolean(entry)),
  );

  const speciesAbilities = species.flatMap((s) =>
    s.abilities
      .map((a) => {
        const abilityId = abilitySlugToId.get(a.slug);
        if (!abilityId) return null;
        return { speciesId: s.id, abilityId, slot: a.slot };
      })
      .filter(
        (entry): entry is { speciesId: number; abilityId: number; slot: number } => Boolean(entry),
      ),
  );

  const speciesLearnset = species.flatMap((s) =>
    s.learnset
      .map((entry): {
        speciesId: number;
        moveId: number;
        method: LearnsetEntry["method"];
        level: number;
        machineId: null;
      } | null => {
        const moveId = moveSlugToId.get(entry.moveSlug);
        if (!moveId) return null;
        return {
          speciesId: s.id,
          moveId,
          method: entry.method,
          level: entry.level,
          machineId: null,
        };
      })
      .filter((entry): entry is {
        speciesId: number;
        moveId: number;
        method: LearnsetEntry["method"];
        level: number;
        machineId: null;
      } => entry !== null),
  );

  const nameVariants = species.map((s) => ({
    id: `species-en-${s.id}`,
    kind: "species",
    refIntId: s.id,
    locale: "en",
    nameType: "default",
    value: s.name,
    normalized: s.nameVariant.normalized,
  }));

  console.log("📝 Inserting species type mappings…");
  await createManyChunked(
    "species types",
    speciesTypes,
    (chunk) =>
      prisma.speciesType.createMany({
        data: chunk,
      }),
  );

  console.log("📝 Inserting species abilities…");
  await createManyChunked(
    "species abilities",
    speciesAbilities,
    (chunk) =>
      prisma.speciesAbility.createMany({
        data: chunk,
      }),
  );

  console.log("📝 Inserting species learnsets…");
  await createManyChunked(
    "species learnsets",
    speciesLearnset,
    (chunk) =>
      prisma.speciesLearnset.createMany({
        data: chunk,
        skipDuplicates: true,
      }),
  );

  console.log("📝 Inserting name variants…");
  await createManyChunked(
    "name variants",
    nameVariants,
    (chunk) =>
      prisma.nameVariant.createMany({
        data: chunk,
      }),
  );

  console.log("📝 Inserting type chart…");
  await createManyChunked(
    "type chart rows",
    typeChart,
    (chunk) =>
      prisma.typeChart.createMany({
        data: chunk,
      }),
  );

  console.log("🔁 Refreshing SpeciesSheet materialized view…");
  let refreshed = false;
  try {
    await prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW "SpeciesSheet"`);
    refreshed = true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2010") {
      const meta = (error.meta ?? {}) as { code?: unknown; message?: unknown };
      const metaCode = typeof meta.code === "string" ? meta.code : undefined;
      const metaMessage = typeof meta.message === "string" ? meta.message : "";
      if (metaCode === "42501" || metaMessage.includes("permission denied")) {
        console.warn("⚠️  REFRESH failed without ownership; calling helper instead.");
        await prisma.$queryRawUnsafe(`SELECT public.refresh_species_sheet()::text;`);
        refreshed = true;
      }
    }
    if (!refreshed) {
      throw error;
    }
  }

  const [speciesCount, moveCount, abilityCount, learnsetCount] = await Promise.all([
    prisma.species.count(),
    prisma.move.count(),
    prisma.ability.count(),
    prisma.speciesLearnset.count(),
  ]);

  console.log("✅ Seeding complete!");
  console.log("   Species: %d", speciesCount);
  console.log("   Moves: %d", moveCount);
  console.log("   Abilities: %d", abilityCount);
  console.log("   Learnset rows: %d", learnsetCount);
}

main()
  .catch((error) => {
    console.error("❌ Dex seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
