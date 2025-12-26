/**
 * Homestead Explore Module
 * 
 * Implements the EXPLORE screen per Game Design Bible section 6.
 * Players click [🚶 Explore] on home screen → arrive here → 
 * choose Walk/Fish/Back → triggers encounter flow.
 * 
 * SCREEN LAYOUT (per Bible):
 * ┌─────────────────────────────────────────────────────────┐
 * │  🌲 EXPLORE THE WILD                                    │
 * │                                                         │
 * │  Your Pokémon:                                          │
 * │  🔥 Charmander (Lv. 5)                                  │
 * │  HP: ████████████████░░ 18/20                           │
 * │                                                         │
 * │  What would you like to do?                             │
 * │                                                         │
 * │  [👟 Walk] [🎣 Fish] [🏠 Back]                          │
 * └─────────────────────────────────────────────────────────┘
 * 
 * @module homestead/explore
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
import { primaryButton, secondaryButton, dangerButton } from "../shared/button-utils.js";
import { safeReply } from "../shared/response-helpers.js";
import { HomesteadChannelManager } from "../../services/homestead-manager.js";
import { getPartyWithSlots } from "../../shared/models/party-queries-pg.js";
import { ensureUser } from "../../shared/models/user-queries-pg.js";
import { spawnEncounterForUser } from "../../core/encounter/spawn.js";
import { openEncounterDM } from "../wilds/controls.js";
import { findCooldownByUserAndKind, createCooldown, updateCooldownReadyAt } from "../../services/home-bundle-pg.js";
import { canStartWalk } from "../middleware/limits.js";

// ============================================================================
// TYPES
// ============================================================================

export type ExploreResult = 
  | { success: true; encounterId: string }
  | { noEncounter: true; message: string }
  | { cooldown: true; secondsRemaining: number }
  | { partyFainted: true }
  | { activeEncounter: true }
  | { error: true; message: string };

// ============================================================================
// BUTTON BUILDERS
// ============================================================================

/**
 * Build explore action buttons
 * Per Bible: [👟 Walk] [🎣 Fish] [🏠 Back]
 */
export function buildExploreButtons(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    primaryButton("EXPLORE_WALK", "👟 Walk"),
    secondaryButton("EXPLORE_FISH", "🎣 Fish"),
    dangerButton("EXPLORE_BACK", "🏠 Back")
  );
  return [row];
}

/**
 * Build explore buttons with walk disabled (all party fainted)
 */
export function buildExploreButtonsDisabled(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("EXPLORE_WALK")
      .setLabel("👟 Walk")
      .setStyle(1) // Primary
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("EXPLORE_FISH")
      .setLabel("🎣 Fish")
      .setStyle(2) // Secondary  
      .setDisabled(true),
    dangerButton("EXPLORE_BACK", "🏠 Back")
  );
  return [row];
}

// ============================================================================
// EMBED BUILDERS
// ============================================================================

interface ExploreEmbedData {
  leadPokemon?: {
    speciesId: number;
    nickname?: string | null;
    level: number;
    hp: number;
    maxHp: number;
  };
  canExplore: boolean;
  cooldownSeconds?: number;
}

/**
 * Build the explore screen embed
 */
export function buildExploreEmbed(data: ExploreEmbedData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("🌲 Explore the Wild")
    .setColor(EMBED_COLORS.SUCCESS);

  if (data.leadPokemon) {
    const { speciesId, nickname, level, hp, maxHp } = data.leadPokemon;
    const name = nickname || `Species #${speciesId}`;
    const hpBar = buildHpBar(hp, maxHp);
    
    embed.setDescription(
      `**Your Pokémon:**\n` +
      `🔥 ${name} (Lv. ${level})\n` +
      `HP: ${hpBar} ${hp}/${maxHp}\n\n` +
      `What would you like to do?`
    );
  } else {
    embed.setDescription(
      "⚠️ You don't have any Pokémon in your party!\n\n" +
      "Use `/starter` to choose your first Pokémon."
    );
  }

  if (!data.canExplore) {
    if (data.cooldownSeconds && data.cooldownSeconds > 0) {
      embed.addFields({
        name: "⏳ Cooldown",
        value: `You can explore again in ${data.cooldownSeconds} seconds.`,
      });
    } else if (data.leadPokemon && data.leadPokemon.hp <= 0) {
      embed.addFields({
        name: "❌ Cannot Explore",
        value: "All your Pokémon have fainted! Use the **Heal** button first.",
      });
    }
  }

  return embed;
}

/**
 * Build a simple HP bar
 */
