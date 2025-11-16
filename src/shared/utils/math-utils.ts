/**
 * Mathematical utility functions for common operations.
 * Centralizes duplicate math logic across the codebase.
 * 
 * @module shared/utils/math-utils
 */

/**
 * Clamp a number between minimum and maximum bounds (inclusive).
 * Returns the closest value within the specified range.
 * 
 * @param value - Number to clamp
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @returns Clamped value between min and max
 * 
 * @example
 * ```typescript
 * clamp(5, 0, 10)   // 5
 * clamp(-5, 0, 10)  // 0
 * clamp(15, 0, 10)  // 10
 * clamp(7, 5, 5)    // 5 (when min === max)
 * ```
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
