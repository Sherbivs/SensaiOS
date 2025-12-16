/**
 * Command Type Definitions
 * 
 * Shared types for Discord slash commands used across the bot.
 * 
 * @module commands/types
 * @since Phase 6.2 (2025-12-16)
 */

import type { 
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder
} from 'discord.js';

/**
 * Any valid slash command builder type
 */
export type SlashCommandData = 
  | SlashCommandBuilder 
  | SlashCommandSubcommandsOnlyBuilder 
  | SlashCommandOptionsOnlyBuilder
  | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;

/**
 * Command execution function signature
 */
export type CommandExecute = (
  interaction: ChatInputCommandInteraction
) => Promise<void>;

/**
 * Autocomplete handler function signature
 */
export type AutocompleteHandler = (
  interaction: AutocompleteInteraction
) => Promise<void>;

/**
 * Standard command module structure
 * All command files should export this shape.
 */
export interface Command {
  /** SlashCommandBuilder data for registration */
  data: SlashCommandData;
  
  /** Cooldown in milliseconds (default: 1000) */
  cooldownMs?: number;
  
  /** Command execution handler */
  execute: CommandExecute;
  
  /** Optional autocomplete handler for commands with autocomplete options */
  autocomplete?: AutocompleteHandler;
}

/**
 * Default cooldown for commands (1 second)
 */
export const DEFAULT_COOLDOWN_MS = 1000;
