package com.infinitygauntlet.simulation.models

import com.google.gson.Gson
import com.google.gson.annotations.SerializedName

/**
 * Test Summary data model
 * Aggregates test results across multiple scenarios
 * 
 * Week 5: Phase 5 - Data Models (Final Component)
 * 
 * Used for:
 * - Overall test run statistics
 * - Dashboard summary display
 * - Report generation
 * - Performance tracking
 * 
 * Features:
 * - Aggregate statistics (total, passed, failed, skipped)
 * - Per-scenario breakdown
 * - Duration tracking
 * - Pass rate calculation
 * - JSON serialization for reports
 * - HTML/Text formatting helpers
 */
data class TestSummary(
    @SerializedName("run_id")
    val runId: String,
    
    @SerializedName("start_time")
    val startTime: Long,
    
    @SerializedName("end_time")
    val endTime: Long,
    
    @SerializedName("total_tests")
    val totalTests: Int,
    
    @SerializedName("passed_tests")
    val passedTests: Int,
    
    @SerializedName("failed_tests")
    val failedTests: Int,
    
    @SerializedName("skipped_tests")
    val skippedTests: Int,
    
    @SerializedName("scenario_results")
    val scenarioResults: List<TestResult> = emptyList(),
    
    @SerializedName("environment")
    val environment: TestEnvironment = TestEnvironment(),
    
    @SerializedName("metadata")
    val metadata: Map<String, String> = emptyMap()
) {
    /**
     * Test environment metadata
     */
    data class TestEnvironment(
        @SerializedName("android_version")
        val androidVersion: String = android.os.Build.VERSION.RELEASE,
        
        @SerializedName("device_model")
        val deviceModel: String = android.os.Build.MODEL,
        
        @SerializedName("device_manufacturer")
        val deviceManufacturer: String = android.os.Build.MANUFACTURER,
        
        @SerializedName("app_version")
        val appVersion: String = "1.0.0",
        
        @SerializedName("test_framework")
        val testFramework: String = "Infinity Gauntlet Simulation"
    )
    
    // ========== Computed Properties ==========
    
    /**
     * Total test execution duration in milliseconds
     */
    fun getDuration(): Long = endTime - startTime
    
    /**
     * Duration in seconds with decimal precision
     */
    fun getDurationSeconds(): Double = getDuration() / 1000.0
    
    /**
     * Overall pass rate as percentage (0-100)
     */
    fun getPassRate(): Float {
        return if (totalTests > 0) {
            (passedTests.toFloat() / totalTests.toFloat()) * 100f
        } else {
            0f
        }
    }
    
    /**
     * Whether all tests passed
     */
    fun isSuccess(): Boolean = failedTests == 0 && passedTests > 0
    
    /**
     * Number of scenarios that were run
     */
    fun getScenarioCount(): Int = scenarioResults.size
    
    /**
     * Number of scenarios that passed all tests
     */
    fun getPassedScenarioCount(): Int = scenarioResults.count { it.isSuccess() }
    
    /**
     * Number of scenarios with failures
     */
    fun getFailedScenarioCount(): Int = scenarioResults.count { !it.isSuccess() && it.failed > 0 }
    
    /**
     * Average tests per scenario
     */
    fun getAverageTestsPerScenario(): Float {
        return if (scenarioResults.isNotEmpty()) {
            totalTests.toFloat() / scenarioResults.size.toFloat()
        } else {
            0f
        }
    }
    
    /**
     * Average duration per test in milliseconds
     */
    fun getAverageDurationPerTest(): Double {
        return if (totalTests > 0) {
            getDuration().toDouble() / totalTests.toDouble()
        } else {
            0.0
        }
    }
    
    // ========== Formatting Methods ==========
    
    /**
     * Formats timestamp as human-readable string
     */
    fun getFormattedStartTime(): String {
        val dateFormat = java.text.SimpleDateFormat(
            "yyyy-MM-dd HH:mm:ss",
            java.util.Locale.getDefault()
        )
        return dateFormat.format(java.util.Date(startTime))
    }
    
    /**
     * Formats duration as human-readable string (e.g., "1m 23s")
     */
    fun getFormattedDuration(): String {
        val duration = getDuration()
        val minutes = (duration / 60000).toInt()
        val seconds = ((duration % 60000) / 1000).toInt()
        val millis = (duration % 1000).toInt()
        
        return when {
            minutes > 0 -> "${minutes}m ${seconds}s"
            seconds > 0 -> "${seconds}.${millis / 100}s"
            else -> "${millis}ms"
        }
    }
    
    /**
     * Short status string (e.g., "PASSED" or "FAILED")
     */
    fun getStatusString(): String = if (isSuccess()) "PASSED" else "FAILED"
    
    /**
     * Emoji status indicator
     */
    fun getStatusEmoji(): String = if (isSuccess()) "✅" else "❌"
    
    // ========== Serialization Methods ==========
    
    /**
     * Converts summary to JSON string
     */
    fun toJson(): String {
        return Gson().toJson(this)
    }
    
    /**
     * Converts summary to pretty-printed JSON
     */
    fun toJsonPretty(): String {
        return Gson().newBuilder()
            .setPrettyPrinting()
            .create()
            .toJson(this)
    }
    
    /**
     * Generates HTML report
     */
    fun toHtml(): String {
        return """
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Test Report - ${runId}</title>
                <style>
                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        margin: 0;
                        padding: 20px;
                        background: #f5f5f5;
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                        background: white;
                        border-radius: 8px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                        padding: 24px;
                    }
                    .header {
                        border-bottom: 2px solid #6750A4;
                        padding-bottom: 16px;
                        margin-bottom: 24px;
                    }
                    .header h1 {
                        margin: 0 0 8px 0;
                        color: #1a1a1a;
                    }
                    .status-badge {
                        display: inline-block;
                        padding: 4px 12px;
                        border-radius: 4px;
                        font-weight: 600;
                        font-size: 14px;
                    }
                    .status-passed {
                        background: #d4edda;
                        color: #155724;
                    }
                    .status-failed {
                        background: #f8d7da;
                        color: #721c24;
                    }
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 16px;
                        margin: 24px 0;
                    }
                    .stat-card {
                        padding: 16px;
                        border-radius: 8px;
                        background: #f8f9fa;
                        border-left: 4px solid #6750A4;
                    }
                    .stat-label {
                        font-size: 12px;
                        color: #666;
                        text-transform: uppercase;
                        font-weight: 600;
                        margin-bottom: 4px;
                    }
                    .stat-value {
                        font-size: 28px;
                        font-weight: 700;
                        color: #1a1a1a;
                    }
                    .scenario-list {
                        margin-top: 32px;
                    }
                    .scenario-item {
                        padding: 16px;
                        border: 1px solid #ddd;
                        border-radius: 8px;
                        margin-bottom: 12px;
                    }
                    .scenario-name {
                        font-weight: 600;
                        font-size: 16px;
                        margin-bottom: 8px;
                    }
                    .scenario-stats {
                        font-size: 14px;
                        color: #666;
                    }
                    .progress-bar {
                        width: 100%;
                        height: 8px;
                        background: #e0e0e0;
                        border-radius: 4px;
                        overflow: hidden;
                        margin-top: 8px;
                    }
                    .progress-fill {
                        height: 100%;
                        background: #28a745;
                        transition: width 0.3s ease;
                    }
                    .environment {
                        margin-top: 32px;
                        padding: 16px;
                        background: #f8f9fa;
                        border-radius: 8px;
                        font-size: 14px;
                    }
                    .environment dt {
                        font-weight: 600;
                        margin-bottom: 4px;
                    }
                    .environment dd {
                        margin: 0 0 12px 0;
                        color: #666;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Test Report</h1>
                        <div>
                            <span class="status-badge status-${if (isSuccess()) "passed" else "failed"}">
                                ${getStatusEmoji()} ${getStatusString()}
                            </span>
                        </div>
                    </div>
                    
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-label">Total Tests</div>
                            <div class="stat-value">${totalTests}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Passed</div>
                            <div class="stat-value" style="color: #28a745;">${passedTests}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Failed</div>
                            <div class="stat-value" style="color: #dc3545;">${failedTests}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Pass Rate</div>
                            <div class="stat-value">${String.format("%.1f%%", getPassRate())}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Duration</div>
                            <div class="stat-value" style="font-size: 20px;">${getFormattedDuration()}</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-label">Scenarios</div>
                            <div class="stat-value">${getScenarioCount()}</div>
                        </div>
                    </div>
                    
                    <div class="scenario-list">
                        <h2>Scenario Results</h2>
                        ${scenarioResults.joinToString("") { result ->
                            """
                            <div class="scenario-item">
                                <div class="scenario-name">
                                    ${if (result.isSuccess()) "✅" else "❌"} ${result.scenarioName}
                                </div>
                                <div class="scenario-stats">
                                    ${result.passed} passed, ${result.failed} failed, ${result.skipped} skipped • ${String.format("%.1fs", result.getDurationSeconds())}
                                </div>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${result.getPassRate()}%"></div>
                                </div>
                            </div>
                            """
                        }}
                    </div>
                    
                    <div class="environment">
                        <h3>Test Environment</h3>
                        <dl>
                            <dt>Run ID</dt>
                            <dd>${runId}</dd>
                            <dt>Start Time</dt>
                            <dd>${getFormattedStartTime()}</dd>
                            <dt>Device</dt>
                            <dd>${environment.deviceManufacturer} ${environment.deviceModel}</dd>
                            <dt>Android Version</dt>
                            <dd>${environment.androidVersion}</dd>
                            <dt>App Version</dt>
                            <dd>${environment.appVersion}</dd>
                        </dl>
                    </div>
                </div>
            </body>
            </html>
        """.trimIndent()
    }
    
    /**
     * Generates plain text report
     */
    fun toText(): String {
        return buildString {
            appendLine("=" .repeat(60))
            appendLine("TEST REPORT")
            appendLine("=" .repeat(60))
            appendLine()
            appendLine("Status: ${getStatusEmoji()} ${getStatusString()}")
            appendLine("Run ID: $runId")
            appendLine("Start Time: ${getFormattedStartTime()}")
            appendLine("Duration: ${getFormattedDuration()}")
            appendLine()
            appendLine("-" .repeat(60))
            appendLine("SUMMARY")
            appendLine("-" .repeat(60))
            appendLine("Total Tests:    $totalTests")
            appendLine("Passed:         $passedTests (${String.format("%.1f%%", getPassRate())})")
            appendLine("Failed:         $failedTests")
            appendLine("Skipped:        $skippedTests")
            appendLine("Scenarios:      ${getScenarioCount()}")
            appendLine()
            appendLine("-" .repeat(60))
            appendLine("SCENARIO RESULTS")
            appendLine("-" .repeat(60))
            scenarioResults.forEach { result ->
                appendLine()
                appendLine("${if (result.isSuccess()) "✅" else "❌"} ${result.scenarioName}")
                appendLine("   Tests: ${result.passed}/${result.getTotal()} passed (${String.format("%.1f%%", result.getPassRate())})")
                appendLine("   Duration: ${String.format("%.2fs", result.getDurationSeconds())}")
                if (result.failureDetails.isNotEmpty()) {
                    appendLine("   Failures:")
                    result.failureDetails.forEach { failure ->
                        appendLine("     • ${failure.testName}")
                        appendLine("       Expected: ${failure.expectedValue}")
                        appendLine("       Actual: ${failure.actualValue}")
                    }
                }
            }
            appendLine()
            appendLine("-" .repeat(60))
            appendLine("ENVIRONMENT")
            appendLine("-" .repeat(60))
            appendLine("Device: ${environment.deviceManufacturer} ${environment.deviceModel}")
            appendLine("Android: ${environment.androidVersion}")
            appendLine("App: ${environment.appVersion}")
            appendLine("Framework: ${environment.testFramework}")
            appendLine()
            appendLine("=" .repeat(60))
        }
    }
    
    // ========== Companion Object ==========
    
    companion object {
        /**
         * Deserializes TestSummary from JSON string
         */
        fun fromJson(json: String): TestSummary {
            return Gson().fromJson(json, TestSummary::class.java)
        }
        
        /**
         * Creates a sample summary for testing/demonstration
         */
        fun createSample(): TestSummary {
            val startTime = System.currentTimeMillis() - 15000L // 15 seconds ago
            val endTime = System.currentTimeMillis()
            
            val scenarios = listOf(
                TestResult(
                    scenarioId = "onboarding",
                    scenarioName = "Onboarding Flow",
                    passed = 14,
                    failed = 1,
                    skipped = 0,
                    duration = 1450
                ),
                TestResult(
                    scenarioId = "wild-encounters",
                    scenarioName = "Wild Encounters",
                    passed = 40,
                    failed = 2,
                    skipped = 0,
                    duration = 3420
                ),
                TestResult(
                    scenarioId = "battle-system",
                    scenarioName = "Battle System",
                    passed = 55,
                    failed = 3,
                    skipped = 0,
                    duration = 4180
                ),
                TestResult(
                    scenarioId = "ai-decisions",
                    scenarioName = "AI Decision Making",
                    passed = 18,
                    failed = 0,
                    skipped = 0,
                    duration = 2650
                ),
                TestResult(
                    scenarioId = "stress-tests",
                    scenarioName = "Stress Tests",
                    passed = 9,
                    failed = 1,
                    skipped = 0,
                    duration = 4800
                )
            )
            
            val totalTests = scenarios.sumOf { it.getTotal() }
            val passedTests = scenarios.sumOf { it.passed }
            val failedTests = scenarios.sumOf { it.failed }
            val skippedTests = scenarios.sumOf { it.skipped }
            
            return TestSummary(
                runId = "run-${System.currentTimeMillis()}",
                startTime = startTime,
                endTime = endTime,
                totalTests = totalTests,
                passedTests = passedTests,
                failedTests = failedTests,
                skippedTests = skippedTests,
                scenarioResults = scenarios,
                environment = TestEnvironment(),
                metadata = mapOf(
                    "tester" to "Automated System",
                    "build" to "debug",
                    "git_commit" to "abc123def",
                    "test_suite" to "Infinity Gauntlet Simulation v1.0"
                )
            )
        }
        
        /**
         * Creates summary from list of test results
         */
        fun fromResults(
            results: List<TestResult>,
            startTime: Long,
            endTime: Long,
            runId: String = "run-${System.currentTimeMillis()}"
        ): TestSummary {
            return TestSummary(
                runId = runId,
                startTime = startTime,
                endTime = endTime,
                totalTests = results.sumOf { it.getTotal() },
                passedTests = results.sumOf { it.passed },
                failedTests = results.sumOf { it.failed },
                skippedTests = results.sumOf { it.skipped },
                scenarioResults = results
            )
        }
    }
}
