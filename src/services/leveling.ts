/**
 * Leveling Service
 * 
 * Handles experience gain, level-up calculations, and evolution checks.
 * Uses the medium-fast experience curve (Gen VII+ formula).
 * 
 * PSYCHOLOGY HOOK #3 (Evolution Near-Miss Effect):
 * Displays "Just 12 more XP to evolve!" when close to evolution.
 * As players get closer to a goal, motivation increases.
 * 
 * @module services/leveling
 */

import { prisma } from "../shared/prisma.js";
import { getLogger } from "../shared/logging/index.js";
import { getPokemon } from "../lib/dex-api.js";

const logger = getLogger();

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum level a Pokémon can reach */
const MAX_LEVEL = 100;

/** Base EXP yield multipliers by type of victory */
const EXP_MULTIPLIERS = {
  wildBattle: 1.0,
  trainerBattle: 1.5,
  gymLeader: 2.0,
  legendary: 3.0,
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface LevelUpResult {
  /** Whether level increased */
  leveledUp: boolean;
  /** Previous level before gaining XP */
  previousLevel: number;
  /** New level after gaining XP */
  newLevel: number;
  /** Total levels gained (can be multiple) */
  levelsGained: number;
  /** Current XP after gain */
  currentExp: number;
  /** XP needed to reach next level */
  expToNextLevel: number;
  /** New moves learned at this level */
  newMoves: LearnedMove[];
  /** Evolution info if available */
  evolution: EvolutionCheck | null;
}

export interface LearnedMove {
  moveId: number;
  moveName: string;
  level: number;
}

export interface EvolutionCheck {
  /** Whether evolution is available now */
  canEvolve: boolean;
  /** What the Pokémon can evolve into */
  evolvesTo?: { speciesId: number; speciesName: string };
  /** Evolution method (level, item, trade, etc.) */
  method?: string;
  /** For level-based: "Just 5 more XP to evolve!" message */
  nearMissMessage?: string;
  /** XP remaining until evolution level */
  expUntilEvolution?: number;
  /** Whether they're "close" to evolution (within 20% of level) */
  isNearMiss: boolean;
}

export interface ExpGainResult {
  /** Pokémon ID that gained XP */
  pokemonId: string;
  /** XP amount gained */
  expGained: number;
  /** Level up info */
  levelUp: LevelUpResult;
  /** Species name for display */
  speciesName: string;
}

// ============================================================================
// EXPERIENCE FORMULAS
// ============================================================================

/**
 * Calculate total XP needed to reach a given level (medium-fast curve)
 * Formula: n^3 (simplified Gen VII+ medium-fast)
 */
function expForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL) return expForLevel(MAX_LEVEL);
  return Math.floor(Math.pow(level, 3));
}

/**
 * Calculate level from total XP
 */
function levelFromExp(totalExp: number): number {
  if (totalExp <= 0) return 1;
  
  // Binary search for level
  let low = 1;
  let high = MAX_LEVEL;
  
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (expForLevel(mid) <= totalExp) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  
  return low;
}

/**
 * Calculate XP needed to go from current level to next level
 */
function expToNextLevel(currentLevel: number, currentExp: number): number {
  if (currentLevel >= MAX_LEVEL) return 0;
  
  const nextLevelExp = expForLevel(currentLevel + 1);
  return Math.max(0, nextLevelExp - currentExp);
}

/**
 * Calculate base EXP yield from defeating a Pokémon
 * Simplified formula: baseHp * level / 5
 */
function calculateExpYield(
  defeatedSpeciesId: number,
  defeatedLevel: number,
  multiplier: number = 1.0
): number {
  // Get base HP from dex as proxy for base exp (default to 50)
  const pokemon = getPokemon(defeatedSpeciesId);
  const baseHp = pokemon?.baseStats?.hp ?? pokemon?.stats?.hp ?? 50;
  
  // Simplified formula: baseHp serves as proxy for exp yield
  const exp = Math.floor((baseHp * defeatedLevel) / 5);
  
  // Apply multiplier and minimum of 1
  return Math.max(1, Math.floor(exp * multiplier));
}

// ============================================================================
// LEVEL UP LOGIC
// ============================================================================

/**
 * Award XP to a Pokémon and check for level ups
 */
