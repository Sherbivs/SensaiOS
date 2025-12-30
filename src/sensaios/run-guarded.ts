/**
 * SensaiOS runGuarded() — Kernel Wrapper for Handler Invocations
 *
 * runGuarded() is the kernel wrapper that enforces observability for all handler
 * invocations. It wraps any async function with automatic:
 *
 * - **Correlation ID injection** — Every execution has a traceable ID
 * - **Tenant scope enforcement** — Scope propagates through context
 * - **Timing/metrics collection** — Duration tracked automatically
 * - **Error capture** — All errors converted to CanonicalError and routed
 * - **Logging** — Start/complete/error events logged consistently
 * - **Timeout enforcement** — Prevents runaway handlers
 *
 * @module sensaios/run-guarded
 * @since 2025-12-29
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { scopedLogger } from '../observability/envelope/console.js';
import type { TenantScope } from './tenant-scope.js';
import { withScopeAsync, getCurrentScope, systemScope } from './tenant-scope.js';
import type { CanonicalError } from './canonical-error.js';
import { toCanonicalError, isCanonicalError } from './canonical-error.js';
import { routeError } from './error-routing.js';
import type { GuardedContext, GuardedResult } from './types.js';
import { kernelError, KERNEL_ERRORS } from './sensai-error.js';

/** Scoped logger for run-guarded */
const log = scopedLogger('sensaios-run-guarded');

// ============================================================================
// CORRELATION ID STORAGE
// ============================================================================

/**
 * AsyncLocalStorage for correlation ID context propagation
 *
 * This allows any code running inside runGuarded to access the correlation ID
 * without explicit parameter passing.
 */
const correlationStorage = new AsyncLocalStorage<string>();

/**
 * Get the current correlation ID from context
 *
 * Returns undefined if called outside of a runGuarded context.
 *
 * @example
 * ```typescript
 * await runGuarded(async () => {
 *   const correlationId = getCorrelationId();
 *   console.log('Current correlation:', correlationId);
 * }, { name: 'example', scope });
 * ```
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

/**
 * Require correlation ID from context
 *
 * Throws if called outside of a runGuarded context.
 *
 * @throws {Error} If called outside runGuarded context
 */
export function requireCorrelationId(): string {
  const correlationId = getCorrelationId();
  if (!correlationId) {
    throw kernelError(
      KERNEL_ERRORS.CONTEXT_MISSING,
      'requireCorrelationId() called outside runGuarded context'
    );
  }
  return correlationId;
}

// ============================================================================
// EXTENDED CONTEXT (INTERNAL)
// ============================================================================

/**
 * Extended context for runGuarded (includes scope)
 */
export interface RunGuardedContext extends GuardedContext {
  /**
   * Tenant scope (REQUIRED)
   * All handlers must execute within a tenant scope.
   */
  scope: TenantScope;

  /**
   * Custom error handler (called before routing)
   */
  onError?: (error: CanonicalError) => void | Promise<void>;
}

// ============================================================================
// CORE IMPLEMENTATION
// ============================================================================

/**
 * Default timeout for handlers (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Run a handler with full observability
 *
 * Wraps any async function with:
 * - Correlation ID injection (auto-generated or provided)
 * - Scope propagation via AsyncLocalStorage
 * - Timing metrics collection
 * - Error capture and routing
 * - Timeout enforcement
 *
 * @param handler - The async function to execute
 * @param context - Execution context (name, scope, timeout, etc.)
 * @returns The handler's return value
 * @throws {CanonicalError} If the handler throws and rethrow is true (default)
 *
 * @example
 * ```typescript
 * const result = await runGuarded(
 *   () => battleEngine.startBattle(trainerId, opponentId),
 *   {
 *     name: 'battle.start',
 *     scope: scopeFromInteraction(interaction),
 *     metadata: { trainerId, opponentId },
 *   }
 * );
 * ```
 */
