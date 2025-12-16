/**
 * Database Row Types
 * 
 * Type definitions for raw PostgreSQL query results.
 * These types represent the shape of data returned from pg queries
 * BEFORE transformation by revive* functions.
 * 
 * @module types/database-rows
 * @since 2025-12-15
 * 
 * Usage:
 * - Import these types for `revive*` function parameters
 * - Ensures type safety without using `any`
 * - Derived from Prisma schema but for raw pg rows
 * 
 * Note: PostgreSQL bigserial IDs come as strings in node-pg
 * Note: PostgreSQL timestamps come as Date objects with node-pg defaults
 */

import type { Prisma } from "@prisma/client";

// ============================================================================
// Common Types
// ============================================================================

/** PostgreSQL JSON/JSONB fields - use Prisma's type for compatibility */
export type PgJson = Prisma.JsonValue | null;

/** PostgreSQL timestamp - comes as Date with node-pg driver defaults */
export type PgTimestamp = Date | string | null;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Ensure a timestamp value is a Date object
 * @param value - Timestamp value from pg (Date, string, or null)
 * @returns Date object or null
 */
export function pgTimestampToDate(value: PgTimestamp): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value);
}

/**
 * Ensure a timestamp value is a Date object (throws if null)
 * @param value - Timestamp value from pg (Date, string, or null)
 * @returns Date object (never null)
 * @throws Error if value is null/undefined
 */
export function pgTimestampToDateRequired(value: PgTimestamp): Date {
  if (!value) throw new Error("Required timestamp is null");
  if (value instanceof Date) return value;
  return new Date(value);
}

// ============================================================================
// Party Rows
// ============================================================================

/**
 * Raw row from Party table (standalone query)
 * Used by: reviveParty() in party-queries-pg.ts
 * 
 * Note: IDs are strings in node-pg (bigserial → string)
 */
export interface PartyRow {
  id: string;
  ownerId: string;
  trainerId: string | null;
  createdAt: PgTimestamp;
  updatedAt: PgTimestamp;
}

/**
 * Raw row from PartySlot table (standalone query)
 * Used by: revivePartySlot() in party-queries-pg.ts
 */
export interface PartySlotRow {
  id: string;
  partyId: string;
  pokemonId: string;
  slot: number;
  updatedAt: PgTimestamp;
}

/**
 * Raw row from PokemonInstance table (standalone query)
 * Used by: revivePokemon() in party-queries-pg.ts
 */
export interface PokemonInstanceRow {
  id: string;
  ownerId: string;
  speciesId: number;
  form: string | null;
  level: number;
  exp: number;
  nature: string | null;
  ivsJson: PgJson;
  evsJson: PgJson;
  movesJson: PgJson;
  status: string | null;
  hp: number;
  maxHp: number;
  isShiny: boolean;
  nickname: string | null;
  boxSlot: number | null;
  createdAt: PgTimestamp;
  updatedAt: PgTimestamp;
  tenantId: string | null;
  trainerId: string | null;
  packHash: string | null;
}

/**
 * Aliased row from Party JOIN PartySlot JOIN PokemonInstance query
 * Used by: getPartyWithSlots() join query
 * 
 * Column naming convention: {table}_{column}
 */
export interface PartyWithSlotsRow {
  // Party fields (prefixed with party_)
  party_id: string;
  party_ownerId: string;
  party_trainerId: string | null;
  party_createdAt: PgTimestamp;
  party_updatedAt: PgTimestamp;
  
  // PartySlot fields (prefixed with slot_)
  slot_id: string | null;
  slot_partyId: string | null;
  slot_slot: number | null;
  slot_pokemonId: string | null;
  slot_updatedAt: PgTimestamp;
  
  // PokemonInstance fields (prefixed with pokemon_)
  pokemon_id: string | null;
  pokemon_ownerId: string | null;
  pokemon_speciesId: number | null;
  pokemon_form: string | null;
  pokemon_level: number | null;
  pokemon_exp: number | null;
  pokemon_nature: string | null;
  pokemon_ivsJson: PgJson;
  pokemon_evsJson: PgJson;
  pokemon_movesJson: PgJson;
  pokemon_status: string | null;
  pokemon_hp: number | null;
  pokemon_maxHp: number | null;
  pokemon_isShiny: boolean | null;
  pokemon_nickname: string | null;
  pokemon_boxSlot: number | null;
  pokemon_createdAt: PgTimestamp;
  pokemon_updatedAt: PgTimestamp;
  pokemon_tenantId: string | null;
  pokemon_trainerId: string | null;
  pokemon_packHash: string | null;
}

