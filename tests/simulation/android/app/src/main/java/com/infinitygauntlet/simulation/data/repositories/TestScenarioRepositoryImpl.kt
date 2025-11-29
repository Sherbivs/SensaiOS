package com.infinitygauntlet.simulation.data.repositories

import com.infinitygauntlet.simulation.data.local.dao.TestScenarioDao
import com.infinitygauntlet.simulation.data.mappers.toDomain
import com.infinitygauntlet.simulation.data.mappers.toDomainList
import com.infinitygauntlet.simulation.data.mappers.toEntity
import com.infinitygauntlet.simulation.data.mappers.toEntityList
import com.infinitygauntlet.simulation.domain.models.TestScenario
import com.infinitygauntlet.simulation.domain.models.TestStatus
import com.infinitygauntlet.simulation.domain.repository.TestScenarioRepository
import com.infinitygauntlet.simulation.domain.repository.ScenarioStatistics
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * Implementation: TestScenarioRepository
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Concrete implementation of TestScenarioRepository interface.
 * Bridges DAO layer with domain layer using mappers.
 * Injected via Hilt for dependency inversion.
 * 
 * @param dao TestScenarioDao for database operations
 */
class TestScenarioRepositoryImpl @Inject constructor(
    private val dao: TestScenarioDao
) : TestScenarioRepository {
    
    override fun getAllScenarios(): Flow<List<TestScenario>> {
        return dao.getAllScenarios().map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getScenariosByCategory(category: String): Flow<List<TestScenario>> {
        return dao.getScenariosByCategory(category).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getScenariosByStatus(status: TestStatus): Flow<List<TestScenario>> {
        return dao.getScenariosByStatus(status.name.lowercase()).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getScenarioById(id: Long): Flow<TestScenario?> {
        return dao.getScenarioById(id).map { entity ->
            entity?.toDomain()
        }
    }
    
    override fun searchScenarios(query: String): Flow<List<TestScenario>> {
        return dao.searchScenarios(query).map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun getStatistics(): ScenarioStatistics {
        val stats = dao.getStatistics()
        return ScenarioStatistics(
            total = stats.total,
            passed = stats.passed,
            failed = stats.failed,
            totalTests = stats.total_tests,
            totalDuration = stats.total_duration
        )
    }
    
    override suspend fun insertScenario(scenario: TestScenario): Long {
        return dao.insertScenario(scenario.toEntity())
    }
    
    override suspend fun insertScenarios(scenarios: List<TestScenario>) {
        dao.insertScenarios(scenarios.toEntityList())
    }
    
    override suspend fun updateScenario(scenario: TestScenario) {
        dao.updateScenario(scenario.toEntity())
    }
    
    override suspend fun updateScenarioStatus(id: Long, status: TestStatus) {
        dao.updateScenarioStatus(
            id = id,
            status = status.name.lowercase(),
            timestamp = System.currentTimeMillis()
        )
    }
    
    override suspend fun incrementSuccessCount(id: Long) {
        dao.incrementSuccessCount(id, System.currentTimeMillis())
    }
    
    override suspend fun incrementFailureCount(id: Long) {
        dao.incrementFailureCount(id, System.currentTimeMillis())
    }
    
    override suspend fun deleteScenario(scenario: TestScenario) {
        dao.deleteScenario(scenario.toEntity())
    }
    
    override suspend fun deleteAllScenarios() {
        dao.deleteAllScenarios()
    }
    
    override suspend fun getCount(): Int {
        return dao.getCount()
    }
}
