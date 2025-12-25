/**
 * Party Screen — Per Game Design Bible § 6
 *
 * Displays all 6 party slots with individual Pokemon buttons.
 * Clicking a Pokemon opens the POKEMON DETAIL screen.
 *
 * Button IDs:
 * - PARTY_SLOT_{0-5}: View Pokemon detail for that slot
 * - PARTY_BACK: Return to home screen
 * - PARTY_SET_LEAD_{slot}: Set as lead (swap with slot 0)
 * - PARTY_DETAIL_BACK: Return from detail to party list
 *
 * @module homestead/party
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  MessageActionRowComponentBuilder,
  User as DiscordUser,
} from "discord.js";
import { prisma } from "../../shared/prisma.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { EMBED_COLORS } from "../shared/embed-colors.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface IVsEVs {
  hp?: number;
  atk?: number;
  def?: number;
  spa?: number;
  spd?: number;
  spe?: number;
}

interface PartyPokemon {
  id: string;
  speciesId: number;
  speciesName: string | null;
  nickname: string | null;
  level: number;
  hp: number;  // Current HP (uses `hp` field from schema)
  maxHp: number;
  isShiny: boolean;
  status: string | null;
  slot: number;
  // For detail view - computed from base + IVs + EVs
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  baseSpAtk: number;
  baseSpDef: number;
  baseSpe: number;
  ivs: IVsEVs;
  evs: IVsEVs;
  moves: string[];
  nature: string | null;
  exp: number;
  ability: string | null;
  heldItem: string | null;
}

interface PartyScreenData {
  username: string;
  party: (PartyPokemon | null)[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const PARTY_SLOT_PREFIX = "PARTY_SLOT_";
export const PARTY_SET_LEAD_PREFIX = "PARTY_SET_LEAD_";

const MAX_PARTY_SIZE = 6;

// ─────────────────────────────────────────────────────────────────────────────
// UI Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build HP bar visualization for party screen
 */
