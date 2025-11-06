import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { PrismaClient, Prisma } from "@prisma/client";
import * as dotenv from "dotenv";

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

type CliFlags = {
  dryRun: boolean;
  skipGolden: boolean;
  onlyGolden: boolean;
  packHashOverride?: string;
};

type GoldenPokemonConfig = {
  id: string;
  nickname?: string;
  speciesSlug: string;
  level: number;
  moves: string[];
  nature?: string;
  isShiny?: boolean;
  status?: string | null;
};

type GoldenPartySlotConfig = {
  slot: number;
  pokemonId: string;
};

type GoldenEncounterConfig = {
  id: string;
  speciesSlug: string;
  level: number;
  notes?: string;
  state?: string;
};

type GoldenDailyQuestConfig = {
  streak: number;
  lastCompleted: string;
  lastReset?: string;
};

type GoldenUserConfig = {
  key: string;
  userId: string;
  discordId: string;
  displayName: string;
  coins: number;
  trainerId: string;
  trainerNickname: string;
  preferences: Prisma.JsonObject;
  profile: {
    tagline: string;
    bio: string;
    favoriteSpeciesSlug: string;
  };
  dailyQuest: GoldenDailyQuestConfig;
  pokemon: GoldenPokemonConfig[];
  party: GoldenPartySlotConfig[];
  encounter?: GoldenEncounterConfig;
};

type SpeciesLookupRecord = {
  id: number;
  slug: string;
  baseHp: number;
};

type MoveLookupRecord = {
  id: number;
  slug: string;
  name: string;
  pp: number;
};

const GOLDEN_TENANT_ID = "golden";
const GOLDEN_SEED_NOTES = "golden-seed";

const GOLDEN_USERS: GoldenUserConfig[] = [
  {
    key: "ash",
    userId: "user_golden_ash",
    discordId: "golden-ash",
    displayName: "Ash Redwood",
    coins: 1250,
    trainerId: "trainer_golden_ash",
    trainerNickname: "Ash",
    preferences: {
      battleTheme: "kanto",
      autoHeal: true,
      ui: { layout: "compact" },
    } satisfies Prisma.JsonObject,
    profile: {
      tagline: "Chasing Indigo glory.",
      bio: "Keeps meticulous notes on every spar and relies on DEX v2 telemetry to prep for league battles.",
      favoriteSpeciesSlug: "pikachu",
    },
    dailyQuest: {
      streak: 5,
      lastCompleted: "2025-11-04T09:15:00.000Z",
    },
    pokemon: [
      {
        id: "pkm_golden_ash_pikachu",
        nickname: "Volt",
        speciesSlug: "pikachu",
        level: 42,
        moves: ["thunderbolt", "thunder-wave", "tackle", "growl"],
        nature: "bold",
      },
      {
        id: "pkm_golden_ash_charizard",
        nickname: "Blaze",
        speciesSlug: "charizard",
        level: 48,
        moves: ["flamethrower", "dragon-pulse", "flare-blitz", "growl"],
        nature: "brave",
      },
    ],
    party: [
      { slot: 1, pokemonId: "pkm_golden_ash_pikachu" },
      { slot: 2, pokemonId: "pkm_golden_ash_charizard" },
    ],
    encounter: {
      id: "enc_golden_ash_talonflame",
      speciesSlug: "talonflame",
      level: 38,
      notes: "Ash's practice encounter for dex smoke flows.",
    },
  },
  {
    key: "misty",
    userId: "user_golden_misty",
    discordId: "golden-misty",
    displayName: "Misty Blue",
    coins: 980,
    trainerId: "trainer_golden_misty",
    trainerNickname: "Misty",
    preferences: {
      battleTheme: "cerulean",
      autoHeal: false,
      overlays: { encounterHints: true },
    } satisfies Prisma.JsonObject,
    profile: {
      tagline: "Water and wind in perfect sync.",
      bio: "Runs nightly smoke drills to confirm persistence, cache hydration, and encounter fallbacks stay healthy.",
      favoriteSpeciesSlug: "vaporeon",
    },
    dailyQuest: {
      streak: 3,
      lastCompleted: "2025-11-03T21:30:00.000Z",
    },
    pokemon: [
      {
        id: "pkm_golden_misty_vaporeon",
        nickname: "Ripple",
        speciesSlug: "vaporeon",
        level: 44,
        moves: ["surf", "ice-beam", "giga-drain", "growl"],
        nature: "calm",
      },
      {
        id: "pkm_golden_misty_garchomp",
        nickname: "Gale",
        speciesSlug: "garchomp",
        level: 46,
        moves: ["earthquake", "dragon-pulse", "dragon-rage", "bite"],
        nature: "jolly",
      },
    ],
    party: [
      { slot: 1, pokemonId: "pkm_golden_misty_vaporeon" },
      { slot: 2, pokemonId: "pkm_golden_misty_garchomp" },
    ],
    encounter: {
      id: "enc_golden_misty_rotom",
      speciesSlug: "rotom",
      level: 30,
      notes: "Encounter used to verify cache + persistence with DEX v2 seeds.",
    },
  },
];

