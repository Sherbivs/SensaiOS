package com.infinitygauntlet.simulation.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.infinitygauntlet.simulation.R
import com.infinitygauntlet.simulation.models.TestResult
import java.text.SimpleDateFormat
import java.util.*

/**
 * RecyclerView adapter for displaying test results in a list.
 * 
 * Features:
 * - Displays test name, status, duration, and timestamp
 * - Color-coded status indicators (pass/fail/skip/running)
 * - Expandable failure details with error messages and stack traces
 * - Efficient DiffUtil-based updates
 * - Click listeners for result details
 * 
 * @property onResultClick Callback invoked when a test result is clicked
 */
class TestResultAdapter(
    private val onResultClick: (TestResult) -> Unit = {}
) : ListAdapter<TestResult, TestResultAdapter.ResultViewHolder>(ResultDiffCallback()) {

    /**
     * ViewHolder for test result items.
     * Holds references to all UI elements in the item layout.
     */
    inner class ResultViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        private val statusIcon: ImageView = itemView.findViewById(R.id.statusIcon)
        private val testNameText: TextView = itemView.findViewById(R.id.testNameText)
        private val durationText: TextView = itemView.findViewById(R.id.durationText)
        private val timestampText: TextView = itemView.findViewById(R.id.timestampText)
        private val errorMessageText: TextView = itemView.findViewById(R.id.errorMessageText)
        private val stackTraceText: TextView = itemView.findViewById(R.id.stackTraceText)
        private val failureDetailsContainer: View = itemView.findViewById(R.id.failureDetailsContainer)
        
        private val dateFormat = SimpleDateFormat("MMM dd, yyyy HH:mm:ss", Locale.getDefault())

        /**
         * Binds a TestResult to the ViewHolder's views.
         * 
         * @param result The test result to display
         */
        fun bind(result: TestResult) {
            // Set test name
            testNameText.text = result.testName

            // Set duration with formatting
            val durationSeconds = result.getDurationSeconds()
            durationText.text = when {
                durationSeconds < 1.0 -> "%.0f ms".format(result.durationMs)
                durationSeconds < 60.0 -> "%.2f s".format(durationSeconds)
                else -> {
                    val minutes = (durationSeconds / 60).toInt()
                    val seconds = (durationSeconds % 60).toInt()
                    "${minutes}m ${seconds}s"
                }
            }

            // Set timestamp
            timestampText.text = dateFormat.format(Date(result.timestamp))

            // Set status-specific styling
            when (result.status) {
                "passed" -> {
                    statusIcon.setImageResource(R.drawable.ic_check_circle)
                    statusIcon.setColorFilter(
                        ContextCompat.getColor(itemView.context, R.color.test_passed)
                    )
                    testNameText.setTextColor(
                        ContextCompat.getColor(itemView.context, R.color.test_passed)
                    )
                    failureDetailsContainer.visibility = View.GONE
                }
                "failed" -> {
                    statusIcon.setImageResource(R.drawable.ic_error)
                    statusIcon.setColorFilter(
                        ContextCompat.getColor(itemView.context, R.color.test_failed)
                    )
                    testNameText.setTextColor(
                        ContextCompat.getColor(itemView.context, R.color.test_failed)
                    )
                    
                    // Show failure details if available
                    if (result.failureReason != null) {
                        failureDetailsContainer.visibility = View.VISIBLE
                        errorMessageText.text = result.failureReason.message
                        stackTraceText.text = result.failureReason.stackTrace
                    } else {
                        failureDetailsContainer.visibility = View.GONE
                    }
                }
                "skipped" -> {
                    statusIcon.setImageResource(R.drawable.ic_skip_next)
                    statusIcon.setColorFilter(
                        ContextCompat.getColor(itemView.context, R.color.test_skipped)
                    )
                    testNameText.setTextColor(
                        ContextCompat.getColor(itemView.context, R.color.test_skipped)
                    )
                    failureDetailsContainer.visibility = View.GONE
                }
                "running" -> {
                    statusIcon.setImageResource(R.drawable.ic_play_circle)
                    statusIcon.setColorFilter(
                        ContextCompat.getColor(itemView.context, R.color.test_running)
                    )
                    testNameText.setTextColor(
                        ContextCompat.getColor(itemView.context, R.color.test_running)
                    )
                    failureDetailsContainer.visibility = View.GONE
                }
                else -> {
                    // Unknown status
                    statusIcon.setImageResource(R.drawable.ic_help_circle)
                    statusIcon.setColorFilter(
                        ContextCompat.getColor(itemView.context, android.R.color.darker_gray)
                    )
                    testNameText.setTextColor(
                        ContextCompat.getColor(itemView.context, android.R.color.primary_text_dark)
                    )
                    failureDetailsContainer.visibility = View.GONE
                }
            }

            // Set click listener
            itemView.setOnClickListener {
                onResultClick(result)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ResultViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_test_result, parent, false)
        return ResultViewHolder(view)
    }

    override fun onBindViewHolder(holder: ResultViewHolder, position: Int) {
        holder.bind(getItem(position))
    }

    /**
     * DiffUtil callback for efficient list updates.
     * Compares TestResult objects to determine which items have changed.
     */
    private class ResultDiffCallback : DiffUtil.ItemCallback<TestResult>() {
        override fun areItemsTheSame(oldItem: TestResult, newItem: TestResult): Boolean {
            // Results are the same if they have the same test name and timestamp
            return oldItem.testName == newItem.testName && 
                   oldItem.timestamp == newItem.timestamp
        }

        override fun areContentsTheSame(oldItem: TestResult, newItem: TestResult): Boolean {
            // Check if all relevant properties are the same
            return oldItem == newItem
        }
    }

    /**
     * Convenience function to submit a list of results.
     * Wraps the submitList() method with proper lifecycle handling.
     * 
     * @param results The list of test results to display
     */
    fun submitResults(results: List<TestResult>) {
        submitList(results)
    }

    /**
     * Get the current list of results being displayed.
     * 
     * @return The current list of TestResult objects
     */
    fun getResults(): List<TestResult> {
        return currentList
    }

    /**
     * Filter results by status.
     * 
     * @param status The status to filter by ("passed", "failed", "skipped", "running")
     * @return A new adapter with filtered results
     */
    fun filterByStatus(status: String): List<TestResult> {
        return currentList.filter { it.status == status }
    }

    /**
     * Get statistics about the current results.
     * 
     * @return A map containing counts for each status
     */
    fun getStatistics(): Map<String, Int> {
        val stats = mutableMapOf(
            "total" to currentList.size,
            "passed" to 0,
            "failed" to 0,
            "skipped" to 0,
            "running" to 0
        )
        
        currentList.forEach { result ->
            when (result.status) {
                "passed" -> stats["passed"] = stats["passed"]!! + 1
                "failed" -> stats["failed"] = stats["failed"]!! + 1
                "skipped" -> stats["skipped"] = stats["skipped"]!! + 1
                "running" -> stats["running"] = stats["running"]!! + 1
            }
        }
        
        return stats
    }

    /**
     * Calculate the overall pass rate for current results.
     * 
     * @return Pass rate as a percentage (0.0 to 100.0)
     */
    fun getPassRate(): Double {
        if (currentList.isEmpty()) return 0.0
        val passed = currentList.count { it.status == "passed" }
        return (passed.toDouble() / currentList.size) * 100.0
    }

    /**
     * Get the total duration of all tests.
     * 
     * @return Total duration in milliseconds
     */
    fun getTotalDuration(): Long {
        return currentList.sumOf { it.durationMs }
    }

    /**
     * Sort results by duration (longest first).
     * 
     * @return A new list of results sorted by duration
     */
    fun sortByDuration(): List<TestResult> {
        return currentList.sortedByDescending { it.durationMs }
    }

    /**
     * Sort results by status (failed first, then skipped, then passed).
     * 
     * @return A new list of results sorted by status priority
     */
    fun sortByStatus(): List<TestResult> {
        val priorityMap = mapOf(
            "failed" to 0,
            "running" to 1,
            "skipped" to 2,
            "passed" to 3
        )
        return currentList.sortedBy { priorityMap[it.status] ?: 999 }
    }
}
