package com.infinitygauntlet.simulation.viewmodels

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infinitygauntlet.simulation.models.TestResult
import com.infinitygauntlet.simulation.models.TestScenario
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * ViewModel for MainActivity
 * Manages test scenario state and execution
 */
class TestViewModel : ViewModel() {
    
    private val _scenarios = MutableLiveData<List<TestScenario>>()
    val scenarios: LiveData<List<TestScenario>> = _scenarios
    
    private val _testResults = MutableLiveData<TestResult>()
    val testResults: LiveData<TestResult> = _testResults
    
    private val _isRunning = MutableLiveData<Boolean>(false)
    val isRunning: LiveData<Boolean> = _isRunning
    
    private val _progress = MutableLiveData<Int>(0)
    val progress: LiveData<Int> = _progress
    
    fun loadScenarios() {
        _scenarios.value = TestScenario.createSampleScenarios()
    }
    
    fun runScenario(scenario: TestScenario) {
        viewModelScope.launch {
            _isRunning.value = true
            
            // Update scenario status
            updateScenarioStatus(scenario.id, TestScenario.TestStatus.RUNNING)
            
            // Simulate test execution
            delay(scenario.estimatedDuration)
            
            // Generate result
            val result = simulateTestResult(scenario)
            _testResults.value = result
            
            // Update scenario with results
            updateScenarioWithResults(scenario.id, result)
            
            _isRunning.value = false
        }
    }
    
    fun runAllScenarios() {
        viewModelScope.launch {
            _isRunning.value = true
            _progress.value = 0
            
            val scenarioList = _scenarios.value ?: emptyList()
            val totalScenarios = scenarioList.size
            
            scenarioList.forEachIndexed { index, scenario ->
                // Update scenario status
                updateScenarioStatus(scenario.id, TestScenario.TestStatus.RUNNING)
                
                // Simulate test execution
                delay(scenario.estimatedDuration)
                
                // Generate result
                val result = simulateTestResult(scenario)
                
                // Update scenario with results
                updateScenarioWithResults(scenario.id, result)
                
                // Update progress
                _progress.value = ((index + 1) * 100) / totalScenarios
            }
            
            // Generate summary result
            val summaryResult = generateSummaryResult(scenarioList)
            _testResults.value = summaryResult
            
            _isRunning.value = false
            _progress.value = 100
        }
    }
    
    private fun updateScenarioStatus(scenarioId: String, status: TestScenario.TestStatus) {
        val currentScenarios = _scenarios.value?.toMutableList() ?: return
        val index = currentScenarios.indexOfFirst { it.id == scenarioId }
        if (index != -1) {
            currentScenarios[index] = currentScenarios[index].copy(status = status)
            _scenarios.value = currentScenarios
        }
    }
    
    private fun updateScenarioWithResults(scenarioId: String, result: TestResult) {
        val currentScenarios = _scenarios.value?.toMutableList() ?: return
        val index = currentScenarios.indexOfFirst { it.id == scenarioId }
        if (index != -1) {
            val scenario = currentScenarios[index]
            currentScenarios[index] = scenario.copy(
                status = if (result.failed == 0) TestScenario.TestStatus.PASSED else TestScenario.TestStatus.FAILED,
                passedTests = result.passed,
                failedTests = result.failed,
                skippedTests = result.skipped
            )
            _scenarios.value = currentScenarios
        }
    }
    
    private fun simulateTestResult(scenario: TestScenario): TestResult {
        // Simulate realistic pass/fail rates
        val passRate = 0.95 // 95% pass rate
        val passed = (scenario.testCount * passRate).toInt()
        val failed = scenario.testCount - passed
        
        return TestResult(
            scenarioId = scenario.id,
            scenarioName = scenario.name,
            passed = passed,
            failed = failed,
            skipped = 0,
            duration = scenario.estimatedDuration,
            failureDetails = if (failed > 0) {
                List(failed) { index ->
                    TestResult.TestFailure(
                        testName = "Test ${index + 1} in ${scenario.name}",
                        expectedValue = "Expected value",
                        actualValue = "Actual value",
                        errorMessage = "Simulated failure for testing"
                    )
                }
            } else {
                emptyList()
            }
        )
    }
    
    private fun generateSummaryResult(scenarios: List<TestScenario>): TestResult {
        val totalPassed = scenarios.sumOf { it.passedTests }
        val totalFailed = scenarios.sumOf { it.failedTests }
        val totalSkipped = scenarios.sumOf { it.skippedTests }
        val totalDuration = scenarios.sumOf { it.estimatedDuration }
        
        return TestResult(
            scenarioId = "all",
            scenarioName = "All Tests",
            passed = totalPassed,
            failed = totalFailed,
            skipped = totalSkipped,
            duration = totalDuration
        )
    }
}
