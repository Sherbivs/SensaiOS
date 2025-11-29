package com.infinitygauntlet.simulation.utils

import com.infinitygauntlet.simulation.models.TestResult
import com.infinitygauntlet.simulation.models.TestScenario
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.*
import kotlin.random.Random

/**
 * Core test execution engine for Android simulation.
 * 
 * Features:
 * - Sequential and parallel test execution
 * - Real-time progress tracking
 * - Timeout handling
 * - Retry logic for flaky tests
 * - Resource cleanup
 * - Performance metrics collection
 * 
 * Usage:
 * ```kotlin
 * val runner = TestRunner()
 * val results = runner.runTests(scenarios)
 * ```
 */
class TestRunner {

    companion object {
        private const val DEFAULT_TIMEOUT_MS = 30000L // 30 seconds
        private const val MAX_RETRIES = 2
    }

    private val _isRunning = MutableStateFlow(false)
    val isRunning: StateFlow<Boolean> = _isRunning.asStateFlow()
    
    private val _currentTest = MutableStateFlow<String?>(null)
    val currentTest: StateFlow<String?> = _currentTest.asStateFlow()
    
    private val _progress = MutableStateFlow(TestProgress())
    val progress: StateFlow<TestProgress> = _progress.asStateFlow()

    /**
     * Run all test scenarios sequentially.
     * 
     * @param scenarios List of test scenarios to execute
     * @param config Optional test configuration
     * @return List of test results
     */
    suspend fun runTests(
        scenarios: List<TestScenario>,
        config: TestConfig = TestConfig()
    ): List<TestResult> = coroutineScope {
        _isRunning.value = true
        _progress.value = TestProgress(totalTests = scenarios.size)
        
        val results = mutableListOf<TestResult>()
        
        try {
            scenarios.forEachIndexed { index, scenario ->
                _currentTest.value = scenario.name
                _progress.value = _progress.value.copy(
                    completedTests = index,
                    currentTestName = scenario.name
                )
                
                val result = runSingleTest(scenario, config)
                results.add(result)
                
                // Update progress
                _progress.value = _progress.value.copy(
                    completedTests = index + 1,
                    passedTests = results.count { it.status == "passed" },
                    failedTests = results.count { it.status == "failed" }
                )
            }
        } finally {
            _isRunning.value = false
            _currentTest.value = null
        }
        
        results
    }

    /**
     * Run test scenarios in parallel.
     * 
     * @param scenarios List of test scenarios to execute
     * @param config Optional test configuration
     * @param concurrency Maximum number of concurrent tests
     * @return List of test results
     */
    suspend fun runTestsParallel(
        scenarios: List<TestScenario>,
        config: TestConfig = TestConfig(),
        concurrency: Int = 4
    ): List<TestResult> = coroutineScope {
        _isRunning.value = true
        _progress.value = TestProgress(totalTests = scenarios.size)
        
        val results = try {
            scenarios.chunked(concurrency).flatMap { chunk ->
                chunk.map { scenario ->
                    async {
                        _currentTest.value = scenario.name
                        runSingleTest(scenario, config)
                    }
                }.awaitAll()
            }
        } finally {
            _isRunning.value = false
            _currentTest.value = null
        }
        
        results
    }

    /**
     * Run a single test scenario with retry logic.
     * 
     * @param scenario Test scenario to execute
     * @param config Test configuration
     * @return Test result
     */
    private suspend fun runSingleTest(
        scenario: TestScenario,
        config: TestConfig
    ): TestResult {
        var lastException: Exception? = null
        val maxAttempts = if (config.retryFlaky) MAX_RETRIES + 1 else 1
        
        repeat(maxAttempts) { attempt ->
            try {
                return executeTest(scenario, config)
            } catch (e: TimeoutCancellationException) {
                lastException = e
                if (attempt < maxAttempts - 1) {
                    delay(config.retryDelayMs)
                }
            } catch (e: Exception) {
                lastException = e
                // Don't retry on non-timeout exceptions
                break
            }
        }
        
        // All attempts failed, return failure result
        return createFailureResult(
            scenario,
            lastException ?: Exception("Unknown error")
        )
    }

