package com.infinitygauntlet.simulation.network

import android.content.Context
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.URL

/**
 * Discovers the development server on the local network
 * Scans common IP ranges and ports to find the dev server
 */
object DevServerDiscovery {
    private const val TAG = "DevServerDiscovery"
    
    private val commonPorts = listOf(8080, 3000, 8081, 5000)
    
    /**
     * Attempt to discover the dev server on the local network
     * @return The discovered server URL or null if not found
     */
    suspend fun discover(context: Context): String? = withContext(Dispatchers.IO) {
        Log.i(TAG, "Starting dev server discovery...")
        
        // Get local IP to determine network range
        val localIP = getLocalIPAddress()
        if (localIP == null) {
            Log.w(TAG, "Could not determine local IP address")
            return@withContext null
        }
        
        Log.d(TAG, "Local IP: $localIP")
        
        // Parse network prefix (e.g., 192.168.1)
        val ipParts = localIP.split(".")
        if (ipParts.size != 4) {
            Log.w(TAG, "Invalid IP format: $localIP")
            return@withContext null
        }
        
        val networkPrefix = "${ipParts[0]}.${ipParts[1]}.${ipParts[2]}"
        Log.i(TAG, "Scanning network: $networkPrefix.x")
        
        // Try common development machine IPs first
        val priorityIPs = listOf(
            "$networkPrefix.1",   // Common router/gateway
            "$networkPrefix.100", // Common static IP
            "$networkPrefix.10",  // Another common static IP
            localIP               // Sometimes the device itself
        )
        
        // Try priority IPs first
        for (ip in priorityIPs) {
            for (port in commonPorts) {
                val url = "http://$ip:$port"
                if (tryConnect(url)) {
                    Log.i(TAG, "✅ Discovered dev server at: $url")
                    return@withContext url
                }
            }
        }
        
        // If not found, scan a broader range (this can be slow)
        Log.i(TAG, "Priority IPs failed, scanning broader range...")
        
        val scanRange = (2..254).map { "$networkPrefix.$it" }
        val jobs = scanRange.map { ip ->
            async {
                for (port in commonPorts) {
                    val url = "http://$ip:$port"
                    if (tryConnect(url)) {
                        return@async url
                    }
                }
                null
            }
        }
        
        val results = jobs.awaitAll()
        val discovered = results.filterNotNull().firstOrNull()
        
        if (discovered != null) {
            Log.i(TAG, "✅ Discovered dev server at: $discovered")
        } else {
            Log.w(TAG, "❌ No dev server found on network")
        }
        
        return@withContext discovered
    }
    
    /**
     * Try to connect to a potential dev server URL
     */
    private fun tryConnect(url: String): Boolean {
        return try {
            val connection = URL("$url/ping").openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 1000  // Fast timeout for scanning
            connection.readTimeout = 1000
            
            val responseCode = connection.responseCode
            connection.disconnect()
            
            if (responseCode == 200) {
                Log.d(TAG, "Found server at: $url")
                true
            } else {
                false
            }
        } catch (e: Exception) {
            false  // Silently fail, this is expected during scanning
        }
    }
    
    /**
     * Get the device's local IP address
     */
    private fun getLocalIPAddress(): String? {
        try {
            val interfaces = java.util.Collections.list(java.net.NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                val addrs = java.util.Collections.list(intf.inetAddresses)
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress && addr is java.net.Inet4Address) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting local IP: ${e.message}")
        }
        return null
    }
    
    /**
     * Quick check if a URL is reachable
     */
    suspend fun isReachable(url: String): Boolean = withContext(Dispatchers.IO) {
        tryConnect(url)
    }
}
