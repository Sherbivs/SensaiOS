/* eslint-disable no-console */
/**
 * Output Formatting Library
 * 
 * Provides consistent, colorful CLI output for all scripts.
 * Ported from src/utils/output-formatter.ts with enhancements.
 * 
 * **Render-Safe**: All output is automatically sanitized when running on Render
 * to prevent false-positive red highlighting in the log viewer.
 * 
 * @module scripts/lib/output
 * @since 2025-12-21
 * @updated 2026-01-08 - Added Render-safe output sanitization
 */

import { sanitizeForRender, NEUTRAL } from './render-safe.js';

// ============================================================================
// ANSI Color Codes
// ============================================================================

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Background
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
} as const;

// ============================================================================
// Types
// ============================================================================

export interface PrintOptions {
  indent?: number;
  newline?: boolean;
}

export interface TableOptions {
  indent?: number;
  headers?: boolean;
}

export interface KeyValueOptions {
  keyWidth?: number;
  indent?: number;
}

// ============================================================================
// Color Helpers
// ============================================================================

export const c = {
  red: (s: string) => `${colors.red}${s}${colors.reset}`,
  green: (s: string) => `${colors.green}${s}${colors.reset}`,
  yellow: (s: string) => `${colors.yellow}${s}${colors.reset}`,
  blue: (s: string) => `${colors.blue}${s}${colors.reset}`,
  cyan: (s: string) => `${colors.cyan}${s}${colors.reset}`,
  magenta: (s: string) => `${colors.magenta}${s}${colors.reset}`,
  gray: (s: string) => `${colors.gray}${s}${colors.reset}`,
  bold: (s: string) => `${colors.bold}${s}${colors.reset}`,
  dim: (s: string) => `${colors.dim}${s}${colors.reset}`,
};

// ============================================================================
// Print Functions
// ============================================================================

function getIndent(level: number): string {
  return '  '.repeat(level);
}

/**
 * Print a section header
 */
export function printSection(title: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  console.log();
  console.log(`${indent}${c.cyan('━'.repeat(60))}`);
  console.log(`${indent}${c.bold(c.cyan(`  ${title}`))}`);
  console.log(`${indent}${c.cyan('━'.repeat(60))}`);
}

/**
 * Print a subsection header
 */
export function printSubsection(title: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  console.log();
  console.log(`${indent}${c.blue(`▸ ${title}`)}`);
  console.log(`${indent}${c.gray('─'.repeat(40))}`);
}

/**
 * Print a key-value pair
 */
export function printKeyValue(
  key: string,
  value: string | number | boolean | null | undefined,
  opts: KeyValueOptions = {}
): void {
  const indent = getIndent(opts.indent ?? 1);
  const keyWidth = opts.keyWidth ?? 20;
  const displayValue = value === null || value === undefined ? c.gray('n/a') : String(value);
  console.log(`${indent}${c.gray(key.padEnd(keyWidth))} ${displayValue}`);
}

/**
 * Print a success message
 */
export function printSuccess(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  const safeMessage = sanitizeForRender(message);
  console.log(`${indent}${c.green(NEUTRAL.SYM_OK)} ${safeMessage}`);
}

/**
 * Print an issue message (Render-safe alternative to "error")
 */
export function printError(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  const safeMessage = sanitizeForRender(message);
  console.error(`${indent}${c.red(NEUTRAL.SYM_ISSUE)} ${safeMessage}`);
}

/** Alias for printError using neutral terminology */
export const printIssue = printError;

/**
 * Print a note message (Render-safe alternative to "warning")
 */
export function printWarning(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  const safeMessage = sanitizeForRender(message);
  console.log(`${indent}${c.yellow(NEUTRAL.SYM_NOTE)} ${safeMessage}`);
}

/** Alias for printWarning using neutral terminology */
export const printNote = printWarning;

/**
 * Print an info message
 */
