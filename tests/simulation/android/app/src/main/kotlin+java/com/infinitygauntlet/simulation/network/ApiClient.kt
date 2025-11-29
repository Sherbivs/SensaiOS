package com.infinitygauntlet.simulation.network

import android.content.Context
import android.util.Log
import com.infinitygauntlet.simulation.config.AppConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * API Client for communicating with the local development server
 * 
 * This client handles all network communication between the Android app
 * and the local dev server running on your development machine.
 * 
 * Configuration is loaded from AppConfig (auto-generated from environment variables)
 */
class ApiClient(context: Context) {
    
    companion object {
        private const val TAG = "ApiClient"
        
        // Configuration loaded from AppConfig (generated from environment variables)
        private val BASE_URL = AppConfig.API_BASE_URL
        private val TIMEOUT_MS = AppConfig.TIMEOUT_MS
    }
    
    private var sessionId: String? = null
    
    /**
     * Test server connectivity
     */
    suspend fun testConnection(): Result<Boolean> = withContext(Dispatchers.IO) {
        try {
            val response = get("/health")
            if (response.isSuccess) {
                val data = response.getOrNull()
                Log.i(TAG, "Server health: $data")
                Result.success(true)
            } else {
                Result.failure(response.exceptionOrNull() ?: Exception("Health check failed"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Connection test failed", e)
            Result.failure(e)
        }
    }
    
    /**
     * Create a new test session
     */
    suspend fun createSession(deviceInfo: Map<String, String>): Result<String> = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("deviceInfo", JSONObject(deviceInfo))
            }
            
            val response = post("/session", body)
            if (response.isSuccess) {
                val data = response.getOrNull() as? JSONObject
                val newSessionId = data?.optString("sessionId")
                if (newSessionId != null) {
                    sessionId = newSessionId
                    Log.i(TAG, "Session created: $sessionId")
                    Result.success(newSessionId)
                } else {
                    Result.failure(Exception("No sessionId in response"))
                }
            } else {
                Result.failure(response.exceptionOrNull() ?: Exception("Failed to create session"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to create session", e)
            Result.failure(e)
        }
    }
    
    /**
     * Submit a test result
     */
    suspend fun submitTestResult(
        testName: String,
        status: String,
        duration: Long,
        details: Map<String, Any>? = null
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("sessionId", sessionId)
                put("testName", testName)
                put("status", status)
                put("duration", duration)
                if (details != null) {
                    put("details", JSONObject(details))
                }
            }
            
            val response = post("/test-result", body)
            if (response.isSuccess) {
                val data = response.getOrNull() as? JSONObject
                val resultId = data?.optString("resultId") ?: "unknown"
                Log.i(TAG, "Test result submitted: $resultId")
                Result.success(resultId)
            } else {
                Result.failure(response.exceptionOrNull() ?: Exception("Failed to submit result"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to submit test result", e)
            Result.failure(e)
        }
    }
    
    /**
     * Execute a bot command
     */
    suspend fun executeCommand(
        command: String,
        channel: String,
        userId: String? = null
    ): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val body = JSONObject().apply {
                put("command", command)
                put("channel", channel)
                if (userId != null) {
                    put("userId", userId)
                }
            }
            
            val response = post("/command", body)
            if (response.isSuccess) {
                val data = response.getOrNull() as? JSONObject
                if (data != null) {
                    Log.i(TAG, "Command executed: $command")
                    Result.success(data)
                } else {
                    Result.failure(Exception("Invalid response format"))
                }
            } else {
                Result.failure(response.exceptionOrNull() ?: Exception("Command failed"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to execute command", e)
            Result.failure(e)
        }
    }
    
    /**
     * Get app configuration
     */
    suspend fun getConfig(): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val response = get("/config")
            if (response.isSuccess) {
                val data = response.getOrNull() as? JSONObject
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Invalid config format"))
                }
            } else {
                Result.failure(response.exceptionOrNull() ?: Exception("Failed to get config"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get config", e)
            Result.failure(e)
        }
    }
    
    /**
     * Get server statistics
     */
    suspend fun getStats(): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val response = get("/stats")
            if (response.isSuccess) {
                val data = response.getOrNull() as? JSONObject
                if (data != null) {
                    Result.success(data)
                } else {
                    Result.failure(Exception("Invalid stats format"))
                }
            } else {
                Result.failure(response.exceptionOrNull() ?: Exception("Failed to get stats"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to get stats", e)
            Result.failure(e)
        }
    }
    
    /**
     * Generic GET request
     */
    private fun get(endpoint: String): Result<Any> {
        val url = URL("$BASE_URL$endpoint")
        val connection = url.openConnection() as HttpURLConnection
        
        return try {
            connection.apply {
                requestMethod = "GET"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
            }
            
            val responseCode = connection.responseCode
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            
            if (responseCode in 200..299) {
                val json = JSONObject(response)
                Result.success(json)
            } else {
                Result.failure(Exception("HTTP $responseCode: $response"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "GET $endpoint failed", e)
            Result.failure(e)
        } finally {
            connection.disconnect()
        }
    }
    
    /**
     * Generic POST request
     */
    private fun post(endpoint: String, body: JSONObject): Result<Any> {
        val url = URL("$BASE_URL$endpoint")
        val connection = url.openConnection() as HttpURLConnection
        
        return try {
            connection.apply {
                requestMethod = "POST"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "application/json")
                doOutput = true
            }
            
            // Write request body
            connection.outputStream.use { outputStream ->
                OutputStreamWriter(outputStream).use { writer ->
                    writer.write(body.toString())
                    writer.flush()
                }
            }
            
            val responseCode = connection.responseCode
            val response = connection.inputStream.bufferedReader().use { it.readText() }
            
            if (responseCode in 200..299) {
                val json = JSONObject(response)
                Result.success(json)
            } else {
                Result.failure(Exception("HTTP $responseCode: $response"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "POST $endpoint failed", e)
            Result.failure(e)
        } finally {
            connection.disconnect()
        }
    }
    
    /**
     * Get current base URL for display/debugging
     */
    fun getBaseUrl(): String = BASE_URL
    
    /**
     * Get current session ID
     */
    fun getCurrentSession(): String? = sessionId
}


