/**
 * Inventory Service
 * 
 * Manages player inventory operations for the Pokémon Infinity Gauntlet game.
 * Handles adding/removing items, checking quantities, and starter kit distribution.
 * 
 * ITEM IDS (from database):
 * - 1: Poké Ball (kind: ball)
 * - 2: Great Ball (kind: ball)
 * - 3: Ultra Ball (kind: ball)
 * - 4: Master Ball (kind: ball)
 * - 5: Potion (kind: potion)
 * - 6: Super Potion (kind: potion)
 * - 7: Hyper Potion (kind: potion)
 * - 8: Max Potion (kind: potion)
 * - 9: Full Restore (kind: potion)
 * - 10: Antidote (kind: status)
 * - 11: Burn Heal (kind: status)
 * - 12: Ice Heal (kind: status)
 * - 13: Awakening (kind: status)
 * - 14: Paralyze Heal (kind: status)
 * - 15: Full Heal (kind: status)
 * 
 * @module services/inventory
 */

import { prisma } from "../shared/prisma.js";
import { getLogger } from "../shared/logging/index.js";

const logger = getLogger();

// ============================================================================
// ITEM IDS (Well-known item IDs from the database)
// ============================================================================

export const ITEM_IDS = {
  // Balls
  POKE_BALL: 1,
  GREAT_BALL: 2,
  ULTRA_BALL: 3,
  MASTER_BALL: 4,
  
  // Potions
  POTION: 5,
  SUPER_POTION: 6,
  HYPER_POTION: 7,
  MAX_POTION: 8,
  FULL_RESTORE: 9,
  
  // Status Heals
  ANTIDOTE: 10,
  BURN_HEAL: 11,
  ICE_HEAL: 12,
  AWAKENING: 13,
  PARALYZE_HEAL: 14,
  FULL_HEAL: 15,
  
  // Berries (commonly found while exploring)
  ORAN_BERRY: 20,
  SITRUS_BERRY: 21,
  LEPPA_BERRY: 22,
  CHERI_BERRY: 23,
  CHESTO_BERRY: 24,
  PECHA_BERRY: 25,
  RAWST_BERRY: 26,
  ASPEAR_BERRY: 27,
  LUM_BERRY: 28,     // Cures any status condition
  RAZZ_BERRY: 29,    // Catch bonus for encounters
} as const;

// ============================================================================
// STARTER KIT CONFIGURATION
// ============================================================================

/**
 * Items given to new players when they choose their starter Pokémon
 */
export const STARTER_KIT: Array<{ itemId: number; qty: number }> = [
  { itemId: ITEM_IDS.POKE_BALL, qty: 10 },    // 10 Poké Balls to start catching
  { itemId: ITEM_IDS.POTION, qty: 5 },        // 5 Potions for healing
  { itemId: ITEM_IDS.ORAN_BERRY, qty: 3 },    // 3 Oran Berries as intro to berries
];

// ============================================================================
// ITEM REWARDS CONFIGURATION
// ============================================================================

/**
 * Random item drops when catching Pokémon
 * Higher rarity = better rewards
 */
export const CATCH_REWARDS = {
  common: [
    { itemId: ITEM_IDS.POKE_BALL, qty: 1, chance: 0.3 },
    { itemId: ITEM_IDS.POTION, qty: 1, chance: 0.2 },
    { itemId: ITEM_IDS.ORAN_BERRY, qty: 1, chance: 0.25 },
  ],
  uncommon: [
    { itemId: ITEM_IDS.POKE_BALL, qty: 2, chance: 0.3 },
    { itemId: ITEM_IDS.GREAT_BALL, qty: 1, chance: 0.2 },
    { itemId: ITEM_IDS.SUPER_POTION, qty: 1, chance: 0.2 },
    { itemId: ITEM_IDS.SITRUS_BERRY, qty: 1, chance: 0.15 },
  ],
  rare: [
    { itemId: ITEM_IDS.GREAT_BALL, qty: 2, chance: 0.3 },
    { itemId: ITEM_IDS.ULTRA_BALL, qty: 1, chance: 0.15 },
    { itemId: ITEM_IDS.HYPER_POTION, qty: 1, chance: 0.2 },
    { itemId: ITEM_IDS.LEPPA_BERRY, qty: 2, chance: 0.2 },
  ],
  "ultra-rare": [
    { itemId: ITEM_IDS.ULTRA_BALL, qty: 3, chance: 0.4 },
    { itemId: ITEM_IDS.MAX_POTION, qty: 1, chance: 0.25 },
    { itemId: ITEM_IDS.FULL_RESTORE, qty: 1, chance: 0.15 },
    { itemId: ITEM_IDS.FULL_HEAL, qty: 1, chance: 0.2 },
  ],
} as const;

