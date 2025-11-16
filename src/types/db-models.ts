/**
 * Database Model Types
 * 
 * Auto-generated from prisma/schema.prisma
 * DO NOT EDIT MANUALLY
 * 
 * Run: npm run generate:types
 */

import type { Prisma } from '@prisma/client';

// ============================================================================
// Enums
// ============================================================================

export enum MoveCategory {
  physical = "physical",
  special = "special",
  status = "status",
}

export enum LearnMethod {
  level = "level",
  machine = "machine",
  tutor = "tutor",
  egg = "egg",
}

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

export interface Tenant {
  id: string;
  createdAt: Date;
}

export interface Trainer {
  id: string;
  tenantId: string;
  userId: string;
  nickname: string | null;
  createdAt: Date;
}

export interface DexPack {
  packHash: string;
  schemaVer: number;
  gen: number;
  signedAt: Date;
  metaJson: Prisma.JsonValue;
}

export interface TrainerSettings {
  trainerId: string;
  activePack: string;
  prefsJson: Prisma.JsonValue;
  updatedAt: Date;
}

export interface TrainerProfile {
  userId: string;
  tagline: string | null;
  bio: string | null;
  favoriteSpeciesId: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Type {
  id: number;
  slug: string;
  name: string;
}

export interface Ability {
  id: number;
  slug: string;
  name: string;
  desc: string | null;
}

export interface Item {
  id: number;
  slug: string;
  name: string;
  kind: string;
  meta: Prisma.JsonValue | null;
  packHash: string | null;
}

export interface Move {
  id: number;
  slug: string;
  name: string;
  typeId: number;
  power: number | null;
  accuracy: number | null;
  pp: number;
  meta: Prisma.JsonValue | null;
  packHash: string | null;
}

export interface Species {
  id: number;
  slug: string;
  name: string;
  typeOne: string;
  typeTwo: string | null;
  abilities: string[];
  baseStats: number[];
  evYields: number[];
  gen: number;
  eggGroups: string[];
  genderRatio: number | null;
  catchRate: number;
  baseFriendship: number;
  baseExpYield: number;
  growthRate: string;
  meta: Prisma.JsonValue | null;
  packHash: string | null;
}

export interface SpeciesType {
  speciesId: number;
  typeId: number;
  slot: number;
}

export interface SpeciesAbility {
  speciesId: number;
  abilityId: number;
  slot: number;
}

export interface SpeciesLearnset {
  speciesId: number;
  moveId: number;
  method: LearnMethod;
  level: number;
  machineId: number | null;
}

export interface EvolutionStep {
  fromId: number;
  toId: number;
  trigger: string;
  level: number | null;
  itemId: number | null;
  meta: Prisma.JsonValue | null;
}

export interface TypeChart {
  atkTypeId: number;
  defTypeId: number;
  mult: number;
}

export interface NameVariant {
  id: string;
  kind: string;
  refIntId: number;
  locale: string;
  nameType: string;
  value: string;
  normalized: string;
}

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

export interface Inventory {
  trainerId: string;
  itemId: number;
  qty: number;
}

export interface EncounterData {
  id: number;
  route: string;
  method: string;
  wildSpeciesId: number;
  meta: Prisma.JsonValue | null;
  packHash: string | null;
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

export interface PokemonInstanceWithSpecies extends PokemonInstance {
  species: Species;
}

export interface BattleWithPlayers extends Battle {
  p1: User;
  p2: User;
}

export interface SpeciesWithAbilities extends Omit<Species, 'abilities'> {
  abilities: SpeciesAbility[];
}

// ============================================================================
// Common Pick Types (Partial Selects)
// ============================================================================

export type PokemonSummary = Pick<PokemonInstance, 'id' | 'speciesId' | 'level' | 'hp' | 'maxHp' | 'nickname'>;
