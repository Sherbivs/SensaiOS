/**
 * Storage Screen — PC Box System
 * 
 * Implements the Pokémon storage/PC box system per Game Design Bible § 6.
 * Players can browse their stored Pokémon, view details, and move them to party.
 * 
 * Button IDs:
 * - STORAGE_PAGE_{n} — Navigate to box page n
 * - STORAGE_MON_{id} — View details for a specific Pokémon
 * - STORAGE_TO_PARTY_{id} — Move Pokémon to party
 * - STORAGE_BACK — Return to storage list
 * - STORAGE_HOME — Return to home screen
 * 
 * @module homestead/storage
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  ButtonInteraction,
  User as DiscordUser,
} from "discord.js";
import { prisma } from "../../shared/prisma.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { EMBED_COLORS } from "../shared/embed-colors.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StoredPokemon {
  id: string;
  speciesId: number;
  speciesName: string | null;
  nickname: string | null;
  level: number;
  hp: number;
  maxHp: number;
  isShiny: boolean;
  status: string | null;
  nature: string | null;
}

interface StorageData {
  username: string;
  pokemon: StoredPokemon[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  partyCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const STORAGE_MON_PREFIX = "STORAGE_MON_";
export const STORAGE_PAGE_PREFIX = "STORAGE_PAGE_";
export const STORAGE_TO_PARTY_PREFIX = "STORAGE_TO_PARTY_";

const POKEMON_PER_PAGE = 10;
const MAX_PARTY_SIZE = 6;

// ─────────────────────────────────────────────────────────────────────────────
// UI Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get emoji for HP status
 */
function getHpEmoji(current: number, max: number): string {
  const ratio = current / max;
  if (ratio > 0.5) return "🟢";
  if (ratio > 0.25) return "🟡";
  if (ratio > 0) return "🔴";
  return "⚫";
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string | null): string {
  if (!status) return "";
  const statusMap: Record<string, string> = {
    burn: "🔥",
    freeze: "🧊",
    paralysis: "⚡",
    poison: "☠️",
    sleep: "💤",
    toxic: "💀",
  };
  return statusMap[status.toLowerCase()] || "❓";
}

/**
 * Format Pokémon display name
 */
function formatPokemonName(pokemon: StoredPokemon): string {
  const shiny = pokemon.isShiny ? "✨ " : "";
  const name = pokemon.nickname || pokemon.speciesName || `Species #${pokemon.speciesId}`;
  return `${shiny}${name}`;
}

/**
 * Build the storage list embed
 */
function buildStorageEmbed(data: StorageData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📦 Pokémon Storage")
    .setColor(EMBED_COLORS.INFO)
    .setDescription(
      data.totalCount === 0
        ? "Your storage is empty! Catch some Pokémon to store them here."
        : `You have **${data.totalCount}** Pokémon in storage.\nParty: ${data.partyCount}/${MAX_PARTY_SIZE} slots filled.`
    );

  if (data.pokemon.length > 0) {
    // Display Pokémon on this page
    const pokemonList = data.pokemon.map((p, i) => {
      const index = data.currentPage * POKEMON_PER_PAGE + i + 1;
      const hpEmoji = getHpEmoji(p.hp, p.maxHp);
      const statusEmoji = getStatusEmoji(p.status);
      return `\`${String(index).padStart(3, " ")}\` ${hpEmoji} **${formatPokemonName(p)}** Lv.${p.level}${statusEmoji}`;
    });

    embed.addFields({
      name: `Page ${data.currentPage + 1} of ${data.totalPages}`,
      value: pokemonList.join("\n"),
      inline: false,
    });
  }

  embed.setFooter({ 
    text: `Select a Pokémon to view details or move to party` 
  });

  return embed;
}

/**
 * Build Pokémon selection buttons (5 per row, 2 rows max)
 */