export function printInfo(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  const safeMessage = sanitizeForRender(message);
  console.log(`${indent}${c.blue(NEUTRAL.SYM_INFO)} ${safeMessage}`);
}

/**
 * Print a debug message (gray/dim)
 */
export function printDebug(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  console.log(`${indent}${c.dim(message)}`);
}

/**
 * Print a blank line
 */
export function printBlank(count = 1): void {
  for (let i = 0; i < count; i++) {
    console.log();
  }
}

/**
 * Print a horizontal rule
 */
export function printRule(char = '─', width = 60, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  console.log(`${indent}${c.gray(char.repeat(width))}`);
}

// ============================================================================
// Table Functions
// ============================================================================

/**
 * Print a formatted table
 */
export function printTable(
  headers: string[],
  rows: (string | number | null | undefined)[][],
  opts: TableOptions = {}
): void {
  const indent = getIndent(opts.indent ?? 1);
  const showHeaders = opts.headers ?? true;

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const headerWidth = h.length;
    const maxRowWidth = Math.max(0, ...rows.map(row => {
      const cell = row[i];
      return cell == null ? 3 : String(cell).length;
    }));
    return Math.max(headerWidth, maxRowWidth);
  });

  // Format row
  const formatRow = (cells: (string | number | null | undefined)[]) => {
    return cells.map((cell, i) => {
      const val = cell == null ? 'n/a' : String(cell);
      return val.padEnd(widths[i]);
    }).join('  ');
  };

  // Print headers
  if (showHeaders) {
    console.log(`${indent}${c.bold(formatRow(headers))}`);
    console.log(`${indent}${c.gray(widths.map(w => '─'.repeat(w)).join('  '))}`);
  }

  // Print rows
  rows.forEach(row => {
    console.log(`${indent}${formatRow(row)}`);
  });
}

/**
 * Print a list with bullets
 */
export function printList(items: string[], opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 1);
  items.forEach(item => {
    console.log(`${indent}${c.gray('•')} ${item}`);
  });
}

/**
 * Print a numbered list
 */
export function printNumberedList(items: string[], opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 1);
  items.forEach((item, i) => {
    console.log(`${indent}${c.gray(`${i + 1}.`)} ${item}`);
  });
}

// ============================================================================
// Compatibility Functions (from src/utils/output-formatter.ts)
// These provide string-returning variants for scripts that need them
// ============================================================================

/**
 * Status type for formatStatus function
 */
export type StatusType = 'success' | 'warning' | 'error' | 'info';

/**
 * Status icons using neutral symbols.
 * These don't trigger Render's keyword-based red highlighting.
 */
const STATUS_ICONS = {
  success: NEUTRAL.SYM_OK,      // ✓
  warning: NEUTRAL.SYM_NOTE,    // !
  error: NEUTRAL.SYM_ISSUE,     // ✗  
  info: NEUTRAL.SYM_INFO,       // ·
  // Aliases for semantic clarity
  ok: NEUTRAL.SYM_OK,
  note: NEUTRAL.SYM_NOTE,
  issue: NEUTRAL.SYM_ISSUE,
  halt: NEUTRAL.SYM_HALT,       // ⊘
} as const;

const BORDER_CHARS = {
  light: '─',
  heavy: '═',
  none: '',
} as const;

const DEFAULT_WIDTH = 75;
const DEFAULT_KEY_WIDTH = 20;
const DEFAULT_SEPARATOR = ' = ';
const DEFAULT_BULLET = '•';
const INDENT_SIZE = 2;

/**
 * Create a horizontal border line (string return variant).
 */
export function formatBorder(
  width: number = DEFAULT_WIDTH,
  style: keyof typeof BORDER_CHARS = 'light'
): string {
  const char = BORDER_CHARS[style];
  return char.repeat(width);
}

/**
 * Format a section header (string return variant).
 */
