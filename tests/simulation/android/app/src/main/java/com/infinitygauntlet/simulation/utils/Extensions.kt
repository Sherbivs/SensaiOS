package com.infinitygauntlet.simulation.utils

import android.content.Context
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.recyclerview.widget.RecyclerView
import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.domain.models.ResultStatus
import com.infinitygauntlet.simulation.domain.models.TestScenario
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

/**
 * Kotlin extension functions for Android simulation.
 * 
 * Categories:
 * - View extensions (visibility, keyboard)
 * - Context extensions (toast, resources)
 * - Collection extensions (filtering, grouping)
 * - Date/Time extensions (formatting)
 * - Test-specific extensions (statistics, validation)
 */

// ═════════════════════════════════════════════════════════════════════════
// VIEW EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Show view with fade-in animation.
 */
fun View.show() {
    visibility = View.VISIBLE
    alpha = 0f
    animate().alpha(1f).setDuration(200).start()
}

/**
 * Hide view with fade-out animation.
 */
fun View.hide() {
    animate().alpha(0f).setDuration(200).withEndAction {
        visibility = View.GONE
    }.start()
}

/**
 * Toggle view visibility.
 */
fun View.toggleVisibility() {
    visibility = if (visibility == View.VISIBLE) View.GONE else View.VISIBLE
}

/**
 * Enable or disable view with visual feedback.
 */
fun View.setEnabled(enabled: Boolean) {
    isEnabled = enabled
    alpha = if (enabled) 1.0f else 0.5f
}

/**
 * Hide keyboard for this view.
 */
fun View.hideKeyboard() {
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    imm.hideSoftInputFromWindow(windowToken, 0)
}

/**
 * Show keyboard for this view.
 */
fun View.showKeyboard() {
    requestFocus()
    val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
    imm.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
}

// ═════════════════════════════════════════════════════════════════════════
// CONTEXT EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Show a short toast message.
 */
fun Context.toast(message: String) {
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
}

/**
 * Show a long toast message.
 */
fun Context.toastLong(message: String) {
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}

/**
 * Get color from resources with compatibility.
 */
fun Context.getColorCompat(colorRes: Int): Int {
    return if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
        getColor(colorRes)
    } else {
        @Suppress("DEPRECATION")
        resources.getColor(colorRes)
    }
}

// ═════════════════════════════════════════════════════════════════════════
// RECYCLERVIEW EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Scroll to top with animation.
 */
fun RecyclerView.scrollToTop() {
    smoothScrollToPosition(0)
}

/**
 * Scroll to bottom with animation.
 */