async function awardExp(
  pokemonId: string,
  expAmount: number
): Promise<ExpGainResult | null> {
  try {
    // Fetch current state
    const pokemon = await prisma.pokemonInstance.findUnique({
      where: { id: pokemonId },
      select: {
        id: true,
        speciesId: true,
        level: true,
        exp: true,
        maxHp: true,
        hp: true,
      },
    });

    if (!pokemon) {
      logger.warn("Leveling", "awardExp", "Pokemon not found", { 
        userId: pokemonId,
      });
      return null;
    }

    // Calculate new state
    const previousLevel = pokemon.level;
    const newTotalExp = pokemon.exp + expAmount;
    const newLevel = Math.min(MAX_LEVEL, levelFromExp(newTotalExp));
    const levelsGained = newLevel - previousLevel;

    // Get species info
    const species = getPokemon(pokemon.speciesId);
    const speciesName = species?.name ?? `Species #${pokemon.speciesId}`;

    // Check for new moves learned
    const newMoves: LearnedMove[] = [];
    if (levelsGained > 0 && species) {
      // Get level-up moves between previousLevel and newLevel
      const learnset = species.learnset?.levelUp ?? [];
      for (const entry of learnset) {
        const entryLevel = entry.level ?? 0;
        if (entryLevel > previousLevel && entryLevel <= newLevel) {
          newMoves.push({
            moveId: 0, // TODO: Get move ID from name
            moveName: entry.name,
            level: entryLevel,
          });
        }
      }
    }

    // Calculate HP increase for level ups
    let newMaxHp = pokemon.maxHp;
    let newHp = pokemon.hp;
    if (levelsGained > 0) {
      // Simple HP formula: increase max HP proportionally
      const hpPerLevel = 3; // Simplified
      newMaxHp = pokemon.maxHp + (hpPerLevel * levelsGained);
      // Heal the gained HP amount
      newHp = Math.min(pokemon.hp + (hpPerLevel * levelsGained), newMaxHp);
    }

    // Update database
    await prisma.pokemonInstance.update({
      where: { id: pokemonId },
      data: {
        exp: newTotalExp,
        level: newLevel,
        maxHp: newMaxHp,
        hp: newHp,
      },
    });

    // Check evolution
    const evolution = checkEvolution(pokemon.speciesId, newLevel, newTotalExp);

    logger.info("Leveling", "awardExp", "XP awarded", {
      userId: pokemonId,
      metadata: { 
        speciesName,
        expAmount,
        previousLevel,
        newLevel,
        levelsGained,
      },
    });

    return {
      pokemonId,
      expGained: expAmount,
      speciesName,
      levelUp: {
        leveledUp: levelsGained > 0,
        previousLevel,
        newLevel,
        levelsGained,
        currentExp: newTotalExp,
        expToNextLevel: expToNextLevel(newLevel, newTotalExp),
        newMoves,
        evolution,
      },
    };
  } catch (error) {
    logger.error("Leveling", "awardExp", "Failed to award XP", {
      userId: pokemonId,
      metadata: { error, expAmount },
    });
    return null;
  }
}

// ============================================================================
// EVOLUTION CHECKING
// ============================================================================

/**
 * Common evolution levels for starter-like Pokemon
 * This is a simplified lookup since we don't have full evolution data in dex-api
 */
