/**
 * Response Helpers — Standardized Interaction Reply Patterns
 * 
 * Provides type-safe, consistent response helpers for Discord interactions.
 * Consolidates the 55+ inline `interaction.reply()` patterns into reusable
 * functions with proper error handling.
 * 
 * @module bot/shared/response-helpers
 * @since 2025-12-15 (Singularity Sprint 3)
 */

import type {
  RepliableInteraction,
  InteractionReplyOptions,
  MessagePayload,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Any interaction that can be replied to (Button, Command, SelectMenu, etc.)
 */
type AnyRepliableInteraction = RepliableInteraction;

/**
 * Options for ephemeral text replies
 */
export interface EphemeralOptions {
  /** Whether the reply should be ephemeral (default: true) */
  ephemeral?: boolean;
}

/**
 * Options for embed-based replies
 */
export interface EmbedReplyOptions {
  /** Whether the reply should be ephemeral (default: false) */
  ephemeral?: boolean;
  /** Whether to fetch the reply message */
  fetchReply?: boolean;
}

/**
 * Result of a safe reply operation
 */
export interface SafeReplyResult {
  success: boolean;
  replied: boolean;
  edited: boolean;
  error?: Error;
}

// ============================================================================
// Simple Ephemeral Replies
// ============================================================================

/**
 * Reply with an ephemeral text message.
 * Most common pattern: `interaction.reply({ content: "...", ephemeral: true })`
 * 
 * @param interaction - The interaction to reply to
 * @param content - Text content of the reply
 * @param options - Optional override for ephemeral (default: true)
 * 
 * @example
 * await replyEphemeral(interaction, "You cannot challenge yourself.");
 * await replyEphemeral(interaction, "Admin only.");
 */
export async function replyEphemeral(
  interaction: AnyRepliableInteraction,
  content: string,
  options?: EphemeralOptions
): Promise<void> {
  await interaction.reply({
    content,
    ephemeral: options?.ephemeral ?? true,
  });
}

/**
 * Reply with an ephemeral error message.
 * Semantic alias for error-specific responses.
 * 
 * @param interaction - The interaction to reply to
 * @param message - Error message text
 * 
 * @example
 * await replyError(interaction, "This battle no longer exists.");
 * await replyError(interaction, "Cannot throw a ball: no balls remaining.");
 */
export async function replyError(
  interaction: AnyRepliableInteraction,
  message: string
): Promise<void> {
  await replyEphemeral(interaction, message, { ephemeral: true });
}

/**
 * Reply with an ephemeral success message.
 * Semantic alias for success-specific responses.
 * 
 * @param interaction - The interaction to reply to
 * @param message - Success message text
 * 
 * @example
 * await replySuccess(interaction, "I sent your Starters to your homestead channel.");
 */
export async function replySuccess(
  interaction: AnyRepliableInteraction,
  message: string
): Promise<void> {
  await replyEphemeral(interaction, message, { ephemeral: true });
}

/**
 * Reply with an ephemeral info message.
 * Semantic alias for informational responses.
 * 
 * @param interaction - The interaction to reply to
 * @param message - Info message text
 * 
 * @example
 * await replyInfo(interaction, "You can /walk again in 30s.");
 */
export async function replyInfo(
  interaction: AnyRepliableInteraction,
  message: string
): Promise<void> {
  await replyEphemeral(interaction, message, { ephemeral: true });
}

// ============================================================================
// Complex Replies with Embeds/Components
// ============================================================================

/**
 * Reply with an embed and optional components (public by default).
 * 
 * @param interaction - The interaction to reply to
 * @param embed - The embed builder
 * @param components - Optional action row components
 * @param options - Reply options (ephemeral, fetchReply)
 * 
 * @example
 * await replyWithEmbed(interaction, battleEmbed, [actionRow]);
 * await replyWithEmbed(interaction, profileEmbed, [], { ephemeral: true });
 */
export async function replyWithEmbed(
  interaction: AnyRepliableInteraction,
  embed: EmbedBuilder,
  components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[],
  options?: EmbedReplyOptions
): Promise<ReturnType<typeof interaction.reply>> {
  return interaction.reply({
    embeds: [embed],
    components: components ?? [],
    ephemeral: options?.ephemeral ?? false,
    fetchReply: options?.fetchReply ?? false,
  });
}

/**
 * Reply with multiple embeds and optional components.
 * 
 * @param interaction - The interaction to reply to
 * @param embeds - Array of embed builders
 * @param components - Optional action row components
 * @param options - Reply options
 */
export async function replyWithEmbeds(
  interaction: AnyRepliableInteraction,
  embeds: EmbedBuilder[],
  components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[],
  options?: EmbedReplyOptions
): Promise<ReturnType<typeof interaction.reply>> {
  return interaction.reply({
    embeds,
    components: components ?? [],
    ephemeral: options?.ephemeral ?? false,
    fetchReply: options?.fetchReply ?? false,
  });
}

// ============================================================================
// Edit/FollowUp Helpers
// ============================================================================

/**
 * Edit the original reply with new content.
 * 
 * @param interaction - The interaction to edit
 * @param content - New text content
 * @param components - Optional new components (empty array clears)
 * 
 * @example
 * await editReply(interaction, "Swap timed out.", []);
 */
export async function editReply(
  interaction: AnyRepliableInteraction,
  content: string,
  components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]
): Promise<ReturnType<typeof interaction.editReply>> {
  return interaction.editReply({
    content,
    components: components ?? undefined,
  });
}

