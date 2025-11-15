/**
 * Home Bundle Aggregations (PostgreSQL)
 * 
 * Purpose: Complex multi-model queries for user profile/home views
 * - Loads User + Party (with slots/pokemon) + Cooldowns + Encounter in one bundle
 * - Replaces Prisma's nested include with manual JOINs
 * - Maintains cache integration with TtlLruCache
 * 
 * Patterns Used:
 * - 3-way JOIN: Party → PartySlot → PokemonInstance (reuses party-queries-pg)
 * - Parallel loading: Promise.all for independent queries
 * - Date revival: readyAt, expiresAt, startedAt, createdAt
 * - NULL handling: Party/Encounter may not exist for user
 * - Cache integration: TtlLruCache with configurable TTL/max entries
 * 
 * Related Files:
 * - src/services/home-bundle.ts (legacy Prisma implementation)
 * - src/shared/models/user-queries-pg.ts (User operations)
 * - src/shared/models/party-queries-pg.ts (Party with slots/pokemon)
 * - src/shared/models/encounter-queries-pg.ts (Encounter operations)
 */

import type { PoolClient } from "pg";
import { getProdDb } from "../shared/pg-connection.js";
import { TtlLruCache } from "../shared/cache/ttl-lru.js";
import type { User, Cooldown, Encounter } from "../types/db-models.js";
import { getUserBasic } from "../shared/models/user-queries-pg.js";
import { getPartyWithSlots, type PartyWithSlots } from "../shared/models/party-queries-pg.js";
import { findActiveEncounterForUser } from "../shared/models/encounter-queries-pg.js";

// ============================================================================
// Configuration
// ============================================================================

function coercePositiveNumber(value: unknown, fallback: number, minimum: number): number {
  const numeric = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(minimum, Math.floor(numeric));
}

const DEFAULT_MAX_ENTRIES = coercePositiveNumber(
  process.env.HOME_CACHE_MAX_ENTRIES,
  500,
  50,
);
const DEFAULT_TTL_MS = coercePositiveNumber(process.env.HOME_CACHE_TTL_MS, 60_000, 5_000);

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Complete user home bundle with all related data
 */
export type HomeBundle = {
  user: User;
  party: PartyWithSlots | null;
  cooldowns: Cooldown[];
  encounter: Encounter | null;
};

// ============================================================================
// Cache Management
// ============================================================================

const homeCache = new TtlLruCache<string, HomeBundle>({
  max: DEFAULT_MAX_ENTRIES,
  ttlMs: DEFAULT_TTL_MS,
});

function cacheKey(userId: string): string {
  return `home:${userId}`;
}

/**
 * Prime cache with pre-loaded home bundle
 * Useful for optimistic updates after mutations
 */
