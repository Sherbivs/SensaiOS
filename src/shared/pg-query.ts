/**
 * PostgreSQL Query Builder Utilities
 * 
 * Provides type-safe parameterized query builders for common SQL operations.
 * All queries use parameterized placeholders ($1, $2, ...) to prevent SQL injection.
 * 
 * Core Functions:
 * - buildSelect: SELECT queries with WHERE clauses
 * - buildInsert: INSERT with RETURNING
 * - buildUpdate: UPDATE with WHERE and RETURNING
 * - buildDelete: DELETE with WHERE and RETURNING
 * - buildWhereClause: Convert object to WHERE conditions
 * - buildInClause: Build IN (...) clauses
 * 
 * Transaction support in separate file: pg-transaction.ts
 */

// ============================================================================
// Types
// ============================================================================

export interface QueryOptions {
  text: string;
  values: any[];
}

export interface WhereCondition {
  field: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'ILIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';
  value?: any;
}

// ============================================================================
// WHERE Clause Builders
// ============================================================================

/**
 * Build a WHERE clause from an object of conditions.
 * 
 * @example
 * buildWhereClause({ discordId: '123', coins: 100 })
 * // Returns: { text: '"discordId" = $1 AND "coins" = $2', values: ['123', 100] }
 * 
 * @param conditions - Object mapping field names to values
 * @param startIndex - Starting parameter index (default 1)
 * @returns QueryOptions with WHERE clause text and values
 */
export function buildWhereClause(
  conditions: Record<string, any>,
  startIndex: number = 1
): QueryOptions {
  const clauses: string[] = [];
  const values: any[] = [];
  let paramIndex = startIndex;

  for (const [field, value] of Object.entries(conditions)) {
    if (value === null) {
      clauses.push(`"${field}" IS NULL`);
    } else if (value === undefined) {
      // Skip undefined values
      continue;
    } else if (Array.isArray(value)) {
      // IN clause
      const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
      clauses.push(`"${field}" IN (${placeholders})`);
      values.push(...value);
    } else {
      clauses.push(`"${field}" = $${paramIndex++}`);
      values.push(value);
    }
  }

  const text = clauses.length > 0 ? clauses.join(' AND ') : '1=1';
  return { text, values };
}

/**
 * Build an advanced WHERE clause from conditions array.
 * 
 * @example
 * buildAdvancedWhere([
 *   { field: 'age', operator: '>', value: 18 },
 *   { field: 'status', operator: 'IN', value: ['active', 'pending'] }
 * ])
 * 
 * @param conditions - Array of condition objects
 * @param startIndex - Starting parameter index (default 1)
 * @returns QueryOptions with WHERE clause text and values
 */
export function buildAdvancedWhere(
  conditions: WhereCondition[],
  startIndex: number = 1
): QueryOptions {
  const clauses: string[] = [];
  const values: any[] = [];
  let paramIndex = startIndex;

  for (const condition of conditions) {
    const { field, operator, value } = condition;

    if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
      clauses.push(`"${field}" ${operator}`);
    } else if (operator === 'IN' && Array.isArray(value)) {
      const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
      clauses.push(`"${field}" IN (${placeholders})`);
      values.push(...value);
    } else {
      clauses.push(`"${field}" ${operator} $${paramIndex++}`);
      values.push(value);
    }
  }

  const text = clauses.length > 0 ? clauses.join(' AND ') : '1=1';
  return { text, values };
}

/**
 * Build an IN clause for a single field.
 * 
 * @example
 * buildInClause('status', ['active', 'pending'])
 * // Returns: { text: '"status" IN ($1, $2)', values: ['active', 'pending'] }
 */
export function buildInClause(
  field: string,
  values: any[],
  startIndex: number = 1
): QueryOptions {
  if (values.length === 0) {
    return { text: '1=0', values: [] }; // No matches
  }

  const placeholders = values.map((_, i) => `$${startIndex + i}`).join(', ');
  return {
    text: `"${field}" IN (${placeholders})`,
    values,
  };
}

// ============================================================================
// SELECT Builder
// ============================================================================

/**
 * Build a SELECT query.
 * 
 * @example
 * buildSelect('User', ['id', 'discordId', 'coins'], { discordId: '123' })
 * // Returns: {
 * //   text: 'SELECT "id", "discordId", "coins" FROM "User" WHERE "discordId" = $1',
 * //   values: ['123']
 * // }
 * 
 * @param table - Table name
 * @param columns - Array of column names (or ['*'] for all)
 * @param where - Optional WHERE conditions object
 * @param options - Additional query options (ORDER BY, LIMIT, OFFSET)
 * @returns QueryOptions with SELECT query
 */