function buildPokemonButtons(data: StorageData): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  
  if (data.pokemon.length === 0) {
    return rows;
  }

  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  let buttonsInRow = 0;

  for (const pokemon of data.pokemon) {
    const label = `${pokemon.isShiny ? "✨" : ""} ${pokemon.nickname || pokemon.speciesName || "???"} L${pokemon.level}`;
    const truncatedLabel = label.length > 25 ? label.slice(0, 22) + "..." : label;
    
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${STORAGE_MON_PREFIX}${pokemon.id}`)
        .setLabel(truncatedLabel)
        .setStyle(pokemon.hp > 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)
    );
    
    buttonsInRow++;
    
    // Max 5 per row
    if (buttonsInRow >= 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
      buttonsInRow = 0;
      
      // Max 2 rows of Pokémon buttons
      if (rows.length >= 2) break;
    }
  }

  // Add remaining buttons
  if (buttonsInRow > 0) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Build pagination buttons
 */
function buildPaginationRow(data: StorageData): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  // Previous page
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${STORAGE_PAGE_PREFIX}${data.currentPage - 1}`)
      .setLabel("◀️ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(data.currentPage === 0)
  );

  // Page indicator (disabled button)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId("STORAGE_PAGE_INFO")
      .setLabel(`${data.currentPage + 1} / ${data.totalPages || 1}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  // Next page
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${STORAGE_PAGE_PREFIX}${data.currentPage + 1}`)
      .setLabel("Next ▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(data.currentPage >= data.totalPages - 1)
  );

  return row;
}

/**
 * Build navigation row
 */
function buildStorageNavRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("STORAGE_HOME")
      .setLabel("🔙 Back to Home")
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Build detail embed for a specific stored Pokémon
 */
function buildStorageDetailEmbed(pokemon: StoredPokemon): EmbedBuilder {
  const hpEmoji = getHpEmoji(pokemon.hp, pokemon.maxHp);
  
  const embed = new EmbedBuilder()
    .setTitle(`📦 ${formatPokemonName(pokemon)}`)
    .setColor(pokemon.hp > 0 ? EMBED_COLORS.SUCCESS : EMBED_COLORS.ERROR)
    .setDescription(`Level ${pokemon.level} • ${pokemon.nature || "Hardy"} Nature`);

  // HP status
  embed.addFields({
    name: "HP",
    value: `${hpEmoji} ${pokemon.hp}/${pokemon.maxHp}`,
    inline: true,
  });

  // Status condition
  if (pokemon.status) {
    embed.addFields({
      name: "Status",
      value: `${getStatusEmoji(pokemon.status)} ${pokemon.status}`,
      inline: true,
    });
  }

  embed.setFooter({ text: "Move to party to use in battles!" });

  return embed;
}

/**
 * Build detail view buttons
 */
function buildDetailButtons(pokemonId: string, canAddToParty: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const actionRow = new ActionRowBuilder<ButtonBuilder>();

  // Move to party button
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`${STORAGE_TO_PARTY_PREFIX}${pokemonId}`)
      .setLabel("📋 Move to Party")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canAddToParty)
  );

  // Back button
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId("STORAGE_BACK")
      .setLabel("🔙 Back to Storage")
      .setStyle(ButtonStyle.Secondary)
  );

  return [actionRow];
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load storage data for a user
 * Storage = all PokemonInstances owned by user that are NOT in a party slot
 */
async function loadStorageData(discordId: string, page: number = 0): Promise<StorageData | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: {
      parties: {
        include: {
          slots: {
            select: { pokemonId: true },
          },
        },
        take: 1,
      },
    },
  });

  if (!user) return null;

  // Get IDs of Pokémon in party
  const partyPokemonIds = new Set(
    user.parties[0]?.slots.map(s => s.pokemonId) || []
  );

  // Count total stored Pokémon (not in party)
  const totalCount = await prisma.pokemonInstance.count({
    where: {
      ownerId: user.id,
      id: { notIn: Array.from(partyPokemonIds) },
    },
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / POKEMON_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  // Fetch Pokémon for current page
  const pokemonList = await prisma.pokemonInstance.findMany({
    where: {
      ownerId: user.id,
      id: { notIn: Array.from(partyPokemonIds) },
    },
    include: {
      species: true,
    },
    orderBy: [
      { level: "desc" },
      { createdAt: "desc" },
    ],
    skip: safePage * POKEMON_PER_PAGE,
    take: POKEMON_PER_PAGE,
  });

  const pokemon: StoredPokemon[] = pokemonList.map(p => ({
    id: p.id,
    speciesId: p.speciesId,
    speciesName: p.species?.name || null,
    nickname: p.nickname,
    level: p.level,
    hp: p.hp,
    maxHp: p.maxHp,
    isShiny: p.isShiny,
    status: p.status,
    nature: p.nature,
  }));

  return {
    username: discordId,
    pokemon,
    totalCount,
    currentPage: safePage,
    totalPages,
    partyCount: partyPokemonIds.size,
  };
}

/**
 * Load a specific Pokémon from storage
 */
async function loadStoredPokemon(pokemonId: string, discordId: string): Promise<StoredPokemon | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
  });

  if (!user) return null;

  const pokemon = await prisma.pokemonInstance.findFirst({
    where: {
      id: pokemonId,
      ownerId: user.id,
    },
    include: {
      species: true,
    },
  });

  if (!pokemon) return null;

  return {
    id: pokemon.id,
    speciesId: pokemon.speciesId,
    speciesName: pokemon.species?.name || null,
    nickname: pokemon.nickname,
    level: pokemon.level,
    hp: pokemon.hp,
    maxHp: pokemon.maxHp,
    isShiny: pokemon.isShiny,
    status: pokemon.status,
    nature: pokemon.nature,
  };
}

