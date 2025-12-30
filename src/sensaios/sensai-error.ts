/**
 * SensaiError — Typed Error Taxonomy for Sensai OS
 *
 * Provides structured error codes for all kernel and component errors.
 * This is the canonical error type for Sensai OS - all kernel-level
 * errors should use this class instead of plain Error.
 *
 * Error Code Ranges:
 * - 1xxx: Kernel errors (boot, shutdown, primitives)
 * - 2xxx: Database errors (connection, transaction, query)
 * - 3xxx: Component errors (lifecycle, registry, supervisor)
 * - 4xxx: Validation errors (input, schema, business rules)
 * - 5xxx: External errors (Discord API, HTTP, third-party)
 * - 6xxx: Game errors (battle, encounter, inventory) - application layer
 *
 * @module sensaios/sensai-error
 * @since 2025-12-29
 */

import type { TenantScope } from './tenant-scope.js';

// ============================================================================
// ERROR CODE DEFINITIONS
// ============================================================================

/**
 * Kernel error codes (1xxx)
 */
export const KERNEL_ERRORS = {
  // Boot errors (10xx)
  BOOT_FAILED: 1001,
  BOOT_TIMEOUT: 1002,
  BOOT_ALREADY_INITIALIZED: 1003,
  BOOT_NOT_INITIALIZED: 1004,
  BOOT_DB_UNAVAILABLE: 1005,

  // Shutdown errors (11xx)
  SHUTDOWN_TIMEOUT: 1101,
  SHUTDOWN_FAILED: 1102,

  // Primitive errors (12xx)
  CORRELATION_MISSING: 1201,
  SCOPE_MISSING: 1202,
  CONTEXT_INVALID: 1203,
  CONTEXT_MISSING: 1204,

  // Configuration errors (13xx)
  CONFIG_INVALID: 1301,
  CONFIG_MISSING: 1302,
} as const;

/**
 * Database error codes (2xxx)
 */
export const DATABASE_ERRORS = {
  // Connection errors (20xx)
  CONNECTION_FAILED: 2001,
  CONNECTION_TIMEOUT: 2002,
  CONNECTION_POOL_EXHAUSTED: 2003,
  NOT_AVAILABLE: 2004,

  // Transaction errors (21xx)
  TRANSACTION_FAILED: 2101,
  TRANSACTION_TIMEOUT: 2102,
  TRANSACTION_ROLLBACK: 2103,

  // Query errors (22xx)
  QUERY_FAILED: 2201,
  QUERY_TIMEOUT: 2202,
  CONSTRAINT_VIOLATION: 2203,

  // Schema errors (23xx)
  MIGRATION_FAILED: 2301,
  SCHEMA_MISMATCH: 2302,
} as const;

/**
 * Component error codes (3xxx)
 */
export const COMPONENT_ERRORS = {
  // Registry errors (30xx)
  NOT_FOUND: 3001,
  ALREADY_REGISTERED: 3002,
  INVALID_STATE: 3003,
  HAS_DEPENDENTS: 3004,
  VALIDATION_FAILED: 3005,

  // Lifecycle errors (31xx)
  ENABLE_FAILED: 3101,
  DISABLE_FAILED: 3102,
  UNMET_DEPENDENCIES: 3103,
  CIRCULAR_DEPENDENCIES: 3104,

  // Supervisor errors (32xx)
  SUPERVISOR_NOT_READY: 3201,
  SUPERVISOR_BOOT_FAILED: 3202,

  // Handler errors (33xx)
  HANDLER_TIMEOUT: 3301,
  HANDLER_FAILED: 3302,
  HANDLER_NOT_FOUND: 3303,
} as const;

/**
 * Validation error codes (4xxx)
 */
export const VALIDATION_ERRORS = {
  // Input errors (40xx)
  INVALID_INPUT: 4001,
  MISSING_REQUIRED: 4002,
  TYPE_MISMATCH: 4003,

  // Schema errors (41xx)
  SCHEMA_INVALID: 4101,
  FORMAT_INVALID: 4102,

  // Business rule errors (42xx)
  RULE_VIOLATION: 4201,
  PERMISSION_DENIED: 4202,
  RATE_LIMITED: 4203,
} as const;

/**
 * External error codes (5xxx)
 */