    /**
     * Execute a single test scenario.
     * 
     * @param scenario Test scenario to execute
     * @param config Test configuration
     * @return Test result
     */
    private suspend fun executeTest(
        scenario: TestScenario,
        config: TestConfig
    ): TestResult = withContext(Dispatchers.Default) {
        val startTime = System.currentTimeMillis()
        
        try {
            // Apply timeout
            withTimeout(config.timeoutMs) {
                // Simulate test execution
                when (scenario.category) {
                    TestScenario.TestCategory.ONBOARDING -> executeOnboardingTest(scenario)
                    TestScenario.TestCategory.WILD_ENCOUNTERS -> executeWildEncounterTest(scenario)
                    TestScenario.TestCategory.BATTLE_SYSTEM -> executeBattleTest(scenario)
                    TestScenario.TestCategory.AI_VALIDATION -> executeAITest(scenario)
                    TestScenario.TestCategory.STRESS_TEST -> executeStressTest(scenario)
                }
                
                // Simulate test duration
                delay(scenario.expectedDurationMs)
                
                // Determine outcome based on scenario pass rate
                val passed = Random.nextDouble() < (scenario.passRate / 100.0)
                
                TestResult(
                    id = UUID.randomUUID().toString(),
                    testName = scenario.name,
                    status = if (passed) "passed" else "failed",
                    durationMs = System.currentTimeMillis() - startTime,
                    timestamp = startTime,
                    failureReason = if (!passed) {
                        TestResult.TestFailure(
                            message = "Test assertion failed: Expected success, got failure",
                            stackTrace = generateStackTrace(scenario),
                            line = Random.nextInt(1, 100),
                            column = Random.nextInt(1, 80)
                        )
                    } else null
                )
            }
        } catch (e: TimeoutCancellationException) {
            createTimeoutResult(scenario, config.timeoutMs, startTime)
        } catch (e: Exception) {
            createFailureResult(scenario, e, startTime)
        }
    }

    /**
     * Execute onboarding test scenario.
     */
    private suspend fun executeOnboardingTest(scenario: TestScenario) {
        delay(100)
        // Simulate starter selection, profile creation, tutorial steps
    }

    /**
     * Execute wild encounter test scenario.
     */
    private suspend fun executeWildEncounterTest(scenario: TestScenario) {
        delay(150)
        // Simulate walking, Pokémon spawns, catch attempts
    }

    /**
     * Execute battle system test scenario.
     */
    private suspend fun executeBattleTest(scenario: TestScenario) {
        delay(200)
        // Simulate move selection, damage calculation, turn resolution
    }

    /**
     * Execute AI validation test scenario.
     */
    private suspend fun executeAITest(scenario: TestScenario) {
        delay(250)
        // Simulate AI decision-making, strategy validation
    }

    /**
     * Execute stress test scenario.
     */
    private suspend fun executeStressTest(scenario: TestScenario) {
        delay(300)
        // Simulate high-load conditions, resource limits
    }

    /**
     * Create a timeout test result.
     */
    private fun createTimeoutResult(
        scenario: TestScenario,
        timeoutMs: Long,
        startTime: Long
    ): TestResult {
        return TestResult(
            id = UUID.randomUUID().toString(),
            testName = scenario.name,
            status = "failed",
            durationMs = System.currentTimeMillis() - startTime,
            timestamp = startTime,
            failureReason = TestResult.TestFailure(
                message = "Test timed out after ${timeoutMs}ms",
                stackTrace = "at TestRunner.executeTest()\nat kotlinx.coroutines.withTimeout()",
                line = 0,
                column = 0
            )
        )
    }

    /**
     * Create a failure test result.
     */
    private fun createFailureResult(
        scenario: TestScenario,
        exception: Exception,
        startTime: Long = System.currentTimeMillis()
    ): TestResult {
        return TestResult(
            id = UUID.randomUUID().toString(),
            testName = scenario.name,
            status = "failed",
            durationMs = System.currentTimeMillis() - startTime,
            timestamp = startTime,
            failureReason = TestResult.TestFailure(
                message = exception.message ?: "Unknown error",
                stackTrace = exception.stackTraceToString(),
                line = 0,
                column = 0
            )
        )
    }

    /**
     * Generate simulated stack trace.
     */
    private fun generateStackTrace(scenario: TestScenario): String {
        return buildString {
            appendLine("at TestRunner.execute(TestRunner.kt:${Random.nextInt(50, 150)})")
            appendLine("at ${scenario.category}.run(${scenario.category}.kt:${Random.nextInt(20, 80)})")
            appendLine("at kotlinx.coroutines.intrinsics.undispatched()")
        }
    }

    /**
     * Test configuration options.
     */
    data class TestConfig(
        val timeoutMs: Long = DEFAULT_TIMEOUT_MS,
        val retryFlaky: Boolean = true,
        val retryDelayMs: Long = 1000L,
        val failFast: Boolean = false,
        val collectMetrics: Boolean = true
    )

    /**
     * Test execution progress.
     */
    data class TestProgress(
        val totalTests: Int = 0,
        val completedTests: Int = 0,
        val passedTests: Int = 0,
        val failedTests: Int = 0,
        val currentTestName: String = ""
    ) {
        val percentComplete: Int
            get() = if (totalTests > 0) (completedTests * 100) / totalTests else 0
        
        val passRate: Double
            get() = if (completedTests > 0) (passedTests.toDouble() / completedTests) * 100.0 else 0.0
    }
}
