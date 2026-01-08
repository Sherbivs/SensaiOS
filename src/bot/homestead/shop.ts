/**
 * Homestead Shop Module (Poké Mart)
 * 
 * Implements the SHOP screen per Game Design Bible philosophy.
 * Players click [🛒 Shop] on home screen → arrive here →
 * browse categories → buy items with coins.
 * 
 * SCREEN LAYOUT:
 * ┌─────────────────────────────────────────────────────────┐
 * │  🛒 POKÉ MART                              💰 2,500     │
 * │                                                         │
 * │  Category: Poké Balls                                   │
 * │                                                         │
 * │  ⚪ Poké Ball ........... ₽200  [Buy 1] [Buy 10]       │
 * │  🔵 Great Ball ......... ₽600  [Buy 1] [Buy 10]       │
 * │  🟡 Ultra Ball ........ ₽1200  [Buy 1] [Buy 10]       │
 * │                                                         │
 * │  [⬅️ Prev] [➡️ Next] [🏠 Back]                          │
 * └─────────────────────────────────────────────────────────┘
 * 
 * @module homestead/shop
 */

// === CRITICAL: Logger & Error Handling MUST be first imports ===
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();

// === External Libraries ===
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  Client,
  EmbedBuilder,
  User as DiscordUser,
} from "discord.js";

// === Internal Imports ===
import { EMBED_COLORS } from "../shared/embed-colors.js";
import { dangerButton, navButton as _navButton, primaryButton as _primaryButton, secondaryButton } from "../shared/button-utils.js";
import { safeReplyWithPayload } from "../shared/response-helpers.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { addItems, ITEM_IDS } from "../../services/inventory.js";
import { getGameServer } from "../../sensaios/gameserver/singleton.js";

// ============================================================================
// CONSTANTS
// ============================================================================

export const SHOP_CATEGORY_PREFIX = "SHOP_CAT_";
export const SHOP_BUY_PREFIX = "SHOP_BUY_";

// Shop categories (subset of items that can be purchased)
export const SHOP_CATEGORIES = [
  { id: "balls", label: "Poké Balls", emoji: "⚪" },
  { id: "potions", label: "Potions", emoji: "💊" },
  { id: "status", label: "Status Heal", emoji: "💉" },
  { id: "berries", label: "Berries", emoji: "🍇" },
  { id: "rods", label: "Fishing Rods", emoji: "🎣" },
] as const;

export type ShopCategory = typeof SHOP_CATEGORIES[number]["id"];

// Shop inventory with prices
// Prices roughly follow classic Pokémon game prices (scaled down)
export interface ShopItem {
  itemId: number;
  name: string;
  price: number;
  description: string;
  emoji: string;
}

export const SHOP_INVENTORY: Record<ShopCategory, ShopItem[]> = {
  balls: [
    { itemId: ITEM_IDS.POKE_BALL, name: "Poké Ball", price: 200, description: "Standard catch rate", emoji: "⚪" },
    { itemId: ITEM_IDS.GREAT_BALL, name: "Great Ball", price: 600, description: "Better catch rate", emoji: "🔵" },
    { itemId: ITEM_IDS.ULTRA_BALL, name: "Ultra Ball", price: 1200, description: "High catch rate", emoji: "🟡" },
  ],
  potions: [
    { itemId: ITEM_IDS.POTION, name: "Potion", price: 200, description: "Restores 20 HP", emoji: "💊" },
    { itemId: ITEM_IDS.SUPER_POTION, name: "Super Potion", price: 700, description: "Restores 60 HP", emoji: "💊" },
    { itemId: ITEM_IDS.HYPER_POTION, name: "Hyper Potion", price: 1500, description: "Restores 120 HP", emoji: "💊" },
    { itemId: ITEM_IDS.MAX_POTION, name: "Max Potion", price: 2500, description: "Fully restores HP", emoji: "💊" },
  ],
  status: [
    { itemId: ITEM_IDS.ANTIDOTE, name: "Antidote", price: 200, description: "Cures poison", emoji: "💉" },
    { itemId: ITEM_IDS.BURN_HEAL, name: "Burn Heal", price: 200, description: "Cures burn", emoji: "💉" },
    { itemId: ITEM_IDS.PARALYZE_HEAL, name: "Paralyze Heal", price: 200, description: "Cures paralysis", emoji: "💉" },
    { itemId: ITEM_IDS.AWAKENING, name: "Awakening", price: 200, description: "Wakes up Pokémon", emoji: "💉" },
    { itemId: ITEM_IDS.FULL_HEAL, name: "Full Heal", price: 400, description: "Cures all status", emoji: "💉" },
  ],
  berries: [
    { itemId: ITEM_IDS.ORAN_BERRY, name: "Oran Berry", price: 100, description: "Restores 10 HP", emoji: "🍇" },
    { itemId: ITEM_IDS.SITRUS_BERRY, name: "Sitrus Berry", price: 300, description: "Restores 25% HP", emoji: "🍇" },
    { itemId: ITEM_IDS.LUM_BERRY, name: "Lum Berry", price: 500, description: "Cures status", emoji: "🍇" },
    { itemId: ITEM_IDS.RAZZ_BERRY, name: "Razz Berry", price: 150, description: "Catch bonus", emoji: "🍇" },
  ],
  rods: [
    { itemId: ITEM_IDS.OLD_ROD, name: "Old Rod", price: 500, description: "Basic fishing rod (common Pokémon)", emoji: "🎣" },
    { itemId: ITEM_IDS.GOOD_ROD, name: "Good Rod", price: 2500, description: "Better rod (uncommon Pokémon)", emoji: "🎣" },
    { itemId: ITEM_IDS.SUPER_ROD, name: "Super Rod", price: 7500, description: "Best rod (rare Pokémon)", emoji: "🎣" },
  ],
};

