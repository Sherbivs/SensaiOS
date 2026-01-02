/**
 * Discord Adapter — Application Layer Facade for Discord Bot
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ISOLATES DISCORD BOT FROM DIRECT KERNEL IMPORTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This module provides application-level abstractions over kernel primitives,
 * ensuring the Discord bot never imports directly from the kernel layer.
 * 
 * DESIGN PRINCIPLES:
 * 1. **Facade Pattern** — Simplifies kernel API for Discord-specific use cases
 * 2. **Immutable API** — Bot code depends on stable interfaces, not kernel internals
 * 3. **Type Safety** — Re-exports only what bot layer needs with proper typing
 * 4. **Testability** — Application facades can be mocked without touching kernel
 * 
 * WHAT THIS PROVIDES:
 * - `appLog` — Simplified logging facade (info/warn/error/debug)
 * - `withDiscordTrace` — Wraps Discord handlers with correlation tracking
 * - `withWorkerTrace` — Wraps worker jobs with correlation tracking
 * - `getCorrelationId` — Gets current correlation ID for logging
 * - `scopeFromInteraction` — Creates TenantScope from Discord interaction
 * - `createHandler` — Creates wrapped handlers with full observability
 * 
 * @module app/discord-adapter
 * @since 2025-12-30
 */

import {
  kernel,
} from '../kernel/boot-kernel.js';

import {
  startDiscordTraceAsync,
  startWorkerTraceAsync,
  getCurrentCorrelationId,
  type TraceSource,
} from '../kernel/correlation.js';

import {
  type TenantScope,
} from '../sensaios/tenant-scope.js';

import {
  runGuarded,
} from '../sensaios/run-guarded.js';

import type { GuardedContext } from '../sensaios/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Application log levels (subset of kernel levels)
 */
export type AppLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Options for Discord trace wrapping
 */
export interface DiscordTraceOptions {
  /** Discord interaction ID */
  interactionId: string;
  /** Discord user ID */
  userId: string;
  /** Discord guild ID (null for DMs) */
  guildId: string | null;
  /** Operation name (command name, button ID, etc.) */
  operation: string;
}

/**
 * Options for Worker trace wrapping
 */
export interface WorkerTraceOptions {
  /** Worker name */
  workerName: string;
  /** Optional job ID */
  jobId?: string;
}

/**
 * Handler context passed to wrapped handlers
 */
export interface HandlerContext {
  /** Current correlation ID */
  correlationId: string;
  /** Tenant scope for multi-tenant operations */
  scope: TenantScope;
  /** Application logger bound to this context */
  log: {
    debug: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
  };
}

// ============================================================================
// LOGGING FACADE
// ============================================================================

/**
 * Application-level logging facade
 * 
 * Wraps kernel logger with simplified API for bot layer.
 * Automatically attaches correlation ID from current context.
 * 
 * @example
 * ```typescript
 * // In a Discord command handler
 * appLog.info('battle', 'Starting battle', { challengerId, defenderId });
 * appLog.warn('battle', 'Invalid move selection', { moveId });
 * appLog.error('battle', 'Battle engine failed', { error: err.message });
 * ```
 */
export const appLog = {
  /**
   * Debug-level log (development only)
   */
  debug: (component: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.debug(component, message, { ...data, correlationId });
  },

  /**
   * Info-level log (normal operations)
   */
  info: (component: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.info(component, message, { ...data, correlationId });
  },

  /**
   * Warning-level log (potential issues)
   */
  warn: (component: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.warn(component, message, { ...data, correlationId });
  },

  /**
   * Error-level log (failures)
   */
  error: (component: string, message: string, data?: Record<string, unknown>): void => {
    const correlationId = getCurrentCorrelationId();
    kernel.error(component, message, { ...data, correlationId });
  },
};

// ============================================================================
// TRACE WRAPPERS
// ============================================================================

/**
 * Wrap a Discord handler with correlation tracing
 * 
 * All logs within the callback will automatically have correlation ID attached.
 * Replaces direct use of `startDiscordTraceAsync` in bot layer.
 * 
 * @example
 * ```typescript
 * await withDiscordTrace(
 *   { interactionId: interaction.id, userId: user.id, guildId: guild?.id ?? null, operation: '/battle' },
 *   async () => {
 *     appLog.info('battle', 'Processing battle command');
 *     // ... handler logic
 *   }
 * );
 * ```
 */
