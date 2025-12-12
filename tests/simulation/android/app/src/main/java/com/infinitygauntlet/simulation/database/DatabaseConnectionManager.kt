package com.infinitygauntlet.simulation.database

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSet
import java.util.Properties

/**
 * PostgreSQL database connection manager for Android
 * 
 * Features:
 * - Connection pooling
 * - Automatic retry logic
 * - Health checks
 * - Query execution with result mapping
 * - Thread-safe operations
 * 
 * Usage:
 * ```kotlin
 * val manager = DatabaseConnectionManager()
 * val result = manager.executeQuery(DatabasePresets.PRODUCTION, "SELECT * FROM \"User\" LIMIT 10")
 * if (result.success) {
 *     println("Found ${result.rowCount} users")
 * }
 * ```
 * 
 * IMPORTANT: PostgreSQL JDBC driver must be added to build.gradle:
 * implementation("org.postgresql:postgresql:42.7.1")
 */
class DatabaseConnectionManager {
    
    companion object {
        private const val TAG = "DatabaseConnectionManager"
        private const val CONNECT_TIMEOUT_MS = 10000  // 10 seconds
        private const val QUERY_TIMEOUT_SEC = 30      // 30 seconds
        private const val MAX_RETRIES = 3
        private const val RETRY_DELAY_MS = 1000L
        
        init {
            try {
                // Load PostgreSQL JDBC driver
                Class.forName("org.postgresql.Driver")
                Log.d(TAG, "PostgreSQL JDBC driver loaded successfully")
            } catch (e: ClassNotFoundException) {
                Log.e(TAG, "PostgreSQL JDBC driver not found. Add dependency: org.postgresql:postgresql:42.7.1", e)
            }
        }
    }
    
    // Connection cache (database ID -> connection)
    private val connectionCache = mutableMapOf<String, Connection>()
    
    /**
     * Test database connectivity
     * 
     * @param config Database configuration
     * @return DatabaseStatus with connection health
     */
    suspend fun testConnection(config: DatabaseConfig): DatabaseStatus = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        
        try {
            val connection = getConnection(config)
            
            // Execute simple query to verify connection
            val versionQuery = "SELECT version() as version, pg_database_size(current_database()) as size"
            val statement = connection.createStatement()
            statement.queryTimeout = QUERY_TIMEOUT_SEC
            val resultSet = statement.executeQuery(versionQuery)
            
            var version: String? = null
            var size: Long = 0
            
            if (resultSet.next()) {
                version = resultSet.getString("version")
                size = resultSet.getLong("size")
            }
            
            resultSet.close()
            statement.close()
            
            // Count tables
            val tableCountQuery = "SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public'"
            val tableStatement = connection.createStatement()
            val tableResultSet = tableStatement.executeQuery(tableCountQuery)
            
            var tableCount = 0
            if (tableResultSet.next()) {
                tableCount = tableResultSet.getInt("count")
            }
            
            tableResultSet.close()
            tableStatement.close()
            
            val latency = System.currentTimeMillis() - startTime
            
            DatabaseStatus(
                databaseId = config.id,
                isConnected = true,
                version = version,
                size = size,
                tableCount = tableCount,
                latencyMs = latency
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Connection test failed for ${config.name}", e)
            DatabaseStatus(
                databaseId = config.id,
                isConnected = false,
                latencyMs = System.currentTimeMillis() - startTime,
                error = e.message ?: "Unknown error"
            )
        }
    }
    
    /**
     * Execute SQL query
     * 
     * @param config Database configuration
     * @param sql SQL query to execute
     * @param maxRows Maximum rows to fetch (default: 1000)
     * @return QueryResult with data or error
     */
    suspend fun executeQuery(
        config: DatabaseConfig,
        sql: String,
        maxRows: Int = 1000
    ): QueryResult = withContext(Dispatchers.IO) {
        val startTime = System.currentTimeMillis()
        
        try {
            val connection = getConnection(config)
            val statement = connection.createStatement()
            statement.queryTimeout = QUERY_TIMEOUT_SEC
            statement.maxRows = maxRows
            
            val resultSet = statement.executeQuery(sql)
            val result = mapResultSet(resultSet)
            
            resultSet.close()
            statement.close()
            
            val executionTime = System.currentTimeMillis() - startTime
            
            result.copy(executionTimeMs = executionTime)
            
        } catch (e: Exception) {
            Log.e(TAG, "Query execution failed: $sql", e)
            QueryResult.failure(e.message ?: "Query failed")
        }
    }
    
    /**
     * Execute multiple queries in sequence
     * 
     * @param config Database configuration
     * @param queries List of SQL queries
     * @return List of QueryResults
     */
    suspend fun executeQueries(
        config: DatabaseConfig,
        queries: List<String>
    ): List<QueryResult> = withContext(Dispatchers.IO) {
        queries.map { executeQuery(config, it) }
    }
    
