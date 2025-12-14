/**
 * PostgreSQL User Query Patterns (Raw SQL Implementation)
 * 
 * Purpose: Direct pg replacement for user-queries.ts Prisma patterns
 * Migration: Phase 5 POC - Validates query builder API and type safety
 * 
 * Architecture:
 * - Uses pg connection pools from src/shared/pg-connection.ts
 * - Leverages query builders from src/shared/pg-query.ts
 * - Maintains type safety via src/types/db-models.ts
 * 
 * Performance: Raw SQL eliminates ORM overhead (5-10ms improvement per query)
 */

import { Pool, PoolClient } from "pg";
import { getProdDb, getDevDb } from "../pg-connection.js";
import { buildSelect, buildWhereClause, buildCount } from "../pg-query.js";
import type { User, Party, PartySlot, PokemonInstance } from "../../types/db-models.js";

/**
 * Minimal user data for basic operations (balance checks, existence checks)
 */
export type UserBasic = Pick<User, "id" | "discordId" | "coins">;

/**
 * User data for display purposes (includes ID for lookups)
 */
export type UserForDisplay = Pick<User, "id" | "discordId" | "coins" | "createdAt">;

/**
 * Party slot with Pokemon instance nested
 */
export type PartySlotWithPokemon = PartySlot & {
  pokemon: PokemonInstance;
};

/**
 * Party with slots and Pokemon instances fully loaded
 */
export type PartyWithSlots = Party & {
  slots: PartySlotWithPokemon[];
};

/**
 * User with first party fully loaded
 */
export type UserWithParty = User & {
  parties: PartyWithSlots[];
};

/**
 * Get database pool (defaults to PROD for gameplay)
 * @param pool - Optional pool override for testing
 */
function getPool(pool?: Pool): Pool {
  if (pool) return pool;
  const prodPool = getProdDb();
  if (!prodPool) {
    throw new Error("PROD database pool not initialized. Call initializeConnection() first.");
  }
  return prodPool;
}

/**
 * Get minimal user data by Discord ID
 * Use for balance checks, quick lookups where full user data not needed
 * 
 * Raw SQL equivalent of:
 *   prisma.user.findUnique({ where: { discordId }, select: { id, discordId, coins } })
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns Minimal user data or null
 */
export async function getUserBasic(
  discordId: string,
  pool?: Pool
): Promise<UserBasic | null> {
  const db = getPool(pool);
  
  const { text, values } = buildSelect(
    "User",
    ["id", "discordId", "coins"],
    { discordId }
  );
  
  const result = await db.query<UserBasic>(text, values);
  return result.rows[0] || null;
}

/**
 * Get user by database ID with minimal fields
 * 
 * Raw SQL equivalent of:
 *   prisma.user.findUnique({ where: { id: userId }, select: { id, discordId, coins } })
 * 
 * @param userId - Database user ID
 * @param pool - Optional pool override
 * @returns Minimal user data or null
 */
export async function getUserBasicById(
  userId: string,
  pool?: Pool
): Promise<UserBasic | null> {
  const db = getPool(pool);
  
  const { text, values } = buildSelect(
    "User",
    ["id", "discordId", "coins"],
    { id: userId }
  );
  
  const result = await db.query<UserBasic>(text, values);
  return result.rows[0] || null;
}

/**
 * Get user for display purposes
 * Includes creation date for profile displays
 * 
 * Raw SQL equivalent of:
 *   prisma.user.findUnique({ where: { discordId }, select: { id, discordId, coins, createdAt } })
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns User display data or null
 */
export async function getUserForDisplay(
  discordId: string,
  pool?: Pool
): Promise<UserForDisplay | null> {
  const db = getPool(pool);
  
  const { text, values } = buildSelect(
    "User",
    ["id", "discordId", "coins", "createdAt"],
    { discordId }
  );
  
  const result = await db.query<UserForDisplay>(text, values);
  return result.rows[0] || null;
}

