package com.infinitygauntlet.simulation.navigation

/**
 * Navigation Screen Definitions
 * 
 * Week 4: Phase 4.4 - Navigation Infrastructure
 * 
 * Sealed class representing all screens in the app.
 * Each screen has a route string used by Jetpack Compose Navigation.
 * 
 * Routes follow the pattern: "screen_name" or "screen_name/{param}"
 * for screens with required parameters.
 */
sealed class Screen(val route: String) {
    /**
     * Chat Screen - Discord-like chat interface
     * Main chat functionality with channels and messages
     */
    object Chat : Screen("chat")
    
    /**
     * Report Screen - Test result viewer
     * Displays test execution results with statistics
     * 
     * @param resultId Optional result ID to load specific report
     */
    object Report : Screen("report?resultId={resultId}") {
        fun createRoute(resultId: Long? = null): String {
            return if (resultId != null) {
                "report?resultId=$resultId"
            } else {
                "report"
            }
        }
    }
    
    /**
     * Test Screen - Test scenario manager
     * List and execute test scenarios
     */
    object Test : Screen("test")
}

/**
 * Bottom Navigation Bar Items
 * Subset of screens shown in bottom navigation
 */
val bottomNavScreens = listOf(
    Screen.Chat,
    Screen.Test,
    Screen.Report
)