const EVOLUTION_LEVELS: Record<number, { level: number; evolvesTo: { id: number; name: string } }> = {
  // Gen 1 starters (for reference, though forbidden)
  1: { level: 16, evolvesTo: { id: 2, name: "Ivysaur" } },    // Bulbasaur
  4: { level: 16, evolvesTo: { id: 5, name: "Charmeleon" } }, // Charmander
  7: { level: 16, evolvesTo: { id: 8, name: "Wartortle" } },  // Squirtle
  
  // Common early-game Pokemon
  10: { level: 7, evolvesTo: { id: 11, name: "Metapod" } },    // Caterpie
  13: { level: 7, evolvesTo: { id: 14, name: "Kakuna" } },     // Weedle
  16: { level: 18, evolvesTo: { id: 17, name: "Pidgeotto" } }, // Pidgey
  19: { level: 20, evolvesTo: { id: 20, name: "Raticate" } },  // Rattata
  21: { level: 20, evolvesTo: { id: 22, name: "Fearow" } },    // Spearow
  25: { level: 1, evolvesTo: { id: 26, name: "Raichu" } },     // Pikachu (thunder stone)
  29: { level: 16, evolvesTo: { id: 30, name: "Nidorina" } },  // Nidoran♀
  32: { level: 16, evolvesTo: { id: 33, name: "Nidorino" } },  // Nidoran♂
  41: { level: 22, evolvesTo: { id: 42, name: "Golbat" } },    // Zubat
  43: { level: 21, evolvesTo: { id: 44, name: "Gloom" } },     // Oddish
  46: { level: 24, evolvesTo: { id: 47, name: "Parasect" } },  // Paras
  48: { level: 31, evolvesTo: { id: 49, name: "Venomoth" } },  // Venonat
  50: { level: 26, evolvesTo: { id: 51, name: "Dugtrio" } },   // Diglett
  52: { level: 28, evolvesTo: { id: 53, name: "Persian" } },   // Meowth
  54: { level: 33, evolvesTo: { id: 55, name: "Golduck" } },   // Psyduck
  56: { level: 28, evolvesTo: { id: 57, name: "Primeape" } },  // Mankey
  58: { level: 1, evolvesTo: { id: 59, name: "Arcanine" } },   // Growlithe (fire stone)
  60: { level: 25, evolvesTo: { id: 61, name: "Poliwhirl" } }, // Poliwag
  63: { level: 16, evolvesTo: { id: 64, name: "Kadabra" } },   // Abra
  66: { level: 28, evolvesTo: { id: 67, name: "Machoke" } },   // Machop
  69: { level: 21, evolvesTo: { id: 70, name: "Weepinbell" } },// Bellsprout
  72: { level: 30, evolvesTo: { id: 73, name: "Tentacruel" } },// Tentacool
  74: { level: 25, evolvesTo: { id: 75, name: "Graveler" } },  // Geodude
  77: { level: 40, evolvesTo: { id: 78, name: "Rapidash" } },  // Ponyta
  79: { level: 37, evolvesTo: { id: 80, name: "Slowbro" } },   // Slowpoke
  81: { level: 30, evolvesTo: { id: 82, name: "Magneton" } },  // Magnemite
  84: { level: 31, evolvesTo: { id: 85, name: "Dodrio" } },    // Doduo
  86: { level: 34, evolvesTo: { id: 87, name: "Dewgong" } },   // Seel
  88: { level: 38, evolvesTo: { id: 89, name: "Muk" } },       // Grimer
  90: { level: 1, evolvesTo: { id: 91, name: "Cloyster" } },   // Shellder (water stone)
  92: { level: 25, evolvesTo: { id: 93, name: "Haunter" } },   // Gastly
  96: { level: 26, evolvesTo: { id: 97, name: "Hypno" } },     // Drowzee
  98: { level: 28, evolvesTo: { id: 99, name: "Kingler" } },   // Krabby
  100: { level: 30, evolvesTo: { id: 101, name: "Electrode" } }, // Voltorb
  102: { level: 1, evolvesTo: { id: 103, name: "Exeggutor" } },  // Exeggcute (leaf stone)
  104: { level: 28, evolvesTo: { id: 105, name: "Marowak" } },   // Cubone
  109: { level: 35, evolvesTo: { id: 110, name: "Weezing" } },   // Koffing
  111: { level: 42, evolvesTo: { id: 112, name: "Rhydon" } },    // Rhyhorn
  116: { level: 32, evolvesTo: { id: 117, name: "Seadra" } },    // Horsea
  118: { level: 33, evolvesTo: { id: 119, name: "Seaking" } },   // Goldeen
  120: { level: 1, evolvesTo: { id: 121, name: "Starmie" } },    // Staryu (water stone)
  129: { level: 20, evolvesTo: { id: 130, name: "Gyarados" } },  // Magikarp
  133: { level: 1, evolvesTo: { id: 134, name: "Vaporeon" } },   // Eevee (stone)
  147: { level: 30, evolvesTo: { id: 148, name: "Dragonair" } }, // Dratini
  // More can be added as needed
};

/**
 * Check if a Pokémon can evolve or is close to evolution
 */
