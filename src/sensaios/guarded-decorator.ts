/**
 * SensaiOS @guarded Decorator — TypeScript Decorator for Method Guarding
 *
 * Provides a decorator pattern for automatically wrapping class methods
 * with runGuarded(). This enables declarative observability without
 * modifying method implementations.
 *
 * NOTE: Requires TypeScript experimentalDecorators and emitDecoratorMetadata.
 *
 * @module sensaios/guarded-decorator
 * @since 2025-12-29
 */

import { runGuarded, type RunGuardedContext } from './run-guarded.js';
import { getCurrentScope, isTenantScope, systemScope, type TenantScope } from './tenant-scope.js';
import { validationError, VALIDATION_ERRORS } from './sensai-error.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Options for the @guarded decorator
 */
export interface GuardedDecoratorOptions {
  /**
   * Handler name for logging
   *
   * If not provided, uses `ClassName.methodName` format.
   */
  name?: string;

  /**
   * Timeout in milliseconds
   */
  timeoutMs?: number;

  /**
   * Index of the argument that contains the TenantScope (0-based)
   *
   * If not provided, attempts to find a TenantScope in arguments,
   * falls back to getCurrentScope(), then systemScope.
   */
  scopeArgIndex?: number;

  /**
   * Static scope to use (overrides scopeArgIndex)
   */
  scope?: TenantScope;

  /**
   * Additional metadata to include in logs
   */
  metadata?: Record<string, unknown>;

  /**
   * Whether to rethrow errors (default: true)
   */
  rethrow?: boolean;
}

// ============================================================================
// SCOPE RESOLUTION
// ============================================================================

/**
 * Resolve TenantScope from decorator options and method arguments
 */
function resolveScope(
  options: GuardedDecoratorOptions,
  args: unknown[],
  className: string,
  methodName: string
): TenantScope {
  // Option 1: Static scope provided in options
  if (options.scope) {
    return options.scope;
  }

  // Option 2: Scope at specific argument index
  if (options.scopeArgIndex !== undefined && args[options.scopeArgIndex]) {
    const arg = args[options.scopeArgIndex];
    if (isTenantScope(arg)) {
      return arg;
    }
  }

  // Option 3: Find TenantScope in arguments
  for (const arg of args) {
    if (isTenantScope(arg)) {
      return arg;
    }
  }

  // Option 4: Get from current context
  const contextScope = getCurrentScope();
  if (contextScope) {
    return contextScope;
  }

  // Option 5: Fall back to system scope
  return systemScope(`${className}.${methodName}`);
}

// ============================================================================
// METHOD DECORATOR
// ============================================================================

/**
 * Decorator to wrap a method with runGuarded
 *
 * Automatically wraps the decorated method with runGuarded(),
 * providing correlation ID injection, scope propagation, timing,
 * error capture, and logging.
 *
 * @param options - Decorator options (name, timeout, scope resolution)
 * @returns Method decorator
 *
 * @example
 * ```typescript
 * class BattleService {
 *   @guarded({ name: 'battle.start', timeoutMs: 60000 })
 *   async startBattle(trainerId: string, opponentId: string): Promise<Battle> {
 *     // Implementation
 *   }
 *
 *   @guarded({ scopeArgIndex: 2 })
 *   async executeTurn(
 *     battleId: string,
 *     move: Move,
 *     scope: TenantScope
 *   ): Promise<TurnResult> {
 *     // Implementation - scope is automatically extracted
 *   }
 * }
 * ```
 */
export function guarded(options: GuardedDecoratorOptions = {}) {
  return function <T extends (...args: unknown[]) => Promise<unknown>>(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> | void {
    const originalMethod = descriptor.value;

    if (!originalMethod) {
      throw validationError(
        VALIDATION_ERRORS.INVALID_INPUT,
        `@guarded can only decorate methods, not ${String(propertyKey)}`
      );
    }

    const className = target.constructor.name;
    const methodName = String(propertyKey);
    const handlerName = options.name ?? `${className}.${methodName}`;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const scope = resolveScope(options, args, className, methodName);

      const context: RunGuardedContext = {
        name: handlerName,
        scope,
        timeoutMs: options.timeoutMs,
        metadata: {
          ...options.metadata,
          className,
          methodName,
        },
        rethrow: options.rethrow,
      };

      return runGuarded(() => originalMethod.apply(this, args), context);
    } as T;

    return descriptor;
  };
}

// ============================================================================
// CLASS DECORATOR
// ============================================================================

/**
 * Options for the @guardedClass decorator
 */
export interface GuardedClassOptions {
  /**
   * Methods to exclude from guarding
   */
  exclude?: string[];

  /**
   * Methods to explicitly include (if provided, only these are guarded)
   */
  include?: string[];