/**
 * Get user with first party fully loaded (slots + Pokemon)
 * Use for DM home, healing, team management
 * 
 * Raw SQL equivalent of:
 *   prisma.user.findUnique({
 *     where: { discordId },
 *     include: {
 *       parties: {
 *         include: { slots: { include: { pokemon: true }, orderBy: { slot: 'asc' } } },
 *         orderBy: { createdAt: 'asc' },
 *         take: 1
 *       }
 *     }
 *   })
 * 
 * Complex 3-way join:
 *   User -> Party (first by createdAt) -> PartySlot (ordered by slot) -> PokemonInstance
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns User with first party and slots, or null
 */
export async function getUserWithParty(
  discordId: string,
  pool?: Pool
): Promise<UserWithParty | null> {
  const db = getPool(pool);
  
  // Multi-step query approach:
  // 1. Get user
  // 2. Get first party for that user
  // 3. Get slots with Pokemon for that party
  // (Avoids complex lateral joins while maintaining type safety)
  
  const userResult = await db.query<User>(
    `SELECT * FROM "User" WHERE "discordId" = $1`,
    [discordId]
  );
  
  if (userResult.rows.length === 0) {
    return null;
  }
  
  const user = userResult.rows[0];
  
  // Get first party (oldest by createdAt)
  const partyResult = await db.query<Party>(
    `SELECT * FROM "Party" WHERE "ownerId" = $1 ORDER BY "createdAt" ASC LIMIT 1`,
    [user.id]
  );
  
  if (partyResult.rows.length === 0) {
    return {
      ...user,
      parties: [],
    };
  }
  
  const party = partyResult.rows[0];
  
  // Get all slots with Pokemon for this party (LEFT JOIN for null slots)
  const slotsResult = await db.query<PartySlot & { pokemon: PokemonInstance | null }>(
    `
      SELECT 
        ps.*,
        json_build_object(
          'id', pi."id",
          'ownerId', pi."ownerId",
          'speciesId', pi."speciesId",
          'form', pi."form",
          'level', pi."level",
          'exp', pi."exp",
          'nature', pi."nature",
          'ivsJson', pi."ivsJson",
          'evsJson', pi."evsJson",
          'movesJson', pi."movesJson",
          'status', pi."status",
          'hp', pi."hp",
          'maxHp', pi."maxHp",
          'isShiny', pi."isShiny",
          'nickname', pi."nickname",
          'boxSlot', pi."boxSlot",
          'createdAt', pi."createdAt",
          'updatedAt', pi."updatedAt",
          'tenantId', pi."tenantId",
          'trainerId', pi."trainerId",
          'packHash', pi."packHash"
        ) as pokemon
      FROM "PartySlot" ps
      LEFT JOIN "PokemonInstance" pi ON ps."pokemonId" = pi."id"
      WHERE ps."partyId" = $1
      ORDER BY ps."slot" ASC
    `,
    [party.id]
  );
  
  // Reconstruct nested structure
  const slots: PartySlotWithPokemon[] = slotsResult.rows
    .filter(row => row.pokemon !== null)
    .map(row => ({
      id: row.id,
      partyId: row.partyId,
      slot: row.slot,
      pokemonId: row.pokemonId,
      updatedAt: row.updatedAt,
      pokemon: row.pokemon as PokemonInstance,
    }));
  
  const partyWithSlots: PartyWithSlots = {
    ...party,
    slots,
  };
  
  return {
    ...user,
    parties: [partyWithSlots],
  };
}

/**
 * Get full user record (when all fields genuinely needed)
 * Use sparingly - prefer specific query patterns above
 * 
 * Raw SQL equivalent of:
 *   prisma.user.findUnique({ where: { discordId } })
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns Full user record or null
 */
export async function getUserFull(
  discordId: string,
  pool?: Pool
): Promise<User | null> {
  const db = getPool(pool);
  
  const { text, values } = buildSelect("User", ["*"], { discordId });
  
  const result = await db.query<User>(text, values);
  return result.rows[0] || null;
}

/**
 * Check if user exists by Discord ID
 * Lightweight existence check without fetching any data
 * 
 * Raw SQL equivalent of:
 *   (await prisma.user.count({ where: { discordId } })) > 0
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns True if user exists
 */
