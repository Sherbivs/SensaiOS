/**
 * Fatal Error Guard - Global Exception Handling
 * @module utils/fatalErrorGuard
 *
 * Provides global handlers for unhandled promise rejections and
 * uncaught exceptions, ensuring proper logging and graceful shutdown.
 */
import util from 'node:util';
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
function asError(input) {
    if (input instanceof Error) {
        return input;
    }
    if (input && typeof input === 'object') {
        try {
            const inspected = util.inspect(input, { depth: 4, breakLength: 80 });
            return new Error(`Non-error rejection: ${inspected}`);
        }
        catch {
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
function scheduleExit(exitProcess) {
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
export function installFatalErrorHandlers(options = {}) {
    if (handlersInstalled) {
        return;
    }
    handlersInstalled = true;
    const { log, report, exitProcess = (code) => process.exit(code), } = options;
    const logFn = typeof log === 'function'
        ? log
        : (_level, message, context) => {
            // eslint-disable-next-line no-console
            console.error(message, context);
        };
    const reportFn = typeof report === 'function' ? report : null;
    function handleFatal(eventName, errorLike, extra = {}) {
        const error = asError(errorLike);
        const context = {
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
            }
            catch (reportError) {
                logFn('error', 'Fatal error reporter failed', { error: reportError });
            }
        }
        scheduleExit(exitProcess);
    }
    process.on('unhandledRejection', (reason) => {
        handleFatal('Unhandled Rejection', reason);
    });
    process.on('uncaughtException', (error) => {
        handleFatal('Uncaught Exception', error);
    });
}
// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────
export default { installFatalErrorHandlers };
