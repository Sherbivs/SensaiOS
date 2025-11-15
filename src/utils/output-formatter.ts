/**
 * Centralized Console Output Formatting Utilities
 * 
 * Provides consistent, professional formatting for all console output across
 * the entire codebase. Matches the clean style from screenshot requirements.
 * 
 * @module output-formatter
 */

// ============================================================================
// Constants & Configuration
// ============================================================================

const BORDER_STYLES = {
  light: '─',
  heavy: '═',
  double: '╔═╗║╚═╝',
  none: '',
} as const;

const INDENT_SIZE = 2;
const DEFAULT_COLUMN_WIDTH = 75;

// ============================================================================
// Border Formatting
// ============================================================================

/**
 * Create a horizontal border line.
 * @param width - Line width (default: 75)
 * @param style - Border style (default: 'light')
 * @returns Formatted border string
 */
export function formatBorder(
  width: number = DEFAULT_COLUMN_WIDTH,
  style: keyof typeof BORDER_STYLES = 'light'
): string {
  const char = BORDER_STYLES[style];
  return char.repeat(width);
}

/**
 * Create a section separator with optional label.
 * @param label - Optional section label
 * @param width - Line width (default: 75)
 * @returns Formatted separator
 */
export function formatSeparator(label?: string, width: number = DEFAULT_COLUMN_WIDTH): string {
  if (!label) {
    return formatBorder(width);
  }
  
  const padding = Math.max(0, width - label.length - 4);
  const leftPad = Math.floor(padding / 2);
  const rightPad = Math.ceil(padding / 2);
  
  return `${formatBorder(leftPad)} ${label} ${formatBorder(rightPad)}`;
}

// ============================================================================
// Section Formatting
// ============================================================================

/**
 * Format a section header with consistent style.
 * @param title - Section title
 * @param indent - Indentation level (default: 0)
 * @returns Formatted header
 */
export function formatSectionHeader(title: string, indent: number = 0): string {
  const indentStr = ' '.repeat(indent * INDENT_SIZE);
  return `${indentStr}[${title}]`;
}

/**
 * Format a complete section with header, content, and spacing.
 * @param title - Section title
 * @param lines - Array of content lines
 * @param options - Formatting options
 * @returns Formatted section as string array
 */
export function formatSection(
  title: string,
  lines: string[],
  options: {
    indent?: number;
    addSpacing?: boolean;
  } = {}
): string[] {
  const { indent = 0, addSpacing = true } = options;
  const result: string[] = [];
  
  // Add header
  result.push(formatSectionHeader(title, indent));
  
  // Add content lines
  lines.forEach(line => result.push(line));
  
  // Add spacing if requested
  if (addSpacing) {
    result.push('');
  }
  
  return result;
}

// ============================================================================
// Key-Value Formatting
// ============================================================================

/**
 * Format a key-value pair with consistent alignment.
 * @param key - Property key
 * @param value - Property value
 * @param options - Formatting options
 * @returns Formatted key-value string
 */
export function formatKeyValue(
  key: string,
  value: string | number | boolean | null | undefined,
  options: {
    indent?: number;
    keyWidth?: number;
    separator?: string;
  } = {}
): string {
  const { indent = 1, keyWidth = 20, separator = ': ' } = options;
  const indentStr = ' '.repeat(indent * INDENT_SIZE);
  const paddedKey = key.padEnd(keyWidth);
  const valueStr = value === null || value === undefined ? 'n/a' : String(value);
  
  return `${indentStr}${paddedKey}${separator}${valueStr}`;
}

/**
 * Format multiple key-value pairs into aligned columns.
 * @param pairs - Array of [key, value] tuples
 * @param options - Formatting options
 * @returns Array of formatted strings
 */
export function formatKeyValueList(
  pairs: Array<[string, string | number | boolean | null | undefined]>,
  options: {
    indent?: number;
    separator?: string;
  } = {}
): string[] {
  const { indent = 1, separator = '=' } = options;
  
  // Calculate max key width for alignment
  const maxKeyWidth = Math.max(...pairs.map(([key]) => key.length));
  const keyWidth = maxKeyWidth + 2;
  
  return pairs.map(([key, value]) =>
    formatKeyValue(key, value, { indent, keyWidth, separator })
  );
}

// ============================================================================
// Table Formatting
// ============================================================================

/**
 * Format data as an aligned table with headers.
 * @param headers - Column headers
 * @param rows - Data rows
 * @param options - Formatting options
 * @returns Array of formatted table strings
 */