export async function runGuarded<T>(
  handler: () => Promise<T>,
  context: RunGuardedContext
): Promise<T> {
  const correlationId = context.correlationId ?? randomUUID();
  const startTime = performance.now();
  const timeoutMs = context.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { scope, name, parentCorrelationId, metadata, rethrow = true, onError } = context;

  // Log start
  log.info('handler-start', `Starting ${name}`, {
    correlationId,
    parentCorrelationId,
    tenant: scope.tenant,
    service: scope.service,
    component: scope.component,
    ...metadata,
  });

  try {
    // Run with scope AND correlation in context
    const result = await withScopeAsync(scope, () =>
      correlationStorage.run(correlationId, async () => {
        // Create timeout promise
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error(`Handler '${name}' timed out after ${timeoutMs}ms`));
          }, timeoutMs);

          // Ensure timeout doesn't prevent process exit
          if (typeof timeoutId === 'object' && 'unref' in timeoutId) {
            timeoutId.unref();
          }
        });

        // Race handler against timeout
        return Promise.race([handler(), timeoutPromise]);
      })
    );

    const durationMs = performance.now() - startTime;

    // Log success
    log.info('handler-complete', `Completed ${name}`, {
      correlationId,
      durationMs: Math.round(durationMs * 100) / 100,
      tenant: scope.tenant,
    });

    return result;
  } catch (error) {
    const durationMs = performance.now() - startTime;

    // Convert to canonical error (preserves if already canonical)
    const canonical = isCanonicalError(error)
      ? error
      : toCanonicalError(error, scope, {
          correlationId,
          context: {
            handlerName: name,
            durationMs: Math.round(durationMs * 100) / 100,
            ...metadata,
          },
        });

    // Call custom error handler if provided
    if (onError) {
      try {
        await Promise.resolve(onError(canonical));
      } catch (handlerError) {
        log.warn('handler-onerror-failed', 'onError callback threw', {
          correlationId,
          onErrorError: String(handlerError),
        });
      }
    }

    // Route error (log, track, alert based on severity)
    try {
      await routeError(canonical);
    } catch (routeError_) {
      log.error('handler-route-failed', 'Failed to route error', {
        correlationId,
        routeError: String(routeError_),
      });
    }

    // Log failure
    log.error('handler-failed', `Failed ${name}`, {
      correlationId,
      durationMs: Math.round(durationMs * 100) / 100,
      tenant: scope.tenant,
      errorId: canonical.id,
      errorCode: canonical.code,
      errorCategory: canonical.category,
      errorSeverity: canonical.severity,
    });

    // Rethrow if configured (default: true)
    if (rethrow) {
      throw canonical;
    }

    // Return undefined if not rethrowing
    return undefined as T;
  }
}

// ============================================================================
// SAFE VARIANT
// ============================================================================

/**
 * Run a handler and return a result object instead of throwing
 *
 * This variant never throws. Instead, it returns a GuardedResult object
 * that indicates success or failure with full error details.
 *
 * @param handler - The async function to execute
 * @param context - Execution context (name, scope, timeout, etc.)
 * @returns GuardedResult with success status, result/error, and metadata
 *
 * @example
 * ```typescript
 * const { success, result, error } = await runGuardedSafe(
 *   () => riskyOperation(),
 *   { name: 'risky.operation', scope }
 * );
 *
 * if (!success) {
 *   console.error('Failed:', error?.message);
 *   return fallbackValue;
 * }
 *
 * return result;
 * ```
 */
export async function runGuardedSafe<T>(
  handler: () => Promise<T>,
  context: Omit<RunGuardedContext, 'rethrow'>
): Promise<GuardedResult<T>> {
  const correlationId = context.correlationId ?? randomUUID();
  const startTime = performance.now();

  try {
    const result = await runGuarded(handler, {
      ...context,
      correlationId,
      rethrow: true, // We catch it below
    });

    return {
      success: true,
      result,
      durationMs: performance.now() - startTime,
      correlationId,
    };
  } catch (error) {
    return {
      success: false,
      error: isCanonicalError(error) ? error : error,
      durationMs: performance.now() - startTime,
      correlationId,
    };
  }
}

// ============================================================================
// CONVENIENCE HELPERS
// ============================================================================

