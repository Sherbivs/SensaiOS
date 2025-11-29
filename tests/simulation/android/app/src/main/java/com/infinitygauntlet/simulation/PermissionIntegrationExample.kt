package com.infinitygauntlet.simulation

/**
 * Example integration of PermissionHandler into MainActivity.
 * 
 * This file shows the recommended pattern for requesting permissions
 * when the app starts. Copy this code into your MainActivity.kt.
 * 
 * Key Points:
 * 1. Create PermissionHandler instance
 * 2. Request permissions in onCreate() or onResume()
 * 3. Handle granted/denied callbacks
 * 4. Show user-friendly error messages for denied permissions
 */

// EXAMPLE INTEGRATION FOR MainActivity.kt:

/*
package com.infinitygauntlet.simulation

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.infinitygauntlet.simulation.adapters.TestScenarioAdapter
import com.infinitygauntlet.simulation.databinding.ActivityMainBinding
import com.infinitygauntlet.simulation.utils.PermissionHandler

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var permissionHandler: PermissionHandler
    private var permissionsGranted = false
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Initialize permission handler
        permissionHandler = PermissionHandler(this)
        
        // Request permissions
        requestRequiredPermissions()
    }
    
    override fun onResume() {
        super.onResume()
        
        // Check permissions again when returning to app
        if (!permissionsGranted && !permissionHandler.areAllPermissionsGranted()) {
            requestRequiredPermissions()
        }
    }
    
    private fun requestRequiredPermissions() {
        permissionHandler.requestAllPermissions(
            onGranted = {
                permissionsGranted = true
                initializeApp()
                Toast.makeText(this, "All permissions granted", Toast.LENGTH_SHORT).show()
            },
            onDenied = { deniedPermissions ->
                permissionsGranted = false
                handlePermissionsDenied(deniedPermissions)
            },
            showRationale = true
        )
    }
    
    private fun initializeApp() {
        // Setup RecyclerView
        setupRecyclerView()
        
        // Setup FAB
        binding.fab.setOnClickListener {
            // Run tests
        }
        
        // Load test scenarios
        loadTestScenarios()
    }
    
    private fun handlePermissionsDenied(deniedPermissions: List<String>) {
        val descriptions = permissionHandler.getPermissionDescriptions(deniedPermissions)
        
        val message = buildString {
            append("The following permissions were denied:\n\n")
            descriptions.forEach { description ->
                append("• $description\n")
            }
            append("\nSome features may not work properly.")
        }
        
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
        
        // Still initialize app, but features may be limited
        initializeApp()
    }
    
    private fun setupRecyclerView() {
        // Your existing RecyclerView setup code
    }
    
    private fun loadTestScenarios() {
        // Your existing scenario loading code
    }
}
*/

// ALTERNATIVE: Request notification permission only when starting tests:

/*
private fun startTestExecution() {
    permissionHandler.requestNotificationPermission(
        onGranted = {
            // Permission granted, start tests
            val intent = Intent(this, TestRunnerService::class.java)
            intent.putParcelableArrayListExtra("scenarios", ArrayList(scenarios))
            startService(intent)
        },
        onDenied = {
            // Permission denied, warn user
            AlertDialog.Builder(this)
                .setTitle("Notification Permission Required")
                .setMessage("Without notification permission, you won't see test progress updates.")
                .setPositiveButton("Continue Anyway") { _, _ ->
                    // Start tests without notifications
                    val intent = Intent(this, TestRunnerService::class.java)
                    intent.putParcelableArrayListExtra("scenarios", ArrayList(scenarios))
                    startService(intent)
                }
                .setNegativeButton("Cancel", null)
                .show()
        }
    )
}
*/

// CHECKING PERMISSIONS BEFORE OPERATIONS:

/*
import com.infinitygauntlet.simulation.utils.hasNotificationPermission

private fun startTests() {
    if (hasNotificationPermission()) {
        // Safe to show notifications
        startService(Intent(this, TestRunnerService::class.java))
    } else {
        // Request permission first
        permissionHandler.requestNotificationPermission(
            onGranted = { startService(Intent(this, TestRunnerService::class.java)) },
            onDenied = { showNotificationPermissionWarning() }
        )
    }
}
*/

// EXTENSION FUNCTION USAGE:

/*
import com.infinitygauntlet.simulation.utils.hasPermission
import com.infinitygauntlet.simulation.utils.hasNotificationPermission
import com.infinitygauntlet.simulation.utils.hasAllRequiredPermissions
import android.Manifest

// Check specific permission
if (hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
    // Permission granted
}

// Check notification permission (handles Android version)
if (hasNotificationPermission()) {
    // Can show notifications
}

// Check all required permissions
if (hasAllRequiredPermissions()) {
    // All permissions granted
}
*/