export function primeHomeBundle(userId: string, bundle: HomeBundle): void {
  homeCache.set(cacheKey(userId), bundle);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Revival helper: Convert Date-like strings to Date objects
 */
function reviveDates(row: any): any {
  if (!row) return row;
  const copy = { ...row };
  if (copy.readyAt && typeof copy.readyAt === "string") copy.readyAt = new Date(copy.readyAt);
  if (copy.createdAt && typeof copy.createdAt === "string") copy.createdAt = new Date(copy.createdAt);
  if (copy.updatedAt && typeof copy.updatedAt === "string") copy.updatedAt = new Date(copy.updatedAt);
  return copy;
}

// ============================================================================
// Cooldown Queries
// ============================================================================

/**
 * Find all cooldowns for a user
 * @param userId - User UUID
 * @returns Array of cooldowns (empty if none)
 */
export async function findCooldownsByUserId(
  userId: string,
  client?: PoolClient,
): Promise<Cooldown[]> {
  const pool = client ?? getProdDb();
  const sql = `SELECT * FROM "Cooldown" WHERE "ownerId" = $1 ORDER BY "readyAt" ASC`;
  const result = await pool.query(sql, [userId]);
  return result.rows.map(reviveDates);
}

/**
 * Find specific cooldown by user and kind
 * @param userId - User UUID
 * @param kind - Cooldown kind (e.g., "daily-quest", "walk")
 * @returns Cooldown or null if not found
 */
export async function findCooldownByUserAndKind(
  userId: string,
  kind: string,
  client?: PoolClient,
): Promise<Cooldown | null> {
  const pool = client ?? getProdDb();
  const sql = `SELECT * FROM "Cooldown" WHERE "ownerId" = $1 AND kind = $2`;
  const result = await pool.query(sql, [userId, kind]);
  return result.rows.length > 0 ? reviveDates(result.rows[0]) : null;
}

/**
 * Create cooldown for user
 * @param userId - User UUID
 * @param kind - Cooldown kind
 * @param readyAt - When cooldown expires
 * @param metaJson - Optional metadata
 * @returns Created cooldown
 */
export async function createCooldown(
  userId: string,
  kind: string,
  readyAt: Date,
  metaJson: any = null,
  client?: PoolClient,
): Promise<Cooldown> {
  const pool = client ?? getProdDb();
  const sql = `
    INSERT INTO "Cooldown" ("ownerId", kind, "readyAt", "metaJson", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING *
  `;
  const result = await pool.query(sql, [userId, kind, readyAt, metaJson ? JSON.stringify(metaJson) : null]);
  return reviveDates(result.rows[0]);
}

/**
 * Update cooldown readyAt timestamp
 * @param cooldownId - Cooldown UUID
 * @param readyAt - New ready timestamp
 * @returns Updated cooldown
 */
export async function updateCooldownReadyAt(
  cooldownId: string,
  readyAt: Date,
  client?: PoolClient,
): Promise<Cooldown> {
  const pool = client ?? getProdDb();
  const sql = `
    UPDATE "Cooldown"
    SET "readyAt" = $2, "updatedAt" = NOW()
    WHERE id = $1
    RETURNING *
  `;
  const result = await pool.query(sql, [cooldownId, readyAt]);
  if (result.rows.length === 0) throw new Error(`Cooldown not found: ${cooldownId}`);
  return reviveDates(result.rows[0]);
}

/**
 * Delete cooldown by ID
 * @param cooldownId - Cooldown UUID
 * @returns True if deleted, false if not found
 */
export async function deleteCooldown(
  cooldownId: string,
  client?: PoolClient,
): Promise<boolean> {
  const pool = client ?? getProdDb();
  const sql = `DELETE FROM "Cooldown" WHERE id = $1`;
  const result = await pool.query(sql, [cooldownId]);
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Delete expired cooldowns (cleanup operation)
 * @returns Number of cooldowns deleted
 */
export async function deleteExpiredCooldowns(
  client?: PoolClient,
): Promise<number> {
  const pool = client ?? getProdDb();
  const sql = `DELETE FROM "Cooldown" WHERE "readyAt" < NOW()`;
  const result = await pool.query(sql, []);
  return result.rowCount ?? 0;
}

// ============================================================================
// Home Bundle Loading
// ============================================================================

/**
 * Load complete home bundle by Discord ID
 * Fetches User + Party (with slots/pokemon) + Cooldowns + Active Encounter
 * Uses cache with configurable TTL (default 60s)
 * 
 * @param discordId - Discord user ID (snowflake string)
 * @returns HomeBundle with all user data
 * @throws Error if user not found
 */
export async function loadHomeBundleByDiscordId(
  discordId: string,
): Promise<HomeBundle> {
  // Get user first (returns null if not found, but we'll throw)
  const user = await getUserBasic(discordId);
  if (!user) {
    throw new Error(`User not found for Discord ID: ${discordId}`);
  }
  
  // Check cache
  const key = cacheKey(user.id);
  const cached = homeCache.get(key);
  if (cached) {
    return cached;
  }

  // Load all related data in parallel
  const [party, cooldowns, encounter] = await Promise.all([
    getPartyWithSlots(user.id),
    findCooldownsByUserId(user.id),
    findActiveEncounterForUser(user.id),
  ]);

  // Expand UserBasic to full User for bundle (getUserBasic returns all User fields)
  const fullUser = user as unknown as User;
  
  const bundle: HomeBundle = { user: fullUser, party, cooldowns, encounter };
  homeCache.set(key, bundle);
  return bundle;
}

/**
 * Load home bundle by user UUID (bypasses Discord ID lookup)
 * @param userId - User UUID
 * @returns HomeBundle or null if user not found
 */
export async function loadHomeBundleByUserId(
  userId: string,
): Promise<HomeBundle | null> {
  const pool = getProdDb();
  
  // Check cache first
  const key = cacheKey(userId);
  const cached = homeCache.get(key);
  if (cached) {
    return cached;
  }

  // Load user
  const userResult = await pool.query(`SELECT * FROM "User" WHERE id = $1`, [userId]);
  if (userResult.rows.length === 0) return null;
  
  const user = userResult.rows[0] as User;
  user.createdAt = new Date(user.createdAt);

  // Load related data in parallel
  const [party, cooldowns, encounter] = await Promise.all([
    getPartyWithSlots(user.id),
    findCooldownsByUserId(user.id),
    findActiveEncounterForUser(user.id),
  ]);

  const bundle: HomeBundle = { user, party, cooldowns, encounter };
  homeCache.set(key, bundle);
  return bundle;
}

/**
 * Get cache statistics for monitoring
 * @returns Cache stats (size, max, hit rate)
 */
export function getHomeCacheStats() {
  return {
    size: homeCache.size,
    max: DEFAULT_MAX_ENTRIES,
    ttlMs: DEFAULT_TTL_MS,
  };
}

/**
 * Clear entire home bundle cache
 * Useful for testing or manual cache invalidation
 */
export function clearHomeCache(): void {
  homeCache.clear();
}
