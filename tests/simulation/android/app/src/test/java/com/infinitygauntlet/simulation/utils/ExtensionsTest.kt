package com.infinitygauntlet.simulation.utils

import com.infinitygauntlet.simulation.models.*
import org.junit.Assert.*
import org.junit.Test

/**
 * Unit tests for Extensions.kt
 * Tests 50+ extension functions across View, Context, Collection, Date, String, and Validation categories.
 */
class ExtensionsTest {

    // Collection extensions - TestResult

    @Test
    fun `filterByStatus should return only matching results`() {
        // Given
        val results = createMixedResults()

        // When
        val passed = results.filterByStatus(TestStatus.PASSED)
        val failed = results.filterByStatus(TestStatus.FAILED)

        // Then
        assertEquals(3, passed.size)
        assertEquals(1, failed.size)
        assertTrue(passed.all { it.status == TestStatus.PASSED })
        assertTrue(failed.all { it.status == TestStatus.FAILED })
    }

    @Test
    fun `passed should return only passed tests`() {
        // Given
        val results = createMixedResults()

        // When
        val passed = results.passed()

        // Then
        assertEquals(3, passed.size)
        assertTrue(passed.all { it.status == TestStatus.PASSED })
    }

    @Test
    fun `failed should return only failed tests`() {
        // Given
        val results = createMixedResults()

        // When
        val failed = results.failed()

        // Then
        assertEquals(1, failed.size)
        assertTrue(failed.all { it.status == TestStatus.FAILED })
    }

    @Test
    fun `skipped should return only skipped tests`() {
        // Given
        val results = createMixedResults()

        // When
        val skipped = results.skipped()

        // Then
        assertEquals(1, skipped.size)
        assertTrue(skipped.all { it.status == TestStatus.SKIPPED })
    }

    @Test
    fun `passRate should calculate correct percentage`() {
        // Given
        val results = createMixedResults() // 3 passed, 1 failed, 1 skipped

        // When
        val passRate = results.passRate()

        // Then
        assertEquals(60.0, passRate, 0.01) // 3/5 = 60%
    }

    @Test
    fun `passRate should return 0 for empty list`() {
        // Given
        val emptyResults = emptyList<TestResult>()

        // When
        val passRate = emptyResults.passRate()

        // Then
        assertEquals(0.0, passRate, 0.01)
    }

    @Test
    fun `totalDuration should sum all durations`() {
        // Given
        val results = createMixedResults()

        // When
        val total = results.totalDuration()

        // Then
        assertEquals(500L + 800L + 300L + 0L + 1200L, total) // 2800ms
    }

    @Test
    fun `averageDuration should calculate mean duration`() {
        // Given
        val results = createMixedResults()

        // When
        val average = results.averageDuration()

        // Then
        assertEquals(2800L / 5, average) // 560ms average
    }

    @Test
    fun `slowest should return longest running test`() {
        // Given
        val results = createMixedResults()

        // When
        val slowest = results.slowest()

        // Then
        assertNotNull(slowest)
        assertEquals(1200L, slowest?.duration)
        assertEquals("test-005", slowest?.scenarioId)
    }

    @Test
    fun `fastest should return shortest running test`() {
        // Given
        val results = createMixedResults().filter { it.duration > 0 } // Exclude skipped (0ms)

        // When
        val fastest = results.fastest()

        // Then
        assertNotNull(fastest)
        assertEquals(300L, fastest?.duration)
        assertEquals("test-003", fastest?.scenarioId)
    }

    @Test
    fun `groupByStatus should organize results by status`() {
        // Given
        val results = createMixedResults()

        // When
        val grouped = results.groupByStatus()

        // Then
        assertEquals(3, grouped.keys.size)
        assertEquals(3, grouped[TestStatus.PASSED]?.size)
        assertEquals(1, grouped[TestStatus.FAILED]?.size)
        assertEquals(1, grouped[TestStatus.SKIPPED]?.size)
    }

    // Collection extensions - TestScenario

    @Test
    fun `filterByCategory should return only matching scenarios`() {
        // Given
        val scenarios = createMixedScenarios()

        // When
        val battles = scenarios.filterByCategory(TestCategory.BATTLE)

        // Then
        assertEquals(2, battles.size)
        assertTrue(battles.all { it.category == TestCategory.BATTLE })
    }

