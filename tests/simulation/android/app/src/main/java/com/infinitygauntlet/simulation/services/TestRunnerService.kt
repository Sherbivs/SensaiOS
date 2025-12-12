package com.infinitygauntlet.simulation.services

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Binder
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.infinitygauntlet.simulation.R
import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.domain.models.ResultStatus
import com.infinitygauntlet.simulation.domain.models.TestScenario
import com.infinitygauntlet.simulation.domain.models.TestSummary
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.*

/**
 * Background service for running test scenarios.
 * 
 * Features:
 * - Runs tests in background with foreground notification
 * - Provides real-time progress updates via StateFlow
 * - Supports pause/resume/cancel operations
 * - Generates test summaries automatically
 * - Handles test execution lifecycle
 * 
 * Usage:
 * ```kotlin
 * val intent = Intent(context, TestRunnerService::class.java)
 * intent.putExtra("scenarios", ArrayList(scenarios))
 * context.startService(intent)
 * ```
 */
class TestRunnerService : Service() {

    companion object {
        private const val NOTIFICATION_CHANNEL_ID = "test_runner_channel"
        private const val NOTIFICATION_ID = 1001
        private const val ACTION_PAUSE = "com.infinitygauntlet.simulation.ACTION_PAUSE"
        private const val ACTION_RESUME = "com.infinitygauntlet.simulation.ACTION_RESUME"
        private const val ACTION_CANCEL = "com.infinitygauntlet.simulation.ACTION_CANCEL"
    }

    private val binder = TestRunnerBinder()
    private val serviceScope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    // State management
    private val _testState = MutableStateFlow<TestState>(TestState.Idle)
    val testState: StateFlow<TestState> = _testState.asStateFlow()
    
    private val _currentProgress = MutableStateFlow(TestProgress())
    val currentProgress: StateFlow<TestProgress> = _currentProgress.asStateFlow()
    
    private val _results = MutableStateFlow<List<TestResult>>(emptyList())
    val results: StateFlow<List<TestResult>> = _results.asStateFlow()
    
    private var currentJob: Job? = null
    private var isPaused = false
    private val pauseLock = Any()

    inner class TestRunnerBinder : Binder() {
        fun getService(): TestRunnerService = this@TestRunnerService
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PAUSE -> pauseTests()
            ACTION_RESUME -> resumeTests()
            ACTION_CANCEL -> cancelTests()
            else -> {
                // Start new test run
                val scenarios = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent?.getParcelableArrayListExtra("scenarios", TestScenario::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent?.getParcelableArrayListExtra("scenarios")
                } ?: emptyList()
                
                if (scenarios.isNotEmpty()) {
                    startTests(scenarios)
                }
            }
        }
        
