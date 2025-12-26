/**
 * Item Effects Service
 * 
 * Handles the effects of using items on Pokémon.
 * Implements healing (potions), status cures, PP restoration, and more.
 * 
 * ITEM CATEGORIES:
 * - Potions: Restore HP (Potion: 20, Super: 60, Hyper: 120, Max: Full)
 * - Status Heals: Cure specific status conditions
 * - Berries: Various effects (Oran: 10 HP, Sitrus: 25% HP, etc.)
 * - PP Items: Restore move PP (Ether, Elixir, etc.)
 * 
 * @module services/item-effects
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../shared/logging/index.js";
const logger = getLogger();

import { prisma } from "../shared/prisma.js";
import { removeItems, ITEM_IDS } from "./inventory.js";

// ============================================================================
// ITEM EFFECT DEFINITIONS
// ============================================================================

/**
 * HP restoration amounts for potions
 */
export const POTION_EFFECTS: Record<number, { hp: number | "full"; name: string }> = {
  [ITEM_IDS.POTION]: { hp: 20, name: "Potion" },
  [ITEM_IDS.SUPER_POTION]: { hp: 60, name: "Super Potion" },
  [ITEM_IDS.HYPER_POTION]: { hp: 120, name: "Hyper Potion" },
  [ITEM_IDS.MAX_POTION]: { hp: "full", name: "Max Potion" },
  [ITEM_IDS.FULL_RESTORE]: { hp: "full", name: "Full Restore" },
};

/**
 * Status conditions cured by each item
 */
export const STATUS_CURE_EFFECTS: Record<number, { cures: string[]; name: string }> = {
  [ITEM_IDS.ANTIDOTE]: { cures: ["PSN", "TOX"], name: "Antidote" },
  [ITEM_IDS.BURN_HEAL]: { cures: ["BRN"], name: "Burn Heal" },
  [ITEM_IDS.ICE_HEAL]: { cures: ["FRZ"], name: "Ice Heal" },
  [ITEM_IDS.AWAKENING]: { cures: ["SLP"], name: "Awakening" },
  [ITEM_IDS.PARALYZE_HEAL]: { cures: ["PAR"], name: "Paralyze Heal" },
  [ITEM_IDS.FULL_HEAL]: { cures: ["PSN", "TOX", "BRN", "FRZ", "SLP", "PAR", "CNF"], name: "Full Heal" },
  [ITEM_IDS.FULL_RESTORE]: { cures: ["PSN", "TOX", "BRN", "FRZ", "SLP", "PAR", "CNF"], name: "Full Restore" },
};

/**
 * Berry effects
 */
export const BERRY_EFFECTS: Record<number, { effect: string; value: number | string; name: string }> = {
  [ITEM_IDS.ORAN_BERRY]: { effect: "hp", value: 10, name: "Oran Berry" },
  [ITEM_IDS.SITRUS_BERRY]: { effect: "hp_percent", value: 25, name: "Sitrus Berry" },
  [ITEM_IDS.LEPPA_BERRY]: { effect: "pp", value: 10, name: "Leppa Berry" },
  [ITEM_IDS.CHERI_BERRY]: { effect: "cure", value: "PAR", name: "Cheri Berry" },
  [ITEM_IDS.CHESTO_BERRY]: { effect: "cure", value: "SLP", name: "Chesto Berry" },
  [ITEM_IDS.PECHA_BERRY]: { effect: "cure", value: "PSN", name: "Pecha Berry" },
  [ITEM_IDS.RAWST_BERRY]: { effect: "cure", value: "BRN", name: "Rawst Berry" },
  [ITEM_IDS.ASPEAR_BERRY]: { effect: "cure", value: "FRZ", name: "Aspear Berry" },
  [ITEM_IDS.LUM_BERRY]: { effect: "cure_all", value: "all", name: "Lum Berry" },
};

// ============================================================================
// TYPES
// ============================================================================

export interface ItemUseResult {
  success: boolean;
  message: string;
  hpRestored?: number;
  statusCured?: string;
  newHp?: number;
  newStatus?: string | null;
  error?: string;
}

