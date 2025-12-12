package com.infinitygauntlet.simulation.domain.models

/**
 * Domain Model: Test Summary
 * 
 * Aggregated summary of test execution results.
 * Used for report generation and statistics display.
 * 
 * @property runId Unique identifier for this test run
 * @property startTime Timestamp when the test run started
 * @property endTime Timestamp when the test run completed
 * @property totalTests Total number of tests executed
 * @property passedCount Number of tests that passed
 * @property failedCount Number of tests that failed
 * @property skippedCount Number of tests that were skipped
 * @property results List of individual test results
 */
data class TestSummary(
    val runId: String,
    val startTime: Long,
    val endTime: Long,
    val totalTests: Int,
    val passedCount: Int,
    val failedCount: Int,
    val skippedCount: Int,
    val results: List<TestResult>
) {
    /**
     * Calculate total duration in milliseconds
     */
    val totalDuration: Long
        get() = endTime - startTime
    
    /**
     * Calculate average test duration
     */
    val averageDuration: Long
        get() = if (results.isEmpty()) 0L else results.map { it.durationMs }.average().toLong()
    
    /**
     * Get minimum test duration
     */
    val minDuration: Long
        get() = results.minOfOrNull { it.durationMs } ?: 0L
    
    /**
     * Get maximum test duration
     */
    val maxDuration: Long
        get() = results.maxOfOrNull { it.durationMs } ?: 0L
    
    /**
     * Calculate pass rate as percentage
     */
    val passRate: Float
        get() = if (totalTests == 0) 0f else (passedCount.toFloat() / totalTests) * 100f
    
    /**
     * Check if all tests passed
     */
    val allTestsPassed: Boolean
        get() = failedCount == 0 && totalTests > 0
    
    /**
     * Format as HTML report string
     */
    fun toHtml(): String {
        // Simplified HTML generation - in real app would use a template
        return buildString {
            append("<html><body>")
            append("<h1>Test Summary Report</h1>")
            append("<p>Run ID: $runId</p>")
            append("<p>Total Tests: $totalTests</p>")
            append("<p>Passed: $passedCount</p>")
            append("<p>Failed: $failedCount</p>")
            append("<p>Pass Rate: ${String.format("%.2f%%", passRate)}</p>")
            append("</body></html>")
        }
    }
    
    /**
     * Format as JSON string (pretty printed)
     */
    fun toJsonPretty(): String {
        return """
            {
              "runId": "$runId",
              "startTime": $startTime,
              "endTime": $endTime,
              "totalTests": $totalTests,
              "passedCount": $passedCount,
              "failedCount": $failedCount,
              "skippedCount": $skippedCount,
              "passRate": $passRate
            }
        """.trimIndent()
    }
    
    /**
     * Format as plain text report
     */
    fun toText(): String {
        return buildString {
            appendLine("Test Summary Report")
            appendLine("===================")
            appendLine("Run ID: $runId")
            appendLine("Total Tests: $totalTests")
            appendLine("Passed: $passedCount")
            appendLine("Failed: $failedCount")
            appendLine("Skipped: $skippedCount")
            appendLine("Pass Rate: ${String.format("%.2f%%", passRate)}")
        }
    }
    
    companion object {
        /**
         * Create TestSummary from a list of TestResults
         * 
         * @param results List of test results
         * @param runId Optional custom run ID (defaults to timestamp-based)
         * @return TestSummary object
         */
        fun fromResults(results: List<TestResult>, runId: String? = null): TestSummary {
            val startTime = results.minOfOrNull { it.executionTimestamp } ?: System.currentTimeMillis()
            val endTime = results.maxOfOrNull { it.executionTimestamp } ?: System.currentTimeMillis()
            
            val passedCount = results.count { it.status == ResultStatus.PASSED }
            val failedCount = results.count { it.status == ResultStatus.FAILED }
            val skippedCount = results.count { it.status == ResultStatus.SKIPPED }
            
            return TestSummary(
                runId = runId ?: "run-${System.currentTimeMillis()}",
                startTime = startTime,
                endTime = endTime,
                totalTests = results.size,
                passedCount = passedCount,
                failedCount = failedCount,
                skippedCount = skippedCount,
                results = results
            )
        }
    }
}
