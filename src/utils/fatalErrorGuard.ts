/**
 * Fatal Error Guard - Global Exception Handling
 * @module utils/fatalErrorGuard
 * 
 * Provides global handlers for unhandled promise rejections and
 * uncaught exceptions, ensuring proper logging and graceful shutdown.
 */

import util from 'node:util';
import { lokiTransport } from '../shared/logging/loki-transport.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

type LogFunction = (level: LogLevel, message: string, context?: Record<string, unknown>) => void;

type ReportFunction = (eventName: string, context: Record<string, unknown>, level: string) => void;

type ExitFunction = (code: number) => void | never;

interface FatalErrorHandlerOptions {
  /** Custom logging function */
  log?: LogFunction;
  /** Optional error reporting function (e.g., Sentry, ErrorTracker) */
  report?: ReportFunction | null;
  /** Custom process exit function */
  exitProcess?: ExitFunction;
}

interface FatalContext {
  event: string;
  name: string;
  message: string;
  stack?: string;
  [key: string]: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let handlersInstalled = false;
let exitScheduled = false;

// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert any input into an Error object.
 */
function asError(input: unknown): Error {
  if (input instanceof Error) {
    return input;
  }
  if (input && typeof input === 'object') {
    try {
      const inspected = util.inspect(input, { depth: 4, breakLength: 80 });
      return new Error(`Non-error rejection: ${inspected}`);
    } catch {
      return new Error('Non-error rejection received (inspection failed)');
    }
  }
  if (input === undefined) {
    return new Error('Unknown rejection reason (undefined)');
  }
  return new Error(String(input));
}

/**
 * Schedule a process exit (only once).
 */
function scheduleExit(exitProcess: ExitFunction): void {
  if (!exitProcess || exitScheduled) {
    return;
  }
  exitScheduled = true;
  setImmediate(() => {
    exitProcess(1);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Install global handlers for unhandled rejections and uncaught exceptions.
 * Only installs once; subsequent calls are no-ops.
 */
export function installFatalErrorHandlers(
  options: FatalErrorHandlerOptions = {}
): void {
  if (handlersInstalled) {
    return;
  }
  handlersInstalled = true;

  const {
    log,
    report,
    exitProcess = (code: number): never => process.exit(code),
  } = options;

  const logFn: LogFunction = typeof log === 'function'
    ? log
    : (_level, message, context) => {
        // eslint-disable-next-line no-console
        console.error(message, context);
        // Also forward to Loki for observability
        try {
          lokiTransport.push({
            level: 'error',
            message,
            timestamp: new Date().toISOString(),
            service: 'FatalErrorGuard',
            data: context
          });
        } catch {
          // Loki not available - graceful degradation
        }
      };

  const reportFn = typeof report === 'function' ? report : null;

  function handleFatal(
    eventName: string, 
    errorLike: unknown, 
    extra: Record<string, unknown> = {}
  ): void {
    const error = asError(errorLike);
    const context: FatalContext = {
      event: eventName,
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...extra,
    };

    logFn('error', `${eventName} detected`, { error, ...extra });
    
    if (reportFn) {
      try {
        reportFn(eventName, context, 'error');
      } catch (reportError) {
        logFn('error', 'Fatal error reporter failed', { error: reportError });
      }
    }
    
    scheduleExit(exitProcess);
  }

  process.on('unhandledRejection', (reason: unknown) => {
    handleFatal('Unhandled Rejection', reason);
  });

  process.on('uncaughtException', (error: Error) => {
    handleFatal('Uncaught Exception', error);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export default { installFatalErrorHandlers };