export function formatTable(
  headers: string[],
  rows: Array<Array<string | number | null>>,
  options: {
    indent?: number;
    columnWidths?: number[];
    separator?: string;
  } = {}
): string[] {
  const { indent = 1, separator = ' ' } = options;
  const indentStr = ' '.repeat(indent * INDENT_SIZE);
  
  // Calculate column widths
  const columnWidths = options.columnWidths || headers.map((header, idx) => {
    const maxContentWidth = Math.max(
      header.length,
      ...rows.map(row => String(row[idx] ?? '').length)
    );
    return maxContentWidth + 2;
  });
  
  const result: string[] = [];
  
  // Format header row
  const headerRow = headers
    .map((header, idx) => header.padEnd(columnWidths[idx]))
    .join(separator);
  result.push(indentStr + headerRow);
  
  // Format separator line
  const separatorLine = columnWidths
    .map(width => '─'.repeat(width))
    .join(separator);
  result.push(indentStr + separatorLine);
  
  // Format data rows
  rows.forEach(row => {
    const rowStr = row
      .map((cell, idx) => String(cell ?? '').padEnd(columnWidths[idx]))
      .join(separator);
    result.push(indentStr + rowStr);
  });
  
  return result;
}

// ============================================================================
// List Formatting
// ============================================================================

/**
 * Format an array as a bulleted or numbered list.
 * @param items - List items
 * @param options - Formatting options
 * @returns Array of formatted list strings
 */
export function formatList(
  items: string[],
  options: {
    indent?: number;
    numbered?: boolean;
    bullet?: string;
  } = {}
): string[] {
  const { indent = 1, numbered = false, bullet = '•' } = options;
  const indentStr = ' '.repeat(indent * INDENT_SIZE);
  
  return items.map((item, idx) => {
    const prefix = numbered ? `${idx + 1}.` : bullet;
    return `${indentStr}${prefix} ${item}`;
  });
}

// ============================================================================
// Status & Message Formatting
// ============================================================================

/**
 * Format a status message with icon and color context.
 * @param message - Status message
 * @param status - Status type
 * @param indent - Indentation level
 * @returns Formatted status string
 */
export function formatStatus(
  message: string,
  status: 'success' | 'warning' | 'error' | 'info',
  indent: number = 0
): string {
  const icons = {
    success: '✅',
    warning: '⚠️',
    error: '❌',
    info: 'ℹ️',
  };
  
  const indentStr = ' '.repeat(indent * INDENT_SIZE);
  return `${indentStr}${icons[status]} ${message}`;
}

/**
 * Format a progress message with optional percentage.
 * @param message - Progress message
 * @param current - Current progress value
 * @param total - Total value
 * @param indent - Indentation level
 * @returns Formatted progress string
 */
export function formatProgress(
  message: string,
  current: number,
  total: number,
  indent: number = 0
): string {
  const percentage = Math.round((current / total) * 100);
  const indentStr = ' '.repeat(indent * INDENT_SIZE);
  return `${indentStr}${message} [${current}/${total}] (${percentage}%)`;
}

// ============================================================================
// Composite Formatters (High-Level)
// ============================================================================

/**
 * Format a complete console output block with borders and sections.
 * @param options - Block configuration
 * @returns Formatted output as string
 */
export function formatOutputBlock(options: {
  title?: string;
  sections: Array<{
    header: string;
    content: string[] | Array<[string, string | number | boolean | null]>;
    type?: 'lines' | 'keyvalue' | 'table';
  }>;
  borders?: boolean;
}): string {
  const { title, sections, borders = true } = options;
  const lines: string[] = [];
  
  // Top border
  if (borders) {
    lines.push('');
    lines.push(formatBorder());
    if (title) {
      lines.push('');
    }
  }
  
  // Sections
  sections.forEach((section, idx) => {
    // Section header
    lines.push(formatSectionHeader(section.header));
    
    // Section content based on type
    if (section.type === 'keyvalue' && Array.isArray(section.content[0])) {
      lines.push(...formatKeyValueList(section.content as Array<[string, string | number | boolean | null | undefined]>));
    } else if (Array.isArray(section.content)) {
      lines.push(...(section.content as string[]));
    }
    
    // Add spacing between sections
    if (idx < sections.length - 1) {
      lines.push('');
    }
  });
  
  // Bottom border
  if (borders) {
    lines.push('');
    lines.push(formatBorder());
    lines.push('');
  }
  
  return lines.join('\n');
}
