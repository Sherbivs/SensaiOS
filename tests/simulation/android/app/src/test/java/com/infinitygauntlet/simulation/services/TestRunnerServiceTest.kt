package com.infinitygauntlet.simulation.services

import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.infinitygauntlet.simulation.domain.models.*
import com.infinitygauntlet.simulation.repositories.TestScenarioRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for TestRunnerService
 * Tests background test execution, foreground notifications, pause/resume/cancel controls,
 * progress updates via StateFlow, and service lifecycle.
 */
@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class TestRunnerServiceTest {

    private val testDispatcher = StandardTestDispatcher()

    @Mock
    private lateinit var mockRepository: TestScenarioRepository

    @Mock
    private lateinit var mockNotificationManager: NotificationManager

    private lateinit var context: Context
    private lateinit var service: TestRunnerService

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        
        context = ApplicationProvider.getApplicationContext()
        
        // Mock repository responses
        `when`(mockRepository.getScenarios()).thenReturn(createSampleScenarios())
        
        service = TestRunnerService()
        service.repository = mockRepository
        service.notificationManager = mockNotificationManager
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `service should start in foreground mode`() = runTest {
        // When
        service.startForegroundService()
        advanceUntilIdle()

        // Then
        assertTrue(service.isForeground)
        verify(mockNotificationManager).notify(eq(TestRunnerService.NOTIFICATION_ID), any())
    }

    @Test
    fun `runTests should execute all scenarios`() = runTest {
        // Given
        val scenarios = createSampleScenarios()

        // When
        service.runTests(scenarios)
        advanceUntilIdle()

        // Then
        val progress = service.progress.first()
        assertEquals(scenarios.size, progress.totalTests)
        assertTrue(progress.completedTests >= 0)
    }

    @Test
    fun `runTests should update progress during execution`() = runTest {
        // Given
        val scenarios = createSampleScenarios()

        // When
        service.runTests(scenarios)
        advanceTimeBy(1000) // Check midway

        // Then
        val progress = service.progress.first()
        assertTrue(progress.completedTests > 0)
        assertTrue(progress.percentage > 0.0f && progress.percentage < 100.0f)
    }

    @Test
    fun `pauseTests should stop execution temporarily`() = runTest {
        // Given
        service.runTests(createSampleScenarios())
        advanceTimeBy(500)

        // When
        service.pauseTests()
        advanceUntilIdle()

        // Then
        val state = service.executionState.first()
        assertEquals(ExecutionState.PAUSED, state)
    }

    @Test
    fun `resumeTests should continue execution`() = runTest {
        // Given
        service.runTests(createSampleScenarios())
        advanceTimeBy(500)
        service.pauseTests()
        advanceUntilIdle()

        // When
        service.resumeTests()
        advanceUntilIdle()

        // Then
        val state = service.executionState.first()
        assertEquals(ExecutionState.RUNNING, state)
    }

    @Test
    fun `cancelTests should stop execution completely`() = runTest {
        // Given
        service.runTests(createSampleScenarios())
        advanceTimeBy(500)

        // When
        service.cancelTests()
        advanceUntilIdle()

        // Then
        val state = service.executionState.first()
        assertEquals(ExecutionState.CANCELLED, state)
    }

    @Test
    fun `notification should update with progress`() = runTest {
        // Given
        service.startForegroundService()

        // When
        service.runTests(createSampleScenarios())
        advanceTimeBy(1000)

        // Then
        verify(mockNotificationManager, atLeast(2)).notify(eq(TestRunnerService.NOTIFICATION_ID), any())
    }

    @Test
    fun `service should handle test failures gracefully`() = runTest {
        // Given
        val failingScenario = createFailingScenario()

        // When
        service.runTests(listOf(failingScenario))
        advanceUntilIdle()

        // Then
        val results = service.results.first()
        val failed = results.find { it.status == TestStatus.FAILED }
        assertNotNull(failed)
        assertNotNull(failed?.errorMessage)
    }

    @Test
    fun `service should emit results after completion`() = runTest {
        // Given
        val scenarios = createSampleScenarios()

        // When
        service.runTests(scenarios)
        advanceUntilIdle()

        // Then
        val results = service.results.first()
        assertEquals(scenarios.size, results.size)
    }

    @Test
    fun `service should stop foreground mode on completion`() = runTest {
        // Given
        service.startForegroundService()
        service.runTests(createSampleScenarios())

        // When
        advanceUntilIdle()

        // Then
        assertFalse(service.isForeground)
    }

    @Test
    fun `getProgress should return current execution progress`() = runTest {
        // Given
        service.runTests(createSampleScenarios())
        advanceTimeBy(1000)

        // When
        val progress = service.getProgress()

        // Then
        assertNotNull(progress)
        assertTrue(progress.percentage >= 0.0f && progress.percentage <= 100.0f)
    }

    @Test
    fun `service lifecycle should handle onDestroy`() = runTest {
        // Given
        service.runTests(createSampleScenarios())
        advanceTimeBy(500)

        // When
        service.onDestroy()
        advanceUntilIdle()

        // Then
        val state = service.executionState.first()
        assertEquals(ExecutionState.CANCELLED, state)
    }

    // Helper methods

    private fun createSampleScenarios(): List<TestScenario> {
        return listOf(
            TestScenario(
                id = "test-001",
                name = "Test_Onboarding_Tutorial",
                description = "Complete onboarding tutorial flow",
                category = TestCategory.ONBOARDING,
                priority = TestPriority.HIGH,
                steps = listOf("Open app", "Complete tutorial", "Verify completion"),
                prerequisites = emptyList(),
                testData = emptyMap(),
                expectedDuration = 1500L
            ),
            TestScenario(
                id = "test-002",
                name = "Test_Wild_Encounter",
                description = "Trigger and complete wild encounter",
                category = TestCategory.WILD_ENCOUNTER,
                priority = TestPriority.HIGH,
                steps = listOf("Walk in grass", "Encounter Pokemon", "Catch or flee"),
                prerequisites = listOf("test-001"),
                testData = mapOf("location" to "Route 1"),
                expectedDuration = 2000L
            ),
            TestScenario(
                id = "test-003",
                name = "Test_Battle_Basic",
                description = "Execute basic battle mechanics",
                category = TestCategory.BATTLE,
                priority = TestPriority.HIGH,
                steps = listOf("Enter battle", "Use move", "Verify damage"),
                prerequisites = listOf("test-001"),
                testData = emptyMap(),
                expectedDuration = 1800L
            )
        )
    }

    private fun createFailingScenario(): TestScenario {
        return TestScenario(
            id = "test-fail",
            name = "Test_Failing_Scenario",
            description = "A test that will fail",
            category = TestCategory.STRESS,
            priority = TestPriority.LOW,
            steps = listOf("Execute", "Fail"),
            prerequisites = emptyList(),
            testData = mapOf("shouldFail" to "true"),
            expectedDuration = 500L
        )
    }
}
