package com.infinitygauntlet.simulation.data.local.dao

import androidx.room.*
import com.infinitygauntlet.simulation.data.local.entities.TestResultEntity
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for Test Results
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Provides methods to interact with test_results table.
 * Focuses on historical data and analytics queries.
 * 
 * @see TestResultEntity
 */
@Dao
interface TestResultDao {
    
    /**
     * Get all test results for a scenario
     * Ordered by execution timestamp (newest first)
     * 
     * @param scenarioId Scenario ID
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE scenario_id = :scenarioId 
        ORDER BY execution_timestamp DESC
    """)
    fun getResultsByScenario(scenarioId: Long): Flow<List<TestResultEntity>>
    
    /**
     * Get paginated results for a scenario
     * 
     * @param scenarioId Scenario ID
     * @param limit Maximum results to return
     * @param offset Starting position
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE scenario_id = :scenarioId 
        ORDER BY execution_timestamp DESC
        LIMIT :limit OFFSET :offset
    """)
    suspend fun getResultsByScenarioPaged(
        scenarioId: Long,
        limit: Int = 20,
        offset: Int = 0
    ): List<TestResultEntity>
    
    /**
     * Get results by status
     * 
     * @param status Status to filter by (passed, failed, error, skipped)
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE status = :status 
        ORDER BY execution_timestamp DESC
    """)
    fun getResultsByStatus(status: String): Flow<List<TestResultEntity>>
    
    /**
     * Get latest result for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE scenario_id = :scenarioId 
        ORDER BY execution_timestamp DESC 
        LIMIT 1
    """)
    suspend fun getLatestResult(scenarioId: Long): TestResultEntity?
    
    /**
     * Get latest result as Flow
     * 
     * @param scenarioId Scenario ID
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE scenario_id = :scenarioId 
        ORDER BY execution_timestamp DESC 
        LIMIT 1
    """)
    fun getLatestResultFlow(scenarioId: Long): Flow<TestResultEntity?>
    
    /**
     * Get results in a time range
     * 
     * @param startTime Start timestamp (inclusive)
     * @param endTime End timestamp (inclusive)
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE execution_timestamp BETWEEN :startTime AND :endTime
        ORDER BY execution_timestamp DESC
    """)
    fun getResultsByTimeRange(startTime: Long, endTime: Long): Flow<List<TestResultEntity>>
    
    /**
     * Get failed results
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE status = 'failed' OR status = 'error'
        ORDER BY execution_timestamp DESC
    """)
    fun getFailedResults(): Flow<List<TestResultEntity>>
    
    /**
     * Get result statistics for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    @Query("""
        SELECT 
            COUNT(*) as total_executions,
            SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
            AVG(duration_ms) as avg_duration,
            MIN(duration_ms) as min_duration,
            MAX(duration_ms) as max_duration,
            SUM(passed_tests) as total_passed_tests,
            SUM(failed_tests) as total_failed_tests
        FROM test_results 
        WHERE scenario_id = :scenarioId
    """)
    suspend fun getScenarioStatistics(scenarioId: Long): ResultStatistics
    
    /**
     * Get overall statistics
     */
    @Query("""
        SELECT 
            COUNT(*) as total_executions,
            SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed_count,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
            SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
            AVG(duration_ms) as avg_duration,
            MIN(duration_ms) as min_duration,
            MAX(duration_ms) as max_duration,
            SUM(passed_tests) as total_passed_tests,
            SUM(failed_tests) as total_failed_tests
        FROM test_results
    """)
    suspend fun getOverallStatistics(): ResultStatistics
    
    /**
     * Get pass rate for a scenario
     * 
     * @param scenarioId Scenario ID
     * @return Pass rate as percentage (0.0 to 100.0)
     */
    @Query("""
        SELECT 
            CASE 
                WHEN COUNT(*) = 0 THEN 0.0
                ELSE (CAST(SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) AS REAL) / COUNT(*)) * 100.0
            END
        FROM test_results 
        WHERE scenario_id = :scenarioId
    """)
    suspend fun getPassRate(scenarioId: Long): Float
    
    /**
     * Get execution trend (last N results)
     * 
     * @param scenarioId Scenario ID
     * @param limit Number of recent results
     */
    @Query("""
        SELECT * FROM test_results 
        WHERE scenario_id = :scenarioId 
        ORDER BY execution_timestamp DESC
        LIMIT :limit
    """)
    suspend fun getExecutionTrend(scenarioId: Long, limit: Int = 10): List<TestResultEntity>
    
    /**
     * Insert a test result
     * 
     * @param result Result to insert
     * @return ID of inserted result
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertResult(result: TestResultEntity): Long
    
    /**
     * Insert multiple results
     * 
     * @param results List of results to insert
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertResults(results: List<TestResultEntity>)
    
    /**
     * Delete a result
     * 
     * @param result Result to delete
     */
    @Delete
    suspend fun deleteResult(result: TestResultEntity)
    
    /**
     * Delete all results for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    @Query("DELETE FROM test_results WHERE scenario_id = :scenarioId")
    suspend fun deleteResultsByScenario(scenarioId: Long)
    
    /**
     * Delete all results
     */
    @Query("DELETE FROM test_results")
    suspend fun deleteAllResults()
    
    /**
     * Delete old results (older than timestamp)
     * 
     * @param olderThan Timestamp threshold
     * @return Number of deleted rows
     */
    @Query("DELETE FROM test_results WHERE execution_timestamp < :olderThan")
    suspend fun deleteOldResults(olderThan: Long): Int
    
    /**
     * Get count of results
     */
    @Query("SELECT COUNT(*) FROM test_results")
    suspend fun getCount(): Int
    
    /**
     * Get count of results for a scenario
     * 
     * @param scenarioId Scenario ID
     */
    @Query("SELECT COUNT(*) FROM test_results WHERE scenario_id = :scenarioId")
    suspend fun getCountByScenario(scenarioId: Long): Int
}

/**
 * Data class for result statistics
 */
data class ResultStatistics(
    val total_executions: Int = 0,
    val passed_count: Int = 0,
    val failed_count: Int = 0,
    val error_count: Int = 0,
    val avg_duration: Float = 0f,
    val min_duration: Long = 0L,
    val max_duration: Long = 0L,
    val total_passed_tests: Int = 0,
    val total_failed_tests: Int = 0
) {
    /**
     * Calculate pass rate as percentage
     */
    val passRate: Float
        get() = if (total_executions == 0) 0f 
                else (passed_count.toFloat() / total_executions) * 100f
    
    /**
     * Check if all tests passed
     */
    val allPassed: Boolean
        get() = total_executions > 0 && passed_count == total_executions
}