// ============================================================================
// TYPES
// ============================================================================

export interface ShopSnapshot {
  userId: string;
  coins: number;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Load player's coins from database (coins are on User, not Trainer)
 */
export async function loadShopSnapshot(discordId: string): Promise<ShopSnapshot> {
  const gameServer = getGameServer();
  const trainer = await gameServer.trainers.get(discordId);

  return {
    userId: trainer?.id ?? discordId,
    coins: trainer?.money ?? 0,
  };
}

/**
 * Purchase items from the shop
 * Coins are deducted from User model, items added to trainer inventory
 */
export async function purchaseItem(
  discordId: string,
  itemId: number,
  quantity: number
): Promise<{ success: boolean; newBalance?: number; error?: string }> {
  const gameServer = getGameServer();
  
  // Find the item price
  let itemPrice = 0;
  let itemName = "";
  for (const category of Object.values(SHOP_INVENTORY)) {
    const item = category.find(i => i.itemId === itemId);
    if (item) {
      itemPrice = item.price;
      itemName = item.name;
      break;
    }
  }

  if (itemPrice === 0) {
    return { success: false, error: "Item not found in shop" };
  }

  const totalCost = itemPrice * quantity;
  
  // Get current coins from trainer data
  const trainer = await gameServer.trainers.get(discordId);
  const currentCoins = trainer?.money ?? 0;

  if (currentCoins < totalCost) {
    return { 
      success: false, 
      error: `Not enough coins! Need ₽${totalCost.toLocaleString()}, have ₽${currentCoins.toLocaleString()}` 
    };
  }

  // Deduct coins from User using GameServerAPI
  const result = await gameServer.trainers.updateMoney({
    discordId,
    delta: -totalCost,
    reason: `Shop purchase: ${quantity}x ${itemName}`,
  });
  
  if (!result.success) {
    return { success: false, error: "Failed to deduct coins" };
  }

  // addItems(userId, itemId, quantity, tenantId?)
  await addItems(discordId, itemId, quantity);

  logger.info("Shop", "purchaseItem", "Purchase completed", {
    userId: discordId,
    metadata: { itemId, itemName, quantity, totalCost, newBalance: result.newBalance },
  });

  return { success: true, newBalance: result.newBalance };
}

// ============================================================================
// EMBED BUILDERS
// ============================================================================

/**
 * Build main shop embed showing categories
 */
export function buildShopEmbed(coins: number): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🛒 POKÉ MART")
    .setDescription(
      `Welcome to the Poké Mart! What would you like to buy today?\n\n` +
      `**Your Balance:** 💰 ₽${coins.toLocaleString()}`
    )
    .setColor(EMBED_COLORS.PRIMARY)
    .addFields(
      SHOP_CATEGORIES.map(cat => ({
        name: `${cat.emoji} ${cat.label}`,
        value: `${SHOP_INVENTORY[cat.id].length} items available`,
        inline: true,
      }))
    )
    .setFooter({ text: "Select a category to browse items" });
}

/**
 * Build category detail embed showing items for purchase
 */