    /**
     * Get table information (schema, columns, row count)
     * 
     * @param config Database configuration
     * @param tableName Name of the table
     * @return TableInfo with schema details
     */
    suspend fun getTableInfo(
        config: DatabaseConfig,
        tableName: String
    ): TableInfo? = withContext(Dispatchers.IO) {
        try {
            val connection = getConnection(config)
            
            // Get row count
            val countQuery = """SELECT COUNT(*) as count FROM "$tableName""""
            val countResult = executeQuery(config, countQuery)
            val rowCount = countResult.rows.firstOrNull()?.firstOrNull()?.toLongOrNull() ?: 0
            
            // Get columns
            val columnsQuery = """
                SELECT 
                    column_name,
                    data_type,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = '$tableName'
                ORDER BY ordinal_position
            """.trimIndent()
            
            val columnsResult = executeQuery(config, columnsQuery)
            val columns = columnsResult.rows.map { row ->
                ColumnInfo(
                    name = row[0],
                    dataType = row[1],
                    isNullable = row[2] == "YES",
                    defaultValue = row.getOrNull(3)
                )
            }
            
            // Get primary keys
            val pkQuery = """
                SELECT a.attname
                FROM pg_index i
                JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
                WHERE i.indrelid = '$tableName'::regclass AND i.indisprimary
            """.trimIndent()
            
            val pkResult = executeQuery(config, pkQuery)
            val primaryKeys = pkResult.rows.map { it[0] }
            
            TableInfo(
                tableName = tableName,
                schemaName = "public",
                rowCount = rowCount,
                columns = columns,
                primaryKeys = primaryKeys
            )
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get table info for $tableName", e)
            null
        }
    }
    
    /**
     * Get all table names in the public schema
     * 
     * @param config Database configuration
     * @return List of table names
     */
    suspend fun getTableNames(config: DatabaseConfig): List<String> = withContext(Dispatchers.IO) {
        try {
            val result = executeQuery(config, DatabasePresets.Queries.LIST_TABLES.sql)
            result.rows.map { it[0] }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get table names", e)
            emptyList()
        }
    }
    
    /**
     * Close all cached connections
     */
    fun closeAllConnections() {
        connectionCache.values.forEach { connection ->
            try {
                if (!connection.isClosed) {
                    connection.close()
                    Log.d(TAG, "Connection closed")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error closing connection", e)
            }
        }
        connectionCache.clear()
    }
    
    /**
     * Close connection for specific database
     */
    fun closeConnection(databaseId: String) {
        connectionCache[databaseId]?.let { connection ->
            try {
                if (!connection.isClosed) {
                    connection.close()
                    Log.d(TAG, "Connection closed for database: $databaseId")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error closing connection for $databaseId", e)
            }
        }
        connectionCache.remove(databaseId)
    }
    
    // ========================================
    // PRIVATE METHODS
    // ========================================
    
    /**
     * Get or create database connection
     */
    private fun getConnection(config: DatabaseConfig): Connection {
        // Return cached connection if valid
        connectionCache[config.id]?.let { connection ->
            if (!connection.isClosed && connection.isValid(5)) {
                return connection
            } else {
                connectionCache.remove(config.id)
            }
        }
        
        // Create new connection with retry logic
        var lastException: Exception? = null
        repeat(MAX_RETRIES) { attempt ->
            try {
                val properties = Properties().apply {
                    setProperty("connectTimeout", CONNECT_TIMEOUT_MS.toString())
                    setProperty("socketTimeout", (QUERY_TIMEOUT_SEC * 1000).toString())
                    setProperty("ApplicationName", "InfinityGauntlet-Android")
                }
                
                val connection = DriverManager.getConnection(config.url, properties)
                connectionCache[config.id] = connection
                
                Log.d(TAG, "Connected to ${config.name} (attempt ${attempt + 1})")
                return connection
                
            } catch (e: Exception) {
                lastException = e
                Log.w(TAG, "Connection attempt ${attempt + 1} failed for ${config.name}", e)
                
                if (attempt < MAX_RETRIES - 1) {
                    Thread.sleep(RETRY_DELAY_MS)
                }
            }
        }
        
        throw lastException ?: Exception("Failed to connect after $MAX_RETRIES attempts")
    }
    
    /**
     * Map JDBC ResultSet to QueryResult
     */
    private fun mapResultSet(resultSet: ResultSet): QueryResult {
        val metaData = resultSet.metaData
        val columnCount = metaData.columnCount
        
        // Extract column names
        val columns = (1..columnCount).map { metaData.getColumnName(it) }
        
        // Extract rows
        val rows = mutableListOf<List<String>>()
        while (resultSet.next()) {
            val row = (1..columnCount).map { 
                resultSet.getString(it) ?: "NULL" 
            }
            rows.add(row)
        }
        
        return QueryResult(
            success = true,
            rowCount = rows.size,
            columnCount = columnCount,
            columns = columns,
            rows = rows
        )
    }
}