function buildHpBar(current: number, max: number, length = 10): string {
  if (max <= 0) return "░".repeat(length);
  const ratio = Math.max(0, Math.min(1, current / max));
  const filled = Math.round(ratio * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

/**
 * Get HP color emoji based on percentage
 */
function getHpEmoji(current: number, max: number): string {
  if (current <= 0) return "💀";
  const ratio = current / max;
  if (ratio <= 0.25) return "🔴";
  if (ratio <= 0.50) return "🟠";
  if (ratio <= 0.75) return "🟡";
  return "🟢";
}

/**
 * Get status condition emoji
 */
function getStatusEmoji(status: string | null): string {
  if (!status) return "";
  const statusMap: Record<string, string> = {
    "poisoned": "🟣",
    "burned": "🔥",
    "paralyzed": "⚡",
    "frozen": "❄️",
    "asleep": "💤",
    "confused": "💫",
  };
  return statusMap[status.toLowerCase()] ?? "⚠️";
}

/**
 * Format Pokemon display name
 */
function formatPokemonName(pokemon: PartyPokemon): string {
  const name = pokemon.nickname || pokemon.speciesName || `#${pokemon.speciesId}`;
  const shiny = pokemon.isShiny ? " ✨" : "";
  return `${name}${shiny}`;
}

/**
 * Build party slot buttons - one per Pokemon (or empty slot)
 */
function buildPartySlotButtons(party: (PartyPokemon | null)[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  let buttonsInRow = 0;

  for (let slot = 0; slot < MAX_PARTY_SIZE; slot++) {
    const pokemon = party[slot];
    
    if (pokemon) {
      const hpEmoji = getHpEmoji(pokemon.hp, pokemon.maxHp);
      const statusEmoji = getStatusEmoji(pokemon.status);
      const label = `${pokemon.nickname || pokemon.speciesName || "???"}${statusEmoji}`;
      const truncatedLabel = label.length > 25 ? label.slice(0, 22) + "..." : label;
      
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${PARTY_SLOT_PREFIX}${slot}`)
          .setLabel(`${hpEmoji} ${truncatedLabel}`)
          .setStyle(pokemon.hp > 0 ? ButtonStyle.Primary : ButtonStyle.Danger)
      );
    } else {
      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${PARTY_SLOT_PREFIX}${slot}`)
          .setLabel(`Slot ${slot + 1} (Empty)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      );
    }
    
    buttonsInRow++;
    
    // Max 3 per row for better mobile layout
    if (buttonsInRow >= 3) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
      buttonsInRow = 0;
    }
  }
  
  // Add any remaining buttons
  if (buttonsInRow > 0) {
    rows.push(currentRow);
  }
  
  return rows;
}

/**
 * Build navigation row with Back button
 */
function buildPartyNavRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("PARTY_BACK")
      .setLabel("🔙 Back to Home")
      .setStyle(ButtonStyle.Secondary)
  );
}

/**
 * Build the main party embed showing all slots
 */
function buildPartyEmbed(data: PartyScreenData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("📋 Your Party")
    .setColor(EMBED_COLORS.INFO)
    .setDescription("Select a Pokémon to view details or manage your team.");

  const filledSlots = data.party.filter(Boolean).length;
  embed.setFooter({ text: `${filledSlots}/${MAX_PARTY_SIZE} slots filled` });

  // Add each party slot as a field
  for (let slot = 0; slot < MAX_PARTY_SIZE; slot++) {
    const pokemon = data.party[slot];
    
    if (pokemon) {
      const hpBar = buildHpBar(pokemon.hp, pokemon.maxHp);
      const hpEmoji = getHpEmoji(pokemon.hp, pokemon.maxHp);
      const statusText = pokemon.status ? ` • ${getStatusEmoji(pokemon.status)} ${pokemon.status}` : "";
      const leadBadge = slot === 0 ? " 👑" : "";
      
      embed.addFields({
        name: `Slot ${slot + 1}${leadBadge}: ${formatPokemonName(pokemon)}`,
        value: `Lv. ${pokemon.level} • ${hpEmoji} ${hpBar} ${pokemon.hp}/${pokemon.maxHp}${statusText}`,
        inline: false,
      });
    } else {
      embed.addFields({
        name: `Slot ${slot + 1}: Empty`,
        value: "—",
        inline: false,
      });
    }
  }

  return embed;
}

/**
 * Build detail embed for a single Pokemon
 */
function buildPokemonDetailEmbed(pokemon: PartyPokemon, slot: number): EmbedBuilder {
  const hpBar = buildHpBar(pokemon.hp, pokemon.maxHp);
  const hpEmoji = getHpEmoji(pokemon.hp, pokemon.maxHp);
  const leadBadge = slot === 0 ? " 👑 Lead" : "";
  
  const embed = new EmbedBuilder()
    .setTitle(`${formatPokemonName(pokemon)}${leadBadge}`)
    .setColor(pokemon.hp > 0 ? EMBED_COLORS.SUCCESS : EMBED_COLORS.ERROR)
    .setDescription(`Level ${pokemon.level} • ${pokemon.nature || "Hardy"} Nature`);

  // HP
  embed.addFields({
    name: "HP",
    value: `${hpEmoji} ${hpBar} ${pokemon.hp}/${pokemon.maxHp}`,
    inline: false,
  });

  // Stats - computed from base stats (Species) + IVs + EVs
  // Simplified display using base stats for now
  embed.addFields({
    name: "📊 Base Stats",
    value: [
      `HP: ${pokemon.baseHp} • ATK: ${pokemon.baseAtk} • DEF: ${pokemon.baseDef}`,
      `SP.ATK: ${pokemon.baseSpAtk} • SP.DEF: ${pokemon.baseSpDef} • SPD: ${pokemon.baseSpe}`,
    ].join("\n"),
    inline: true,
  });

  // Moves
  const movesDisplay = pokemon.moves.length > 0 
    ? pokemon.moves.map((m, i) => `${i + 1}. ${m}`).join("\n")
    : "No moves learned";
  embed.addFields({
    name: "⚔️ Moves",
    value: movesDisplay,
    inline: true,
  });

  // Extra info
  const extras: string[] = [];
  if (pokemon.ability) extras.push(`Ability: ${pokemon.ability}`);
  if (pokemon.heldItem) extras.push(`Held Item: ${pokemon.heldItem}`);
  if (pokemon.status) extras.push(`Status: ${getStatusEmoji(pokemon.status)} ${pokemon.status}`);
  
  if (extras.length > 0) {
    embed.addFields({
      name: "ℹ️ Info",
      value: extras.join("\n"),
      inline: false,
    });
  }

  embed.setFooter({ text: `EXP: ${pokemon.exp} • Slot ${slot + 1}` });

  return embed;
}

/**
 * Build detail view buttons
 */
function buildDetailButtons(slot: number, isLead: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const actionRow = new ActionRowBuilder<ButtonBuilder>();
  
  // Set Lead button (only if not already lead)
  if (!isLead) {
    actionRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PARTY_SET_LEAD_PREFIX}${slot}`)
        .setLabel("👑 Set as Lead")
        .setStyle(ButtonStyle.Primary)
    );
  }
  
  // Back button
  actionRow.addComponents(
    new ButtonBuilder()
      .setCustomId("PARTY_DETAIL_BACK")
      .setLabel("🔙 Back to Party")
      .setStyle(ButtonStyle.Secondary)
  );
  
  return [actionRow];
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load party data for a user
 * Note: User has direct parties relation (one active party per user)
 */
async function loadPartyData(discordId: string): Promise<PartyScreenData | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: {
      parties: {
        include: {
          slots: {
            include: {
              pokemon: {
                include: {
                  species: true,
                },
              },
            },
            orderBy: { slot: "asc" },
          },
        },
        take: 1, // Get first/active party
      },
    },
  });

  if (!user) return null;

  const partyData = user.parties[0];
  if (!partyData) {
    // User has no party yet
    return {
      username: discordId,
      party: Array(MAX_PARTY_SIZE).fill(null),
    };
  }

  // Map party slots to our data structure
  const party: (PartyPokemon | null)[] = Array(MAX_PARTY_SIZE).fill(null);
  
  for (const slotData of partyData.slots) {
    const pokemon = slotData.pokemon;
    if (pokemon && slotData.slot >= 0 && slotData.slot < MAX_PARTY_SIZE) {
      // Parse IVs/EVs from JSON if available
      const ivs = (pokemon.ivsJson as IVsEVs) || {};
      const evs = (pokemon.evsJson as IVsEVs) || {};
      
      party[slotData.slot] = {
        id: pokemon.id,
        speciesId: pokemon.speciesId,
        speciesName: pokemon.species?.name || null,
        nickname: pokemon.nickname,
        level: pokemon.level,
        hp: pokemon.hp,
        maxHp: pokemon.maxHp,
        isShiny: pokemon.isShiny,
        status: pokemon.status,
        slot: slotData.slot,
        // Use base stats from species
        baseHp: pokemon.species?.baseHp ?? 0,
        baseAtk: pokemon.species?.baseAtk ?? 0,
        baseDef: pokemon.species?.baseDef ?? 0,
        baseSpAtk: pokemon.species?.baseSpAtk ?? 0,
        baseSpDef: pokemon.species?.baseSpDef ?? 0,
        baseSpe: pokemon.species?.baseSpe ?? 0,
        // IVs and EVs
        ivs,
        evs,
        moves: [], // TODO: Load actual moves when move system is implemented
        ability: null, // TODO: Resolve ability name when ability system is implemented
        heldItem: null, // TODO: Load held item when item system is implemented
        nature: pokemon.nature,
        exp: pokemon.exp,
      };
    }
  }

  return {
    username: discordId,
    party,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the party screen in user's homestead channel
 */
export async function openPartyScreen(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<void> {
  const manager = new HomesteadChannelManager(client, guildId);
  const { channel } = await manager.getOrCreateChannel(user);

  const data = await loadPartyData(user.id);
  if (!data) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("📋 Party")
          .setColor(EMBED_COLORS.WARNING)
          .setDescription("You don't have a party yet. Use `/starter` to choose your first Pokémon!"),
      ],
    });
    return;
  }

  const embed = buildPartyEmbed(data);
  const slotButtons = buildPartySlotButtons(data.party);
  const navRow = buildPartyNavRow();

  await channel.send({
    embeds: [embed],
    components: [...slotButtons, navRow] as ActionRowBuilder<MessageActionRowComponentBuilder>[],
  });
}