export function buildCategoryEmbed(
  category: ShopCategory,
  coins: number
): EmbedBuilder {
  const categoryInfo = SHOP_CATEGORIES.find(c => c.id === category);
  const items = SHOP_INVENTORY[category];

  const itemList = items.map(item => {
    const affordable = coins >= item.price ? "✅" : "❌";
    return `${item.emoji} **${item.name}** — ₽${item.price.toLocaleString()} ${affordable}\n` +
           `   └ ${item.description}`;
  }).join("\n\n");

  return new EmbedBuilder()
    .setTitle(`🛒 ${categoryInfo?.emoji ?? ""} ${categoryInfo?.label ?? category}`)
    .setDescription(
      `**Your Balance:** 💰 ₽${coins.toLocaleString()}\n\n` +
      itemList
    )
    .setColor(EMBED_COLORS.PRIMARY)
    .setFooter({ text: "Use the menu below to buy items" });
}

/**
 * Build purchase confirmation embed
 */
export function buildPurchaseEmbed(
  itemName: string,
  quantity: number,
  totalCost: number,
  newBalance: number
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("✅ Purchase Complete!")
    .setDescription(
      `You bought **${quantity}x ${itemName}** for ₽${totalCost.toLocaleString()}\n\n` +
      `**New Balance:** 💰 ₽${newBalance.toLocaleString()}`
    )
    .setColor(EMBED_COLORS.SUCCESS);
}

/**
 * Build purchase error embed
 */
export function buildPurchaseErrorEmbed(error: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("❌ Purchase Failed")
    .setDescription(error)
    .setColor(EMBED_COLORS.ERROR);
}

// ============================================================================
// BUTTON BUILDERS
// ============================================================================

/**
 * Build category selection buttons
 */
export function buildCategoryButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    secondaryButton(`${SHOP_CATEGORY_PREFIX}balls`, "⚪ Balls"),
    secondaryButton(`${SHOP_CATEGORY_PREFIX}potions`, "💊 Potions"),
    secondaryButton(`${SHOP_CATEGORY_PREFIX}status`, "💉 Status"),
    secondaryButton(`${SHOP_CATEGORY_PREFIX}berries`, "🍇 Berries"),
  );

  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    dangerButton("SHOP_BACK", "🏠 Back to Home"),
  );

  return [row, backRow];
}

/**
 * Build item buy buttons for a category
 * Uses buttons instead of select menu for consistency with rest of bot
 */
export function buildItemButtons(
  category: ShopCategory,
  coins: number
): ActionRowBuilder<ButtonBuilder>[] {
  const items = SHOP_INVENTORY[category];
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  // Create a row for each item (up to 4 items per row due to button limits)
  // Each item gets a "Buy 1" button
  const itemRow = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < Math.min(items.length, 4); i++) {
    const item = items[i];
    const canAfford = coins >= item.price;
    const btn = new ButtonBuilder()
      .setCustomId(`${SHOP_BUY_PREFIX}${item.itemId}_1`)
      .setLabel(`${item.emoji} ${item.name} ₽${item.price}`)
      .setStyle(canAfford ? 1 : 2) // Primary if affordable, Secondary if not
      .setDisabled(!canAfford);
    itemRow.addComponents(btn);
  }
  rows.push(itemRow);

  // If there are more items, add a second row
  if (items.length > 4) {
    const itemRow2 = new ActionRowBuilder<ButtonBuilder>();
    for (let i = 4; i < Math.min(items.length, 8); i++) {
      const item = items[i];
      const canAfford = coins >= item.price;
      const btn = new ButtonBuilder()
        .setCustomId(`${SHOP_BUY_PREFIX}${item.itemId}_1`)
        .setLabel(`${item.emoji} ${item.name} ₽${item.price}`)
        .setStyle(canAfford ? 1 : 2)
        .setDisabled(!canAfford);
      itemRow2.addComponents(btn);
    }
    rows.push(itemRow2);
  }

  // Navigation row
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    secondaryButton(`${SHOP_CATEGORY_PREFIX}back`, "⬅️ Categories"),
    dangerButton("SHOP_BACK", "🏠 Home"),
  );
  rows.push(navRow);

  return rows;
}

// ============================================================================
// INTERACTION HANDLERS
// ============================================================================

/**
 * Open shop screen from home button
 * Sends shop embed to the homestead channel
 */
