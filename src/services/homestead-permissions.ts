/**
 * Homestead Channel Permission Constants
 * 
 * Centralized permission configurations for homestead channels.
 * Used by homestead-manager.ts and homestead-verification.ts.
 * 
 * @module services/homestead-permissions
 */

import { PermissionFlagsBits } from 'discord.js';

/**
 * Base permissions granted to channel owners (users).
 * Allows: viewing, sending, reading history, attachments, embeds
 */
export const USER_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
] as const;

/**
 * Permissions granted to the bot for managing homestead channels.
 * Includes ManageMessages for cleanup/moderation.
 */
export const BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
] as const;

/**
 * Permissions denied to @everyone for private channels.
 */
export const EVERYONE_DENY = [
  PermissionFlagsBits.ViewChannel,
] as const;

/**
 * Type for permission arrays (readonly bigint arrays)
 */
export type PermissionArray = readonly bigint[];
