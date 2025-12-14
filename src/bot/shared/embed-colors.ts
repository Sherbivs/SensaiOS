/**
 * Discord Embed Colors - Centralized Color Constants
 *
 * Purpose: Single source of truth for embed colors across all Discord interactions.
 * Eliminates scattered hex codes and ensures visual consistency.
 *
 * Usage:
 *   import { EMBED_COLORS } from '../shared/embed-colors.js';
 *   new EmbedBuilder().setColor(EMBED_COLORS.SUCCESS)
 *
 * @module src/bot/shared/embed-colors
 */

/**
 * Standardized embed colors for Discord interactions
 *
 * Color semantics follow Material Design principles:
 * - SUCCESS (Green) — Successful operations, catches, heals
 * - WARNING (Orange) — Caution states, low HP, rate limits
 * - ERROR (Red) — Failures, errors, blocked actions
 * - INFO (Blue) — Informational, neutral status updates
 * - BATTLE (Amber) — Battle-related embeds
 * - PRIMARY (Purple) — Brand/highlight color
 * - NEUTRAL (Gray) — Disabled states, inactive
 */
export const EMBED_COLORS = {
  /** Green - Successful operations (0x4CAF50 Material Green 500) */
  SUCCESS: 0x4caf50,

  /** Orange - Warning/caution states (0xFFB74D Material Orange 300) */
  WARNING: 0xffb74d,

  /** Red - Error/failure states (0xFF5252 Material Red A200) */
  ERROR: 0xff5252,

  /** Blue - Informational messages (0x2196F3 Material Blue 500) */
  INFO: 0x2196f3,

  /** Amber - Battle interactions (0xFF9800 Material Orange 500) */
  BATTLE: 0xff9800,

  /** Purple - Primary/brand color (0x9C27B0 Material Purple 500) */
  PRIMARY: 0x9c27b0,

  /** Gray - Neutral/disabled states (0x9E9E9E Material Grey 500) */
  NEUTRAL: 0x9e9e9e,

  /** Dark Red - Critical errors (0xFF0000 Pure Red) */
  CRITICAL: 0xff0000,

  /** Light Green - Starter selection (0x00C853 Material Green A400) */
  STARTER: 0x00c853,
} as const;

/**
 * Type for embed color keys
 */
export type EmbedColorKey = keyof typeof EMBED_COLORS;

/**
 * Type for embed color values
 */
export type EmbedColorValue = (typeof EMBED_COLORS)[EmbedColorKey];
