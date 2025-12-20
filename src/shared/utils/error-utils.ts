/**
 * Shared error handling utilities
 * Centralized helpers for error normalization and formatting
 */

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
 * @param err - Unknown error value
 * @returns Human-readable error message
 */
export function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  
  if (typeof err === "string") {
    return err;
  }
  
  if (typeof err === "object" && err !== null) {
    if ("message" in err && typeof (err as any).message === "string") {
      return (err as any).message;
    }
  }
  
  return "An unknown error occurred";
}

/**
 * Extract error message string from unknown error
 * Common pattern: safely get error.message or convert to string
 * @param error - Unknown error value
 * @returns Error message string
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
  return error instanceof Error ? error.message : String(error);
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