function checkEvolution(
  speciesId: number,
  currentLevel: number,
  currentExp: number
): EvolutionCheck {
  // Default response for no evolution
  const noEvolution: EvolutionCheck = {
    canEvolve: false,
    isNearMiss: false,
  };

  const evolutionData = EVOLUTION_LEVELS[speciesId];
  if (!evolutionData) return noEvolution;

  const { level: evolutionLevel, evolvesTo } = evolutionData;

  // Stone evolutions (level 1) need items, so just note they exist
  if (evolutionLevel === 1) {
    return {
      canEvolve: false,
      evolvesTo: {
        speciesId: evolvesTo.id,
        speciesName: evolvesTo.name,
      },
      method: "item",
      isNearMiss: false,
    };
  }

  if (currentLevel >= evolutionLevel) {
    // Can evolve now!
    return {
      canEvolve: true,
      evolvesTo: {
        speciesId: evolvesTo.id,
        speciesName: evolvesTo.name,
      },
      method: "level-up",
      isNearMiss: false,
    };
  }

  // Check if near-miss (within 3 levels)
  const levelsToEvolution = evolutionLevel - currentLevel;
  const expNeededForEvolution = expForLevel(evolutionLevel);
  const expUntilEvolution = Math.max(0, expNeededForEvolution - currentExp);

  if (levelsToEvolution <= 3 || expUntilEvolution <= 100) {
    return {
      canEvolve: false,
      evolvesTo: {
        speciesId: evolvesTo.id,
        speciesName: evolvesTo.name,
      },
      method: "level-up",
      isNearMiss: true,
      expUntilEvolution,
      nearMissMessage: expUntilEvolution <= 50
        ? `Just ${expUntilEvolution} more XP to evolve into ${evolvesTo.name}!`
        : `${levelsToEvolution} more level${levelsToEvolution > 1 ? "s" : ""} until ${evolvesTo.name}!`,
    };
  }

  // Has evolution but not close
  return {
    canEvolve: false,
    evolvesTo: {
      speciesId: evolvesTo.id,
      speciesName: evolvesTo.name,
    },
    method: "level-up",
    isNearMiss: false,
    expUntilEvolution,
  };
}

/**
 * Perform evolution on a Pokémon
 */
async function evolvePokemon(
  pokemonId: string,
  targetSpeciesId: number
): Promise<boolean> {
  try {
    const pokemon = await prisma.pokemonInstance.findUnique({
      where: { id: pokemonId },
      select: {
        id: true,
        speciesId: true,
        level: true,
        hp: true,
        maxHp: true,
      },
    });

    if (!pokemon) return false;

    // Get evolution check to verify this is valid
    const evolution = checkEvolution(pokemon.speciesId, pokemon.level, 0);
    
    if (!evolution.canEvolve || evolution.evolvesTo?.speciesId !== targetSpeciesId) {
      logger.warn("Leveling", "evolvePokemon", "Invalid evolution attempt", {
        userId: pokemonId,
        metadata: {
          targetSpeciesId,
          currentSpecies: pokemon.speciesId,
          canEvolve: evolution.canEvolve,
        },
      });
      return false;
    }

    // Get new species stats
    const newSpecies = getPokemon(targetSpeciesId);
    if (!newSpecies) return false;

    // Calculate new max HP (base + level bonus)
    const baseHp = newSpecies.baseStats?.hp ?? newSpecies.stats?.hp ?? 50;
    const newMaxHp = baseHp + Math.floor(pokemon.level * 3);
    const hpDiff = newMaxHp - pokemon.maxHp;
    const newHp = Math.min(pokemon.hp + Math.max(0, hpDiff), newMaxHp);

    // Update to new species
    await prisma.pokemonInstance.update({
      where: { id: pokemonId },
      data: {
        speciesId: targetSpeciesId,
        maxHp: newMaxHp,
        hp: newHp,
      },
    });

    logger.info("Leveling", "evolvePokemon", "Pokemon evolved", {
      userId: pokemonId,
      metadata: {
        fromSpecies: pokemon.speciesId,
        toSpecies: targetSpeciesId,
      },
    });

    return true;
  } catch (error) {
    logger.error("Leveling", "evolvePokemon", "Evolution failed", {
      userId: pokemonId,
      metadata: { error, targetSpeciesId },
    });
    return false;
  }
}

