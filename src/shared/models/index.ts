/**
 * Centralized Query Pattern Library
 * 
 * Re-exports all query patterns for easy imports
 * 
 * Usage:
 *   import { getPartyWithSlots, getUserBasic } from "../shared/models";
 * 
 * Note: Legacy Prisma query files (party-queries.ts, user-queries.ts) removed.
 * All queries now use PostgreSQL direct implementations (*-pg.ts files).
 * 
 * Exports party types from party-queries-pg (primary source for Party* interfaces).
 * User queries re-exported but types PartySlotWithPokemon and PartyWithSlots come from party-queries-pg.
 */

export * from "./party-queries-pg.js";
export {
  // User query functions
  getUserBasic,
  getUserForDisplay,
  ensureUser,
  getUserWithParty,
  countUsers,
  // User types (excluding PartySlotWithPokemon and PartyWithSlots which come from party-queries-pg)
  type UserBasic,
  type UserForDisplay,
  type UserWithParty
} from "./user-queries-pg.js";
