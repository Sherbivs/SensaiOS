/**
 * Ops Notifier - Error Recording and Notification System
 * @module utils/opsNotifier
 * 
 * Provides a centralized system for recording operational errors
 * and notifying subscribers. Features:
 *   - Error deduplication and limiting
 *   - Context sanitization and summarization
 *   - Subscriber-based notification pattern
 */

import { log } from '../utils/logger.js';
import { truncate } from '../shared/utils/index.js';
import { getErrorMessage } from '../shared/utils/error-utils.js';
import { MONITORING_CONSTANTS } from '../shared/constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorEntry {
  id: string;
  message: string;
  timestamp: Date;
  level: string;
  detail: string;
  context: unknown;
  source: string | null;
  skipAlert: boolean;
}

interface RecordErrorOptions {
  id?: string;
  message?: string;
  context?: unknown;
  timestamp?: Date;
  level?: string;
  source?: string;
  skipAlert?: boolean;
}

interface OpsContext {
  opsNotificationSource?: string;
  opsNotifySkip?: boolean;
  error?: unknown;
  stack?: string;
  [key: string]: unknown;
}

type ErrorHandler = (entry: ErrorEntry) => void | Promise<void>;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const { MAX_RECENT_ERRORS } = MONITORING_CONSTANTS;

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

const recentErrors: ErrorEntry[] = [];
const subscribers = new Set<ErrorHandler>();
let sequence = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Internal Functions
// ─────────────────────────────────────────────────────────────────────────────

function cloneValue(value: unknown): unknown {
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
    const output: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      output[key] = cloneValue(val);
    }
    return output;
  }
  return value;
}

function previewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return truncate(value.trim(), 120) as string;
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
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === 'string') {
      return truncate(obj.message.trim()) as string;
    }
    const entries = Object.entries(obj).slice(0, 3);
    const formatted = entries
      .map(([key, val]) => `${key}: ${previewValue(val)}`)
      .filter(Boolean);
    const suffix = Object.keys(obj).length > 3 ? ', …' : '';
    return `{${formatted.join(', ')}${suffix}}`;
  }
  return truncate(String(value)) as string;
}

function summariseContext(context: unknown): string {
  if (context === null || context === undefined) {
    return '';
  }
  if (typeof context === 'string') {
    return truncate(context.trim()) as string;
  }
  if (Array.isArray(context)) {
    const details = context
      .map((item) => summariseContext(item))
      .filter(Boolean);
    return truncate(details.join(' | ')) as string;
  }
  if (typeof context === 'object') {
    const obj = context as OpsContext;
    if (obj.error) {
      const err = obj.error;
      if (typeof err === 'string') {
        return truncate(err.trim()) as string;
      }
      if (err && typeof err === 'object') {
        const errObj = err as { message?: string; stack?: string };
        if (typeof errObj.message === 'string') {
          return truncate(errObj.message.trim()) as string;
        }
        if (typeof errObj.stack === 'string') {
          const [firstLine] = errObj.stack.split(/\r?\n/);
          return truncate(firstLine.trim()) as string;
        }
      }
    }
    const entries = Object.entries(obj)
      .filter(([key]) => !key.startsWith('opsNotify'))
      .filter(([key]) => key !== 'stack');
    if (entries.length === 0) {
      return '';
    }
    const formatted = entries
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${previewValue(value)}`)
      .filter(Boolean);
    return truncate(formatted.join(' | ')) as string;
  }
  return truncate(String(context)) as string;
}

function safeCloneContext(context: unknown): unknown {
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

function sanitizeContext(context: unknown): unknown {
  if (context === null || context === undefined) {
    return undefined;
  }
  if (typeof context !== 'object') {
    return context;
  }
  if (Array.isArray(context)) {
    return context.map((item) => sanitizeContext(item));
  }
  const obj = context as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'opsNotificationSource' || key === 'opsNotifySkip') {
      continue;
    }
    output[key] = sanitizeContext(value);
  }
  return output;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record an error for ops notification.
 */
export function recordError(options: RecordErrorOptions = {}): ErrorEntry {
  const {
    id: providedId,
    message,
    context,
    timestamp,
    level = 'error',
    source,
    skipAlert = false,
  } = options;

  const normalizedMessage = message ? String(message) : 'Unknown error';
  const entryTimestamp = timestamp instanceof Date ? new Date(timestamp.getTime()) : new Date();
  let derivedSource: string | null = source || null;
  let derivedSkip = Boolean(skipAlert);
  const workingContext = context;

  if (workingContext && typeof workingContext === 'object') {
    const ctx = workingContext as OpsContext;
    if (!derivedSource && typeof ctx.opsNotificationSource === 'string') {
      derivedSource = ctx.opsNotificationSource;
    }
    if (!derivedSkip && Object.prototype.hasOwnProperty.call(ctx, 'opsNotifySkip')) {
      derivedSkip = Boolean(ctx.opsNotifySkip);
    }
  }

  const sanitizedContext = sanitizeContext(workingContext);
  const detail = summariseContext(sanitizedContext);
  const entry: ErrorEntry = {
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
        (result as Promise<void>).catch((error: unknown) => {
          log('error', '[ops-notifier]', { error: getErrorMessage(error) });
        });
      }
    } catch (error) {
      log('error', '[ops-notifier]', { error: getErrorMessage(error) });
    }
  }

  return entry;
}

/**
 * Get a copy of all recent errors.
 */
export function getRecentErrors(): ErrorEntry[] {
  return recentErrors.map((entry) => ({
    ...entry,
    timestamp: new Date(entry.timestamp.getTime()),
    context: safeCloneContext(entry.context),
  }));
}

/**
 * Subscribe to error notifications.
 * @returns Unsubscribe function
 */
export function subscribe(handler: ErrorHandler): () => void {
  if (typeof handler !== 'function') {
    return () => {};
  }
  subscribers.add(handler);
  return () => {
    subscribers.delete(handler);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default Export
// ─────────────────────────────────────────────────────────────────────────────

export type { ErrorEntry };

export default {
  recordError,
  getRecentErrors,
  subscribe,
};
