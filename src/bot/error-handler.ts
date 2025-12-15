/**
 * Bot-Specific Error Handler
 * Purpose: Recognize and enrich Discord-specific errors with proper context
 * Integrates with ErrorTracker for centralized error capture
 * 
 * @module bot/error-handler
 */

import { DiscordAPIError, CommandInteraction, Interaction, Message } from 'discord.js';
import { errorTracker, type ErrorContext } from '../services/monitoring/index.js';
import { log } from '../utils/logger.js';
import { safeReply } from './shared/response-helpers.js';

/// ---- Discord Error Types ----

export interface DiscordErrorContext extends ErrorContext {
  interactionId?: string;
  interactionType?: string;
  channelId?: string;
  messageId?: string;
  permissions?: string[];
}

/// ---- Bot Error Handler ----

export class BotErrorHandler {
  /**
   * Handle command execution errors
   * Enriches with command context (user, guild, command name)
   */
  async handleCommandError(
    error: Error,
    interaction: CommandInteraction,
    commandName?: string
  ): Promise<string> {
    const context: DiscordErrorContext = {
      category: 'DISCORD',
      severity: this.classifyCommandErrorSeverity(error),
      userId: interaction.user.id,
      guildId: interaction.guildId ?? undefined,
      commandName: commandName ?? interaction.commandName,
      service: 'discord-bot',
      operation: 'command-execution',
      interactionId: interaction.id,
      interactionType: interaction.type.toString(),
      channelId: interaction.channelId,
      customData: {
        commandOptions: this.safeSerializeOptions((interaction as any).options),
        replied: interaction.replied,
        deferred: interaction.deferred,
      },
    };
    
    const errorId = await errorTracker.captureError(error, context);
    
    // Attempt to notify user (if interaction not yet replied)
    await this.notifyUserOfError(interaction, error);
    
    return errorId;
  }
  
  /**
   * Handle Discord API errors with rate limit awareness
   */
  async handleDiscordAPIError(
    error: DiscordAPIError,
    context: Partial<DiscordErrorContext> = {}
  ): Promise<string> {
    const enrichedContext: DiscordErrorContext = {
      ...context,
      category: 'DISCORD',
      severity: this.classifyDiscordAPIErrorSeverity(error),
      service: 'discord-api',
      operation: context.operation ?? 'api-request',
      customData: {
        ...context.customData,
        httpStatus: error.status,
        discordCode: error.code,
        method: error.method,
        url: error.url,
        rateLimitGlobal: error.code === 50001 ? true : false,
      },
    };
    
    // Detect rate limit errors specifically
    if (error.status === 429) {
      enrichedContext.severity = 'MEDIUM'; // Rate limits are expected, not critical
      enrichedContext.customData = {
        ...enrichedContext.customData,
        rateLimitScope: error.code === 50001 ? 'global' : 'route',
        retryAfter: this.extractRetryAfter(error),
      };
    }
    
    // Detect permission errors
    if (error.code === 50013 || error.message.includes('Missing Permissions')) {
      enrichedContext.severity = 'HIGH';
      enrichedContext.customData = {
        ...enrichedContext.customData,
        missingPermissions: this.extractMissingPermissions(error),
      };
    }
    
    return errorTracker.captureError(error, enrichedContext);
  }
  
  /**
   * Handle interaction timeout errors
   * These occur when interactions aren't replied to within 3 seconds
   */
  async handleInteractionTimeout(
    interaction: Interaction,
    operation: string
  ): Promise<string> {
    const timeoutError = new Error(`Interaction timeout: ${operation} exceeded 3 second limit`);
    timeoutError.name = 'InteractionTimeoutError';
    
    const context: DiscordErrorContext = {
      category: 'DISCORD',
      severity: 'HIGH', // User-facing issue
      userId: (interaction as any).user?.id,
      guildId: interaction.guildId ?? undefined,
      service: 'discord-bot',
      operation,
      interactionId: interaction.id,
      interactionType: interaction.type.toString(),
      customData: {
        interactionCreatedAt: interaction.createdAt.toISOString(),
        elapsed: Date.now() - interaction.createdTimestamp,
      },
    };
    
    return errorTracker.captureError(timeoutError, context);
  }
  
