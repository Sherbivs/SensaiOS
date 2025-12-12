package com.infinitygauntlet.simulation.database

/**
 * Predefined database configurations for Infinity Gauntlet project
 * 
 * Provides access to:
 * - Production (Render-managed PostgreSQL)
 * - On-Premise Development (localhost:55433)
 * - On-Premise Experiment (localhost:55434)
 * 
 * Connection URLs match the environment variables in secrets/Infinity-Gauntlet.env:
 * - PROD_DATABASE_URL → Production
 * - DATABASE_ONPREMISE_DEV_PRIMARY → Development
 * - DATABASE_ONPREMISE_DEV_EXPERIMENT → Experiment
 */
object DatabasePresets {
    
    /**
     * Production database (Render-managed PostgreSQL)
     * Region: Virginia
     * Database: infinity_gauntlet_db
     */
    val PRODUCTION = DatabaseConfig(
        id = "prod",
        name = "Production (Render)",
        url = "postgresql://infinity_gauntlet_db_user:a7PECaiuqXiJCMpeDze8tlpEbxB68Sy2@dpg-d3vd8h7diees73et3i3g-a.virginia-postgres.render.com/infinity_gauntlet_db",
        type = DatabaseType.PROD_RENDER,
        description = "Render-managed production database (Virginia region)",
        isActive = true
    )
    
    /**
     * On-premise development database (localhost:55433)
     * Mirror of production for offline development
     * Store: Store/onpremise-dev-primary/
     */
    val ON_PREMISE_DEV = DatabaseConfig(
        id = "onpremise_dev",
        name = "On-Premise Dev (55433)",
        url = "postgresql://postgres@localhost:55433/infinity_gauntlet_db",
        type = DatabaseType.DEV_PRIMARY,
        description = "Workstation development database (production mirror)",
        isActive = false  // Requires local PostgreSQL cluster
    )
    
    /**
     * On-premise experiment database (localhost:55434)
     * Isolated testing environment for migrations
     * Store: Store/onpremise-dev-primary-experiment/
     */
    val ON_PREMISE_EXPERIMENT = DatabaseConfig(
        id = "onpremise_experiment",
        name = "On-Premise Experiment (55434)",
        url = "postgresql://postgres@localhost:55434/infinity_gauntlet_experiment",
        type = DatabaseType.DEV_EXPERIMENT,
        description = "Migration testing database (isolated experiments)",
        isActive = false  // Requires local PostgreSQL cluster
    )
    
    /**
     * Get all available database configurations
     */
    fun getAllDatabases(): List<DatabaseConfig> {
        return listOf(
            PRODUCTION,
            ON_PREMISE_DEV,
            ON_PREMISE_EXPERIMENT
        )
    }
    
    /**
     * Get database by ID
     */
    fun getDatabaseById(id: String): DatabaseConfig? {
        return getAllDatabases().find { it.id == id }
    }
    
    /**
     * Get production databases only
     */
    fun getProductionDatabases(): List<DatabaseConfig> {
        return getAllDatabases().filter { it.type == DatabaseType.PROD_RENDER }
    }
    
    /**
     * Get development databases only
     */
    fun getDevelopmentDatabases(): List<DatabaseConfig> {
        return getAllDatabases().filter { 
            it.type == DatabaseType.DEV_PRIMARY || it.type == DatabaseType.DEV_EXPERIMENT 
        }
    }
    
    /**
     * Common SQL query presets
     */
    object Queries {
        
        // Schema inspection queries
        val LIST_TABLES = QueryPreset(
            id = "list_tables",
            name = "List All Tables",
            description = "Show all tables in the public schema",
            sql = """
                SELECT 
                    tablename as "Table Name",
                    schemaname as "Schema"
                FROM pg_tables 
                WHERE schemaname = 'public'
                ORDER BY tablename;
            """.trimIndent(),
            category = QueryCategory.SCHEMA
        )
        