// ============================================================================
// TYPES
// ============================================================================

export interface ItemReward {
  itemId: number;
  itemName: string;
  qty: number;
}

export interface InventoryResult {
  success: boolean;
  trainerId: string;
  itemId: number;
  itemName?: string;
  newQty: number;
  error?: string;
}

// ============================================================================
// INVENTORY OPERATIONS
// ============================================================================

/**
 * Get or create trainer for a user (needed for inventory operations)
 */
async function getOrCreateTrainer(userId: string, tenantId: string = "default"): Promise<string> {
  // Try to find existing trainer
  const existing = await prisma.trainer.findFirst({
    where: { userId },
    select: { id: true },
  });
  
  if (existing) {
    return existing.id;
  }
  
  // Create new trainer (this is a fallback - normally created during starter selection)
  const trainer = await prisma.trainer.create({
    data: {
      userId,
      tenantId,
    },
    select: { id: true },
  });
  
  return trainer.id;
}

/**
 * Add items to a player's inventory
 * Uses upsert to handle both new and existing items
 */
export async function addItems(
  userId: string,
  itemId: number,
  quantity: number,
  tenantId: string = "default"
): Promise<InventoryResult> {
  try {
    const trainerId = await getOrCreateTrainer(userId, tenantId);
    
    // Get item name for logging
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      select: { name: true },
    });
    
    if (!item) {
      return {
        success: false,
        trainerId,
        itemId,
        newQty: 0,
        error: `Item ${itemId} not found`,
      };
    }
    
    // Upsert: add to existing qty or create new inventory entry
    const result = await prisma.inventory.upsert({
      where: {
        trainerId_itemId: { trainerId, itemId },
      },
      update: {
        qty: { increment: quantity },
      },
      create: {
        trainerId,
        itemId,
        qty: quantity,
      },
      select: { qty: true },
    });
    
    logger.info("Inventory", "addItems", `Added ${quantity}x ${item.name}`, {
      metadata: { userId, trainerId, itemId, itemName: item.name, newQty: result.qty },
    });
    
    return {
      success: true,
      trainerId,
      itemId,
      itemName: item.name,
      newQty: result.qty,
    };
  } catch (error) {
    logger.error("Inventory", "addItems", "Failed to add items", {
      metadata: { userId, itemId, quantity, error },
    });
    return {
      success: false,
      trainerId: "",
      itemId,
      newQty: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Remove items from a player's inventory
 * Returns false if insufficient quantity
 */
export async function removeItems(
  userId: string,
  itemId: number,
  quantity: number
): Promise<InventoryResult> {
  try {
    const trainer = await prisma.trainer.findFirst({
      where: { userId },
      select: { id: true },
    });
    
    if (!trainer) {
      return {
        success: false,
        trainerId: "",
        itemId,
        newQty: 0,
        error: "Trainer not found",
      };
    }
    
    const trainerId = trainer.id;
    
    // Check current quantity
    const current = await prisma.inventory.findUnique({
      where: {
        trainerId_itemId: { trainerId, itemId },
      },
      include: {
        item: { select: { name: true } },
      },
    });
    
    if (!current || current.qty < quantity) {
      return {
        success: false,
        trainerId,
        itemId,
        itemName: current?.item.name,
        newQty: current?.qty ?? 0,
        error: `Insufficient quantity (have ${current?.qty ?? 0}, need ${quantity})`,
      };
    }
    
    const newQty = current.qty - quantity;
    
    // Update or delete if zero
    if (newQty <= 0) {
      await prisma.inventory.delete({
        where: {
          trainerId_itemId: { trainerId, itemId },
        },
      });
    } else {
      await prisma.inventory.update({
        where: {
          trainerId_itemId: { trainerId, itemId },
        },
        data: { qty: newQty },
      });
    }
    
    logger.info("Inventory", "removeItems", `Removed ${quantity}x ${current.item.name}`, {
      metadata: { userId, trainerId, itemId, itemName: current.item.name, newQty },
    });
    
    return {
      success: true,
      trainerId,
      itemId,
      itemName: current.item.name,
      newQty: Math.max(0, newQty),
    };
  } catch (error) {
    logger.error("Inventory", "removeItems", "Failed to remove items", {
      metadata: { userId, itemId, quantity, error },
    });
    return {
      success: false,
      trainerId: "",
      itemId,
      newQty: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check how many of an item a player has
 */
export async function getItemQuantity(
  userId: string,
  itemId: number
): Promise<number> {
  try {
    const trainer = await prisma.trainer.findFirst({
      where: { userId },
      select: { id: true },
    });
    
    if (!trainer) return 0;
    
    const inventory = await prisma.inventory.findUnique({
      where: {
        trainerId_itemId: { trainerId: trainer.id, itemId },
      },
      select: { qty: true },
    });
    
    return inventory?.qty ?? 0;
  } catch (error) {
    logger.error("Inventory", "getItemQuantity", "Failed to check quantity", {
      metadata: { userId, itemId, error },
    });
    return 0;
  }
}

/**
 * Check if player has at least N of an item
 */
export async function hasItems(
  userId: string,
  itemId: number,
  quantity: number = 1
): Promise<boolean> {
  const current = await getItemQuantity(userId, itemId);
  return current >= quantity;
}

// ============================================================================
// STARTER KIT & REWARDS
// ============================================================================

/**
 * Give the starter kit to a new player
 * Called after they choose their first Pokémon
 */
export async function giveStarterKit(
  userId: string,
  tenantId: string = "default"
): Promise<ItemReward[]> {
  const rewards: ItemReward[] = [];
  
  for (const { itemId, qty } of STARTER_KIT) {
    const result = await addItems(userId, itemId, qty, tenantId);
    if (result.success && result.itemName) {
      rewards.push({
        itemId,
        itemName: result.itemName,
        qty,
      });
    }
  }
  
  logger.info("Inventory", "giveStarterKit", `Gave starter kit to new player`, {
    metadata: { userId, rewards },
  });
  
  return rewards;
}

/**
 * Roll for random item rewards when catching a Pokémon
 * Rewards scale with rarity of the caught Pokémon
 */
export async function rollCatchRewards(
  userId: string,
  rarity: "common" | "uncommon" | "rare" | "ultra-rare",
  tenantId: string = "default"
): Promise<ItemReward[]> {
  const rewards: ItemReward[] = [];
  const possibleRewards = CATCH_REWARDS[rarity];
  
  for (const reward of possibleRewards) {
    if (Math.random() < reward.chance) {
      const result = await addItems(userId, reward.itemId, reward.qty, tenantId);
      if (result.success && result.itemName) {
        rewards.push({
          itemId: reward.itemId,
          itemName: result.itemName,
          qty: reward.qty,
        });
      }
    }
  }
  
  if (rewards.length > 0) {
    logger.info("Inventory", "rollCatchRewards", `Awarded catch rewards`, {
      metadata: { userId, rarity, rewards },
    });
  }
  
  return rewards;
}

/**
 * Format item rewards for display in Discord embed
 */
export function formatItemRewards(rewards: ItemReward[]): string {
  if (rewards.length === 0) return "";
  
  return rewards
    .map(r => `• **${r.itemName}** ×${r.qty}`)
    .join("\n");
}

/**
 * Get a short inline format for item rewards
 */
export function formatItemRewardsInline(rewards: ItemReward[]): string {
  if (rewards.length === 0) return "";
  
  return rewards
    .map(r => `${r.itemName} ×${r.qty}`)
    .join(", ");
}
