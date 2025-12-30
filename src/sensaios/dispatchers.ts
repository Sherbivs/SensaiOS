/**
 * SensaiOS Event Dispatchers
 *
 * Routes events (Discord interactions, exports, jobs) to registered handlers
 * via the component supervisor.
 *
 * All dispatchers use runGuarded for consistent observability.
 *
 * @module sensaios/dispatchers
 */

import { scopedLogger } from '../observability/envelope/console.js';
import { runGuarded } from './run-guarded.js';
import type {
  ExportEnvelopeData,
  LeasedJob,
  JobResult,
} from './component-context.js';
import { scopeFromInteraction, systemScope } from './tenant-scope.js';
import type { ComponentSupervisor } from './component-supervisor.js';
import { toCanonicalError } from './canonical-error.js';
import { createComponentContext } from './context-factory.js';
import type { PrismaClient } from '../generated/prisma/client.js';

const log = scopedLogger('sensaios-dispatch');

// ============================================================================
// DISCORD DISPATCHER
// ============================================================================

/**
 * Discord interaction (simplified type for this module)
 */
export interface DiscordInteraction {
  /** Interaction ID */
  id: string;
  /** Command name or custom ID */
  commandName?: string;
  customId?: string;
  /** Guild ID */
  guildId: string | null;
  /** User info */
  user: { id: string; username: string };
  /** Interaction type */
  type: number;
  /** Reply methods */
  reply?: (options: unknown) => Promise<void>;
  deferReply?: () => Promise<void>;
  editReply?: (options: unknown) => Promise<void>;
}

/**
 * Discord dispatcher configuration
 */
export interface DiscordDispatcherConfig {
  /** Component supervisor */
  supervisor: ComponentSupervisor;
  /** Prisma client for context creation */
  prisma: PrismaClient;
  /** Default error message */
  defaultErrorMessage?: string;
}

/**
 * Discord dispatch result
 */
export interface DiscordDispatchResult {
  /** Whether dispatch was successful */
  success: boolean;
  /** Handler component name */
  component?: string;
  /** Duration in ms */
  durationMs: number;
  /** Error if failed */
  error?: Error;
}

/**
 * Create a Discord event dispatcher.
 *
 * Routes Discord interactions to registered handlers based on command name
 * or custom ID.
 *
 * @example
 * ```typescript
 * const dispatch = createDiscordDispatcher({
 *   supervisor,
 *   prisma,
 * });
 *
 * // In Discord client event handler
 * client.on('interactionCreate', async (interaction) => {
 *   await dispatch(interaction);
 * });
 * ```
 */
export function createDiscordDispatcher(config: DiscordDispatcherConfig) {
  const {
    supervisor,
    prisma,
    defaultErrorMessage = 'An error occurred. Please try again.',
  } = config;

  return async function dispatchDiscord(
    interaction: DiscordInteraction
  ): Promise<DiscordDispatchResult> {
    const startTime = Date.now();

    // Determine handler key
    const handlerKey = interaction.commandName ?? interaction.customId;
    if (!handlerKey) {
      log.warn('dispatch', 'No handler key found', {
        interactionId: interaction.id,
        type: interaction.type,
      });
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: new Error('No handler key (commandName or customId) found'),
      };
    }

    // Look up handler
    const lookup = supervisor.getDiscordHandler(handlerKey);
    if (!lookup) {
      log.debug('dispatch', 'No handler found', { handlerKey });
      return {
        success: false,
        durationMs: Date.now() - startTime,
        error: new Error(`No handler registered for: ${handlerKey}`),
      };
    }

    // Create scope from interaction
    const scope = scopeFromInteraction(interaction);

    // Create context
    const ctx = createComponentContext({ scope, component: lookup.component, prisma });

    // Dispatch via runGuarded
    try {
      await runGuarded(
        async () => {
          await lookup.handler(ctx, interaction);
        },
        {
          name: `discord.${handlerKey}`,
          scope,
          metadata: {
            interactionId: interaction.id,
            guildId: interaction.guildId,
            userId: interaction.user.id,
            component: lookup.component,
          },
        }
      );

      return {
        success: true,
        component: lookup.component,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const canonical = toCanonicalError(error, scope);

      // Try to send error response to user
      try {
        if (interaction.reply) {
          await interaction.reply({
            content: defaultErrorMessage,
            ephemeral: true,
          });
        } else if (interaction.editReply) {
          await interaction.editReply({
            content: defaultErrorMessage,
          });
        }
      } catch (replyError) {
        log.warn('dispatch', 'Failed to send error reply', {
          interactionId: interaction.id,
          replyError: String(replyError),
        });
      }

      return {
        success: false,
        component: lookup.component,
        durationMs: Date.now() - startTime,
        error: canonical,
      };
    }
  };
}

