package com.infinitygauntlet.simulation.adapters

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.google.android.material.progressindicator.LinearProgressIndicator
import com.infinitygauntlet.simulation.R
import com.infinitygauntlet.simulation.domain.models.TestScenario
import com.infinitygauntlet.simulation.domain.models.TestStatus

/**
 * RecyclerView Adapter for TestScenario list
 * Displays test scenarios with run buttons and progress
 */
class TestScenarioAdapter(
    private val onRunClick: (TestScenario) -> Unit,
    private val onDetailsClick: (TestScenario) -> Unit
) : ListAdapter<TestScenario, TestScenarioAdapter.ViewHolder>(DiffCallback()) {
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_test_scenario, parent, false)
        return ViewHolder(view, onRunClick, onDetailsClick)
    }
    
    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }
    
    class ViewHolder(
        itemView: View,
        private val onRunClick: (TestScenario) -> Unit,
        private val onDetailsClick: (TestScenario) -> Unit
    ) : RecyclerView.ViewHolder(itemView) {
        
        private val nameText: TextView = itemView.findViewById(R.id.scenarioName)
        private val descriptionText: TextView = itemView.findViewById(R.id.scenarioDescription)
        private val statsText: TextView = itemView.findViewById(R.id.scenarioStats)
        private val statusText: TextView = itemView.findViewById(R.id.scenarioStatus)
        private val progressBar: LinearProgressIndicator = itemView.findViewById(R.id.scenarioProgress)
        private val runButton: MaterialButton = itemView.findViewById(R.id.runButton)
        
        fun bind(scenario: TestScenario) {
            nameText.text = scenario.name
            descriptionText.text = scenario.description
            statsText.text = "${scenario.testCount} tests • ${scenario.estimatedDuration / 1000.0}s"
            
            // Update status
            when (scenario.status) {
                TestStatus.READY -> {
                    statusText.text = "Ready"
                    statusText.setTextColor(itemView.context.getColor(android.R.color.darker_gray))
                    progressBar.visibility = View.GONE
                    runButton.isEnabled = true
                    runButton.text = "Run"
                }
                TestStatus.RUNNING -> {
                    statusText.text = "Running..."
                    statusText.setTextColor(itemView.context.getColor(android.R.color.holo_blue_dark))
                    progressBar.visibility = View.VISIBLE
                    progressBar.isIndeterminate = true
                    runButton.isEnabled = false
                    runButton.text = "Running"
                }
                TestStatus.PASSED -> {
                    val successRate = String.format("%.1f%%", scenario.successRate)
                    statusText.text = "Passed ($successRate)"
                    statusText.setTextColor(itemView.context.getColor(android.R.color.holo_green_dark))
                    progressBar.visibility = View.VISIBLE
                    progressBar.isIndeterminate = false
                    progressBar.progress = scenario.successRate.toInt()
                    runButton.isEnabled = true
                    runButton.text = "Re-run"
                }
                TestStatus.FAILED -> {
                    val successRate = String.format("%.1f%%", scenario.successRate)
                    statusText.text = "Failed ($successRate)"
                    statusText.setTextColor(itemView.context.getColor(android.R.color.holo_red_dark))
                    progressBar.visibility = View.VISIBLE
                    progressBar.isIndeterminate = false
                    progressBar.progress = scenario.successRate.toInt()
                    runButton.isEnabled = true
                    runButton.text = "Re-run"
                }
            }
            
            // Set click listeners
            runButton.setOnClickListener { onRunClick(scenario) }
            itemView.setOnClickListener { onDetailsClick(scenario) }
        }
    }
    
    private class DiffCallback : DiffUtil.ItemCallback<TestScenario>() {
        override fun areItemsTheSame(oldItem: TestScenario, newItem: TestScenario): Boolean {
            return oldItem.id == newItem.id
        }
        
        override fun areContentsTheSame(oldItem: TestScenario, newItem: TestScenario): Boolean {
            return oldItem == newItem
        }
    }
}