// ============================================================================
// BATTLE INTEGRATION
// ============================================================================

/**
 * Award XP after a wild battle victory
 */
async function awardWildBattleExp(
  victorPokemonId: string,
  defeatedSpeciesId: number,
  defeatedLevel: number
): Promise<ExpGainResult | null> {
  const expYield = calculateExpYield(
    defeatedSpeciesId,
    defeatedLevel,
    EXP_MULTIPLIERS.wildBattle
  );
  
  return awardExp(victorPokemonId, expYield);
}

/**
 * Award XP after a trainer battle victory
 * Splits exp among participating Pokémon
 */
async function awardTrainerBattleExp(
  victorPokemonIds: string[],
  defeatedSpeciesIds: { speciesId: number; level: number }[]
): Promise<ExpGainResult[]> {
  // Calculate total exp from all defeated Pokémon
  let totalExp = 0;
  for (const defeated of defeatedSpeciesIds) {
    totalExp += calculateExpYield(
      defeated.speciesId,
      defeated.level,
      EXP_MULTIPLIERS.trainerBattle
    );
  }

  // Split among victors (minimum 1 XP each)
  const expPerPokemon = Math.max(1, Math.floor(totalExp / victorPokemonIds.length));

  const results: ExpGainResult[] = [];
  for (const pokemonId of victorPokemonIds) {
    const result = await awardExp(pokemonId, expPerPokemon);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Award XP after catching a Pokémon (Pokemon GO style)
 * Your lead Pokemon gains a small amount of XP for helping with the catch
 * Uses a catch-specific multiplier (lower than battles to encourage battling)
 */
const CATCH_EXP_MULTIPLIER = 0.5; // 50% of wild battle XP

async function awardCatchExp(
  leadPokemonId: string,
  caughtSpeciesId: number,
  caughtLevel: number
): Promise<ExpGainResult | null> {
  const expYield = calculateExpYield(
    caughtSpeciesId,
    caughtLevel,
    CATCH_EXP_MULTIPLIER
  );
  
  return awardExp(leadPokemonId, expYield);
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Build progress bar for XP display
 */
function buildExpBar(currentExp: number, nextLevelExp: number, width: number = 10): string {
  if (nextLevelExp === 0) return "██████████"; // Max level

  const progress = Math.min(1, currentExp / nextLevelExp);
  const filled = Math.floor(progress * width);
  const empty = width - filled;

  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Format level up message for display
 */
function formatLevelUpMessage(result: ExpGainResult): string {
  const { speciesName, levelUp } = result;
  const lines: string[] = [];

  lines.push(`**${speciesName}** gained ${result.expGained} XP!`);

  if (levelUp.leveledUp) {
    lines.push("");
    lines.push(`🎉 **${speciesName}** grew to Level ${levelUp.newLevel}!`);

    if (levelUp.newMoves.length > 0) {
      lines.push("");
      for (const move of levelUp.newMoves) {
        lines.push(`✨ Learned **${move.moveName}**!`);
      }
    }
  }

  if (levelUp.evolution) {
    if (levelUp.evolution.canEvolve && levelUp.evolution.evolvesTo) {
      lines.push("");
      lines.push(`🌟 **${speciesName}** is ready to evolve into **${levelUp.evolution.evolvesTo.speciesName}**!`);
    } else if (levelUp.evolution.isNearMiss && levelUp.evolution.nearMissMessage) {
      lines.push("");
      lines.push(`✨ ${levelUp.evolution.nearMissMessage}`);
    }
  } else if (!levelUp.leveledUp) {
    // Show progress to next level
    const bar = buildExpBar(
      levelUp.currentExp - expForLevel(levelUp.newLevel),
      levelUp.expToNextLevel
    );
    lines.push(`\nLevel ${levelUp.newLevel}: ${bar} (${levelUp.expToNextLevel} XP to next level)`);
  }

  return lines.join("\n");
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  MAX_LEVEL,
  EXP_MULTIPLIERS,
  expForLevel,
  levelFromExp,
  expToNextLevel,
  calculateExpYield,
  awardExp,
  checkEvolution,
  evolvePokemon,
  awardWildBattleExp,
  awardTrainerBattleExp,
  awardCatchExp,
  buildExpBar,
  formatLevelUpMessage,
};
