/**
 * SQL utility functions for working with sql.js Database instances
 *
 * Phase 17: SQL COUNT extraction utility
 * Created: 2025-11-16
 */
/**
 * Execute SELECT COUNT(*) FROM table and extract the count value
 *
 * Handles sql.js QueryExecResult structure:
 * - result[0]?.values[0]?.[0] contains the count value
 * - Returns 0 if query returns no rows or structure is invalid
 *
 * @param db - sql.js Database instance
 * @param tableName - Table name to count rows from
 * @returns Row count as number (0 if error or no rows)
 *
 * @example
 * ```typescript
 * const battleCount = getTableCount(db, 'battle_logs');
 * const moveCount = getTableCount(db, 'move_usage');
 * ```
 */
export function getTableCount(db, tableName) {
    try {
        const result = db.exec(`SELECT COUNT(*) FROM ${tableName}`);
        return result[0]?.values[0]?.[0] ?? 0;
    }
    catch {
        // Table doesn't exist or query failed
        return 0;
    }
}
/**
 * Execute a custom COUNT query and extract the count value
 *
 * For queries with WHERE clauses or complex counting logic
 *
 * @param db - sql.js Database instance
 * @param query - Full SQL query (must return single COUNT value)
 * @returns Count value as number (0 if error or no rows)
 *
 * @example
 * ```typescript
 * const unuploadedBattles = getCount(db, 'SELECT COUNT(*) FROM battle_logs WHERE uploaded_at IS NULL');
 * const recentMoves = getCount(db, 'SELECT COUNT(*) FROM move_usage WHERE created_at > 1700000000');
 * ```
 */
export function getCount(db, query) {
    try {
        const result = db.exec(query);
        return result[0]?.values[0]?.[0] ?? 0;
    }
    catch {
        // Query failed or invalid
        return 0;
    }
}
/**
 * Get multiple table counts in a single call
 *
 * @param db - sql.js Database instance
 * @param tableNames - Array of table names to count
 * @returns Record mapping table names to row counts
 *
 * @example
 * ```typescript
 * const counts = getTableCounts(db, ['battle_logs', 'move_usage', 'anomalies']);
 * // { battle_logs: 150, move_usage: 3200, anomalies: 5 }
 * ```
 */
export function getTableCounts(db, tableNames) {
    const counts = {};
    for (const tableName of tableNames) {
        counts[tableName] = getTableCount(db, tableName);
    }
    return counts;
}