  /**
   * Handle member fetch errors (common in security bot)
   */
  async handleMemberFetchError(
    error: Error,
    guildId: string,
    userId?: string
  ): Promise<string> {
    const context: DiscordErrorContext = {
      category: 'DISCORD',
      severity: error.message.includes('timeout') ? 'MEDIUM' : 'HIGH',
      userId,
      guildId,
      service: 'discord-bot',
      operation: 'member-fetch',
      customData: {
        errorType: error.name,
        isTimeout: error.message.includes('timeout'),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle message send/edit errors
   */
  async handleMessageError(
    error: Error,
    message: Message | null,
    operation: 'send' | 'edit' | 'delete' | 'react'
  ): Promise<string> {
    const context: DiscordErrorContext = {
      category: 'DISCORD',
      severity: 'MEDIUM',
      userId: message?.author?.id,
      guildId: message?.guildId ?? undefined,
      channelId: message?.channelId,
      messageId: message?.id,
      service: 'discord-bot',
      operation: `message-${operation}`,
      customData: {
        messageType: message?.type.toString(),
        messageCreatedAt: message?.createdAt?.toISOString(),
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /**
   * Handle webhook errors
   */
  async handleWebhookError(
    error: Error,
    webhookId: string,
    operation: string
  ): Promise<string> {
    const context: ErrorContext = {
      category: 'DISCORD',
      severity: 'MEDIUM',
      service: 'discord-webhook',
      operation,
      customData: {
        webhookId,
        errorType: error.name,
      },
    };
    
    return errorTracker.captureError(error, context);
  }
  
  /// ---- Private Helpers ----
  
  private classifyCommandErrorSeverity(error: Error): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Database/Prisma errors in commands are HIGH (user-facing)
    if (error.name.includes('Prisma') || error.message.includes('database')) {
      return 'HIGH';
    }
    
    // Discord API errors are HIGH (user can't use command)
    if (error.name === 'DiscordAPIError') {
      return 'HIGH';
    }
    
    // Validation errors are LOW (expected user input errors)
    if (error.message.includes('invalid') || error.message.includes('validation')) {
      return 'LOW';
    }
    
    // Default to MEDIUM for unknown command errors
    return 'MEDIUM';
  }
  
  private classifyDiscordAPIErrorSeverity(error: DiscordAPIError): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
    // Rate limits are expected, not critical
    if (error.status === 429) {
      return 'MEDIUM';
    }
    
    // Permission errors are HIGH (feature broken)
    if (error.code === 50013) {
      return 'HIGH';
    }
    
    // 5xx errors are CRITICAL (Discord service issues)
    if (error.status >= 500) {
      return 'CRITICAL';
    }
    
    // 4xx errors are HIGH (client errors, likely fixable)
    if (error.status >= 400) {
      return 'HIGH';
    }
    
    return 'MEDIUM';
  }
  
  private extractRetryAfter(error: DiscordAPIError): number | null {
    try {
      // Discord API returns retry_after in seconds
      const retryAfter = (error as any).retry_after;
      return retryAfter ? Number(retryAfter) : null;
    } catch {
      return null;
    }
  }
  
  private extractMissingPermissions(error: DiscordAPIError): string[] {
    // Parse error message for missing permissions
    // Example: "Missing Permissions: MANAGE_ROLES, MANAGE_CHANNELS"
    const match = error.message.match(/Missing Permissions?:\s*(.+)/i);
    if (match) {
      return match[1].split(',').map(p => p.trim());
    }
    return [];
  }
  
  private safeSerializeOptions(options: any): Record<string, any> {
    try {
      // Extract command options safely
      if (!options) return {};
      
      const serialized: Record<string, any> = {};
      const data = options.data;
      
      if (Array.isArray(data)) {
        for (const option of data) {
          serialized[option.name] = option.value;
        }
      }
      
      return serialized;
    } catch {
      return { _serializationError: true };
    }
  }
  
  private async notifyUserOfError(
    interaction: CommandInteraction,
    error: Error
  ): Promise<void> {
    try {
      // Don't notify for validation errors (user's fault)
      if (error.message.includes('validation') || error.message.includes('invalid')) {
        return;
      }
      
      const errorMessage = '⚠️ An error occurred while executing this command. This has been logged and will be investigated.';
      
      const result = await safeReply(interaction, errorMessage, { ephemeral: true });
      if (!result.success) {
        log('error', '[BotErrorHandler] Failed to notify user of error: ' + String(result.error));
      }
    } catch (notifyError) {
      // Failed to notify user - log but don't throw
      log('error', '[BotErrorHandler] Failed to notify user of error: ' + String(notifyError));
    }
  }
}

// Singleton instance
export const botErrorHandler = new BotErrorHandler();
