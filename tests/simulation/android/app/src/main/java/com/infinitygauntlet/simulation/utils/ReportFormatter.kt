package com.infinitygauntlet.simulation.utils

import android.graphics.Color
import android.text.Spannable
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import com.infinitygauntlet.simulation.models.TestResult
import com.infinitygauntlet.simulation.models.TestSummary
import java.text.SimpleDateFormat
import java.util.*

/**
 * Utility for formatting test reports for display.
 * 
 * Features:
 * - Console-style colored output for Android TextViews
 * - Markdown formatting
 * - CSV export
 * - Summary statistics formatting
 * - Duration formatting (ms, s, m)
 * - Pass rate calculations
 * 
 * Usage:
 * ```kotlin
 * val formatter = ReportFormatter()
 * val formatted = formatter.formatSummary(summary)
 * textView.text = formatted
 * ```
 */
class ReportFormatter {

    companion object {
        // ANSI color codes (for terminal output)
        const val RESET = "\u001B[0m"
        const val BLACK = "\u001B[30m"
        const val RED = "\u001B[31m"
        const val GREEN = "\u001B[32m"
        const val YELLOW = "\u001B[33m"
        const val BLUE = "\u001B[34m"
        const val MAGENTA = "\u001B[35m"
        const val CYAN = "\u001B[36m"
        const val WHITE = "\u001B[37m"
        
        // Android color values
        val COLOR_PASSED = Color.parseColor("#4CAF50")
        val COLOR_FAILED = Color.parseColor("#F44336")
        val COLOR_SKIPPED = Color.parseColor("#FF9800")
        val COLOR_RUNNING = Color.parseColor("#2196F3")
        val COLOR_HEADER = Color.parseColor("#6750A4")
    }

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    /**
     * Format test summary for display with colors.
     * 
     * @param summary Test summary to format
     * @return Spannable string with colored text
     */
    fun formatSummary(summary: TestSummary): SpannableString {
        val text = buildString {
            appendLine("════════════════════════════════════════")
            appendLine("           TEST SUMMARY REPORT")
            appendLine("════════════════════════════════════════")
            appendLine()
            
            appendLine("Run ID: ${summary.runId}")
            appendLine("Started: ${formatTimestamp(summary.startTime)}")
            appendLine("Completed: ${formatTimestamp(summary.endTime)}")
            appendLine("Duration: ${formatDuration(summary.totalDuration)}")
            appendLine()
            
            appendLine("────────────────────────────────────────")
            appendLine("RESULTS")
            appendLine("────────────────────────────────────────")
            appendLine("Total Tests:    ${summary.totalTests}")
            appendLine("Passed:         ${summary.passedCount} ✓")
            appendLine("Failed:         ${summary.failedCount} ✗")
            appendLine("Skipped:        ${summary.skippedCount} ⊘")
            appendLine("Pass Rate:      ${String.format("%.2f%%", summary.passRate)}")
            appendLine()
            
            if (summary.averageDuration > 0) {
                appendLine("────────────────────────────────────────")
                appendLine("PERFORMANCE")
                appendLine("────────────────────────────────────────")
                appendLine("Avg Duration:   ${formatDuration(summary.averageDuration)}")
                appendLine("Min Duration:   ${formatDuration(summary.minDuration)}")
                appendLine("Max Duration:   ${formatDuration(summary.maxDuration)}")
                appendLine()
            }
            
            appendLine("════════════════════════════════════════")
        }
        
        return applyColors(text, summary)
    }

    /**
     * Format individual test result.
     * 
     * @param result Test result to format
     * @return Spannable string with colored text
     */
    fun formatResult(result: TestResult): SpannableString {
        val text = buildString {
            val statusIcon = when (result.status) {
                "passed" -> "✓"
                "failed" -> "✗"
                "skipped" -> "⊘"
                "running" -> "▶"
                else -> "?"
            }
            
            appendLine("$statusIcon ${result.testName}")
            appendLine("  Status: ${result.status.uppercase()}")
            appendLine("  Duration: ${formatDuration(result.durationMs)}")
            appendLine("  Time: ${formatTimestamp(result.timestamp)}")
            
            if (result.failureReason != null) {
                appendLine()
                appendLine("  Error: ${result.failureReason.message}")
                appendLine("  Location: Line ${result.failureReason.line}, Column ${result.failureReason.column}")
            }
        }
        
        return applyResultColors(text, result)
    }

    /**
     * Format test results as a table.
     * 
     * @param results List of test results
     * @return Formatted table string
     */
    fun formatResultsTable(results: List<TestResult>): String {
        return buildString {
            appendLine("┌────────────────────────────────────────────────────┬──────────┬──────────────┐")
            appendLine("│ Test Name                                          │ Status   │ Duration     │")
            appendLine("├────────────────────────────────────────────────────┼──────────┼──────────────┤")
            
            results.forEach { result ->
                val name = result.testName.take(50).padEnd(50)
                val status = result.status.take(8).padEnd(8)
                val duration = formatDuration(result.durationMs).padEnd(12)
                appendLine("│ $name │ $status │ $duration │")
            }
            
            appendLine("└────────────────────────────────────────────────────┴──────────┴──────────────┘")
        }
    }

