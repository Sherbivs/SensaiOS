package com.infinitygauntlet.simulation.domain.models

/**
 * Domain Model: Test Result
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Represents a test execution result in the business logic layer.
 * Immutable data class for use in ViewModels and UI.
 * 
 * @property id Unique identifier
 * @property scenarioId Foreign key to parent scenario
 * @property scenarioName Name of the scenario (denormalized for convenience)
 * @property executionTimestamp When the test was executed
 * @property durationMs Execution duration in milliseconds
 * @property status Result status (passed, failed, error, skipped)
 * @property passedTests Number of passed individual tests
 * @property failedTests Number of failed individual tests
 * @property errorMessage Error message if status is ERROR or FAILED
 * @property details Additional details in JSON or text format
 */
data class TestResult(
    val id: Long = 0,
    val scenarioId: Long,
    val scenarioName: String = "",
    val executionTimestamp: Long = System.currentTimeMillis(),
    val durationMs: Long,
    val status: ResultStatus,
    val passedTests: Int = 0,
    val failedTests: Int = 0,
    val errorMessage: String? = null,
    val details: String? = null
) {
    /**
     * Calculate pass rate as percentage
     */
    val passRate: Float
        get() {
            val total = passedTests + failedTests
            return if (total == 0) 0f else (passedTests.toFloat() / total) * 100f
        }
    
    /**
     * Check if all tests passed
     */
    val allTestsPassed: Boolean
        get() = failedTests == 0 && passedTests > 0
    
    /**
     * Check if result indicates success
     */
    val isSuccess: Boolean
        get() = status == ResultStatus.PASSED
    
    /**
     * Format duration as human-readable string
     */
    fun formatDuration(): String {
        val seconds = durationMs / 1000
        val millis = durationMs % 1000
        return when {
            seconds < 1 -> "${millis}ms"
            seconds < 60 -> "${seconds}.${millis / 100}s"
            else -> "${seconds / 60}m ${seconds % 60}s"
        }
    }
    
    /**
     * Format execution timestamp as human-readable string
     */
    fun formatExecutionTime(): String {
        val formatter = java.text.SimpleDateFormat("MMM dd, yyyy HH:mm:ss", java.util.Locale.getDefault())
        return formatter.format(java.util.Date(executionTimestamp))
    }
    
    /**
     * Get status color for UI
     */
    fun getStatusColor(): String {
        return when (status) {
            ResultStatus.PASSED -> "#4CAF50"   // Green
            ResultStatus.FAILED -> "#F44336"   // Red
            ResultStatus.ERROR -> "#FF9800"    // Orange
            ResultStatus.SKIPPED -> "#9E9E9E"  // Gray
            ResultStatus.RUNNING -> "#2196F3"  // Blue
        }
    }
    
    /**
     * Get summary string
     */
    fun getSummary(): String {
        return "$passedTests passed, $failedTests failed in ${formatDuration()}"
    }
}

/**
 * Result Status Enum
 */
enum class ResultStatus {
    PASSED,
    FAILED,
    ERROR,
    SKIPPED,
    RUNNING;
    
    companion object {
        /**
         * Convert string to ResultStatus
         */
        fun fromString(value: String): ResultStatus {
            return try {
                valueOf(value.uppercase())
            } catch (e: IllegalArgumentException) {
                ERROR
            }
        }
    }
}
