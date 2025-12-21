/* eslint-disable no-console */
/**
 * Error Handling Library
 * 
 * Consistent error types and error boundary patterns for CLI scripts.
 * 
 * @module scripts/lib/errors
 * @since 2025-12-21
 */

import { printError, printWarning, c } from './output.js';

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error for all script errors
 */
export class ScriptError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ScriptError';
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Environment/configuration errors
 */
export class EnvError extends ScriptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'ENV_ERROR', details);
    this.name = 'EnvError';
  }
}

/**
 * SSH connection errors
 */
export class SSHError extends ScriptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SSH_ERROR', details);
    this.name = 'SSHError';
  }
}

/**
 * Command execution errors
 */
export class ExecError extends ScriptError {
  public readonly exitCode?: number;
  public readonly stderr?: string;

  constructor(
    message: string,
    exitCode?: number,
    stderr?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'EXEC_ERROR', details);
    this.name = 'ExecError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

/**
 * File system errors
 */
export class FileError extends ScriptError {
  public readonly path: string;

  constructor(message: string, path: string, details?: Record<string, unknown>) {
    super(message, 'FILE_ERROR', { ...details, path });
    this.name = 'FileError';
    this.path = path;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends ScriptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

// ============================================================================
// Error Handling Functions
// ============================================================================

/**
 * Format an error for display
 */
export function formatError(error: unknown): string {
  if (error instanceof ScriptError) {
    let msg = `[${error.code}] ${error.message}`;
    if (error.details && Object.keys(error.details).length > 0) {
      msg += `\n  Details: ${JSON.stringify(error.details)}`;
    }
    return msg;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return String(error);
}

/**
 * Handle an error with appropriate output and exit
 */
export function handleError(error: unknown, exitCode = 1): never {
  const message = formatError(error);
  printError(message);
  
  // Print stack trace in debug mode
  if (process.env.DEBUG === '1' && error instanceof Error && error.stack) {
    console.error(c.dim(error.stack));
  }
  
  process.exit(exitCode);
}

/**
 * Wrap an async function with error boundary
 */
export function withErrorBoundary<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  exitOnError = true
): (...args: T) => Promise<R | void> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (exitOnError) {
        handleError(error);
      } else {
        printError(formatError(error));
      }
    }
  };
}

/**
 * Try-catch wrapper that returns [error, result] tuple
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<[Error | null, T | null]> {
  try {
    const result = await fn();
    return [null, result];
  } catch (error) {
    return [error instanceof Error ? error : new Error(String(error)), null];
  }
}

/**
 * Assert a condition, throw ValidationError if false
 */
export function assert(
  condition: boolean,
  message: string,
  details?: Record<string, unknown>
): asserts condition {
  if (!condition) {
    throw new ValidationError(message, details);
  }
}

/**
 * Warn without exiting
 */
export function warn(message: string): void {
  printWarning(message);
}

// ============================================================================
// Export Default
// ============================================================================

export default {
  ScriptError,
  EnvError,
  SSHError,
  ExecError,
  FileError,
  ValidationError,
  formatError,
  handleError,
  withErrorBoundary,
  tryCatch,
  assert,
  warn,
};
