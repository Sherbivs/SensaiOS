/**
 * Kernel Scrubber
 *
 * Centralized PII scrubbing for kernel log outputs.
 * This module is intentionally lightweight and deterministic so it can run
 * synchronously in the output dispatch path.
 *
 * @module kernel/kernel-scrubber
 */

import type { KernelLogEntry } from './kernel-logger.js';

/** Individual scrub pattern definition */
export interface ScrubPattern {
  /** Pattern label for diagnostics */
  name: string;
  /** Regex pattern used to detect sensitive text */
  pattern: RegExp;
  /** Optional replacement (falls back to ScrubConfig.replacement) */
  replacement?: string;
}

/** Field paths on KernelLogEntry that should be scrubbed */
export type ScrubField = 'message' | 'data' | 'error.message' | 'error.stack';

/** Scrubber configuration */
export interface ScrubConfig {
  /** Global on/off toggle */
  enabled: boolean;
  /** Patterns used for text scrubbing */
  patterns: ScrubPattern[];
  /** Entry fields to scrub */
  fields: ScrubField[];
  /** Fallback replacement token */
  replacement: string;
  /** Maximum recursion depth when scrubbing nested objects */
  maxDepth: number;
}

const TOKEN_REPLACEMENT = '[TOKEN_REDACTED]';
const WEBHOOK_REPLACEMENT = '[WEBHOOK_REDACTED]';
const EMAIL_REPLACEMENT = '[EMAIL_REDACTED]';
const PASSWORD_REPLACEMENT = '[PASSWORD_REDACTED]';

const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|secret|token|api[_-]?key|authorization|cookie)/i;

const defaultPatterns: ScrubPattern[] = [
  {
    name: 'discord-token',
    pattern: /\b(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,})\b/g,
    replacement: TOKEN_REPLACEMENT,
  },
  {
    name: 'discord-webhook',
    pattern: /https?:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+/gi,
    replacement: WEBHOOK_REPLACEMENT,
  },
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: EMAIL_REPLACEMENT,
  },
  {
    name: 'password-assignment',
    pattern: /(password|passwd|pwd)\s*[:=]\s*([^\s,;]+)/gi,
    replacement: `$1=${PASSWORD_REPLACEMENT}`,
  },
  {
    name: 'bearer-token',
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: `Bearer ${TOKEN_REPLACEMENT}`,
  },
];

const defaultConfig: ScrubConfig = {
  enabled: true,
  patterns: defaultPatterns,
  fields: ['message', 'data', 'error.message', 'error.stack'],
  replacement: '[REDACTED]',
  maxDepth: 8,
};

let currentConfig: ScrubConfig = {
  ...defaultConfig,
  patterns: [...defaultConfig.patterns],
  fields: [...defaultConfig.fields],
};

function scrubText(text: string, config: ScrubConfig): string {
  if (!text) {
    return text;
  }

  let result = text;
  for (const pattern of config.patterns) {
    pattern.pattern.lastIndex = 0;
    result = result.replace(pattern.pattern, pattern.replacement ?? config.replacement);
  }
  return result;
}

function scrubValue(value: unknown, config: ScrubConfig, depth = 0): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > config.maxDepth) {
    return '[MAX_DEPTH_REDACTED]';
  }

  if (typeof value === 'string') {
    return scrubText(value, config);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, config, depth + 1));
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = config.replacement;
        continue;
      }
      result[key] = scrubValue(nested, config, depth + 1);
    }
    return result;
  }

  return value;
}

/**
 * Scrub a KernelLogEntry before output dispatch.
 */
export function scrubEntry(entry: KernelLogEntry, config: ScrubConfig = currentConfig): KernelLogEntry {
  if (!config.enabled) {
    return entry;
  }

  const scrubbed: KernelLogEntry = { ...entry };

  if (config.fields.includes('message')) {
    scrubbed.message = scrubText(scrubbed.message, config);
  }

  if (config.fields.includes('data') && scrubbed.data) {
    scrubbed.data = scrubValue(scrubbed.data, config) as Record<string, unknown>;
  }

  if (scrubbed.error) {
    scrubbed.error = { ...scrubbed.error };

    if (config.fields.includes('error.message')) {
      scrubbed.error.message = scrubText(scrubbed.error.message, config);
    }

    if (config.fields.includes('error.stack') && scrubbed.error.stack) {
      scrubbed.error.stack = scrubText(scrubbed.error.stack, config);
    }
  }

  return scrubbed;
}

/** Get current scrubber config snapshot */
export function getScrubConfig(): ScrubConfig {
  return {
    ...currentConfig,
    patterns: [...currentConfig.patterns],
    fields: [...currentConfig.fields],
  };
}

/** Merge updates into current scrubber config */
export function configureScrubber(updates: Partial<ScrubConfig>): ScrubConfig {
  currentConfig = {
    ...currentConfig,
    ...updates,
    patterns: updates.patterns ? [...updates.patterns] : [...currentConfig.patterns],
    fields: updates.fields ? [...updates.fields] : [...currentConfig.fields],
  };

  return getScrubConfig();
}

/** Reset scrubber config to defaults */
export function resetScrubConfig(): void {
  currentConfig = {
    ...defaultConfig,
    patterns: [...defaultConfig.patterns],
    fields: [...defaultConfig.fields],
  };
}