/**
 * Handle party slot button click - show Pokemon detail
 */
export async function handlePartySlotClick(interaction: ButtonInteraction): Promise<void> {
  const slotStr = interaction.customId.replace(PARTY_SLOT_PREFIX, "");
  const slot = parseInt(slotStr, 10);
  
  if (isNaN(slot) || slot < 0 || slot >= MAX_PARTY_SIZE) {
    await interaction.reply({ content: "Invalid party slot.", ephemeral: true });
    return;
  }

  const data = await loadPartyData(interaction.user.id);
  if (!data) {
    await interaction.reply({ content: "Could not load your party data.", ephemeral: true });
    return;
  }

  const pokemon = data.party[slot];
  if (!pokemon) {
    await interaction.reply({ content: "This slot is empty.", ephemeral: true });
    return;
  }

  const embed = buildPokemonDetailEmbed(pokemon, slot);
  const buttons = buildDetailButtons(slot, slot === 0);

  await interaction.update({
    embeds: [embed],
    components: buttons as ActionRowBuilder<MessageActionRowComponentBuilder>[],
  });
}

/**
 * Handle "Set as Lead" button - swap Pokemon with slot 0
 */
export async function handleSetLead(interaction: ButtonInteraction): Promise<void> {
  const slotStr = interaction.customId.replace(PARTY_SET_LEAD_PREFIX, "");
  const slot = parseInt(slotStr, 10);
  
  if (isNaN(slot) || slot < 1 || slot >= MAX_PARTY_SIZE) {
    await interaction.reply({ content: "Invalid party slot.", ephemeral: true });
    return;
  }

  // Get user's party
  const user = await prisma.user.findUnique({
    where: { discordId: interaction.user.id },
    include: {
      parties: {
        include: {
          slots: true,
        },
        take: 1,
      },
    },
  });

  const partyData = user?.parties[0];
  if (!partyData) {
    await interaction.reply({ content: "Could not find your party.", ephemeral: true });
    return;
  }

  const partyId = partyData.id;
  const slots = partyData.slots;
  
  const leadSlot = slots.find((s: { slot: number }) => s.slot === 0);
  const targetSlot = slots.find((s: { slot: number }) => s.slot === slot);

  if (!targetSlot?.pokemonId) {
    await interaction.reply({ content: "Cannot set an empty slot as lead.", ephemeral: true });
    return;
  }

  // Swap the pokemonIds between slots
  // Note: We know both slots have valid pokemonIds since we checked above
  await prisma.$transaction([
    prisma.partySlot.update({
      where: { partyId_slot: { partyId, slot: 0 } },
      data: { pokemonId: targetSlot.pokemonId },
    }),
    prisma.partySlot.update({
      where: { partyId_slot: { partyId, slot } },
      data: { pokemonId: leadSlot!.pokemonId },
    }),
  ]);

  // Refresh and show updated party
  const data = await loadPartyData(interaction.user.id);
  if (!data) {
    await interaction.reply({ content: "Lead updated but could not refresh party view.", ephemeral: true });
    return;
  }

  const embed = buildPartyEmbed(data);
  embed.setDescription("✅ Lead Pokémon updated! Select a Pokémon to view details.");
  
  const slotButtons = buildPartySlotButtons(data.party);
  const navRow = buildPartyNavRow();

  await interaction.update({
    embeds: [embed],
    components: [...slotButtons, navRow] as ActionRowBuilder<MessageActionRowComponentBuilder>[],
  });
}

/**
 * Handle back button from detail view - return to party list
 */
export async function handlePartyDetailBack(interaction: ButtonInteraction): Promise<void> {
  const data = await loadPartyData(interaction.user.id);
  if (!data) {
    await interaction.reply({ content: "Could not load your party data.", ephemeral: true });
    return;
  }

  const embed = buildPartyEmbed(data);
  const slotButtons = buildPartySlotButtons(data.party);
  const navRow = buildPartyNavRow();

  await interaction.update({
    embeds: [embed],
    components: [...slotButtons, navRow] as ActionRowBuilder<MessageActionRowComponentBuilder>[],
  });
}

/**
 * Handle party button - routes to appropriate handler
 */
export async function handlePartyButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith(PARTY_SLOT_PREFIX)) {
    await handlePartySlotClick(interaction);
  } else if (id.startsWith(PARTY_SET_LEAD_PREFIX)) {
    await handleSetLead(interaction);
  } else if (id === "PARTY_DETAIL_BACK") {
    await handlePartyDetailBack(interaction);
  } else if (id === "PARTY_BACK") {
    // Return to home - use openPartyView which shows the default home view
    const { openPartyView } = await import("./home.js");
    await openPartyView(interaction);
  }
}
