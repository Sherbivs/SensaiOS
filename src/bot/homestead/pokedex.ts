/**
 * Homestead Pokédex Module
 * 
 * Implements the POKÉDEX screen per Game Design Bible section 6.
 * Players click [📖 Pokédex] on home screen → arrive here → 
 * view collection progress by region.
 * 
 * PSYCHOLOGY HOOK #2 (Goal Gradient Effect):
 * Show "Just 3 more to complete Kanto!" when close to completion.
 * As players get closer to a goal, their motivation increases.
 * 
 * SCREEN LAYOUT (per Bible):
 * ┌─────────────────────────────────────────────────────────┐
 * │  📖 POKÉDEX                                             │
 * │                                                         │
 * │  Overall Progress: ████████░░ 247/898 (27%)             │
 * │                                                         │
 * │  🟢 Kanto:    ████████░░ 131/151 (86%)                  │
 * │  🟡 Johto:    ██████░░░░ 76/100 (76%)                   │
 * │  🔴 Hoenn:    ████░░░░░░ 40/135 (30%)                   │
 * │  ...                                                    │
 * │                                                         │
 * │  Just 20 more to complete Kanto! 🎯                     │
 * │                                                         │
 * │  [Region buttons...] [🏠 Back]                          │
 * └─────────────────────────────────────────────────────────┘
 * 
 * @module homestead/pokedex
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
} from "discord.js";

import { EMBED_COLORS } from "../shared/embed-colors.js";
import { dangerButton, navButton } from "../shared/button-utils.js";
import { safeReply } from "../shared/response-helpers.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { prisma } from "../../shared/prisma.js";

// ============================================================================
// CONSTANTS
// ============================================================================

// Pokédex regions with their National Dex number ranges
export const POKEDEX_REGIONS = [
  { id: "kanto", label: "Kanto", emoji: "🔴", start: 1, end: 151 },
  { id: "johto", label: "Johto", emoji: "🟡", start: 152, end: 251 },
  { id: "hoenn", label: "Hoenn", emoji: "🟢", start: 252, end: 386 },
  { id: "sinnoh", label: "Sinnoh", emoji: "🔵", start: 387, end: 493 },
  { id: "unova", label: "Unova", emoji: "⚫", start: 494, end: 649 },
  { id: "kalos", label: "Kalos", emoji: "🟣", start: 650, end: 721 },
  { id: "alola", label: "Alola", emoji: "🌴", start: 722, end: 809 },
  { id: "galar", label: "Galar", emoji: "🗡️", start: 810, end: 898 },
] as const;

export type PokedexRegion = typeof POKEDEX_REGIONS[number]["id"];

export const DEX_REGION_PREFIX = "DEX_REGION_";
export const DEX_PAGE_PREFIX = "DEX_PAGE_";
const ENTRIES_PER_PAGE = 15;

// ============================================================================
// TYPES
// ============================================================================

export interface PokedexEntry {
  speciesId: number;
  name: string;
  caught: boolean;
  caughtAt?: Date;
  isShiny?: boolean;
}

export interface RegionProgress {
  regionId: string;
  label: string;
  emoji: string;
  caught: number;
  total: number;
  percentage: number;
  remaining: number;
}

export interface PokedexSnapshot {
  trainerId: string;
  totalCaught: number;
  totalSpecies: number;
  overallPercentage: number;
  regions: RegionProgress[];
  entries: Map<number, PokedexEntry>;
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Load player's Pokédex progress from database
 */
export async function loadPokedexSnapshot(discordId: string): Promise<PokedexSnapshot> {
  // Ensure user exists
  const user = await ensureUser(discordId);
  
  // Get trainer if exists
  const trainer = await prisma.trainer.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });

  const entries = new Map<number, PokedexEntry>();
  let totalCaught = 0;

  if (trainer) {
    // Get all caught Pokemon species (unique by speciesId)
    const caughtPokemon = await prisma.pokemonInstance.findMany({
      where: { ownerId: trainer.id },
      select: {
        speciesId: true,
        isShiny: true,
        createdAt: true, // Use createdAt as caught date
      },
      distinct: ["speciesId"],
      orderBy: { speciesId: "asc" },
    });

    // Build entries map
    for (const pokemon of caughtPokemon) {
      entries.set(pokemon.speciesId, {
        speciesId: pokemon.speciesId,
        name: getSpeciesName(pokemon.speciesId),
        caught: true,
        caughtAt: pokemon.createdAt,
        isShiny: pokemon.isShiny,
      });
    }

    totalCaught = entries.size;
  }

  // Calculate region progress
  const regions: RegionProgress[] = POKEDEX_REGIONS.map(region => {
    let caught = 0;
    for (let i = region.start; i <= region.end; i++) {
      if (entries.has(i)) caught++;
    }
    const total = region.end - region.start + 1;
    const percentage = Math.round((caught / total) * 100);
    
    return {
      regionId: region.id,
      label: region.label,
      emoji: region.emoji,
      caught,
      total,
      percentage,
      remaining: total - caught,
    };
  });

  const totalSpecies = POKEDEX_REGIONS.reduce(
    (sum, r) => sum + (r.end - r.start + 1),
    0
  );

  return {
    trainerId: trainer?.id ?? "",
    totalCaught,
    totalSpecies,
    overallPercentage: Math.round((totalCaught / totalSpecies) * 100),
    regions,
    entries,
  };
}

