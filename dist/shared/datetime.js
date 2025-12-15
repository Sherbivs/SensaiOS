/**
 * Datetime Utilities - Eastern Time (EST/EDT)
 *
 * **CRITICAL: This is the SINGLE SOURCE OF TRUTH for all timestamp formatting
 * across the entire application.**
 *
 * All timestamps displayed to users or written to logs should use functions from
 * this module to ensure consistent timezone handling. The application uses
 * Eastern Time (America/New_York) as the standard timezone for all displays.
 *
 * **Timestamp Categories:**
 * 1. **User-Facing Displays** (Discord messages, notifications, summaries):
 *    → Use toEasternString(), toEasternTime(), toEasternDate()
 *
 * 2. **Console Logging** (monitoring output, debug statements):
 *    → Use toEasternLogFormat() for high-precision timestamps
 *
 * 3. **State Persistence** (JSON files, database records, Event Bus metadata):
 *    → Use Date.toISOString() for UTC format (portability)
 *
 * **DO NOT use these directly in application code:**
 * - ❌ new Date().toLocaleString() → Use toEasternString()
 * - ❌ new Date().toLocaleDateString() → Use toEasternDate()
 * - ❌ new Date().toLocaleTimeString() → Use toEasternTime()
 * - ❌ Intl.DateTimeFormat without timezone → Use formatInTimeZone()
 *
 * @module shared/datetime
 */
const EASTERN_TIMEZONE = 'America/New_York';
/**
 * Format a date to EST/EDT locale string
 * @param {Date|number|string} date - Date object, timestamp, or ISO string
 * @param {Object} options - Intl.DateTimeFormat options (defaults to date + time)
 * @returns {string} Formatted date string in Eastern Time
 */
export function toEasternString(date, options = {}) {
    const dateObj = date instanceof Date ? date : new Date(date);
    const defaultOptions = {
        timeZone: EASTERN_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    };
    return dateObj.toLocaleString('en-US', { ...defaultOptions, ...options });
}
/**
 * Format a date to EST/EDT time only (no date)
 * @param {Date|number|string} date - Date object, timestamp, or ISO string
 * @returns {string} Formatted time string in Eastern Time (e.g., "8:21:32 PM")
 */
export function toEasternTime(date) {
    return toEasternString(date, {
        year: undefined,
        month: undefined,
        day: undefined,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });
}
/**
 * Format a date to EST/EDT date only (no time)
 * @param {Date|number|string} date - Date object, timestamp, or ISO string
 * @returns {string} Formatted date string in Eastern Time (e.g., "11/12/2025")
 */
export function toEasternDate(date) {
    return toEasternString(date, {
        hour: undefined,
        minute: undefined,
        second: undefined,
        hour12: undefined,
    });
}
/**
 * Get timezone abbreviation (EST or EDT) for a given date
 * @param {Date|number|string} date - Date object, timestamp, or ISO string
 * @returns {string} Timezone abbreviation ('EST' or 'EDT')
 */
export function getEasternTimezoneAbbr(date = new Date()) {
    const dateObj = date instanceof Date ? date : new Date(date);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: EASTERN_TIMEZONE,
        timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(dateObj);
    const timeZonePart = parts.find(part => part.type === 'timeZoneName');
    return timeZonePart ? timeZonePart.value : 'EST';
}
/**
 * Generic timezone formatting function
 * Use this for custom timezone formatting needs, but prefer toEasternString()
 * for standard Eastern Time displays.
 *
 * @param {Date|number|string} date - Date to format
 * @param {string} timeZone - IANA timezone identifier (e.g., 'America/New_York')
 * @param {Intl.DateTimeFormatOptions} [options] - Formatting options
 * @returns {string} Formatted date string in specified timezone
 */
export function formatInTimeZone(date, timeZone, options = {}) {
    const dateObj = date instanceof Date ? date : new Date(date);
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        ...options,
    });
    return formatter.format(dateObj);
}
/**
 * Format date/time for console logging with milliseconds
 * Provides high-precision timestamps for debugging and monitoring.
 *
 * @param {Date|number|string} [date=new Date()] - Date to format
 * @returns {string} Formatted string like "11/12/2025, 8:21:32.456 PM EST"
 */
export function toEasternLogFormat(date = new Date()) {
    const dateObj = date instanceof Date ? date : new Date(date);
    const baseFormat = toEasternString(dateObj);
    const ms = dateObj.getMilliseconds().toString().padStart(3, '0');
    const abbr = getEasternTimezoneAbbr(dateObj);
    return `${baseFormat}.${ms} ${abbr}`;
}
/**
 * Internal helpers for timezone calculations
 */
function getZonedParts(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const bag = Object.create(null);
    for (const part of parts) {
        if (part.type === 'literal')
            continue;
        bag[part.type] = part.value;
    }
    return {
        year: Number(bag.year),
        month: Number(bag.month),
        day: Number(bag.day),
        hour: Number(bag.hour),
        minute: Number(bag.minute),
        second: Number(bag.second),
    };
}
function partsToUtcMs({ year, month, day, hour, minute, second }) {
    return Date.UTC(year, month - 1, day, hour, minute, second || 0, 0);
}
/**
 * Calculate milliseconds until next occurrence of hour:minute in given timezone
 * Used for scheduling operations at specific times in a timezone (e.g., daily digests).
 *
 * @param {number} hour - Target hour (0-23)
 * @param {number} minute - Target minute (0-59)
 * @param {string} [timeZone='America/New_York'] - IANA timezone identifier
 * @returns {number} Milliseconds until target time
 *
 * @example
 * // Schedule something for 9:00 AM EST tomorrow
 * const msUntil9AM = msUntilNextZonedTime(9, 0);
 * setTimeout(task, msUntil9AM);
 */
export function msUntilNextZonedTime(hour, minute, timeZone = EASTERN_TIMEZONE) {
    const now = new Date();
    const nowParts = getZonedParts(now, timeZone);
    const targetToday = partsToUtcMs({
        ...nowParts,
        hour,
        minute,
        second: 0,
    });
    if (targetToday > now.getTime()) {
        return targetToday - now.getTime();
    }
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowParts = getZonedParts(tomorrow, timeZone);
    const targetTomorrow = partsToUtcMs({
        ...tomorrowParts,
        hour,
        minute,
        second: 0,
    });
    return targetTomorrow - now.getTime();
}
