package com.infinitygauntlet.simulation.data.local.dao

import androidx.room.*
import com.infinitygauntlet.simulation.data.local.entities.TestScenarioEntity
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for Test Scenarios
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Provides methods to interact with test_scenarios table.
 * Uses Flow for reactive updates and suspend functions for one-shot operations.
 * 
 * @see TestScenarioEntity
 */
@Dao
interface TestScenarioDao {
    
    /**
     * Get all test scenarios as a reactive Flow
     * Updates automatically when data changes
     */
    @Query("SELECT * FROM test_scenarios ORDER BY category, name")
    fun getAllScenarios(): Flow<List<TestScenarioEntity>>
    
    /**
     * Get scenarios by category
     * 
     * @param category Category to filter by
     */
    @Query("SELECT * FROM test_scenarios WHERE category = :category ORDER BY name")
    fun getScenariosByCategory(category: String): Flow<List<TestScenarioEntity>>
    
    /**
     * Get scenarios by status
     * 
     * @param status Status to filter by (ready, running, passed, failed)
     */
    @Query("SELECT * FROM test_scenarios WHERE status = :status ORDER BY name")
    fun getScenariosByStatus(status: String): Flow<List<TestScenarioEntity>>
    
    /**
     * Get a single scenario by ID
     * 
     * @param id Scenario ID
     */
    @Query("SELECT * FROM test_scenarios WHERE id = :id")
    fun getScenarioById(id: Long): Flow<TestScenarioEntity?>
    
    /**
     * Get scenario by ID (one-shot, not reactive)
     * 
     * @param id Scenario ID
     */
    @Query("SELECT * FROM test_scenarios WHERE id = :id")
    suspend fun getScenarioByIdSync(id: Long): TestScenarioEntity?
    
    /**
     * Search scenarios by name or description
     * 
     * @param query Search query
     */
    @Query("""
        SELECT * FROM test_scenarios 
        WHERE name LIKE '%' || :query || '%' 
        OR description LIKE '%' || :query || '%'
        ORDER BY name
    """)
    fun searchScenarios(query: String): Flow<List<TestScenarioEntity>>
    
    /**
     * Get scenario statistics
     */
    @Query("""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(test_count) as total_tests,
            SUM(estimated_duration) as total_duration
        FROM test_scenarios
    """)
    suspend fun getStatistics(): ScenarioStatistics
    
    /**
     * Insert a new scenario
     * 
     * @param scenario Scenario to insert
     * @return ID of inserted scenario
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertScenario(scenario: TestScenarioEntity): Long
    
    /**
     * Insert multiple scenarios
     * 
     * @param scenarios List of scenarios to insert
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertScenarios(scenarios: List<TestScenarioEntity>)
    
    /**
     * Update an existing scenario
     * 
     * @param scenario Scenario to update
     */
    @Update
    suspend fun updateScenario(scenario: TestScenarioEntity)
    
    /**
     * Update scenario status
     * 
     * @param id Scenario ID
     * @param status New status
     * @param timestamp Optional timestamp for last run
     */
    @Query("""
        UPDATE test_scenarios 
        SET status = :status, 
            last_run_timestamp = :timestamp,
            updated_at = :timestamp
        WHERE id = :id
    """)
    suspend fun updateScenarioStatus(id: Long, status: String, timestamp: Long = System.currentTimeMillis())
    
    /**
     * Increment success count
     * 
     * @param id Scenario ID
     */
    @Query("""
        UPDATE test_scenarios 
        SET success_count = success_count + 1,
            updated_at = :timestamp
        WHERE id = :id
    """)
    suspend fun incrementSuccessCount(id: Long, timestamp: Long = System.currentTimeMillis())
    
    /**
     * Increment failure count
     * 
     * @param id Scenario ID
     */
    @Query("""
        UPDATE test_scenarios 
        SET failure_count = failure_count + 1,
            updated_at = :timestamp
        WHERE id = :id
    """)
    suspend fun incrementFailureCount(id: Long, timestamp: Long = System.currentTimeMillis())
    
    /**
     * Delete a scenario
     * 
     * @param scenario Scenario to delete
     */
    @Delete
    suspend fun deleteScenario(scenario: TestScenarioEntity)
    
    /**
     * Delete all scenarios
     */
    @Query("DELETE FROM test_scenarios")
    suspend fun deleteAllScenarios()
    
    /**
     * Get count of scenarios
     */
    @Query("SELECT COUNT(*) FROM test_scenarios")
    suspend fun getCount(): Int
}

/**
 * Data class for scenario statistics
 */
data class ScenarioStatistics(
    val total: Int = 0,
    val passed: Int = 0,
    val failed: Int = 0,
    val total_tests: Int = 0,
    val total_duration: Long = 0L
)
