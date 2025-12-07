/**
 * JSON Type Compatibility Utilities
 * 
 * PURPOSE:
 * Bridge the gap between application interfaces (StatSpread, MoveSlot, BattleResult, etc.)
 * and Prisma 7.x's strict InputJsonValue type requirements for JSON columns.
 * 
 * BACKGROUND:
 * Prisma 7.x introduced stricter typing for JSON fields. Our domain interfaces like
 * `StatSpread`, `MoveSlot`, and `BattleResult` are valid JSON at runtime but don't
 * satisfy TypeScript's structural typing against `InputJsonValue`.
 * 
 * SOLUTION:
 * Type-safe conversion functions that assert our well-structured domain types
 * as InputJsonValue without losing type safety on the input side.
 * 
 * @module shared/json-types
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields
 */

import { Prisma } from '../generated/prisma/client.js';

// Extract JSON types from Prisma namespace
type InputJsonValue = Prisma.InputJsonValue;
type JsonValue = Prisma.JsonValue;

// =============================================================================
// Type Conversion Utilities
// =============================================================================

/**
 * Safely converts a well-typed object to InputJsonValue for Prisma JSON columns.
 * 
 * Use this when assigning domain types (StatSpread, MoveSlot[], BattleResult, etc.)
 * to Prisma JSON fields like ivsJson, movesJson, resultJson, etc.
 * 
 * @example
 * ```typescript
 * const stats: StatSpread = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
 * await prisma.pokemonInstance.create({
 *   data: {
 *     ivsJson: toJsonValue(stats),
 *     // ...
 *   }
 * });
 * ```
 */
export function toJsonValue<T extends object>(value: T): InputJsonValue {
  return value as unknown as InputJsonValue;
}

/**
 * Safely converts a value that might be null/undefined to InputJsonValue or undefined.
 * Useful for optional JSON fields where you want to preserve null/undefined distinction.
 * 
 * @example
 * ```typescript
 * await prisma.auditLog.create({
 *   data: {
 *     beforeJson: toNullableJsonValue(beforeState),
 *     afterJson: toNullableJsonValue(afterState),
 *   }
 * });
 * ```
 */
export function toNullableJsonValue<T extends object | null | undefined>(
  value: T
): InputJsonValue | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return value as unknown as InputJsonValue;
}

/**
 * Safely casts a Prisma JsonValue back to a specific application type.
 * Use this when reading from JSON columns and need the typed interface.
 * 
 * @example
 * ```typescript
 * const pokemon = await prisma.pokemonInstance.findUnique({ where: { id } });
 * const moves = fromJsonValue<MoveSlot[]>(pokemon.movesJson) ?? [];
 * ```
 */
export function fromJsonValue<T>(value: JsonValue | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return value as unknown as T;
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export type { InputJsonValue, JsonValue };
