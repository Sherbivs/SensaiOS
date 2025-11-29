package com.infinitygauntlet.simulation.data.repositories

import com.infinitygauntlet.simulation.data.local.dao.TestResultDao
import com.infinitygauntlet.simulation.data.mappers.toDomain
import com.infinitygauntlet.simulation.data.mappers.toDomainList
import com.infinitygauntlet.simulation.data.mappers.toEntity
import com.infinitygauntlet.simulation.data.mappers.toEntityList
import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.domain.models.ResultStatus
import com.infinitygauntlet.simulation.domain.repository.TestResultRepository
import com.infinitygauntlet.simulation.domain.repository.ResultStatistics
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * Implementation: TestResultRepository
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Concrete implementation of TestResultRepository interface.
 * Bridges DAO layer with domain layer using mappers.
 * Injected via Hilt for dependency inversion.
 * 
 * @param dao TestResultDao for database operations
 */
class TestResultRepositoryImpl @Inject constructor(
    private val dao: TestResultDao
) : TestResultRepository {
    
    override fun getResultsByScenario(scenarioId: Long): Flow<List<TestResult>> {
        return dao.getResultsByScenario(scenarioId).map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun getResultsByScenarioPaged(
        scenarioId: Long,
        limit: Int,
        offset: Int
    ): List<TestResult> {
        val entities = dao.getResultsByScenarioPaged(scenarioId, limit, offset)
        return entities.toDomainList()
    }
    
    override fun getResultsByStatus(status: ResultStatus): Flow<List<TestResult>> {
        return dao.getResultsByStatus(status.name.lowercase()).map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun getLatestResult(scenarioId: Long): TestResult? {
        val entity = dao.getLatestResult(scenarioId)
        return entity?.toDomain()
    }
    
    override fun getLatestResultFlow(scenarioId: Long): Flow<TestResult?> {
        return dao.getLatestResultFlow(scenarioId).map { entity ->
            entity?.toDomain()
        }
    }
    
    override fun getResultsByTimeRange(startTime: Long, endTime: Long): Flow<List<TestResult>> {
        return dao.getResultsByTimeRange(startTime, endTime).map { entities ->
            entities.toDomainList()
        }
    }
    
    override fun getFailedResults(): Flow<List<TestResult>> {
        return dao.getFailedResults().map { entities ->
            entities.toDomainList()
        }
    }
    
    override suspend fun getScenarioStatistics(scenarioId: Long): ResultStatistics {
        val stats = dao.getScenarioStatistics(scenarioId)
        return ResultStatistics(
            totalExecutions = stats.total_executions,
            passedCount = stats.passed_count,
            failedCount = stats.failed_count,
            errorCount = stats.error_count,
            avgDuration = stats.avg_duration,
            minDuration = stats.min_duration,
            maxDuration = stats.max_duration,
            totalPassedTests = stats.total_passed_tests,
            totalFailedTests = stats.total_failed_tests
        )
    }
    
    override suspend fun getOverallStatistics(): ResultStatistics {
        val stats = dao.getOverallStatistics()
        return ResultStatistics(
            totalExecutions = stats.total_executions,
            passedCount = stats.passed_count,
            failedCount = stats.failed_count,
            errorCount = stats.error_count,
            avgDuration = stats.avg_duration,
            minDuration = stats.min_duration,
            maxDuration = stats.max_duration,
            totalPassedTests = stats.total_passed_tests,
            totalFailedTests = stats.total_failed_tests
        )
    }
    
    override suspend fun getPassRate(scenarioId: Long): Float {
        return dao.getPassRate(scenarioId)
    }
    
    override suspend fun getExecutionTrend(scenarioId: Long, limit: Int): List<TestResult> {
        val entities = dao.getExecutionTrend(scenarioId, limit)
        return entities.toDomainList()
    }
    
    override suspend fun insertResult(result: TestResult): Long {
        return dao.insertResult(result.toEntity())
    }
    
    override suspend fun insertResults(results: List<TestResult>) {
        dao.insertResults(results.toEntityList())
    }
    
    override suspend fun deleteResult(result: TestResult) {
        dao.deleteResult(result.toEntity())
    }
    
    override suspend fun deleteResultsByScenario(scenarioId: Long) {
        dao.deleteResultsByScenario(scenarioId)
    }
    
    override suspend fun deleteAllResults() {
        dao.deleteAllResults()
    }
    
    override suspend fun deleteOldResults(olderThan: Long): Int {
        return dao.deleteOldResults(olderThan)
    }
    
    override suspend fun getCount(): Int {
        return dao.getCount()
    }
    
    override suspend fun getCountByScenario(scenarioId: Long): Int {
        return dao.getCountByScenario(scenarioId)
    }
}