export function buildSelect(
  table: string,
  columns: string[],
  where?: Record<string, any>,
  options?: {
    orderBy?: string | string[];
    limit?: number;
    offset?: number;
  }
): QueryOptions {
  const columnList = columns.map(col => col === '*' ? '*' : `"${col}"`).join(', ');
  let query = `SELECT ${columnList} FROM "${table}"`;
  let values: any[] = [];

  // WHERE clause
  if (where && Object.keys(where).length > 0) {
    const whereClause = buildWhereClause(where);
    query += ` WHERE ${whereClause.text}`;
    values = whereClause.values;
  }

  // ORDER BY
  if (options?.orderBy) {
    const orderClauses = Array.isArray(options.orderBy)
      ? options.orderBy.map(col => `"${col}"`).join(', ')
      : `"${options.orderBy}"`;
    query += ` ORDER BY ${orderClauses}`;
  }

  // LIMIT
  if (options?.limit !== undefined) {
    query += ` LIMIT $${values.length + 1}`;
    values.push(options.limit);
  }

  // OFFSET
  if (options?.offset !== undefined) {
    query += ` OFFSET $${values.length + 1}`;
    values.push(options.offset);
  }

  return { text: query, values };
}

// ============================================================================
// INSERT Builder
// ============================================================================

/**
 * Build an INSERT query with RETURNING.
 * 
 * @example
 * buildInsert('User', { discordId: '123', coins: 100 }, ['id', 'createdAt'])
 * // Returns: {
 * //   text: 'INSERT INTO "User" ("discordId", "coins") VALUES ($1, $2) RETURNING "id", "createdAt"',
 * //   values: ['123', 100]
 * // }
 * 
 * @param table - Table name
 * @param data - Object mapping column names to values
 * @param returning - Optional array of columns to return
 * @returns QueryOptions with INSERT query
 */
export function buildInsert(
  table: string,
  data: Record<string, any>,
  returning?: string[]
): QueryOptions {
  const fields = Object.keys(data);
  const values = Object.values(data);

  const fieldList = fields.map(f => `"${f}"`).join(', ');
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

  let query = `INSERT INTO "${table}" (${fieldList}) VALUES (${placeholders})`;

  if (returning && returning.length > 0) {
    const returnList = returning.map(col => col === '*' ? '*' : `"${col}"`).join(', ');
    query += ` RETURNING ${returnList}`;
  }

  return { text: query, values };
}

/**
 * Build an INSERT ... ON CONFLICT (upsert) query.
 * 
 * @example
 * buildUpsert(
 *   'User',
 *   { discordId: '123', coins: 100 },
 *   ['discordId'],
 *   { coins: 150 },
 *   ['id', 'coins']
 * )
 * // Returns INSERT ... ON CONFLICT ("discordId") DO UPDATE SET "coins" = $3 RETURNING ...
 * 
 * @param table - Table name
 * @param data - Initial insert data
 * @param conflictFields - Fields for ON CONFLICT clause
 * @param updateData - Data to update on conflict
 * @param returning - Optional columns to return
 * @returns QueryOptions with UPSERT query
 */
export function buildUpsert(
  table: string,
  data: Record<string, any>,
  conflictFields: string[],
  updateData: Record<string, any>,
  returning?: string[]
): QueryOptions {
  const insertFields = Object.keys(data);
  const insertValues = Object.values(data);

  const insertFieldList = insertFields.map(f => `"${f}"`).join(', ');
  const insertPlaceholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');

  const conflictList = conflictFields.map(f => `"${f}"`).join(', ');

  const updateFields = Object.keys(updateData);
  const updateValues = Object.values(updateData);
  const updateClauses = updateFields.map((f, i) => `"${f}" = $${insertValues.length + i + 1}`);

  let query = `INSERT INTO "${table}" (${insertFieldList}) VALUES (${insertPlaceholders}) `;
  query += `ON CONFLICT (${conflictList}) DO UPDATE SET ${updateClauses.join(', ')}`;

  const allValues = [...insertValues, ...updateValues];

  if (returning && returning.length > 0) {
    const returnList = returning.map(col => col === '*' ? '*' : `"${col}"`).join(', ');
    query += ` RETURNING ${returnList}`;
  }

  return { text: query, values: allValues };
}

// ============================================================================
// UPDATE Builder
// ============================================================================

