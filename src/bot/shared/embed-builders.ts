/**
 * Discord Embed Builders - Centralized Embed Factory Functions
 *
 * Purpose: Single source of truth for embed construction across all Discord interactions.
 * Achieves SINGULARITY for EmbedBuilder usage - all embed creation goes through this module.
 *
 * DOMAINS:
 * - Home: Homestead/home menu embeds
 * - Starter: Starter selection flow embeds
 * - Battle: Challenge, action, conclusion embeds
 * - Encounter: Wild Pokemon encounter embeds
 * - Profile: Trainer profile display embeds
 * - System: Error alerts, checkpoints, recovery embeds
 *
 * Usage:
 *   import { homeEmbed, starterWelcomeEmbed, battleChallengeEmbed } from '../shared/embed-builders.js';
 *   const embed = homeEmbed({ username: 'Ash', coins: 100, partyCount: 3 });
 *
 * @module src/bot/shared/embed-builders
 */

import { EmbedBuilder } from "discord.js";
import { EMBED_COLORS } from "./embed-colors.js";

// ============================================================================
// HOME DOMAIN
// ============================================================================

/**
 * Data for home menu embed
 */
export interface HomeEmbedData {
  username: string;
  coins?: number;
  nextDaily?: string;
  partyLines?: string[];
  dailyQuestValue?: string;
  battleHistoryLines?: string[];
}

/**
 * Build the main home menu embed
 * Used in: src/commands/home.js
 */
export function homeEmbed(data: HomeEmbedData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Your Pokémon Home")
    .setDescription(`Coins: ${data.coins ?? 0} • Next Daily: ${data.nextDaily ?? "Ready now"}`)
    .setColor(EMBED_COLORS.HOME);

  // Daily quest field
  const questValue = data.dailyQuestValue?.trim() || "Complete today's quest to begin your streak.";
  embed.addFields({ name: "Daily Quest", value: questValue });

  // Battle history field
  if (data.battleHistoryLines && data.battleHistoryLines.length > 0) {
    embed.addFields({ name: "Battle History", value: data.battleHistoryLines.join("\n") });
  } else {
    embed.addFields({
      name: "Battle History",
      value: "No finished battles yet. Try the Arena to start your record!",
    });
  }

  // Party field
  const partyValue = data.partyLines?.join("\n") || "No party yet. Use /starter to choose your first Pokémon.";
  embed.addFields({ name: "Party", value: partyValue });

  return embed;
}

// ============================================================================
// STARTER DOMAIN
// ============================================================================

/**
 * Data for forbidden counts display
 * Accepts Record<string, number> for flexibility with getForbiddenCounts()
 */
export type ForbiddenCounts = Record<string, number> & { total: number };

/**
 * Build the welcome embed shown when open starter selection begins
 * Used in: src/bot/homestead/open-starter-selection.ts
 */
export function starterWelcomeEmbed(counts: ForbiddenCounts): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("🎮 Welcome to Pokémon Infinite Gauntlet!")
    .setDescription(
      "Your adventure begins here in your **Homestead Channel** — your personal Pokémon hub.\n\n" +
      "Choose any Pokémon to start your journey! Simply **type the name** of the Pokémon you want as your starter."
    )
    .setColor(EMBED_COLORS.STARTER)
    .addFields(
      {
        name: "📋 Starter Rules",
        value:
          "You can choose almost any Pokémon, but these are **not allowed**:\n" +
          "• ❌ Regional starters (Bulbasaur, Charmander, etc.)\n" +
          "• ❌ Legendary Pokémon\n" +
          "• ❌ Mythical Pokémon\n" +
          "• ❌ Pseudo-legendary final forms (Tyranitar, Dragonite, etc.)\n\n" +
          "✅ Earlier evolutions like **Pupitar** or **Dratini** are allowed!",
        inline: false,
      },
      {
        name: "💡 Examples of Valid Starters",
        value:
          "Pikachu • Eevee • Riolu • Scyther • Heracross\n" +
          "Pupitar • Dratini • Ralts • Larvitar • Happiny\n" +
          "Growlithe • Vulpix • Abra • Machop • Geodude",
        inline: false,
      },
      {
        name: "📝 How to Choose",
        value: "**Type the name of your desired Pokémon** in this channel to select it as your starter.",
        inline: false,
      }
    )
    .setFooter({ text: `${counts.total} Pokémon are restricted • You have 5 minutes to choose` });
}

