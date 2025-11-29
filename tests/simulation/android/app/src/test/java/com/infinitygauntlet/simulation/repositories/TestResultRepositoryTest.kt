package com.infinitygauntlet.simulation.repositories

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.infinitygauntlet.simulation.models.TestResult
import com.infinitygauntlet.simulation.models.TestStatus
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Unit tests for TestResultRepository
 * Tests result persistence, filtering, statistics, and history management.
 */
@ExperimentalCoroutinesApi
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class TestResultRepositoryTest {

    private lateinit var context: Context
    private lateinit var repository: TestResultRepository

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        repository = TestResultRepository(context)
        repository.clearAll() // Clean slate for each test
    }

    @Test
    fun `saveResult should persist test result`() = runTest {
        // Given
        val result = createSampleResult("Test_001", TestStatus.PASSED)

        // When
        repository.saveResult(result)

        // Then
        val saved = repository.getResultByTestName("Test_001")
        assertNotNull(saved)
        assertEquals("Test_001", saved?.testName)
        assertEquals(TestStatus.PASSED, saved?.status)
    }

    @Test
    fun `saveResults should persist multiple results`() = runTest {
        // Given
        val results = listOf(
            createSampleResult("Test_001", TestStatus.PASSED),
            createSampleResult("Test_002", TestStatus.FAILED),
            createSampleResult("Test_003", TestStatus.SKIPPED)
        )

        // When
        repository.saveResults(results)

        // Then
        val allResults = repository.getAllResults()
        assertTrue(allResults.size >= 3)
    }

    @Test
    fun `getResultByTestName should return correct result`() = runTest {
        // Given
        val result = createSampleResult("Test_Battle", TestStatus.PASSED)
        repository.saveResult(result)

        // When
        val retrieved = repository.getResultByTestName("Test_Battle")

        // Then
        assertNotNull(retrieved)
        assertEquals("Test_Battle", retrieved?.testName)
    }

    @Test
    fun `getResultsByStatus should filter correctly`() = runTest {
        // Given
        repository.saveResults(listOf(
            createSampleResult("Test_001", TestStatus.PASSED),
            createSampleResult("Test_002", TestStatus.PASSED),
            createSampleResult("Test_003", TestStatus.FAILED)
        ))

        // When
        val passed = repository.getResultsByStatus(TestStatus.PASSED)

        // Then
        assertEquals(2, passed.size)
        assertTrue(passed.all { it.status == TestStatus.PASSED })
    }

    @Test
    fun `getRecentResults should return limited results`() = runTest {
        // Given
        repeat(20) { i ->
            repository.saveResult(createSampleResult("Test_$i", TestStatus.PASSED))
        }

        // When
        val recent = repository.getRecentResults(limit = 10)

        // Then
        assertEquals(10, recent.size)
    }

    @Test
    fun `deleteResult should remove result`() = runTest {
        // Given
        val result = createSampleResult("Test_Delete", TestStatus.PASSED)
        repository.saveResult(result)
        assertNotNull(repository.getResultByTestName("Test_Delete"))

        // When
        repository.deleteResult("Test_Delete")

        // Then
        assertNull(repository.getResultByTestName("Test_Delete"))
    }

    @Test
    fun `clearAll should remove all results`() = runTest {
        // Given
        repository.saveResults(listOf(
            createSampleResult("Test_001", TestStatus.PASSED),
            createSampleResult("Test_002", TestStatus.FAILED)
        ))

        // When
        repository.clearAll()

        // Then
        val allResults = repository.getAllResults()
        assertTrue(allResults.isEmpty())
    }

    @Test
    fun `getStatistics should calculate correctly`() = runTest {
        // Given
        repository.saveResults(listOf(
            createSampleResult("Test_001", TestStatus.PASSED, duration = 500L),
            createSampleResult("Test_002", TestStatus.PASSED, duration = 300L),
            createSampleResult("Test_003", TestStatus.FAILED, duration = 200L),
            createSampleResult("Test_004", TestStatus.SKIPPED, duration = 0L)
        ))

        // When
        val stats = repository.getStatistics()

        // Then
        assertEquals(4, stats.totalTests)
        assertEquals(2, stats.passedCount)
        assertEquals(1, stats.failedCount)
        assertEquals(1, stats.skippedCount)
        assertEquals(0.5f, stats.passRate, 0.01f)
        assertEquals(1000L, stats.totalDuration)
    }

    // Helper methods

    private fun createSampleResult(
        testName: String,
        status: TestStatus,
        duration: Long = 500L
    ): TestResult {
        return TestResult(
            testName = testName,
            status = status,
            duration = duration,
            errorMessage = if (status == TestStatus.FAILED) "Test failed" else null,
            timestamp = System.currentTimeMillis()
        )
    }
}
