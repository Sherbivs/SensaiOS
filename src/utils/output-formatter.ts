/**
 * Centralized Output Formatting Utility
 * 
 * Provides consistent formatting functions for CLI scripts and database operations.
 * All scripts should use these functions for standardized output (ASCII-safe, Windows-compatible).
 * 
 * @module output-formatter
 * @since 2025-11-09
 * @see tests/utils/output-formatter.test.ts for 61 comprehensive tests
 */

// ============================================================================
// Types
// ============================================================================

export interface KeyValueOptions {
  keyWidth?: number;
  separator?: string;
  indent?: number;
}

export interface TableOptions {
  columnWidths?: number[];
  indent?: number;
}

export interface ListOptions {
  bullet?: string;
  numbered?: boolean;
  indent?: number;
}

export interface SectionOptions {
  indent?: number;
  addSpacing?: boolean;
}

/** 
 * Status type for formatStatus. Neutral aliases available to avoid Render red-highlighting.
 * - 'ok' | 'success' → green check
 * - 'note' | 'warning' → yellow warning
 * - 'halt' | 'error' → red X
 * - 'info' → blue info
 */
export type StatusType = 'success' | 'warning' | 'error' | 'info' | 'ok' | 'note' | 'halt';

export interface OutputSection {
  header: string;
  content: string[] | Array<[string, string | number | null | undefined]>;
  type: 'lines' | 'keyvalue';
}

export interface OutputBlockOptions {
  title?: string;
  sections: OutputSection[];
  borders?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const BORDER_CHARS = {
  light: '─',
  heavy: '═',
  none: '',
} as const;

const STATUS_ICONS = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
  // Neutral aliases (for Render console - avoids red highlighting)
  ok: '✅',
  note: '⚠️',
  halt: '❌',
} as const;

const DEFAULT_WIDTH = 75;
const DEFAULT_KEY_WIDTH = 20;
const DEFAULT_SEPARATOR = ' = ';
const DEFAULT_BULLET = '•';
const INDENT_SIZE = 2;

// ============================================================================
// Border Functions
// ============================================================================

/**
 * Create a horizontal border line.
 * 
 * @param width - Width of the border (default: 75)
 * @param style - Border style: 'light', 'heavy', or 'none' (default: 'light')
 * @returns Border string
 * 
 * @example
 * formatBorder() // '─'.repeat(75)
 * formatBorder(10, 'heavy') // '══════════'
 */
export function formatBorder(
  width: number = DEFAULT_WIDTH,
  style: keyof typeof BORDER_CHARS = 'light'
): string {
  const char = BORDER_CHARS[style];
  return char.repeat(width);
}

/**
 * Create a separator line with optional centered label.
 * 
 * @param label - Optional label to center in separator
 * @param width - Total width of separator (default: 75)
 * @returns Separator string with optional label
 * 
 * @example
 * formatSeparator() // '─'.repeat(75)
 * formatSeparator('TEST', 20) // '─── TEST ───'
 */
export function formatSeparator(label?: string, width: number = DEFAULT_WIDTH): string {
  if (!label) {
    return BORDER_CHARS.light.repeat(width);
  }

  const labelWithSpaces = ` ${label} `;
  const labelLength = labelWithSpaces.length;
  
  if (labelLength >= width) {
    return labelWithSpaces;
  }

  const remainingWidth = width - labelLength;
  const leftWidth = Math.floor(remainingWidth / 2);
  const rightWidth = remainingWidth - leftWidth;

  return (
    BORDER_CHARS.light.repeat(leftWidth) +
    labelWithSpaces +
    BORDER_CHARS.light.repeat(rightWidth)
  );
}

// ============================================================================
// Section Functions
// ============================================================================

/**
 * Format a section header with optional indentation.
 * 
 * @param title - Section title
 * @param indent - Indentation level (default: 0)
 * @returns Formatted section header
 * 
 * @example
 * formatSectionHeader('NODE') // '[NODE]'
 * formatSectionHeader('DATABASE', 1) // '  [DATABASE]'
 */
