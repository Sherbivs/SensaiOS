import { prisma as prismaClient } from "../../models/index.js";

// ============================================================================
// RARITY SYSTEM (as per Game Design Bible § Retention Hooks)
// ============================================================================

/**
 * Rarity tiers with probabilities from Game Design Bible
 * Common: 60%, Uncommon: 25%, Rare: 12%, Ultra Rare: 2.9%, Shiny: 0.1%
 */
export type RarityTier = "common" | "uncommon" | "rare" | "ultra-rare";

const RARITY_THRESHOLDS = {
  ultraRare: 0.029,  // 2.9%
  rare: 0.149,       // 12% (0.029 + 0.12)
  uncommon: 0.399,   // 25% (0.149 + 0.25)
  // common: remaining 60%
} as const;

const SHINY_CHANCE = 0.001; // 0.1% (1 in 1000)

/**
 * Species pools by rarity (Gen 1 focused)
 */
const SPECIES_POOLS: Record<RarityTier, number[]> = {
  common: [
    10,  // Caterpie
    13,  // Weedle
    16,  // Pidgey
    19,  // Rattata
    21,  // Spearow
    23,  // Ekans
    41,  // Zubat
    43,  // Oddish
    46,  // Paras
    48,  // Venonat
    52,  // Meowth
    56,  // Mankey
    60,  // Poliwag
    69,  // Bellsprout
    72,  // Tentacool
    74,  // Geodude
    84,  // Doduo
    96,  // Drowzee
    100, // Voltorb
    118, // Goldeen
    129, // Magikarp
  ],
  uncommon: [
    1,   // Bulbasaur
    4,   // Charmander
    7,   // Squirtle
    25,  // Pikachu
    27,  // Sandshrew
    29,  // Nidoran♀
    32,  // Nidoran♂
    35,  // Clefairy
    37,  // Vulpix
    39,  // Jigglypuff
    50,  // Diglett
    54,  // Psyduck
    58,  // Growlithe
    63,  // Abra
    66,  // Machop
    77,  // Ponyta
    79,  // Slowpoke
    81,  // Magnemite
    88,  // Grimer
    90,  // Shellder
    92,  // Gastly
    95,  // Onix
    98,  // Krabby
    102, // Exeggcute
    104, // Cubone
    109, // Koffing
    111, // Rhyhorn
    116, // Horsea
    120, // Staryu
  ],
  rare: [
    12,  // Butterfree
    15,  // Beedrill
    18,  // Pidgeot
    26,  // Raichu
    31,  // Nidoqueen
    34,  // Nidoking
    36,  // Clefable
    38,  // Ninetales
    40,  // Wigglytuff
    57,  // Primeape
    59,  // Arcanine
    65,  // Alakazam
    68,  // Machamp
    76,  // Golem
    78,  // Rapidash
    80,  // Slowbro
    94,  // Gengar
    103, // Exeggutor
    112, // Rhydon
    113, // Chansey
    115, // Kangaskhan
    123, // Scyther
    124, // Jynx
    125, // Electabuzz
    126, // Magmar
    127, // Pinsir
    128, // Tauros
    130, // Gyarados
    131, // Lapras
    132, // Ditto
    133, // Eevee
    137, // Porygon
    142, // Aerodactyl
    143, // Snorlax
  ],
  "ultra-rare": [
    144, // Articuno
    145, // Zapdos
    146, // Moltres
    150, // Mewtwo
    151, // Mew
  ],
};

/**
 * Determine rarity tier based on random roll
 */
export function rollRarity(roll: number = Math.random()): RarityTier {
  if (roll < RARITY_THRESHOLDS.ultraRare) return "ultra-rare";
  if (roll < RARITY_THRESHOLDS.rare) return "rare";
  if (roll < RARITY_THRESHOLDS.uncommon) return "uncommon";
  return "common";
}

/**
 * Roll for shiny (1 in 1000 chance)
 */
