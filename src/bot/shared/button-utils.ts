/**
 * Discord Button Utilities
 *
 * Centralized button builder factories for consistent UI patterns.
 * Consolidates 20+ scattered ButtonBuilder instances.
 *
 * @module bot/shared/button-utils
 * @task Phase 2.9 Code Consolidation
 */

import { ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";

// =============================================================================
// Button Style Constants
// =============================================================================

/**
 * Standardized button styles for consistent UX
 */
export const BUTTON_STYLES = {
  /** Primary action (Throw, Move, Heal, Confirm) */
  PRIMARY: ButtonStyle.Primary,
  /** Secondary/alternative action (Swap, Switch, Box) */
  SECONDARY: ButtonStyle.Secondary,
  /** Destructive/exit action (Run, Forfeit, Cancel, Decline) */
  DANGER: ButtonStyle.Danger,
  /** Active/selected state in navigation */
  ACTIVE: ButtonStyle.Success,
} as const;

// =============================================================================
// Button Factory Functions
// =============================================================================

/**
 * Create a primary action button
 * Used for main actions: Throw Poké Ball, Move, Heal, Confirm
 */
export function primaryButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(BUTTON_STYLES.PRIMARY);
}

/**
 * Create a secondary action button
 * Used for alternatives: Swap Lead, Switch, Box
 */
export function secondaryButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(BUTTON_STYLES.SECONDARY);
}

/**
 * Create a danger/exit action button
 * Used for destructive actions: Run, Forfeit, Cancel, Decline
 */
export function dangerButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(BUTTON_STYLES.DANGER);
}

/**
 * Create an active/selected state button (disabled)
 * Used for navigation to show current view
 */
export function activeButton(customId: string, label: string): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(BUTTON_STYLES.ACTIVE)
    .setDisabled(true);
}

/**
 * Create a navigation button that changes style based on active state
 */
export function navButton(
  customId: string,
  label: string,
  isActive: boolean
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(isActive ? BUTTON_STYLES.ACTIVE : BUTTON_STYLES.SECONDARY)
    .setDisabled(isActive);
}

// =============================================================================
// Common Button Row Patterns
// =============================================================================

/**
 * Create a confirm/cancel button row
 * Common pattern for dialogs and confirmations
 */
export function confirmCancelRow(
  confirmId: string,
  cancelId: string,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel"
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    primaryButton(confirmId, confirmLabel),
    dangerButton(cancelId, cancelLabel)
  );
}

/**
 * Create an accept/decline button row
 * Common pattern for challenges and invitations
 */
export function acceptDeclineRow(
  acceptId: string,
  declineId: string,
  acceptLabel = "Accept",
  declineLabel = "Decline"
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    primaryButton(acceptId, acceptLabel),
    dangerButton(declineId, declineLabel)
  );
}

/**
 * Create a three-action button row (primary, secondary, danger)
 * Common pattern: Move/Switch/Forfeit, Throw/Swap/Run
 */
export function tripleActionRow(
  primaryId: string,
  primaryLabel: string,
  secondaryId: string,
  secondaryLabel: string,
  dangerId: string,
  dangerLabel: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    primaryButton(primaryId, primaryLabel),
    secondaryButton(secondaryId, secondaryLabel),
    dangerButton(dangerId, dangerLabel)
  );
}

// =============================================================================
// Domain-Specific Button Builders
// =============================================================================

/**
 * Build encounter action buttons
 * @param encounterId - The encounter ID to embed in custom IDs
 */
export function encounterButtons(
  encounterId: string
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    tripleActionRow(
      `ENCOUNTER_THROW_${encounterId}`,
      "Throw Poké Ball",
      `ENCOUNTER_SWAP_${encounterId}`,
      "Swap Lead",
      `ENCOUNTER_RUN_${encounterId}`,
      "Run"
    ),
  ];
}

/**
 * Build battle action buttons
 * @param battleId - The battle ID to embed in custom IDs
 * @param movePrefix - Prefix for move button (default: "BATTLE_MOVE_")
 * @param switchPrefix - Prefix for switch button (default: "BATTLE_SWITCH_")
 * @param forfeitPrefix - Prefix for forfeit button (default: "BATTLE_FORFEIT_")
 */
export function battleActionButtons(
  battleId: string,
  movePrefix = "BATTLE_MOVE_",
  switchPrefix = "BATTLE_SWITCH_",
  forfeitPrefix = "BATTLE_FORFEIT_"
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    tripleActionRow(
      `${movePrefix}${battleId}`,
      "Move",
      `${switchPrefix}${battleId}`,
      "Switch",
      `${forfeitPrefix}${battleId}`,
      "Forfeit"
    ),
  ];
}

/**
 * Build challenge accept/decline buttons
 * @param challengeId - The challenge ID to embed in custom IDs
 */
export function challengeButtons(
  challengeId: string
): ActionRowBuilder<ButtonBuilder> {
  return acceptDeclineRow(
    `CHALLENGE_ACCEPT_${challengeId}`,
    `CHALLENGE_DECLINE_${challengeId}`,
    "Accept",
    "Decline"
  );
}

/**
 * Build home navigation buttons
 * @param activeView - Currently active view key
 */
export function homeNavButtons(
  activeView: "party" | "box" | "profile"
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    navButton("HOME_PARTY", "Party", activeView === "party"),
    navButton("HOME_BOX", "Box", activeView === "box"),
    navButton("HOME_PROFILE", "Profile", activeView === "profile")
  );
}

/**
 * Build a single heal button row
 */
export function healButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    primaryButton("HOME_HEAL", "Heal")
  );
}

/**
 * Build pagination buttons (prev/next)
 * @param prevId - Custom ID for previous button
 * @param nextId - Custom ID for next button
 * @param hasPrev - Whether previous page exists
 * @param hasNext - Whether next page exists
 */
export function paginationRow(
  prevId: string,
  nextId: string,
  hasPrev: boolean,
  hasNext: boolean
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(prevId)
      .setLabel("Prev")
      .setStyle(BUTTON_STYLES.SECONDARY)
      .setDisabled(!hasPrev),
    new ButtonBuilder()
      .setCustomId(nextId)
      .setLabel("Next")
      .setStyle(BUTTON_STYLES.SECONDARY)
      .setDisabled(!hasNext)
  );
}
/**
 * Build starter selection buttons
 * @param starterIds - Array of starter Pokemon IDs
 * @param prefix - Custom ID prefix (default: "STARTER_SELECT_")
 */
export function starterButtons(
  starterIds: string[],
  prefix = "STARTER_SELECT_"
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const id of starterIds) {
    row.addComponents(primaryButton(`${prefix}${id}`, `Choose #${id}`));
  }
  return row;
}