function buildHpBar(hp: number, maxHp: number, length = 10): string {
  const filled = Math.round((hp / maxHp) * length);
  const empty = length - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

// ============================================================================
// COOLDOWN HELPERS
// ============================================================================

const WALK_COOLDOWN_MS = 30_000; // 30 seconds between walks

async function getWalkCooldown(discordId: string): Promise<Date | null> {
  const cd = await findCooldownByUserAndKind(discordId, "walk");
  return cd?.readyAt ?? null;
}

async function setWalkCooldown(discordId: string): Promise<void> {
  const user = await ensureUser(discordId);
  const readyAt = new Date(Date.now() + WALK_COOLDOWN_MS);
  const existing = await findCooldownByUserAndKind(discordId, "walk");
  
  if (existing) {
    await updateCooldownReadyAt(existing.id, readyAt);
  } else {
    await createCooldown(user.id, "walk", readyAt);
  }
}

// ============================================================================
// SCREEN HANDLERS
// ============================================================================

/**
 * Open the explore screen in user's homestead channel
 */
export async function openExploreScreen(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<void> {
  try {
    const manager = new HomesteadChannelManager(client, guildId);
    const result = await manager.getOrCreateChannel(user);
    const homesteadChannel = result.channel;

    // Get user's lead Pokémon
    const dbUser = await ensureUser(user.id);
    const party = await getPartyWithSlots(dbUser.id);
    
    let leadPokemon: ExploreEmbedData["leadPokemon"] | undefined;
    let canExplore = true;
    let cooldownSeconds: number | undefined;

    if (party && party.slots.length > 0) {
      const leadSlot = party.slots.find(s => s.slot === 1);
      if (leadSlot?.pokemon) {
        const mon = leadSlot.pokemon;
        leadPokemon = {
          speciesId: mon.speciesId,
          nickname: mon.nickname,
          level: mon.level,
          hp: mon.hp,
          maxHp: mon.maxHp,
        };
        
        // Check if all party Pokémon are fainted
        const allFainted = party.slots.every(s => !s.pokemon || s.pokemon.hp <= 0);
        if (allFainted) {
          canExplore = false;
        }
      }
    }

    // Check cooldown
    const now = Date.now();
    const readyAt = await getWalkCooldown(user.id);
    if (readyAt && readyAt.getTime() > now) {
      cooldownSeconds = Math.ceil((readyAt.getTime() - now) / 1000);
      canExplore = false;
    }

    const embed = buildExploreEmbed({ leadPokemon, canExplore, cooldownSeconds });
    const buttons = canExplore ? buildExploreButtons() : buildExploreButtonsDisabled();

    await homesteadChannel.send({ embeds: [embed], components: buttons });
    
    logger.info('HomesteadExplore', 'openExploreScreen', 'Explore screen opened', {
      userId: user.id,
      metadata: { canExplore, hasLeadPokemon: !!leadPokemon },
    });
  } catch (error) {
    logger.error('HomesteadExplore', 'openExploreScreen', 'Failed to open explore screen', {
      userId: user.id,
      metadata: { error },
    });
    throw error;
  }
}

/**
 * Handle the Walk action from explore screen
 * Spawns an encounter and sends controls to homestead channel
 */
export async function handleExploreWalk(
  interaction: ButtonInteraction
): Promise<ExploreResult> {
  const discordId = interaction.user.id;

  try {
    // Check for active encounter
    const allowed = await canStartWalk(discordId);
    if (!allowed.ok) {
      return { activeEncounter: true };
    }

    // Check cooldown
    const now = Date.now();
    const readyAt = await getWalkCooldown(discordId);
    if (readyAt && readyAt.getTime() > now) {
      const secondsRemaining = Math.ceil((readyAt.getTime() - now) / 1000);
      return { cooldown: true, secondsRemaining };
    }

    // Check party HP
    const dbUser = await ensureUser(discordId);
    const party = await getPartyWithSlots(dbUser.id);
    
    if (!party || party.slots.length === 0) {
      return { error: true, message: "You don't have any Pokémon! Use `/starter` first." };
    }

    const allFainted = party.slots.every(s => !s.pokemon || s.pokemon.hp <= 0);
    if (allFainted) {
      return { partyFainted: true };
    }

    // Spawn encounter
    const enc = await spawnEncounterForUser({ discordId });

    // Send encounter controls to homestead
    if (!interaction.guildId) {
      return { error: true, message: "Cannot start encounter outside of a server." };
    }
    
    await openEncounterDM(interaction.client, interaction.guildId, interaction.user, enc.id);

    // Set cooldown
    await setWalkCooldown(discordId);

    logger.info('HomesteadExplore', 'handleExploreWalk', 'Walk triggered encounter', {
      userId: discordId,
      metadata: { encounterId: enc.id },
    });

    return { success: true, encounterId: enc.id };
  } catch (error) {
    logger.error('HomesteadExplore', 'handleExploreWalk', 'Walk failed', {
      userId: discordId,
      metadata: { error },
    });
    return { error: true, message: "Something went wrong. Try again." };
  }
}

/**
 * Handle button interactions from explore screen
 */
export async function handleExploreButton(
  interaction: ButtonInteraction
): Promise<void> {
  const id = interaction.customId;

  if (id === "EXPLORE_WALK") {
    const result = await handleExploreWalk(interaction);

    if ('success' in result && result.success) {
      await safeReply(interaction, "🌲 A wild Pokémon appeared! Check your encounter controls above.", { ephemeral: true });
    } else if ('cooldown' in result) {
      await safeReply(interaction, `⏳ You can explore again in ${result.secondsRemaining} seconds.`, { ephemeral: true });
    } else if ('partyFainted' in result) {
      await safeReply(interaction, "❌ All your Pokémon have fainted! Use the **Heal** button first.", { ephemeral: true });
    } else if ('activeEncounter' in result) {
      await safeReply(interaction, "⚠️ You already have an active encounter! Finish it first.", { ephemeral: true });
    } else if ('noEncounter' in result) {
      await safeReply(interaction, `🍃 ${result.message}`, { ephemeral: true });
    } else if ('error' in result) {
      await safeReply(interaction, `❌ ${result.message}`, { ephemeral: true });
    }
    return;
  }

  if (id === "EXPLORE_FISH") {
    // Open fishing screen
    const { openFishingScreen } = await import("./fish.js");
    await openFishingScreen(interaction);
    return;
  }

  if (id === "EXPLORE_BACK") {
    // Return to home - trigger home screen refresh
    // For now, just acknowledge - home.ts handles the navigation
    await safeReply(interaction, "🏠 Returning to your homestead...", { ephemeral: true });
    
    // Re-open home screen
    if (interaction.guildId) {
      const { openPartyView } = await import("./home.js");
      await openPartyView(interaction, { respond: "homestead" });
    }
    return;
  }
}
