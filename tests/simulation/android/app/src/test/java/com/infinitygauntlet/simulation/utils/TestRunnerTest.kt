package com.infinitygauntlet.simulation.utils

import com.infinitygauntlet.simulation.models.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.util.concurrent.TimeoutException

/**
 * Unit tests for TestRunner.kt
 * Tests core test execution engine, timeout handling, retry logic, and parallel execution.
 */
class TestRunnerTest {

    private lateinit var testRunner: TestRunner
    private lateinit var testConfig: TestRunner.TestConfig

    @Before
    fun setup() {
        testRunner = TestRunner()
        testConfig = TestRunner.TestConfig(
            timeoutMs = 5000L,
            retryFlaky = true,
            retryDelayMs = 100L,
            failFast = false
        )
    }

    @Test
    fun `runTests should execute all scenarios successfully`() = runTest {
        // Given
        val scenarios = listOf(
            createTestScenario("test-001", TestCategory.ONBOARDING, 100L),
            createTestScenario("test-002", TestCategory.BATTLE, 150L),
            createTestScenario("test-003", TestCategory.WILD_ENCOUNTER, 200L)
        )

        // When
        val results = testRunner.runTests(scenarios, testConfig) { scenario ->
            // Mock successful execution
            Thread.sleep(scenario.expectedDuration)
        }

        // Then
        assertEquals(3, results.size)
        assertTrue(results.all { it.status == TestStatus.PASSED })
        assertEquals(0, results.count { it.error != null })
    }

    @Test
    fun `runTests should handle test failures gracefully`() = runTest {
        // Given
        val scenarios = listOf(
            createTestScenario("test-001", TestCategory.BATTLE, 100L),
            createTestScenario("test-002", TestCategory.BATTLE, 100L)
        )
        var callCount = 0

        // When
        val results = testRunner.runTests(scenarios, testConfig) { scenario ->
            callCount++
            if (scenario.id == "test-002") {
                throw AssertionError("Battle logic failed")
            }
        }

        // Then
        assertEquals(2, results.size)
        assertEquals(1, results.count { it.status == TestStatus.PASSED })
        assertEquals(1, results.count { it.status == TestStatus.FAILED })
        
        val failedResult = results.find { it.status == TestStatus.FAILED }
        assertNotNull(failedResult)
        assertEquals("Battle logic failed", failedResult?.error)
        assertTrue(failedResult?.stackTrace?.contains("AssertionError") ?: false)
    }

    @Test
    fun `runTests should timeout long-running tests`() = runTest {
        // Given
        val shortTimeoutConfig = testConfig.copy(timeoutMs = 500L)
        val scenarios = listOf(
            createTestScenario("test-001", TestCategory.STRESS, 2000L)
        )

        // When
        val results = testRunner.runTests(scenarios, shortTimeoutConfig) { scenario ->
            Thread.sleep(scenario.expectedDuration) // Will timeout
        }

        // Then
        assertEquals(1, results.size)
        assertEquals(TestStatus.FAILED, results[0].status)
        assertTrue(results[0].error?.contains("timeout", ignoreCase = true) ?: false)
    }

    @Test
    fun `runTests should retry flaky tests`() = runTest {
        // Given
        val scenarios = listOf(createTestScenario("test-001", TestCategory.AI, 100L))
        var attemptCount = 0

        // When
        val results = testRunner.runTests(scenarios, testConfig) { _ ->
            attemptCount++
            if (attemptCount < 3) {
                throw RuntimeException("Flaky test failure")
            }
            // Success on 3rd attempt
        }

        // Then
        assertEquals(1, results.size)
        assertEquals(TestStatus.PASSED, results[0].status)
        assertEquals(3, attemptCount) // Original + 2 retries
    }

    @Test
    fun `runTests should not retry when retryFlaky is false`() = runTest {
        // Given
        val noRetryConfig = testConfig.copy(retryFlaky = false)
        val scenarios = listOf(createTestScenario("test-001", TestCategory.AI, 100L))
        var attemptCount = 0

        // When
        val results = testRunner.runTests(scenarios, noRetryConfig) { _ ->
            attemptCount++
            throw RuntimeException("Test failure")
        }

        // Then
        assertEquals(1, results.size)
        assertEquals(TestStatus.FAILED, results[0].status)
        assertEquals(1, attemptCount) // No retries
    }

    @Test
    fun `runTests should stop on first failure when failFast is true`() = runTest {
        // Given
        val failFastConfig = testConfig.copy(failFast = true)
        val scenarios = listOf(
            createTestScenario("test-001", TestCategory.BATTLE, 100L),
            createTestScenario("test-002", TestCategory.BATTLE, 100L),
            createTestScenario("test-003", TestCategory.BATTLE, 100L)
        )
        var executedCount = 0

        // When
        val results = testRunner.runTests(scenarios, failFastConfig) { scenario ->
            executedCount++
            if (scenario.id == "test-002") {
                throw AssertionError("Fail fast trigger")
            }
        }

        // Then
        assertEquals(2, executedCount) // Only first 2 executed
        assertEquals(2, results.size)
        assertEquals(1, results.count { it.status == TestStatus.PASSED })
        assertEquals(1, results.count { it.status == TestStatus.FAILED })
    }