export function rollShiny(roll: number = Math.random()): boolean {
  return roll < SHINY_CHANCE;
}

/**
 * Choose a species from a specific rarity pool
 */
export function chooseSpeciesFromPool(rarity: RarityTier, roll: number = Math.random()): number {
  const pool = SPECIES_POOLS[rarity];
  const index = Math.floor(roll * pool.length);
  return pool[index];
}

// Legacy function - now uses rarity system
export function chooseSpeciesId(): number {
  const rarity = rollRarity();
  return chooseSpeciesFromPool(rarity);
}

/**
 * Choose level based on rarity (rarer = potentially higher level)
 */
export function chooseLevel(rarity: RarityTier = "common"): number {
  const baseLevel = 2;
  const levelRange = rarity === "ultra-rare" ? 10 : 
                     rarity === "rare" ? 8 : 
                     rarity === "uncommon" ? 6 : 5;
  return baseLevel + Math.floor(Math.random() * levelRange);
}

export type SpawnOpts = {
  discordId: string;
  prisma?: typeof prismaClient;
};

export type SpawnResult = {
  id: string;
  speciesId: number;
  level: number;
  rarity: RarityTier;
  isShiny: boolean;
  ownerId: string;
  state: string;
  expiresAt: Date;
};

/**
 * Creates an Encounter row in Spawned state for a user and returns it.
 * A simple TTL of 60 minutes is applied via expiresAt.
 * Now includes rarity tier and shiny chance.
 */
export async function spawnEncounterForUser(opts: SpawnOpts): Promise<SpawnResult> {
  const prisma = opts.prisma ?? prismaClient;
  const user = await prisma.user.findUnique({ where: { discordId: opts.discordId } });
  if (!user) throw new Error("User not found for spawn");

  // Roll for rarity and shiny
  const rarity = rollRarity();
  const isShiny = rollShiny();
  const speciesId = chooseSpeciesFromPool(rarity);
  const level = chooseLevel(rarity);
  const expires = new Date(Date.now() + 60 * 60 * 1000);

  const enc = await prisma.encounter.create({
    data: {
      ownerId: user.id,
      speciesId,
      level,
      state: "Spawned",
      dataJson: {
        rarity,
        isShiny,
      },
      expiresAt: expires,
    },
  });
  
  return {
    id: enc.id,
    speciesId: enc.speciesId,
    level: enc.level,
    rarity,
    isShiny,
    ownerId: enc.ownerId,
    state: enc.state,
    expiresAt: expires,
  };
}

// ============================================================================
// FISHING ENCOUNTER
// ============================================================================

export type FishingSpawnOpts = {
  discordId: string;
  speciesId: number;
  level: number;
  isShiny: boolean;
  prisma?: typeof prismaClient;
};

/**
 * Creates an Encounter row for a fishing catch.
 * Accepts pre-rolled species/level/shiny from the fishing service.
 */
export async function spawnFishingEncounter(opts: FishingSpawnOpts): Promise<SpawnResult> {
  const prisma = opts.prisma ?? prismaClient;
  const user = await prisma.user.findUnique({ where: { discordId: opts.discordId } });
  if (!user) throw new Error("User not found for fishing spawn");

  const expires = new Date(Date.now() + 60 * 60 * 1000);

  const enc = await prisma.encounter.create({
    data: {
      ownerId: user.id,
      speciesId: opts.speciesId,
      level: opts.level,
      state: "Spawned",
      dataJson: {
        rarity: "fishing", // Mark as fishing encounter
        isShiny: opts.isShiny,
        source: "fishing",
      },
      expiresAt: expires,
    },
  });
  
  return {
    id: enc.id,
    speciesId: enc.speciesId,
    level: enc.level,
    rarity: "common", // Fishing doesn't use standard rarity
    isShiny: opts.isShiny,
    ownerId: enc.ownerId,
    state: enc.state,
    expiresAt: expires,
  };
}