export const EXTERNAL_ERRORS = {
  // Discord errors (50xx)
  DISCORD_API_ERROR: 5001,
  DISCORD_RATE_LIMITED: 5002,
  DISCORD_TIMEOUT: 5003,
  DISCORD_PERMISSION_DENIED: 5004,

  // HTTP errors (51xx)
  HTTP_REQUEST_FAILED: 5101,
  HTTP_TIMEOUT: 5102,
  HTTP_RATE_LIMITED: 5103,

  // Third-party errors (52xx)
  EXTERNAL_SERVICE_ERROR: 5201,
  EXTERNAL_TIMEOUT: 5202,
} as const;

/**
 * Game error codes (6xxx) - Application layer, not kernel
 */
export const GAME_ERRORS = {
  // Battle errors (60xx)
  BATTLE_INVALID_STATE: 6001,
  BATTLE_NOT_FOUND: 6002,
  BATTLE_ALREADY_ENDED: 6003,

  // Encounter errors (61xx)
  ENCOUNTER_SPAWN_FAILED: 6101,
  ENCOUNTER_NOT_FOUND: 6102,

  // Inventory errors (62xx)
  INVENTORY_FULL: 6201,
  ITEM_NOT_FOUND: 6202,
  INSUFFICIENT_QUANTITY: 6203,

  // Trainer errors (63xx)
  TRAINER_NOT_FOUND: 6301,
  TRAINER_INVALID_STATE: 6302,
} as const;

// ============================================================================
// SENSAI ERROR CLASS
// ============================================================================

/**
 * Options for creating a SensaiError
 */
export interface SensaiErrorOptions {
  /** Error code (1xxx-6xxx) */
  code: number;

  /** Human-readable error message */
  message: string;

  /** Tenant scope (if available) */
  scope?: TenantScope;

  /** Correlation ID (if available) */
  correlationId?: string;

  /** Original error that caused this (for wrapping) */
  cause?: Error;

  /** Additional context data */
  context?: Record<string, unknown>;
}

/**
 * SensaiError — Typed error for Sensai OS kernel and components
 *
 * Use this class for all kernel-level errors instead of plain Error.
 * Provides structured error codes, tenant scope, and correlation tracking.
 *
 * @example
 * ```typescript
 * throw new SensaiError({
 *   code: KERNEL_ERRORS.BOOT_NOT_INITIALIZED,
 *   message: 'Kernel not initialized - call initKernel() first',
 *   correlationId: ctx.correlationId,
 * });
 * ```
 */
export class SensaiError extends Error {
  /** Error code (1xxx-6xxx) */
  public readonly code: number;

  /** Error category derived from code range */
  public readonly category: ErrorCategory;

  /** Tenant scope (if available) */
  public readonly scope?: TenantScope;

  /** Correlation ID (if available) */
  public readonly correlationId?: string;

  /** Additional context data */
  public readonly context?: Record<string, unknown>;

  /** Timestamp when error was created */
  public readonly timestamp: string;

