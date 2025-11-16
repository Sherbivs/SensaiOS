import { log } from '../utils/logger.js';
import { truncate } from '../shared/utils/format-utils.js';
'use strict';

const MAX_RECENT_ERRORS = 10;

const recentErrors = [];
const subscribers = new Set();
let sequence = 0;

function cloneValue(value) {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, val] of Object.entries(value)) {
      output[key] = cloneValue(val);
    }
    return output;
  }
  return value;
}

function previewValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return truncate(value.trim(), 120);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const parts = value.slice(0, 3).map((item) => previewValue(item)).filter(Boolean);
    const suffix = value.length > 3 ? ', …' : '';
    return `[${parts.join(', ')}${suffix}]`;
  }
  if (typeof value === 'object') {
    if (typeof value.message === 'string') {
      return truncate(value.message.trim());
    }
    const entries = Object.entries(value).slice(0, 3);
    const formatted = entries
      .map(([key, val]) => `${key}: ${previewValue(val)}`)
      .filter(Boolean);
    const suffix = Object.keys(value).length > 3 ? ', …' : '';
    return `{${formatted.join(', ')}${suffix}}`;
  }
  return truncate(String(value));
}

function summariseContext(context) {
  if (context === null || context === undefined) {
    return '';
  }
  if (typeof context === 'string') {
    return truncate(context.trim());
  }
  if (Array.isArray(context)) {
    const details = context
      .map((item) => summariseContext(item))
      .filter(Boolean);
    return truncate(details.join(' | '));
  }
  if (typeof context === 'object') {
    if (context.error) {
      const err = context.error;
      if (typeof err === 'string') {
        return truncate(err.trim());
      }
      if (err && typeof err === 'object') {
        if (typeof err.message === 'string') {
          return truncate(err.message.trim());
        }
        if (typeof err.stack === 'string') {
          const [firstLine] = err.stack.split(/\r?\n/);
          return truncate(firstLine.trim());
        }
      }
    }
    const entries = Object.entries(context)
      .filter(([key]) => !key.startsWith('opsNotify'))
      .filter(([key]) => key !== 'stack');
    if (entries.length === 0) {
      return '';
    }
    const formatted = entries
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${previewValue(value)}`)
      .filter(Boolean);
    return truncate(formatted.join(' | '));
  }
  return truncate(String(context));
}

function safeCloneContext(context) {
  if (context === null || context === undefined) {
    return undefined;
  }
  if (typeof context === 'object') {
    return cloneValue(context);
  }
  if (Array.isArray(context)) {
    return context.map((item) => cloneValue(item));
  }
  return context;
}

function sanitizeContext(context) {
  if (context === null || context === undefined) {
    return undefined;
  }
  if (typeof context !== 'object') {
    return context;
  }
  if (Array.isArray(context)) {
    return context.map((item) => sanitizeContext(item));
  }
  const output = {};
  for (const [key, value] of Object.entries(context)) {
    if (key === 'opsNotificationSource' || key === 'opsNotifySkip') {
      continue;
    }
    output[key] = sanitizeContext(value);
  }
  return output;
}

function recordError({
  id: providedId,
  message,
  context,
  timestamp,
  level = 'error',
  source,
  skipAlert = false,
} = {}) {
  const normalizedMessage = message ? String(message) : 'Unknown error';
  const entryTimestamp = timestamp instanceof Date ? new Date(timestamp.getTime()) : new Date();
  let derivedSource = source || null;
  let derivedSkip = Boolean(skipAlert);
  let workingContext = context;

  if (workingContext && typeof workingContext === 'object') {
    if (!derivedSource && typeof workingContext.opsNotificationSource === 'string') {
      derivedSource = workingContext.opsNotificationSource;
    }
    if (!derivedSkip && Object.prototype.hasOwnProperty.call(workingContext, 'opsNotifySkip')) {
      derivedSkip = Boolean(workingContext.opsNotifySkip);
    }
  }

  const sanitizedContext = sanitizeContext(workingContext);
  const detail = summariseContext(sanitizedContext);
  const entry = {
    id: providedId || `${Date.now()}-${sequence++}`,
    message: normalizedMessage,
    timestamp: entryTimestamp,
    level,
    detail,
    context: safeCloneContext(sanitizedContext),
    source: derivedSource,
    skipAlert: derivedSkip,
  };

  recentErrors.push(entry);
  if (recentErrors.length > MAX_RECENT_ERRORS) {
    recentErrors.shift();
  }

  for (const handler of subscribers) {
    try {
      const result = handler(entry);
      if (result && typeof result.then === 'function') {
        result.catch((error) => {
          log('error', '[ops-notifier]', { error: error instanceof Error ? error.message : error });
        });
      }
    } catch (error) {
      log('error', '[ops-notifier]', { error: error instanceof Error ? error.message : error });
    }
  }

  return entry;
}

function getRecentErrors() {
  return recentErrors.map((entry) => ({
    ...entry,
    timestamp: new Date(entry.timestamp.getTime()),
    context: safeCloneContext(entry.context),
  }));
}

function subscribe(handler) {
  if (typeof handler !== 'function') {
    return () => {};
  }
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

export {
  recordError,
  getRecentErrors,
  subscribe,
};

export default {
  recordError,
  getRecentErrors,
  subscribe,
};