/**
 * Get species name from ID (placeholder - should use dexpack)
 */
function getSpeciesName(speciesId: number): string {
  // TODO: Replace with actual dexpack lookup
  // For now, return a placeholder
  return `Species #${speciesId}`;
}

// ============================================================================
// BUTTON BUILDERS
// ============================================================================

/**
 * Build region selection buttons
 */
export function buildRegionButtons(activeRegion?: PokedexRegion): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    navButton(`${DEX_REGION_PREFIX}kanto`, "🔴 Kanto", activeRegion === "kanto"),
    navButton(`${DEX_REGION_PREFIX}johto`, "🟡 Johto", activeRegion === "johto"),
    navButton(`${DEX_REGION_PREFIX}hoenn`, "🟢 Hoenn", activeRegion === "hoenn"),
    navButton(`${DEX_REGION_PREFIX}sinnoh`, "🔵 Sinnoh", activeRegion === "sinnoh"),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    navButton(`${DEX_REGION_PREFIX}unova`, "⚫ Unova", activeRegion === "unova"),
    navButton(`${DEX_REGION_PREFIX}kalos`, "🟣 Kalos", activeRegion === "kalos"),
    navButton(`${DEX_REGION_PREFIX}alola`, "🌴 Alola", activeRegion === "alola"),
    navButton(`${DEX_REGION_PREFIX}galar`, "🗡️ Galar", activeRegion === "galar"),
  );

  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    dangerButton("DEX_BACK", "🏠 Back to Home"),
  );

  return [row1, row2, row3];
}

/**
 * Build region view buttons with pagination
 */
function buildRegionViewButtons(
  region: PokedexRegion,
  page: number,
  totalPages: number
): ActionRowBuilder<ButtonBuilder>[] {
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DEX_PAGE_PREFIX}${region}_${Math.max(1, page - 1)}`)
      .setLabel("⬅️ Prev")
      .setStyle(2) // Secondary
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${DEX_PAGE_PREFIX}${region}_${Math.min(totalPages, page + 1)}`)
      .setLabel("➡️ Next")
      .setStyle(2) // Secondary
      .setDisabled(page >= totalPages),
    dangerButton("DEX_BACK", "🏠 Back"),
  );

  return [navRow];
}

// ============================================================================
// EMBED BUILDERS
// ============================================================================

/**
 * Build progress bar string
 */
