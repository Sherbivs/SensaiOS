/**
 * Format utilities for bytes, durations, and other common formatting needs.
 * Centralizes duplicate formatting logic across the codebase.
 * 
 * @module shared/utils/format-utils
 */

/**
 * Format bytes into human-readable string with appropriate unit (B, KB, MB, GB).
 * 
 * @param bytes - Number of bytes to format
 * @returns Formatted string (e.g., "1.50 MB", "512.00 KB", "0 B")
 * 
 * @example
 * ```typescript
 * formatBytes(1536) // "1.50 KB"
 * formatBytes(1048576) // "1.00 MB"
 * formatBytes(0) // "0 B"
 * formatBytes(-100) // "0 B"
 * ```
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format bytes into abbreviated human-readable string (shorter variant).
 * Uses single-letter units for compact display.
 * 
 * @param bytes - Number of bytes to format
 * @returns Compact formatted string (e.g., "1.5M", "512K", "0B")
 * 
 * @example
 * ```typescript
 * formatBytesShort(1536) // "1.50K"
 * formatBytesShort(1048576) // "1.00M"
 * ```
 */
export function formatBytesShort(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B';
  const units = ['B', 'K', 'M', 'G'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)}${units[i]}`;
}

/**
 * Format milliseconds into human-readable duration string.
 * 
 * @param ms - Milliseconds to format
 * @returns Formatted duration (e.g., "2m 34s", "1h 5m", "45s")
 * 
 * @example
 * ```typescript
 * formatDuration(154000) // "2m 34s"
 * formatDuration(3900000) // "1h 5m"
 * formatDuration(45000) // "45s"
 * ```
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format uptime in milliseconds to human-readable string (compact variant).
 * 
 * @param ms - Uptime in milliseconds
 * @returns Compact uptime string (e.g., "2m 34s", "45s")
 */
export function formatUptime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Format duration in milliseconds to compact single-unit string.
 * Shows only the most significant unit (for compact displays).
 * 
 * @param ms - Duration in milliseconds
 * @returns Compact duration string (e.g., "2.5m", "1.2h", "45s")
 * 
 * @example
 * ```typescript
 * formatDurationCompact(154000) // "2.6m"
 * formatDurationCompact(3900000) // "1.1h"
 * formatDurationCompact(45000) // "45.0s"
 * formatDurationCompact(500) // "500ms"
 * ```
 */
export function formatDurationCompact(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Format a number with thousand separators for readability.
 * 
 * @param value - Number to format
 * @returns Formatted string with commas (e.g., "1,234,567")
 * 
 * @example
 * ```typescript
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(42) // "42"
 * ```
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString('en-US');
}

/**
 * Format a percentage with specified decimal places.
 * 
 * @param value - Decimal value (0.0 to 1.0)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string (e.g., "75.50%", "100.00%")
 * 
 * @example
 * ```typescript
 * formatPercentage(0.7550) // "75.50%"
 * formatPercentage(1.0) // "100.00%"
 * formatPercentage(0.123, 1) // "12.3%"
 * ```
 */
export function formatPercentage(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '0.00%';
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Strip surrounding quotes from a string (single or double quotes).
 * Useful for parsing environment variables or configuration values.
 * 
 * @param value - String potentially wrapped in quotes
 * @returns String with quotes removed, or original if no matching quotes
 * 
 * @example
 * ```typescript
 * stripQuotes('"hello"') // "hello"
 * stripQuotes("'world'") // "world"
 * stripQuotes('no quotes') // "no quotes"
 * stripQuotes('"mismatched\'') // '"mismatched\''
 * ```
 */
export function stripQuotes(value: string): string {
  if (!value) return value;
  const trimmed = value.trim();
  const first = trimmed.at(0);
  if ((first === '"' || first === "'") && trimmed.endsWith(first)) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
