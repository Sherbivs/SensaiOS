package com.infinitygauntlet.simulation

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.snackbar.Snackbar
import com.infinitygauntlet.simulation.adapters.TestScenarioAdapter
import com.infinitygauntlet.simulation.models.TestScenario
import com.infinitygauntlet.simulation.viewmodels.TestViewModel

/**
 * Main activity displaying list of test scenarios
 * User can run individual scenarios or all tests at once
 */
class MainActivity : AppCompatActivity() {
    
    private lateinit var viewModel: TestViewModel
    private lateinit var adapter: TestScenarioAdapter
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Setup toolbar
        setSupportActionBar(findViewById(R.id.toolbar))
        supportActionBar?.title = "Simulation Tests"
        
        // Initialize ViewModel
        viewModel = ViewModelProvider(this)[TestViewModel::class.java]
        
        // Setup RecyclerView
        setupRecyclerView()
        
        // Observe test scenarios
        observeScenarios()
        
        // Setup buttons
        setupButtons()
        
        // Load scenarios
        viewModel.loadScenarios()
    }
    
    private fun setupRecyclerView() {
        adapter = TestScenarioAdapter(
            onRunClick = { scenario -> runScenario(scenario) },
            onDetailsClick = { scenario -> showScenarioDetails(scenario) }
        )
        
        findViewById<androidx.recyclerview.widget.RecyclerView>(R.id.scenariosRecyclerView).apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = this@MainActivity.adapter
        }
    }
    
    private fun observeScenarios() {
        viewModel.scenarios.observe(this) { scenarios ->
            adapter.submitList(scenarios)
            updateStatistics(scenarios)
        }
        
        viewModel.testResults.observe(this) { result ->
            showTestResults(result)
        }
        
        viewModel.isRunning.observe(this) { isRunning ->
            findViewById<com.google.android.material.button.MaterialButton>(R.id.runAllButton).isEnabled = !isRunning
            findViewById<android.widget.ProgressBar>(R.id.progressBar).visibility = 
                if (isRunning) View.VISIBLE else View.GONE
        }
    }
    
    private fun setupButtons() {
        findViewById<com.google.android.material.button.MaterialButton>(R.id.runAllButton).setOnClickListener {
            runAllScenarios()
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.chatUiButton).setOnClickListener {
            openChatUI()
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.reportsButton).setOnClickListener {
            openReports()
        }
    }
    
    private fun runScenario(scenario: TestScenario) {
        viewModel.runScenario(scenario)
        Snackbar.make(
            findViewById(android.R.id.content),
            "Running ${scenario.name}...",
            Snackbar.LENGTH_SHORT
        ).show()
    }
    
    private fun runAllScenarios() {
        viewModel.runAllScenarios()
        Snackbar.make(
            findViewById(android.R.id.content),
            "Running all 143 tests...",
            Snackbar.LENGTH_LONG
        ).show()
    }
    
    private fun openChatUI() {
        val intent = Intent(this, ChatUIActivity::class.java)
        startActivity(intent)
    }
    
    private fun openReports() {
        val intent = Intent(this, ReportViewerActivity::class.java)
        startActivity(intent)
    }
    
    private fun showScenarioDetails(scenario: TestScenario) {
        // TODO: Show bottom sheet with scenario details
        Snackbar.make(
            findViewById(android.R.id.content),
            "${scenario.name}: ${scenario.testCount} tests, ~${scenario.estimatedDuration}ms",
            Snackbar.LENGTH_LONG
        ).show()
    }
    
    private fun showTestResults(result: com.infinitygauntlet.simulation.models.TestResult) {
        val intent = Intent(this, ReportViewerActivity::class.java).apply {
            putExtra("RESULT_JSON", result.toJson())
        }
        startActivity(intent)
    }
    
    private fun updateStatistics(scenarios: List<TestScenario>) {
        val totalTests = scenarios.sumOf { it.testCount }
        val totalDuration = scenarios.sumOf { it.estimatedDuration }
        
        findViewById<android.widget.TextView>(R.id.statsText).text = 
            "$totalTests tests • ${totalDuration / 1000.0}s"
    }
    
    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_settings -> {
                Snackbar.make(
                    findViewById(android.R.id.content),
                    "Settings coming soon",
                    Snackbar.LENGTH_SHORT
                ).show()
                true
            }
            R.id.action_about -> {
                Snackbar.make(
                    findViewById(android.R.id.content),
                    "Infinity Gauntlet Simulation v1.0.0",
                    Snackbar.LENGTH_SHORT
                ).show()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}
