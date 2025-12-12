package com.infinitygauntlet.simulation.presentation.test

import com.infinitygauntlet.simulation.domain.models.TestResult

/**
 * One-time events emitted by TestViewModel
 * These events are consumed once by the UI and do not persist in state
 */
sealed class TestUiEvent {
    /**
     * Test scenario execution completed
     */
    data class TestCompleted(
        val result: TestResult,
        val success: Boolean
    ) : TestUiEvent()
    
    /**
     * All scenarios execution completed
     */
    data class AllTestsCompleted(
        val totalScenarios: Int,
        val passedScenarios: Int,
        val failedScenarios: Int,
        val totalDuration: Long
    ) : TestUiEvent()
    
    /**
     * Error occurred during test execution
     */
    data class Error(
        val message: String,
        val scenarioId: Long? = null
    ) : TestUiEvent()
    
    /**
     * Success message to display
     */
    data class ShowMessage(
        val message: String
    ) : TestUiEvent()
    
    /**
     * Navigate to test result details
     */
    data class NavigateToResult(
        val resultId: Long,
        val scenarioName: String
    ) : TestUiEvent()
    
    /**
     * Progress update during bulk test execution
     */
    data class ProgressUpdate(
        val current: Int,
        val total: Int,
        val percentage: Int
    ) : TestUiEvent()
}