/**
 * Edit the original reply with an embed.
 * 
 * @param interaction - The interaction to edit
 * @param embed - The new embed
 * @param components - Optional new components
 */
export async function editReplyWithEmbed(
  interaction: AnyRepliableInteraction,
  embed: EmbedBuilder,
  components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]
): Promise<ReturnType<typeof interaction.editReply>> {
  return interaction.editReply({
    embeds: [embed],
    components: components ?? [],
  });
}

/**
 * Follow up with an ephemeral text message.
 * 
 * @param interaction - The interaction to follow up on
 * @param content - Text content
 * @param options - Optional ephemeral override
 */
export async function followUpEphemeral(
  interaction: AnyRepliableInteraction,
  content: string,
  options?: EphemeralOptions
): Promise<ReturnType<typeof interaction.followUp>> {
  return interaction.followUp({
    content,
    ephemeral: options?.ephemeral ?? true,
  });
}

// ============================================================================
// Safe Reply Utilities
// ============================================================================

/**
 * Safely reply or edit based on interaction state.
 * Automatically handles already-replied interactions by editing instead.
 * 
 * @param interaction - The interaction to respond to
 * @param content - Text content
 * @param options - Ephemeral options
 * @returns Result indicating success/failure and method used
 * 
 * @example
 * const result = await safeReply(interaction, "Processing complete.");
 * if (!result.success) {
 *   log('error', 'Failed to respond', { error: result.error });
 * }
 */
export async function safeReply(
  interaction: AnyRepliableInteraction,
  content: string,
  options?: EphemeralOptions
): Promise<SafeReplyResult> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content });
      return { success: true, replied: false, edited: true };
    } else {
      await interaction.reply({
        content,
        ephemeral: options?.ephemeral ?? true,
      });
      return { success: true, replied: true, edited: false };
    }
  } catch (err) {
    return {
      success: false,
      replied: false,
      edited: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Safely reply with an embed, handling already-replied state.
 * 
 * @param interaction - The interaction to respond to
 * @param embed - The embed builder
 * @param components - Optional components
 * @param options - Reply options
 */
export async function safeReplyWithEmbed(
  interaction: AnyRepliableInteraction,
  embed: EmbedBuilder,
  components?: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[],
  options?: EmbedReplyOptions
): Promise<SafeReplyResult> {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({
        embeds: [embed],
        components: components ?? [],
      });
      return { success: true, replied: false, edited: true };
    } else {
      await interaction.reply({
        embeds: [embed],
        components: components ?? [],
        ephemeral: options?.ephemeral ?? false,
        fetchReply: options?.fetchReply ?? false,
      });
      return { success: true, replied: true, edited: false };
    }
  } catch (err) {
    return {
      success: false,
      replied: false,
      edited: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// ============================================================================
// Deferred Reply Helpers
// ============================================================================

/**
 * Defer the reply (for long-running operations).
 * 
 * @param interaction - The interaction to defer
 * @param ephemeral - Whether the deferred reply should be ephemeral
 */
export async function deferReply(
  interaction: AnyRepliableInteraction,
  ephemeral = false
): Promise<void> {
  await interaction.deferReply({ ephemeral });
}

/**
 * Defer and then edit with final content.
 * Useful for operations that take time.
 * 
 * @param interaction - The interaction to defer
 * @param ephemeral - Whether ephemeral
 * @returns Function to call with final content
 * 
 * @example
 * const finish = await deferAndReply(interaction, true);
 * // ... long operation ...
 * await finish("Operation complete!");
 */
export async function deferAndReply(
  interaction: AnyRepliableInteraction,
  ephemeral = false
): Promise<(content: string) => Promise<void>> {
  await interaction.deferReply({ ephemeral });
  return async (content: string) => {
    await interaction.editReply({ content });
  };
}

// ============================================================================
// Convenience Patterns
// ============================================================================

/**
 * Reply with a raw payload object.
 * For cases where custom InteractionReplyOptions are needed.
 * 
 * @param interaction - The interaction to reply to
 * @param payload - Full reply options object
 */
export async function replyRaw(
  interaction: AnyRepliableInteraction,
  payload: InteractionReplyOptions | MessagePayload | string
): Promise<ReturnType<typeof interaction.reply>> {
  return interaction.reply(payload);
}

/**
 * Common error messages as functions for consistency.
 */
export const ErrorMessages = {
  notYourInteraction: (type: string) => `This is not your ${type}.`,
  noLongerExists: (type: string) => `This ${type} no longer exists.`,
  adminOnly: () => "Admin only.",
  unknownCommand: (cmd: string) => `Unknown ${cmd} command.`,
  serverOnly: () => "This command must be used in a server.",
  cooldown: (secs: number) => `You can try again in ${secs}s.`,
  somethingWentWrong: () => "Something went wrong.",
} as const;