export function formatSectionHeader(title: string, indent: number = 0): string {
  const indentation = ' '.repeat(indent * INDENT_SIZE);
  return `${indentation}[${title}]`;
}

/**
 * Format a single key-value pair (string return variant).
 */
export function formatKeyValueString(
  key: string,
  value: string | number | boolean | null | undefined,
  options: KeyValueOptions = {}
): string {
  const {
    keyWidth = DEFAULT_KEY_WIDTH,
    indent = 1,
  } = options;

  const indentation = ' '.repeat(indent * INDENT_SIZE);
  const paddedKey = key.padEnd(keyWidth);
  const displayValue = value === null || value === undefined ? 'n/a' : String(value);

  return `${indentation}${paddedKey}${DEFAULT_SEPARATOR}${displayValue}`;
}

/**
 * Format multiple key-value pairs with aligned keys (string return variant).
 */
export function formatKeyValueList(
  pairs: Array<[string, string | number | boolean | null | undefined]>,
  options: KeyValueOptions = {}
): string[] {
  if (pairs.length === 0) {
    return [];
  }

  const maxKeyWidth = Math.max(...pairs.map(([key]) => key.length));
  const keyWidth = Math.max(maxKeyWidth, options.keyWidth ?? 0);

  return pairs.map(([key, value]) =>
    formatKeyValueString(key, value, { ...options, keyWidth })
  );
}

/**
 * Format a list (string return variant).
 */
export function formatList(
  items: string[],
  options: { bullet?: string; numbered?: boolean; indent?: number } = {}
): string[] {
  const {
    bullet = DEFAULT_BULLET,
    numbered = false,
    indent = 1,
  } = options;

  const indentation = ' '.repeat(indent * INDENT_SIZE);

  if (items.length === 0) {
    return [];
  }

  return items.map((item, index) => {
    const prefix = numbered ? `${index + 1}.` : bullet;
    return `${indentation}${prefix} ${item}`;
  });
}

/**
 * Format a status message with icon (string return variant).
 * 
 * Output is automatically sanitized for Render-safe display.
 * The status type determines the icon, but the message text
 * is sanitized to avoid trigger words like "error" or "warning".
 * 
 * Supports extended status types: 'success', 'warning', 'error', 'info', 'ok', 'note', 'issue', 'halt'
 */
export function formatStatus(
  type: StatusType | 'ok' | 'note' | 'issue' | 'halt',
  message: string,
  indent: number = 1
): string {
  const indentation = ' '.repeat(indent * INDENT_SIZE);
  const icon = STATUS_ICONS[type] ?? STATUS_ICONS.info;
  // Sanitize message to avoid Render trigger words
  const safeMessage = sanitizeForRender(message);
  return `${indentation}${icon} ${safeMessage}`;
}

/**
 * Format a progress indicator (string return variant).
 */
export function formatProgress(
  label: string,
  current: number,
  total: number,
  indent: number = 1
): string {
  const indentation = ' '.repeat(indent * INDENT_SIZE);
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  return `${indentation}${label} [${current}/${total}] (${percentage}%)`;
}

// ============================================================================
// Re-export render-safe utilities
// ============================================================================

export { sanitizeForRender, NEUTRAL, installRenderSafeOutput } from './render-safe.js';

// ============================================================================
// Export Default
// ============================================================================

export default {
  colors,
  c,
  // Print functions (console output)
  printSection,
  printSubsection,
  printKeyValue,
  printSuccess,
  printError,
  printWarning,
  printInfo,
  printDebug,
  printBlank,
  printRule,
  printTable,
  printList,
  printNumberedList,
  // Neutral aliases
  printIssue,
  printNote,
  // Format functions (string return)
  formatBorder,
  formatSectionHeader,
  formatKeyValueString,
  formatKeyValueList,
  formatList,
  formatStatus,
  formatProgress,
  // Render-safe utilities
  sanitizeForRender,
  NEUTRAL,
};
