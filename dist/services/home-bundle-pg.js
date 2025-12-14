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
import { getProdDb } from "../shared/pg-connection.js";
// ============================================================================
// Helper Functions
// ============================================================================
/**
 * Revival helper: Convert Date-like strings to Date objects
 */
function reviveDates(row) {
    if (!row)
        return row;
    const copy = { ...row };
    if (copy.readyAt && typeof copy.readyAt === "string")
        copy.readyAt = new Date(copy.readyAt);
    if (copy.createdAt && typeof copy.createdAt === "string")
        copy.createdAt = new Date(copy.createdAt);
    if (copy.updatedAt && typeof copy.updatedAt === "string")
        copy.updatedAt = new Date(copy.updatedAt);
    return copy;
}
// ============================================================================
// Cooldown Queries
// ============================================================================
/**
 * Find specific cooldown by user and kind
 * @param userId - User UUID
 * @param kind - Cooldown kind (e.g., "daily-quest", "walk")
 * @returns Cooldown or null if not found
 */
export async function findCooldownByUserAndKind(userId, kind, client) {
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
export async function createCooldown(userId, kind, readyAt, metaJson = null, client) {
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
export async function updateCooldownReadyAt(cooldownId, readyAt, client) {
    const pool = client ?? getProdDb();
    const sql = `
    UPDATE "Cooldown"
    SET "readyAt" = $2, "updatedAt" = NOW()
    WHERE id = $1
    RETURNING *
  `;
    const result = await pool.query(sql, [cooldownId, readyAt]);
    if (result.rows.length === 0)
        throw new Error(`Cooldown not found: ${cooldownId}`);
    return reviveDates(result.rows[0]);
}
