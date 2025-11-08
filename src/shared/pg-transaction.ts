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
      console.error('[pg-transaction] Rollback failed:', rollbackError);
    }

    throw error;
  } finally {
    // Always release connection
    client.release();
  }
}

// ============================================================================
// Savepoint Support (Nested Transactions)
// ============================================================================

/**
 * Execute a subtransaction using a savepoint.
 * 
 * Allows nested transactions within a parent transaction.
 * If the subtransaction fails, only the savepoint is rolled back.
 * 
 * @example
 * await transaction(pool, async (client) => {
 *   await client.query('INSERT INTO "User" ...');
 *   
 *   // Try optional operation
 *   try {
 *     await savepoint(client, 'optional_op', async (client) => {
 *       await client.query('INSERT INTO "Cooldown" ...');
 *     });
 *   } catch (error) {
 *     console.log('Optional operation failed, continuing');
 *   }
 *   
 *   // Main transaction continues
 *   await client.query('INSERT INTO "Party" ...');
 * });
 * 
 * @param client - Active transaction client
 * @param name - Savepoint name
 * @param callback - Async function to execute in savepoint
 * @returns Result from callback
 * @throws Error if savepoint operation fails
 */
export async function savepoint<T>(
  client: pg.PoolClient,
  name: string,
  callback: TransactionCallback<T>
): Promise<T> {
  try {
    // Create savepoint
    await client.query(`SAVEPOINT ${name}`);

    // Execute callback
    const result = await callback(client);

    // Release savepoint (commits subtransaction)
    await client.query(`RELEASE SAVEPOINT ${name}`);

    return result;
  } catch (error) {
    // Rollback to savepoint
    try {
      await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    } catch (rollbackError) {
      console.error(`[pg-transaction] Savepoint ${name} rollback failed:`, rollbackError);
    }

    throw error;
  }
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Execute multiple queries in a single transaction.
 * 
 * Useful for bulk inserts/updates that must all succeed or all fail.
 * 
 * @example
 * await batchTransaction(pool, [
 *   { text: 'INSERT INTO "User" ...', values: [...] },
 *   { text: 'INSERT INTO "Party" ...', values: [...] },
 *   { text: 'INSERT INTO "PartySlot" ...', values: [...] },
 * ]);
 * 
 * @param pool - PostgreSQL connection pool
 * @param queries - Array of query objects with text and values
 * @param options - Transaction options
 * @returns Array of query results
 */
export async function batchTransaction(
  pool: pg.Pool,
  queries: Array<{ text: string; values?: any[] }>,
  options?: TransactionOptions
): Promise<pg.QueryResult[]> {
  return transaction(pool, async (client) => {
    const results: pg.QueryResult[] = [];

    for (const query of queries) {
      const result = await client.query(query.text, query.values || []);
      results.push(result);
    }

    return results;
  }, options);
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Execute a transaction with automatic retry on serialization errors.
 * 
 * PostgreSQL can fail transactions due to concurrent access conflicts.
 * This function automatically retries the transaction with exponential backoff.
 * 
 * @example
 * await retryTransaction(pool, async (client) => {
 *   // High-contention update
 *   await client.query('UPDATE "User" SET "coins" = "coins" + $1 WHERE "id" = $2', [10, userId]);
 * }, { maxRetries: 3 });
 * 
 * @param pool - PostgreSQL connection pool
 * @param callback - Async function to execute in transaction
 * @param options - Retry options
 * @returns Result from callback
 */
export async function retryTransaction<T>(
  pool: pg.Pool,
  callback: TransactionCallback<T>,
  options?: TransactionOptions & {
    maxRetries?: number;
    initialDelay?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries || 3;
  const initialDelay = options?.initialDelay || 100; // ms

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await transaction(pool, callback, options);
    } catch (error) {
      lastError = error as Error;

      // Check if error is serialization failure (code 40001)
      const pgError = error as any;
      if (pgError.code !== '40001' && pgError.code !== '40P01') {
        // Not a serialization error, don't retry
        throw error;
      }

      // Exponential backoff
      const delay = initialDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));

      console.warn(
        `[pg-transaction] Serialization error, retrying (${attempt + 1}/${maxRetries})...`
      );
    }
  }

  throw new Error(
    `Transaction failed after ${maxRetries} retries: ${lastError?.message}`
  );
}

// ============================================================================
// Read-Only Transaction
// ============================================================================

/**
 * Execute a read-only transaction.
 * 
 * Prevents accidental writes and allows PostgreSQL to optimize.
 * Useful for complex multi-query reads that need consistency.
 * 
 * @example
 * const data = await readOnlyTransaction(pool, async (client) => {
 *   const user = await client.query('SELECT * FROM "User" WHERE "id" = $1', [userId]);
 *   const party = await client.query('SELECT * FROM "Party" WHERE "ownerId" = $1', [userId]);
 *   return { user: user.rows[0], party: party.rows[0] };
 * });
 * 
 * @param pool - PostgreSQL connection pool
 * @param callback - Async function to execute in read-only transaction
 * @returns Result from callback
 */
export async function readOnlyTransaction<T>(
  pool: pg.Pool,
  callback: TransactionCallback<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN TRANSACTION READ ONLY');

    const result = await callback(client);

    await client.query('COMMIT');

    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[pg-transaction] Read-only rollback failed:', rollbackError);
    }

    throw error;
  } finally {
    client.release();
  }
}