/**
 * Create a guarded function from a handler
 *
 * Returns a new function that automatically wraps calls in runGuarded.
 * Useful for creating reusable guarded operations.
 *
 * @param name - Handler name for logging
 * @param scopeResolver - Function to resolve scope from arguments, or static scope
 * @param handler - The handler function
 * @returns A guarded version of the handler
 *
 * @example
 * ```typescript
 * const guardedStartBattle = createGuardedHandler(
 *   'battle.start',
 *   (trainerId, opponentId, scope) => scope,
 *   async (trainerId: string, opponentId: string, scope: TenantScope) => {
 *     return await battleEngine.startBattle(trainerId, opponentId);
 *   }
 * );
 *
 * // Later:
 * const battle = await guardedStartBattle(trainerId, opponentId, scope);
 * ```
 */
export function createGuardedHandler<TArgs extends unknown[], TResult>(
  name: string,
  scopeResolver: (...args: TArgs) => TenantScope,
  handler: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const scope = scopeResolver(...args);
    return runGuarded(() => handler(...args), { name, scope });
  };
}

/**
 * Wrap an existing handler function with runGuarded
 *
 * Simpler version that assumes scope is accessible via getCurrentScope()
 * or uses a system scope as fallback.
 *
 * @param name - Handler name for logging
 * @param handler - The handler function
 * @param defaultScope - Default scope if none in context (optional)
 * @returns A guarded version of the handler
 *
 * @example
 * ```typescript
 * const guardedProcess = wrapWithGuard(
 *   'cache.process',
 *   async (data: CacheData) => {
 *     // Process data
 *   },
 *   systemScope('cache-worker')
 * );
 * ```
 */
export function wrapWithGuard<TArgs extends unknown[], TResult>(
  name: string,
  handler: (...args: TArgs) => Promise<TResult>,
  defaultScope?: TenantScope
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const scope = getCurrentScope() ?? defaultScope ?? systemScope('unknown');
    return runGuarded(() => handler(...args), { name, scope });
  };
}

/**
 * Execute multiple handlers in parallel with individual guarding
 *
 * Each handler runs in its own guarded context. Failures in one handler
 * don't affect others.
 *
 * @param handlers - Array of handlers with their contexts
 * @returns Array of GuardedResult for each handler
 *
 * @example
 * ```typescript
 * const results = await runGuardedParallel([
 *   { handler: () => fetchUser(id), context: { name: 'user.fetch', scope } },
 *   { handler: () => fetchProfile(id), context: { name: 'profile.fetch', scope } },
 *   { handler: () => fetchSettings(id), context: { name: 'settings.fetch', scope } },
 * ]);
 *
 * const [userResult, profileResult, settingsResult] = results;
 * ```
 */
export async function runGuardedParallel<T>(
  handlers: Array<{
    handler: () => Promise<T>;
    context: Omit<RunGuardedContext, 'rethrow'>;
  }>
): Promise<Array<GuardedResult<T>>> {
  return Promise.all(
    handlers.map(({ handler, context }) => runGuardedSafe(handler, context))
  );
}

/**
 * Execute handlers sequentially with early exit on failure
 *
 * Runs handlers in order, stopping at the first failure.
 * Useful for dependent operations.
 *
 * @param handlers - Array of handlers with their contexts
 * @returns GuardedResult of the last executed handler
 *
 * @example
 * ```typescript
 * const result = await runGuardedSequence([
 *   { handler: () => validateInput(data), context: { name: 'input.validate', scope } },
 *   { handler: () => processData(data), context: { name: 'data.process', scope } },
 *   { handler: () => saveResult(data), context: { name: 'result.save', scope } },
 * ]);
 *
 * if (!result.success) {
 *   // One of the steps failed
 * }
 * ```
 */
export async function runGuardedSequence<T>(
  handlers: Array<{
    handler: () => Promise<T>;
    context: Omit<RunGuardedContext, 'rethrow'>;
  }>
): Promise<GuardedResult<T>> {
  let lastResult: GuardedResult<T> | undefined;

  for (const { handler, context } of handlers) {
    lastResult = await runGuardedSafe(handler, context);

    if (!lastResult.success) {
      // Stop at first failure
      return lastResult;
    }
  }

  // Return last result (or empty success if no handlers)
  return (
    lastResult ?? {
      success: true,
      durationMs: 0,
      correlationId: randomUUID(),
    }
  );
}
