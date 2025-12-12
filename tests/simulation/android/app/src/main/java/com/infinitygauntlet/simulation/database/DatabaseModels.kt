package com.infinitygauntlet.simulation.database

import kotlinx.parcelize.Parcelize
import android.os.Parcelable

/**
 * Data models for database connectivity and query results
 * 
 * Architecture:
 * - DatabaseConfig: Connection configuration (URL, name, type)
 * - QueryResult: Results from SQL query execution
 * - DatabaseStatus: Connection health and metadata
 * - TableInfo: Schema information for database tables
 */

/**
 * Database connection configuration
 * 
 * @property id Unique identifier for this database
 * @property name Display name (e.g., "Production", "On-Premise Dev")
 * @property url PostgreSQL connection URL
 * @property type Database type (PROD, DEV_PRIMARY, DEV_EXPERIMENT)
 * @property description Human-readable description
 * @property isActive Whether this database is currently reachable
 */
@Parcelize
data class DatabaseConfig(
    val id: String,
    val name: String,
    val url: String,
    val type: DatabaseType,
    val description: String,
    val isActive: Boolean = false
) : Parcelable

/**
 * Database type classification
 */
enum class DatabaseType {
    PROD_RENDER,           // Render-managed production database
    DEV_PRIMARY,           // On-premise development (port 55433)
    DEV_EXPERIMENT,        // On-premise experiment (port 55434)
    UNKNOWN
}

/**
 * SQL query execution result
 * 
 * @property success Whether the query executed successfully
 * @property rowCount Number of rows returned
 * @property columnCount Number of columns in result set
 * @property columns Column names
 * @property rows Data rows (each row is a list of string values)
 * @property executionTimeMs Query execution time in milliseconds
 * @property error Error message if query failed
 */
@Parcelize
data class QueryResult(
    val success: Boolean,
    val rowCount: Int = 0,
    val columnCount: Int = 0,
    val columns: List<String> = emptyList(),
    val rows: List<List<String>> = emptyList(),
    val executionTimeMs: Long = 0,
    val error: String? = null
) : Parcelable {
    
    /**
     * Get a specific cell value by row and column index
     */
    fun getCell(row: Int, column: Int): String? {
        return rows.getOrNull(row)?.getOrNull(column)
    }
    
    /**
     * Get a row as a map of column names to values
     */
    fun getRowAsMap(row: Int): Map<String, String>? {
        val rowData = rows.getOrNull(row) ?: return null
        return columns.zip(rowData).toMap()
    }
    
    /**
     * Convert result to CSV format
     */
    fun toCsv(): String {
        val sb = StringBuilder()
        
        // Header row
        sb.append(columns.joinToString(",") { "\"$it\"" })
        sb.append("\n")
        
        // Data rows
        rows.forEach { row ->
            sb.append(row.joinToString(",") { "\"$it\"" })
            sb.append("\n")
        }
        
        return sb.toString()
    }
    
    companion object {
        /**
         * Create a failed query result with error message
         */
        fun failure(error: String): QueryResult {
            return QueryResult(
                success = false,
                error = error
            )
        }
        
        /**
         * Create an empty successful result
         */
        fun empty(): QueryResult {
            return QueryResult(
                success = true,
                rowCount = 0,
                columnCount = 0
            )
        }
    }
}

/**
 * Database connection status and metadata
 * 
 * @property databaseId Database identifier
 * @property isConnected Whether connection is active
 * @property version PostgreSQL version string
 * @property size Database size in bytes
 * @property tableCount Number of tables
 * @property lastChecked Timestamp of last health check
 * @property latencyMs Connection latency in milliseconds
 * @property error Error message if connection failed
 */
@Parcelize
data class DatabaseStatus(
    val databaseId: String,
    val isConnected: Boolean,
    val version: String? = null,
    val size: Long = 0,
    val tableCount: Int = 0,
    val lastChecked: Long = System.currentTimeMillis(),
    val latencyMs: Long = 0,
    val error: String? = null
) : Parcelable {
    
    /**
     * Format database size for display (e.g., "123.4 MB")
     */
    fun getFormattedSize(): String {
        return when {
            size < 1024 -> "$size B"
            size < 1024 * 1024 -> "%.1f KB".format(size / 1024.0)
            size < 1024 * 1024 * 1024 -> "%.1f MB".format(size / (1024.0 * 1024.0))
            else -> "%.1f GB".format(size / (1024.0 * 1024.0 * 1024.0))
        }
    }
}

/**
 * Database table schema information
 * 
 * @property tableName Name of the table
 * @property schemaName Schema name (usually "public")
 * @property rowCount Number of rows in table
 * @property columns List of column definitions
 * @property primaryKeys List of primary key column names
 * @property foreignKeys List of foreign key relationships
 */
@Parcelize
data class TableInfo(
    val tableName: String,
    val schemaName: String = "public",
    val rowCount: Long = 0,
    val columns: List<ColumnInfo> = emptyList(),
    val primaryKeys: List<String> = emptyList(),
    val foreignKeys: List<ForeignKeyInfo> = emptyList()
) : Parcelable

/**
 * Column definition
 * 
 * @property name Column name
 * @property dataType PostgreSQL data type
 * @property isNullable Whether NULL values are allowed
 * @property defaultValue Default value expression
 */
@Parcelize
data class ColumnInfo(
    val name: String,
    val dataType: String,
    val isNullable: Boolean,
    val defaultValue: String?
) : Parcelable

/**
 * Foreign key relationship
 * 
 * @property constraintName Name of the foreign key constraint
 * @property columnName Column in this table
 * @property referencedTable Referenced table name
 * @property referencedColumn Referenced column name
 */
@Parcelize
data class ForeignKeyInfo(
    val constraintName: String,
    val columnName: String,
    val referencedTable: String,
    val referencedColumn: String
) : Parcelable

/**
 * Quick query preset for common database operations
 */
data class QueryPreset(
    val id: String,
    val name: String,
    val description: String,
    val sql: String,
    val category: QueryCategory
)

/**
 * Query category for organizing presets
 */
enum class QueryCategory {
    SCHEMA,        // Schema inspection (tables, columns, indexes)
    DATA,          // Data queries (SELECT counts, samples)
    STATISTICS,    // Database statistics (size, performance)
    DIAGNOSTICS,   // Health checks and diagnostics
    CUSTOM         // User-defined queries
}
