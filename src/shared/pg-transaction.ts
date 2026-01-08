/**
 * PostgreSQL Transaction Helpers
 * 
 * Provides transaction management utilities for pg.Pool connections.
 * Ensures proper isolation, commit/rollback handling, and error recovery.
 * 
 * Key Features:
 * - Automatic connection acquisition and release
 * - Rollback on error
 * - Nested transaction support via savepoints
 * - Timeout handling
 * - Type-safe callback interface
 */

import type pg from 'pg';
import { scopedLogger } from '../observability/envelope/console.js';

const log = scopedLogger('pg-transaction');

// ============================================================================
// Types
// ============================================================================

export interface TransactionOptions {
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
  timeout?: number; // milliseconds
}

export type TransactionCallback<T> = (client: pg.PoolClient) => Promise<T>;

// ============================================================================
// Transaction Executor
// ============================================================================

/**
 * Execute a function within a database transaction.
 * 
 * Automatically handles:
 * - BEGIN transaction
 * - COMMIT on success
 * - ROLLBACK on error
 * - Connection release
 * 
 * @example
 * await transaction(pool, async (client) => {
 *   const user = await client.query('INSERT INTO "User" ...');
 *   const party = await client.query('INSERT INTO "Party" ...');
 *   return { user, party };
 * });
 * 
 * @param pool - PostgreSQL connection pool
 * @param callback - Async function to execute in transaction
 * @param options - Transaction options (isolation level, timeout)
 * @returns Result from callback
 * @throws Error if transaction fails (with rollback)
 */
export async function transaction<T>(
  pool: pg.Pool,
  callback: TransactionCallback<T>,
  options?: TransactionOptions
): Promise<T> {
  const client = await pool.connect();

  try {
    // Begin transaction with isolation level
    if (options?.isolationLevel) {
      await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
    } else {
      await client.query('BEGIN');
    }

    // Set timeout if specified
    if (options?.timeout) {
      await client.query(`SET LOCAL statement_timeout = ${options.timeout}`);
    }

    // Execute callback
    const result = await callback(client);

    // Commit transaction
    await client.query('COMMIT');

    return result;
  } catch (error) {
    // Rollback on error
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      log.error('rollback', 'Rollback failed', { error: String(rollbackError) });
    }

    throw error;
  } finally {
    // Always release connection
    client.release();
  }
}
