import util from 'node:util';

let handlersInstalled = false;
let exitScheduled = false;

function asError(input) {
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

function scheduleExit(exitProcess) {
  if (!exitProcess || exitScheduled) {
    return;
  }
  exitScheduled = true;
  setImmediate(() => {
    exitProcess(1);
  });
}

function installFatalErrorHandlers({
  log,
  report,
  exitProcess = (code) => process.exit(code),
} = {}) {
  if (handlersInstalled) {
    return;
  }
  handlersInstalled = true;

  const logFn = typeof log === 'function'
    ? log
    : (level, message, context) => {
        if (level === 'error') {
          // eslint-disable-next-line no-console
          console.error(message, context);
        }
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
      } catch (reportError) {
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

export { installFatalErrorHandlers };

export default { installFatalErrorHandlers };
