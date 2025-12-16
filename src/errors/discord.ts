/**
 * Discord Bot Error Types
 * =======================
 *
 * Error classes for Discord bot operations including command handling,
 * interaction responses, channel operations, and rate limiting.
 *
 * @module errors/discord
 * @since 2025-12-16
 *
 * @example
 * ```typescript
 * import { CommandError, InteractionError, ChannelError } from './discord.js';
 *
 * // Command error
 * throw new CommandError('Missing required permission', {
 *   command: 'admin',
 *   userId: '12345',
 *   guildId: '67890',
 * });
 *
 * // Interaction timeout
 * throw new InteractionTimeoutError('54321', {
 *   command: 'battle',
 *   component: 'move-select',
 * });
 * ```
 */

import { AppError, type ErrorContext, type ErrorSeverity } from "./base.js";

// ============================================================================
// Error Codes
// ============================================================================

export const DiscordErrorCode = {
  // Command errors
  COMMAND_NOT_FOUND: "DISC_CMD_001",
  COMMAND_PERMISSION_DENIED: "DISC_CMD_002",
  COMMAND_INVALID_ARGS: "DISC_CMD_003",
  COMMAND_COOLDOWN: "DISC_CMD_004",
  COMMAND_GUILD_ONLY: "DISC_CMD_005",
  COMMAND_DM_ONLY: "DISC_CMD_006",
  
  // Interaction errors
  INTERACTION_FAILED: "DISC_INT_001",
  INTERACTION_TIMEOUT: "DISC_INT_002",
  INTERACTION_ALREADY_REPLIED: "DISC_INT_003",
  INTERACTION_INVALID_COMPONENT: "DISC_INT_004",
  INTERACTION_EXPIRED: "DISC_INT_005",
  
  // Channel errors
  CHANNEL_NOT_FOUND: "DISC_CHN_001",
  CHANNEL_NO_ACCESS: "DISC_CHN_002",
  CHANNEL_CREATION_FAILED: "DISC_CHN_003",
  CHANNEL_WRONG_TYPE: "DISC_CHN_004",
  
  // Homestead errors
  HOMESTEAD_NOT_FOUND: "DISC_HOME_001",
  HOMESTEAD_CREATION_FAILED: "DISC_HOME_002",
  HOMESTEAD_ALREADY_EXISTS: "DISC_HOME_003",
  
  // Message errors
  MESSAGE_SEND_FAILED: "DISC_MSG_001",
  MESSAGE_EDIT_FAILED: "DISC_MSG_002",
  MESSAGE_DELETE_FAILED: "DISC_MSG_003",
  MESSAGE_TOO_LONG: "DISC_MSG_004",
  
  // Rate limit errors
  RATE_LIMITED: "DISC_RATE_001",
  RATE_LIMIT_GLOBAL: "DISC_RATE_002",
  
  // Permission errors
  MISSING_PERMISSIONS: "DISC_PERM_001",
  BOT_MISSING_PERMISSIONS: "DISC_PERM_002",
  
  // User errors
  USER_NOT_FOUND: "DISC_USR_001",
  USER_BLOCKED_BOT: "DISC_USR_002",
} as const;

export type DiscordErrorCodeType = typeof DiscordErrorCode[keyof typeof DiscordErrorCode];

// ============================================================================
// Error Contexts
// ============================================================================

export interface DiscordContext extends ErrorContext {
  /** Discord user ID */
  discordUserId?: string;
  /** Guild ID */
  guildId?: string;
  /** Channel ID */
  channelId?: string;
}

export interface CommandContext extends DiscordContext {
  /** Command name */
  command?: string;
  /** Subcommand if applicable */
  subcommand?: string;
  /** Command arguments */
  args?: Record<string, unknown>;
}

export interface InteractionContext extends DiscordContext {
  /** Interaction ID */
  interactionId?: string;
  /** Custom ID for components */
  customId?: string;
  /** Component type */
  componentType?: string;
  /** Whether interaction was deferred */
  deferred?: boolean;
  /** Whether interaction was replied to */
  replied?: boolean;
}

export interface ChannelContext extends DiscordContext {
  /** Channel name */
  channelName?: string;
  /** Channel type */
  channelType?: string;
  /** Parent channel/category ID */
  parentId?: string;
}

