/**
 * PostgreSQL Encounter Query Patterns (Raw SQL Implementation)
 *
 * Purpose: Direct pg replacement for Encounter Prisma patterns
 * Migration: Phase 7 - Core gameplay encounter system
 *
 * Architecture:
 * - Uses pg connection pools from src/shared/pg-connection.ts
 * - Leverages query builders from src/shared/pg-query.ts
 * - Maintains type safety via src/types/db-models.ts
 *
 * Operations:
 * - Spawn: Create new encounter in "Spawned" state
 * - Find: Retrieve encounter by ID or owner
 * - Update: State transitions (Spawned → Caught/Fled/Expired)
 * - Thread linking: Associate Discord thread with encounter
 *
 * Performance: Raw SQL eliminates ORM overhead (5-10ms improvement per query)
 */
import { getProdDb } from "../pg-connection.js";
import { buildSelect } from "../pg-query.js";
/**
 * Get database pool (defaults to PROD for gameplay)
 * @param pool - Optional pool override for testing
 */
function getPool(pool) {
    if (pool)
        return pool;
    const prodPool = getProdDb();
    if (!prodPool) {
        throw new Error("PROD database pool not initialized. Call initializeConnection() first.");
    }
    return prodPool;
}
/**
 * Revive Date fields from database query result
 * PostgreSQL returns Date objects, but type safety requires explicit conversion
 */
function reviveEncounter(enc) {
    return {
        ...enc,
        startedAt: enc.startedAt instanceof Date ? enc.startedAt : new Date(enc.startedAt),
        expiresAt: enc.expiresAt ? (enc.expiresAt instanceof Date ? enc.expiresAt : new Date(enc.expiresAt)) : null,
    };
}
// ============================================================================
// Read Operations
// ============================================================================
/**
 * Find encounter by ID
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.findUnique({ where: { id: encounterId } })
 *
 * @param encounterId - Encounter ID
 * @param pool - Optional pool override
 * @returns Encounter or null if not found
 */
export async function findEncounterById(encounterId, pool) {
    const db = getPool(pool);
    const { text, values } = buildSelect("Encounter", ["*"], { id: encounterId });
    const result = await db.query(text, values);
    return result.rows[0] ? reviveEncounter(result.rows[0]) : null;
}
/**
 * Find active encounter for user (state = Spawned, not expired)
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.findFirst({
 *     where: {
 *       ownerId: userId,
 *       state: 'Spawned',
 *       expiresAt: { gt: new Date() }
 *     }
 *   })
 *
 * Use case: Check if user can start new walk (/walk cooldown)
 *
 * @param userId - User database ID
 * @param pool - Optional pool override
 * @returns Active encounter or null
 */
export async function findActiveEncounterForUser(userId, pool) {
    const db = getPool(pool);
    const result = await db.query(`
      SELECT * FROM "Encounter"
      WHERE "ownerId" = $1
        AND "state" = 'Spawned'
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
      ORDER BY "startedAt" DESC
      LIMIT 1
    `, [userId]);
    return result.rows[0] ? reviveEncounter(result.rows[0]) : null;
}
/**
 * Find all encounters for user with optional state filter
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.findMany({
 *     where: { ownerId: userId, state? },
 *     orderBy: { startedAt: 'desc' }
 *   })
 *
 * @param userId - User database ID
 * @param state - Optional state filter
 * @param limit - Maximum number of results (default: 10)
 * @param pool - Optional pool override
 * @returns Array of encounters
 */
export async function findEncountersForUser(userId, state, limit = 10, pool) {
    const db = getPool(pool);
    const whereConditions = ['"ownerId" = $1'];
    const values = [userId];
    if (state) {
        whereConditions.push('"state" = $2');
        values.push(state);
    }
    const result = await db.query(`
      SELECT * FROM "Encounter"
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY "startedAt" DESC
      LIMIT $${values.length + 1}
    `, [...values, limit]);
    return result.rows.map(reviveEncounter);
}
/**
 * Count encounters for user by state
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.count({ where: { ownerId: userId, state } })
 *
 * @param userId - User database ID
 * @param state - Encounter state filter
 * @param pool - Optional pool override
 * @returns Count of matching encounters
 */
export async function countEncountersByState(userId, state, pool) {
    const db = getPool(pool);
    const result = await db.query(`
      SELECT COUNT(*) as count FROM "Encounter"
      WHERE "ownerId" = $1 AND "state" = $2
    `, [userId, state]);
    return parseInt(result.rows[0]?.count || "0", 10);
}
/**
 * Count encounters globally by state (admin stats).
 *
 * @param state - Encounter state to count
 * @param pool - Optional pool override
 * @returns Total encounter count for state
 */
export async function countAllEncountersByState(state, pool) {
    const db = getPool(pool);
    const result = await db.query(`SELECT COUNT(*) as count FROM "Encounter" WHERE "state" = $1`, [state]);
    return parseInt(result.rows[0]?.count || "0", 10);
}
// ============================================================================
// Write Operations
// ============================================================================
/**
 * Create a new encounter (spawn)
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.create({
 *     data: {
 *       ownerId, speciesId, level, state: 'Spawned',
 *       dataJson, expiresAt
 *     }
 *   })
 *
 * @param params - Encounter creation parameters
 * @param pool - Optional pool override
 * @returns Created encounter
 */
