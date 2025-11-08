/**
 * Cooldown Query Module (PostgreSQL)
 * 
 * Provides pg.Pool-based query functions for Cooldown table operations.
 * Replaces Prisma calls with raw SQL queries.
 * 
 * Operations:
 * - Count cooldowns (global or by user)
 * - Delete cooldowns by user
 */

import type { Pool } from "pg";
import { buildCount } from "../pg-query.js";
import { getProdDb } from "../pg-connection.js";

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Count total cooldown rows in database.
 * 
 * Equivalent to: prisma.cooldown.count()
 * 
 * @param pool - Optional pool instance (defaults to PROD)
 * @returns Total cooldown count
 */
export async function countAllCooldowns(pool?: Pool): Promise<number> {
  const client = pool ?? getProdDb();
  const { text, values } = buildCount("Cooldown", {});
  const result = await client.query(text, values);
  return result.rows[0]?.count ? parseInt(result.rows[0].count, 10) : 0;
}

/**
 * Count cooldowns for a specific user.
 * 
 * Equivalent to: prisma.cooldown.count({ where: { ownerId } })
 * 
 * @param ownerId - User ID
 * @param pool - Optional pool instance (defaults to PROD)
 * @returns Cooldown count for user
 */
export async function countUserCooldowns(ownerId: string, pool?: Pool): Promise<number> {
  const client = pool ?? getProdDb();
  const { text, values } = buildCount("Cooldown", { ownerId });
  const result = await client.query(text, values);
  return result.rows[0]?.count ? parseInt(result.rows[0].count, 10) : 0;
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Delete all cooldowns for a specific user.
 * 
 * Equivalent to: prisma.cooldown.deleteMany({ where: { ownerId } })
 * 
 * @param ownerId - User ID
 * @param pool - Optional pool instance (defaults to PROD)
 * @returns Number of deleted cooldowns
 */
export async function deleteUserCooldowns(ownerId: string, pool?: Pool): Promise<number> {
  const client = pool ?? getProdDb();
  const sql = `DELETE FROM "Cooldown" WHERE "ownerId" = $1`;
  const result = await client.query(sql, [ownerId]);
  return result.rowCount ?? 0;
}
