/**
 * Render-Safe Output Sanitization
 * 
 * Prevents Render's log viewer from highlighting normal status messages
 * as errors by transforming trigger words before output.
 * 
 * @module scripts/lib/render-safe
 * @since 2025-01-08
 * 
 * ## Problem
 * Render's console uses keyword-based highlighting. Any line containing
 * words like "error", "warn", "FATAL" gets styled red, even if it's
 * just a status message like "0 errors found".
 * 
 * ## Solution
 * This module provides:
 * 1. `sanitizeForRender()` - Transform trigger words to neutral alternatives
 * 2. `installRenderSafeOutput()` - Global interceptor for all stdout/stderr
 * 3. `isRenderEnvironment()` - Environment detection
 * 
 * ## Usage
 * ```typescript
 * import { installRenderSafeOutput } from './lib/render-safe.js';
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
 * These words cause Render's log viewer to highlight lines red.
 * We replace them with semantically similar but visually neutral alternatives.
 */
const TRIGGER_REPLACEMENTS: ReplacementRule[] = [
  // Error variants → "issue" or symbol
  { pattern: /\berror\b/gi, replacement: 'issue', casePreserving: true },
  { pattern: /\berrors\b/gi, replacement: 'issues', casePreserving: true },
  
  // Warning variants → "note" or "caution"
  { pattern: /\bwarning\b/gi, replacement: 'note', casePreserving: true },
  { pattern: /\bwarnings\b/gi, replacement: 'notes', casePreserving: true },
  { pattern: /\bwarn\b/gi, replacement: 'note', casePreserving: true },
  
  // Fatal/Critical → "halt" or "stop"
  { pattern: /\bFATAL\b/g, replacement: '[HALT]' },
  { pattern: /\bfatal\b/g, replacement: 'halt' },
  { pattern: /\bCRITICAL\b/g, replacement: '[STOP]' },
  { pattern: /\bcritical\b/gi, replacement: 'severe', casePreserving: true },
  
  // Fail variants → "stop" or "unsuccessful"
  { pattern: /\bfailed\b/gi, replacement: 'stopped', casePreserving: true },
  { pattern: /\bfail\b/gi, replacement: 'stop', casePreserving: true },
  { pattern: /\bfailure\b/gi, replacement: 'stoppage', casePreserving: true },
  
  // Exception → "incident"
  { pattern: /\bexception\b/gi, replacement: 'incident', casePreserving: true },
  
  // Panic → "abort"
  { pattern: /\bpanic\b/gi, replacement: 'abort', casePreserving: true },
];

/**
 * Patterns that should NOT be sanitized (false positives).
 * These are legitimate uses that shouldn't trigger Render highlighting.
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
 * 
 * Render sets these environment variables automatically:
 * - RENDER: "true" 
 * - RENDER_SERVICE_ID: service identifier
 * - RENDER_SERVICE_NAME: service name
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
 * Can be forced on/off via RENDER_SAFE_OUTPUT env var.
 */
export function shouldSanitize(): boolean {
  // Explicit override
  if (process.env.RENDER_SAFE_OUTPUT === 'true') return true;
  if (process.env.RENDER_SAFE_OUTPUT === 'false') return false;
  
  // Default: only on Render
  return isRenderEnvironment();
}

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Apply case-preserving replacement.
 * Matches the case pattern of the original word.
 */
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

/**
 * Check if text should be preserved (not sanitized).
 */
