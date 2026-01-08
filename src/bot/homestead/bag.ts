/**
 * Homestead Bag Module
 * 
 * Implements the BAG screen per Game Design Bible section 6.
 * Players click [🎒 Bag] on home screen → arrive here → 
 * view/use items by category.
 * 
 * SCREEN LAYOUT (per Bible):
 * ┌─────────────────────────────────────────────────────────┐
 * │  🎒 YOUR BAG                                            │
 * │                                                         │
 * │  Category: Poké Balls                                   │
 * │                                                         │
 * │  ⚪ Poké Ball ×10                                       │
 * │  🔵 Great Ball ×5                                       │
 * │  🟡 Ultra Ball ×2                                       │
 * │                                                         │
 * │  [⬅️ Prev] [➡️ Next] [🏠 Back]                          │
 * └─────────────────────────────────────────────────────────┘
 * 
 * @module homestead/bag
 */

// LOGGER FIRST — Must be early import to capture initialization errors
import { getLogger } from "../../shared/logging/index.js";
const logger = getLogger();

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  Client,
  EmbedBuilder,
  User as DiscordUser,
  ButtonStyle,
} from "discord.js";

import { EMBED_COLORS } from "../shared/embed-colors.js";
import { dangerButton, navButton, primaryButton } from "../shared/button-utils.js";
import { safeReply } from "../shared/response-helpers.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { getGameServer } from "../../sensaios/gameserver/singleton.js";
import { isUsableItem, getUsableTargets, useItemOnPokemon, getItemName } from "../../services/item-effects.js";
import { getSpecies } from "../../data/dexpack.js";

/**
 * Helper to get a species name by ID
 */
function getSpeciesNameById(speciesId: number): string {
  const species = getSpecies(speciesId);
  return species?.name || `#${speciesId}`;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Item categories as defined in the schema (Item.kind)
export const ITEM_CATEGORIES = [
  { id: "ball", label: "Poké Balls", emoji: "⚪" },
  { id: "potion", label: "Potions", emoji: "💊" },
  { id: "status", label: "Status Heal", emoji: "💉" },
  { id: "berry", label: "Berries", emoji: "🍇" },
  { id: "battle", label: "Battle Items", emoji: "⚔️" },
  { id: "evolution", label: "Evolution", emoji: "✨" },
  { id: "held", label: "Held Items", emoji: "📿" },
  { id: "key", label: "Key Items", emoji: "🔑" },
] as const;

export type ItemCategory = typeof ITEM_CATEGORIES[number]["id"];

export const BAG_PAGE_PREFIX = "BAG_PAGE_";
export const BAG_CATEGORY_PREFIX = "BAG_CAT_";
export const BAG_ITEM_PREFIX = "BAG_ITEM_";
export const BAG_USE_PREFIX = "BAG_USE_";
export const BAG_TARGET_PREFIX = "BAG_TARGET_";
const ITEMS_PER_PAGE = 8;

// ============================================================================
// TYPES
// ============================================================================

export interface InventoryItem {
  itemId: number;
  name: string;
  kind: string;
  qty: number;
  meta: Record<string, unknown> | null;
}

export interface BagSnapshot {
  trainerId: string;
  items: InventoryItem[];
  totalItems: number;
  uniqueItems: number;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Load player's inventory from database via GameServerAPI
 */
export async function loadBagSnapshot(discordId: string): Promise<BagSnapshot> {
  const gameServer = getGameServer();
  
  // GameServerAPI accepts plain strings and handles them internally
  const inventory = await gameServer.trainers.getInventory(discordId);
  
  if (!inventory) {
    return {
      trainerId: "",
      items: [],
      totalItems: 0,
      uniqueItems: 0,
    };
  }
  
  // Map API response to local BagSnapshot format
  const items: InventoryItem[] = inventory.items.map(item => ({
    itemId: item.itemId,
    name: item.name,
    kind: item.category, // API uses 'category', local uses 'kind'
    qty: item.quantity,  // API uses 'quantity', local uses 'qty'
    meta: item.meta ?? null,
  }));
  
  return {
    trainerId: "", // No longer needed - API doesn't expose internal IDs
    items,
    totalItems: inventory.totalItems,
    uniqueItems: inventory.uniqueItems,
  };
}

// ============================================================================
// BUTTON BUILDERS
// ============================================================================

/**
 * Build category selection buttons
 */
export function buildCategoryButtons(activeCategory?: ItemCategory): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    navButton(`${BAG_CATEGORY_PREFIX}ball`, "⚪ Balls", activeCategory === "ball"),
    navButton(`${BAG_CATEGORY_PREFIX}potion`, "💊 Potions", activeCategory === "potion"),
    navButton(`${BAG_CATEGORY_PREFIX}status`, "💉 Status", activeCategory === "status"),
    navButton(`${BAG_CATEGORY_PREFIX}berry`, "🍇 Berries", activeCategory === "berry"),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    navButton(`${BAG_CATEGORY_PREFIX}battle`, "⚔️ Battle", activeCategory === "battle"),
    navButton(`${BAG_CATEGORY_PREFIX}evolution`, "✨ Evo", activeCategory === "evolution"),
    navButton(`${BAG_CATEGORY_PREFIX}held`, "📿 Held", activeCategory === "held"),
    navButton(`${BAG_CATEGORY_PREFIX}key`, "🔑 Key", activeCategory === "key"),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    dangerButton("BAG_BACK", "🏠 Back to Home"),
  );

  return [row1, row2, row3];
}

