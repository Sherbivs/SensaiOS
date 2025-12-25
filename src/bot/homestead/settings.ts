/**
 * Settings Screen — User Preferences
 * 
 * Implements the player settings screen per Game Design Bible § 6.
 * Players can customize their experience with various toggles and options.
 * 
 * Button IDs:
 * - SETTINGS_TOGGLE_{setting} — Toggle a boolean setting
 * - SETTINGS_BACK — Return to home screen
 * 
 * @module homestead/settings
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

interface UserSettings {
  // Notification preferences
  battleNotifications: boolean;
  encounterNotifications: boolean;
  dailyReminder: boolean;
  
  // Display preferences
  compactMode: boolean;
  showShinySparkles: boolean;
  
  // Gameplay preferences
  confirmCatch: boolean;
  autoHeal: boolean;
}

interface SettingsData {
  username: string;
  settings: UserSettings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS_TOGGLE_PREFIX = "SETTINGS_TOGGLE_";

// Default settings for new users
const DEFAULT_SETTINGS: UserSettings = {
  battleNotifications: true,
  encounterNotifications: true,
  dailyReminder: true,
  compactMode: false,
  showShinySparkles: true,
  confirmCatch: true,
  autoHeal: false,
};

// Setting metadata for display
const SETTING_INFO: Record<keyof UserSettings, { label: string; emoji: string; description: string }> = {
  battleNotifications: {
    label: "Battle Notifications",
    emoji: "⚔️",
    description: "Get notified when someone challenges you",
  },
  encounterNotifications: {
    label: "Encounter Alerts",
    emoji: "🌲",
    description: "Get notified about special encounters",
  },
  dailyReminder: {
    label: "Daily Reminder",
    emoji: "📅",
    description: "Remind you to claim daily rewards",
  },
  compactMode: {
    label: "Compact Mode",
    emoji: "📦",
    description: "Reduce message sizes for mobile",
  },
  showShinySparkles: {
    label: "Shiny Sparkles",
    emoji: "✨",
    description: "Show sparkle effects on shiny Pokémon",
  },
  confirmCatch: {
    label: "Confirm Catch",
    emoji: "⚪",
    description: "Ask before using Poké Balls",
  },
  autoHeal: {
    label: "Auto-Heal",
    emoji: "💊",
    description: "Automatically heal after battles",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// UI Builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the settings embed showing all options
 */
function buildSettingsEmbed(data: SettingsData): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Settings")
    .setColor(EMBED_COLORS.INFO)
    .setDescription("Customize your Pokémon adventure experience.\nClick a button to toggle a setting.");

  // Group settings by category
  const notificationSettings = ["battleNotifications", "encounterNotifications", "dailyReminder"] as const;
  const displaySettings = ["compactMode", "showShinySparkles"] as const;
  const gameplaySettings = ["confirmCatch", "autoHeal"] as const;

  // Notifications section
  const notifLines = notificationSettings.map(key => {
    const info = SETTING_INFO[key];
    const value = data.settings[key];
    const status = value ? "🟢 ON" : "🔴 OFF";
    return `${info.emoji} **${info.label}**: ${status}`;
  });
  embed.addFields({
    name: "🔔 Notifications",
    value: notifLines.join("\n"),
    inline: false,
  });

  // Display section
  const displayLines = displaySettings.map(key => {
    const info = SETTING_INFO[key];
    const value = data.settings[key];
    const status = value ? "🟢 ON" : "🔴 OFF";
    return `${info.emoji} **${info.label}**: ${status}`;
  });
  embed.addFields({
    name: "🖥️ Display",
    value: displayLines.join("\n"),
    inline: false,
  });

  // Gameplay section
  const gameplayLines = gameplaySettings.map(key => {
    const info = SETTING_INFO[key];
    const value = data.settings[key];
    const status = value ? "🟢 ON" : "🔴 OFF";
    return `${info.emoji} **${info.label}**: ${status}`;
  });
  embed.addFields({
    name: "🎮 Gameplay",
    value: gameplayLines.join("\n"),
    inline: false,
  });

  embed.setFooter({ text: "Settings are saved automatically" });

  return embed;
}

/**
 * Build toggle buttons for settings
 */