// ============================================================================
// EXPORT DISPATCHER
// ============================================================================

/**
 * Export dispatcher configuration
 */
export interface ExportDispatcherConfig {
  /** Component supervisor */
  supervisor: ComponentSupervisor;
  /** Prisma client for context creation */
  prisma: PrismaClient;
}

/**
 * Export dispatch result
 */
export interface ExportDispatchResult {
  /** Whether a handler was invoked */
  handled: boolean;
  /** Handler component name */
  component?: string;
  /** Duration in ms */
  durationMs: number;
  /** Error if failed */
  error?: Error;
}

/**
 * Create an export event dispatcher.
 *
 * Routes export envelopes to registered handlers based on event type.
 * Note: Each export type has ONE handler (not multiple).
 *
 * @example
 * ```typescript
 * const dispatch = createExportDispatcher({
 *   supervisor,
 *   prisma,
 * });
 *
 * // In export processor
 * const envelopes = await ctx.exports.query({ types: ['battle.completed'] });
 * for (const e of envelopes) {
 *   await dispatch(e);
 * }
 * ```
 */
export function createExportDispatcher(config: ExportDispatcherConfig) {
  const { supervisor, prisma } = config;

  return async function dispatchExport(
    envelope: ExportEnvelopeData
  ): Promise<ExportDispatchResult> {
    const startTime = Date.now();

    // Get handler for this event type
    const lookup = supervisor.getExportHandler(envelope.type);
    if (!lookup) {
      log.debug('dispatch', 'No handler for export type', { type: envelope.type });
      return {
        handled: false,
        durationMs: Date.now() - startTime,
      };
    }

    // Create context
    const ctx = createComponentContext({ scope: envelope.scope, component: lookup.component, prisma });

    // Dispatch via runGuarded
    // Note: ExportHandler takes array of envelopes, wrap single envelope
    try {
      await runGuarded(
        async () => {
          await lookup.handler(ctx, [envelope]);
        },
        {
          name: `export.${envelope.type}`,
          scope: envelope.scope,
          metadata: {
            type: envelope.type,
            idempotencyKey: envelope.idempotencyKey,
            component: lookup.component,
            correlationId: envelope.correlationId,
          },
        }
      );

      return {
        handled: true,
        component: lookup.component,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      log.error('dispatch', 'Export handler failed', {
        type: envelope.type,
        handler: lookup.component,
        error: String(error),
      });

      return {
        handled: true,
        component: lookup.component,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  };
}

// ============================================================================
// JOB DISPATCHER
// ============================================================================

/**
 * Job dispatcher configuration
 */
export interface JobDispatcherConfig {
  /** Component supervisor */
  supervisor: ComponentSupervisor;
  /** Prisma client for context creation */
  prisma: PrismaClient;
  /** Default retry delay in ms */
  defaultRetryDelayMs?: number;
}

/**
 * Job dispatch result
 */
export interface JobDispatchResult {
  /** Whether job was handled */
  handled: boolean;
  /** Job result (if successful) */
  result?: JobResult;
  /** Handler component name */
  component?: string;
  /** Duration in ms */
  durationMs: number;
  /** Whether to retry on failure */
  shouldRetry?: boolean;
  /** Retry after timestamp */
  retryAfter?: Date;
  /** Error if failed */
  error?: Error;
}

/**
 * Create a job event dispatcher.
 *
 * Routes jobs to registered handlers based on job kind.
 * Handles retry logic and error tracking.
 *
 * @example
 * ```typescript
 * const dispatch = createJobDispatcher({
 *   supervisor,
 *   prisma,
 * });
 *
 * // In job processor
 * const jobs = await ctx.jobs.lease(['battle.cleanup', 'cache.refresh']);
 * for (const job of jobs) {
 *   const result = await dispatch(job);
 *   if (result.handled && !result.error) {
 *     await ctx.jobs.complete(job.id, result.result!);
 *   } else if (result.shouldRetry) {
 *     await ctx.jobs.fail(job.id, result.error!, result.retryAfter);
 *   }
 * }
 * ```
 */
export function createJobDispatcher(config: JobDispatcherConfig) {
  const { supervisor, prisma, defaultRetryDelayMs = 60_000 } = config;

  return async function dispatchJob(job: LeasedJob): Promise<JobDispatchResult> {
    const startTime = Date.now();

    // Look up handler
    const lookup = supervisor.getJobHandler(job.kind);
    if (!lookup) {
      log.debug('dispatch', 'No handler for job kind', { kind: job.kind });
      return {
        handled: false,
        durationMs: Date.now() - startTime,
        error: new Error(`No handler registered for job kind: ${job.kind}`),
      };
    }

    // Create context
    const ctx = createComponentContext({ scope: job.scope, component: lookup.component, prisma });

    // Dispatch via runGuarded
    try {
      let handlerResult: unknown;

      await runGuarded(
        async () => {
          handlerResult = await lookup.handler(ctx, job);
        },
        {
          name: `job.${job.kind}`,
          scope: job.scope,
          metadata: {
            jobId: job.id,
            kind: job.kind,
            attempt: job.attempt,
            component: lookup.component,
            correlationId: job.correlationId,
          },
        }
      );

      const durationMs = Date.now() - startTime;

      return {
        handled: true,
        result: {
          data: handlerResult,
          durationMs,
        },
        component: lookup.component,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const canonical = toCanonicalError(error, job.scope);

      // Determine if we should retry (default: retry up to 3 attempts)
      const maxAttempts = 3;
      const shouldRetry = job.attempt < maxAttempts;
      const retryAfter = shouldRetry
        ? new Date(Date.now() + defaultRetryDelayMs * Math.pow(2, job.attempt - 1))
        : undefined;

      return {
        handled: true,
        component: lookup.component,
        durationMs,
        shouldRetry,
        retryAfter,
        error: canonical,
      };
    }
  };
}

// ============================================================================
// HTTP DISPATCHER
// ============================================================================

/**
 * HTTP request (simplified)
 */
export interface HttpRequest {
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Request headers */
  headers: Record<string, string | undefined>;
  /** Query parameters */
  query: Record<string, string | undefined>;
  /** Request body */
  body?: unknown;
}

/**
 * HTTP response (for tracking)
 */
export interface HttpResponse {
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body */
  body?: unknown;
}

/**
 * HTTP response object (passed to handler)
 */
export interface HttpResponseObject {
  /** Set status code */
  status(code: number): void;
  /** Set header */
  setHeader(name: string, value: string): void;
  /** Send JSON response */
  json(body: unknown): void;
  /** Send text response */
  send(body: string): void;
  /** End response */
  end(): void;
}

/**
 * HTTP dispatcher configuration
 */
export interface HttpDispatcherConfig {
  /** Component supervisor */
  supervisor: ComponentSupervisor;
  /** Prisma client for context creation */
  prisma: PrismaClient;
  /** Component name for system scope */
  componentName?: string;
}

/**
 * HTTP dispatch result
 */
export interface HttpDispatchResult {
  /** HTTP response */
  response: HttpResponse;
  /** Handler component name */
  component?: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Create an HTTP request dispatcher.
 *
 * Routes HTTP requests to registered handlers based on path.
 * Note: HttpHandler signature is (ctx, req, res) => Promise<void>
 *
 * @example
 * ```typescript
 * const dispatch = createHttpDispatcher({
 *   supervisor,
 *   prisma,
 *   componentName: 'api-server',
 * });
 *
 * // In Express middleware
 * app.use(async (req, res) => {
 *   await dispatch(req, res);
 * });
 * ```
 */
export function createHttpDispatcher(config: HttpDispatcherConfig) {
  const { supervisor, prisma, componentName = 'http-api' } = config;

  return async function dispatchHttp(
    request: HttpRequest,
    response: HttpResponseObject
  ): Promise<HttpDispatchResult> {
    const startTime = Date.now();
    let statusCode = 200;

    // Look up handler
    const lookup = supervisor.getHttpHandler(request.path);
    if (!lookup) {
      response.status(404);
      response.json({ error: 'Not Found', path: request.path });
      return {
        response: {
          status: 404,
          body: { error: 'Not Found', path: request.path },
        },
        durationMs: Date.now() - startTime,
      };
    }

    // Create system scope for HTTP requests
    const scope = systemScope(componentName);

    // Create context
    const ctx = createComponentContext({ scope, component: lookup.component, prisma });

    // Dispatch via runGuarded
    try {
      await runGuarded(
        async () => {
          // Pass request AND response to handler
          await lookup.handler(ctx, request, response);
        },
        {
          name: `http.${request.method}.${request.path}`,
          scope,
          metadata: {
            method: request.method,
            path: request.path,
            component: lookup.component,
          },
        }
      );

      return {
        response: { status: statusCode },
        component: lookup.component,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const canonical = toCanonicalError(error, scope);

      response.status(500);
      response.json({
        error: 'Internal Server Error',
        errorId: canonical.id,
        message: canonical.message,
      });

      return {
        response: {
          status: 500,
          body: {
            error: 'Internal Server Error',
            errorId: canonical.id,
            message: canonical.message,
          },
        },
        component: lookup.component,
        durationMs: Date.now() - startTime,
      };
    }
  };
}

// ============================================================================
// CLI DISPATCHER
// ============================================================================

/**
 * CLI command
 */
export interface CliCommand {
  /** Command name */
  name: string;
  /** Command arguments */
  args: string[];
  /** Command options */
  options: Record<string, string | boolean | undefined>;
}

/**
 * CLI result
 */
export interface CliResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Output text */
  output?: string;
  /** Error text */
  error?: string;
}

/**
 * CLI dispatcher configuration
 */
export interface CliDispatcherConfig {
  /** Component supervisor */
  supervisor: ComponentSupervisor;
  /** Prisma client for context creation */
  prisma: PrismaClient;
  /** Component name for system scope */
  componentName?: string;
}

/**
 * CLI dispatch result
 */
export interface CliDispatchResult {
  /** CLI result */
  result: CliResult;
  /** Handler component name */
  component?: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Create a CLI command dispatcher.
 *
 * Routes CLI commands to registered handlers based on command name.
 * Note: CliHandler returns exit code (number), not CliResult object.
 *
 * @example
 * ```typescript
 * const dispatch = createCliDispatcher({
 *   supervisor,
 *   prisma,
 *   componentName: 'cli-tools',
 * });
 *
 * // In CLI entry point
 * const command = parseArgs(process.argv);
 * const result = await dispatch(command);
 * process.exit(result.result.exitCode);
 * ```
 */
export function createCliDispatcher(config: CliDispatcherConfig) {
  const { supervisor, prisma, componentName = 'cli-tools' } = config;

  return async function dispatchCli(
    command: CliCommand
  ): Promise<CliDispatchResult> {
    const startTime = Date.now();

    // Look up handler
    const lookup = supervisor.getCliHandler(command.name);
    if (!lookup) {
      return {
        result: {
          exitCode: 1,
          error: `Unknown command: ${command.name}`,
        },
        durationMs: Date.now() - startTime,
      };
    }

    // Create system scope for CLI commands
    const scope = systemScope(componentName);

    // Create context
    const ctx = createComponentContext({ scope, component: lookup.component, prisma });

    // Dispatch via runGuarded
    try {
      let exitCode = 0;

      await runGuarded(
        async () => {
          // CliHandler returns exit code (number)
          exitCode = await lookup.handler(ctx, command.args);
        },
        {
          name: `cli.${command.name}`,
          scope,
          metadata: {
            command: command.name,
            args: command.args,
            component: lookup.component,
          },
        }
      );

      return {
        result: {
          exitCode,
          output: exitCode === 0 ? 'Success' : undefined,
        },
        component: lookup.component,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const canonical = toCanonicalError(error, scope);

      return {
        result: {
          exitCode: 1,
          error: `Error: ${canonical.message} (${canonical.id})`,
        },
        component: lookup.component,
        durationMs: Date.now() - startTime,
      };
    }
  };
}