    /**
     * Format as CSV for export.
     * 
     * @param results List of test results
     * @return CSV formatted string
     */
    fun formatAsCsv(results: List<TestResult>): String {
        return buildString {
            // Header
            appendLine("Test Name,Status,Duration (ms),Timestamp,Error Message")
            
            // Rows
            results.forEach { result ->
                val errorMsg = result.failureReason?.message?.replace(",", ";") ?: ""
                appendLine("${result.testName},${result.status},${result.durationMs},${result.timestamp},$errorMsg")
            }
        }
    }

    /**
     * Format as Markdown.
     * 
     * @param summary Test summary to format
     * @return Markdown formatted string
     */
    fun formatAsMarkdown(summary: TestSummary): String {
        return buildString {
            appendLine("# Test Summary Report")
            appendLine()
            appendLine("**Run ID:** `${summary.runId}`")
            appendLine("**Started:** ${formatTimestamp(summary.startTime)}")
            appendLine("**Completed:** ${formatTimestamp(summary.endTime)}")
            appendLine("**Duration:** ${formatDuration(summary.totalDuration)}")
            appendLine()
            
            appendLine("## Results")
            appendLine()
            appendLine("| Metric | Count | Percentage |")
            appendLine("|--------|-------|------------|")
            appendLine("| Total Tests | ${summary.totalTests} | 100% |")
            appendLine("| ✅ Passed | ${summary.passedCount} | ${String.format("%.1f%%", summary.passRate)} |")
            appendLine("| ❌ Failed | ${summary.failedCount} | ${String.format("%.1f%%", 100.0 - summary.passRate)} |")
            appendLine("| ⊘ Skipped | ${summary.skippedCount} | ${String.format("%.1f%%", (summary.skippedCount.toDouble() / summary.totalTests) * 100)} |")
            appendLine()
            
            appendLine("## Performance")
            appendLine()
            appendLine("- **Average Duration:** ${formatDuration(summary.averageDuration)}")
            appendLine("- **Min Duration:** ${formatDuration(summary.minDuration)}")
            appendLine("- **Max Duration:** ${formatDuration(summary.maxDuration)}")
            appendLine()
            
            appendLine("## Test Results")
            appendLine()
            summary.results.forEach { result ->
                val icon = when (result.status) {
                    "passed" -> "✅"
                    "failed" -> "❌"
                    "skipped" -> "⊘"
                    else -> "❓"
                }
                appendLine("- $icon **${result.testName}** (${formatDuration(result.durationMs)})")
                
                if (result.failureReason != null) {
                    appendLine("  - Error: `${result.failureReason.message}`")
                }
            }
        }
    }

    /**
     * Format duration in human-readable format.
     * 
     * @param durationMs Duration in milliseconds
     * @return Formatted duration string
     */
    fun formatDuration(durationMs: Long): String {
        return when {
            durationMs < 1000 -> "${durationMs}ms"
            durationMs < 60000 -> String.format("%.2fs", durationMs / 1000.0)
            else -> {
                val minutes = durationMs / 60000
                val seconds = (durationMs % 60000) / 1000
                "${minutes}m ${seconds}s"
            }
        }
    }

    /**
     * Format timestamp.
     * 
     * @param timestamp Unix timestamp in milliseconds
     * @return Formatted timestamp string
     */
    fun formatTimestamp(timestamp: Long): String {
        return dateFormat.format(Date(timestamp))
    }

    /**
     * Format time only (no date).
     * 
     * @param timestamp Unix timestamp in milliseconds
     * @return Formatted time string
     */
    fun formatTime(timestamp: Long): String {
        return timeFormat.format(Date(timestamp))
    }

    /**
     * Apply colors to summary text.
     * 
     * @param text Plain text string
     * @param summary Test summary for determining colors
     * @return Spannable string with colors
     */
    private fun applyColors(text: String, summary: TestSummary): SpannableString {
        val spannable = SpannableString(text)
        
        // Color headers
        var start = text.indexOf("TEST SUMMARY REPORT")
        if (start >= 0) {
            spannable.setSpan(
                ForegroundColorSpan(COLOR_HEADER),
                start,
                start + "TEST SUMMARY REPORT".length,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
        
        // Color passed count
        start = text.indexOf("Passed:")
        if (start >= 0) {
            val end = text.indexOf("\n", start)
            spannable.setSpan(
                ForegroundColorSpan(COLOR_PASSED),
                start,
                end,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
        
        // Color failed count
        start = text.indexOf("Failed:")
        if (start >= 0) {
            val end = text.indexOf("\n", start)
            spannable.setSpan(
                ForegroundColorSpan(COLOR_FAILED),
                start,
                end,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
        
        // Color skipped count
        start = text.indexOf("Skipped:")
        if (start >= 0) {
            val end = text.indexOf("\n", start)
            spannable.setSpan(
                ForegroundColorSpan(COLOR_SKIPPED),
                start,
                end,
                Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
        
        return spannable
    }

    /**
     * Apply colors to result text based on status.
     * 
     * @param text Plain text string
     * @param result Test result for determining colors
     * @return Spannable string with colors
     */
    private fun applyResultColors(text: String, result: TestResult): SpannableString {
        val spannable = SpannableString(text)
        val color = when (result.status) {
            "passed" -> COLOR_PASSED
            "failed" -> COLOR_FAILED
            "skipped" -> COLOR_SKIPPED
            "running" -> COLOR_RUNNING
            else -> Color.GRAY
        }
        
        // Color the entire result
        spannable.setSpan(
            ForegroundColorSpan(color),
            0,
            text.length,
            Spannable.SPAN_EXCLUSIVE_EXCLUSIVE
        )
        
        return spannable
    }
}
