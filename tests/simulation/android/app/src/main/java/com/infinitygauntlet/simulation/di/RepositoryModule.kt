package com.infinitygauntlet.simulation.di

import com.infinitygauntlet.simulation.data.local.dao.ChannelDao
import com.infinitygauntlet.simulation.data.local.dao.ChatMessageDao
import com.infinitygauntlet.simulation.data.local.dao.TestResultDao
import com.infinitygauntlet.simulation.data.local.dao.TestScenarioDao
import com.infinitygauntlet.simulation.data.repositories.ChannelRepositoryImpl
import com.infinitygauntlet.simulation.data.repositories.ChatRepositoryImpl
import com.infinitygauntlet.simulation.data.repositories.TestResultRepositoryImpl
import com.infinitygauntlet.simulation.data.repositories.TestScenarioRepositoryImpl
import com.infinitygauntlet.simulation.domain.repository.ChannelRepository
import com.infinitygauntlet.simulation.domain.repository.ChatRepository
import com.infinitygauntlet.simulation.domain.repository.TestResultRepository
import com.infinitygauntlet.simulation.domain.repository.TestScenarioRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Hilt Module for Repository Dependencies
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Provides repository implementations to the dependency injection graph.
 * Binds interfaces to concrete implementations for dependency inversion.
 * All dependencies are scoped to SingletonComponent (application lifetime).
 * 
 * Architecture Flow:
 * ViewModel → Repository Interface → Repository Implementation → DAO → Database
 * 
 * Dependencies provided:
 * - TestScenarioRepository: Test scenario data operations
 * - TestResultRepository: Test result data operations
 * - ChatRepository: Chat message data operations
 * - ChannelRepository: Channel data operations
 * 
 * Usage in ViewModels:
 * ```
 * @HiltViewModel
 * class TestViewModel @Inject constructor(
 *     private val scenarioRepository: TestScenarioRepository,
 *     private val resultRepository: TestResultRepository
 * ) : ViewModel() {
 *     // Use repository methods
 *     val scenarios = scenarioRepository.getAllScenarios()
 * }
 * ```
 */
@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {
    
    /**
     * Provide TestScenarioRepository implementation
     * 
     * @param dao TestScenarioDao instance (provided by DatabaseModule)
     * @return TestScenarioRepository implementation
     */
    @Provides
    @Singleton
    fun provideTestScenarioRepository(
        dao: TestScenarioDao
    ): TestScenarioRepository {
        return TestScenarioRepositoryImpl(dao)
    }
    
    /**
     * Provide TestResultRepository implementation
     * 
     * @param dao TestResultDao instance (provided by DatabaseModule)
     * @return TestResultRepository implementation
     */
    @Provides
    @Singleton
    fun provideTestResultRepository(
        dao: TestResultDao
    ): TestResultRepository {
        return TestResultRepositoryImpl(dao)
    }
    
    /**
     * Provide ChatRepository implementation
     * 
     * @param dao ChatMessageDao instance (provided by DatabaseModule)
     * @return ChatRepository implementation
     */
    @Provides
    @Singleton
    fun provideChatRepository(
        dao: ChatMessageDao
    ): ChatRepository {
        return ChatRepositoryImpl(dao)
    }
    
    /**
     * Provide ChannelRepository implementation
     * 
     * @param dao ChannelDao instance (provided by DatabaseModule)
     * @return ChannelRepository implementation
     */
    @Provides
    @Singleton
    fun provideChannelRepository(
        dao: ChannelDao
    ): ChannelRepository {
        return ChannelRepositoryImpl(dao)
    }
}