/**
 * Get current party count for a user
 */
async function getPartyCount(discordId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: {
      parties: {
        include: {
          slots: true,
        },
        take: 1,
      },
    },
  });

  return user?.parties[0]?.slots.length || 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the storage screen in user's homestead channel
 */
export async function openStorageScreen(
  client: Client,
  guildId: string,
  user: DiscordUser,
  page: number = 0
): Promise<void> {
  const manager = new HomesteadChannelManager(client, guildId);
  const { channel } = await manager.getOrCreateChannel(user);

  if (!channel) {
    // Channel creation failed - this should be rare
    return;
  }

  const data = await loadStorageData(user.id, page);
  if (!data) {
    await channel.send({
      content: "❌ Could not load your storage data. Please try again.",
    });
    return;
  }

  const embed = buildStorageEmbed(data);
  const pokemonButtons = buildPokemonButtons(data);
  const paginationRow = buildPaginationRow(data);
  const navRow = buildStorageNavRow();

  const components = [...pokemonButtons, paginationRow, navRow];

  await channel.send({
    embeds: [embed],
    components,
  });
}

/**
 * Handle page navigation
 */
async function handlePageChange(interaction: ButtonInteraction, page: number): Promise<void> {
  const data = await loadStorageData(interaction.user.id, page);
  if (!data) {
    await interaction.reply({ content: "❌ Could not load storage data.", ephemeral: true });
    return;
  }

  const embed = buildStorageEmbed(data);
  const pokemonButtons = buildPokemonButtons(data);
  const paginationRow = buildPaginationRow(data);
  const navRow = buildStorageNavRow();

  const components = [...pokemonButtons, paginationRow, navRow];

  await interaction.update({
    embeds: [embed],
    components,
  });
}

/**
 * Handle viewing a specific Pokémon
 */
async function handleViewPokemon(interaction: ButtonInteraction, pokemonId: string): Promise<void> {
  const pokemon = await loadStoredPokemon(pokemonId, interaction.user.id);
  if (!pokemon) {
    await interaction.reply({ 
      content: "❌ Could not find that Pokémon in your storage.", 
      ephemeral: true 
    });
    return;
  }

  const partyCount = await getPartyCount(interaction.user.id);
  const canAddToParty = partyCount < MAX_PARTY_SIZE;

  const embed = buildStorageDetailEmbed(pokemon);
  const buttons = buildDetailButtons(pokemonId, canAddToParty);

  await interaction.update({
    embeds: [embed],
    components: buttons,
  });
}

/**
 * Handle moving Pokémon to party
 */