// ============================================================================
// EMBED BUILDERS
// ============================================================================

/**
 * Build main bag overview embed
 */
function buildBagOverviewEmbed(snapshot: BagSnapshot): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🎒 Your Bag")
    .setColor(EMBED_COLORS.INFO)
    .setDescription("Select a category to view your items.");

  // Summary stats
  embed.addFields(
    { name: "Total Items", value: `${snapshot.totalItems}`, inline: true },
    { name: "Unique Types", value: `${snapshot.uniqueItems}`, inline: true },
  );

  // Quick counts by category
  const categoryCounts: Record<string, number> = {};
  for (const item of snapshot.items) {
    categoryCounts[item.kind] = (categoryCounts[item.kind] || 0) + item.qty;
  }

  const categoryLines = ITEM_CATEGORIES
    .filter(cat => categoryCounts[cat.id])
    .map(cat => `${cat.emoji} ${cat.label}: ${categoryCounts[cat.id]}`)
    .join("\n");

  if (categoryLines) {
    embed.addFields({ name: "Categories", value: categoryLines });
  } else {
    embed.addFields({ name: "Categories", value: "_Your bag is empty. Explore to find items!_" });
  }

  return embed;
}

/**
 * Get emoji for an item based on its kind and meta
 */
function getItemEmoji(item: InventoryItem): string {
  // Ball-specific emojis
  if (item.kind === "ball") {
    const name = item.name.toLowerCase();
    if (name.includes("great")) return "🔵";
    if (name.includes("ultra")) return "🟡";
    if (name.includes("master")) return "🟣";
    if (name.includes("quick")) return "⚡";
    if (name.includes("timer")) return "⏰";
    if (name.includes("dusk")) return "🌙";
    if (name.includes("net")) return "🕸️";
    if (name.includes("dive")) return "💧";
    if (name.includes("luxury")) return "💎";
    if (name.includes("premier")) return "⚪";
    return "⚪"; // Default Poké Ball
  }

  // Category-based defaults
  const categoryEmoji = ITEM_CATEGORIES.find(c => c.id === item.kind);
  return categoryEmoji?.emoji || "📦";
}

// ============================================================================
// ITEM USE FUNCTIONALITY
// ============================================================================

/**
 * Build item list with selectable buttons for a category
 */