const MAX_IVS: Prisma.JsonObject = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_EVS: Prisma.JsonObject = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function parseCliFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    dryRun: false,
    skipGolden: false,
    onlyGolden: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (arg === "--skip-golden") {
      flags.skipGolden = true;
      continue;
    }
    if (arg === "--only-golden") {
      flags.onlyGolden = true;
      flags.skipGolden = false;
      continue;
    }
    if (arg.startsWith("--pack-hash=")) {
      const value = arg.slice("--pack-hash=".length).trim();
      if (value) {
        flags.packHashOverride = value;
      }
      continue;
    }
    if (arg.startsWith("--golden-pack-hash=")) {
      const value = arg.slice("--golden-pack-hash=".length).trim();
      if (value) {
        flags.packHashOverride = value;
      }
    }
  }

  return flags;
}

function resolveDefaultPackHash(): string {
  const manifestPath = path.join(process.cwd(), "assets", "dexpack.v2.json");
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw) as { hash?: unknown };
    if (typeof manifest.hash === "string" && manifest.hash.length > 0) {
      return manifest.hash;
    }
  } catch (error) {
    console.warn("⚠️  Unable to read dexpack manifest at %s (%s).", manifestPath, (error as Error).message);
  }

  const fallback = process.env.DEX_PACK_HASH ?? "";
  if (!fallback) {
    throw new Error(
      "Unable to resolve DexPack hash. Pass --pack-hash=<hash> or set DEX_PACK_HASH before seeding the golden tenant.",
    );
  }
  return fallback;
}

function computeHpStat(baseHp: number, level: number): number {
  const normalized = Math.max(1, baseHp);
  return Math.max(1, Math.floor(((normalized * 2 + 31) * level) / 100) + level + 10);
}

function coerceDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

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

