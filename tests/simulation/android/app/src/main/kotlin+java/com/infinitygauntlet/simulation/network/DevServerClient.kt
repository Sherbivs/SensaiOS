package com.infinitygauntlet.simulation.network

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * API Client for communicating with the development server
 * Sends test results, logs, and status updates back to the dev machine
 */
object DevServerClient {
    private const val TAG = "DevServerClient"
    
    // CONFIGURE THIS: Replace with your development machine's IP
    // Run dev-server.js to see the correct IP address
    private var baseUrl = "http://192.168.1.100:8080" // Default, will be auto-configured
    
    private var isEnabled = true
    private var connectionAttempts = 0
    private var lastSuccessfulConnection: Long = 0
    
    /**
     * Initialize the client with the dev server URL
     * @param url Base URL of the development server (e.g., "http://192.168.1.100:8080")
     */
    fun configure(url: String) {
        baseUrl = url.trim().removeSuffix("/")
        Log.i(TAG, "Configured with base URL: $baseUrl")
    }
    
    /**
     * Enable or disable server communication
     */
    fun setEnabled(enabled: Boolean) {
        isEnabled = enabled
        Log.i(TAG, "Server communication ${if (enabled) "enabled" else "disabled"}")
    }
    
    /**
     * Ping the server to check if it's reachable
     * @return true if server responds, false otherwise
     */
    suspend fun ping(): Boolean = withContext(Dispatchers.IO) {
        if (!isEnabled) return@withContext false
        
        try {
            val url = URL("$baseUrl/ping")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 3000
            connection.readTimeout = 3000
            
            val responseCode = connection.responseCode
            if (responseCode == 200) {
                val response = BufferedReader(InputStreamReader(connection.inputStream)).readText()
                Log.d(TAG, "Ping successful: $response")
                lastSuccessfulConnection = System.currentTimeMillis()
                connectionAttempts = 0
                return@withContext true
            }
        } catch (e: Exception) {
            connectionAttempts++
            Log.w(TAG, "Ping failed (attempt $connectionAttempts): ${e.message}")
        }
        return@withContext false
    }
    
    /**
     * Send a log message to the dev server
     */
    suspend fun sendLog(level: String, message: String, tag: String = TAG) = 
        withContext(Dispatchers.IO) {
            if (!isEnabled) return@withContext
            
            try {
                val json = JSONObject().apply {
                    put("timestamp", System.currentTimeMillis())
                    put("level", level)
                    put("tag", tag)
                    put("message", message)
                }
                
                postJson("/log", json)
                Log.v(TAG, "Sent log to dev server: [$level] $message")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send log: ${e.message}")
            }
        }
    
    /**
     * Send a test result to the dev server
     */
    suspend fun sendTestResult(
        testId: String,
        testName: String,
        status: String,
        duration: Long,
        message: String? = null,
        stackTrace: String? = null
    ) = withContext(Dispatchers.IO) {
        if (!isEnabled) return@withContext
        
        try {
            val json = JSONObject().apply {
                put("testId", testId)
                put("testName", testName)
                put("status", status)
                put("duration", duration)
                put("timestamp", System.currentTimeMillis())
                message?.let { put("message", it) }
                stackTrace?.let { put("stackTrace", it) }
            }
            
            postJson("/test-result", json)
            Log.i(TAG, "Sent test result: $testName - $status")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send test result: ${e.message}")
        }
    }
    
    /**
     * Send a batch of test results to the dev server
     */
    suspend fun sendTestBatch(
        batchId: String,
        tests: List<Map<String, Any>>,
        passed: Int,
        failed: Int,
        skipped: Int,
        totalDuration: Long
    ) = withContext(Dispatchers.IO) {
        if (!isEnabled) return@withContext
        
        try {
            val json = JSONObject().apply {
                put("batchId", batchId)
                put("timestamp", System.currentTimeMillis())
                put("passed", passed)
                put("failed", failed)
                put("skipped", skipped)
                put("totalDuration", totalDuration)
                put("tests", org.json.JSONArray(tests))
            }
            
            postJson("/test-batch", json)
            Log.i(TAG, "Sent test batch: $batchId (${tests.size} tests)")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send test batch: ${e.message}")
        }
    }
    
    /**
     * Send a generic POST request with JSON body
     */
    private fun postJson(endpoint: String, json: JSONObject): Boolean {
        return try {
            val url = URL("$baseUrl$endpoint")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.doOutput = true
            
            // Write JSON body
            val writer = OutputStreamWriter(connection.outputStream)
            writer.write(json.toString())
            writer.flush()
            writer.close()
            
            // Check response
            val responseCode = connection.responseCode
            if (responseCode == 200) {
                lastSuccessfulConnection = System.currentTimeMillis()
                connectionAttempts = 0
                true
            } else {
                Log.w(TAG, "Server returned $responseCode for $endpoint")
                false
            }
        } catch (e: Exception) {
            connectionAttempts++
            if (connectionAttempts <= 3) {
                Log.w(TAG, "POST $endpoint failed: ${e.message}")
            }
            false
        }
    }
    
    /**
     * Get connection status info
     */
    fun getStatus(): Map<String, Any> {
        return mapOf(
            "enabled" to isEnabled,
            "baseUrl" to baseUrl,
            "connectionAttempts" to connectionAttempts,
            "lastSuccess" to lastSuccessfulConnection,
            "timeSinceLastSuccess" to (System.currentTimeMillis() - lastSuccessfulConnection)
        )
    }
}

/**
 * Extension functions for easy logging
 */
suspend fun Context.logToDevServer(level: String, message: String) {
    DevServerClient.sendLog(level, message, this::class.java.simpleName)
}

suspend fun Context.logInfo(message: String) = logToDevServer("info", message)
suspend fun Context.logWarn(message: String) = logToDevServer("warn", message)
suspend fun Context.logError(message: String) = logToDevServer("error", message)
