/**
 * Base Application Error
 * ====================
 *
 * Foundation for all custom error types in the Infinity Gauntlet application.
 * Provides error codes, categorization, context, and serialization.
 *
 * @module errors/base
 * @since 2025-12-16
 *
 * Features:
 * - Base AppError class with error codes
 * - Error categorization (operational vs programming)
 * - Rich context for debugging and logging
 * - Serialization for transport/logging
 * - Error wrapping for cause chains
 * - Unique error instance IDs
 *
 * @example
 * ```typescript
 * import { AppError, isAppError } from './base.js';
 *
 * // Create custom error
 * throw new AppError('Something went wrong', 'APP_ERR_001', {
 *   userId: '12345',
 *   operation: 'createParty',
 * });
 *
 * // Check if error is an app error
 * if (isAppError(error)) {
 *   logger.error(error.toJSON());
 * }
 * ```
 */

import { randomUUID } from "crypto";

// ============================================================================
// Error Code Prefixes
// ============================================================================

/**
 * Error code prefixes by domain.
 */
export const ERROR_DOMAIN_PREFIX = {
  /** Application-level errors */
  APP: "APP",
  /** Database errors */
  DATABASE: "DB",
  /** Game engine errors */
  GAME: "GAME",
  /** Discord bot errors */
  DISCORD: "DISC",
  /** Validation errors */
  VALIDATION: "VAL",
  /** Configuration errors */
  CONFIG: "CFG",
  /** Worker/background job errors */
  WORKER: "WRK",
  /** External service errors */
  EXTERNAL: "EXT",
  /** Cache errors */
  CACHE: "CACHE",
} as const;

export type ErrorDomain = keyof typeof ERROR_DOMAIN_PREFIX;

/**
 * Error severity levels.
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * Whether the error is operational (expected) or programming (bug).
 * - operational: Expected errors (user input, network issues, etc.)
 * - programming: Bugs that should be fixed (null refs, type errors, etc.)
 */
export type ErrorType = "operational" | "programming";

// ============================================================================
// Error Context
// ============================================================================

/**
 * Base error context for all errors.
 */
export interface ErrorContext {
  /** Unique error instance ID */
  errorId?: string;
  /** Correlation ID for request tracing */
  correlationId?: string;
  /** User ID if applicable */
  userId?: string;
  /** Operation being performed */
  operation?: string;
  /** Additional metadata */
  [key: string]: unknown;
}

/**
 * Serialized error format for transport/logging.
 */
export interface SerializedError {
  name: string;
  message: string;
  code: string;
  domain: ErrorDomain;
  severity: ErrorSeverity;
  type: ErrorType;
  context: ErrorContext;
  stack?: string;
  cause?: SerializedError;
  timestamp: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique error ID.
 */
export function generateErrorId(): string {
  return `err_${randomUUID().slice(0, 8)}`;
}

/**
 * Extract domain from error code.
 */
export function getDomainFromCode(code: string): ErrorDomain {
  const prefix = code.split("_")[0];
  const entry = Object.entries(ERROR_DOMAIN_PREFIX).find(
    ([, value]) => value === prefix
  );
  return (entry?.[0] as ErrorDomain) ?? "APP";
}

// ============================================================================
// Base Error Class
// ============================================================================

/**
 * Base class for all application errors.
 *
 * Provides error code, domain, context, and serialization.
 */
export class AppError extends Error {
  /** Error code for categorization */
  readonly code: string;
  /** Error domain */
  readonly domain: ErrorDomain;
  /** Error severity */
  readonly severity: ErrorSeverity;
  /** Operational or programming error */
  readonly type: ErrorType;
  /** Error context */
  readonly context: ErrorContext;
  /** Unique error instance ID */
  readonly errorId: string;
  /** Timestamp of error creation */
  readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    context: ErrorContext = {},
    options?: {
      severity?: ErrorSeverity;
      type?: ErrorType;
      cause?: Error;
    }
  ) {
    super(message, { cause: options?.cause });
    this.name = this.constructor.name;
    this.code = code;
    this.domain = getDomainFromCode(code);
    this.severity = options?.severity ?? "medium";
    this.type = options?.type ?? "operational";
    this.errorId = context.errorId ?? generateErrorId();
    this.context = { ...context, errorId: this.errorId };
    this.timestamp = new Date();

    // Maintain proper stack trace
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Serialize error for transport/logging.
   */
  toJSON(): SerializedError {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      domain: this.domain,
      severity: this.severity,
      type: this.type,
      context: this.context,
      stack: this.stack,
      cause: this.cause instanceof AppError ? this.cause.toJSON() : undefined,
      timestamp: this.timestamp.toISOString(),
    };
  }

  /**
   * Create a string representation.
   */
  override toString(): string {
    return `[${this.code}] ${this.name}: ${this.message}`;
  }

  /**
   * Check if this error is retryable.
   */
  isRetryable(): boolean {
    return this.type === "operational" && this.severity !== "critical";
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an error is an AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if an error has a specific code.
 */
export function hasErrorCode(error: unknown, code: string): boolean {
  return isAppError(error) && error.code === code;
}

/**
 * Check if an error is in a specific domain.
 */
export function isInDomain(error: unknown, domain: ErrorDomain): boolean {
  return isAppError(error) && error.domain === domain;
}
