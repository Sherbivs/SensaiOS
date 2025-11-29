package com.infinitygauntlet.simulation.domain.models

/**
 * Domain Model: Test Scenario
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Represents a test scenario in the business logic layer.
 * Immutable data class for use in ViewModels and UI.
 * Separated from database Entity for clean architecture.
 * 
 * @property id Unique identifier
 * @property name Scenario name
 * @property description Detailed description
 * @property category Category/group (e.g., "Performance", "Functional")
 * @property testCount Number of tests in scenario
 * @property estimatedDuration Estimated execution time in milliseconds
 * @property status Current status (ready, running, passed, failed)
 * @property lastRunTimestamp When scenario was last executed (0 if never run)
 * @property successCount Number of successful executions
 * @property failureCount Number of failed executions
 * @property createdAt Creation timestamp
 * @property updatedAt Last update timestamp
 */
data class TestScenario(
    val id: Long = 0,
    val name: String,
    val description: String,
    val category: String,
    val testCount: Int = 0,
    val estimatedDuration: Long = 0,
    val status: TestStatus = TestStatus.READY,
    val lastRunTimestamp: Long = 0,
    val successCount: Int = 0,
    val failureCount: Int = 0,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
) {
    /**
     * Calculate success rate as percentage
     */
    val successRate: Float
        get() {
            val total = successCount + failureCount
            return if (total == 0) 0f else (successCount.toFloat() / total) * 100f
        }
    
    /**
     * Check if scenario has been executed
     */
    val hasBeenExecuted: Boolean
        get() = lastRunTimestamp > 0
    
    /**
     * Check if scenario is currently running
     */
    val isRunning: Boolean
        get() = status == TestStatus.RUNNING
    
    /**
     * Format estimated duration as human-readable string
     */
    fun formatEstimatedDuration(): String {
        val seconds = estimatedDuration / 1000
        return when {
            seconds < 60 -> "${seconds}s"
            seconds < 3600 -> "${seconds / 60}m ${seconds % 60}s"
            else -> "${seconds / 3600}h ${(seconds % 3600) / 60}m"
        }
    }
    
    /**
     * Get display status color
     */
    fun getStatusColor(): String {
        return when (status) {
            TestStatus.READY -> "#808080"      // Gray
            TestStatus.RUNNING -> "#2196F3"    // Blue
            TestStatus.PASSED -> "#4CAF50"     // Green
            TestStatus.FAILED -> "#F44336"     // Red
        }
    }
}

/**
 * Test Status Enum
 */
enum class TestStatus {
    READY,
    RUNNING,
    PASSED,
    FAILED;
    
    companion object {
        /**
         * Convert string to TestStatus
         */
        fun fromString(value: String): TestStatus {
            return try {
                valueOf(value.uppercase())
            } catch (e: IllegalArgumentException) {
                READY
            }
        }
    }
}