function buildSettingsButtons(settings: UserSettings): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const settingKeys = Object.keys(SETTING_INFO) as (keyof UserSettings)[];
  
  let currentRow = new ActionRowBuilder<ButtonBuilder>();
  let buttonsInRow = 0;

  for (const key of settingKeys) {
    const info = SETTING_INFO[key];
    const isOn = settings[key];
    
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${SETTINGS_TOGGLE_PREFIX}${key}`)
        .setLabel(`${info.emoji} ${info.label}`)
        .setStyle(isOn ? ButtonStyle.Success : ButtonStyle.Secondary)
    );
    
    buttonsInRow++;
    
    // Max 4 per row
    if (buttonsInRow >= 4) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
      buttonsInRow = 0;
    }
  }

  // Add remaining buttons
  if (buttonsInRow > 0) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Build navigation row with Back button
 */
function buildSettingsNavRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("SETTINGS_BACK")
      .setLabel("🔙 Back to Home")
      .setStyle(ButtonStyle.Secondary)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load user settings from database
 * Uses User.settingsJson field to store preferences
 */
async function loadSettings(discordId: string): Promise<SettingsData | null> {
  const user = await prisma.user.findUnique({
    where: { discordId },
  });

  if (!user) return null;

  // Parse settings from database or use defaults
  let settings: UserSettings = { ...DEFAULT_SETTINGS };
  
  if (user.settingsJson) {
    // Parse the settings JSON from the user record
    const stored = user.settingsJson as Record<string, boolean> | null;
    if (stored) {
      settings = {
        battleNotifications: stored.battleNotifications ?? DEFAULT_SETTINGS.battleNotifications,
        encounterNotifications: stored.encounterNotifications ?? DEFAULT_SETTINGS.encounterNotifications,
        dailyReminder: stored.dailyReminder ?? DEFAULT_SETTINGS.dailyReminder,
        compactMode: stored.compactMode ?? DEFAULT_SETTINGS.compactMode,
        showShinySparkles: stored.showShinySparkles ?? DEFAULT_SETTINGS.showShinySparkles,
        confirmCatch: stored.confirmCatch ?? DEFAULT_SETTINGS.confirmCatch,
        autoHeal: stored.autoHeal ?? DEFAULT_SETTINGS.autoHeal,
      };
    }
  }

  return {
    username: discordId,
    settings,
  };
}

/**
 * Save a single setting toggle
 */
async function saveSetting(discordId: string, key: keyof UserSettings, value: boolean): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { discordId },
  });

  if (!user) return false;

  // Get current settings or use defaults
  const currentSettings = (user.settingsJson as Record<string, boolean>) || {};
  
  const newSettings = {
    ...DEFAULT_SETTINGS,
    ...currentSettings,
    [key]: value,
  };

  // Update user's settings JSON
  await prisma.user.update({
    where: { discordId },
    data: { settingsJson: newSettings },
  });

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the settings screen in user's homestead channel
 */
export async function openSettingsScreen(
  client: Client,
  guildId: string,
  user: DiscordUser
): Promise<void> {
  const manager = new HomesteadChannelManager(client, guildId);
  const { channel } = await manager.getOrCreateChannel(user);

  if (!channel) {
    return;
  }

  const data = await loadSettings(user.id);
  if (!data) {
    await channel.send({
      content: "❌ Could not load your settings. Please try again.",
    });
    return;
  }

  const embed = buildSettingsEmbed(data);
  const toggleButtons = buildSettingsButtons(data.settings);
  const navRow = buildSettingsNavRow();

  await channel.send({
    embeds: [embed],
    components: [...toggleButtons, navRow],
  });
}

/**
 * Handle toggling a setting
 */
async function handleToggle(interaction: ButtonInteraction, settingKey: string): Promise<void> {
  // Validate setting key
  if (!(settingKey in SETTING_INFO)) {
    await interaction.reply({ 
      content: "❌ Unknown setting.", 
      ephemeral: true 
    });
    return;
  }

  const key = settingKey as keyof UserSettings;
  
  // Load current settings
  const data = await loadSettings(interaction.user.id);
  if (!data) {
    await interaction.reply({ 
      content: "❌ Could not load settings.", 
      ephemeral: true 
    });
    return;
  }

  // Toggle the value
  const newValue = !data.settings[key];
  
  // Save to database
  const saved = await saveSetting(interaction.user.id, key, newValue);
  if (!saved) {
    await interaction.reply({ 
      content: "❌ Could not save setting.", 
      ephemeral: true 
    });
    return;
  }

  // Update local data
  data.settings[key] = newValue;

  // Rebuild and update the message
  const embed = buildSettingsEmbed(data);
  const toggleButtons = buildSettingsButtons(data.settings);
  const navRow = buildSettingsNavRow();

  const info = SETTING_INFO[key];
  const status = newValue ? "🟢 ON" : "🔴 OFF";
  embed.setDescription(
    `${info.emoji} **${info.label}** is now ${status}\n\n` +
    "Customize your Pokémon adventure experience.\nClick a button to toggle a setting."
  );

  await interaction.update({
    embeds: [embed],
    components: [...toggleButtons, navRow],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main button handler for settings screen
 */
export async function handleSettingsButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  try {
    // Toggle setting
    if (customId.startsWith(SETTINGS_TOGGLE_PREFIX)) {
      const settingKey = customId.replace(SETTINGS_TOGGLE_PREFIX, "");
      await handleToggle(interaction, settingKey);
      return;
    }

    // Back button is handled by main index.ts router (SETTINGS_BACK → HOME)
    
  } catch (error) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "❌ An error occurred. Please try again.",
        ephemeral: true,
      });
    }
  }
}
