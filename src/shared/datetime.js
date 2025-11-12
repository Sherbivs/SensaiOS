/**
 * Datetime utilities for EST/EDT timezone formatting
 * 
 * All user-facing timestamps should use these helpers to ensure
 * consistent Eastern Time display across the application.
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
 * Format a date to EST/EDT short format (date + time, no seconds)
 * @param {Date|number|string} date - Date object, timestamp, or ISO string
 * @returns {string} Formatted date string in Eastern Time (e.g., "11/12/2025, 8:21 PM")
 */
export function toEasternShort(date) {
  return toEasternString(date, {
    second: undefined,
  });
}

/**
 * Format a date to EST/EDT long format with weekday
 * @param {Date|number|string} date - Date object, timestamp, or ISO string
 * @returns {string} Formatted date string in Eastern Time (e.g., "Monday, 11/12/2025, 8:21:32 PM")
 */
export function toEasternLong(date) {
  return toEasternString(date, {
    weekday: 'long',
  });
}

/**
 * Get current date/time in Eastern timezone
 * @returns {string} Current timestamp in Eastern Time
 */
export function nowEastern() {
  return toEasternString(new Date());
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