        return START_STICKY
    }

    /**
     * Start running test scenarios.
     * 
     * @param scenarios List of test scenarios to execute
     */
    private fun startTests(scenarios: List<TestScenario>) {
        if (_testState.value is TestState.Running) {
            // Already running, ignore
            return
        }
        
        // Start foreground service with proper type (Android 14+ / API 34+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                NOTIFICATION_ID,
                createNotification("Starting tests...", 0, scenarios.size),
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, createNotification("Starting tests...", 0, scenarios.size))
        }
        
        _testState.value = TestState.Running(System.currentTimeMillis())
        _results.value = emptyList()
        _currentProgress.value = TestProgress(
            totalTests = scenarios.size,
            completedTests = 0,
            currentTestName = ""
        )
        
        currentJob = serviceScope.launch {
            try {
                runTests(scenarios)
            } catch (e: CancellationException) {
                _testState.value = TestState.Cancelled
            } catch (e: Exception) {
                _testState.value = TestState.Error(e.message ?: "Unknown error")
            }
        }
    }

    /**
     * Execute all test scenarios sequentially.
     * 
     * @param scenarios List of test scenarios to run
     */
    private suspend fun runTests(scenarios: List<TestScenario>) {
        val results = mutableListOf<TestResult>()
        
        scenarios.forEachIndexed { index, scenario ->
            // Check for pause
            checkPauseState()
            
            // Update progress
            _currentProgress.value = _currentProgress.value.copy(
                completedTests = index,
                currentTestName = scenario.name
            )
            
            // Update notification
            updateNotification(
                "Running: ${scenario.name}",
                index,
                scenarios.size
            )
            
            // Run the test
            val result = executeTest(scenario)
            results.add(result)
            _results.value = results.toList()
            
            // Small delay between tests
            delay(100)
        }
        
        // All tests complete
        _currentProgress.value = _currentProgress.value.copy(
            completedTests = scenarios.size,
            currentTestName = "Complete"
        )
        
        val summary = TestSummary.fromResults(results, "android-service")
        _testState.value = TestState.Completed(summary)
        
        updateNotification(
            "Tests complete: ${summary.passedCount}/${summary.totalTests} passed",
            scenarios.size,
            scenarios.size
        )
        
        // Stop foreground after a delay
        serviceScope.launch {
            delay(3000)
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
        }
    }

    /**
     * Execute a single test scenario.
     * 
     * @param scenario The test scenario to execute
     * @return The test result
     */
    private suspend fun executeTest(scenario: TestScenario): TestResult {
        val startTime = System.currentTimeMillis()
        
        return withContext(Dispatchers.Default) {
            try {
                // Simulate test execution
                // In a real implementation, this would call the actual test logic
                delay(scenario.estimatedDuration)
                
                // Determine outcome (simulate based on scenario properties)
                val passed = Random().nextDouble() < (scenario.successRate / 100.0)
                
                TestResult(
                    scenarioId = scenario.id,
                    scenarioName = scenario.name,
                    status = if (passed) ResultStatus.PASSED else ResultStatus.FAILED,
                    durationMs = System.currentTimeMillis() - startTime,
                    executionTimestamp = startTime,
                    errorMessage = if (!passed) "Simulated failure for ${scenario.name}" else null
                )
            } catch (e: Exception) {
                TestResult(
                    scenarioId = scenario.id,
                    scenarioName = scenario.name,
                    status = ResultStatus.FAILED,
                    durationMs = System.currentTimeMillis() - startTime,
                    executionTimestamp = startTime,
                    errorMessage = e.message ?: "Unknown error"
                )
            }
        }
    }

    /**
     * Check if service is paused and wait if necessary.
     */
    private suspend fun checkPauseState() {
        while (isPaused) {
            delay(100)
        }
    }

    /**
     * Pause test execution.
     */
    private fun pauseTests() {
        synchronized(pauseLock) {
            if (_testState.value is TestState.Running && !isPaused) {
                isPaused = true
                _testState.value = TestState.Paused
                updateNotification("Tests paused", 0, 0)
            }
        }
    }

    /**
     * Resume test execution.
     */
    private fun resumeTests() {
        synchronized(pauseLock) {
            if (isPaused) {
                isPaused = false
                _testState.value = TestState.Running(System.currentTimeMillis())
            }
        }
    }

    /**
     * Cancel test execution.
     */
    private fun cancelTests() {
        currentJob?.cancel()
        _testState.value = TestState.Cancelled
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /**
     * Create notification channel for test runner.
     */
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Test Runner",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows progress of running tests"
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }

    /**
     * Create notification for foreground service.
     */
    private fun createNotification(text: String, progress: Int, max: Int): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Running Tests")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_test)
            .setProgress(max, progress, max == 0)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    /**
     * Update foreground notification.
     */
    private fun updateNotification(text: String, progress: Int, max: Int) {
        val notification = createNotification(text, progress, max)
        val notificationManager = getSystemService(NotificationManager::class.java)
        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        super.onDestroy()
        currentJob?.cancel()
        serviceScope.cancel()
    }

    /**
     * Sealed class representing test execution states.
     */
    sealed class TestState {
        object Idle : TestState()
        data class Running(val startTime: Long) : TestState()
        object Paused : TestState()
        data class Completed(val summary: TestSummary) : TestState()
        object Cancelled : TestState()
        data class Error(val message: String) : TestState()
    }

    /**
     * Data class for test progress tracking.
     */
    data class TestProgress(
        val totalTests: Int = 0,
        val completedTests: Int = 0,
        val currentTestName: String = ""
    ) {
        val percentComplete: Int
            get() = if (totalTests > 0) (completedTests * 100) / totalTests else 0
    }
}
