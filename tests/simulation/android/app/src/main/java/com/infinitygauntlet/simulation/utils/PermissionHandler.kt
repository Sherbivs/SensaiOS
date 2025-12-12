package com.infinitygauntlet.simulation.utils

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat

/**
 * Centralized permission handler for the Infinity Gauntlet app.
 * 
 * Handles runtime permissions required by Android 6.0+ (API 23+) including:
 * - POST_NOTIFICATIONS (Android 13+ / API 33+)
 * - Any future runtime permissions
 * 
 * Usage in Activity:
 * ```kotlin
 * class MainActivity : AppCompatActivity() {
 *     private lateinit var permissionHandler: PermissionHandler
 *     
 *     override fun onCreate(savedInstanceState: Bundle?) {
 *         super.onCreate(savedInstanceState)
 *         
 *         permissionHandler = PermissionHandler(this)
 *         permissionHandler.requestAllPermissions(
 *             onGranted = { startApp() },
 *             onDenied = { showPermissionError() }
 *         )
 *     }
 * }
 * ```
 * 
 * Android Permission System:
 * - Normal permissions: Automatically granted (INTERNET, ACCESS_NETWORK_STATE, etc.)
 * - Dangerous permissions: Require runtime request (POST_NOTIFICATIONS on API 33+)
 * - Special permissions: Require settings navigation (SCHEDULE_EXACT_ALARM, etc.)
 * 
 * Reference:
 * https://developer.android.com/training/permissions/requesting
 * https://developer.android.com/develop/ui/views/notifications/notification-permission
 */