function buildSelectableItemButtons(
  items: InventoryItem[],
  category: ItemCategory,
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  // Add item buttons (up to 4 per row, max 2 rows of items = 8 items)
  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  let itemsInRow = 0;
  
  for (const item of items) {
    const emoji = getItemEmoji(item);
    const usable = isUsableItem(item.itemId);
    
    const button = new ButtonBuilder()
      .setCustomId(`${BAG_ITEM_PREFIX}${item.itemId}`)
      .setLabel(`${item.name} ×${item.qty}`)
      .setStyle(usable ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setEmoji(emoji);
    
    currentRow.addComponents(button);
    itemsInRow++;
    
    if (itemsInRow === 4) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
      itemsInRow = 0;
    }
  }
  
  // Push remaining items
  if (itemsInRow > 0) {
    rows.push(currentRow);
  }
  
  // Navigation row
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BAG_PAGE_PREFIX}${category}_${Math.max(1, page - 1)}`)
      .setLabel("⬅️ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${BAG_PAGE_PREFIX}${category}_${Math.min(totalPages, page + 1)}`)
      .setLabel("➡️ Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
    dangerButton("BAG_BACK", "🏠 Back"),
  );
  rows.push(navRow);
  
  return rows;
}

/**
 * Build item detail embed showing info and usage options
 */