export async function withDiscordTrace<T>(
  options: DiscordTraceOptions,
  callback: () => Promise<T>
): Promise<T> {
  return startDiscordTraceAsync(
    options.interactionId,
    options.userId,
    options.guildId,
    options.operation,
    callback
  );
}

/**
 * Wrap a worker job with correlation tracing
 * 
 * All logs within the callback will automatically have correlation ID attached.
 * Replaces direct use of `startWorkerTraceAsync` in worker layer.
 * 
 * @example
 * ```typescript
 * await withWorkerTrace(
 *   { workerName: 'cache-refresh', jobId: 'job-123' },
 *   async () => {
 *     appLog.info('cache', 'Refreshing cache');
 *     // ... worker logic
 *   }
 * );
 * ```
 */
export async function withWorkerTrace<T>(
  options: WorkerTraceOptions,
  callback: () => Promise<T>
): Promise<T> {
  return startWorkerTraceAsync(
    options.workerName,
    options.jobId,
    callback
  );
}

// ============================================================================
// CORRELATION UTILITIES
// ============================================================================

/**
 * Get current correlation ID
 * 
 * Returns the correlation ID from the current async context, or undefined
 * if not inside a traced context.
 * 
 * @example
 * ```typescript
 * const correlationId = getCorrelationId();
 * if (correlationId) {
 *   await someExternalService.call({ traceId: correlationId });
 * }
 * ```
 */
export function getCorrelationId(): string | undefined {
  return getCurrentCorrelationId();
}

// ============================================================================
// SCOPE HELPERS
// ============================================================================

/**
 * Create TenantScope from Discord interaction
 * 
 * Extracts tenant and guild information from a Discord interaction
 * for multi-tenant scoping.
 * 
 * @example
 * ```typescript
 * const scope = scopeFromInteraction(interaction);
 * await ctx.exports.append({ ...eventData, scope });
 * ```
 */
export function scopeFromInteraction(interaction: {
  guildId?: string | null;
}, component = 'discord-bot'): TenantScope {
  return {
    tenant: interaction.guildId ?? 'dm', // Guild-based multi-tenancy
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    service: 'infinity-gauntlet',
    component,
  };
}

/**
 * Create TenantScope from guild ID
 * 
 * @example
 * ```typescript
 * const scope = scopeFromGuild('123456789');
 * ```
 */
export function scopeFromGuild(guildId: string | null | undefined, component = 'discord-bot'): TenantScope {
  return {
    tenant: guildId ?? 'dm',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    service: 'infinity-gauntlet',
    component,
  };
}

// ============================================================================
// HANDLER WRAPPER
// ============================================================================

/**
 * Create a wrapped handler with full observability
 * 
 * Combines correlation tracing, error capture, and logging context
 * into a single wrapper for Discord command handlers.
 * 
 * This is the recommended pattern for all Discord interaction handlers.
 * 
 * @example
 * ```typescript
 * const handleBattleCommand = createHandler(
 *   'battle.command',
 *   async (ctx, interaction) => {
 *     ctx.log.info('Processing battle command');
 *     // ... handler logic
 *   }
 * );
 * 
 * // In your command router:
 * await handleBattleCommand(interaction);
 * ```
 */
export function createHandler<TArgs extends unknown[], TResult>(
  name: string,
  handler: (ctx: HandlerContext, ...args: TArgs) => Promise<TResult>,
  _options?: Partial<GuardedContext>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    // Extract interaction-like object from first arg if available
    const firstArg = args[0] as { id?: string; user?: { id: string }; guildId?: string | null } | undefined;
    
    const traceOptions: DiscordTraceOptions = {
      interactionId: firstArg?.id ?? 'unknown',
      userId: firstArg?.user?.id ?? 'unknown',
      guildId: firstArg?.guildId ?? null,
      operation: name,
    };

    return withDiscordTrace(traceOptions, async () => {
      const correlationId = getCurrentCorrelationId() ?? 'unknown';
      const scope = scopeFromInteraction(firstArg ?? {});
      
      const ctx: HandlerContext = {
        correlationId,
        scope,
        log: {
          debug: (message, data) => appLog.debug(name, message, data),
          info: (message, data) => appLog.info(name, message, data),
          warn: (message, data) => appLog.warn(name, message, data),
          error: (message, data) => appLog.error(name, message, data),
        },
      };

      return handler(ctx, ...args);
    });
  };
}

// ============================================================================
// RE-EXPORTS FOR CONVENIENCE
// ============================================================================

// Re-export commonly needed types
export type { TraceSource };