/**
 * Build an UPDATE query with WHERE and RETURNING.
 * 
 * @example
 * buildUpdate('User', { coins: 150 }, { discordId: '123' }, ['coins', 'updatedAt'])
 * // Returns: {
 * //   text: 'UPDATE "User" SET "coins" = $1 WHERE "discordId" = $2 RETURNING "coins", "updatedAt"',
 * //   values: [150, '123']
 * // }
 * 
 * @param table - Table name
 * @param data - Object mapping column names to new values
 * @param where - WHERE conditions object
 * @param returning - Optional columns to return
 * @returns QueryOptions with UPDATE query
 */
export function buildUpdate(
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
  returning?: string[]
): QueryOptions {
  const updateFields = Object.keys(data);
  const updateValues = Object.values(data);

  const setClauses = updateFields.map((f, i) => `"${f}" = $${i + 1}`);
  const whereClause = buildWhereClause(where, updateValues.length + 1);

  let query = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE ${whereClause.text}`;

  const allValues = [...updateValues, ...whereClause.values];

  if (returning && returning.length > 0) {
    const returnList = returning.map(col => col === '*' ? '*' : `"${col}"`).join(', ');
    query += ` RETURNING ${returnList}`;
  }

  return { text: query, values: allValues };
}

/**
 * Build an UPDATE query with increment/decrement operations.
 * 
 * @example
 * buildIncrementUpdate('User', { coins: 10 }, { discordId: '123' }, ['coins'])
 * // Returns: UPDATE "User" SET "coins" = "coins" + $1 WHERE "discordId" = $2 RETURNING "coins"
 */
export function buildIncrementUpdate(
  table: string,
  increments: Record<string, number>,
  where: Record<string, any>,
  returning?: string[]
): QueryOptions {
  const fields = Object.keys(increments);
  const values = Object.values(increments);

  const setClauses = fields.map((f, i) => {
    const val = values[i];
    const op = val >= 0 ? '+' : '-';
    return `"${f}" = "${f}" ${op} $${i + 1}`;
  });

  const whereClause = buildWhereClause(where, values.length + 1);

  let query = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE ${whereClause.text}`;

  const allValues = [...values.map(v => Math.abs(v)), ...whereClause.values];

  if (returning && returning.length > 0) {
    const returnList = returning.map(col => col === '*' ? '*' : `"${col}"`).join(', ');
    query += ` RETURNING ${returnList}`;
  }

  return { text: query, values: allValues };
}

// ============================================================================
// DELETE Builder
// ============================================================================

/**
 * Build a DELETE query with WHERE and RETURNING.
 * 
 * @example
 * buildDelete('Cooldown', { ownerId: 'user-123', kind: 'walk' }, ['id'])
 * // Returns: {
 * //   text: 'DELETE FROM "Cooldown" WHERE "ownerId" = $1 AND "kind" = $2 RETURNING "id"',
 * //   values: ['user-123', 'walk']
 * // }
 * 
 * @param table - Table name
 * @param where - WHERE conditions object (REQUIRED for safety)
 * @param returning - Optional columns to return
 * @returns QueryOptions with DELETE query
 */
export function buildDelete(
  table: string,
  where: Record<string, any>,
  returning?: string[]
): QueryOptions {
  if (!where || Object.keys(where).length === 0) {
    throw new Error('DELETE queries must include WHERE conditions for safety');
  }

  const whereClause = buildWhereClause(where);

  let query = `DELETE FROM "${table}" WHERE ${whereClause.text}`;

  if (returning && returning.length > 0) {
    const returnList = returning.map(col => col === '*' ? '*' : `"${col}"`).join(', ');
    query += ` RETURNING ${returnList}`;
  }

  return { text: query, values: whereClause.values };
}

// ============================================================================
// COUNT Builder
// ============================================================================

/**
 * Build a COUNT query.
 * 
 * @example
 * buildCount('User', { coins: { gte: 100 } })
 * // Returns: { text: 'SELECT COUNT(*) FROM "User" WHERE "coins" >= $1', values: [100] }
 */
export function buildCount(
  table: string,
  where?: Record<string, any>
): QueryOptions {
  let query = `SELECT COUNT(*) as count FROM "${table}"`;
  let values: any[] = [];

  if (where && Object.keys(where).length > 0) {
    const whereClause = buildWhereClause(where);
    query += ` WHERE ${whereClause.text}`;
    values = whereClause.values;
  }

  return { text: query, values };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Escape identifiers (table/column names) for safe use in SQL.
 * PostgreSQL uses double quotes for identifiers.
 */
export function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Build a simple pagination query.
 */
export function buildPagination(
  page: number,
  pageSize: number
): { limit: number; offset: number } {
  return {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}