async function seedGoldenTenant(options: { packHash: string; dryRun: boolean }): Promise<void> {
  const packHash = options.packHash;
  const speciesSlugs = new Set<string>();
  const moveSlugs = new Set<string>();

  for (const user of GOLDEN_USERS) {
    speciesSlugs.add(user.profile.favoriteSpeciesSlug);
    for (const mon of user.pokemon) {
      speciesSlugs.add(mon.speciesSlug);
      mon.moves.forEach((slug) => moveSlugs.add(slug));
    }
    if (user.encounter) {
      speciesSlugs.add(user.encounter.speciesSlug);
    }
  }

  const speciesRecords = await prisma.species.findMany({
    where: { slug: { in: Array.from(speciesSlugs) } },
    select: { id: true, slug: true, baseHp: true },
  });
  const moveRecords = await prisma.move.findMany({
    where: { slug: { in: Array.from(moveSlugs) } },
    select: { id: true, slug: true, name: true, pp: true },
  });

  const speciesMap = new Map<string, SpeciesLookupRecord>(speciesRecords.map((record) => [record.slug, record]));
  const moveMap = new Map<string, MoveLookupRecord>(moveRecords.map((record) => [record.slug, record]));

  const missingSpecies = Array.from(speciesSlugs).filter((slug) => !speciesMap.has(slug));
  if (missingSpecies.length) {
    throw new Error(`Golden tenant seed references unknown species: ${missingSpecies.join(", ")}`);
  }

  const missingMoves = Array.from(moveSlugs).filter((slug) => !moveMap.has(slug));
  if (missingMoves.length) {
    throw new Error(`Golden tenant seed references unknown moves: ${missingMoves.join(", ")}`);
  }

  const encounterCount = GOLDEN_USERS.filter((user) => Boolean(user.encounter)).length;

  if (options.dryRun) {
    console.log(
      "🌟 [dry-run] Golden tenant would seed %d trainers, %d party Pokémon, and %d encounters (pack %s).",
      GOLDEN_USERS.length,
      GOLDEN_USERS.reduce((sum, user) => sum + user.pokemon.length, 0),
      encounterCount,
      packHash,
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.tenant.upsert({
      where: { id: GOLDEN_TENANT_ID },
      update: {},
      create: { id: GOLDEN_TENANT_ID },
    });

    const preservedEncounterIds: string[] = [];

    for (const userConfig of GOLDEN_USERS) {
      const userSettings: Prisma.JsonObject = {
        goldenSeed: true,
        displayName: userConfig.displayName,
      };

      const user = await tx.user.upsert({
        where: { discordId: userConfig.discordId },
        update: {
          coins: userConfig.coins,
          dailyQuestStreak: userConfig.dailyQuest.streak,
          dailyQuestLastCompleted: coerceDate(userConfig.dailyQuest.lastCompleted),
          dailyQuestLastReset: coerceDate(userConfig.dailyQuest.lastReset),
          settingsJson: userSettings,
        },
        create: {
          id: userConfig.userId,
          discordId: userConfig.discordId,
          coins: userConfig.coins,
          dailyQuestStreak: userConfig.dailyQuest.streak,
          dailyQuestLastCompleted: coerceDate(userConfig.dailyQuest.lastCompleted),
          dailyQuestLastReset: coerceDate(userConfig.dailyQuest.lastReset),
          settingsJson: userSettings,
        },
      });

      const trainer = await tx.trainer.upsert({
        where: { id: userConfig.trainerId },
        update: {
          tenantId: GOLDEN_TENANT_ID,
          userId: user.id,
          nickname: userConfig.trainerNickname,
        },
        create: {
          id: userConfig.trainerId,
          tenantId: GOLDEN_TENANT_ID,
          userId: user.id,
          nickname: userConfig.trainerNickname,
        },
      });

      await tx.trainerSettings.upsert({
        where: { trainerId: trainer.id },
        update: {
          activePack: packHash,
          prefsJson: userConfig.preferences,
          updatedAt: new Date(),
        },
        create: {
          trainerId: trainer.id,
          activePack: packHash,
          prefsJson: userConfig.preferences,
        },
      });

      const favoriteSpecies = speciesMap.get(userConfig.profile.favoriteSpeciesSlug);
      const favoriteSpeciesId = favoriteSpecies?.id ?? null;

      await tx.trainerProfile.upsert({
        where: { userId: user.id },
        update: {
          tagline: userConfig.profile.tagline,
          bio: userConfig.profile.bio,
          favoriteSpeciesId,
        },
        create: {
          userId: user.id,
          tagline: userConfig.profile.tagline,
          bio: userConfig.profile.bio,
          favoriteSpeciesId,
        },
      });

      const seededPokemonIds: string[] = [];

      for (const mon of userConfig.pokemon) {
        const species = speciesMap.get(mon.speciesSlug);
        if (!species) {
          throw new Error(`Failed to resolve species for ${mon.speciesSlug}`);
        }

        const hpStat = computeHpStat(species.baseHp, mon.level);

        const movesJson = mon.moves.map((slug) => {
          const move = moveMap.get(slug);
          if (!move) {
            throw new Error(`Failed to resolve move '${slug}' for golden seed ${mon.id}`);
          }
          const pp = typeof move.pp === "number" && move.pp > 0 ? move.pp : 10;
          return {
            id: move.id,
            slug: move.slug,
            name: move.name,
            pp,
            maxPP: pp,
          } satisfies Prisma.JsonObject;
        });

        await tx.pokemonInstance.upsert({
          where: { id: mon.id },
          update: {
            ownerId: user.id,
            speciesId: species.id,
            level: mon.level,
            exp: mon.level * 100,
            nature: mon.nature ?? "hardy",
            isShiny: Boolean(mon.isShiny),
            nickname: mon.nickname ?? null,
            status: mon.status ?? null,
            hp: hpStat,
            maxHp: hpStat,
            movesJson: movesJson as Prisma.JsonArray,
            ivsJson: MAX_IVS,
            evsJson: ZERO_EVS,
            trainerId: trainer.id,
            tenantId: GOLDEN_TENANT_ID,
            packHash,
          },
          create: {
            id: mon.id,
            ownerId: user.id,
            speciesId: species.id,
            level: mon.level,
            exp: mon.level * 100,
            nature: mon.nature ?? "hardy",
            isShiny: Boolean(mon.isShiny),
            nickname: mon.nickname ?? null,
            status: mon.status ?? null,
            hp: hpStat,
            maxHp: hpStat,
            movesJson: movesJson as Prisma.JsonArray,
            ivsJson: MAX_IVS,
            evsJson: ZERO_EVS,
            trainerId: trainer.id,
            tenantId: GOLDEN_TENANT_ID,
            packHash,
          },
        });

        seededPokemonIds.push(mon.id);
      }

      const party = await tx.party.upsert({
        where: { ownerId: user.id },
        update: { trainerId: trainer.id },
        create: {
          id: `party_${trainer.id}`,
          ownerId: user.id,
          trainerId: trainer.id,
        },
      });

      for (const slot of userConfig.party) {
        if (!seededPokemonIds.includes(slot.pokemonId)) {
          throw new Error(`Party slot references unknown Pokémon ${slot.pokemonId}`);
        }
        await tx.partySlot.upsert({
          where: { partyId_slot: { partyId: party.id, slot: slot.slot } },
          update: { pokemonId: slot.pokemonId },
          create: {
            id: `${party.id}_slot_${slot.slot}`,
            partyId: party.id,
            slot: slot.slot,
            pokemonId: slot.pokemonId,
          },
        });
      }

      const partySlotsToKeep = userConfig.party.map((entry) => entry.slot);
      if (partySlotsToKeep.length > 0) {
        await tx.partySlot.deleteMany({
          where: {
            partyId: party.id,
            slot: { notIn: partySlotsToKeep },
          },
        });
      } else {
        await tx.partySlot.deleteMany({ where: { partyId: party.id } });
      }

      if (seededPokemonIds.length > 0) {
        await tx.pokemonInstance.deleteMany({
          where: {
            ownerId: user.id,
            id: { notIn: seededPokemonIds },
            tenantId: GOLDEN_TENANT_ID,
          },
        });
      } else {
        await tx.pokemonInstance.deleteMany({
          where: { ownerId: user.id, tenantId: GOLDEN_TENANT_ID },
        });
      }

      if (userConfig.encounter) {
        const encounterSpecies = speciesMap.get(userConfig.encounter.speciesSlug);
        if (!encounterSpecies) {
          throw new Error(`Encounter references unknown species ${userConfig.encounter.speciesSlug}`);
        }

        const encounterState = userConfig.encounter.state ?? "Spawned";
        preservedEncounterIds.push(userConfig.encounter.id);

        await tx.encounter.upsert({
          where: { id: userConfig.encounter.id },
          update: {
            ownerId: user.id,
            speciesId: encounterSpecies.id,
            level: userConfig.encounter.level,
            state: encounterState,
            tenantId: GOLDEN_TENANT_ID,
            trainerId: trainer.id,
            packHash,
            startedAt: coerceDate("2025-11-01T00:00:00.000Z") ?? new Date(),
            dataJson: {
              source: GOLDEN_SEED_NOTES,
              notes: userConfig.encounter.notes ?? null,
            } satisfies Prisma.JsonObject,
          },
          create: {
            id: userConfig.encounter.id,
            ownerId: user.id,
            speciesId: encounterSpecies.id,
            level: userConfig.encounter.level,
            state: encounterState,
            tenantId: GOLDEN_TENANT_ID,
            trainerId: trainer.id,
            packHash,
            startedAt: coerceDate("2025-11-01T00:00:00.000Z") ?? new Date(),
            dataJson: {
              source: GOLDEN_SEED_NOTES,
              notes: userConfig.encounter.notes ?? null,
            } satisfies Prisma.JsonObject,
          },
        });
      }
    }

    if (preservedEncounterIds.length > 0) {
      await tx.encounter.deleteMany({
        where: {
          tenantId: GOLDEN_TENANT_ID,
          id: { notIn: preservedEncounterIds },
        },
      });
    } else {
      await tx.encounter.deleteMany({ where: { tenantId: GOLDEN_TENANT_ID } });
    }
  });

  console.log(
    "🌟 Golden tenant ready: %d trainers, %d Pokémon, %d encounters (pack %s).",
    GOLDEN_USERS.length,
    GOLDEN_USERS.reduce((sum, user) => sum + user.pokemon.length, 0),
    encounterCount,
    packHash,
  );
}