/**
 * Build error embed for invalid starter selection
 * Used in: src/bot/homestead/open-starter-selection.ts
 */
export function starterErrorEmbed(reason: string, attemptedName?: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("❌ Invalid Selection")
    .setDescription(reason)
    .setColor(EMBED_COLORS.ERROR)
    .addFields({
      name: "Try Again",
      value: attemptedName
        ? `"${attemptedName}" cannot be your starter. Type another Pokémon name!`
        : "Type a valid Pokémon name to continue.",
      inline: false,
    })
    .setFooter({ text: "Type a Pokémon name or wait for timeout" });
}

/**
 * Build confirmation embed when starter is successfully chosen
 * Used in: src/bot/homestead/open-starter-selection.ts
 */
export function starterConfirmationEmbed(
  speciesName: string,
  spriteUrl?: string | null
): EmbedBuilder {
  const capitalizedName = speciesName.charAt(0).toUpperCase() + speciesName.slice(1);

  const embed = new EmbedBuilder()
    .setTitle(`🎉 You chose ${capitalizedName}!`)
    .setDescription(
      `**${capitalizedName}** is now your official starter Pokémon!\n\n` +
      "Your adventure in the Infinite Gauntlet begins now."
    )
    .setColor(EMBED_COLORS.SUCCESS)
    .addFields(
      {
        name: "📊 Your Starter",
        value: `• **Species:** ${capitalizedName}\n• **Level:** 5\n• **Added to Party:** Slot 1`,
        inline: true,
      },
      {
        name: "🎯 Next Steps",
        value:
          "• Visit **public field channels** to explore\n" +
          "• Use `/walk` to encounter wild Pokémon\n" +
          "• Challenge others to battles!",
        inline: true,
      }
    )
    .setFooter({ text: "Welcome to Pokémon Infinite Gauntlet!" });

  if (spriteUrl) {
    embed.setThumbnail(spriteUrl);
  }

  return embed;
}

/**
 * Build the rules/how-to-play embed shown after starter confirmation
 * Used in: src/bot/homestead/open-starter-selection.ts
 */
export function starterRulesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("📖 How to Play")
    .setDescription(
      "Your **Homestead Channel** is your personal Pokémon hub. " +
      "Think of it as your in-game home or Main Menu."
    )
    .setColor(EMBED_COLORS.INFO)
    .addFields(
      {
        name: "🏠 Homestead (This Channel)",
        value:
          "• **Pokémon Center** — Heal your party instantly\n" +
          "• **Party/Storage** — Manage your team\n" +
          "• **Inventory** — Use items\n" +
          "• **Pokédex** — Track discoveries\n" +
          "• **Settings** — Customize your experience",
        inline: false,
      },
      {
        name: "🌍 Public Field Channels",
        value:
          "• Use `/walk`, `/search`, `/fish` to find wild Pokémon\n" +
          "• Different areas have different encounters\n" +
          "• Time & weather affect spawns!",
        inline: false,
      },
      {
        name: "⚔️ Battles",
        value:
          "• Challenge players from your Homestead\n" +
          "• Battles happen in public **Arena Threads**\n" +
          "• Spectators can watch live!",
        inline: false,
      }
    )
    .setFooter({ text: "Use the buttons below to navigate your Homestead" });
}

/**
 * Build the classic 3-starter selection embed
 * Used in: src/bot/homestead/starters.ts
 */
export interface StarterOption {
  speciesId: number;
  name: string;
  level?: number;
  description?: string;
}

