package com.infinitygauntlet.simulation

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.navigation.compose.rememberNavController
import com.infinitygauntlet.simulation.navigation.BottomNavigationBar
import com.infinitygauntlet.simulation.navigation.NavGraph
import com.infinitygauntlet.simulation.ui.theme.InfinityGauntletTheme
import com.infinitygauntlet.simulation.utils.PermissionHandler
import com.infinitygauntlet.simulation.utils.hasNotificationPermission
import dagger.hilt.android.AndroidEntryPoint

/**
 * Main Activity - Jetpack Compose Entry Point
 * 
 * Week 4: Phase 4.4 - Navigation Infrastructure
 * 
 * Modernized main activity using Jetpack Compose.
 * Replaces legacy XML-based activity with declarative UI.
 * 
 * Features:
 * - Jetpack Compose UI framework
 * - Material 3 design system
 * - Edge-to-edge display with proper window insets
 * - Bottom navigation with three main screens
 * - Hilt dependency injection
 * - State management via ViewModels
 * - Runtime permission management (Android 13+)
 * 
 * Architecture:
 * - ComponentActivity: Base class for Compose activities
 * - @AndroidEntryPoint: Hilt injection support
 * - NavController: Navigation state management
 * - Scaffold: Material 3 app structure
 * - PermissionHandler: Runtime permission requests
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    
    private lateinit var permissionHandler: PermissionHandler
    private var permissionsGranted by mutableStateOf(false)
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Enable edge-to-edge display
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)
        
        // Initialize permission handler
        permissionHandler = PermissionHandler(this)
        
        // Request permissions
        requestRequiredPermissions()
        
        // Set Compose content
        setContent {
            InfinityGauntletTheme {
                MainScreen()
            }
        }
    }
    
    override fun onResume() {
        super.onResume()
        
        // Re-check permissions when returning to app
        if (!permissionsGranted && !permissionHandler.areAllPermissionsGranted()) {
            requestRequiredPermissions()
        }
    }
    
    /**
     * Request all required permissions with user-friendly rationale
     * Shows dialog explaining why each permission is needed
     */
    private fun requestRequiredPermissions() {
        permissionHandler.requestAllPermissions(
            onGranted = {
                permissionsGranted = true
                Toast.makeText(
                    this,
                    "All permissions granted - App ready!",
                    Toast.LENGTH_SHORT
                ).show()
            },
            onDenied = { deniedPermissions ->
                permissionsGranted = false
                handlePermissionsDenied(deniedPermissions)
            },
            showRationale = true
        )
    }
    
    /**
     * Handle denied permissions gracefully
     * Shows user-friendly message and allows app to continue with limited features
     */
    private fun handlePermissionsDenied(deniedPermissions: List<String>) {
        val descriptions = permissionHandler.getPermissionDescriptions(deniedPermissions)
        
        val message = buildString {
            append("Some permissions were denied:\n\n")
            descriptions.forEach { description ->
                append("• $description\n")
            }
            append("\nCertain features may not work properly.")
        }
        
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }
}

/**
 * Main Screen Composable
 * 
 * Root composable for the entire app.
 * Sets up navigation structure with bottom nav bar.
 */
@Composable
fun MainScreen() {
    val navController = rememberNavController()
    
    Scaffold(
        bottomBar = {
            BottomNavigationBar(navController = navController)
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            NavGraph(navController = navController)
        }
    }
}