export interface UsablePokemon {
  id: string;
  speciesId: number;
  nickname: string | null;
  hp: number;
  maxHp: number;
  status: string | null;
  slot: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if an item can be used on a Pokémon
 */
export function canUseItem(itemId: number, pokemon: UsablePokemon): { canUse: boolean; reason?: string } {
  // Potions - check if HP is not full
  if (POTION_EFFECTS[itemId]) {
    if (pokemon.hp >= pokemon.maxHp) {
      return { canUse: false, reason: "HP is already full" };
    }
    if (pokemon.hp <= 0) {
      return { canUse: false, reason: "Pokémon has fainted" };
    }
    return { canUse: true };
  }

  // Status cures - check if status matches
  if (STATUS_CURE_EFFECTS[itemId]) {
    if (!pokemon.status) {
      return { canUse: false, reason: "No status condition to cure" };
    }
    const cures = STATUS_CURE_EFFECTS[itemId].cures;
    if (!cures.includes(pokemon.status)) {
      return { canUse: false, reason: `Cannot cure ${pokemon.status} with this item` };
    }
    return { canUse: true };
  }

  // Berries
  if (BERRY_EFFECTS[itemId]) {
    const berry = BERRY_EFFECTS[itemId];
    if (berry.effect === "hp" || berry.effect === "hp_percent") {
      if (pokemon.hp >= pokemon.maxHp) {
        return { canUse: false, reason: "HP is already full" };
      }
      if (pokemon.hp <= 0) {
        return { canUse: false, reason: "Pokémon has fainted" };
      }
      return { canUse: true };
    }
    if (berry.effect === "cure") {
      if (!pokemon.status || pokemon.status !== berry.value) {
        return { canUse: false, reason: `Cannot cure ${pokemon.status || "nothing"} with this berry` };
      }
      return { canUse: true };
    }
    if (berry.effect === "cure_all") {
      if (!pokemon.status) {
        return { canUse: false, reason: "No status condition to cure" };
      }
      return { canUse: true };
    }
    // PP restoration - always usable (TODO: check if any move needs PP)
    if (berry.effect === "pp") {
      return { canUse: true };
    }
  }

  return { canUse: false, reason: "Item cannot be used on Pokémon" };
}

/**
 * Get list of party Pokémon that can use an item
 */
export async function getUsableTargets(
  discordId: string,
  itemId: number
): Promise<UsablePokemon[]> {
  // Get user's trainer
  const user = await prisma.user.findUnique({
    where: { discordId },
    select: { id: true },
  });
  
  if (!user) return [];

  const trainer = await prisma.trainer.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!trainer) return [];

  // Get party Pokémon
  const party = await prisma.party.findFirst({
    where: { trainerId: trainer.id },
    include: {
      slots: {
        include: {
          pokemon: {
            select: {
              id: true,
              speciesId: true,
              nickname: true,
              hp: true,
              maxHp: true,
              status: true,
            },
          },
        },
        orderBy: { slot: "asc" },
      },
    },
  });

  if (!party) return [];

  // Build list of usable targets
  const targets: UsablePokemon[] = [];
  
  for (const slot of party.slots) {
    if (!slot.pokemon) continue;
    
    const pokemon: UsablePokemon = {
      id: slot.pokemon.id,
      speciesId: slot.pokemon.speciesId,
      nickname: slot.pokemon.nickname,
      hp: slot.pokemon.hp,
      maxHp: slot.pokemon.maxHp,
      status: slot.pokemon.status,
      slot: slot.slot,
    };

    const { canUse } = canUseItem(itemId, pokemon);
    if (canUse) {
      targets.push(pokemon);
    }
  }

  return targets;
}

// ============================================================================
// ITEM USE LOGIC
// ============================================================================

/**
 * Use a potion on a Pokémon
 */