fun RecyclerView.scrollToBottom() {
    adapter?.let {
        if (it.itemCount > 0) {
            smoothScrollToPosition(it.itemCount - 1)
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════
// COLLECTION EXTENSIONS (TEST-SPECIFIC)
// ═════════════════════════════════════════════════════════════════════════

/**
 * Filter test results by status.
 */
fun List<TestResult>.filterByStatus(status: ResultStatus): List<TestResult> {
    return filter { it.status == status }
}

/**
 * Get only passed tests.
 */
fun List<TestResult>.passed(): List<TestResult> = filterByStatus(ResultStatus.PASSED)

/**
 * Get only failed tests.
 */
fun List<TestResult>.failed(): List<TestResult> = filterByStatus(ResultStatus.FAILED)

/**
 * Get only skipped tests.
 */
fun List<TestResult>.skipped(): List<TestResult> = filterByStatus(ResultStatus.SKIPPED)

/**
 * Calculate pass rate for test results.
 */
val List<TestResult>.passRate: Double get() = run {
    if (isEmpty()) return 0.0
    val passedCount = count { it.status == ResultStatus.PASSED }
    return (passedCount.toDouble() / size) * 100.0
}

/**
 * Calculate total duration of test results.
 */
fun List<TestResult>.totalDuration(): Long {
    return sumOf { it.durationMs.toLong() }
}

/**
 * Calculate average duration of test results.
 */
fun List<TestResult>.averageDuration(): Long {
    if (isEmpty()) return 0
    return totalDuration() / size
}

/**
 * Get slowest test result.
 */
fun List<TestResult>.slowest(): TestResult? {
    return maxByOrNull { it.durationMs }
}

/**
 * Get fastest test result.
 */
fun List<TestResult>.fastest(): TestResult? {
    return minByOrNull { it.durationMs }
}

/**
 * Group test results by status.
 */
fun List<TestResult>.groupByStatus(): Map<ResultStatus, List<TestResult>> {
    return groupBy { it.status }
}

/**
 * Filter test scenarios by category.
 */
fun List<TestScenario>.filterByCategory(category: String): List<TestScenario> {
    return filter { it.category == category }
}

/**
 * Calculate total estimated duration for scenarios.
 */
fun List<TestScenario>.totalEstimatedDuration(): Long {
    return sumOf { it.estimatedDuration }
}

// ═════════════════════════════════════════════════════════════════════════
// DATE/TIME EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Format Long timestamp to date string.
 */
fun Long.toDateString(): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    return formatter.format(Date(this))
}

/**
 * Format Long timestamp to time only.
 */
fun Long.toTimeString(): String {
    val formatter = SimpleDateFormat("HH:mm:ss", Locale.getDefault())
    return formatter.format(Date(this))
}

/**
 * Format Long duration to human-readable string.
 */
fun Long.toDurationString(): String {
    return when {
        this < 1000 -> "${this}ms"
        this < 60000 -> String.format("%.2fs", this / 1000.0)
        else -> {
            val minutes = this / 60000
            val seconds = (this % 60000) / 1000
            "${minutes}m ${seconds}s"
        }
    }
}

/**
 * Get time ago string (e.g., "2 minutes ago").
 */
fun Long.toTimeAgo(): String {
    val now = System.currentTimeMillis()
    val diff = now - this
    
    return when {
        diff < 60000 -> "Just now"
        diff < 3600000 -> "${diff / 60000} minutes ago"
        diff < 86400000 -> "${diff / 3600000} hours ago"
        else -> "${diff / 86400000} days ago"
    }
}

// ═════════════════════════════════════════════════════════════════════════
// STRING EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Truncate string to max length with ellipsis.
 */
fun String.truncate(maxLength: Int): String {
    return if (length <= maxLength) this else "${take(maxLength - 3)}..."
}

/**
 * Capitalize first letter of each word.
 */
fun String.titleCase(): String {
    return split(" ").joinToString(" ") { word ->
        word.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
    }
}

/**
 * Convert string to status emoji.
 */
fun String.toStatusEmoji(): String {
    return when (this.lowercase()) {
        "passed" -> "✅"
        "failed" -> "❌"
        "skipped" -> "⊘"
        "running" -> "▶️"
        else -> "❓"
    }
}

// ═════════════════════════════════════════════════════════════════════════
// COROUTINE EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Debounce function calls.
 */
fun <T> debounce(
    waitMs: Long = 300L,
    coroutineScope: CoroutineScope,
    action: (T) -> Unit
): (T) -> Unit {
    var debounceJob: kotlinx.coroutines.Job? = null
    return { param: T ->
        debounceJob?.cancel()
        debounceJob = coroutineScope.launch {
            delay(waitMs)
            action(param)
        }
    }
}

/**
 * Throttle function calls.
 */
fun <T> throttle(
    skipMs: Long = 300L,
    coroutineScope: CoroutineScope,
    action: (T) -> Unit
): (T) -> Unit {
    var throttleJob: kotlinx.coroutines.Job? = null
    return { param: T ->
        if (throttleJob?.isCompleted != false) {
            throttleJob = coroutineScope.launch {
                action(param)
                delay(skipMs)
            }
        }
    }
}

// ═════════════════════════════════════════════════════════════════════════
// VALIDATION EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Check if test result is successful.
 */
fun TestResult.isSuccess(): Boolean = status == ResultStatus.PASSED

/**
 * Check if test result is failure.
 */
fun TestResult.isFailure(): Boolean = status == ResultStatus.FAILED

/**
 * Check if test result is skipped.
 */
fun TestResult.isSkipped(): Boolean = status == ResultStatus.SKIPPED

/**
 * Check if test result is still running.
 */
fun TestResult.isRunning(): Boolean = status == ResultStatus.RUNNING

/**
 * Get duration in seconds.
 */
fun TestResult.formatDuration(): Double = durationMs / 1000.0

/**
 * Check if test scenario has high pass rate (>= 80%).
 */
fun TestScenario.hasHighPassRate(): Boolean = successRate >= 80.0

/**
 * Check if test scenario is long-running (> 5 seconds).
 */
fun TestScenario.isLongRunning(): Boolean = estimatedDuration > 5000

/**
 * Check if test scenario is critical.
 */
fun TestScenario.isCritical(): Boolean {
    return category in listOf(
        "ONBOARDING",
        "BATTLE_SYSTEM"
    )
}

// ═════════════════════════════════════════════════════════════════════════
// NUMBER EXTENSIONS
// ═════════════════════════════════════════════════════════════════════════

/**
 * Format Double as percentage string.
 */
fun Double.toPercentString(): String = String.format("%.2f%%", this)

/**
 * Format Int as ordinal (1st, 2nd, 3rd, etc.).
 */
fun Int.toOrdinal(): String {
    val suffix = when {
        this % 100 in 11..13 -> "th"
        this % 10 == 1 -> "st"
        this % 10 == 2 -> "nd"
        this % 10 == 3 -> "rd"
        else -> "th"
    }
    return "$this$suffix"
}

/**
 * Clamp value between min and max.
 */
fun Int.clamp(min: Int, max: Int): Int = when {
    this < min -> min
    this > max -> max
    else -> this
}

/**
 * Clamp value between min and max.
 */
fun Double.clamp(min: Double, max: Double): Double = when {
    this < min -> min
    this > max -> max
    else -> this
}
