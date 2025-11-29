package com.infinitygauntlet.simulation.database

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Database command handler for chat interface
 * 
 * Processes special commands in the format:
 * - /db list - List all available databases
 * - /db status [database_id] - Check database connection status
 * - /db tables [database_id] - List tables in database
 * - /db query [database_id] [sql] - Execute SQL query
 * - /db preset [preset_id] [database_id] - Execute preset query
 * - /db help - Show command help
 * 
 * Example:
 * ```
 * User: /db list
 * Bot: Available databases:
 *      1. Production (Render) - prod
 *      2. On-Premise Dev (55433) - onpremise_dev
 *      3. On-Premise Experiment (55434) - onpremise_experiment
 * 
 * User: /db status prod
 * Bot: Database: Production (Render)
 *      Status: Connected ✅
 *      Version: PostgreSQL 16.3
 *      Size: 45.2 MB
 *      Tables: 23
 *      Latency: 87ms
 * 
 * User: /db query prod SELECT COUNT(*) FROM "User"
 * Bot: Query executed successfully (92ms)
 *      Row Count: 1
 *      
 *      | COUNT |
 *      |-------|
 *      | 42    |
 * ```
 */
class DatabaseCommandHandler {
    
    companion object {
        private const val TAG = "DatabaseCommandHandler"
    }
    
    private val connectionManager = DatabaseConnectionManager()
    
    /**
     * Process database command from chat
     * 
     * @param command Full command string (e.g., "/db list")
     * @return Response message to display in chat
     */
    suspend fun processCommand(command: String): String = withContext(Dispatchers.IO) {
        val parts = command.trim().split("\\s+".toRegex())
        
        if (parts.size < 2 || parts[0] != "/db") {
            return@withContext "Invalid database command. Use '/db help' for usage."
        }
        
        val subCommand = parts[1].lowercase()
        
        when (subCommand) {
            "list" -> handleListDatabases()
            "status" -> handleDatabaseStatus(parts.getOrNull(2))
            "tables" -> handleListTables(parts.getOrNull(2))
            "query" -> handleQuery(parts.getOrNull(2), parts.drop(3).joinToString(" "))
            "preset" -> handlePreset(parts.getOrNull(2), parts.getOrNull(3))
            "help" -> handleHelp()
            else -> "Unknown command: $subCommand. Use '/db help' for usage."
        }
    }
    
    /**
     * Check if message is a database command
     */
    fun isDatabaseCommand(message: String): Boolean {
        return message.trim().startsWith("/db ")
    }
    
    /**
     * Clean up connections (call when activity is destroyed)
     */
    fun cleanup() {
        connectionManager.closeAllConnections()
    }
    
    // ========================================
    // COMMAND HANDLERS
    // ========================================
    
    /**
     * Handle /db list - List all databases
     */
    private fun handleListDatabases(): String {
        val databases = DatabasePresets.getAllDatabases()
        
        val sb = StringBuilder()
        sb.append("📊 **Available Databases:**\n\n")
        
        databases.forEachIndexed { index, db ->
            val icon = when (db.type) {
                DatabaseType.PROD_RENDER -> "☁️"
                DatabaseType.DEV_PRIMARY -> "💻"
                DatabaseType.DEV_EXPERIMENT -> "🧪"
                else -> "❓"
            }
            
            sb.append("${index + 1}. $icon **${db.name}**\n")
            sb.append("   ID: `${db.id}`\n")
            sb.append("   Type: ${db.type}\n")
            sb.append("   Description: ${db.description}\n\n")
        }
        
        sb.append("💡 **Usage:**\n")
        sb.append("   `/db status [database_id]` - Check connection\n")
        sb.append("   `/db tables [database_id]` - List tables\n")
        sb.append("   `/db query [database_id] [sql]` - Execute query\n")
        
        return sb.toString()
    }
    