export interface HomesteadContext extends DiscordContext {
  /** Homestead channel ID */
  homesteadId?: string;
  /** Expected channel name pattern */
  expectedName?: string;
}

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base class for all Discord bot errors.
 */
export class DiscordBotError extends AppError {
  constructor(
    message: string,
    code: DiscordErrorCodeType = DiscordErrorCode.COMMAND_NOT_FOUND,
    context: DiscordContext = {},
    options?: { severity?: ErrorSeverity; cause?: Error }
  ) {
    super(message, code, context, {
      severity: options?.severity ?? "medium",
      type: "operational",
      cause: options?.cause,
    });
  }
}

/**
 * Command execution errors.
 */
export class CommandError extends DiscordBotError {
  readonly command?: string;

  constructor(
    message: string,
    context: CommandContext = {},
    code: DiscordErrorCodeType = DiscordErrorCode.COMMAND_NOT_FOUND
  ) {
    super(message, code, context, { severity: "low" });
    this.command = context.command;
  }
}

/**
 * Permission denied for command.
 */
export class CommandPermissionError extends CommandError {
  constructor(command: string, context: CommandContext = {}) {
    super(
      `Permission denied for command: ${command}`,
      { ...context, command },
      DiscordErrorCode.COMMAND_PERMISSION_DENIED
    );
  }
}

/**
 * Interaction errors.
 */
export class InteractionError extends DiscordBotError {
  readonly interactionId?: string;

  constructor(
    message: string,
    context: InteractionContext = {},
    code: DiscordErrorCodeType = DiscordErrorCode.INTERACTION_FAILED
  ) {
    super(message, code, context, { severity: "medium" });
    this.interactionId = context.interactionId;
  }
}

/**
 * Interaction timed out.
 */
export class InteractionTimeoutError extends InteractionError {
  constructor(interactionId: string, context: InteractionContext = {}) {
    super(
      "Interaction timed out",
      { ...context, interactionId },
      DiscordErrorCode.INTERACTION_TIMEOUT
    );
  }
}

/**
 * Channel errors.
 */
export class ChannelError extends DiscordBotError {
  readonly channelId?: string;

  constructor(
    message: string,
    context: ChannelContext = {},
    code: DiscordErrorCodeType = DiscordErrorCode.CHANNEL_NOT_FOUND
  ) {
    super(message, code, context, { severity: "medium" });
    this.channelId = context.channelId;
  }
}

/**
 * Channel not found.
 */
export class ChannelNotFoundError extends ChannelError {
  constructor(channelId: string, context: ChannelContext = {}) {
    super(
      `Channel not found: ${channelId}`,
      { ...context, channelId },
      DiscordErrorCode.CHANNEL_NOT_FOUND
    );
  }
}

/**
 * Homestead channel errors.
 */
export class HomesteadError extends DiscordBotError {
  readonly homesteadId?: string;

  constructor(
    message: string,
    context: HomesteadContext = {},
    code: DiscordErrorCodeType = DiscordErrorCode.HOMESTEAD_NOT_FOUND
  ) {
    super(message, code, context, { severity: "medium" });
    this.homesteadId = context.homesteadId;
  }
}

/**
 * Homestead channel not found.
 */
export class HomesteadNotFoundError extends HomesteadError {
  constructor(userId: string, guildId: string, context: HomesteadContext = {}) {
    super(
      `Homestead channel not found for user ${userId} in guild ${guildId}`,
      { ...context, discordUserId: userId, guildId },
      DiscordErrorCode.HOMESTEAD_NOT_FOUND
    );
  }
}

/**
 * Rate limit errors.
 */
export class RateLimitError extends DiscordBotError {
  readonly retryAfter?: number;

  constructor(
    message: string,
    retryAfter?: number,
    context: DiscordContext = {}
  ) {
    super(message, DiscordErrorCode.RATE_LIMITED, context, { severity: "low" });
    this.retryAfter = retryAfter;
  }

  override isRetryable(): boolean {
    return true;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

export function isDiscordBotError(error: unknown): error is DiscordBotError {
  return error instanceof DiscordBotError;
}

export function isCommandError(error: unknown): error is CommandError {
  return error instanceof CommandError;
}

export function isInteractionError(error: unknown): error is InteractionError {
  return error instanceof InteractionError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

export function isHomesteadError(error: unknown): error is HomesteadError {
  return error instanceof HomesteadError;
}
