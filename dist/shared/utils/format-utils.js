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
export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return '0 B';
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
export function formatBytesShort(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return '0B';
    const units = ['B', 'K', 'M', 'G'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)}${units[i]}`;
}
/**
 * Convert bytes to megabytes (rounded integer).
 * Commonly used for memory logging where exact values aren't needed.
 *
 * @param bytes - Number of bytes to convert
 * @returns Megabytes as rounded integer
 *
 * @example
 * ```typescript
 * bytesToMB(1048576) // 1
 * bytesToMB(1572864) // 2 (1.5 MB rounds up)
 * bytesToMB(524288) // 1 (0.5 MB rounds up)
 * bytesToMB(0) // 0
 * ```
 */
export function bytesToMB(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return 0;
    return Math.round(bytes / 1024 / 1024);
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
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '0s';
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
export function formatUptime(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '0s';
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
export function formatDurationCompact(ms) {
    if (!Number.isFinite(ms) || ms < 0)
        return '0s';
    if (ms < 1000)
        return `${ms.toFixed(0)}ms`;
    if (ms < 60000)
        return `${(ms / 1000).toFixed(1)}s`;
    if (ms < 3600000)
        return `${(ms / 60000).toFixed(1)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
}
/**
 * Truncate a string to a maximum length with ellipsis.
 *
 * @param value - Value to truncate (string or any type)
 * @param maxLength - Maximum length before truncation (default: 100)
 * @param ellipsis - String to append when truncated (default: '…')
 * @returns Truncated string, original value if not a string, or empty string if falsy
 *
 * @example
 * ```typescript
 * truncate('Hello World', 5) // "Hell…"
 * truncate('Short', 10) // "Short"
 * truncate(null) // ""
 * truncate(123, 10) // 123 (non-string passthrough)
 * truncate('Long text', 8, '...') // "Long ..."
 * ```
 */
export function truncate(value, maxLength = 100, ellipsis = '…') {
    // Handle falsy values
    if (!value && value !== 0)
        return '';
    // Handle non-strings (passthrough for compatibility)
    if (typeof value !== 'string')
        return value;
    // No truncation needed
    if (value.length <= maxLength)
        return value;
    // Truncate with ellipsis
    return value.slice(0, maxLength - ellipsis.length) + ellipsis;
}
/**
 * Format a timestamp as a human-readable relative time string.
 * Supports past dates ("X ago"), future dates ("in X"), and edge cases.
 *
 * @param date - Date object, timestamp number, or null/undefined
 * @returns Relative time string like "just now", "5m ago", "in 3h", or "never"
 *
 * @example
 * ```typescript
 * formatTimestamp(new Date()) // "just now"
 * formatTimestamp(new Date(Date.now() - 300000)) // "5m ago"
 * formatTimestamp(new Date(Date.now() + 3600000)) // "in 1h"
 * formatTimestamp(null) // "never"
 * formatTimestamp(new Date('invalid')) // "never"
 * ```
 */
export function formatTimestamp(date) {
    // Handle null/undefined
    if (!date)
        return 'never';
    // Convert to Date if needed
    const dateObj = date instanceof Date ? date : new Date(date);
    // Handle invalid dates
    if (Number.isNaN(dateObj.getTime())) {
        return 'never';
    }
    // Calculate time difference
    const now = Date.now();
    const diff = now - dateObj.getTime();
    const prefix = diff < 0 ? 'in ' : '';
    const magnitude = Math.abs(diff);
    // Handle very recent/soon
    if (magnitude < 1000) {
        return diff < 0 ? 'soon' : 'just now';
    }
    // Use formatDuration for the time component
    const duration = formatDuration(magnitude);
    return `${prefix}${duration}${diff < 0 ? '' : ' ago'}`;
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
export function stripQuotes(value) {
    if (!value)
        return value;
    const trimmed = value.trim();
    const first = trimmed.at(0);
    if ((first === '"' || first === "'") && trimmed.endsWith(first)) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
