package com.infinitygauntlet.simulation.utils

import android.text.SpannableString
import com.infinitygauntlet.simulation.domain.models.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for ReportFormatter.kt
 * Tests multi-format report generation, color coding, and formatting utilities.
 */
class ReportFormatterTest {

    private lateinit var formatter: ReportFormatter
    private lateinit var sampleResults: List<TestResult>

    @Before
    fun setup() {
        formatter = ReportFormatter()
        sampleResults = createSampleResults()
    }

    @Test
    fun `formatSummary should include all test counts`() {
        // Given
        val results = sampleResults

        // When
        val summary = formatter.formatSummary(results)

        // Then
        assertTrue(summary.contains("Total: 5"))
        assertTrue(summary.contains("Passed: 3"))
        assertTrue(summary.contains("Failed: 1"))
        assertTrue(summary.contains("Skipped: 1"))
    }

    @Test
    fun `formatSummary should calculate pass rate`() {
        // Given
        val results = sampleResults

        // When
        val summary = formatter.formatSummary(results)

        // Then
        assertTrue(summary.contains("60%")) // 3 passed out of 5 = 60%
    }

    @Test
    fun `formatSummary should include total duration`() {
        // Given
        val results = sampleResults

        // When
        val summary = formatter.formatSummary(results)

        // Then
        // Total duration: 500 + 800 + 300 + 0 + 1200 = 2800ms = 2.8s
        assertTrue(summary.contains("2.8s") || summary.contains("2800ms"))
    }

    @Test
    fun `formatResult should show test name and status`() {
        // Given
        val result = sampleResults[0] // Passed result

        // When
        val formatted = formatter.formatResult(result)

        // Then
        assertTrue(formatted.contains("User Registration"))
        assertTrue(formatted.contains("PASSED") || formatted.contains("✓"))
    }

    @Test
    fun `formatResult should include error message for failures`() {
        // Given
        val result = sampleResults[1] // Failed result

        // When
        val formatted = formatter.formatResult(result)

        // Then
        assertTrue(formatted.contains("FAILED") || formatted.contains("✗"))
        assertTrue(formatted.contains("Battle logic failed"))
    }

    @Test
    fun `formatResult should show duration`() {
        // Given
        val result = sampleResults[0]

        // When
        val formatted = formatter.formatResult(result)

        // Then
        assertTrue(formatted.contains("0.5s") || formatted.contains("500ms"))
    }

    @Test
    fun `formatResultsTable should create ASCII table`() {
        // Given
        val results = sampleResults

        // When
        val table = formatter.formatResultsTable(results)

        // Then
        assertTrue(table.contains("┌")) // Top border
        assertTrue(table.contains("└")) // Bottom border
        assertTrue(table.contains("│")) // Vertical separators
        assertTrue(table.contains("Test Name"))
        assertTrue(table.contains("Status"))
        assertTrue(table.contains("Duration"))
        assertTrue(table.contains("Category"))
    }

    @Test
    fun `formatResultsTable should include all results`() {
        // Given
        val results = sampleResults

        // When
        val table = formatter.formatResultsTable(results)

        // Then
        assertTrue(table.contains("User Registration"))
        assertTrue(table.contains("Basic Battle"))
        assertTrue(table.contains("Wild Encounter"))
        assertTrue(table.contains("AI Strategy"))
        assertTrue(table.contains("Stress Test"))
    }

    @Test
    fun `formatAsCsv should create valid CSV`() {
        // Given
        val results = sampleResults

        // When
        val csv = formatter.formatAsCsv(results)

        // Then
        val lines = csv.split("\n")
        assertTrue(lines.isNotEmpty())
        
        // Header row
        val header = lines[0]
        assertTrue(header.contains("Test Name"))
        assertTrue(header.contains("Status"))
        assertTrue(header.contains("Category"))
        assertTrue(header.contains("Duration"))
        
        // Data rows (5 results + 1 header = 6 lines)
        assertEquals(6, lines.size)
    }

    @Test
    fun `formatAsCsv should escape commas in values`() {
        // Given
        val results = listOf(
            createTestResult(
                "test-001",
                "Test with, comma",
                TestStatus.PASSED,
                TestCategory.BATTLE,
                500L,
                null
            )
        )

        // When
        val csv = formatter.formatAsCsv(results)

        // Then
        assertTrue(csv.contains("\"Test with, comma\""))
    }

    @Test
    fun `formatAsMarkdown should create valid markdown`() {
        // Given
        val results = sampleResults

        // When
        val markdown = formatter.formatAsMarkdown(results)

        // Then
        assertTrue(markdown.contains("# Test Report"))
        assertTrue(markdown.contains("## Summary"))
        assertTrue(markdown.contains("## Results"))
        assertTrue(markdown.contains("|")) // Table delimiter
        assertTrue(markdown.contains("---")) // Table header separator
    }

    @Test
    fun `formatAsMarkdown should use emoji for status`() {
        // Given
        val results = sampleResults

        // When
        val markdown = formatter.formatAsMarkdown(results)

        // Then
        assertTrue(markdown.contains("✅") || markdown.contains("✓")) // Passed
        assertTrue(markdown.contains("❌") || markdown.contains("✗")) // Failed
        assertTrue(markdown.contains("⊘") || markdown.contains("○")) // Skipped
    }