export async function openShopScreen(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<void> {
  try {
    const manager = new HomesteadChannelManager(client, guildId);
    const { channel } = await manager.getOrCreateChannel(user);

    const snapshot = await loadShopSnapshot(user.id);
    const embed = buildShopEmbed(snapshot.coins);
    const components = buildCategoryButtons();

    await channel.send({
      embeds: [embed],
      components,
    });

    logger.info("HomesteadShop", "openShopScreen", "Opened shop screen", {
      metadata: { userId: user.id, coins: snapshot.coins },
    });
  } catch (error) {
    logger.error("HomesteadShop", "openShopScreen", "Failed to open shop screen", {
      metadata: { userId: user.id, error },
    });
    throw error;
  }
}

/**
 * Handle shop screen open from home
 */
export async function handleShopOpen(
  interaction: ButtonInteraction,
  _homesteadManager: HomesteadChannelManager
): Promise<void> {
  const snapshot = await loadShopSnapshot(interaction.user.id);
  
  const embed = buildShopEmbed(snapshot.coins);
  const components = buildCategoryButtons();

  await safeReplyWithPayload(interaction, {
    embeds: [embed],
    components,
  });
}

/**
 * Handle category selection
 */
export async function handleCategorySelect(
  interaction: ButtonInteraction,
  category: ShopCategory
): Promise<void> {
  const snapshot = await loadShopSnapshot(interaction.user.id);
  
  const embed = buildCategoryEmbed(category, snapshot.coins);
  const components = buildItemButtons(category, snapshot.coins);

  await safeReplyWithPayload(interaction, {
    embeds: [embed],
    components,
  });
}

/**
 * Handle item purchase button
 * Button ID format: SHOP_BUY_{itemId}_{quantity}
 */
export async function handleItemPurchase(
  interaction: ButtonInteraction,
  itemId: number,
  quantity: number = 1
): Promise<void> {
  // Find the item info
  let item: ShopItem | undefined;
  let itemCategory: ShopCategory | undefined;
  
  for (const [category, items] of Object.entries(SHOP_INVENTORY)) {
    const found = items.find(i => i.itemId === itemId);
    if (found) {
      item = found;
      itemCategory = category as ShopCategory;
      break;
    }
  }

  if (!item || !itemCategory) {
    await safeReplyWithPayload(interaction, {
      embeds: [buildPurchaseErrorEmbed("Item not found")],
      components: buildCategoryButtons(),
    });
    return;
  }

  const result = await purchaseItem(interaction.user.id, itemId, quantity);

  if (result.success) {
    const embed = buildPurchaseEmbed(
      item.name,
      quantity,
      item.price * quantity,
      result.newBalance!
    );
    // Show purchase success and stay on category
    const components = buildItemButtons(itemCategory, result.newBalance!);
    await safeReplyWithPayload(interaction, {
      embeds: [embed],
      components,
    });
  } else {
    const snapshot = await loadShopSnapshot(interaction.user.id);
    await safeReplyWithPayload(interaction, {
      embeds: [buildPurchaseErrorEmbed(result.error!)],
      components: buildItemButtons(itemCategory, snapshot.coins),
    });
  }
}

/**
 * Main shop button router
 */
export async function handleShopButton(
  interaction: ButtonInteraction,
  homesteadManager: HomesteadChannelManager
): Promise<void> {
  const customId = interaction.customId;

  // Back to home
  if (customId === "SHOP_BACK") {
    // Defer to home handler - the router should catch this
    return;
  }

  // Category selection
  if (customId.startsWith(SHOP_CATEGORY_PREFIX)) {
    const category = customId.replace(SHOP_CATEGORY_PREFIX, "");
    if (category === "back") {
      // Return to main shop view
      await handleShopOpen(interaction, homesteadManager);
      return;
    }
    if (isShopCategory(category)) {
      await handleCategorySelect(interaction, category);
      return;
    }
  }

  // Item purchase: SHOP_BUY_{itemId}_{quantity}
  if (customId.startsWith(SHOP_BUY_PREFIX)) {
    const parts = customId.replace(SHOP_BUY_PREFIX, "").split("_");
    const itemId = parseInt(parts[0], 10);
    const quantity = parseInt(parts[1], 10) || 1;
    
    if (!isNaN(itemId)) {
      await handleItemPurchase(interaction, itemId, quantity);
      return;
    }
  }

  logger.warn("Shop", "handleShopButton", "Unknown shop button", {
    userId: interaction.user.id,
    metadata: { customId },
  });
}

// ============================================================================
// HELPERS
// ============================================================================

function isShopCategory(value: string): value is ShopCategory {
  return SHOP_CATEGORIES.some(c => c.id === value);
}
