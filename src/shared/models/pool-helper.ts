/**
 * Database Pool Helper
 * 
 * Provides centralized pool resolution logic for all database query modules.
 * Ensures consistent fallback behavior across battle, encounter, party, and user queries.
 * 
 * @module shared/models/pool-helper
 */

import { type Pool, type PoolClient } from 'pg';
import { getProdDb } from '../pg-connection.js';

/**
 * Get database pool with fallback to PROD.
 * 
 * This helper centralizes pool resolution logic used across all query modules.
 * When a pool is explicitly provided (e.g., for testing), it uses that pool.
 * Otherwise, falls back to the PROD database pool for gameplay operations.
 * 
 * @param pool - Optional pool override (typically for testing or multi-database scenarios)
 * @returns Database pool to use for queries
 * @throws Error if no PROD pool is available and no override provided
 * 
 * @example
 * ```typescript
 * // Use default PROD pool
 * const pool = getPool();
 * const result = await pool.query('SELECT * FROM "User"');
 * 
 * // Use test pool override
 * const testPool = getTestDb();
 * const pool = getPool(testPool);
 * const result = await pool.query('SELECT * FROM "User"');
 * ```
 * 
 * @remarks
 * CONSOLIDATION: Replaces duplicate getPool() functions in:
 * - battle-queries-pg.ts (line 67)
 * - encounter-queries-pg.ts (line 35)
 * - party-queries-pg.ts (line 185)
 * - user-queries-pg.ts (line 55)
 */
export function getPool(pool?: Pool | PoolClient): Pool | PoolClient {
  // Use explicitly provided pool (testing, multi-database scenarios)
  if (pool) {
    return pool;
  }

  // Fall back to PROD database (gameplay, production operations)
  const prodPool = getProdDb();
  if (!prodPool) {
    throw new Error(
      "PROD database pool not initialized. " +
      "Call initializeConnection() first or provide a pool override."
    );
  }

  return prodPool;
}