// ============================================================================
// Battle Rows
// ============================================================================

/**
 * Raw row from Battle table (standalone query)
 * Used by: reviveBattle() in battle-queries-pg.ts
 */
export interface BattleRow {
  id: string;
  p1Id: string;
  p2Id: string;
  arenaThreadId: string | null;
  state: string;
  rngSeed: string;
  ruleset: string;
  logCompact: PgJson;
  logFull: PgJson;
  resultJson: PgJson;
  startedAt: PgTimestamp;
  endedAt: PgTimestamp;
  updatedAt: PgTimestamp;
  tenantId: string | null;
  packHash: string | null;
  trainer1Id: string | null;
  trainer2Id: string | null;
}

/**
 * Extended battle row with related trainer info (JOIN query)
 */
export interface BattleWithTrainersRow extends BattleRow {
  p1DiscordId?: string;
  p2DiscordId?: string;
  p1Username?: string | null;
  p2Username?: string | null;
}

// ============================================================================
// Encounter Rows
// ============================================================================

/**
 * Raw row from Encounter table
 * Used by: reviveEncounter() in encounter-queries-pg.ts
 */
export interface EncounterRow {
  id: string;
  ownerId: string;
  speciesId: number;
  level: number;
  state: string;
  threadChannelId: string | null;
  startedAt: PgTimestamp;
  expiresAt: PgTimestamp;
  dataJson: PgJson;
  tenantId: string | null;
  trainerId: string | null;
  packHash: string | null;
}

// ============================================================================
// User Rows
// ============================================================================

/**
 * Raw row from User table
 * Used by: reviveUser() in user-queries-pg.ts
 */
export interface UserRow {
  id: string;
  discordId: string;
  platformId: string | null;
  createdAt: PgTimestamp;
  updatedAt: PgTimestamp;
  coins: number;
  settingsJson: PgJson;
  dailyQuestStreak: number;
  dailyQuestLastCompleted: PgTimestamp;
  dailyQuestLastReset: PgTimestamp;
}

// ============================================================================
// Cooldown Rows
// ============================================================================

/**
 * Raw row from Cooldown table
 */
export interface CooldownRow {
  id: string;
  ownerId: string;
  kind: string;
  readyAt: PgTimestamp;
  metaJson: PgJson;
  createdAt: PgTimestamp;
  updatedAt: PgTimestamp;
}

// ============================================================================
// BusMessage Rows
// ============================================================================

/**
 * Raw row from BusMessage table
 */
export interface BusMessageRow {
  id: string;
  kind: string;
  topic: string;
  priority: string;
  shardKey: string | null;
  idempotencyKey: string;
  payload: PgJson;
  createdAt: PgTimestamp;
  availableAt: PgTimestamp;
  status: string;
  attempts: number;
  error: string | null;
  processedAt: PgTimestamp;
  updatedAt: PgTimestamp;
}

// ============================================================================
// Home Bundle Rows
// ============================================================================

/**
 * Combined row for home view bundle (JOIN query)
 * Used by: home-bundle-pg.ts
 */
export interface HomeBundleRow {
  // User fields
  userId: string;
  discordId: string;
  username: string | null;
  coins: number;
  
  // Trainer fields (if joined)
  trainerLevel?: number;
  trainerExperience?: number;
  
  // Aggregates (COUNT returns string in node-pg)
  pokemonCount?: string | number;
  battleWins?: string | number;
  battleLosses?: string | number;
  
  // Metadata
  metaJson?: PgJson;
}

// ============================================================================
// Homestead Rows
// ============================================================================

/**
 * Raw row from Homestead table
 */
export interface HomesteadRow {
  id: string;
  userId: string;
  guildId: string;
  channelId: string;
  channelName: string;
  status: string;
  createdAt: PgTimestamp;
  updatedAt: PgTimestamp;
  lastActivityAt: PgTimestamp;
}

// ============================================================================
// Trainer Profile Rows
// ============================================================================

/**
 * Raw row from TrainerProfile table
 */
export interface TrainerProfileRow {
  id: string;
  userId: string;
  experience: number;
  level: number;
  createdAt: PgTimestamp;
  updatedAt: PgTimestamp;
}
