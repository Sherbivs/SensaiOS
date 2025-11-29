package com.infinitygauntlet.simulation.domain.repository

import com.infinitygauntlet.simulation.domain.models.TestScenario
import com.infinitygauntlet.simulation.domain.models.TestStatus
import kotlinx.coroutines.flow.Flow

/**
 * Repository Interface: Test Scenario
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Defines the contract for test scenario data operations.
 * Domain layer interface - implemented in data layer.
 * Used by ViewModels and use cases for data access.
 * 
 * All methods return Flow for reactive data or suspend for one-shot operations.
 */
interface TestScenarioRepository {
    
    /**
     * Get all test scenarios as reactive Flow
     * UI updates automatically when data changes
     */
    fun getAllScenarios(): Flow<List<TestScenario>>
    
    /**
     * Get scenarios by category
     * 
     * @param category Category to filter by
     */
    fun getScenariosByCategory(category: String): Flow<List<TestScenario>>
    
    /**
     * Get scenarios by status
     * 
     * @param status Status to filter by
     */
    fun getScenariosByStatus(status: TestStatus): Flow<List<TestScenario>>
    
    /**
     * Get a single scenario by ID
     * 
     * @param id Scenario ID
     */
    fun getScenarioById(id: Long): Flow<TestScenario?>
    
    /**
     * Search scenarios by name or description
     * 
     * @param query Search query
     */
    fun searchScenarios(query: String): Flow<List<TestScenario>>
    
    /**
     * Get scenario statistics
     * 
     * @return Statistics summary (total, passed, failed, etc.)
     */
    suspend fun getStatistics(): ScenarioStatistics
    
    /**
     * Insert a new scenario
     * 
     * @param scenario Scenario to insert
     * @return ID of inserted scenario
     */
    suspend fun insertScenario(scenario: TestScenario): Long
    
    /**
     * Insert multiple scenarios
     * 
     * @param scenarios List of scenarios to insert
     */
    suspend fun insertScenarios(scenarios: List<TestScenario>)
    
    /**
     * Update an existing scenario
     * 
     * @param scenario Scenario to update
     */
    suspend fun updateScenario(scenario: TestScenario)
    
    /**
     * Update scenario status
     * 
     * @param id Scenario ID
     * @param status New status
     */
    suspend fun updateScenarioStatus(id: Long, status: TestStatus)
    
    /**
     * Increment success count
     * 
     * @param id Scenario ID
     */
    suspend fun incrementSuccessCount(id: Long)
    
    /**
     * Increment failure count
     * 
     * @param id Scenario ID
     */
    suspend fun incrementFailureCount(id: Long)
    
    /**
     * Delete a scenario
     * 
     * @param scenario Scenario to delete
     */
    suspend fun deleteScenario(scenario: TestScenario)
    
    /**
     * Delete all scenarios
     */
    suspend fun deleteAllScenarios()
    
    /**
     * Get count of scenarios
     */
    suspend fun getCount(): Int
}

/**
 * Scenario Statistics Data Class
 */
data class ScenarioStatistics(
    val total: Int = 0,
    val passed: Int = 0,
    val failed: Int = 0,
    val totalTests: Int = 0,
    val totalDuration: Long = 0L
)