class PermissionHandler(
    private val activity: ComponentActivity
) {
    
    companion object {
        /**
         * All runtime permissions required by the app.
         * These vary by Android version (API level).
         */
        private val REQUIRED_PERMISSIONS = buildList {
            // POST_NOTIFICATIONS required on Android 13+ (API 33+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
            
            // Add future runtime permissions here as needed
            // Example: add(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        
        /**
         * Permissions that don't require runtime request.
         * These are automatically granted at install time.
         */
        val NORMAL_PERMISSIONS = listOf(
            Manifest.permission.INTERNET,
            Manifest.permission.ACCESS_NETWORK_STATE,
            Manifest.permission.ACCESS_WIFI_STATE,
            Manifest.permission.FOREGROUND_SERVICE,
            Manifest.permission.WAKE_LOCK,
            Manifest.permission.VIBRATE
        )
    }
    
    // Callbacks for permission results
    private var onAllGrantedCallback: (() -> Unit)? = null
    private var onDeniedCallback: ((List<String>) -> Unit)? = null
    
    // Activity result launcher for permission requests
    private val permissionLauncher: ActivityResultLauncher<Array<String>> =
        activity.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { permissions ->
            handlePermissionResults(permissions)
        }
    
    /**
     * Check if all required permissions are granted.
     * 
     * @return true if all permissions granted, false otherwise
     */
    fun areAllPermissionsGranted(): Boolean {
        return REQUIRED_PERMISSIONS.all { permission ->
            ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    /**
     * Check if a specific permission is granted.
     * 
     * @param permission Permission name (e.g., Manifest.permission.POST_NOTIFICATIONS)
     * @return true if granted, false otherwise
     */
    fun isPermissionGranted(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED
    }
    
    /**
     * Request all required permissions.
     * 
     * @param onGranted Callback when all permissions are granted
     * @param onDenied Callback when any permission is denied (receives list of denied permissions)
     * @param showRationale Whether to show rationale dialog before requesting
     */
    fun requestAllPermissions(
        onGranted: () -> Unit,
        onDenied: (List<String>) -> Unit = {},
        showRationale: Boolean = true
    ) {
        onAllGrantedCallback = onGranted
        onDeniedCallback = onDenied
        
        // Check if permissions are already granted
        if (areAllPermissionsGranted()) {
            onGranted()
            return
        }
        
        // Check if we should show rationale
        if (showRationale && shouldShowRationale()) {
            showPermissionRationaleDialog {
                requestPermissions()
            }
        } else {
            requestPermissions()
        }
    }
    
    /**
     * Request a specific permission.
     * 
     * @param permission Permission name
     * @param onGranted Callback when permission is granted
     * @param onDenied Callback when permission is denied
     * @param showRationale Whether to show rationale dialog
     */
    fun requestPermission(
        permission: String,
        onGranted: () -> Unit,
        onDenied: () -> Unit = {},
        showRationale: Boolean = true
    ) {
        // Check if already granted
        if (isPermissionGranted(permission)) {
            onGranted()
            return
        }
        
        // Setup callbacks
        onAllGrantedCallback = onGranted
        onDeniedCallback = { onDenied() }
        
        // Check if we should show rationale
        if (showRationale && activity.shouldShowRequestPermissionRationale(permission)) {
            showPermissionRationaleDialog(permission) {
                permissionLauncher.launch(arrayOf(permission))
            }
        } else {
            permissionLauncher.launch(arrayOf(permission))
        }
    }
    
    /**
     * Request notification permission specifically (Android 13+).
     * 
     * @param onGranted Callback when granted
     * @param onDenied Callback when denied
     */
    fun requestNotificationPermission(
        onGranted: () -> Unit,
        onDenied: () -> Unit = {}
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermission(
                permission = Manifest.permission.POST_NOTIFICATIONS,
                onGranted = onGranted,
                onDenied = onDenied,
                showRationale = true
            )
        } else {
            // Notifications don't require permission on Android 12 and below
            onGranted()
        }
    }
    
    /**
     * Get list of denied permissions.
     * 
     * @return List of permission names that are not granted
     */
    fun getDeniedPermissions(): List<String> {
        return REQUIRED_PERMISSIONS.filter { permission ->
            !isPermissionGranted(permission)
        }
    }
    
    /**
     * Get user-friendly permission names for display.
     * 
     * @param permissions List of permission names
     * @return List of human-readable permission descriptions
     */
    fun getPermissionDescriptions(permissions: List<String>): List<String> {
        return permissions.map { permission ->
            when (permission) {
                Manifest.permission.POST_NOTIFICATIONS -> 
                    "Notifications - Required for test progress updates"
                Manifest.permission.READ_EXTERNAL_STORAGE -> 
                    "Storage - Required for reading test data files"
                Manifest.permission.WRITE_EXTERNAL_STORAGE -> 
                    "Storage - Required for saving test reports"
                else -> 
                    permission.substringAfterLast('.')
            }
        }
    }
    
    // ========================================
    // PRIVATE METHODS
    // ========================================
    
    /**
     * Request all required permissions.
     */
    private fun requestPermissions() {
        if (REQUIRED_PERMISSIONS.isEmpty()) {
            onAllGrantedCallback?.invoke()
            return
        }
        
        permissionLauncher.launch(REQUIRED_PERMISSIONS.toTypedArray())
    }
    
    /**
     * Handle permission request results.
     */
    private fun handlePermissionResults(results: Map<String, Boolean>) {
        val deniedPermissions = results.filterValues { !it }.keys.toList()
        
        if (deniedPermissions.isEmpty()) {
            // All permissions granted
            onAllGrantedCallback?.invoke()
        } else {
            // Some permissions denied
            onDeniedCallback?.invoke(deniedPermissions)
        }
        
        // Clear callbacks
        onAllGrantedCallback = null
        onDeniedCallback = null
    }
    
    /**
     * Check if we should show permission rationale.
     */
    private fun shouldShowRationale(): Boolean {
        return REQUIRED_PERMISSIONS.any { permission ->
            activity.shouldShowRequestPermissionRationale(permission)
        }
    }
    
    /**
     * Show permission rationale dialog (all permissions).
     */
    private fun showPermissionRationaleDialog(onAccept: () -> Unit) {
        val permissionDescriptions = getPermissionDescriptions(REQUIRED_PERMISSIONS)
        
        AlertDialog.Builder(activity)
            .setTitle("Permissions Required")
            .setMessage(buildString {
                append("This app needs the following permissions to function properly:\n\n")
                permissionDescriptions.forEach { description ->
                    append("• $description\n")
                }
                append("\nWithout these permissions, some features may not work correctly.")
            })
            .setPositiveButton("Grant Permissions") { dialog, _ ->
                dialog.dismiss()
                onAccept()
            }
            .setNegativeButton("Cancel") { dialog, _ ->
                dialog.dismiss()
                onDeniedCallback?.invoke(REQUIRED_PERMISSIONS)
                onDeniedCallback = null
            }
            .setCancelable(false)
            .show()
    }
    
    /**
     * Show permission rationale dialog (specific permission).
     */
    private fun showPermissionRationaleDialog(permission: String, onAccept: () -> Unit) {
        val description = getPermissionDescriptions(listOf(permission)).firstOrNull()
            ?: "Required for app functionality"
        
        AlertDialog.Builder(activity)
            .setTitle("Permission Required")
            .setMessage(buildString {
                append("This permission is needed:\n\n")
                append("• $description\n\n")
                append("Without this permission, some features may not work correctly.")
            })
            .setPositiveButton("Grant Permission") { dialog, _ ->
                dialog.dismiss()
                onAccept()
            }
            .setNegativeButton("Cancel") { dialog, _ ->
                dialog.dismiss()
                onDeniedCallback?.invoke(listOf(permission))
                onDeniedCallback = null
            }
            .setCancelable(false)
            .show()
    }
}

/**
 * Extension functions for easy permission checking.
 */

/**
 * Check if a permission is granted.
 */
fun Context.hasPermission(permission: String): Boolean {
    return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED
}

/**
 * Check if notification permission is granted (Android 13+).
 */
fun Context.hasNotificationPermission(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        hasPermission(Manifest.permission.POST_NOTIFICATIONS)
    } else {
        true // No permission required on Android 12 and below
    }
}

/**
 * Check if all required permissions are granted.
 */
fun Context.hasAllRequiredPermissions(): Boolean {
    val requiredPermissions = buildList {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    
    return requiredPermissions.all { permission ->
        hasPermission(permission)
    }
}