  constructor(options: SensaiErrorOptions) {
    super(options.message, { cause: options.cause });

    this.name = 'SensaiError';
    this.code = options.code;
    this.category = this.deriveCategory(options.code);
    this.scope = options.scope;
    this.correlationId = options.correlationId;
    this.context = options.context;
    this.timestamp = new Date().toISOString();

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SensaiError.prototype);
  }

  /**
   * Derive error category from code range
   */
  private deriveCategory(code: number): ErrorCategory {
    if (code >= 1000 && code < 2000) return 'kernel';
    if (code >= 2000 && code < 3000) return 'database';
    if (code >= 3000 && code < 4000) return 'component';
    if (code >= 4000 && code < 5000) return 'validation';
    if (code >= 5000 && code < 6000) return 'external';
    if (code >= 6000 && code < 7000) return 'game';
    return 'unknown';
  }

  /**
   * Convert to a plain object for logging/serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      scope: this.scope,
      correlationId: this.correlationId,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
      cause: this.cause instanceof Error ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      } : this.cause,
    };
  }

  /**
   * Create a formatted log message
   */
  toLogString(): string {
    const parts = [
      `[${this.code}]`,
      `[${this.category.toUpperCase()}]`,
      this.message,
    ];

    if (this.correlationId) {
      parts.push(`(corr: ${this.correlationId.slice(0, 8)})`);
    }

    return parts.join(' ');
  }

  /**
   * Wrap an unknown error as SensaiError
   */
  static wrap(error: unknown, defaultCode: number = 1001): SensaiError {
    if (error instanceof SensaiError) {
      return error;
    }

    if (error instanceof Error) {
      return new SensaiError({
        code: defaultCode,
        message: error.message,
        cause: error,
        context: { originalName: error.name },
      });
    }

    return new SensaiError({
      code: defaultCode,
      message: String(error),
      context: { originalValue: error },
    });
  }

  /**
   * Check if an error is a SensaiError with a specific code range
   */
  static isKernelError(error: unknown): error is SensaiError {
    return error instanceof SensaiError && error.code >= 1000 && error.code < 2000;
  }

  static isDatabaseError(error: unknown): error is SensaiError {
    return error instanceof SensaiError && error.code >= 2000 && error.code < 3000;
  }

  static isComponentError(error: unknown): error is SensaiError {
    return error instanceof SensaiError && error.code >= 3000 && error.code < 4000;
  }

  static isValidationError(error: unknown): error is SensaiError {
    return error instanceof SensaiError && error.code >= 4000 && error.code < 5000;
  }

  static isExternalError(error: unknown): error is SensaiError {
    return error instanceof SensaiError && error.code >= 5000 && error.code < 6000;
  }

  static isGameError(error: unknown): error is SensaiError {
    return error instanceof SensaiError && error.code >= 6000 && error.code < 7000;
  }
}

// ============================================================================
// ERROR CATEGORY TYPE
// ============================================================================

/**
 * Error category derived from code range
 */
export type ErrorCategory =
  | 'kernel'
  | 'database'
  | 'component'
  | 'validation'
  | 'external'
  | 'game'
  | 'unknown';

// ============================================================================
// KERNEL SCOPE CONSTANT
// ============================================================================

/**
 * Kernel scope for boot/shutdown operations that don't have tenant context.
 * Use this when logging kernel-level operations before tenant scope is available.
 */
export const KERNEL_SCOPE: TenantScope = {
  tenant: '__kernel__',
  environment: 'development',
  service: 'sensai-kernel',
  component: 'boot',
};

// ============================================================================
// CONVENIENCE FACTORIES
// ============================================================================

/**
 * Create a kernel error
 */
export function kernelError(
  code: (typeof KERNEL_ERRORS)[keyof typeof KERNEL_ERRORS],
  message: string,
  options?: Omit<SensaiErrorOptions, 'code' | 'message'>
): SensaiError {
  return new SensaiError({ code, message, ...options });
}

/**
 * Create a database error
 */
export function databaseError(
  code: (typeof DATABASE_ERRORS)[keyof typeof DATABASE_ERRORS],
  message: string,
  options?: Omit<SensaiErrorOptions, 'code' | 'message'>
): SensaiError {
  return new SensaiError({ code, message, ...options });
}

/**
 * Create a component error
 */
export function componentError(
  code: (typeof COMPONENT_ERRORS)[keyof typeof COMPONENT_ERRORS],
  message: string,
  options?: Omit<SensaiErrorOptions, 'code' | 'message'>
): SensaiError {
  return new SensaiError({ code, message, ...options });
}

/**
 * Create a validation error
 */
export function validationError(
  code: (typeof VALIDATION_ERRORS)[keyof typeof VALIDATION_ERRORS],
  message: string,
  options?: Omit<SensaiErrorOptions, 'code' | 'message'>
): SensaiError {
  return new SensaiError({ code, message, ...options });
}

/**
 * Create an external error
 */
export function externalError(
  code: (typeof EXTERNAL_ERRORS)[keyof typeof EXTERNAL_ERRORS],
  message: string,
  options?: Omit<SensaiErrorOptions, 'code' | 'message'>
): SensaiError {
  return new SensaiError({ code, message, ...options });
}

/**
 * Create a game error
 */
export function gameError(
  code: (typeof GAME_ERRORS)[keyof typeof GAME_ERRORS],
  message: string,
  options?: Omit<SensaiErrorOptions, 'code' | 'message'>
): SensaiError {
  return new SensaiError({ code, message, ...options });
}
