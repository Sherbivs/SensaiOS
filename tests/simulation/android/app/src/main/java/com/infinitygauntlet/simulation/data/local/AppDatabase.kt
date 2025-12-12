package com.infinitygauntlet.simulation.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.infinitygauntlet.simulation.data.local.dao.ChannelDao
import com.infinitygauntlet.simulation.data.local.dao.ChatMessageDao
import com.infinitygauntlet.simulation.data.local.dao.TestResultDao
import com.infinitygauntlet.simulation.data.local.dao.TestScenarioDao
import com.infinitygauntlet.simulation.data.local.entities.ChannelEntity
import com.infinitygauntlet.simulation.data.local.entities.ChatMessageEntity
import com.infinitygauntlet.simulation.data.local.entities.TestResultEntity
import com.infinitygauntlet.simulation.data.local.entities.TestScenarioEntity

/**
 * Room Database for Infinity Gauntlet Simulation
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Central database class that provides access to all DAOs.
 * Implements singleton pattern to ensure single database instance.
 * 
 * Database Schema:
 * - test_scenarios: Test scenario definitions and execution history
 * - test_results: Test execution results with foreign key to scenarios
 * - chat_messages: Discord-like chat messages with replies and reactions
 * - channels: Channel metadata with unread tracking and typing indicators
 * 
 * Features:
 * - Foreign key constraints with CASCADE delete
 * - Indices for query performance
 * - Type converters for complex types (JSON, lists)
 * - Migration strategy preparation
 * 
 * @see TestScenarioEntity
 * @see TestResultEntity
 * @see ChatMessageEntity
 * @see ChannelEntity
 */
@Database(
    entities = [
        TestScenarioEntity::class,
        TestResultEntity::class,
        ChatMessageEntity::class,
        ChannelEntity::class
    ],
    version = 1,
    exportSchema = true // Export schema to schemas/ folder for migration testing
)
@TypeConverters(Converters::class)
abstract class AppDatabase : RoomDatabase() {
    
    /**
     * Get TestScenarioDao for test scenario operations
     */
    abstract fun testScenarioDao(): TestScenarioDao
    
    /**
     * Get TestResultDao for test result operations
     */
    abstract fun testResultDao(): TestResultDao
    
    /**
     * Get ChatMessageDao for chat message operations
     */
    abstract fun chatMessageDao(): ChatMessageDao
    
    /**
     * Get ChannelDao for channel operations
     */
    abstract fun channelDao(): ChannelDao
    
    companion object {
        /**
         * Database name
         */
        private const val DATABASE_NAME = "infinity_gauntlet.db"
        
        /**
         * Volatile singleton instance
         * Volatile ensures visibility of changes across threads
         */
        @Volatile
        private var INSTANCE: AppDatabase? = null
        
        /**
         * Get database instance (singleton pattern)
         * Thread-safe with double-checked locking
         * 
         * @param context Application context
         * @return Database instance
         */
        fun getInstance(context: Context): AppDatabase {
            // First check (no locking)
            return INSTANCE ?: synchronized(this) {
                // Second check (with locking)
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }
        }
        
        /**
         * Build database instance with configuration
         * 
         * @param context Application context
         * @return Configured database builder
         */
        private fun buildDatabase(context: Context): AppDatabase {
            return Room.databaseBuilder(
                context.applicationContext,
                AppDatabase::class.java,
                DATABASE_NAME
            )
                // Fallback to destructive migration for now
                // TODO: Implement proper migration strategy in Week 2 Phase 2.3
                .fallbackToDestructiveMigration()
                
                // Enable foreign key constraints
                .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING)
                
                // Build the database
                .build()
        }
        
        /**
         * Create in-memory database for testing
         * Data is lost when process is killed
         * 
         * @param context Application context
         * @return In-memory database instance
         */
        fun createInMemoryDatabase(context: Context): AppDatabase {
            return Room.inMemoryDatabaseBuilder(
                context.applicationContext,
                AppDatabase::class.java
            )
                .allowMainThreadQueries() // Only for testing!
                .build()
        }
        
        /**
         * Close database and clear instance
         * Use with caution - primarily for testing
         */
        fun closeDatabase() {
            INSTANCE?.close()
            INSTANCE = null
        }
    }
}
