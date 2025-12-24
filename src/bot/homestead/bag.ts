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

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  Client,
  EmbedBuilder,
  User as DiscordUser,
} from "discord.js";

import { EMBED_COLORS } from "../shared/embed-colors.js";
import { dangerButton, navButton } from "../shared/button-utils.js";
import { safeReply } from "../shared/response-helpers.js";
import { getLogger } from "../../shared/logging/index.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { prisma } from "../../shared/prisma.js";

const logger = getLogger();

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
 * Load player's inventory from database
 */
export async function loadBagSnapshot(discordId: string): Promise<BagSnapshot> {
  // Ensure user exists
  const user = await ensureUser(discordId);
  
  // Get trainer if exists
  const trainer = await prisma.trainer.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!trainer) {
    return {
      trainerId: "",
      items: [],
      totalItems: 0,
      uniqueItems: 0,
    };
  }

  // Fetch inventory with item details
  const inventory = await prisma.inventory.findMany({
    where: { trainerId: trainer.id },
    include: {
      item: {
        select: {
          id: true,
          name: true,
          kind: true,
          meta: true,
        },
      },
    },
    orderBy: [
      { item: { kind: "asc" } },
      { item: { name: "asc" } },
    ],
  });

  const items: InventoryItem[] = inventory
    .filter(inv => inv.qty > 0)
    .map(inv => ({
      itemId: inv.item.id,
      name: inv.item.name,
      kind: inv.item.kind,
      qty: inv.qty,
      meta: inv.item.meta as Record<string, unknown> | null,
    }));

  const totalItems = items.reduce((sum, item) => sum + item.qty, 0);

  return {
    trainerId: trainer.id,
    items,
    totalItems,
    uniqueItems: items.length,
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

/**
 * Build item list buttons with pagination
 */
function buildItemListButtons(
  category: ItemCategory,
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder>[] {
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BAG_PAGE_PREFIX}${category}_${Math.max(1, page - 1)}`)
      .setLabel("⬅️ Prev")
      .setStyle(2) // Secondary
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${BAG_PAGE_PREFIX}${category}_${Math.min(totalPages, page + 1)}`)
      .setLabel("➡️ Next")
      .setStyle(2) // Secondary
      .setDisabled(page >= totalPages),
    dangerButton("BAG_BACK", "🏠 Back"),
  );

  return [navRow];
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
 * Build category view embed
 */
function buildCategoryEmbed(
  snapshot: BagSnapshot,
  category: ItemCategory,
  page: number = 1
): { embed: EmbedBuilder; totalPages: number } {
  const categoryInfo = ITEM_CATEGORIES.find(c => c.id === category);
  const categoryItems = snapshot.items.filter(item => item.kind === category);
  
  const totalPages = Math.max(1, Math.ceil(categoryItems.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageItems = categoryItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle(`🎒 ${categoryInfo?.emoji || "📦"} ${categoryInfo?.label || category}`)
    .setColor(EMBED_COLORS.INFO)
    .setFooter({ text: `Page ${currentPage} of ${totalPages} • ${categoryItems.length} item types` });

  if (pageItems.length === 0) {
    embed.setDescription(`_No ${categoryInfo?.label?.toLowerCase() || "items"} in your bag._\n\nExplore to find more items!`);
  } else {
    const itemLines = pageItems.map(item => {
      const emoji = getItemEmoji(item);
      return `${emoji} **${item.name}** ×${item.qty}`;
    }).join("\n");
    
    embed.setDescription(itemLines);
  }

  return { embed, totalPages };
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
 * Open a specific category view in the bag
 */
async function openBagCategory(
  interaction: ButtonInteraction,
  category: ItemCategory,
  page: number = 1
): Promise<void> {
  try {
    const snapshot = await loadBagSnapshot(interaction.user.id);
    const { embed, totalPages } = buildCategoryEmbed(snapshot, category, page);
    const components = buildItemListButtons(category, page, totalPages);

    await interaction.update({
      embeds: [embed],
      components,
    });
  } catch (error) {
    logger.error("HomesteadBag", "openBagCategory", "Failed to open category", {
      metadata: { userId: interaction.user.id, category, error },
    });
    await safeReply(interaction, "Something went wrong opening your bag.", { ephemeral: true });
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

  // Back to home - handled in index.ts
  if (customId === "BAG_BACK") {
    // This will be handled by the home screen opener in index.ts
    return;
  }

  logger.warn("HomesteadBag", "handleBagButton", "Unknown bag button", {
    metadata: { customId, userId: interaction.user.id },
  });
}