export async function createEncounter(params, pool) {
    const db = getPool(pool);
    const state = params.state || "Spawned";
    const dataJson = params.dataJson || {};
    const result = await db.query(`
      INSERT INTO "Encounter" (
        "id", "ownerId", "speciesId", "level", "state",
        "dataJson", "expiresAt", "threadChannelId", "startedAt"
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, NOW()
      )
      RETURNING *
    `, [
        params.ownerId,
        params.speciesId,
        params.level,
        state,
        JSON.stringify(dataJson),
        params.expiresAt || null,
        params.threadChannelId || null,
    ]);
    if (result.rows.length === 0) {
        throw new Error("Failed to create encounter");
    }
    return reviveEncounter(result.rows[0]);
}
/**
 * Update encounter state
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.update({
 *     where: { id: encounterId },
 *     data: { state }
 *   })
 *
 * Common transitions:
 * - Spawned → Caught (after successful catch)
 * - Spawned → Fled (user ran away)
 * - Spawned → Expired (TTL expired)
 * - Spawned → Fainted (lost battle)
 *
 * @param encounterId - Encounter ID
 * @param state - New state
 * @param pool - Optional pool override
 * @returns Updated encounter or null if not found
 */
export async function updateEncounterState(encounterId, state, pool) {
    const db = getPool(pool);
    const result = await db.query(`
      UPDATE "Encounter"
      SET "state" = $1
      WHERE "id" = $2
      RETURNING *
    `, [state, encounterId]);
    return result.rows[0] ? reviveEncounter(result.rows[0]) : null;
}
/**
 * Update encounter dataJson (for attempt tracking, catch details)
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.update({
 *     where: { id: encounterId },
 *     data: { dataJson }
 *   })
 *
 * Use case: Track catch attempts, store roll results
 *
 * @param encounterId - Encounter ID
 * @param dataJson - New data object
 * @param pool - Optional pool override
 * @returns Updated encounter or null if not found
 */
export async function updateEncounterData(encounterId, dataJson, pool) {
    const db = getPool(pool);
    const result = await db.query(`
      UPDATE "Encounter"
      SET "dataJson" = $1
      WHERE "id" = $2
      RETURNING *
    `, [JSON.stringify(dataJson), encounterId]);
    return result.rows[0] ? reviveEncounter(result.rows[0]) : null;
}
/**
 * Update encounter state and data atomically
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.update({
 *     where: { id: encounterId },
 *     data: { state, dataJson }
 *   })
 *
 * Use case: Mark as "Caught" and store catch details in one operation
 *
 * @param encounterId - Encounter ID
 * @param state - New state
 * @param dataJson - New data object
 * @param pool - Optional pool override
 * @returns Updated encounter or null if not found
 */
export async function updateEncounterStateAndData(encounterId, state, dataJson, pool) {
    const db = getPool(pool);
    const result = await db.query(`
      UPDATE "Encounter"
      SET "state" = $1, "dataJson" = $2
      WHERE "id" = $3
      RETURNING *
    `, [state, JSON.stringify(dataJson), encounterId]);
    return result.rows[0] ? reviveEncounter(result.rows[0]) : null;
}
/**
 * Link encounter to Discord thread
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.update({
 *     where: { id: encounterId },
 *     data: { threadChannelId }
 *   })
 *
 * Use case: After creating thread in #wilds, link it to encounter
 *
 * @param encounterId - Encounter ID
 * @param threadChannelId - Discord thread channel ID
 * @param pool - Optional pool override
 * @returns Updated encounter or null if not found
 */
export async function linkEncounterToThread(encounterId, threadChannelId, pool) {
    const db = getPool(pool);
    const result = await db.query(`
      UPDATE "Encounter"
      SET "threadChannelId" = $1
      WHERE "id" = $2
      RETURNING *
    `, [threadChannelId, encounterId]);
    return result.rows[0] ? reviveEncounter(result.rows[0]) : null;
}
/**
 * Mark expired encounters as "Expired"
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.updateMany({
 *     where: {
 *       state: 'Spawned',
 *       expiresAt: { lte: new Date() }
 *     },
 *     data: { state: 'Expired' }
 *   })
 *
 * Use case: Background job to clean up stale encounters
 *
 * @param pool - Optional pool override
 * @returns Count of expired encounters
 */
export async function expireStaleEncounters(pool) {
    const db = getPool(pool);
    const result = await db.query(`
      UPDATE "Encounter"
      SET "state" = 'Expired'
      WHERE "state" = 'Spawned'
        AND "expiresAt" IS NOT NULL
        AND "expiresAt" <= NOW()
    `);
    return result.rowCount || 0;
}
/**
 * Delete encounter by ID
 *
 * Raw SQL equivalent of:
 *   prisma.encounter.delete({ where: { id: encounterId } })
 *
 * WARNING: Cascading deletes may affect related records
 *
 * @param encounterId - Encounter ID
 * @param pool - Optional pool override
 * @returns Deleted encounter or null if not found
 */
export async function deleteEncounter(encounterId, pool) {
    const db = getPool(pool);
    const result = await db.query(`
      DELETE FROM "Encounter"
      WHERE "id" = $1
      RETURNING *
    `, [encounterId]);
    return result.rows[0] ? reviveEncounter(result.rows[0]) : null;
}
