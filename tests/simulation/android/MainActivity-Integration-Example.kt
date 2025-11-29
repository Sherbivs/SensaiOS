// Add this to your MainActivity.kt to enable dev server callbacks

package com.infinitygauntlet.simulation

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.infinitygauntlet.simulation.network.DevServerClient
import com.infinitygauntlet.simulation.network.DevServerDiscovery
import com.infinitygauntlet.simulation.network.logInfo
import com.infinitygauntlet.simulation.network.logWarn
import com.infinitygauntlet.simulation.network.logError
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        // Initialize dev server connection
        initializeDevServer()
        
        // Your existing code here...
    }
    
    /**
     * Initialize connection to development server
     * Automatically discovers server on local network
     */
    private fun initializeDevServer() {
        GlobalScope.launch {
            try {
                // Attempt auto-discovery
                logInfo("Searching for development server...")
                val serverUrl = DevServerDiscovery.discover(this@MainActivity)
                
                if (serverUrl != null) {
                    // Server found via auto-discovery
                    DevServerClient.configure(serverUrl)
                    DevServerClient.setEnabled(true)
                    
                    // Test connection
                    if (DevServerClient.ping()) {
                        logInfo("✅ Connected to dev server at $serverUrl")
                        runOnUiThread {
                            Toast.makeText(
                                this@MainActivity,
                                "Connected to dev server",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                } else {
                    // Fallback to manual configuration
                    // Replace with your development machine's IP
                    val fallbackUrl = "http://192.168.23.83:8080"
                    logWarn("Auto-discovery failed, trying fallback: $fallbackUrl")
                    
                    DevServerClient.configure(fallbackUrl)
                    DevServerClient.setEnabled(true)
                    
                    if (DevServerClient.ping()) {
                        logInfo("✅ Connected to dev server at $fallbackUrl")
                    } else {
                        logWarn("❌ Could not connect to dev server")
                    }
                }
            } catch (e: Exception) {
                logError("Failed to initialize dev server: ${e.message}")
            }
        }
    }
    
    /**
     * Example: Send test result to dev server
     */
    private fun reportTestResult(testName: String, passed: Boolean, duration: Long) {
        GlobalScope.launch {
            DevServerClient.sendTestResult(
                testId = "test-${System.currentTimeMillis()}",
                testName = testName,
                status = if (passed) "passed" else "failed",
                duration = duration,
                message = if (passed) "Test completed successfully" else "Test failed"
            )
        }
    }
    
    /**
     * Example: Send batch test results
     */
    private fun reportTestBatch(results: List<TestResult>) {
        GlobalScope.launch {
            val passed = results.count { it.passed }
            val failed = results.count { !it.passed }
            val totalDuration = results.sumOf { it.duration }
            
            val testMaps = results.map { result ->
                mapOf(
                    "testId" to result.id,
                    "testName" to result.name,
                    "status" to if (result.passed) "passed" else "failed",
                    "duration" to result.duration
                )
            }
            
            DevServerClient.sendTestBatch(
                batchId = "batch-${System.currentTimeMillis()}",
                tests = testMaps,
                passed = passed,
                failed = failed,
                skipped = 0,
                totalDuration = totalDuration
            )
        }
    }
    
    // Data class for test results (example)
    data class TestResult(
        val id: String,
        val name: String,
        val passed: Boolean,
        val duration: Long
    )
}

/**
 * USAGE EXAMPLES:
 * 
 * // Send a log message
 * GlobalScope.launch {
 *     logInfo("User selected Bulbasaur")
 *     logWarn("Network connection unstable")
 *     logError("Failed to load Pokemon data")
 * }
 * 
 * // Send a test result
 * GlobalScope.launch {
 *     DevServerClient.sendTestResult(
 *         testId = "test-001",
 *         testName = "Starter Pokemon Selection",
 *         status = "passed",
 *         duration = 1234
 *     )
 * }
 * 
 * // Check connection status
 * val status = DevServerClient.getStatus()
 * Log.d("DevServer", "Status: $status")
 */
