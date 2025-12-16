/**
 * Command Type Definitions
 * 
 * Shared types for Discord slash commands used across the bot.
 * 
 * @module commands/types
 * @since Phase 6.2 (2025-12-16)
 */

import type { 
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder 
} from 'discord.js';

/**
 * Command execution function signature
 */
export type CommandExecute = (
  interaction: ChatInputCommandInteraction
) => Promise<void>;

/**
 * Standard command module structure
 * All command files should export this shape.
 */
export interface Command {
  /** SlashCommandBuilder data for registration */
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  
  /** Cooldown in milliseconds (default: 1000) */
  cooldownMs?: number;
  
  /** Command execution handler */
  execute: CommandExecute;
}

/**
 * Default cooldown for commands (1 second)
 */
export const DEFAULT_COOLDOWN_MS = 1000;
