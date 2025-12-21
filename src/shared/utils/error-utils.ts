/**
 * Shared error handling utilities
 * Centralized helpers for error normalization and formatting
 */

import { scrubPII } from './pii-scrubber.js';

/**
 * Error metadata type (simplified error representation)
 */
export type ErrorMeta = {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
  [key: string]: unknown;
};

/**
 * Safely convert unknown error to serializable object
 * Handles Error instances, objects, and primitives
 * @param err - Unknown error value
 * @returns Serializable error object or undefined
 */
export function safeError(err: unknown): Record<string, unknown> | undefined {
  if (!err) return undefined;
  
  if (err instanceof Error) {
    const result: Record<string, unknown> = {
      name: err.name,
      message: err.message,
    };
    
    // Include stack trace if available
    if (err.stack) {
      result.stack = err.stack;
    }
    
    // Include error code if present (e.g., NodeJS.ErrnoException)
    if ("code" in err && typeof (err as any).code === "string") {
      result.code = (err as any).code;
    }
    
    return result;
  }
  
  if (typeof err === "object" && err !== null) {
    return err as Record<string, unknown>;
  }
  
  return { value: String(err) };
}

/**
 * Normalize error to minimal metadata (name + message)
 * Useful for logging and caching error info without stack traces
 * @param err - Unknown error value
 * @returns Minimal error metadata
 */
export function normalizeError(err: unknown): ErrorMeta {
  if (err instanceof Error) {
    const meta: ErrorMeta = {
      name: err.name,
      message: err.message,
    };
    
    // Include error code if present
    if ("code" in err && typeof (err as any).code === "string") {
      meta.code = (err as any).code;
    }
    
    return meta;
  }
  
  return { message: String(err) };
}

/**
 * Format error for user-friendly display
 * Extracts useful information without exposing stack traces
 * Automatically scrubs PII from error messages.
 * @param err - Unknown error value
 * @returns Human-readable error message (PII-scrubbed)
 */
export function formatError(err: unknown): string {
  let message: string;
  
  if (err instanceof Error) {
    message = err.message;
  } else if (typeof err === "string") {
    message = err;
  } else if (typeof err === "object" && err !== null) {
    if ("message" in err && typeof (err as any).message === "string") {
      message = (err as any).message;
    } else {
      message = "An unknown error occurred";
    }
  } else {
    message = "An unknown error occurred";
  }
  
  return scrubPII(message);
}

/**
 * Extract error message string from unknown error
 * Common pattern: safely get error.message or convert to string
 * Automatically scrubs PII from error messages before returning.
 * @param error - Unknown error value
 * @returns Error message string (PII-scrubbed)
 * 
 * @example
 * ```typescript
 * try {
 *   // risky operation
 * } catch (error) {
 *   log.error(getErrorMessage(error)); // replaces: error instanceof Error ? error.message : String(error)
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return scrubPII(message);
}

/**
 * Ensure value is an Error instance
 * Wraps non-Error values in a new Error
 * @param error - Unknown error value
 * @returns Error instance (original if already Error, new Error otherwise)
 * 
 * @example
 * ```typescript
 * try {
 *   // risky operation
 * } catch (err) {
 *   const error = ensureError(err); // replaces: err instanceof Error ? err : new Error(String(err))
 *   console.error(error.message);
 *   console.error(error.stack);
 * }
 * ```
 */
export function ensureError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Get Error instance or undefined if not an Error
 * Useful for cause parameter in custom Error constructors
 * @param error - Unknown error value
 * @returns Error instance if input is Error, undefined otherwise
 * 
 * @example
 * ```typescript
 * throw new CustomError(
 *   'Operation failed',
 *   getErrorCause(error) // replaces: error instanceof Error ? error : undefined
 * );
 * ```
 */
export function getErrorCause(error: unknown): Error | undefined {
  return error instanceof Error ? error : undefined;
}