    /**
     * Handle /db status [database_id] - Check database status
     */
    private suspend fun handleDatabaseStatus(databaseId: String?): String {
        if (databaseId == null) {
            return "❌ Missing database ID. Usage: `/db status [database_id]`\nUse `/db list` to see available databases."
        }
        
        val config = DatabasePresets.getDatabaseById(databaseId)
        if (config == null) {
            return "❌ Unknown database ID: $databaseId\nUse `/db list` to see available databases."
        }
        
        val sb = StringBuilder()
        sb.append("🔍 **Checking ${config.name}...**\n\n")
        
        val status = connectionManager.testConnection(config)
        
        if (status.isConnected) {
            sb.append("✅ **Status:** Connected\n")
            sb.append("📦 **Version:** ${status.version ?: "Unknown"}\n")
            sb.append("💾 **Size:** ${status.getFormattedSize()}\n")
            sb.append("📊 **Tables:** ${status.tableCount}\n")
            sb.append("⚡ **Latency:** ${status.latencyMs}ms\n")
        } else {
            sb.append("❌ **Status:** Connection Failed\n")
            sb.append("⚠️ **Error:** ${status.error ?: "Unknown error"}\n")
            
            if (config.type != DatabaseType.PROD_RENDER) {
                sb.append("\n💡 **Tip:** On-premise databases require local PostgreSQL cluster.\n")
                sb.append("   Run: `npm run ops:bootstrap-onpremise-dev`\n")
            }
        }
        
        return sb.toString()
    }
    
    /**
     * Handle /db tables [database_id] - List tables
     */
    private suspend fun handleListTables(databaseId: String?): String {
        if (databaseId == null) {
            return "❌ Missing database ID. Usage: `/db tables [database_id]`"
        }
        
        val config = DatabasePresets.getDatabaseById(databaseId)
        if (config == null) {
            return "❌ Unknown database ID: $databaseId"
        }
        
        val result = connectionManager.executeQuery(config, DatabasePresets.Queries.TABLE_COUNTS.sql)
        
        if (!result.success) {
            return "❌ Failed to query tables: ${result.error}"
        }
        
        val sb = StringBuilder()
        sb.append("📋 **Tables in ${config.name}:**\n\n")
        
        if (result.rowCount == 0) {
            sb.append("No tables found.\n")
        } else {
            sb.append("```\n")
            sb.append(formatResultAsTable(result))
            sb.append("```\n")
            sb.append("\n**Total:** ${result.rowCount} tables\n")
        }
        
        return sb.toString()
    }
    
    /**
     * Handle /db query [database_id] [sql] - Execute query
     */
    private suspend fun handleQuery(databaseId: String?, sql: String?): String {
        if (databaseId == null || sql.isNullOrBlank()) {
            return "❌ Usage: `/db query [database_id] [sql]`"
        }
        
        val config = DatabasePresets.getDatabaseById(databaseId)
        if (config == null) {
            return "❌ Unknown database ID: $databaseId"
        }
        
        val result = connectionManager.executeQuery(config, sql)
        
        if (!result.success) {
            return "❌ **Query Failed:**\n```\n${result.error}\n```"
        }
        
        val sb = StringBuilder()
        sb.append("✅ **Query executed successfully** (${result.executionTimeMs}ms)\n\n")
        
        if (result.rowCount == 0) {
            sb.append("No rows returned.\n")
        } else {
            sb.append("**Rows:** ${result.rowCount}\n")
            sb.append("**Columns:** ${result.columnCount}\n\n")
            sb.append("```\n")
            sb.append(formatResultAsTable(result))
            sb.append("```\n")
        }
        
        return sb.toString()
    }
    
    /**
     * Handle /db preset [preset_id] [database_id] - Execute preset query
     */
    private suspend fun handlePreset(presetId: String?, databaseId: String?): String {
        if (presetId == null) {
            return handleListPresets()
        }
        
        if (databaseId == null) {
            return "❌ Usage: `/db preset [preset_id] [database_id]`"
        }
        
        val preset = DatabasePresets.Queries.getPresetById(presetId)
        if (preset == null) {
            return "❌ Unknown preset ID: $presetId\nUse `/db preset` to see available presets."
        }
        
        val config = DatabasePresets.getDatabaseById(databaseId)
        if (config == null) {
            return "❌ Unknown database ID: $databaseId"
        }
        
        val sb = StringBuilder()
        sb.append("🔧 **Running:** ${preset.name}\n")
        sb.append("📝 **Description:** ${preset.description}\n\n")
        
        val result = connectionManager.executeQuery(config, preset.sql)
        
        if (!result.success) {
            sb.append("❌ **Query Failed:**\n```\n${result.error}\n```")
        } else {
            sb.append("✅ **Success** (${result.executionTimeMs}ms)\n\n")
            
            if (result.rowCount > 0) {
                sb.append("```\n")
                sb.append(formatResultAsTable(result))
                sb.append("```\n")
            } else {
                sb.append("No rows returned.\n")
            }
        }
        
        return sb.toString()
    }
    
