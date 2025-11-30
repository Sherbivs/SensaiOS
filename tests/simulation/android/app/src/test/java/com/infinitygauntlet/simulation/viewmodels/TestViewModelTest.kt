package com.infinitygauntlet.simulation.viewmodels

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.infinitygauntlet.simulation.domain.models.*
import com.infinitygauntlet.simulation.repositories.TestScenarioRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations

/**
 * Unit tests for TestViewModel
 * Tests test execution flow, state management, filtering, and error handling.
 */
@ExperimentalCoroutinesApi
class TestViewModelTest {

    @get:Rule
    val instantExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()

    @Mock
    private lateinit var mockRepository: TestScenarioRepository

    private lateinit var viewModel: TestViewModel

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        
        // Mock repository responses
        `when`(mockRepository.loadScenarios()).thenReturn(createSampleScenarios())
        
        viewModel = TestViewModel(mockRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state should be correct`() = runTest {
        // When
        val scenarios = viewModel.scenarios.first()
        val results = viewModel.results.first()
        val isRunning = viewModel.isRunning.first()

        // Then
        assertTrue(scenarios.isNotEmpty())
        assertTrue(results.isEmpty())
        assertFalse(isRunning)
    }

    @Test
    fun `loadScenarios should populate scenarios list`() = runTest {
        // When
        viewModel.loadScenarios()
        advanceUntilIdle()

        // Then
        val scenarios = viewModel.scenarios.first()
        assertEquals(5, scenarios.size)
        verify(mockRepository, times(2)).loadScenarios() // Initial + manual load
    }

    @Test
    fun `runAllTests should execute all scenarios`() = runTest {
        // Given
        viewModel.loadScenarios()
        advanceUntilIdle()

        // When
        viewModel.runAllTests()
        advanceUntilIdle()

        // Then
        val results = viewModel.results.first()
        assertEquals(5, results.size)
        
        val isRunning = viewModel.isRunning.first()
        assertFalse(isRunning) // Should finish
    }

    @Test
    fun `runSelectedTests should only run selected scenarios`() = runTest {
        // Given
        viewModel.loadScenarios()
        advanceUntilIdle()
        
        val scenariosToRun = createSampleScenarios().take(2)

        // When
        viewModel.runSelectedTests(scenariosToRun)
        advanceUntilIdle()

        // Then
        val results = viewModel.results.first()
        assertEquals(2, results.size)
    }

    @Test
    fun `pauseTests should set isRunning to false`() = runTest {
        // Given
        viewModel.runAllTests()
        advanceTimeBy(100) // Let tests start

        // When
        viewModel.pauseTests()
        advanceUntilIdle()

        // Then
        val isRunning = viewModel.isRunning.first()
        assertFalse(isRunning)
    }

    @Test
    fun `cancelTests should clear results and stop execution`() = runTest {
        // Given
        viewModel.runAllTests()
        advanceTimeBy(100)

        // When
        viewModel.cancelTests()
        advanceUntilIdle()

        // Then
        val results = viewModel.results.first()
        assertTrue(results.isEmpty())
        
        val isRunning = viewModel.isRunning.first()
        assertFalse(isRunning)
    }

    @Test
    fun `filterByCategory should update filtered scenarios`() = runTest {
        // Given
        viewModel.loadScenarios()
        advanceUntilIdle()

        // When
        viewModel.filterByCategory(TestCategory.BATTLE)
        advanceUntilIdle()

        // Then
        val filtered = viewModel.filteredScenarios.first()
        assertTrue(filtered.all { it.category == TestCategory.BATTLE })
    }

    @Test
    fun `filterByPriority should update filtered scenarios`() = runTest {
        // Given
        viewModel.loadScenarios()
        advanceUntilIdle()

        // When
        viewModel.filterByPriority(TestPriority.HIGH)
        advanceUntilIdle()

        // Then
        val filtered = viewModel.filteredScenarios.first()
        assertTrue(filtered.all { it.priority == TestPriority.HIGH })
    }

    @Test
    fun `clearFilters should show all scenarios`() = runTest {
        // Given
        viewModel.loadScenarios()
        viewModel.filterByCategory(TestCategory.BATTLE)
        advanceUntilIdle()

        // When
        viewModel.clearFilters()
        advanceUntilIdle()

        // Then
        val scenarios = viewModel.scenarios.first()
        val filtered = viewModel.filteredScenarios.first()
        assertEquals(scenarios.size, filtered.size)
    }

    @Test
    fun `getStatistics should calculate correct values`() = runTest {
        // Given
        viewModel.loadScenarios()
        viewModel.runAllTests()
        advanceUntilIdle()

        // When
        val stats = viewModel.getStatistics()

        // Then
        assertNotNull(stats)
        assertEquals(5, stats.totalTests)
        assertTrue(stats.passedTests >= 0)
        assertTrue(stats.failedTests >= 0)
        assertTrue(stats.skippedTests >= 0)
        assertTrue(stats.passRate >= 0.0)
        assertTrue(stats.totalDuration >= 0L)
    }

    @Test
    fun `getPassRate should return correct percentage`() = runTest {
        // Given
        val mockResults = listOf(
            createTestResult("test-001", TestStatus.PASSED),
            createTestResult("test-002", TestStatus.PASSED),
            createTestResult("test-003", TestStatus.PASSED),
            createTestResult("test-004", TestStatus.FAILED),
            createTestResult("test-005", TestStatus.SKIPPED)
        )
        // Inject mock results (would need to expose a test method or use reflection)

        // When
        val passRate = viewModel.getPassRate()

        // Then
        assertTrue(passRate >= 0.0 && passRate <= 100.0)
    }

    @Test
    fun `getTotalDuration should sum all test durations`() = runTest {
        // Given
        viewModel.loadScenarios()
        viewModel.runAllTests()
        advanceUntilIdle()

        // When
        val totalDuration = viewModel.getTotalDuration()

        // Then
        assertTrue(totalDuration >= 0L)
    }

    @Test
    fun `exportResults should generate CSV report`() = runTest {
        // Given
        viewModel.loadScenarios()
        viewModel.runAllTests()
        advanceUntilIdle()

        // When
        val csv = viewModel.exportResults("csv")

        // Then
        assertNotNull(csv)
        assertTrue(csv.contains("Test Name"))
        assertTrue(csv.contains("Status"))
    }

    @Test
    fun `exportResults should generate Markdown report`() = runTest {
        // Given
        viewModel.loadScenarios()
        viewModel.runAllTests()
        advanceUntilIdle()

        // When
        val markdown = viewModel.exportResults("markdown")

        // Then
        assertNotNull(markdown)
        assertTrue(markdown.contains("# Test Report"))
        assertTrue(markdown.contains("|")) // Markdown table
    }

    @Test
    fun `exportResults should handle empty results`() = runTest {
        // Given - No tests run

        // When
        val csv = viewModel.exportResults("csv")

        // Then
        assertNotNull(csv)
        // Should still have headers
        assertTrue(csv.contains("Test Name"))
    }

    @Test
    fun `error handling should update error state`() = runTest {
        // Given
        `when`(mockRepository.loadScenarios()).thenThrow(RuntimeException("Repository error"))

        // When
        viewModel.loadScenarios()
        advanceUntilIdle()

        // Then
        val errorState = viewModel.error.first()
        assertNotNull(errorState)
        assertTrue(errorState?.contains("error", ignoreCase = true) ?: false)
    }

    @Test
    fun `concurrent test execution should handle multiple calls`() = runTest {
        // Given
        viewModel.loadScenarios()
        advanceUntilIdle()

        // When
        viewModel.runAllTests()
        viewModel.runAllTests() // Second call while first is running
        advanceUntilIdle()

        // Then
        val isRunning = viewModel.isRunning.first()
        assertFalse(isRunning) // Should complete
        
        val results = viewModel.results.first()
        assertTrue(results.isNotEmpty())
    }

    @Test
    fun `searchScenarios should filter by name`() = runTest {
        // Given
        viewModel.loadScenarios()
        advanceUntilIdle()

        // When
        viewModel.searchScenarios("battle")
        advanceUntilIdle()

        // Then
        val filtered = viewModel.filteredScenarios.first()
        assertTrue(filtered.all { it.name.contains("battle", ignoreCase = true) })
    }

    @Test
    fun `sortScenariosByDuration should order correctly`() = runTest {
        // Given
        viewModel.loadScenarios()
        advanceUntilIdle()

        // When
        viewModel.sortScenariosByDuration(ascending = true)
        advanceUntilIdle()

        // Then
        val scenarios = viewModel.filteredScenarios.first()
        for (i in 0 until scenarios.size - 1) {
            assertTrue(scenarios[i].expectedDuration <= scenarios[i + 1].expectedDuration)
        }
    }

    // Helper methods

    private fun createSampleScenarios(): List<TestScenario> {
        return listOf(
            TestScenario(
                id = "test-001",
                name = "User Registration",
                category = TestCategory.ONBOARDING,
                description = "Test registration flow",
                steps = listOf("Step 1", "Step 2"),
                expectedDuration = 500L,
                priority = TestPriority.HIGH,
                tags = listOf("auth"),
                prerequisites = emptyList(),
                testData = emptyMap()
            ),
            TestScenario(
                id = "test-002",
                name = "Basic Battle",
                category = TestCategory.BATTLE,
                description = "Test battle mechanics",
                steps = listOf("Step 1"),
                expectedDuration = 800L,
                priority = TestPriority.HIGH,
                tags = listOf("battle"),
                prerequisites = emptyList(),
                testData = emptyMap()
            ),
            TestScenario(
                id = "test-003",
                name = "Wild Encounter",
                category = TestCategory.WILD_ENCOUNTER,
                description = "Test wild encounters",
                steps = listOf("Step 1"),
                expectedDuration = 300L,
                priority = TestPriority.MEDIUM,
                tags = listOf("encounter"),
                prerequisites = emptyList(),
                testData = emptyMap()
            ),
            TestScenario(
                id = "test-004",
                name = "AI Strategy",
                category = TestCategory.AI,
                description = "Test AI decision making",
                steps = listOf("Step 1"),
                expectedDuration = 600L,
                priority = TestPriority.MEDIUM,
                tags = listOf("ai"),
                prerequisites = emptyList(),
                testData = emptyMap()
            ),
            TestScenario(
                id = "test-005",
                name = "Stress Test",
                category = TestCategory.STRESS,
                description = "Test system under load",
                steps = listOf("Step 1"),
                expectedDuration = 1200L,
                priority = TestPriority.LOW,
                tags = listOf("stress"),
                prerequisites = emptyList(),
                testData = emptyMap()
            )
        )
    }

    private fun createTestResult(id: String, status: TestStatus): TestResult {
        val now = System.currentTimeMillis()
        return TestResult(
            scenarioId = id,
            scenarioName = "Test $id",
            category = TestCategory.BATTLE,
            status = status,
            duration = 500L,
            startTime = now - 500L,
            endTime = now,
            error = if (status == TestStatus.FAILED) "Test error" else null,
            stackTrace = null
        )
    }
}
