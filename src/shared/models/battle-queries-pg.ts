/**
 * Battle Queries - PostgreSQL Implementation
 * 
 * Purpose: Raw pg queries for Battle model operations
 * Migration: Replaces Prisma patterns from:
 *   - src/bot/battle/challenge.ts
 *   - src/bot/battle/conclude.ts
 *   - src/bot/middleware/limits.ts
 *   - src/services/cache/recipes.ts
 *   - src/models/index.ts (BattleRepo)
 * 
 * Patterns Covered:
 *   - Battle creation (challenge)
 *   - State transitions (Pending → Active → Finished/Aborted)
 *   - Player inclusion (JOIN with User)
 *   - Limit checks (active/pending battles)
 *   - Result recording with coin rewards
 *   - Thread linking
 * 
 * Migration Phase: 8 (Battle queries)
 */

import type { Pool } from "pg";
import { getProdDb } from "../pg-connection.js";
import { buildInsert, buildUpdate, buildCount } from "../pg-query.js";
import type { Battle } from "../../types/db-models.js";

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Battle with player User records joined
 * Equivalent to: prisma.battle.findUnique({ include: { p1: true, p2: true } })
 */
export interface BattleWithPlayers extends Battle {
  p1: {
    id: string;
    discordId: string;
    platformId: string | null;
    coins: number;
    createdAt: Date;
    updatedAt: Date;
  };
  p2: {
    id: string;
    discordId: string;
    platformId: string | null;
    coins: number;
    createdAt: Date;
    updatedAt: Date;
  };
}

/**
 * Battle result metadata for recording outcomes
 */
