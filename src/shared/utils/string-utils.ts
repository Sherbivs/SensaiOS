/**
 * String manipulation utilities
 * 
 * Phase 18: String normalization and timestamp formatting
 * Created: 2025-11-16
 */

/**
 * Normalize a string for case-insensitive comparison
 * 
 * Trims whitespace and converts to lowercase
 * 
 * @param value - String to normalize
 * @returns Normalized string (trimmed and lowercase)
 * 
 * @example
 * ```typescript
 * normalizeString('  Pikachu  ') // 'pikachu'
 * normalizeString('BULBASAUR') // 'bulbasaur'
 * normalizeString('  Fire STONE  ') // 'fire stone'
 * ```
 */
export function normalizeString(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Generate filesystem-safe timestamp string
 * 
 * Converts ISO 8601 timestamp to filesystem-safe format:
 * - Removes colons (`:` → `-`)
 * - Removes milliseconds (splits at `.`)
 * 
 * Format: `YYYY-MM-DDTHH-mm-ss`
 * 
 * @param date - Date to format (defaults to now)
 * @returns Filesystem-safe timestamp string
 * 
 * @example
 * ```typescript
 * // Returns: "2025-11-16T15-30-45"
 * getFilesafeTimestamp()
 * 
 * // Returns: "2025-01-01T00-00-00"
 * getFilesafeTimestamp(new Date('2025-01-01T00:00:00Z'))
 * ```
 */
export function getFilesafeTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace(/:/g, '-').split('.')[0];
}