export function starterSelectEmbed(starters: StarterOption[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Choose your starter")
    .setDescription("Pick one of the classic starters. This is a one-time choice.")
    .setColor(EMBED_COLORS.STARTER);

  embed.addFields(
    starters.map((s) => ({
      name: s.name,
      value: s.description || `Level ${s.level ?? 5} • Classic starter`,
      inline: true,
    }))
  );

  return embed;
}

// ============================================================================
// BATTLE DOMAIN
// ============================================================================

/**
 * Build battle challenge embed
 * Used in: src/bot/battle/challenge.ts
 */
export interface ChallengeEmbedData {
  challengerTag: string;
  challengerMention: string;
}

export function battleChallengeEmbed(data: ChallengeEmbedData): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Battle Challenge")
    .setDescription(`${data.challengerMention} has challenged you to a battle.`)
    .setColor(EMBED_COLORS.BATTLE)
    .addFields(
      { name: "Challenger", value: data.challengerTag, inline: true },
      { name: "What next?", value: "Accept to open an Arena thread or decline politely.", inline: false }
    );
}

/**
 * Build battle action prompt embed
 * Used in: src/bot/battle/actions.ts
 */
export function battleActionEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Your Move")
    .setDescription("Choose an action for this turn.")
    .setColor(EMBED_COLORS.INFO);
}

// ============================================================================
// ENCOUNTER DOMAIN
// ============================================================================

/**
 * Data for wild encounter embed
 */
export interface EncounterEmbedData {
  speciesId: number;
  level: number;
  speciesName?: string;
  spriteUrl?: string | null;
  isShiny?: boolean;
}

/**
 * Build wild encounter embed
 * Used in: src/bot/wilds/controls.ts
 */
export function encounterEmbed(data: EncounterEmbedData): EmbedBuilder {
  const speciesLabel = data.speciesName || `Species #${data.speciesId}`;
  const shinyPrefix = data.isShiny ? "✨ " : "";
  
  const embed = new EmbedBuilder()
    .setTitle(`${shinyPrefix}A wild Pokémon appeared!`)
    .setDescription(`${speciesLabel} • Lv ${data.level}`)
    .setColor(data.isShiny ? EMBED_COLORS.WARNING : EMBED_COLORS.SUCCESS);

  if (data.spriteUrl) {
    embed.setThumbnail(data.spriteUrl);
  }

  return embed;
}

// ============================================================================
// SYSTEM/ALERT DOMAIN
// ============================================================================

/**
 * Build critical error alert embed (for DMs to admin)
 * Used in: src/services/monitoring/error-alerting-service.ts
 */
export interface CriticalAlertData {
  errorName: string;
  errorMessage: string;
  category: string;
  timestamp: string;
  fingerprint: string;
  sourceLocation?: { file: string; line: number };
  callChain?: string[];
}

export function criticalAlertEmbed(data: CriticalAlertData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.CRITICAL)
    .setTitle("🚨 CRITICAL ERROR")
    .setDescription(`**${data.errorName}**: ${data.errorMessage.substring(0, 200)}`)
    .addFields(
      { name: "📂 Category", value: data.category, inline: true },
      { name: "⏰ Time", value: data.timestamp, inline: true },
      { name: "🔑 Fingerprint", value: `\`${data.fingerprint.substring(0, 12)}...\``, inline: true }
    )
    .setTimestamp();

  if (data.sourceLocation) {
    embed.addFields({
      name: "📍 Location",
      value: `\`${data.sourceLocation.file}:${data.sourceLocation.line}\``,
      inline: false,
    });
  }

  if (data.callChain && data.callChain.length > 0) {
    embed.addFields({
      name: "🔗 Call Chain",
      value: `\`${data.callChain.slice(0, 3).join(" → ")}\``,
      inline: false,
    });
  }

  embed.setFooter({ text: "Use /ops errors detail <fingerprint> for full details" });

  return embed;
}

/**
 * Build batched HIGH severity alert embed
 * Used in: src/services/monitoring/error-alerting-service.ts
 */