export function formatSectionHeader(title: string, indent: number = 0): string {
  const indentation = ' '.repeat(indent * INDENT_SIZE);
  return `${indentation}[${title}]`;
}

/**
 * Format a complete section with header and content lines.
 * 
 * @param header - Section header text
 * @param content - Array of content lines
 * @param options - Formatting options
 * @returns Array of formatted lines
 * 
 * @example
 * formatSection('TEST', ['Line 1', 'Line 2'])
 * // ['[TEST]', 'Line 1', 'Line 2', '']
 */
export function formatSection(
  header: string,
  content: string[],
  options: SectionOptions = {}
): string[] {
  const { indent = 0, addSpacing = true } = options;
  
  const lines = [
    formatSectionHeader(header, indent),
    ...content,
  ];

  if (addSpacing) {
    lines.push('');
  }

  return lines;
}

// ============================================================================
// Key-Value Functions
// ============================================================================

/**
 * Format a single key-value pair.
 * 
 * @param key - Key string
 * @param value - Value (string, number, boolean, or null/undefined)
 * @param options - Formatting options
 * @returns Formatted key-value string
 * 
 * @example
 * formatKeyValue('Uptime', '49s') // '  Uptime      = 49s'
 * formatKeyValue('Count', 42) // '  Count       = 42'
 * formatKeyValue('Status', null) // '  Status      = n/a'
 */
export function formatKeyValue(
  key: string,
  value: string | number | boolean | null | undefined,
  options: KeyValueOptions = {}
): string {
  const {
    keyWidth = DEFAULT_KEY_WIDTH,
    separator = DEFAULT_SEPARATOR,
    indent = 1,
  } = options;

  const indentation = ' '.repeat(indent * INDENT_SIZE);
  const paddedKey = key.padEnd(keyWidth);
  const displayValue = value === null || value === undefined ? 'n/a' : String(value);

  return `${indentation}${paddedKey}${separator}${displayValue}`;
}

/**
 * Format multiple key-value pairs with aligned keys.
 * 
 * @param pairs - Array of [key, value] tuples
 * @param options - Formatting options
 * @returns Array of formatted key-value strings
 * 
 * @example
 * formatKeyValueList([
 *   ['Uptime', '49s'],
 *   ['Memory', '188 MB'],
 *   ['PID', '73']
 * ])
 * // All keys aligned to longest key width
 */
export function formatKeyValueList(
  pairs: Array<[string, string | number | boolean | null | undefined]>,
  options: KeyValueOptions = {}
): string[] {
  if (pairs.length === 0) {
    return [];
  }

  // Calculate longest key width
  const maxKeyWidth = Math.max(...pairs.map(([key]) => key.length));
  const keyWidth = Math.max(maxKeyWidth, options.keyWidth || 0);

  return pairs.map(([key, value]) =>
    formatKeyValue(key, value, { ...options, keyWidth })
  );
}

// ============================================================================
// Table Functions
// ============================================================================

/**
 * Format a table with headers and rows.
 * 
 * @param headers - Column headers
 * @param rows - Table rows (2D array)
 * @param options - Formatting options
 * @returns Array of formatted table lines
 * 
 * @example
 * formatTable(['Name', 'Type', 'Count'], [
 *   ['Species', 'table', '1025'],
 *   ['Move', 'table', '918']
 * ])
 * // Aligned columns with separator line
 */