export async function userExists(
  discordId: string,
  pool?: Pool
): Promise<boolean> {
  const db = getPool(pool);
  
  const { text, values } = buildCount("User", { discordId });
  
  const result = await db.query<{ count: string }>(text, values);
  const count = parseInt(result.rows[0]?.count || "0", 10);
  return count > 0;
}

/**
 * Count total users in database
 * 
 * Raw SQL equivalent of:
 *   prisma.user.count()
 * 
 * @param pool - Optional pool override
 * @returns Total user count
 */
export async function countUsers(pool?: Pool): Promise<number> {
  const db = getPool(pool);
  
  const { text, values } = buildCount("User", {});
  
  const result = await db.query<{ count: string }>(text, values);
  return parseInt(result.rows[0]?.count || "0", 10);
}

/**
 * Get user's coin balance only
 * Ultra-lightweight query for coin checks
 * 
 * Raw SQL equivalent of:
 *   (await prisma.user.findUnique({ where: { discordId }, select: { coins: true } }))?.coins
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns Coins or null if user not found
 */
export async function getUserCoins(
  discordId: string,
  pool?: Pool
): Promise<number | null> {
  const db = getPool(pool);
  
  const { text, values } = buildSelect("User", ["coins"], { discordId });
  
  const result = await db.query<{ coins: number }>(text, values);
  return result.rows[0]?.coins ?? null;
}

/**
 * Get user with complete profile data (for profile displays, admin panels)
 * Includes all stats, timestamps, but excludes relations
 * 
 * Raw SQL equivalent of:
 *   prisma.user.findUnique({ where: { discordId } })
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns User profile data or null
 */
