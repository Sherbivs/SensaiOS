/**
 * URL parsing and manipulation utilities.
 * Centralizes duplicate URL handling logic across the codebase.
 *
 * @module shared/utils/url-utils
 */
/**
 * Extract database name from a PostgreSQL connection URL.
 * Handles both full URLs and connection strings.
 *
 * @param url - PostgreSQL connection URL (e.g., "postgresql://user:pass@host:port/dbname?params")
 * @returns Database name or null if unable to parse
 *
 * @example
 * ```typescript
 * extractDatabaseName('postgresql://user@localhost:5432/mydb')  // 'mydb'
 * extractDatabaseName('postgresql://user@localhost:5432/mydb?schema=public')  // 'mydb'
 * extractDatabaseName('invalid')  // null
 * extractDatabaseName('')  // null
 * ```
 */
export function extractDatabaseName(url) {
    if (!url || typeof url !== 'string') {
        return null;
    }
    try {
        // Try URL parsing first (most robust)
        const parsed = new URL(url);
        const dbName = parsed.pathname.replace(/^\//, "").split("/")[0];
        if (dbName) {
            return dbName;
        }
    }
    catch {
        // URL parsing failed, try regex fallback
        try {
            // PostgreSQL URL format: postgresql://user:pass@host:port/dbname?params
            const match = url.match(/\/([^/?]+)(\?|$)/);
            if (match && match[1]) {
                return match[1];
            }
        }
        catch {
            // Ignore regex errors
        }
    }
    return null;
}
