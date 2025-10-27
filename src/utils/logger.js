import util from 'node:util';

import { interruptConsoleOutput } from './cliStatus.js';
import opsNotifier from './opsNotifier.js';

const LOG_LABEL = Object.freeze({
  success: 'SUCCESS',
  info: 'INFO',
  warn: 'WARN',
  detail: 'DETAIL',
  error: 'ERROR',
});

const LEVEL_CONFIG = Object.freeze({
  success: { label: LOG_LABEL.success, writer: console.log, stream: process.stdout },
  info: { label: LOG_LABEL.info, writer: console.log, stream: process.stdout },
  detail: { label: LOG_LABEL.detail, writer: console.log, stream: process.stdout },
  warn: { label: LOG_LABEL.warn, writer: console.warn, stream: process.stderr },
  error: { label: LOG_LABEL.error, writer: console.error, stream: process.stderr },
});

function getLevelConfig(level = 'info') {
  if (level && LEVEL_CONFIG[level]) {
    return LEVEL_CONFIG[level];
  }
  return LEVEL_CONFIG.info;
}

function withCliSafeWrite(_stream, fn) {
  if (typeof interruptConsoleOutput === 'function') {
    interruptConsoleOutput(() => {
      fn();
    });
    return;
  }
  fn();
}

function normalizeContext(context, seen = new WeakSet()) {
  if (context === null || context === undefined) {
    return context;
  }
  if (typeof context === 'bigint') {
    return context.toString();
  }
  if (context instanceof Date) {
    return context.toISOString();
  }
  if (context instanceof Error) {
    const errorData = {
      name: context.name || 'Error',
      message: context.message || String(context),
    };
    if (context.code !== undefined) {
      errorData.code = context.code;
    }
    if (context.stack) {
      errorData.stack = context.stack;
    }
    for (const key of Object.keys(context)) {
      if (errorData[key] !== undefined) {
        continue;
      }
      errorData[key] = normalizeContext(context[key], seen);
    }
    return errorData;
  }
  if (context instanceof Map) {
    return Object.fromEntries(Array.from(context.entries(), ([key, value]) => [key, normalizeContext(value, seen)]));
  }
  if (context instanceof Set) {
    return Array.from(context.values(), (value) => normalizeContext(value, seen));
  }
  if (Array.isArray(context)) {
    return context.map((value) => normalizeContext(value, seen));
  }
  if (typeof context === 'function') {
    return context.name ? `[Function ${context.name}]` : '[Function]';
  }
  if (typeof context === 'symbol') {
    return context.toString();
  }
  if (typeof context === 'object') {
    if (seen.has(context)) {
      return '[Circular]';
    }
    seen.add(context);
    const output = {};
    for (const [key, value] of Object.entries(context)) {
      output[key] = normalizeContext(value, seen);
    }
    seen.delete(context);
    return output;
  }
  return context;
}

function formatLines(lines, writer, stream) {
  for (const line of lines) {
    withCliSafeWrite(stream, () => writer(`    ${line}`));
  }
}

function emitInspected(value, { debugMode }) {
  const inspectOptions = {
    depth: debugMode ? null : 4,
    colors: false,
    compact: !debugMode,
    breakLength: 80,
    sorted: false,
  };
  const inspected = util.inspect(value, inspectOptions);
  return inspected.split('\n');
}

function log(level, message, context, { debugMode = false } = {}) {
  const normalizedLevel = level && LOG_LABEL[level] ? level : 'info';
  const { label, writer, stream } = getLevelConfig(normalizedLevel);
  const timestamp = new Date().toISOString();
  withCliSafeWrite(stream, () => writer(`[${timestamp}] [${label}] ${message}`));
  const normalized = normalizeContext(context);

  if (normalizedLevel === 'error' && opsNotifier && typeof opsNotifier.recordError === 'function') {
    try {
      opsNotifier.recordError({
        message,
        context: normalized,
        timestamp: new Date(timestamp),
        level: normalizedLevel,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[logger opsNotifier]', error instanceof Error ? error.message : error);
    }
  }

  if (!context) {
    return;
  }

  if (Array.isArray(normalized)) {
    for (const item of normalized) {
      const lines = emitInspected(item, { debugMode });
      if (lines.length === 0) {
        continue;
      }
      const [first, ...rest] = lines;
      formatLines([`- ${first}`, ...rest.map((line) => `  ${line}`)], writer, stream);
    }
    return;
  }

  if (normalized && typeof normalized === 'object') {
    for (const [key, value] of Object.entries(normalized)) {
      const lines = emitInspected(value, { debugMode });
      if (lines.length === 0) {
        continue;
      }
      const [first, ...rest] = lines;
      formatLines([`${key}: ${first}`, ...rest.map((line) => `  ${line}`)], writer, stream);
    }
    return;
  }

  if (typeof normalized === 'string') {
    const lines = normalized.split('\n');
    formatLines(lines, writer, stream);
    return;
  }

  formatLines([String(normalized)], writer, stream);
}

function report(title, meta = {}, level = 'info') {
  const normalizedLevel = level && LOG_LABEL[level] ? level : 'info';
  const { label, writer, stream } = getLevelConfig(normalizedLevel);
  const heading = `=== ${title} ===`;
  const timestamp = new Date().toISOString();
  withCliSafeWrite(stream, () => writer(`[${timestamp}] [${label}] ${heading}`));
  if (meta && typeof meta === 'object') {
    try {
      for (const [key, value] of Object.entries(meta)) {
        withCliSafeWrite(stream, () => writer(`    ${key}: ${value}`));
      }
    } catch {}
  }

  if (normalizedLevel === 'error' && opsNotifier && typeof opsNotifier.recordError === 'function') {
    try {
      opsNotifier.recordError({
        message: heading,
        context: normalizeContext(meta),
        timestamp: new Date(timestamp),
        level: normalizedLevel,
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[logger opsNotifier]', error instanceof Error ? error.message : error);
    }
  }
}

export { LOG_LABEL, log, report };

export default { LOG_LABEL, log, report };