function buildItemDetailEmbed(item: InventoryItem): EmbedBuilder {
  const emoji = getItemEmoji(item);
  const usable = isUsableItem(item.itemId);
  
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} ${item.name}`)
    .setColor(usable ? EMBED_COLORS.SUCCESS : EMBED_COLORS.INFO)
    .addFields(
      { name: "Quantity", value: `×${item.qty}`, inline: true },
      { name: "Category", value: ITEM_CATEGORIES.find(c => c.id === item.kind)?.label || item.kind, inline: true },
    );
  
  // Add description based on item type
  let description = "";
  if (item.kind === "potion") {
    description = "Use on a Pokémon to restore HP.";
  } else if (item.kind === "status") {
    description = "Use on a Pokémon to cure status conditions.";
  } else if (item.kind === "berry") {
    description = "Can be used on Pokémon for various effects.";
  } else if (item.kind === "ball") {
    description = "Use during encounters to catch wild Pokémon.";
  } else if (item.kind === "evolution") {
    description = "Use on specific Pokémon to trigger evolution.";
  } else if (item.kind === "held") {
    description = "Give to a Pokémon to hold during battles.";
  } else if (item.kind === "key") {
    description = "Special item. Cannot be used or discarded.";
  } else if (item.kind === "battle") {
    description = "Use during battle for temporary boosts.";
  }
  
  if (description) {
    embed.setDescription(description);
  }
  
  if (usable) {
    embed.setFooter({ text: "💡 Click 'Use' to select a Pokémon" });
  }
  
  return embed;
}

/**
 * Build item detail buttons
 */
function buildItemDetailButtons(item: InventoryItem): ActionRowBuilder<ButtonBuilder>[] {
  const usable = isUsableItem(item.itemId);
  
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...(usable ? [
      primaryButton(`${BAG_USE_PREFIX}${item.itemId}`, "✨ Use"),
    ] : []),
    navButton(`${BAG_CATEGORY_PREFIX}${item.kind}`, "◀️ Back to List", false),
    dangerButton("BAG_BACK", "🏠 Home"),
  );
  
  return [row];
}

/**
 * Build Pokémon target selection embed
 */
function buildTargetSelectEmbed(
  item: InventoryItem,
  targets: Array<{ id: string; speciesId: number; nickname: string | null; hp: number; maxHp: number; status: string | null; slot: number }>
): EmbedBuilder {
  const emoji = getItemEmoji(item);
  
  const embed = new EmbedBuilder()
    .setTitle(`${emoji} Use ${item.name}`)
    .setColor(EMBED_COLORS.SUCCESS)
    .setDescription("Select a Pokémon to use this item on:");
  
  if (targets.length === 0) {
    embed.setDescription("No Pokémon in your party can use this item right now.");
    embed.setColor(EMBED_COLORS.WARNING);
  } else {
    const targetLines = targets.map(p => {
      const name = p.nickname || getSpeciesNameById(p.speciesId);
      const hpBar = buildHpBar(p.hp, p.maxHp);
      const statusText = p.status ? ` [${p.status}]` : "";
      return `**${p.slot}.** ${name}${statusText}\n${hpBar} ${p.hp}/${p.maxHp} HP`;
    }).join("\n\n");
    
    embed.addFields({ name: "Available Targets", value: targetLines });
  }
  
  return embed;
}

/**
 * Build HP bar string
 */
function buildHpBar(hp: number, maxHp: number): string {
  const percent = Math.floor((hp / maxHp) * 100);
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  
  let color = "🟩"; // Green
  if (percent <= 25) color = "🟥"; // Red
  else if (percent <= 50) color = "🟨"; // Yellow
  
  return color.repeat(filled) + "⬜".repeat(empty);
}

/**
 * Build target selection buttons
 */
function buildTargetSelectButtons(
  itemId: number,
  targets: Array<{ id: string; speciesId: number; nickname: string | null; slot: number }>
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  if (targets.length === 0) {
    // No targets - just back button
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      navButton(`${BAG_ITEM_PREFIX}${itemId}`, "◀️ Back", false),
      dangerButton("BAG_BACK", "🏠 Home"),
    );
    return [row];
  }
  
  // Target buttons (one per Pokémon, up to 5 per row)
  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  let inRow = 0;
  
  for (const target of targets) {
    const name = target.nickname || getSpeciesNameById(target.speciesId);
    const shortName = name.length > 12 ? name.substring(0, 10) + "…" : name;
    
    const button = new ButtonBuilder()
      .setCustomId(`${BAG_TARGET_PREFIX}${itemId}_${target.id}`)
      .setLabel(`${target.slot}. ${shortName}`)
      .setStyle(ButtonStyle.Success);
    
    currentRow.addComponents(button);
    inRow++;
    
    if (inRow === 4) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
      inRow = 0;
    }
  }
  
  // Add cancel to last target row or new row
  if (inRow > 0) {
    currentRow.addComponents(dangerButton(`${BAG_ITEM_PREFIX}${itemId}`, "❌ Cancel"));
    rows.push(currentRow);
  } else {
    const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      dangerButton(`${BAG_ITEM_PREFIX}${itemId}`, "❌ Cancel"),
    );
    rows.push(navRow);
  }
  
  return rows;
}

// ============================================================================
// SCREEN HANDLERS
// ============================================================================

/**
 * Open the bag overview screen in player's homestead
 */
export async function openBagScreen(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<void> {
  try {
    const manager = new HomesteadChannelManager(client, guildId);
    const { channel } = await manager.getOrCreateChannel(user);

    const snapshot = await loadBagSnapshot(user.id);
    const embed = buildBagOverviewEmbed(snapshot);
    const components = buildCategoryButtons();

    await channel.send({
      embeds: [embed],
      components,
    });

    logger.info("HomesteadBag", "openBagScreen", "Opened bag screen", {
      metadata: { userId: user.id, totalItems: snapshot.totalItems },
    });
  } catch (error) {
    logger.error("HomesteadBag", "openBagScreen", "Failed to open bag screen", {
      metadata: { userId: user.id, error },
    });
    throw error;
  }
}

/**
 * Open a specific category view in the bag with selectable items
 */
async function openBagCategory(
  interaction: ButtonInteraction,
  category: ItemCategory,
  page: number = 1
): Promise<void> {
  try {
    const snapshot = await loadBagSnapshot(interaction.user.id);
    const categoryItems = snapshot.items.filter(item => item.kind === category);
    
    const totalPages = Math.max(1, Math.ceil(categoryItems.length / ITEMS_PER_PAGE));
    const currentPage = Math.min(Math.max(1, page), totalPages);
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = categoryItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    
    const categoryInfo = ITEM_CATEGORIES.find(c => c.id === category);
    
    const embed = new EmbedBuilder()
      .setTitle(`🎒 ${categoryInfo?.emoji || "📦"} ${categoryInfo?.label || category}`)
      .setColor(EMBED_COLORS.INFO)
      .setFooter({ text: `Page ${currentPage} of ${totalPages} • ${categoryItems.length} item types` });

    if (pageItems.length === 0) {
      embed.setDescription(`_No ${categoryInfo?.label?.toLowerCase() || "items"} in your bag._\n\nExplore to find more items!`);
      
      // Just show back button for empty category
      const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        dangerButton("BAG_BACK", "🏠 Back"),
      );
      
      await interaction.update({
        embeds: [embed],
        components: [backRow],
      });
    } else {
      embed.setDescription("Tap an item to view details and use it.");
      
      const components = buildSelectableItemButtons(pageItems, category, currentPage, totalPages);
      
      await interaction.update({
        embeds: [embed],
        components,
      });
    }
  } catch (error) {
    logger.error("HomesteadBag", "openBagCategory", "Failed to open category", {
      metadata: { userId: interaction.user.id, category, error },
    });
    await safeReply(interaction, "Something went wrong opening your bag.", { ephemeral: true });
  }
}

/**
 * Open item detail view
 */
async function openItemDetail(
  interaction: ButtonInteraction,
  itemId: number
): Promise<void> {
  try {
    const snapshot = await loadBagSnapshot(interaction.user.id);
    const item = snapshot.items.find(i => i.itemId === itemId);
    
    if (!item) {
      await safeReply(interaction, "You don't have this item.", { ephemeral: true });
      return;
    }
    
    const embed = buildItemDetailEmbed(item);
    const components = buildItemDetailButtons(item);
    
    await interaction.update({
      embeds: [embed],
      components,
    });
  } catch (error) {
    logger.error("HomesteadBag", "openItemDetail", "Failed to open item detail", {
      metadata: { userId: interaction.user.id, itemId, error },
    });
    await safeReply(interaction, "Something went wrong.", { ephemeral: true });
  }
}

/**
 * Open target selection for item use
 */
async function openTargetSelection(
  interaction: ButtonInteraction,
  itemId: number
): Promise<void> {
  try {
    const snapshot = await loadBagSnapshot(interaction.user.id);
    const item = snapshot.items.find(i => i.itemId === itemId);
    
    if (!item) {
      await safeReply(interaction, "You don't have this item.", { ephemeral: true });
      return;
    }
    
    // Get valid targets
    const targets = await getUsableTargets(interaction.user.id, itemId);
    
    const embed = buildTargetSelectEmbed(item, targets);
    const components = buildTargetSelectButtons(itemId, targets);
    
    await interaction.update({
      embeds: [embed],
      components,
    });
  } catch (error) {
    logger.error("HomesteadBag", "openTargetSelection", "Failed to open target selection", {
      metadata: { userId: interaction.user.id, itemId, error },
    });
    await safeReply(interaction, "Something went wrong.", { ephemeral: true });
  }
}

/**
 * Execute item use on target Pokémon
 */
async function executeItemUse(
  interaction: ButtonInteraction,
  itemId: number,
  pokemonId: string
): Promise<void> {
  try {
    const result = await useItemOnPokemon(interaction.user.id, itemId, pokemonId);
    
    // Get item name for logging purposes
    const _itemName = getItemName(itemId);
    
    if (result.success) {
      const embed = new EmbedBuilder()
        .setTitle("✨ Item Used!")
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(result.message);
      
      if (result.hpRestored) {
        embed.addFields({ name: "HP Restored", value: `+${result.hpRestored}`, inline: true });
      }
      if (result.newHp !== undefined) {
        embed.addFields({ name: "Current HP", value: `${result.newHp}`, inline: true });
      }
      if (result.statusCured) {
        embed.addFields({ name: "Status Cured", value: result.statusCured, inline: true });
      }
      
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        primaryButton(`${BAG_USE_PREFIX}${itemId}`, "🔄 Use Another"),
        dangerButton("BAG_BACK", "🏠 Home"),
      );
      
      await interaction.update({
        embeds: [embed],
        components: [row],
      });
      
      logger.info("HomesteadBag", "executeItemUse", "Item used successfully", {
        metadata: { userId: interaction.user.id, itemId, pokemonId, result: result.message },
      });
    } else {
      const embed = new EmbedBuilder()
        .setTitle("❌ Cannot Use Item")
        .setColor(EMBED_COLORS.ERROR)
        .setDescription(result.message);
      
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        navButton(`${BAG_ITEM_PREFIX}${itemId}`, "◀️ Back", false),
        dangerButton("BAG_BACK", "🏠 Home"),
      );
      
      await interaction.update({
        embeds: [embed],
        components: [row],
      });
    }
  } catch (error) {
    logger.error("HomesteadBag", "executeItemUse", "Failed to use item", {
      metadata: { userId: interaction.user.id, itemId, pokemonId, error },
    });
    await safeReply(interaction, "Something went wrong using the item.", { ephemeral: true });
  }
}

/**
 * Handle bag-related button interactions
 */
export async function handleBagButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  // Category selection: BAG_CAT_<category>
  if (customId.startsWith(BAG_CATEGORY_PREFIX)) {
    const category = customId.substring(BAG_CATEGORY_PREFIX.length) as ItemCategory;
    if (ITEM_CATEGORIES.some(c => c.id === category)) {
      await openBagCategory(interaction, category, 1);
      return;
    }
  }

  // Pagination: BAG_PAGE_<category>_<page>
  if (customId.startsWith(BAG_PAGE_PREFIX)) {
    const rest = customId.substring(BAG_PAGE_PREFIX.length);
    const [category, pageStr] = rest.split("_");
    const page = parseInt(pageStr, 10);
    
    if (ITEM_CATEGORIES.some(c => c.id === category) && !isNaN(page)) {
      await openBagCategory(interaction, category as ItemCategory, page);
      return;
    }
  }

  // Item detail view: BAG_ITEM_<itemId>
  if (customId.startsWith(BAG_ITEM_PREFIX)) {
    const itemIdStr = customId.substring(BAG_ITEM_PREFIX.length);
    const itemId = parseInt(itemIdStr, 10);
    
    if (!isNaN(itemId)) {
      await openItemDetail(interaction, itemId);
      return;
    }
  }

  // Item use (target selection): BAG_USE_<itemId>
  if (customId.startsWith(BAG_USE_PREFIX)) {
    const itemIdStr = customId.substring(BAG_USE_PREFIX.length);
    const itemId = parseInt(itemIdStr, 10);
    
    if (!isNaN(itemId)) {
      await openTargetSelection(interaction, itemId);
      return;
    }
  }

  // Target selection: BAG_TARGET_<itemId>_<pokemonId>
  if (customId.startsWith(BAG_TARGET_PREFIX)) {
    const rest = customId.substring(BAG_TARGET_PREFIX.length);
    const underscoreIdx = rest.indexOf("_");
    if (underscoreIdx !== -1) {
      const itemIdStr = rest.substring(0, underscoreIdx);
      const pokemonId = rest.substring(underscoreIdx + 1);
      const itemId = parseInt(itemIdStr, 10);
      
      if (!isNaN(itemId) && pokemonId) {
        await executeItemUse(interaction, itemId, pokemonId);
        return;
      }
    }
  }

  // Back to home - handled in index.ts
  if (customId === "BAG_BACK") {
    // This will be handled by the home screen opener in index.ts
    return;
  }

  logger.warn("HomesteadBag", "handleBagButton", "Unknown bag button", {
    metadata: { customId, userId: interaction.user.id },
  });
}