    /**
     * Handle /db preset (no args) - List presets
     */
    private fun handleListPresets(): String {
        val presets = DatabasePresets.Queries.getAllPresets()
        
        val sb = StringBuilder()
        sb.append("🔧 **Available Query Presets:**\n\n")
        
        val categories = QueryCategory.values().filter { category ->
            presets.any { it.category == category }
        }
        
        categories.forEach { category ->
            sb.append("**${category.name}:**\n")
            presets.filter { it.category == category }.forEach { preset ->
                sb.append("  • `${preset.id}` - ${preset.name}\n")
                sb.append("    ${preset.description}\n")
            }
            sb.append("\n")
        }
        
        sb.append("💡 **Usage:**\n")
        sb.append("   `/db preset [preset_id] [database_id]`\n")
        sb.append("\n**Example:**\n")
        sb.append("   `/db preset species_count prod`\n")
        
        return sb.toString()
    }
    
    /**
     * Handle /db help - Show help
     */
    private fun handleHelp(): String {
        return """
            📚 **Database Commands Help**
            
            **Available Commands:**
            
            `/db list`
            List all available databases
            
            `/db status [database_id]`
            Check connection status for a database
            Example: `/db status prod`
            
            `/db tables [database_id]`
            List all tables with row counts
            Example: `/db tables prod`
            
            `/db query [database_id] [sql]`
            Execute custom SQL query
            Example: `/db query prod SELECT COUNT(*) FROM "User"`
            
            `/db preset [preset_id] [database_id]`
            Execute a preset query
            Example: `/db preset species_count prod`
            
            `/db preset`
            List all available preset queries
            
            `/db help`
            Show this help message
            
            **Database IDs:**
            • `prod` - Production (Render)
            • `onpremise_dev` - On-Premise Dev (55433)
            • `onpremise_experiment` - On-Premise Experiment (55434)
        """.trimIndent()
    }
    
    // ========================================
    // FORMATTING HELPERS
    // ========================================
    
    /**
     * Format QueryResult as ASCII table
     */
    private fun formatResultAsTable(result: QueryResult, maxWidth: Int = 80): String {
        if (result.rowCount == 0) {
            return "No data"
        }
        
        // Calculate column widths
        val columnWidths = result.columns.mapIndexed { index, column ->
            val headerWidth = column.length
            val dataWidth = result.rows.maxOfOrNull { row ->
                row.getOrNull(index)?.length ?: 0
            } ?: 0
            maxOf(headerWidth, dataWidth, 3).coerceAtMost(maxWidth / result.columnCount)
        }
        
        val sb = StringBuilder()
        
        // Header row
        result.columns.forEachIndexed { index, column ->
            val width = columnWidths[index]
            sb.append("| ")
            sb.append(column.take(width).padEnd(width))
            sb.append(" ")
        }
        sb.append("|\n")
        
        // Separator
        columnWidths.forEach { width ->
            sb.append("|")
            sb.append("-".repeat(width + 2))
        }
        sb.append("|\n")
        
        // Data rows (limit to 20 for display)
        val displayRows = result.rows.take(20)
        displayRows.forEach { row ->
            row.forEachIndexed { index, value ->
                val width = columnWidths[index]
                sb.append("| ")
                sb.append(value.take(width).padEnd(width))
                sb.append(" ")
            }
            sb.append("|\n")
        }
        
        // Show truncation message
        if (result.rowCount > 20) {
            sb.append("\n... ${result.rowCount - 20} more rows (showing first 20)\n")
        }
        
        return sb.toString()
    }
}