export function formatTable(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  options: TableOptions = {}
): string[] {
  const { columnWidths, indent = 1 } = options;
  const indentation = ' '.repeat(indent * INDENT_SIZE);

  // Calculate column widths if not provided
  const widths = columnWidths || headers.map((header, i) => {
    const headerWidth = header.length;
    const maxRowWidth = Math.max(
      0,
      ...rows.map(row => {
        const cell = row[i];
        return cell === null || cell === undefined ? 3 : String(cell).length;
      })
    );
    return Math.max(headerWidth, maxRowWidth);
  });

  // Format a row with aligned columns
  const formatRow = (cells: Array<string | number | null | undefined>) => {
    const formattedCells = cells.map((cell, i) => {
      const displayValue = cell === null || cell === undefined ? 'n/a' : String(cell);
      return displayValue.padEnd(widths[i]);
    });
    return `${indentation}${formattedCells.join('  ')}`;
  };

  // Build table
  const lines = [
    formatRow(headers),
    `${indentation}${widths.map(w => BORDER_CHARS.light.repeat(w)).join('  ')}`,
    ...rows.map(formatRow),
  ];

  return lines;
}

// ============================================================================
// List Functions
// ============================================================================

/**
 * Format a bulleted or numbered list.
 * 
 * @param items - List items
 * @param options - Formatting options
 * @returns Array of formatted list lines
 * 
 * @example
 * formatList(['Item 1', 'Item 2']) // ['  • Item 1', '  • Item 2']
 * formatList(['First', 'Second'], { numbered: true }) // ['  1. First', '  2. Second']
 */
export function formatList(
  items: string[],
  options: ListOptions = {}
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

// ============================================================================
// Status Functions
// ============================================================================

/**
 * Format a status message with icon.
 * 
 * @param message - Status message
 * @param type - Status type (success, warning, error, info)
 * @param indent - Indentation level (default: 1)
 * @returns Formatted status string
 * 
 * @example
 * formatStatus('Operation completed', 'success') // '  ✅ Operation completed'
 * formatStatus('Connection failed', 'error') // '  ❌ Connection failed'
 */
export function formatStatus(
  message: string,
  type: StatusType,
  indent: number = 1
): string {
  const indentation = ' '.repeat(indent * INDENT_SIZE);
  const icon = STATUS_ICONS[type];
  return `${indentation}${icon} ${message}`;
}

/**
 * Format a progress indicator.
 * 
 * @param label - Progress label
 * @param current - Current progress value
 * @param total - Total progress value
 * @param indent - Indentation level (default: 1)
 * @returns Formatted progress string
 * 
 * @example
 * formatProgress('Processing', 25, 100) // '  Processing [25/100] (25%)'
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
// Output Block Functions
// ============================================================================

/**
 * Format a complete output block with multiple sections.
 * 
 * @param options - Block configuration
 * @returns Formatted output string
 * 
 * @example
 * formatOutputBlock({
 *   sections: [
 *     {
 *       header: 'NODE',
 *       content: formatKeyValueList([['Uptime', '49s']]),
 *       type: 'lines'
 *     }
 *   ],
 *   borders: true
 * })
 */
export function formatOutputBlock(options: OutputBlockOptions): string {
  const { title, sections, borders = true } = options;

  const lines: string[] = [];

  // Top border
  if (borders) {
    lines.push(formatBorder());
    if (title) {
      lines.push(formatSeparator(title));
    }
  }

  // Sections
  sections.forEach((section, index) => {
    lines.push(formatSectionHeader(section.header));

    if (section.type === 'keyvalue') {
      const pairs = section.content as Array<[string, string | number | null | undefined]>;
      lines.push(...formatKeyValueList(pairs));
    } else {
      const content = section.content as string[];
      lines.push(...content);
    }

    // Add spacing between sections (except last)
    if (index < sections.length - 1) {
      lines.push('');
    }
  });

  // Bottom border
  if (borders) {
    lines.push('');
    lines.push(formatBorder());
  }

  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

export default {
  formatBorder,
  formatSeparator,
  formatSectionHeader,
  formatSection,
  formatKeyValue,
  formatKeyValueList,
  formatTable,
  formatList,
  formatStatus,
  formatProgress,
  formatOutputBlock,
};
