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
 * Check if error is a specific type (e.g., ENOENT, ECONNREFUSED)
 * @param err - Unknown error value
 * @param code - Error code to check (e.g., "ENOENT")
 * @returns true if error matches the code
 */
export function isErrorCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== "object") return false;
  return "code" in err && (err as any).code === code;
}

/**
 * Check if error is a timeout error
 * @param err - Unknown error value
 * @returns true if error is timeout-related
 */
export function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.toLowerCase().includes("timeout") ||
      err.message.toLowerCase().includes("timed out") ||
      err.name === "TimeoutError"
    );
  }
  return false;
}

/**
 * Aggregate multiple errors into a single error message
 * Useful for batch operations that may fail partially
 * @param errors - Array of errors
 * @param context - Optional context string
 * @returns Combined error message
 */
export function aggregateErrors(errors: unknown[], context?: string): Error {
  const messages = errors.map((err) => formatError(err));
  const prefix = context ? `${context}: ` : "";
  const combined = messages.join("; ");
  return new Error(`${prefix}${combined}`);
}

/**
 * Wrap an error with additional context
 * Preserves original error while adding context
 * @param err - Original error
 * @param context - Additional context
 * @returns New error with combined message
 */
export function wrapError(err: unknown, context: string): Error {
  const original = formatError(err);
  const wrapped = new Error(`${context}: ${original}`);
  
  // Preserve stack trace from original if available
  if (err instanceof Error && err.stack) {
    wrapped.stack = `${wrapped.stack}\n\nCaused by:\n${err.stack}`;
  }
  
  return wrapped;
}
