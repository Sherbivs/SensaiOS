/* eslint-disable no-console */
/**
 * Output Formatting Library
 * 
 * Provides consistent, colorful CLI output for all scripts.
 * Ported from src/utils/output-formatter.ts with enhancements.
 * 
 * @module scripts/lib/output
 * @since 2025-12-21
 */

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
  console.log(`${indent}${c.green('✓')} ${message}`);
}

/**
 * Print an error message
 */
export function printError(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  console.error(`${indent}${c.red('✗')} ${message}`);
}

/**
 * Print a warning message
 */
export function printWarning(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  console.log(`${indent}${c.yellow('⚠')} ${message}`);
}

/**
 * Print an info message
 */
export function printInfo(message: string, opts: PrintOptions = {}): void {
  const indent = getIndent(opts.indent ?? 0);
  console.log(`${indent}${c.blue('ℹ')} ${message}`);
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
// Export Default
// ============================================================================

export default {
  colors,
  c,
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
};
