package com.infinitygauntlet.simulation.domain.repository

import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.domain.models.ResultStatus
import kotlinx.coroutines.flow.Flow

/**
 * Repository Interface: Test Result
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Defines the contract for test result data operations.
 * Domain layer interface - implemented in data layer.
 * Focuses on historical data and analytics.
 */
interface TestResultRepository {
    
    /**
     * Get all results for a scenario
     * Ordered by execution timestamp (newest first)
     * 
     * @param scenarioId Scenario ID
     */
    fun getResultsByScenario(scenarioId: Long): Flow<List<TestResult>>
    
    /**
     * Get paginated results for a scenario
     * 
     * @param scenarioId Scenario ID
     * @param limit Maximum results to return
     * @param offset Starting position
     */
    suspend fun getResultsByScenarioPaged(
        scenarioId: Long,
        limit: Int = 20,
        offset: Int = 0
    ): List<TestResult>
    
    /**
     * Get results by status
     * 
     * @param status Status to filter by
     */
    fun getResultsByStatus(status: ResultStatus): Flow<List<TestResult>>
    
    /**
     * Get a single result by ID
     * 
     * @param resultId Result ID
     */
    suspend fun getResultById(resultId: Long): TestResult?
    
    /**
     * Get latest result for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    suspend fun getLatestResult(scenarioId: Long): TestResult?
    
    /**
     * Get latest result as Flow
     * 
     * @param scenarioId Scenario ID
     */
    fun getLatestResultFlow(scenarioId: Long): Flow<TestResult?>
    
    /**
     * Get results in a time range
     * 
     * @param startTime Start timestamp (inclusive)
     * @param endTime End timestamp (inclusive)
     */
    fun getResultsByTimeRange(startTime: Long, endTime: Long): Flow<List<TestResult>>
    
    /**
     * Get failed results
     */
    fun getFailedResults(): Flow<List<TestResult>>
    
    /**
     * Get result statistics for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    suspend fun getScenarioStatistics(scenarioId: Long): ResultStatistics
    
    /**
     * Get overall statistics
     */
    suspend fun getOverallStatistics(): ResultStatistics
    
    /**
     * Get pass rate for a scenario
     * 
     * @param scenarioId Scenario ID
     * @return Pass rate as percentage (0.0 to 100.0)
     */
    suspend fun getPassRate(scenarioId: Long): Float
    
    /**
     * Get execution trend (last N results)
     * 
     * @param scenarioId Scenario ID
     * @param limit Number of recent results
     */
    suspend fun getExecutionTrend(scenarioId: Long, limit: Int = 10): List<TestResult>
    
    /**
     * Insert a test result
     * 
     * @param result Result to insert
     * @return ID of inserted result
     */
    suspend fun insertResult(result: TestResult): Long
    
    /**
     * Insert multiple results
     * 
     * @param results List of results to insert
     */
    suspend fun insertResults(results: List<TestResult>)
    
    /**
     * Delete a result
     * 
     * @param result Result to delete
     */
    suspend fun deleteResult(result: TestResult)
    
    /**
     * Delete all results for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    suspend fun deleteResultsByScenario(scenarioId: Long)
    
    /**
     * Delete all results
     */
    suspend fun deleteAllResults()
    
    /**
     * Delete old results (older than timestamp)
     * 
     * @param olderThan Timestamp threshold
     * @return Number of deleted rows
     */
    suspend fun deleteOldResults(olderThan: Long): Int
    
    /**
     * Get count of results
     */
    suspend fun getCount(): Int
    
    /**
     * Get count of results for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    suspend fun getCountByScenario(scenarioId: Long): Int
}

/**
 * Result Statistics Data Class
 */
data class ResultStatistics(
    val totalExecutions: Int = 0,
    val passedCount: Int = 0,
    val failedCount: Int = 0,
    val errorCount: Int = 0,
    val avgDuration: Float = 0f,
    val minDuration: Long = 0L,
    val maxDuration: Long = 0L,
    val totalPassedTests: Int = 0,
    val totalFailedTests: Int = 0
) {
    /**
     * Calculate pass rate as percentage
     */
    val passRate: Float
        get() = if (totalExecutions == 0) 0f 
                else (passedCount.toFloat() / totalExecutions) * 100f
    
    /**
     * Check if all tests passed
     */
    val allPassed: Boolean
        get() = totalExecutions > 0 && passedCount == totalExecutions
}
