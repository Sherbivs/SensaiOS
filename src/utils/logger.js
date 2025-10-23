const { interruptConsoleOutput } = require('./cliStatus');

const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR'
});

function withCliSafeWrite(_stream, fn) {
  if (typeof interruptConsoleOutput === 'function') {
    interruptConsoleOutput(() => {
      fn();
    });
    return;
  }
  fn();
}

function normalizeContext(context) {
  if (context instanceof Map) {
    return Object.fromEntries(context.entries());
  }
  if (context instanceof Set) {
    return Array.from(context.values());
  }
  return context;
}

function log(level, message, context, { debugMode = false } = {}) {
  const timestamp = new Date().toISOString();
  const label = LOG_LABEL[level] || LOG_LABEL.info;
  const writer = level === 'error' ? console.error : console.log;
  const stream = level === 'error' ? process.stderr : process.stdout;
  withCliSafeWrite(stream, () => writer(`[${timestamp}] [${label}] ${message}`));
  if (!context) {
    return;
  }

  const normalized = normalizeContext(context);

  if (debugMode) {
    if (typeof normalized === 'string') {
      withCliSafeWrite(stream, () => writer(`    ${normalized}`));
      return;
    }

    try {
      const serialized = JSON.stringify(normalized, null, 2);
      serialized.split('\n').forEach(line => withCliSafeWrite(stream, () => writer(`    ${line}`)));
      return;
    } catch {
      withCliSafeWrite(stream, () => writer(`    ${String(normalized)}`));
      return;
    }
  }

  if (Array.isArray(normalized)) {
    normalized.forEach(item => withCliSafeWrite(stream, () => writer(`    ${item}`)));
    return;
  }

  if (normalized && typeof normalized === 'object') {
    for (const [key, value] of Object.entries(normalized)) {
      withCliSafeWrite(stream, () => writer(`    ${key}: ${value}`));
    }
    return;
  }

  withCliSafeWrite(stream, () => writer(`    ${normalized}`));
}

function report(title, meta = {}, level = 'info') {
  const heading = `=== ${title} ===`;
  const timestamp = new Date().toISOString();
  const label = level.toUpperCase();
  const writer = level === 'error' ? console.error : console.log;
  const stream = level === 'error' ? process.stderr : process.stdout;
  withCliSafeWrite(stream, () => writer(`[${timestamp}] [${label}] ${heading}`));
  if (meta && typeof meta === 'object') {
    try {
      for (const [key, value] of Object.entries(meta)) {
        withCliSafeWrite(stream, () => writer(`    ${key}: ${value}`));
      }
    } catch {}
  }
}

module.exports = {
  LOG_LABEL,
  log,
  report,
};