async function seedReferenceDex(options: { dryRun: boolean }): Promise<void> {
  const { dryRun } = options;

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

async function main(): Promise<void> {
  loadEnvironment();
  const flags = parseCliFlags(process.argv.slice(2));

  const shouldSeedGolden = !flags.skipGolden || flags.onlyGolden;
  const resolvedPackHash = shouldSeedGolden
    ? flags.packHashOverride ?? resolveDefaultPackHash()
    : undefined;

  if (flags.onlyGolden) {
    if (!resolvedPackHash) {
      throw new Error("Pack hash resolution failed for golden-only seeding.");
    }
    console.log("🌟 Seeding golden tenant only (pack %s, dryRun=%s)…", resolvedPackHash, flags.dryRun);
    await seedGoldenTenant({ packHash: resolvedPackHash, dryRun: flags.dryRun });
    return;
  }

  await seedReferenceDex({ dryRun: flags.dryRun });

  if (flags.skipGolden) {
    console.log("⏭️  Skipping golden tenant seeding (flag provided).");
    return;
  }

  if (!resolvedPackHash) {
    throw new Error("Pack hash resolution failed for golden tenant seeding.");
  }

  await seedGoldenTenant({ packHash: resolvedPackHash, dryRun: flags.dryRun });
}

main()
  .catch((error) => {
    console.error("❌ Dex seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