async function handleMoveToParty(interaction: ButtonInteraction, pokemonId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { discordId: interaction.user.id },
    include: {
      parties: {
        include: {
          slots: {
            orderBy: { slot: "asc" },
          },
        },
        take: 1,
      },
    },
  });

  if (!user) {
    await interaction.reply({ content: "❌ User not found.", ephemeral: true });
    return;
  }

  // Check the Pokémon exists and belongs to user
  const pokemon = await prisma.pokemonInstance.findFirst({
    where: {
      id: pokemonId,
      ownerId: user.id,
    },
    include: { species: true },
  });

  if (!pokemon) {
    await interaction.reply({ 
      content: "❌ Could not find that Pokémon in your storage.", 
      ephemeral: true 
    });
    return;
  }

  let party = user.parties[0];

  // Create party if doesn't exist
  if (!party) {
    party = await prisma.party.create({
      data: {
        ownerId: user.id,
        slots: {
          create: {
            slot: 0,
            pokemonId: pokemonId,
          },
        },
      },
      include: {
        slots: true,
      },
    });

    await interaction.reply({
      content: `✅ **${pokemon.nickname || pokemon.species?.name || "Pokémon"}** moved to party as your lead!`,
      ephemeral: true,
    });
    return;
  }

  // Check party size
  if (party.slots.length >= MAX_PARTY_SIZE) {
    await interaction.reply({
      content: "❌ Your party is full! Remove a Pokémon first.",
      ephemeral: true,
    });
    return;
  }

  // Find first available slot
  const usedSlots = new Set(party.slots.map(s => s.slot));
  let nextSlot = 0;
  for (let i = 0; i < MAX_PARTY_SIZE; i++) {
    if (!usedSlots.has(i)) {
      nextSlot = i;
      break;
    }
  }

  // Check if Pokémon is already in party
  const alreadyInParty = party.slots.some(s => s.pokemonId === pokemonId);
  if (alreadyInParty) {
    await interaction.reply({
      content: "❌ That Pokémon is already in your party!",
      ephemeral: true,
    });
    return;
  }

  // Add to party
  await prisma.partySlot.create({
    data: {
      partyId: party.id,
      slot: nextSlot,
      pokemonId: pokemonId,
    },
  });

  // Return to storage view
  const data = await loadStorageData(interaction.user.id);
  if (!data) {
    await interaction.reply({
      content: `✅ **${pokemon.nickname || pokemon.species?.name || "Pokémon"}** moved to party slot ${nextSlot + 1}!`,
      ephemeral: true,
    });
    return;
  }

  const embed = buildStorageEmbed(data);
  embed.setDescription(`✅ **${pokemon.nickname || pokemon.species?.name || "Pokémon"}** moved to party!\n\n` + embed.data.description);
  
  const pokemonButtons = buildPokemonButtons(data);
  const paginationRow = buildPaginationRow(data);
  const navRow = buildStorageNavRow();

  await interaction.update({
    embeds: [embed],
    components: [...pokemonButtons, paginationRow, navRow],
  });
}

/**
 * Handle back to storage list
 */
async function handleBackToStorage(interaction: ButtonInteraction): Promise<void> {
  const data = await loadStorageData(interaction.user.id);
  if (!data) {
    await interaction.reply({ content: "❌ Could not load storage data.", ephemeral: true });
    return;
  }

  const embed = buildStorageEmbed(data);
  const pokemonButtons = buildPokemonButtons(data);
  const paginationRow = buildPaginationRow(data);
  const navRow = buildStorageNavRow();

  await interaction.update({
    embeds: [embed],
    components: [...pokemonButtons, paginationRow, navRow],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main button handler for storage screen
 */
export async function handleStorageButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    // Page navigation
    if (customId.startsWith(STORAGE_PAGE_PREFIX)) {
      const page = parseInt(customId.replace(STORAGE_PAGE_PREFIX, ""), 10);
      if (!isNaN(page)) {
        await handlePageChange(interaction, page);
      }
      return;
    }

    // View specific Pokémon
    if (customId.startsWith(STORAGE_MON_PREFIX)) {
      const pokemonId = customId.replace(STORAGE_MON_PREFIX, "");
      await handleViewPokemon(interaction, pokemonId);
      return;
    }

    // Move to party
    if (customId.startsWith(STORAGE_TO_PARTY_PREFIX)) {
      const pokemonId = customId.replace(STORAGE_TO_PARTY_PREFIX, "");
      await handleMoveToParty(interaction, pokemonId);
      return;
    }

    // Back to storage list
    if (customId === "STORAGE_BACK") {
      await handleBackToStorage(interaction);
      return;
    }

    // These are handled by the main index.ts router
    // - STORAGE_HOME → handled as HOME navigation
    
  } catch {
    // Log error via structured logging if available, otherwise silent fail
    
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred. Please try again.",
        ephemeral: true,
      });
    }
  }
}
