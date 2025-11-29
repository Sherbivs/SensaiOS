package com.infinitygauntlet.simulation.presentation.test

import com.infinitygauntlet.simulation.domain.models.TestScenario

/**
 * UI state for TestViewModel
 * Represents the complete state of the test execution screen
 */
data class TestUiState(
    val scenarios: List<TestScenario> = emptyList(),
    val isRunning: Boolean = false,
    val currentRunningScenario: TestScenario? = null,
    val progress: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null
) {
    /**
     * Calculate overall statistics from scenarios
     */
    val totalTests: Int
        get() = scenarios.sumOf { it.testCount }
    
    val completedScenarios: Int
        get() = scenarios.count { it.hasBeenExecuted }
    
    val passedScenarios: Int
        get() = scenarios.count { it.status == com.infinitygauntlet.simulation.domain.models.TestStatus.PASSED }
    
    val failedScenarios: Int
        get() = scenarios.count { it.status == com.infinitygauntlet.simulation.domain.models.TestStatus.FAILED }
    
    val overallPassRate: Float
        get() {
            if (scenarios.isEmpty()) return 0f
            val totalPassed = scenarios.sumOf { it.successCount }
            val totalTests = scenarios.sumOf { it.testCount }
            return if (totalTests > 0) {
                (totalPassed.toFloat() / totalTests.toFloat()) * 100f
            } else {
                0f
            }
        }
}