    @Test
    fun `formatDuration should format milliseconds correctly`() {
        // When/Then
        assertEquals("500ms", formatter.formatDuration(500L))
        assertEquals("1.5s", formatter.formatDuration(1500L))
        assertEquals("1m 30s", formatter.formatDuration(90000L))
        assertEquals("2m 5s", formatter.formatDuration(125000L))
    }

    @Test
    fun `formatDuration should handle zero`() {
        // When
        val formatted = formatter.formatDuration(0L)

        // Then
        assertEquals("0ms", formatted)
    }

    @Test
    fun `formatDuration should handle very large durations`() {
        // When
        val formatted = formatter.formatDuration(3600000L) // 1 hour

        // Then
        assertTrue(formatted.contains("60m") || formatted.contains("1h"))
    }

    @Test
    fun `applyColors should create SpannableString with colors`() {
        // Given
        val text = "PASSED: 10, FAILED: 2"

        // When
        val spanned = formatter.applyColors(text)

        // Then
        assertTrue(spanned is SpannableString)
        assertTrue(spanned.toString() == text)
        // Note: Can't easily test span colors in unit tests without Robolectric
    }

    @Test
    fun `color constants should be valid hex colors`() {
        // Given/When/Then
        assertTrue(ReportFormatter.COLOR_PASSED.matches(Regex("#[0-9A-Fa-f]{6}")))
        assertTrue(ReportFormatter.COLOR_FAILED.matches(Regex("#[0-9A-Fa-f]{6}")))
        assertTrue(ReportFormatter.COLOR_SKIPPED.matches(Regex("#[0-9A-Fa-f]{6}")))
        assertTrue(ReportFormatter.COLOR_RUNNING.matches(Regex("#[0-9A-Fa-f]{6}")))
    }

    @Test
    fun `formatSummary should handle empty results`() {
        // Given
        val emptyResults = emptyList<TestResult>()

        // When
        val summary = formatter.formatSummary(emptyResults)

        // Then
        assertTrue(summary.contains("Total: 0"))
        assertTrue(summary.contains("0%")) // 0% pass rate
    }

    @Test
    fun `formatResultsTable should handle single result`() {
        // Given
        val singleResult = listOf(sampleResults[0])

        // When
        val table = formatter.formatResultsTable(singleResult)

        // Then
        assertTrue(table.contains("┌")) // Should still have borders
        assertTrue(table.contains("User Registration"))
        val lines = table.split("\n")
        assertTrue(lines.size >= 4) // Header, separator, data, footer
    }

    @Test
    fun `formatAsCsv should handle results with null errors`() {
        // Given
        val results = listOf(
            createTestResult(
                "test-001",
                "No Error Test",
                TestStatus.PASSED,
                TestCategory.BATTLE,
                500L,
                null
            )
        )

        // When
        val csv = formatter.formatAsCsv(results)

        // Then
        assertTrue(csv.contains("No Error Test"))
        assertFalse(csv.contains("null"))
    }

    @Test
    fun `formatAsMarkdown should handle results with errors`() {
        // Given
        val results = listOf(
            createTestResult(
                "test-001",
                "Failed Test",
                TestStatus.FAILED,
                TestCategory.BATTLE,
                500L,
                "AssertionError: Expected 10, got 5"
            )
        )

        // When
        val markdown = formatter.formatAsMarkdown(results)

        // Then
        assertTrue(markdown.contains("AssertionError"))
        assertTrue(markdown.contains("Expected 10, got 5"))
    }

    // Helper methods

    private fun createSampleResults(): List<TestResult> {
        return listOf(
            createTestResult(
                "test-001",
                "User Registration",
                TestStatus.PASSED,
                TestCategory.ONBOARDING,
                500L,
                null
            ),
            createTestResult(
                "test-002",
                "Basic Battle",
                TestStatus.FAILED,
                TestCategory.BATTLE,
                800L,
                "Battle logic failed"
            ),
            createTestResult(
                "test-003",
                "Wild Encounter",
                TestStatus.PASSED,
                TestCategory.WILD_ENCOUNTER,
                300L,
                null
            ),
            createTestResult(
                "test-004",
                "AI Strategy",
                TestStatus.SKIPPED,
                TestCategory.AI,
                0L,
                null
            ),
            createTestResult(
                "test-005",
                "Stress Test",
                TestStatus.PASSED,
                TestCategory.STRESS,
                1200L,
                null
            )
        )
    }

    private fun createTestResult(
        id: String,
        name: String,
        status: TestStatus,
        category: TestCategory,
        duration: Long,
        error: String?
    ): TestResult {
        val now = System.currentTimeMillis()
        return TestResult(
            scenarioId = id,
            scenarioName = name,
            category = category,
            status = status,
            duration = duration,
            startTime = now - duration,
            endTime = now,
            error = error,
            stackTrace = error?.let { "at TestClass.testMethod(TestClass.kt:42)" }
        )
    }
}
