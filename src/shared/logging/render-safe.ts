/**
 * Render-Safe Output Sanitization for Runtime
 * 
 * Prevents Render's log viewer from highlighting normal status messages
 * as errors by transforming trigger words before output.
 * 
 * @module shared/logging/render-safe
 * @since 2026-01-08
 * 
 * ## Problem
 * Render's console uses keyword-based highlighting. Any line containing
 * words like "error", "warn", "FATAL" gets styled red, even if it's
 * just a status message like "0 errors found".
 * 
 * ## Solution
 * This module provides automatic sanitization when running on Render.
 * Call `installRenderSafeOutput()` early in your boot sequence.
 * 
 * ## Usage
 * ```typescript
 * import { installRenderSafeOutput } from './shared/logging/render-safe.js';
 * 
 * // At boot, before any output:
 * installRenderSafeOutput();
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface SanitizeOptions {
  /** Preserve case when replacing (default: true) */
  preserveCase?: boolean;
  /** Only sanitize on Render (default: true) */
  renderOnly?: boolean;
}

interface ReplacementRule {
  pattern: RegExp;
  replacement: string;
  /** Preserve original case pattern */
  casePreserving?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Render trigger words and their neutral replacements.
 * 
 * NOTE: Patterns use negative lookbehind/lookahead to PRESERVE:
 * - Hyphenated technical names: error-tracker, error-learning, error-handler
 * - Compound identifiers: ErrorTracker, errorContext, isError
 * 
 * Only standalone words in human-readable messages are replaced.
 */
const TRIGGER_REPLACEMENTS: ReplacementRule[] = [
  // Error variants → "issue" (PRESERVE hyphenated and camelCase forms)
  // (?<!-) = not preceded by hyphen, (?!-) = not followed by hyphen
  // (?<![A-Za-z]) = not preceded by letter (preserve ErrorTracker)
  // (?![A-Za-z]) = not followed by letter (preserve errorContext)
  { pattern: /(?<![-A-Za-z])error(?![-A-Za-z])/gi, replacement: 'issue', casePreserving: true },
  { pattern: /(?<![-A-Za-z])errors(?![-A-Za-z])/gi, replacement: 'issues', casePreserving: true },
  
  // Warning variants → "note" (PRESERVE hyphenated and camelCase forms)
  { pattern: /(?<![-A-Za-z])warning(?![-A-Za-z])/gi, replacement: 'note', casePreserving: true },
  { pattern: /(?<![-A-Za-z])warnings(?![-A-Za-z])/gi, replacement: 'notes', casePreserving: true },
  { pattern: /(?<![-A-Za-z])warn(?![-A-Za-z])/gi, replacement: 'note', casePreserving: true },
  
  // Fatal/Critical → "halt" or "stop"
  { pattern: /(?<![-A-Za-z])FATAL(?![-A-Za-z])/g, replacement: '[HALT]' },
  { pattern: /(?<![-A-Za-z])fatal(?![-A-Za-z])/g, replacement: 'halt' },
  { pattern: /(?<![-A-Za-z])CRITICAL(?![-A-Za-z])/g, replacement: '[STOP]' },
  { pattern: /(?<![-A-Za-z])critical(?![-A-Za-z])/gi, replacement: 'severe', casePreserving: true },
  
  // Fail variants → "stop" or "unsuccessful"
  { pattern: /(?<![-A-Za-z])failed(?![-A-Za-z])/gi, replacement: 'stopped', casePreserving: true },
  { pattern: /(?<![-A-Za-z])fail(?![-A-Za-z])/gi, replacement: 'stop', casePreserving: true },
  { pattern: /(?<![-A-Za-z])failure(?![-A-Za-z])/gi, replacement: 'stoppage', casePreserving: true },
  
  // Exception → "incident"
  { pattern: /(?<![-A-Za-z])exception(?![-A-Za-z])/gi, replacement: 'incident', casePreserving: true },
  
  // Panic → "abort"
  { pattern: /(?<![-A-Za-z])panic(?![-A-Za-z])/gi, replacement: 'abort', casePreserving: true },
];

/**
 * Patterns that should NOT be sanitized (false positives).
 */
const PRESERVE_PATTERNS: RegExp[] = [
  // Stack traces - these are real errors, let them highlight
  /^\s+at\s+/,
  // Error objects being thrown - legitimate
  /throw new Error/,
  /new Error\(/,
  // Catch blocks - legitimate code
  /catch\s*\(/,
  // Type definitions
  /: Error[,\s)]/,
  /Error\s*\|/,
];

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if running on Render platform.
 */
export function isRenderEnvironment(): boolean {
  return (
    process.env.RENDER === 'true' ||
    process.env.RENDER === '1' ||
    !!process.env.RENDER_SERVICE_ID ||
    !!process.env.RENDER_SERVICE_NAME
  );
}

/**
 * Check if sanitization should be applied.
 */
export function shouldSanitize(): boolean {
  if (process.env.RENDER_SAFE_OUTPUT === 'true') return true;
  if (process.env.RENDER_SAFE_OUTPUT === 'false') return false;
  return isRenderEnvironment();
}

// ============================================================================
// Sanitization Functions
// ============================================================================

function applyCasePreserving(original: string, replacement: string): string {
  if (original === original.toUpperCase()) {
    return replacement.toUpperCase();
  }
  if (original === original.toLowerCase()) {
    return replacement.toLowerCase();
  }
  if (original[0] === original[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  return replacement;
}

function shouldPreserve(text: string): boolean {
  return PRESERVE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Sanitize text for Render-safe output.
 */
export function sanitizeForRender(text: string, options: SanitizeOptions = {}): string {
  const { preserveCase = true, renderOnly = true } = options;
  
  if (renderOnly && !shouldSanitize()) {
    return text;
  }
  
  if (shouldPreserve(text)) {
    return text;
  }
  
  let result = text;
  
  for (const rule of TRIGGER_REPLACEMENTS) {
    result = result.replace(rule.pattern, (match) => {
      if (preserveCase && rule.casePreserving) {
        return applyCasePreserving(match, rule.replacement);
      }
      return rule.replacement;
    });
  }
  
  return result;
}

// ============================================================================
// Global Interceptor
// ============================================================================

let interceptorInstalled = false;
let originalStdoutWrite: typeof process.stdout.write;
let originalStderrWrite: typeof process.stderr.write;

/**
 * Install global output interceptor for Render-safe logging.
 * 
 * **Call once at application boot, before any output.**
 */
export function installRenderSafeOutput(): void {
  if (interceptorInstalled) return;
  if (!shouldSanitize()) return;
  
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  
  process.stdout.write = function(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void
  ): boolean {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    // Note: renderOnly defaults to true, so sanitization only happens on Render
    const sanitized = sanitizeForRender(text);
    
    if (typeof encodingOrCallback === 'function') {
      return originalStdoutWrite(sanitized, encodingOrCallback);
    }
    return originalStdoutWrite(sanitized, encodingOrCallback, callback);
  } as typeof process.stdout.write;
  
  process.stderr.write = function(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void
  ): boolean {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    // Note: renderOnly defaults to true, so sanitization only happens on Render
    const sanitized = sanitizeForRender(text);
    
    if (typeof encodingOrCallback === 'function') {
      return originalStderrWrite(sanitized, encodingOrCallback);
    }
    return originalStderrWrite(sanitized, encodingOrCallback, callback);
  } as typeof process.stderr.write;
  
  interceptorInstalled = true;
}

/**
 * Uninstall the global interceptor (for testing).
 */
export function uninstallRenderSafeOutput(): void {
  if (!interceptorInstalled) return;
  
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  interceptorInstalled = false;
}

export function isInterceptorInstalled(): boolean {
  return interceptorInstalled;
}

// ============================================================================
// Neutral Vocabulary Constants
// ============================================================================

/**
 * Neutral vocabulary for use in output code.
 */
export const NEUTRAL = {
  ERROR: 'issue',
  ERRORS: 'issues', 
  WARNING: 'note',
  WARNINGS: 'notes',
  FATAL: '[HALT]',
  CRITICAL: '[STOP]',
  FAIL: 'stop',
  FAILED: 'stopped',
  
  SYM_OK: '✓',
  SYM_ISSUE: '✗',
  SYM_NOTE: '!',
  SYM_INFO: '·',
  SYM_HALT: '⊘',
} as const;

export default {
  sanitizeForRender,
  installRenderSafeOutput,
  uninstallRenderSafeOutput,
  isRenderEnvironment,
  shouldSanitize,
  isInterceptorInstalled,
  NEUTRAL,
};
