/**
 * @fileoverview Object manipulation utilities.
 */

/**
 * Deep clone an object/array using structuredClone (preferred) or JSON fallback.
 * 
 * Note: structuredClone is available in Node 17+ and modern browsers.
 * Falls back to JSON.parse(JSON.stringify()) for compatibility.
 * 
 * Limitations of JSON fallback:
 * - Cannot clone functions, symbols, or undefined values
 * - Cannot clone circular references
 * - Loses prototype chain
 * 
 * @param value - Value to clone
 * @returns Deep cloned copy
 */
export function deepClone<T>(value: T): T {
  // Prefer structuredClone when available (Node 17+)
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  
  // Fallback to JSON round-trip
  return JSON.parse(JSON.stringify(value)) as T;
}