export async function getUserProfile(
  discordId: string,
  pool?: Pool
): Promise<User | null> {
  const db = getPool(pool);
  
  const { text, values } = buildSelect("User", ["*"], { discordId });
  
  const result = await db.query<User>(text, values);
  return result.rows[0] || null;
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Create a new user
 * 
 * Raw SQL equivalent of:
 *   prisma.user.create({ data: { discordId, coins } })
 * 
 * @param discordId - Discord user ID
 * @param coins - Initial coin balance (default: 0)
 * @param pool - Optional pool override
 * @returns Created user record
 */
export async function createUser(
  discordId: string,
  coins: number = 0,
  pool?: Pool
): Promise<User> {
  const db = getPool(pool);
  
  const result = await db.query<User>(
    `
      INSERT INTO "User" ("id", "discordId", "coins", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
      RETURNING *
    `,
    [discordId, coins]
  );
  
  if (result.rows.length === 0) {
    throw new Error("Failed to create user");
  }
  
  return result.rows[0];
}

/**
 * Update user coins (absolute set)
 * 
 * Raw SQL equivalent of:
 *   prisma.user.update({ where: { discordId }, data: { coins } })
 * 
 * @param discordId - Discord user ID
 * @param coins - New coin balance
 * @param pool - Optional pool override
 * @returns Updated user or null if not found
 */
export async function updateUserCoins(
  discordId: string,
  coins: number,
  pool?: Pool
): Promise<User | null> {
  const db = getPool(pool);
  
  const result = await db.query<User>(
    `
      UPDATE "User"
      SET "coins" = $1, "updatedAt" = NOW()
      WHERE "discordId" = $2
      RETURNING *
    `,
    [coins, discordId]
  );
  
  return result.rows[0] || null;
}

/**
 * Increment user coins atomically
 * 
 * Raw SQL equivalent of:
 *   prisma.user.update({ where: { discordId }, data: { coins: { increment: amount } } })
 * 
 * @param discordId - Discord user ID
 * @param amount - Amount to add (can be negative for decrement)
 * @param pool - Optional pool override
 * @returns Updated user or null if not found
 */
export async function incrementUserCoins(
  discordId: string,
  amount: number,
  pool?: Pool
): Promise<User | null> {
  const db = getPool(pool);
  
  const result = await db.query<User>(
    `
      UPDATE "User"
      SET "coins" = "coins" + $1, "updatedAt" = NOW()
      WHERE "discordId" = $2
      RETURNING *
    `,
    [amount, discordId]
  );
  
  return result.rows[0] || null;
}

/**
 * Upsert user (create if not exists, update if exists)
 * 
 * Raw SQL equivalent of:
 *   prisma.user.upsert({
 *     where: { discordId },
 *     update: {},
 *     create: { discordId, coins: 0 }
 *   })
 * 
 * Common pattern: Ensure user exists before operations
 * 
 * @param discordId - Discord user ID
 * @param coins - Initial coin balance for new users (default: 0)
 * @param pool - Optional pool override
 * @returns User record (existing or newly created)
 */
export async function upsertUser(
  discordId: string,
  coins: number = 0,
  pool?: Pool
): Promise<User> {
  const db = getPool(pool);
  
  const result = await db.query<User>(
    `
      INSERT INTO "User" ("id", "discordId", "coins", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
      ON CONFLICT ("discordId")
      DO UPDATE SET "updatedAt" = NOW()
      RETURNING *
    `,
    [discordId, coins]
  );
  
  if (result.rows.length === 0) {
    throw new Error("Upsert failed to return user");
  }
  
  return result.rows[0];
}

/**
 * Upsert user and increment coins if exists
 * 
 * Raw SQL equivalent of:
 *   prisma.user.upsert({
 *     where: { discordId },
 *     update: { coins: { increment: amount } },
 *     create: { discordId, coins: initialCoins }
 *   })
 * 
 * Use case: Daily rewards, quest completions
 * 
 * @param discordId - Discord user ID
 * @param amount - Amount to add to existing users
 * @param initialCoins - Initial coins for new users (default: 0)
 * @param pool - Optional pool override
 * @returns User record with updated/initial coins
 */
export async function upsertUserWithCoinIncrement(
  discordId: string,
  amount: number,
  initialCoins: number = 0,
  pool?: Pool
): Promise<User> {
  const db = getPool(pool);
  
  const result = await db.query<User>(
    `
      INSERT INTO "User" ("id", "discordId", "coins", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
      ON CONFLICT ("discordId")
      DO UPDATE SET 
        "coins" = "User"."coins" + $3,
        "updatedAt" = NOW()
      RETURNING *
    `,
    [discordId, initialCoins, amount]
  );
  
  if (result.rows.length === 0) {
    throw new Error("Upsert with increment failed to return user");
  }
  
  return result.rows[0];
}

/**
 * Delete user by Discord ID
 * 
 * Raw SQL equivalent of:
 *   prisma.user.delete({ where: { discordId } })
 * 
 * WARNING: This will cascade delete related records if foreign keys are configured
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pool override
 * @returns Deleted user or null if not found
 */
export async function deleteUser(
  discordId: string,
  pool?: Pool
): Promise<User | null> {
  const db = getPool(pool);
  
  const result = await db.query<User>(
    `
      DELETE FROM "User"
      WHERE "discordId" = $1
      RETURNING *
    `,
    [discordId]
  );
  
  return result.rows[0] || null;
}

/**
 * Ensure user exists (lightweight upsert that only returns id and coins)
 * 
 * Optimized version of upsertUser for operations that only need user ID
 * Used by: Battle challenge, cooldown operations, encounter spawning
 * 
 * @param discordId - Discord user ID
 * @param initialCoins - Initial coins for new users (default: 0)
 * @param pool - Optional pool override
 * @returns User ID and coins
 */
export async function ensureUser(
  discordId: string,
  initialCoins: number = 0,
  pool?: Pool
): Promise<Pick<User, "id" | "coins">> {
  const db = getPool(pool);
  
  const result = await db.query<Pick<User, "id" | "coins">>(
    `
      INSERT INTO "User" ("id", "discordId", "coins", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), $1, $2, NOW(), NOW())
      ON CONFLICT ("discordId")
      DO UPDATE SET "updatedAt" = NOW()
      RETURNING "id", "coins"
    `,
    [discordId, initialCoins]
  );
  
  if (result.rows.length === 0) {
    throw new Error("ensureUser failed to return user");
  }
  
  return result.rows[0];
}