export interface BattleResultJson {
  battleId: string;
  reason: string;
  turnCount: number;
  rewards: { winner: number; loser: number };
  winner: { userId: string; discordId: string };
  loser: { userId: string; discordId: string };
  recordedAt: string;
  winnerDiscordId: string;
  loserDiscordId: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert Date fields from database string results
 * Required for: startedAt, endedAt, updatedAt
 */
function reviveBattle(row: any): Battle {
  return {
    ...row,
    startedAt: row.startedAt ? new Date(row.startedAt) : new Date(),
    endedAt: row.endedAt ? new Date(row.endedAt) : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
  };
}

/**
 * Get pool with fallback to PROD
 */
function getPool(pool?: Pool): Pool {
  if (pool) return pool;
  const prodPool = getProdDb();
  if (!prodPool) throw new Error("No PROD database pool available");
  return prodPool;
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Find active or pending battle for a user (by discordId)
 * Equivalent to: prisma.battle.findFirst({ where: { OR: [{ p1: { discordId } }, { p2: { discordId } }], state: { in: ["Pending", "Active"] } } })
 * 
 * Used by: canChallengeBattle (limit checks)
 * 
 * @param discordId - Discord user ID
 * @param pool - Optional pg pool override
 * @returns Battle or null if no active/pending battles
 */
export async function findActiveOrPendingBattleForUser(
  discordId: string,
  pool?: Pool
): Promise<Battle | null> {
  const db = getPool(pool);
  
  const query = `
    SELECT b.*
    FROM "Battle" b
    INNER JOIN "User" p1 ON b."p1Id" = p1."id"
    INNER JOIN "User" p2 ON b."p2Id" = p2."id"
    WHERE (p1."discordId" = $1 OR p2."discordId" = $1)
      AND b."state" IN ('Pending', 'Active')
    LIMIT 1
  `;
  
  const result = await db.query(query, [discordId]);
  if (result.rows.length === 0) return null;
  
  return reviveBattle(result.rows[0]);
}

/**
 * Count battles by state
 * Equivalent to: prisma.battle.count({ where: { state } })
 * 
 * @param state - Battle state (Pending, Active, Finished, Aborted)
 * @param pool - Optional pg pool override
 * @returns Count of battles in state
 */
export async function countBattlesByState(
  state: string,
  pool?: Pool
): Promise<number> {
  const db = getPool(pool);
  
  const { text, values } = buildCount("Battle", { state });
  const result = await db.query(text, values);
  
  return parseInt(result.rows[0].count, 10);
}

// ============================================================================
// Write Operations
// ============================================================================

/**
 * Create a new battle (challenge)
 * Equivalent to: prisma.battle.create({ data: { ... } })
 * 
 * Used by: handleBattleChallengeCommand (challenge.ts)
 * 
 * @param data - Battle creation data
 * @param pool - Optional pg pool override
 * @returns Created Battle record
 */
export async function createBattle(
  data: {
    p1Id: string;
    p2Id: string;
    state: string;
    rngSeed: string;
    ruleset: string;
    logCompact?: any;
    arenaThreadId?: string | null;
  },
  pool?: Pool
): Promise<Battle> {
  const db = getPool(pool);
  
  const { text, values } = buildInsert("Battle", {
    id: "gen_random_uuid()",
    p1Id: data.p1Id,
    p2Id: data.p2Id,
    state: data.state,
    rngSeed: data.rngSeed,
    ruleset: data.ruleset,
    logCompact: data.logCompact ?? null,
    arenaThreadId: data.arenaThreadId ?? null,
    startedAt: "NOW()",
    updatedAt: "NOW()",
  });
  
  const result = await db.query(`${text} RETURNING *`, values);
  return reviveBattle(result.rows[0]);
}

/**
 * Update battle state and endedAt timestamp
 * Equivalent to: prisma.battle.update({ where: { id }, data: { state, endedAt } })
 * 
 * Used by: Challenge decline (Aborted), battle conclusion (Finished)
 * 
 * @param battleId - Battle UUID
 * @param state - New state (Finished, Aborted)
 * @param endedAt - Conclusion timestamp
 * @param pool - Optional pg pool override
 * @returns Updated Battle or null if not found
 */
export async function updateBattleStateAndEnd(
  battleId: string,
  state: string,
  endedAt: Date,
  pool?: Pool
): Promise<Battle | null> {
  const db = getPool(pool);
  
  const { text, values } = buildUpdate(
    "Battle",
    { state, endedAt, updatedAt: "NOW()" },
    { id: battleId }
  );
  
  const result = await db.query(`${text} RETURNING *`, values);
  if (result.rows.length === 0) return null;
  
  return reviveBattle(result.rows[0]);
}

/**
 * Update battle state, thread, and set Active
 * Equivalent to: prisma.battle.update({ where: { id }, data: { state: "Active", arenaThreadId } })
 * 
 * Used by: Challenge accept (atomic state + thread update)
 * 
 * @param battleId - Battle UUID
 * @param arenaThreadId - Discord thread channel ID
 * @param pool - Optional pg pool override
 * @returns Updated Battle or null if not found
 */
export async function activateBattle(
  battleId: string,
  arenaThreadId: string,
  pool?: Pool
): Promise<Battle | null> {
  const db = getPool(pool);
  
  const { text, values } = buildUpdate(
    "Battle",
    { state: "Active", arenaThreadId, updatedAt: "NOW()" },
    { id: battleId }
  );
  
  const result = await db.query(`${text} RETURNING *`, values);
  if (result.rows.length === 0) return null;
  
  return reviveBattle(result.rows[0]);
}

/**
 * Record battle conclusion with result, logs, and rewards
 * Equivalent to: prisma.$transaction([
 *   prisma.battle.update({ ... }),
 *   prisma.user.update({ ... increment winner coins }),
 *   prisma.user.update({ ... increment loser coins })
 * ])
 * 
 * Used by: BattleRepo.concludeBattle (conclude.ts)
 * 
 * @param battleId - Battle UUID
 * @param winnerId - Winner User.id
 * @param loserId - Loser User.id
 * @param resultJson - Battle result metadata
 * @param logFull - Full battle log (string array)
 * @param logCompact - Compact battle log (metadata)
 * @param winnerReward - Coins for winner
 * @param loserReward - Coins for loser
 * @param pool - Optional pg pool override
 * @returns Updated Battle record
 */
export async function concludeBattle(
  battleId: string,
  winnerId: string,
  loserId: string,
  resultJson: BattleResultJson,
  logFull: string[] | null,
  logCompact: any,
  winnerReward: number,
  loserReward: number,
  pool?: Pool
): Promise<Battle> {
  const db = getPool(pool);
  
  // Use transaction for atomic updates
  const client = await db.connect();
  
  try {
    await client.query("BEGIN");
    
    // Update battle state and logs
    const battleUpdate = `
      UPDATE "Battle"
      SET "state" = 'Finished',
          "endedAt" = NOW(),
          "resultJson" = $2,
          "logFull" = $3,
          "logCompact" = $4,
          "updatedAt" = NOW()
      WHERE "id" = $1
      RETURNING *
    `;
    const battleResult = await client.query(battleUpdate, [
      battleId,
      JSON.stringify(resultJson),
      logFull ? JSON.stringify(logFull) : null,
      JSON.stringify(logCompact),
    ]);
    
    // Increment winner coins
    await client.query(
      `UPDATE "User" SET "coins" = "coins" + $2, "updatedAt" = NOW() WHERE "id" = $1`,
      [winnerId, winnerReward]
    );
    
    // Increment loser coins
    await client.query(
      `UPDATE "User" SET "coins" = "coins" + $2, "updatedAt" = NOW() WHERE "id" = $1`,
      [loserId, loserReward]
    );
    
    await client.query("COMMIT");
    
    return reviveBattle(battleResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// Battle History Queries (for admin/stats commands)
// ============================================================================

/**
 * Count finished battles with optional filters.
 * 
 * Equivalent to: prisma.battle.count({ where: finishedWhere })
 * 
 * Filters:
 * - after: Only count battles that ended after this date
 * - participant: Only count battles where this Discord ID participated (p1 or p2)
 * 
 * @param filters - Optional query filters
 * @param pool - Optional pool override
 * @returns Count of matching battles
 */
export async function countFinishedBattles(
  filters?: { after?: Date; participant?: string },
  pool?: Pool
): Promise<number> {
  const db = getPool(pool);
  
  let sql = `SELECT COUNT(*) AS count FROM "Battle" WHERE state = 'Finished'`;
  const values: unknown[] = [];
  let paramIndex = 1;
  
  if (filters?.after) {
    sql += ` AND "endedAt" > $${paramIndex}`;
    values.push(filters.after);
    paramIndex++;
  }
  
  if (filters?.participant) {
    sql += ` AND (
      "p1Id" IN (SELECT id FROM "User" WHERE "discordId" = $${paramIndex})
      OR "p2Id" IN (SELECT id FROM "User" WHERE "discordId" = $${paramIndex})
    )`;
    values.push(filters.participant);
    paramIndex++;
  }
  
  const result = await db.query<{ count: string }>(sql, values);
  return parseInt(result.rows[0]?.count || "0", 10);
}

/**
 * Battle history row for admin stats display.
 */
export type BattleHistoryRow = {
  id: string;
  endedAt: Date | null;
  resultJson: unknown;
  p1DiscordId: string | null;
  p2DiscordId: string | null;
};

/**
 * Find recent finished battles with optional filters.
 * 
 * Equivalent to: prisma.battle.findMany({ where: finishedWhere, orderBy: { endedAt: "desc" }, take: limit })
 * 
 * Filters:
 * - after: Only battles that ended after this date
 * - participant: Only battles where this Discord ID participated (p1 or p2)
 * - limit: Maximum number of battles to return (default 5, max 20)
 * 
 * @param filters - Query filters
 * @param pool - Optional pool override
 * @returns Array of battle history rows
 */
export async function findRecentFinishedBattles(
  filters?: { after?: Date; participant?: string; limit?: number },
  pool?: Pool
): Promise<BattleHistoryRow[]> {
  const db = getPool(pool);
  
  const limit = Math.max(1, Math.min(filters?.limit || 5, 20));
  
  let sql = `
    SELECT 
      b.id,
      b."endedAt",
      b."resultJson",
      p1."discordId" AS "p1DiscordId",
      p2."discordId" AS "p2DiscordId"
    FROM "Battle" b
    LEFT JOIN "User" p1 ON b."p1Id" = p1.id
    LEFT JOIN "User" p2 ON b."p2Id" = p2.id
    WHERE b.state = 'Finished'
  `;
  
  const values: unknown[] = [];
  let paramIndex = 1;
  
  if (filters?.after) {
    sql += ` AND b."endedAt" > $${paramIndex}`;
    values.push(filters.after);
    paramIndex++;
  }
  
  if (filters?.participant) {
    sql += ` AND (
      p1."discordId" = $${paramIndex}
      OR p2."discordId" = $${paramIndex}
    )`;
    values.push(filters.participant);
    paramIndex++;
  }
  
  sql += ` ORDER BY b."endedAt" DESC LIMIT $${paramIndex}`;
  values.push(limit);
  
  const result = await db.query<BattleHistoryRow>(sql, values);
  return result.rows;
}

/**
 * Find last processed bus message timestamp.
 * 
 * Equivalent to: prisma.busMessage.findFirst({ where: { status: { in: ["done", "error"] }, processedAt: { not: null } }, orderBy: { processedAt: "desc" } })
 * 
 * @param pool - Optional pool override
 * @returns Last processed timestamp or null
 */
export async function findLastProcessedBusMessage(pool?: Pool): Promise<Date | null> {
  const db = getPool(pool);
  
  const sql = `
    SELECT "processedAt"
    FROM "BusMessage"
    WHERE status IN ('done', 'error') AND "processedAt" IS NOT NULL
    ORDER BY "processedAt" DESC
    LIMIT 1
  `;
  
  const result = await db.query<{ processedAt: Date }>(sql);
  return result.rows[0]?.processedAt ?? null;
}
