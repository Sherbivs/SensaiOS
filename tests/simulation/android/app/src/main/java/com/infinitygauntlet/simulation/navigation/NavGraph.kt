package com.infinitygauntlet.simulation.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.infinitygauntlet.simulation.presentation.chat.ChatScreen
import com.infinitygauntlet.simulation.presentation.report.ReportScreen
import com.infinitygauntlet.simulation.presentation.test.TestScreen

/**
 * Navigation Graph
 * 
 * Week 4: Phase 4.4 - Navigation Infrastructure
 * 
 * Defines the navigation structure for the entire app.
 * Uses Jetpack Compose Navigation component.
 * 
 * Navigation Flow:
 * - Chat Screen: Main entry point, default destination
 * - Test Screen: Access from bottom nav
 * - Report Screen: Navigate from Test screen with optional resultId
 * 
 * @param navController Navigation controller for managing navigation
 * @param startDestination Initial screen to display (default: Chat)
 */
@Composable
fun NavGraph(
    navController: NavHostController,
    startDestination: String = Screen.Chat.route
) {
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        // Chat Screen
        composable(route = Screen.Chat.route) {
            ChatScreen()
        }
        
        // Test Screen
        composable(route = Screen.Test.route) {
            TestScreen(
                onNavigateToResult = { resultId: Long, scenarioName: String ->
                    navController.navigate(Screen.Report.createRoute(resultId))
                }
            )
        }
        
        // Report Screen (with optional resultId parameter)
        composable(
            route = Screen.Report.route,
            arguments = listOf(
                navArgument("resultId") {
                    type = NavType.LongType
                    defaultValue = 0L
                    nullable = false
                }
            )
        ) { backStackEntry ->
            val resultId = backStackEntry.arguments?.getLong("resultId") ?: 0L
            ReportScreen(
                scenarioId = if (resultId > 0) resultId else 0
            )
        }
    }
}