function buildProgressBar(percentage: number, length: number = 10): string {
  const filled = Math.round((percentage / 100) * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

/**
 * Build main Pokédex overview embed
 */
function buildDexOverviewEmbed(snapshot: PokedexSnapshot): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📖 Pokédex")
    .setColor(EMBED_COLORS.INFO);

  // Overall progress
  const overallBar = buildProgressBar(snapshot.overallPercentage);
  embed.setDescription(
    `**Overall Progress:** ${overallBar} ${snapshot.totalCaught}/${snapshot.totalSpecies} (${snapshot.overallPercentage}%)`
  );

  // Regional progress
  const regionLines = snapshot.regions.map(region => {
    const bar = buildProgressBar(region.percentage, 8);
    return `${region.emoji} **${region.label}:** ${bar} ${region.caught}/${region.total} (${region.percentage}%)`;
  }).join("\n");

  embed.addFields({ name: "Regional Progress", value: regionLines });

  // Goal Gradient Effect - find closest to completion
  const nearCompletion = snapshot.regions
    .filter(r => r.percentage >= 70 && r.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining);

  if (nearCompletion.length > 0) {
    const closest = nearCompletion[0];
    embed.addFields({
      name: "🎯 Almost There!",
      value: `Just **${closest.remaining}** more to complete ${closest.label}!`,
    });
  }

  return embed;
}

/**
 * Build region detail view embed
 */
function buildRegionEmbed(
  snapshot: PokedexSnapshot,
  regionId: PokedexRegion,
  page: number = 1
): { embed: EmbedBuilder; totalPages: number } {
  const region = POKEDEX_REGIONS.find(r => r.id === regionId);
  if (!region) {
    return {
      embed: new EmbedBuilder()
        .setTitle("❌ Unknown Region")
        .setColor(EMBED_COLORS.ERROR),
      totalPages: 1,
    };
  }

  const regionProgress = snapshot.regions.find(r => r.regionId === regionId);
  const totalEntries = region.end - region.start + 1;
  const totalPages = Math.max(1, Math.ceil(totalEntries / ENTRIES_PER_PAGE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  
  const startIdx = (currentPage - 1) * ENTRIES_PER_PAGE;
  const startDex = region.start + startIdx;
  const endDex = Math.min(region.start + startIdx + ENTRIES_PER_PAGE - 1, region.end);

  const embed = new EmbedBuilder()
    .setTitle(`📖 ${region.emoji} ${region.label} Pokédex`)
    .setColor(EMBED_COLORS.INFO)
    .setFooter({ 
      text: `Page ${currentPage} of ${totalPages} • ${regionProgress?.caught || 0}/${regionProgress?.total || totalEntries} caught` 
    });

  // Build entry list
  const entryLines: string[] = [];
  for (let dexNum = startDex; dexNum <= endDex; dexNum++) {
    const entry = snapshot.entries.get(dexNum);
    if (entry?.caught) {
      const shinyIcon = entry.isShiny ? "✨" : "";
      entryLines.push(`✅ **#${dexNum}** ${entry.name} ${shinyIcon}`);
    } else {
      entryLines.push(`❓ **#${dexNum}** ???`);
    }
  }

  embed.setDescription(entryLines.join("\n") || "_No entries_");

  // Goal gradient for this region
  if (regionProgress && regionProgress.percentage >= 80 && regionProgress.remaining > 0) {
    embed.addFields({
      name: "🎯 So Close!",
      value: `Only **${regionProgress.remaining}** more to complete ${region.label}!`,
    });
  }

  return { embed, totalPages };
}

// ============================================================================
// SCREEN HANDLERS
// ============================================================================

/**
 * Open the Pokédex overview screen in player's homestead
 */
export async function openPokedexScreen(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<void> {
  try {
    const manager = new HomesteadChannelManager(client, guildId);
    const { channel } = await manager.getOrCreateChannel(user);

    const snapshot = await loadPokedexSnapshot(user.id);
    const embed = buildDexOverviewEmbed(snapshot);
    const components = buildRegionButtons();

    await channel.send({
      embeds: [embed],
      components,
    });

    logger.info("HomesteadPokedex", "openPokedexScreen", "Opened Pokédex screen", {
      metadata: { userId: user.id, totalCaught: snapshot.totalCaught },
    });
  } catch (error) {
    logger.error("HomesteadPokedex", "openPokedexScreen", "Failed to open Pokédex screen", {
      metadata: { userId: user.id, error },
    });
    throw error;
  }
}

/**
 * Open a specific region view in the Pokédex
 */
async function openRegionView(
  interaction: ButtonInteraction,
  region: PokedexRegion,
  page: number = 1
): Promise<void> {
  try {
    const snapshot = await loadPokedexSnapshot(interaction.user.id);
    const { embed, totalPages } = buildRegionEmbed(snapshot, region, page);
    const components = buildRegionViewButtons(region, page, totalPages);

    await interaction.update({
      embeds: [embed],
      components,
    });
  } catch (error) {
    logger.error("HomesteadPokedex", "openRegionView", "Failed to open region view", {
      metadata: { userId: interaction.user.id, region, error },
    });
    await safeReply(interaction, "Something went wrong opening the Pokédex.", { ephemeral: true });
  }
}

/**
 * Handle Pokédex-related button interactions
 */
export async function handlePokedexButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  // Region selection: DEX_REGION_<region>
  if (customId.startsWith(DEX_REGION_PREFIX)) {
    const region = customId.substring(DEX_REGION_PREFIX.length) as PokedexRegion;
    if (POKEDEX_REGIONS.some(r => r.id === region)) {
      await openRegionView(interaction, region, 1);
      return;
    }
  }

  // Pagination: DEX_PAGE_<region>_<page>
  if (customId.startsWith(DEX_PAGE_PREFIX)) {
    const rest = customId.substring(DEX_PAGE_PREFIX.length);
    const [region, pageStr] = rest.split("_");
    const page = parseInt(pageStr, 10);
    
    if (POKEDEX_REGIONS.some(r => r.id === region) && !isNaN(page)) {
      await openRegionView(interaction, region as PokedexRegion, page);
      return;
    }
  }

  // Back to home - handled in index.ts
  if (customId === "DEX_BACK") {
    // This will be handled by the home screen opener in index.ts
    return;
  }

  logger.warn("HomesteadPokedex", "handlePokedexButton", "Unknown Pokédex button", {
    metadata: { customId, userId: interaction.user.id },
  });
}