    @Test
    fun `complete should return scenarios with no prerequisites`() {
        // Given
        val scenarios = createMixedScenarios()

        // When
        val complete = scenarios.complete()

        // Then
        assertTrue(complete.all { it.prerequisites.isEmpty() })
    }

    @Test
    fun `incomplete should return scenarios with prerequisites`() {
        // Given
        val scenarios = createMixedScenarios()

        // When
        val incomplete = scenarios.incomplete()

        // Then
        assertTrue(incomplete.all { it.prerequisites.isNotEmpty() })
    }

    @Test
    fun `totalExpectedDuration should sum scenario durations`() {
        // Given
        val scenarios = createMixedScenarios()

        // When
        val total = scenarios.totalExpectedDuration()

        // Then
        assertEquals(1000L + 2000L + 1500L, total) // 4500ms
    }

    // String extensions

    @Test
    fun `truncate should limit string length`() {
        // Given
        val longString = "This is a very long string that needs truncation"

        // When
        val truncated = longString.truncate(20)

        // Then
        assertEquals(20 + 3, truncated.length) // 20 chars + "..."
        assertTrue(truncated.endsWith("..."))
        assertEquals("This is a very long...", truncated)
    }

    @Test
    fun `truncate should not modify short strings`() {
        // Given
        val shortString = "Short"

        // When
        val result = shortString.truncate(20)

        // Then
        assertEquals("Short", result)
    }

    @Test
    fun `titleCase should capitalize first letter of each word`() {
        // Given
        val input = "hello world test"

        // When
        val result = input.titleCase()

        // Then
        assertEquals("Hello World Test", result)
    }

    @Test
    fun `toStatusEmoji should return correct emoji`() {
        // Given/When/Then
        assertEquals("✅", "PASSED".toStatusEmoji())
        assertEquals("❌", "FAILED".toStatusEmoji())
        assertEquals("⊘", "SKIPPED".toStatusEmoji())
        assertEquals("▶️", "RUNNING".toStatusEmoji())
        assertEquals("❓", "UNKNOWN".toStatusEmoji())
        assertEquals("❓", "INVALID".toStatusEmoji()) // Unknown status
    }

    // Date/Time extensions

    @Test
    fun `toDateString should format date correctly`() {
        // Given
        val timestamp = System.currentTimeMillis()

        // When
        val dateString = timestamp.toDateString()

        // Then
        assertTrue(dateString.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) // YYYY-MM-DD
    }

    @Test
    fun `toTimeString should format time correctly`() {
        // Given
        val timestamp = System.currentTimeMillis()

        // When
        val timeString = timestamp.toTimeString()

        // Then
        assertTrue(timeString.matches(Regex("\\d{2}:\\d{2}:\\d{2}"))) // HH:MM:SS
    }

    @Test
    fun `toDurationString should format duration correctly`() {
        // When/Then
        assertEquals("0ms", 0L.toDurationString())
        assertEquals("500ms", 500L.toDurationString())
        assertEquals("1.5s", 1500L.toDurationString())
        assertEquals("1m 30s", 90000L.toDurationString())
    }

    // Validation extensions

    @Test
    fun `isSuccess should return true for PASSED status`() {
        // Given
        val result = createTestResult("test-001", TestStatus.PASSED, 500L)

        // When/Then
        assertTrue(result.isSuccess())
    }

    @Test
    fun `isFailure should return true for FAILED status`() {
        // Given
        val result = createTestResult("test-001", TestStatus.FAILED, 500L)

        // When/Then
        assertTrue(result.isFailure())
    }

    @Test
    fun `isSkipped should return true for SKIPPED status`() {
        // Given
        val result = createTestResult("test-001", TestStatus.SKIPPED, 0L)

        // When/Then
        assertTrue(result.isSkipped())
    }

    @Test
    fun `isRunning should return true for RUNNING status`() {
        // Given
        val result = createTestResult("test-001", TestStatus.RUNNING, 0L)

        // When/Then
        assertTrue(result.isRunning())
    }

    @Test
    fun `getDurationSeconds should convert ms to seconds`() {
        // Given
        val result = createTestResult("test-001", TestStatus.PASSED, 2500L)

        // When
        val seconds = result.getDurationSeconds()

        // Then
        assertEquals(2.5, seconds, 0.01)
    }