async function usePotionOnPokemon(
  pokemonId: string,
  itemId: number
): Promise<ItemUseResult> {
  const effect = POTION_EFFECTS[itemId];
  if (!effect) {
    return { success: false, message: "Not a potion", error: "Invalid item" };
  }

  // Get current HP
  const pokemon = await prisma.pokemonInstance.findUnique({
    where: { id: pokemonId },
    select: { hp: true, maxHp: true, nickname: true, speciesId: true },
  });

  if (!pokemon) {
    return { success: false, message: "Pokémon not found", error: "Invalid target" };
  }

  if (pokemon.hp >= pokemon.maxHp) {
    return { success: false, message: "HP is already full", error: "No effect" };
  }

  if (pokemon.hp <= 0) {
    return { success: false, message: "Pokémon has fainted", error: "Cannot heal fainted Pokémon" };
  }

  // Calculate new HP
  const hpToRestore = effect.hp === "full" 
    ? pokemon.maxHp - pokemon.hp 
    : Math.min(effect.hp, pokemon.maxHp - pokemon.hp);
  
  const newHp = Math.min(pokemon.maxHp, pokemon.hp + hpToRestore);

  // Update Pokémon HP
  await prisma.pokemonInstance.update({
    where: { id: pokemonId },
    data: { hp: newHp },
  });

  const pokeName = pokemon.nickname || `#${pokemon.speciesId}`;
  return {
    success: true,
    message: `${pokeName} recovered ${hpToRestore} HP!`,
    hpRestored: hpToRestore,
    newHp,
  };
}

/**
 * Use a status cure on a Pokémon
 */
async function useStatusCureOnPokemon(
  pokemonId: string,
  itemId: number
): Promise<ItemUseResult> {
  const effect = STATUS_CURE_EFFECTS[itemId];
  if (!effect) {
    return { success: false, message: "Not a status cure", error: "Invalid item" };
  }

  // Get current status
  const pokemon = await prisma.pokemonInstance.findUnique({
    where: { id: pokemonId },
    select: { status: true, nickname: true, speciesId: true },
  });

  if (!pokemon) {
    return { success: false, message: "Pokémon not found", error: "Invalid target" };
  }

  if (!pokemon.status) {
    return { success: false, message: "No status condition to cure", error: "No effect" };
  }

  if (!effect.cures.includes(pokemon.status)) {
    return { 
      success: false, 
      message: `${effect.name} cannot cure ${pokemon.status}`, 
      error: "Wrong cure type" 
    };
  }

  const oldStatus = pokemon.status;

  // Clear status
  await prisma.pokemonInstance.update({
    where: { id: pokemonId },
    data: { status: null },
  });

  const pokeName = pokemon.nickname || `#${pokemon.speciesId}`;
  return {
    success: true,
    message: `${pokeName} was cured of ${oldStatus}!`,
    statusCured: oldStatus,
    newStatus: null,
  };
}

/**
 * Use a berry on a Pokémon
 */
async function useBerryOnPokemon(
  pokemonId: string,
  itemId: number
): Promise<ItemUseResult> {
  const effect = BERRY_EFFECTS[itemId];
  if (!effect) {
    return { success: false, message: "Not a berry", error: "Invalid item" };
  }

  // Get Pokémon data
  const pokemon = await prisma.pokemonInstance.findUnique({
    where: { id: pokemonId },
    select: { hp: true, maxHp: true, status: true, nickname: true, speciesId: true },
  });

  if (!pokemon) {
    return { success: false, message: "Pokémon not found", error: "Invalid target" };
  }

  const pokeName = pokemon.nickname || `#${pokemon.speciesId}`;

  // Handle different berry effects
  if (effect.effect === "hp") {
    const hpToRestore = Math.min(effect.value as number, pokemon.maxHp - pokemon.hp);
    if (hpToRestore <= 0) {
      return { success: false, message: "HP is already full", error: "No effect" };
    }

    const newHp = pokemon.hp + hpToRestore;
    await prisma.pokemonInstance.update({
      where: { id: pokemonId },
      data: { hp: newHp },
    });

    return {
      success: true,
      message: `${pokeName} ate the ${effect.name} and recovered ${hpToRestore} HP!`,
      hpRestored: hpToRestore,
      newHp,
    };
  }

  if (effect.effect === "hp_percent") {
    const hpToRestore = Math.floor(pokemon.maxHp * (effect.value as number) / 100);
    const actualRestore = Math.min(hpToRestore, pokemon.maxHp - pokemon.hp);
    if (actualRestore <= 0) {
      return { success: false, message: "HP is already full", error: "No effect" };
    }

    const newHp = pokemon.hp + actualRestore;
    await prisma.pokemonInstance.update({
      where: { id: pokemonId },
      data: { hp: newHp },
    });

    return {
      success: true,
      message: `${pokeName} ate the ${effect.name} and recovered ${actualRestore} HP!`,
      hpRestored: actualRestore,
      newHp,
    };
  }

  if (effect.effect === "cure" || effect.effect === "cure_all") {
    if (!pokemon.status) {
      return { success: false, message: "No status condition to cure", error: "No effect" };
    }

    if (effect.effect === "cure" && pokemon.status !== effect.value) {
      return { 
        success: false, 
        message: `${effect.name} cannot cure ${pokemon.status}`, 
        error: "Wrong cure type" 
      };
    }

    const oldStatus = pokemon.status;
    await prisma.pokemonInstance.update({
      where: { id: pokemonId },
      data: { status: null },
    });

    return {
      success: true,
      message: `${pokeName} ate the ${effect.name} and was cured of ${oldStatus}!`,
      statusCured: oldStatus,
      newStatus: null,
    };
  }

  // PP restoration (Leppa Berry) - not fully implemented yet
  if (effect.effect === "pp") {
    return {
      success: true,
      message: `${pokeName} ate the ${effect.name}! (PP restoration not yet implemented)`,
    };
  }

  return { success: false, message: "Unknown berry effect", error: "Invalid effect" };
}

