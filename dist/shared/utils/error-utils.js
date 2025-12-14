/**
 * Shared error handling utilities
 * Centralized helpers for error normalization and formatting
 */
/**
 * Safely convert unknown error to serializable object
 * Handles Error instances, objects, and primitives
 * @param err - Unknown error value
 * @returns Serializable error object or undefined
 */
export function safeError(err) {
    if (!err)
        return undefined;
    if (err instanceof Error) {
        const result = {
            name: err.name,
            message: err.message,
        };
        // Include stack trace if available
        if (err.stack) {
            result.stack = err.stack;
        }
        // Include error code if present (e.g., NodeJS.ErrnoException)
        if ("code" in err && typeof err.code === "string") {
            result.code = err.code;
        }
        return result;
    }
    if (typeof err === "object" && err !== null) {
        return err;
    }
    return { value: String(err) };
}
/**
 * Normalize error to minimal metadata (name + message)
 * Useful for logging and caching error info without stack traces
 * @param err - Unknown error value
 * @returns Minimal error metadata
 */
export function normalizeError(err) {
    if (err instanceof Error) {
        const meta = {
            name: err.name,
            message: err.message,
        };
        // Include error code if present
        if ("code" in err && typeof err.code === "string") {
            meta.code = err.code;
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
export function formatError(err) {
    if (err instanceof Error) {
        return err.message;
    }
    if (typeof err === "string") {
        return err;
    }
    if (typeof err === "object" && err !== null) {
        if ("message" in err && typeof err.message === "string") {
            return err.message;
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
export function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