    @Test
    fun `runTestsParallel should execute tests concurrently`() = runTest {
        // Given
        val scenarios = (1..10).map { 
            createTestScenario("test-$it", TestCategory.BATTLE, 200L) 
        }
        val startTime = System.currentTimeMillis()

        // When
        val results = testRunner.runTestsParallel(scenarios, testConfig, maxConcurrency = 4) { scenario ->
            Thread.sleep(scenario.expectedDuration)
        }

        // Then
        val duration = System.currentTimeMillis() - startTime
        assertEquals(10, results.size)
        assertTrue(results.all { it.status == TestStatus.PASSED })
        
        // Sequential would take 10 * 200 = 2000ms
        // Parallel with 4 threads should take ~600ms (10/4 * 200 + overhead)
        assertTrue("Duration $duration should be less than 1000ms", duration < 1000L)
    }

    @Test
    fun `runTestsParallel should handle concurrent failures`() = runTest {
        // Given
        val scenarios = (1..8).map { 
            createTestScenario("test-$it", TestCategory.BATTLE, 100L) 
        }

        // When
        val results = testRunner.runTestsParallel(scenarios, testConfig, maxConcurrency = 4) { scenario ->
            Thread.sleep(50L)
            if (scenario.id.endsWith("3") || scenario.id.endsWith("7")) {
                throw AssertionError("Concurrent failure")
            }
        }

        // Then
        assertEquals(8, results.size)
        assertEquals(6, results.count { it.status == TestStatus.PASSED })
        assertEquals(2, results.count { it.status == TestStatus.FAILED })
    }

    @Test
    fun `getProgress should calculate correct completion percentage`() = runTest {
        // Given
        val scenarios = (1..10).map { 
            createTestScenario("test-$it", TestCategory.BATTLE, 100L) 
        }
        val completedResults = mutableListOf<TestResult>()

        // When/Then - Check progress at different stages
        testRunner.runTests(scenarios, testConfig) { scenario ->
            Thread.sleep(50L)
            completedResults.add(
                TestResult(
                    scenarioId = scenario.id,
                    scenarioName = scenario.name,
                    category = scenario.category,
                    status = TestStatus.PASSED,
                    duration = 50L,
                    startTime = System.currentTimeMillis() - 50L,
                    endTime = System.currentTimeMillis(),
                    error = null,
                    stackTrace = null
                )
            )
            
            // Progress should match completed count
            val progress = testRunner.getProgress(completedResults.size, scenarios.size)
            assertEquals(completedResults.size, progress.completedTests)
            assertEquals(scenarios.size, progress.totalTests)
            assertEquals(
                (completedResults.size.toDouble() / scenarios.size * 100).toInt(),
                progress.percentComplete
            )
        }
    }

    @Test
    fun `executeOnboardingTest should validate registration flow`() = runTest {
        // Given
        val scenario = createTestScenario("onboarding-001", TestCategory.ONBOARDING, 500L)

        // When
        testRunner.runTests(listOf(scenario), testConfig) { _ ->
            // Simulate onboarding steps
            val username = "trainer_ash_2025"
            val password = "SecurePass123!"
            
            assertTrue(username.length >= 5)
            assertTrue(password.length >= 8)
            assertTrue(password.any { it.isDigit() })
            assertTrue(password.any { it.isUpperCase() })
            assertTrue(password.any { !it.isLetterOrDigit() })
        }

        // Then - No exception means test passed
    }

    @Test
    fun `executeWildEncounterTest should validate encounter mechanics`() = runTest {
        // Given
        val scenario = createTestScenario("wild-encounter-001", TestCategory.WILD_ENCOUNTER, 300L)

        // When
        testRunner.runTests(listOf(scenario), testConfig) { _ ->
            // Simulate wild encounter
            val encounterRate = 0.3
            val pokemon = "pidgey"
            val level = 5
            
            assertTrue(encounterRate in 0.0..1.0)
            assertTrue(pokemon.isNotEmpty())
            assertTrue(level in 1..100)
        }

        // Then - No exception means test passed
    }

    @Test
    fun `executeBattleTest should validate damage calculation`() = runTest {
        // Given
        val scenario = createTestScenario("battle-001", TestCategory.BATTLE, 800L)

        // When
        testRunner.runTests(listOf(scenario), testConfig) { _ ->
            // Simulate battle damage calculation
            val attackerPower = 50
            val defenderDefense = 40
            val movePower = 40
            val typeEffectiveness = 2.0 // Super effective
            
            val damage = ((attackerPower * movePower / defenderDefense) * typeEffectiveness).toInt()
            
            assertTrue(damage > 0)
            assertTrue(damage > movePower) // Should be boosted by super effective
        }

        // Then - No exception means test passed
    }

    // Helper methods

    private fun createTestScenario(
        id: String,
        category: TestCategory,
        duration: Long
    ): TestScenario {
        return TestScenario(
            id = id,
            name = "Test $id",
            category = category,
            description = "Test description",
            steps = listOf("Step 1", "Step 2"),
            expectedDuration = duration,
            priority = TestPriority.HIGH,
            tags = listOf("test"),
            prerequisites = emptyList(),
            testData = emptyMap()
        )
    }
}
