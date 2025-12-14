/**
 * @file Severity Level Utilities
 * @description Centralized severity level handling for security threats and alerts
 * @module shared/utils/severity-utils
 *
 * CONSOLIDATION: Replaces duplicate getSeverityIndicator() functions in:
 * - src/bot/state/threatDetector.js
 * - src/bot/state/threatResponse.js
 */
/**
 * Get emoji indicator for severity level
 *
 * @param severity - Threat/alert severity level
 * @returns Emoji indicator (🔴 CRITICAL, 🟠 HIGH, 🟡 MEDIUM, 🔵 LOW, ⚪ default)
 *
 * @example
 * getSeverityIndicator('CRITICAL'); // '🔴'
 * getSeverityIndicator('HIGH');     // '🟠'
 * getSeverityIndicator('UNKNOWN');  // '⚪'
 */
export function getSeverityIndicator(severity) {
    switch (severity) {
        case 'CRITICAL':
            return '🔴';
        case 'HIGH':
            return '🟠';
        case 'MEDIUM':
            return '🟡';
        case 'LOW':
            return '🔵';
        default:
            return '⚪';
    }
}
/**
 * Get numeric priority for severity level (for sorting)
 *
 * @param severity - Severity level
 * @returns Priority number (higher = more severe)
 *
 * @example
 * getSeverityPriority('CRITICAL'); // 4
 * getSeverityPriority('LOW');      // 1
 */
export function getSeverityPriority(severity) {
    switch (severity) {
        case 'CRITICAL':
            return 4;
        case 'HIGH':
            return 3;
        case 'MEDIUM':
            return 2;
        case 'LOW':
            return 1;
        default:
            return 0;
    }
}
/**
 * Get human-readable severity label
 *
 * @param severity - Severity level
 * @returns Formatted label with emoji
 *
 * @example
 * getSeverityLabel('CRITICAL'); // '🔴 Critical'
 * getSeverityLabel('HIGH');     // '🟠 High'
 */
export function getSeverityLabel(severity) {
    const emoji = getSeverityIndicator(severity);
    const label = severity.charAt(0) + severity.slice(1).toLowerCase();
    return `${emoji} ${label}`;
}
/**
 * Validate severity level
 *
 * @param severity - Severity level to validate
 * @returns True if valid severity level
 */
export function isValidSeverity(severity) {
    return ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(severity);
}