        val TABLE_COUNTS = QueryPreset(
            id = "table_counts",
            name = "Table Row Counts",
            description = "Count rows in each table",
            sql = """
                SELECT 
                    schemaname as "Schema",
                    tablename as "Table",
                    n_live_tup as "Row Count"
                FROM pg_stat_user_tables
                ORDER BY n_live_tup DESC;
            """.trimIndent(),
            category = QueryCategory.DATA
        )
        
        val DATABASE_SIZE = QueryPreset(
            id = "database_size",
            name = "Database Size",
            description = "Show database size in MB",
            sql = """
                SELECT 
                    pg_database.datname as "Database",
                    pg_size_pretty(pg_database_size(pg_database.datname)) as "Size"
                FROM pg_database
                WHERE datname = current_database();
            """.trimIndent(),
            category = QueryCategory.STATISTICS
        )
        
        val POSTGRES_VERSION = QueryPreset(
            id = "postgres_version",
            name = "PostgreSQL Version",
            description = "Show PostgreSQL version",
            sql = "SELECT version() as \"PostgreSQL Version\";",
            category = QueryCategory.DIAGNOSTICS
        )
        
        val ACTIVE_CONNECTIONS = QueryPreset(
            id = "active_connections",
            name = "Active Connections",
            description = "Show current database connections",
            sql = """
                SELECT 
                    datname as "Database",
                    COUNT(*) as "Connections"
                FROM pg_stat_activity
                WHERE datname IS NOT NULL
                GROUP BY datname
                ORDER BY COUNT(*) DESC;
            """.trimIndent(),
            category = QueryCategory.DIAGNOSTICS
        )
        
        val SPECIES_COUNT = QueryPreset(
            id = "species_count",
            name = "Species Count",
            description = "Count Pokémon species in database",
            sql = """SELECT COUNT(*) as "Species Count" FROM "Species";""",
            category = QueryCategory.DATA
        )
        
        val USER_COUNT = QueryPreset(
            id = "user_count",
            name = "User Count",
            description = "Count users in database",
            sql = """SELECT COUNT(*) as "User Count" FROM "User";""",
            category = QueryCategory.DATA
        )
        
        val RECENT_MIGRATIONS = QueryPreset(
            id = "recent_migrations",
            name = "Recent Migrations",
            description = "Show last 5 Prisma migrations",
            sql = """
                SELECT 
                    migration_name as "Migration",
                    finished_at as "Applied At"
                FROM _prisma_migrations
                ORDER BY finished_at DESC
                LIMIT 5;
            """.trimIndent(),
            category = QueryCategory.SCHEMA
        )
        
        val TABLE_SIZES = QueryPreset(
            id = "table_sizes",
            name = "Table Sizes",
            description = "Show size of each table",
            sql = """
                SELECT 
                    schemaname as "Schema",
                    tablename as "Table",
                    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as "Size"
                FROM pg_tables
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
            """.trimIndent(),
            category = QueryCategory.STATISTICS
        )
        
        val INDEX_USAGE = QueryPreset(
            id = "index_usage",
            name = "Index Usage",
            description = "Show index usage statistics",
            sql = """
                SELECT 
                    schemaname as "Schema",
                    tablename as "Table",
                    indexname as "Index",
                    idx_scan as "Scans",
                    idx_tup_read as "Tuples Read"
                FROM pg_stat_user_indexes
                ORDER BY idx_scan DESC
                LIMIT 10;
            """.trimIndent(),
            category = QueryCategory.STATISTICS
        )
        
        /**
         * Get all query presets
         */
        fun getAllPresets(): List<QueryPreset> {
            return listOf(
                LIST_TABLES,
                TABLE_COUNTS,
                DATABASE_SIZE,
                POSTGRES_VERSION,
                ACTIVE_CONNECTIONS,
                SPECIES_COUNT,
                USER_COUNT,
                RECENT_MIGRATIONS,
                TABLE_SIZES,
                INDEX_USAGE
            )
        }
        
        /**
         * Get presets by category
         */
        fun getPresetsByCategory(category: QueryCategory): List<QueryPreset> {
            return getAllPresets().filter { it.category == category }
        }
        
        /**
         * Get preset by ID
         */
        fun getPresetById(id: String): QueryPreset? {
            return getAllPresets().find { it.id == id }
        }
    }
}
