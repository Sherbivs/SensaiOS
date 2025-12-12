package com.infinitygauntlet.simulation.di

import android.content.Context
import com.infinitygauntlet.simulation.data.local.AppDatabase
import com.infinitygauntlet.simulation.data.local.dao.ChannelDao
import com.infinitygauntlet.simulation.data.local.dao.ChatMessageDao
import com.infinitygauntlet.simulation.data.local.dao.TestResultDao
import com.infinitygauntlet.simulation.data.local.dao.TestScenarioDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt Module for Database Dependencies
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Provides database and DAO instances to the dependency injection graph.
 * All dependencies are scoped to SingletonComponent (application lifetime).
 * 
 * Dependencies provided:
 * - AppDatabase: Room database instance
 * - TestScenarioDao: Test scenario data access
 * - TestResultDao: Test result data access
 * - ChatMessageDao: Chat message data access
 * - ChannelDao: Channel data access
 * 
 * Usage in ViewModels:
 * ```
 * @HiltViewModel
 * class MyViewModel @Inject constructor(
 *     private val testScenarioDao: TestScenarioDao
 * ) : ViewModel() {
 *     // Use DAO methods
 * }
 * ```
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    
    /**
     * Provide Room Database instance
     * Singleton scoped - one instance for entire app lifetime
     * 
     * @param context Application context (provided by Hilt)
     * @return Database instance
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        return AppDatabase.getInstance(context)
    }
    
    /**
     * Provide TestScenarioDao
     * 
     * @param database Database instance
     * @return TestScenarioDao instance
     */
    @Provides
    @Singleton
    fun provideTestScenarioDao(database: AppDatabase): TestScenarioDao {
        return database.testScenarioDao()
    }
    
    /**
     * Provide TestResultDao
     * 
     * @param database Database instance
     * @return TestResultDao instance
     */
    @Provides
    @Singleton
    fun provideTestResultDao(database: AppDatabase): TestResultDao {
        return database.testResultDao()
    }
    
    /**
     * Provide ChatMessageDao
     * 
     * @param database Database instance
     * @return ChatMessageDao instance
     */
    @Provides
    @Singleton
    fun provideChatMessageDao(database: AppDatabase): ChatMessageDao {
        return database.chatMessageDao()
    }
    
    /**
     * Provide ChannelDao
     * 
     * @param database Database instance
     * @return ChannelDao instance
     */
    @Provides
    @Singleton
    fun provideChannelDao(database: AppDatabase): ChannelDao {
        return database.channelDao()
    }
}