// ============================================================================
// MAIN USE ITEM FUNCTION
// ============================================================================

/**
 * Use an item on a Pokémon
 * Handles all item types: potions, status cures, berries
 */
export async function useItemOnPokemon(
  discordId: string,
  itemId: number,
  pokemonId: string
): Promise<ItemUseResult> {
  try {
    // Check if user has the item
    const user = await prisma.user.findUnique({
      where: { discordId },
      select: { id: true },
    });

    if (!user) {
      return { success: false, message: "User not found", error: "Invalid user" };
    }

    const trainer = await prisma.trainer.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });

    if (!trainer) {
      return { success: false, message: "No trainer profile", error: "Invalid trainer" };
    }

    // Verify item ownership
    const inventory = await prisma.inventory.findUnique({
      where: {
        trainerId_itemId: { trainerId: trainer.id, itemId },
      },
      select: { qty: true },
    });

    if (!inventory || inventory.qty <= 0) {
      return { success: false, message: "You don't have this item", error: "No item" };
    }

    // Verify Pokémon ownership
    const pokemon = await prisma.pokemonInstance.findUnique({
      where: { id: pokemonId },
      select: { ownerId: true },
    });

    if (!pokemon || pokemon.ownerId !== trainer.id) {
      return { success: false, message: "This is not your Pokémon", error: "Wrong owner" };
    }

    // Determine item type and use it
    let result: ItemUseResult;

    if (POTION_EFFECTS[itemId]) {
      result = await usePotionOnPokemon(pokemonId, itemId);
    } else if (STATUS_CURE_EFFECTS[itemId]) {
      result = await useStatusCureOnPokemon(pokemonId, itemId);
    } else if (BERRY_EFFECTS[itemId]) {
      result = await useBerryOnPokemon(pokemonId, itemId);
    } else {
      return { success: false, message: "This item cannot be used here", error: "Not usable" };
    }

    // If successful, consume the item
    if (result.success) {
      await removeItems(discordId, itemId, 1);
      
      logger.info("ItemEffects", "useItemOnPokemon", "Item used successfully", {
        userId: discordId,
        metadata: { itemId, pokemonId, result: result.message },
      });
    }

    return result;
  } catch (error) {
    logger.error("ItemEffects", "useItemOnPokemon", "Failed to use item", {
      metadata: { discordId, itemId, pokemonId, error },
    });
    return { 
      success: false, 
      message: "Something went wrong", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

/**
 * Get item name by ID
 */
export function getItemName(itemId: number): string {
  if (POTION_EFFECTS[itemId]) return POTION_EFFECTS[itemId].name;
  if (STATUS_CURE_EFFECTS[itemId]) return STATUS_CURE_EFFECTS[itemId].name;
  if (BERRY_EFFECTS[itemId]) return BERRY_EFFECTS[itemId].name;
  return `Item #${itemId}`;
}

/**
 * Check if an item is usable outside of battle
 */
export function isUsableItem(itemId: number): boolean {
  return !!(POTION_EFFECTS[itemId] || STATUS_CURE_EFFECTS[itemId] || BERRY_EFFECTS[itemId]);
}