function shouldPreserve(text: string): boolean {
  return PRESERVE_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Sanitize text for Render-safe output.
 * 
 * Transforms trigger words to neutral alternatives while preserving
 * the semantic meaning of the message.
 * 
 * @param text - The text to sanitize
 * @param options - Sanitization options
 * @returns Sanitized text safe for Render logs
 * 
 * @example
 * ```typescript
 * sanitizeForRender("Build completed with 0 errors")
 * // → "Build completed with 0 issues"
 * 
 * sanitizeForRender("WARNING: Config missing")
 * // → "NOTE: Config missing"
 * ```
 */
export function sanitizeForRender(text: string, options: SanitizeOptions = {}): string {
  const { preserveCase = true, renderOnly = true } = options;
  
  // Skip if not on Render (when renderOnly is true)
  if (renderOnly && !shouldSanitize()) {
    return text;
  }
  
  // Skip if this looks like code or stack trace
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

/** Track if interceptor is installed */
let interceptorInstalled = false;

/** Original stdout.write */
let originalStdoutWrite: typeof process.stdout.write;

/** Original stderr.write */
let originalStderrWrite: typeof process.stderr.write;

/**
 * Install global output interceptor for Render-safe logging.
 * 
 * This monkey-patches process.stdout.write and process.stderr.write
 * to sanitize all output before it reaches Render's log viewer.
 * 
 * **Call once at application boot, before any output.**
 * 
 * @example
 * ```typescript
 * // In your main entry point:
 * import { installRenderSafeOutput } from './lib/render-safe.js';
 * 
 * installRenderSafeOutput();
 * 
 * // Now all console output is automatically sanitized on Render
 * console.log("0 errors found"); // Outputs: "0 issues found"
 * ```
 */
export function installRenderSafeOutput(): void {
  // Don't install twice
  if (interceptorInstalled) {
    return;
  }
  
  // Only install on Render (unless forced)
  if (!shouldSanitize()) {
    return;
  }
  
  // Save originals
  originalStdoutWrite = process.stdout.write.bind(process.stdout);
  originalStderrWrite = process.stderr.write.bind(process.stderr);
  
  // Patch stdout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = function(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null | undefined) => void),
    callback?: (err?: Error | null | undefined) => void
  ): boolean {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    const sanitized = sanitizeForRender(text, { renderOnly: false });
    
    if (typeof encodingOrCallback === 'function') {
      // Type assertion needed due to Node.js write() overload complexity
      return (originalStdoutWrite as any)(sanitized, encodingOrCallback);
    }
    return (originalStdoutWrite as any)(sanitized, encodingOrCallback, callback);
  } as typeof process.stdout.write;
  
  // Patch stderr
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = function(
    chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((err?: Error | null | undefined) => void),
    callback?: (err?: Error | null | undefined) => void
  ): boolean {
    const text = typeof chunk === 'string' ? chunk : chunk.toString();
    const sanitized = sanitizeForRender(text, { renderOnly: false });
    
    if (typeof encodingOrCallback === 'function') {
      // Type assertion needed due to Node.js write() overload complexity
      return (originalStderrWrite as any)(sanitized, encodingOrCallback);
    }
    return (originalStderrWrite as any)(sanitized, encodingOrCallback, callback);
  } as typeof process.stdout.write;
  
  interceptorInstalled = true;
}

/**
 * Uninstall the global interceptor (for testing).
 */
export function uninstallRenderSafeOutput(): void {
  if (!interceptorInstalled) {
    return;
  }
  
  process.stdout.write = originalStdoutWrite;
  process.stderr.write = originalStderrWrite;
  interceptorInstalled = false;
}

/**
 * Check if interceptor is currently installed.
 */
export function isInterceptorInstalled(): boolean {
  return interceptorInstalled;
}

// ============================================================================
// Neutral Vocabulary Constants
// ============================================================================

/**
 * Neutral vocabulary for use in output libraries.
 * Use these instead of trigger words in your code.
 */
export const NEUTRAL = {
  // Status words
  ERROR: 'issue',
  ERRORS: 'issues', 
  WARNING: 'note',
  WARNINGS: 'notes',
  FATAL: '[HALT]',
  CRITICAL: '[STOP]',
  FAIL: 'stop',
  FAILED: 'stopped',
  
  // Labels (for formatStatus-style usage)
  STATUS_ERROR: 'issue',
  STATUS_WARNING: 'note',
  STATUS_SUCCESS: 'ok',
  STATUS_INFO: 'info',
  
  // Symbols (always safe)
  SYM_OK: '✓',
  SYM_ISSUE: '✗',
  SYM_NOTE: '!',
  SYM_INFO: '·',
  SYM_HALT: '⊘',
} as const;

// ============================================================================
// Export Default
// ============================================================================

export default {
  sanitizeForRender,
  installRenderSafeOutput,
  uninstallRenderSafeOutput,
  isRenderEnvironment,
  shouldSanitize,
  isInterceptorInstalled,
  NEUTRAL,
};