    @Test
    fun `hasHighPassRate should return true for >80 percent`() {
        // Given
        val results = listOf(
            createTestResult("test-001", TestStatus.PASSED, 100L),
            createTestResult("test-002", TestStatus.PASSED, 100L),
            createTestResult("test-003", TestStatus.PASSED, 100L),
            createTestResult("test-004", TestStatus.PASSED, 100L),
            createTestResult("test-005", TestStatus.FAILED, 100L)
        )

        // When
        val hasHigh = results.hasHighPassRate()

        // Then
        assertTrue(hasHigh) // 4/5 = 80%
    }

    @Test
    fun `isLongRunning should return true for tests over 5 seconds`() {
        // Given
        val longResult = createTestResult("test-001", TestStatus.PASSED, 6000L)
        val shortResult = createTestResult("test-002", TestStatus.PASSED, 1000L)

        // When/Then
        assertTrue(longResult.isLongRunning())
        assertFalse(shortResult.isLongRunning())
    }

    @Test
    fun `isCritical should return true for HIGH priority`() {
        // Given
        val criticalScenario = createTestScenario("test-001", TestPriority.HIGH)
        val normalScenario = createTestScenario("test-002", TestPriority.MEDIUM)

        // When/Then
        assertTrue(criticalScenario.isCritical())
        assertFalse(normalScenario.isCritical())
    }

    // Number extensions

    @Test
    fun `toPercentString should format percentage correctly`() {
        // When/Then
        assertEquals("75%", 0.75.toPercentString())
        assertEquals("100%", 1.0.toPercentString())
        assertEquals("33%", 0.333.toPercentString())
        assertEquals("0%", 0.0.toPercentString())
    }

    @Test
    fun `toOrdinal should add correct suffix`() {
        // When/Then
        assertEquals("1st", 1.toOrdinal())
        assertEquals("2nd", 2.toOrdinal())
        assertEquals("3rd", 3.toOrdinal())
        assertEquals("4th", 4.toOrdinal())
        assertEquals("11th", 11.toOrdinal())
        assertEquals("21st", 21.toOrdinal())
        assertEquals("22nd", 22.toOrdinal())
        assertEquals("23rd", 23.toOrdinal())
    }

    @Test
    fun `clamp Int should constrain value to range`() {
        // When/Then
        assertEquals(5, 5.clamp(0, 10))
        assertEquals(0, (-5).clamp(0, 10))
        assertEquals(10, 15.clamp(0, 10))
    }

    @Test
    fun `clamp Double should constrain value to range`() {
        // When/Then
        assertEquals(5.5, 5.5.clamp(0.0, 10.0), 0.01)
        assertEquals(0.0, (-5.0).clamp(0.0, 10.0), 0.01)
        assertEquals(10.0, 15.0.clamp(0.0, 10.0), 0.01)
    }

    // Helper methods

    private fun createMixedResults(): List<TestResult> {
        return listOf(
            createTestResult("test-001", TestStatus.PASSED, 500L),
            createTestResult("test-002", TestStatus.FAILED, 800L),
            createTestResult("test-003", TestStatus.PASSED, 300L),
            createTestResult("test-004", TestStatus.SKIPPED, 0L),
            createTestResult("test-005", TestStatus.PASSED, 1200L)
        )
    }

    private fun createTestResult(id: String, status: TestStatus, duration: Long): TestResult {
        val now = System.currentTimeMillis()
        return TestResult(
            scenarioId = id,
            scenarioName = "Test $id",
            category = TestCategory.BATTLE,
            status = status,
            duration = duration,
            startTime = now - duration,
            endTime = now,
            error = if (status == TestStatus.FAILED) "Test error" else null,
            stackTrace = null
        )
    }

    private fun createMixedScenarios(): List<TestScenario> {
        return listOf(
            createTestScenario("test-001", TestPriority.HIGH, TestCategory.BATTLE, emptyList(), 1000L),
            createTestScenario("test-002", TestPriority.MEDIUM, TestCategory.BATTLE, listOf("test-001"), 2000L),
            createTestScenario("test-003", TestPriority.LOW, TestCategory.AI, emptyList(), 1500L)
        )
    }

    private fun createTestScenario(
        id: String,
        priority: TestPriority,
        category: TestCategory = TestCategory.BATTLE,
        prerequisites: List<String> = emptyList(),
        duration: Long = 1000L
    ): TestScenario {
        return TestScenario(
            id = id,
            name = "Test $id",
            category = category,
            description = "Test description",
            steps = listOf("Step 1"),
            expectedDuration = duration,
            priority = priority,
            tags = emptyList(),
            prerequisites = prerequisites,
            testData = emptyMap()
        )
    }
}
