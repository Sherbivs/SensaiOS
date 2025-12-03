/**
 * Database Model Types
 * 
 * Auto-generated from prisma/schema.prisma
 * DO NOT EDIT MANUALLY
 * 
 * Run: npm run generate:types
 */

import type { Prisma } from '../generated/prisma/client.js';

// ============================================================================
// Enums
// ============================================================================

export enum BusKind {
  event = "event",
  command = "command",
}

export enum BusStatus {
  pending = "pending",
  processing = "processing",
  done = "done",
  error = "error",
}

export enum BusPriority {
  high = "high",
  normal = "normal",
  low = "low",
}

// ============================================================================
// Base Models
// ============================================================================

export interface User {
  id: string;
  discordId: string;
  platformId: string | null;
  createdAt: Date;
  updatedAt: Date;
  coins: number;
  settingsJson: Prisma.JsonValue | null;
  dailyQuestStreak: number;
  dailyQuestLastCompleted: Date | null;
  dailyQuestLastReset: Date | null;
}

export interface PokemonInstance {
  id: string;
  ownerId: string;
  speciesId: number;
  form: string | null;
  level: number;
  exp: number;
  nature: string | null;
  ivsJson: Prisma.JsonValue;
  evsJson: Prisma.JsonValue;
  movesJson: Prisma.JsonValue;
  status: string | null;
  hp: number;
  maxHp: number;
  isShiny: boolean;
  nickname: string | null;
  boxSlot: number | null;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string | null;
  trainerId: string | null;
  packHash: string | null;
}

export interface Party {
  id: string;
  ownerId: string;
  trainerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartySlot {
  id: string;
  partyId: string;
  slot: number;
  pokemonId: string;
  updatedAt: Date;
}

export interface Encounter {
  id: string;
  ownerId: string;
  speciesId: number;
  level: number;
  state: string;
  threadChannelId: string | null;
  startedAt: Date;
  expiresAt: Date | null;
  dataJson: Prisma.JsonValue | null;
  tenantId: string | null;
  trainerId: string | null;
  packHash: string | null;
}

export interface Battle {
  id: string;
  p1Id: string;
  p2Id: string;
  arenaThreadId: string | null;
  state: string;
  rngSeed: string;
  ruleset: string;
  logCompact: Prisma.JsonValue | null;
  logFull: Prisma.JsonValue | null;
  resultJson: Prisma.JsonValue | null;
  startedAt: Date;
  endedAt: Date | null;
  updatedAt: Date;
  tenantId: string | null;
  packHash: string | null;
  trainer1Id: string | null;
  trainer2Id: string | null;
}

export interface Cooldown {
  id: string;
  ownerId: string;
  kind: string;
  readyAt: Date;
  metaJson: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusMessage {
  id: string;
  kind: BusKind;
  topic: string;
  priority: BusPriority;
  shardKey: string | null;
  idempotencyKey: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
  availableAt: Date;
  status: BusStatus;
  attempts: number;
  error: string | null;
  processedAt: Date | null;
  updatedAt: Date;
}

// ============================================================================
// Relation Types (Common Patterns)
// ============================================================================

export interface PartyWithSlots extends Party {
  slots: PartySlot[];
}

export interface PartySlotWithPokemon extends PartySlot {
  pokemon: PokemonInstance;
}

export interface BattleWithPlayers extends Battle {
  p1: User;
  p2: User;
}

// ============================================================================
// Common Pick Types (Partial Selects)
// ============================================================================
