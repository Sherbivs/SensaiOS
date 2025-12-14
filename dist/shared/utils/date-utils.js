/**
 * Date Utilities
 *
 * Centralized date parsing and manipulation utilities.
 * Consolidates duplicate toDate/startOfUtcDay implementations across the codebase.
 */
/**
 * Converts various input types to a Date object or null.
 * Returns null if the input cannot be parsed into a valid date.
 *
 * @param value - Input value (Date, string, number, or other)
 * @returns Parsed Date object or null if invalid
 *
 * @example
 * toDate(new Date()) // Returns the Date object
 * toDate('2025-01-01') // Returns Date object for 2025-01-01
 * toDate(1234567890000) // Returns Date object for timestamp
 * toDate('invalid') // Returns null
 * toDate(null) // Returns null
 */
export function toDate(value) {
    if (value instanceof Date) {
        return Number.isNaN(value.valueOf()) ? null : value;
    }
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.valueOf()) ? null : parsed;
    }
    return null;
}
/**
 * Converts input to a Date object, falling back to current date if invalid.
 * Unlike toDate(), this never returns null - it always returns a valid Date.
 *
 * @param value - Input value (Date, string, number, or other)
 * @returns Parsed Date object or current date if invalid
 *
 * @example
 * toDateOrNow(new Date()) // Returns the Date object
 * toDateOrNow('invalid') // Returns current date
 * toDateOrNow(null) // Returns current date
 */
export function toDateOrNow(value) {
    if (value instanceof Date)
        return value;
    const asDate = new Date(value);
    return Number.isNaN(asDate.getTime()) ? new Date() : asDate;
}
/**
 * Returns the start of the UTC day (00:00:00.000) for the given date.
 * Useful for date comparisons and day-based calculations.
 *
 * @param date - Input date
 * @returns New Date object set to start of UTC day
 *
 * @example
 * startOfUtcDay(new Date('2025-01-15T14:30:00Z')) // Returns 2025-01-15T00:00:00.000Z
 */
export function startOfUtcDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
/**
 * Calculates the difference in UTC days between two dates.
 *
 * @param a - First date
 * @param b - Second date
 * @returns Number of days difference (can be negative)
 *
 * @example
 * diffInUtcDays(new Date('2025-01-15'), new Date('2025-01-10')) // Returns 5
 * diffInUtcDays(new Date('2025-01-10'), new Date('2025-01-15')) // Returns -5
 */
export function diffInUtcDays(a, b) {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const startA = startOfUtcDay(a).getTime();
    const startB = startOfUtcDay(b).getTime();
    return Math.round((startA - startB) / MS_PER_DAY);
}
/**
 * Clones a Date object, returning a new Date with the same timestamp.
 * Returns null if input is not a valid Date.
 *
 * @param value - Input date
 * @returns Cloned Date object or null
 *
 * @example
 * const date = new Date();
 * const clone = cloneDate(date);
 * clone.setHours(10); // Original date is unchanged
 */
export function cloneDate(value) {
    return value instanceof Date ? new Date(value.getTime()) : null;
}
