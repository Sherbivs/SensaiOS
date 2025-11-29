package com.infinitygauntlet.simulation.navigation

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import com.infinitygauntlet.simulation.ui.components.AppIcons

/**
 * Bottom Navigation Bar
 * 
 * Week 4: Phase 4.4 - Navigation Infrastructure
 * 
 * Provides primary navigation between main screens.
 * Uses Material 3 NavigationBar component.
 * 
 * Features:
 * - Three primary destinations: Chat, Test, Report
 * - Active state highlighting
 * - Icons and labels for each destination
 * - Single top navigation (prevents duplicate screens)
 * - State restoration on back navigation
 * 
 * @param navController Navigation controller for managing navigation
 * @param modifier Optional modifier for styling
 */
@Composable
fun BottomNavigationBar(
    navController: NavHostController,
    modifier: Modifier = Modifier
) {
    // Get current back stack entry to determine active route
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination
    
    NavigationBar(
        modifier = modifier
    ) {
        bottomNavScreens.forEach { screen ->
            val selected = currentDestination?.hierarchy?.any { 
                it.route == screen.route 
            } == true
            
            NavigationBarItem(
                icon = {
                    Icon(
                        imageVector = getIconForScreen(screen),
                        contentDescription = getLabelForScreen(screen)
                    )
                },
                label = {
                    Text(text = getLabelForScreen(screen))
                },
                selected = selected,
                onClick = {
                    navController.navigate(screen.route) {
                        // Pop up to the start destination of the graph to
                        // avoid building up a large stack of destinations
                        popUpTo(navController.graph.findStartDestination().id) {
                            saveState = true
                        }
                        // Avoid multiple copies of the same destination
                        launchSingleTop = true
                        // Restore state when reselecting a previously selected item
                        restoreState = true
                    }
                }
            )
        }
    }
}

/**
 * Get icon for navigation item
 */
private fun getIconForScreen(screen: Screen) = when (screen) {
    Screen.Chat -> AppIcons.Message
    Screen.Test -> AppIcons.TestTube
    Screen.Report -> AppIcons.Description
}

/**
 * Get label for navigation item
 */
private fun getLabelForScreen(screen: Screen) = when (screen) {
    Screen.Chat -> "Chat"
    Screen.Test -> "Tests"
    Screen.Report -> "Reports"
}
