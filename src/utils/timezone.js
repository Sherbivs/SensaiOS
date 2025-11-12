/**
 * Timezone Utilities (DEPRECATED - Use src/shared/datetime.js instead)
 * 
 * This module is maintained for backward compatibility with existing code
 * that imports formatInTimeZone. New code should import from:
 * 
 *   import { formatInTimeZone, toEasternString } from '../shared/datetime.js';
 * 
 * The application standardizes on Eastern Time (America/New_York) for all
 * timestamp displays. See docs/timezone-standardization-guide.md for migration
 * instructions.
 * 
 * @deprecated Use src/shared/datetime.js instead
 */

const DEFAULT_LOCALE = 'en-US';
const EASTERN_TIMEZONE = 'America/New_York';

function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
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
    if (part.type === 'literal') continue;
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

function formatInTimeZone(date, timeZone, options = {}) {
  const formatter = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone,
    ...options,
  });
  return formatter.format(date);
}

/**
 * Calculate milliseconds until next occurrence of hour:minute in given timezone
 * 
 * **Note**: For Eastern Time calculations, consider using the shared datetime
 * module which provides timezone-aware helpers.
 * 
 * @param {number} hour - Target hour (0-23)
 * @param {number} minute - Target minute (0-59)
 * @param {string} timeZone - IANA timezone identifier (default: America/New_York)
 * @returns {number} Milliseconds until target time
 */
function msUntilNextZonedTime(hour, minute, timeZone = EASTERN_TIMEZONE) {
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

export { msUntilNextZonedTime, formatInTimeZone };

export default { msUntilNextZonedTime, formatInTimeZone };