  /**
   * Timeout for all methods
   */
  timeoutMs?: number;

  /**
   * Base name prefix for all methods
   *
   * @example "battle" results in "battle.startBattle", "battle.endBattle", etc.
   */
  namePrefix?: string;

  /**
   * Whether to rethrow errors (default: true)
   */
  rethrow?: boolean;
}

/**
 * Class decorator to wrap all async methods with runGuarded
 *
 * Automatically applies @guarded to all async methods in the class.
 *
 * @param options - Class-level options
 * @returns Class decorator
 *
 * @example
 * ```typescript
 * @guardedClass({ namePrefix: 'battle', exclude: ['toString'] })
 * class BattleService {
 *   async startBattle(trainerId: string): Promise<Battle> {
 *     // Automatically guarded as "battle.startBattle"
 *   }
 *
 *   async endBattle(battleId: string): Promise<void> {
 *     // Automatically guarded as "battle.endBattle"
 *   }
 *
 *   toString(): string {
 *     // Not guarded (excluded)
 *     return 'BattleService';
 *   }
 * }
 * ```
 */
export function guardedClass(options: GuardedClassOptions = {}) {
  return function <T extends new (...args: unknown[]) => object>(constructor: T): T {
    const prototype = constructor.prototype;
    const propertyNames = Object.getOwnPropertyNames(prototype);

    // Built-in methods to always exclude
    const builtInExclusions = ['constructor'];
    const exclusions = new Set([...builtInExclusions, ...(options.exclude ?? [])]);
    const inclusions = options.include ? new Set(options.include) : null;

    for (const propertyName of propertyNames) {
      // Skip excluded methods
      if (exclusions.has(propertyName)) {
        continue;
      }

      // Skip if not in inclusion list (when provided)
      if (inclusions && !inclusions.has(propertyName)) {
        continue;
      }

      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);

      // Skip non-methods
      if (!descriptor || typeof descriptor.value !== 'function') {
        continue;
      }

      // Check if method is async (returns promise)
      // Note: This is a heuristic - we wrap all functions and runGuarded
      // handles the Promise.resolve if needed
      const originalMethod = descriptor.value as (...args: unknown[]) => Promise<unknown>;

      const handlerName = options.namePrefix
        ? `${options.namePrefix}.${propertyName}`
        : `${constructor.name}.${propertyName}`;

      descriptor.value = async function (this: unknown, ...args: unknown[]) {
        const scope = resolveScope(
          { scopeArgIndex: undefined },
          args,
          constructor.name,
          propertyName
        );

        const context: RunGuardedContext = {
          name: handlerName,
          scope,
          timeoutMs: options.timeoutMs,
          metadata: {
            className: constructor.name,
            methodName: propertyName,
          },
          rethrow: options.rethrow,
        };

        return runGuarded(() => originalMethod.apply(this, args), context);
      };

      Object.defineProperty(prototype, propertyName, descriptor);
    }

    return constructor;
  };
}

// ============================================================================
// PROPERTY DECORATOR (for arrow function properties)
// ============================================================================

/**
 * Property decorator for guarding arrow function class properties
 *
 * Use this when you have class properties that are arrow functions
 * (which can't use method decorators).
 *
 * NOTE: This is more complex and requires runtime initialization.
 * Prefer regular methods with @guarded when possible.
 *
 * @param options - Decorator options
 * @returns Property decorator
 *
 * @example
 * ```typescript
 * class EventHandler {
 *   @guardedProperty({ name: 'event.handle' })
 *   handleEvent = async (event: Event) => {
 *     // Implementation
 *   };
 * }
 * ```
 */
export function guardedProperty(options: GuardedDecoratorOptions = {}) {
  return function (target: object, propertyKey: string | symbol): void {
    const className = target.constructor.name;
    const methodName = String(propertyKey);
    const handlerName = options.name ?? `${className}.${methodName}`;

    let originalValue: ((...args: unknown[]) => Promise<unknown>) | undefined;

    Object.defineProperty(target, propertyKey, {
      get() {
        return originalValue;
      },
      set(newValue: (...args: unknown[]) => Promise<unknown>) {
        if (typeof newValue !== 'function') {
          originalValue = newValue;
          return;
        }

        // Wrap the function
        originalValue = async (...args: unknown[]) => {
          const scope = resolveScope(options, args, className, methodName);

          const context: RunGuardedContext = {
            name: handlerName,
            scope,
            timeoutMs: options.timeoutMs,
            metadata: {
              ...options.metadata,
              className,
              methodName,
            },
            rethrow: options.rethrow,
          };

          return runGuarded(() => newValue.apply(this, args), context);
        };
      },
      enumerable: true,
      configurable: true,
    });
  };
}
