package com.infinitygauntlet.simulation.presentation.test

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.domain.models.TestScenario
import com.infinitygauntlet.simulation.domain.models.TestStatus
import com.infinitygauntlet.simulation.domain.models.ResultStatus
import com.infinitygauntlet.simulation.domain.repository.TestResultRepository
import com.infinitygauntlet.simulation.domain.repository.TestScenarioRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

/**
 * ViewModel for MainActivity - Test Execution Screen
 * 
 * MIGRATED TO:
 * - Hilt dependency injection
 * - Repository pattern (no direct DAO access)
 * - MVI architecture (UiState + UiEvent)
 * - StateFlow (instead of LiveData)
 * - Database persistence (via repositories)
 * 
 * Features:
 * - Load test scenarios from database
 * - Execute individual test scenarios
 * - Execute all scenarios with progress tracking
 * - Persist test results to database
 * - Real-time statistics and pass rate calculation
 */
@HiltViewModel
class TestViewModel @Inject constructor(
    private val scenarioRepository: TestScenarioRepository,
    private val resultRepository: TestResultRepository
) : ViewModel() {
    
    // UI State - Single source of truth for test execution screen
    private val _uiState = MutableStateFlow(TestUiState())
    val uiState: StateFlow<TestUiState> = _uiState.asStateFlow()
    
    // One-time events for UI (navigation, toasts, dialogs)
    private val _events = MutableSharedFlow<TestUiEvent>()
    val events: SharedFlow<TestUiEvent> = _events.asSharedFlow()
    
    init {
        loadScenarios()
    }
    
    /**
     * Load all test scenarios from database
     * Automatically subscribes to Flow updates
     */
    fun loadScenarios() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            try {
                scenarioRepository.getAllScenarios()
                    .catch { error ->
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                error = "Failed to load scenarios: ${error.message}"
                            )
                        }
                        _events.emit(TestUiEvent.Error("Failed to load scenarios: ${error.message}"))
                    }
                    .collect { scenarios ->
                        _uiState.update { 
                            it.copy(
                                scenarios = scenarios,
                                isLoading = false,
                                error = null
                            )
                        }
                    }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = "Unexpected error: ${e.message}"
                    )
                }
                _events.emit(TestUiEvent.Error("Unexpected error: ${e.message}"))
            }
        }
    }
    
    /**
     * Execute a single test scenario
     * Updates scenario status and persists results to database
     */
    fun runScenario(scenario: TestScenario) {
        viewModelScope.launch {
            try {
                // Update UI state - scenario is running
                _uiState.update { 
                    it.copy(
                        isRunning = true,
                        currentRunningScenario = scenario,
                        error = null
                    )
                }
                
                // Update scenario status to RUNNING in database
                scenarioRepository.updateScenarioStatus(scenario.id, TestStatus.RUNNING)
                
                // Simulate test execution (replace with real test logic later)
                delay(scenario.estimatedDuration)
                
                // Generate test result
                val result = simulateTestResult(scenario)
                
                // Persist result to database
                val resultId = resultRepository.insertResult(result)
                
                // Update scenario with results
                val updatedScenario = scenario.copy(
                    status = if (result.status == ResultStatus.PASSED) TestStatus.PASSED else TestStatus.FAILED,
                    successCount = scenario.successCount + result.passedTests,
                    failureCount = scenario.failureCount + result.failedTests,
                    lastRunTimestamp = Instant.now().toEpochMilli()
                )
                scenarioRepository.updateScenario(updatedScenario)
                
                // Update UI state - execution complete
                _uiState.update { 
                    it.copy(
                        isRunning = false,
                        currentRunningScenario = null
                    )
                }
                
                // Emit completion event
                _events.emit(
                    TestUiEvent.TestCompleted(
                        result = result,
                        success = result.status == ResultStatus.PASSED
                    )
                )
                
                // Emit navigation event to view result details
                _events.emit(
                    TestUiEvent.NavigateToResult(
                        resultId = resultId,
                        scenarioName = scenario.name
                    )
                )
                
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isRunning = false,
                        currentRunningScenario = null,
                        error = "Test execution failed: ${e.message}"
                    )
                }
                _events.emit(TestUiEvent.Error("Test execution failed: ${e.message}", scenario.id))
            }
        }
    }
    
    /**
     * Execute all test scenarios sequentially
     * Updates progress and persists all results
     */
    fun runAllScenarios() {
        viewModelScope.launch {
            try {
                val scenarios = _uiState.value.scenarios
                if (scenarios.isEmpty()) {
                    _events.emit(TestUiEvent.Error("No scenarios to run"))
                    return@launch
                }
                
                // Initialize state for bulk execution
                _uiState.update { 
                    it.copy(
                        isRunning = true,
                        progress = 0,
                        error = null
                    )
                }
                
                var passedCount = 0
                var failedCount = 0
                var totalDuration = 0L
                
                scenarios.forEachIndexed { index, scenario ->
                    try {
                        // Update current running scenario
                        _uiState.update { it.copy(currentRunningScenario = scenario) }
                        
                        // Update scenario status to RUNNING
                        scenarioRepository.updateScenarioStatus(scenario.id, TestStatus.RUNNING)
                        
                        // Simulate test execution
                        delay(scenario.estimatedDuration)
                        
                        // Generate result
                        val result = simulateTestResult(scenario)
                        
                        // Persist result
                        resultRepository.insertResult(result)
                        
                        // Update scenario with results
                        val updatedScenario = scenario.copy(
                            status = if (result.status == ResultStatus.PASSED) TestStatus.PASSED else TestStatus.FAILED,
                            successCount = scenario.successCount + result.passedTests,
                            failureCount = scenario.failureCount + result.failedTests,
                            lastRunTimestamp = Instant.now().toEpochMilli()
                        )
                        scenarioRepository.updateScenario(updatedScenario)
                        
                        // Track statistics
                        if (result.status == ResultStatus.PASSED) passedCount++ else failedCount++
                        totalDuration += result.durationMs
                        
                        // Update progress
                        val percentage = ((index + 1) * 100) / scenarios.size
                        _uiState.update { it.copy(progress = percentage) }
                        
                        // Emit progress event
                        _events.emit(
                            TestUiEvent.ProgressUpdate(
                                current = index + 1,
                                total = scenarios.size,
                                percentage = percentage
                            )
                        )
                        
                    } catch (e: Exception) {
                        // Log error but continue with other scenarios
                        _events.emit(
                            TestUiEvent.Error(
                                "Failed to run ${scenario.name}: ${e.message}",
                                scenario.id
                            )
                        )
                        failedCount++
                    }
                }
                
                // Execution complete
                _uiState.update { 
                    it.copy(
                        isRunning = false,
                        currentRunningScenario = null,
                        progress = 100
                    )
                }
                
                // Emit completion event
                _events.emit(
                    TestUiEvent.AllTestsCompleted(
                        totalScenarios = scenarios.size,
                        passedScenarios = passedCount,
                        failedScenarios = failedCount,
                        totalDuration = totalDuration
                    )
                )
                
                _events.emit(
                    TestUiEvent.ShowMessage(
                        "All tests completed! Passed: $passedCount, Failed: $failedCount"
                    )
                )
                
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isRunning = false,
                        currentRunningScenario = null,
                        error = "Bulk execution failed: ${e.message}"
                    )
                }
                _events.emit(TestUiEvent.Error("Bulk execution failed: ${e.message}"))
            }
        }
    }
    
    /**
     * Stop currently running test execution
     */
    fun stopExecution() {
        viewModelScope.launch {
            val currentScenario = _uiState.value.currentRunningScenario
            if (currentScenario != null) {
                // Reset scenario status back to READY
                scenarioRepository.updateScenarioStatus(currentScenario.id, TestStatus.READY)
            }
            
            _uiState.update { 
                it.copy(
                    isRunning = false,
                    currentRunningScenario = null,
                    progress = 0
                )
            }
            
            _events.emit(TestUiEvent.ShowMessage("Test execution stopped"))
        }
    }
    
    /**
     * Reset all scenarios to READY status
     * Clears execution history
     */
    fun resetAllScenarios() {
        viewModelScope.launch {
            try {
                val scenarios = _uiState.value.scenarios
                scenarios.forEach { scenario ->
                    val resetScenario = scenario.copy(
                        status = TestStatus.READY,
                        successCount = 0,
                        failureCount = 0,
                        lastRunTimestamp = 0
                    )
                    scenarioRepository.updateScenario(resetScenario)
                }
                
                _events.emit(TestUiEvent.ShowMessage("All scenarios reset"))
            } catch (e: Exception) {
                _events.emit(TestUiEvent.Error("Failed to reset scenarios: ${e.message}"))
            }
        }
    }
    
    /**
     * Get statistics for a specific scenario
     * Returns historical pass rate and execution count
     */
    fun getScenarioStatistics(scenarioId: Long) {
        viewModelScope.launch {
            try {
                val stats = resultRepository.getScenarioStatistics(scenarioId)
                _events.emit(
                    TestUiEvent.ShowMessage(
                        "Executed ${stats.totalExecutions} times, Pass rate: ${String.format("%.1f", stats.passRate)}%"
                    )
                )
            } catch (e: Exception) {
                _events.emit(TestUiEvent.Error("Failed to get statistics: ${e.message}"))
            }
        }
    }
    
    /**
     * Simulate test result generation
     * TODO: Replace with real test execution logic
     */
    private fun simulateTestResult(scenario: TestScenario): TestResult {
        // Simulate realistic pass/fail rates (95% pass rate)
        val passRate = 0.95
        val passedTests = (scenario.testCount * passRate).toInt()
        val failedTests = scenario.testCount - passedTests
        
        return TestResult(
            id = 0, // Auto-generated by database
            scenarioId = scenario.id,
            scenarioName = scenario.name,
            executionTimestamp = Instant.now().toEpochMilli(),
            durationMs = scenario.estimatedDuration,
            status = if (failedTests == 0) ResultStatus.PASSED else ResultStatus.FAILED,
            passedTests = passedTests,
            failedTests = failedTests,
            errorMessage = if (failedTests > 0) "Some tests failed (simulated)" else null
        )
    }
    
    /**
     * Clear error message from UI state
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