export interface BatchedAlertItem {
  errorName: string;
  errorMessage: string;
  category: string;
  fingerprint: string;
}

export function batchedAlertEmbed(items: BatchedAlertItem[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLORS.WARNING)
    .setTitle(`⚠️ HIGH Severity Errors (${items.length})`)
    .setDescription("The following errors occurred in the last 5 minutes:")
    .setTimestamp();

  for (const item of items.slice(0, 10)) {
    embed.addFields({
      name: `${item.errorName} (${item.category})`,
      value: `${item.errorMessage.substring(0, 100)}...\n\`${item.fingerprint.substring(0, 8)}...\``,
      inline: false,
    });
  }

  if (items.length > 10) {
    embed.addFields({
      name: "...",
      value: `And ${items.length - 10} more errors`,
      inline: false,
    });
  }

  embed.setFooter({ text: "Use /ops errors list severity:HIGH for full list" });

  return embed;
}

/**
 * Recovery status for checkpoint embed
 */
export type RecoveryStatus = "healthy" | "degraded" | "critical";

/**
 * Build recovery complete embed
 * Note: Originally designed for player-checkpoint.ts (removed in dead code cleanup 2025-12)
 * Available for future recovery/diagnostic embed use cases
 */
export interface RecoveryEmbedData {
  overallStatus: RecoveryStatus;
  checkpointAge?: string; // e.g., "5m ago", "2h ago"
  pokemonCount?: number;
  diagnosticsPassed: number;
  diagnosticsTotal: number;
  healingAttempted?: boolean;
  healingSucceeded?: boolean;
}

export function recoveryCompleteEmbed(data: RecoveryEmbedData): EmbedBuilder {
  const statusEmoji: Record<RecoveryStatus, string> = {
    healthy: "✅",
    degraded: "⚠️",
    critical: "❌",
  };
  
  const statusColor: Record<RecoveryStatus, number> = {
    healthy: 0x00ff00,
    degraded: 0xffff00,
    critical: 0xff0000,
  };

  const embed = new EmbedBuilder()
    .setTitle("🔄 Game State Recovery Complete")
    .setColor(statusColor[data.overallStatus])
    .setTimestamp();

  // Status summary
  const statusLabel = data.overallStatus.charAt(0).toUpperCase() + data.overallStatus.slice(1);
  embed.addFields({
    name: "Recovery Status",
    value: `${statusEmoji[data.overallStatus]} ${statusLabel}`,
    inline: true,
  });

  // Checkpoint info
  if (data.checkpointAge) {
    embed.addFields({
      name: "Last Checkpoint",
      value: data.checkpointAge,
      inline: true,
    });
  }

  if (data.pokemonCount !== undefined) {
    embed.addFields({
      name: "Pokémon Saved",
      value: `${data.pokemonCount} Pokémon`,
      inline: true,
    });
  }

  // Diagnostics
  embed.addFields({
    name: "Diagnostics",
    value: `${data.diagnosticsPassed}/${data.diagnosticsTotal} checks passed`,
    inline: true,
  });

  return embed;
}

// ============================================================================
// GENERIC/UTILITY EMBEDS
// ============================================================================

/**
 * Build a generic error embed
 */
export function errorEmbed(title: string, message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setDescription(message)
    .setColor(EMBED_COLORS.ERROR)
    .setTimestamp();
}

/**
 * Build a generic success embed
 */
export function successEmbed(title: string, message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setDescription(message)
    .setColor(EMBED_COLORS.SUCCESS)
    .setTimestamp();
}

/**
 * Build a generic info embed
 */
export function infoEmbed(title: string, message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`ℹ️ ${title}`)
    .setDescription(message)
    .setColor(EMBED_COLORS.INFO)
    .setTimestamp();
}

/**
 * Build a generic warning embed
 */
export function warningEmbed(title: string, message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`⚠️ ${title}`)
    .setDescription(message)
    .setColor(EMBED_COLORS.WARNING)
    .setTimestamp();
}
