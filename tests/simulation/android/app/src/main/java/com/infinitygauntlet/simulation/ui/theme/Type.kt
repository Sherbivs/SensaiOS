package com.infinitygauntlet.simulation.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Material Design 3 Typography System for Infinity Gauntlet Simulation
 * 
 * Defines the complete type scale following Material 3 guidelines:
 * - Display: Large, eye-catching text (hero sections)
 * - Headline: High-emphasis headers
 * - Title: Medium-emphasis headers
 * - Body: Main content text
 * - Label: Utility text (buttons, captions)
 * 
 * All sizes are in SP (scalable pixels) to respect user font size preferences.
 * Line heights are optimized for readability.
 * 
 * Reference: https://m3.material.io/styles/typography/type-scale-tokens
 */

val InfinityGauntletTypography = Typography(
    // ========================================================================
    // DISPLAY STYLES
    // Large, expressive text for marketing and hero sections
    // ========================================================================
    
    /**
     * Display Large - 57sp
     * Use for: Splash screens, hero headers
     * Example: App name on launch screen
     */
    displayLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 57.sp,
        lineHeight = 64.sp,
        letterSpacing = (-0.25).sp
    ),
    
    /**
     * Display Medium - 45sp
     * Use for: Large headers, section titles
     * Example: "Test Results Dashboard"
     */
    displayMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 45.sp,
        lineHeight = 52.sp,
        letterSpacing = 0.sp
    ),
    
    /**
     * Display Small - 36sp
     * Use for: Subsection headers
     * Example: "Recent Test Runs"
     */
    displaySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 36.sp,
        lineHeight = 44.sp,
        letterSpacing = 0.sp
    ),
    
    // ========================================================================
    // HEADLINE STYLES
    // High-emphasis text for important sections
    // ========================================================================
    
    /**
     * Headline Large - 32sp
     * Use for: Main screen headers
     * Example: "Test Scenarios" (screen title)
     */
    headlineLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 32.sp,
        lineHeight = 40.sp,
        letterSpacing = 0.sp
    ),
    
    /**
     * Headline Medium - 28sp
     * Use for: Card headers, dialog titles
     * Example: "Onboarding Flow Test"
     */
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 28.sp,
        lineHeight = 36.sp,
        letterSpacing = 0.sp
    ),
    
    /**
     * Headline Small - 24sp
     * Use for: List section headers
     * Example: "Active Tests", "Completed Tests"
     */
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        letterSpacing = 0.sp
    ),
    
    // ========================================================================
    // TITLE STYLES
    // Medium-emphasis text for organizing content
    // ========================================================================
    
    /**
     * Title Large - 22sp
     * Use for: Prominent list items, app bar titles
     * Example: Top app bar text
     */
    titleLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 22.sp,
        lineHeight = 28.sp,
        letterSpacing = 0.sp
    ),
    
    /**
     * Title Medium - 16sp Medium weight
     * Use for: List item titles, card titles
     * Example: Test scenario name in list
     */
    titleMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.15.sp
    ),
    
    /**
     * Title Small - 14sp Medium weight
     * Use for: Dense list titles, small card headers
     * Example: Message author name
     */
    titleSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp
    ),
    
    // ========================================================================
    // BODY STYLES
    // Main content text for reading
    // ========================================================================
    
    /**
     * Body Large - 16sp
     * Use for: Emphasized body text, long-form content
     * Example: Test description paragraphs
     */
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.5.sp
    ),
    
    /**
     * Body Medium - 14sp
     * Use for: Main body text (most common)
     * Example: List item descriptions, message content
     */
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp
    ),
    
    /**
     * Body Small - 12sp
     * Use for: Secondary body text, captions
     * Example: Test count, execution time
     */
    bodySmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp
    ),
    
    // ========================================================================
    // LABEL STYLES
    // Utility text for UI components
    // ========================================================================
    
    /**
     * Label Large - 14sp Medium weight
     * Use for: Prominent buttons, tabs
     * Example: "RUN TEST" button
     */
    labelLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp
    ),
    
    /**
     * Label Medium - 12sp Medium weight
     * Use for: Standard buttons, menu items
     * Example: "Cancel", "Save" buttons
     */
    labelMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    ),
    
    /**
     * Label Small - 11sp Medium weight
     * Use for: Small buttons, chips, badges
     * Example: Status badges, chip labels
     */
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
)

/**
 * Custom text styles for specific use cases
 * Use these when Material 3 standard styles don't fit
 */
object CustomTextStyles {
    /**
     * Monospace style for code, logs, JSON
     */
    val Code = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp,
        letterSpacing = 0.sp
    )
    
    /**
     * Large numeric display (stats, scores)
     */
    val NumericLarge = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Bold,
        fontSize = 48.sp,
        lineHeight = 56.sp,
        letterSpacing = 0.sp
    )
    
    /**
     * Medium numeric display (cards, lists)
     */
    val NumericMedium = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 32.sp,
        lineHeight = 40.sp,
        letterSpacing = 0.sp
    )
    
    /**
     * Small numeric display (inline stats)
     */
    val NumericSmall = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.sp
    )
    
    /**
     * Timestamp style (message timestamps, logs)
     */
    val Timestamp = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Normal,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.4.sp
    )
    
    /**
     * All caps label (section headers, overlines)
     */
    val Overline = TextStyle(
        fontFamily = FontFamily.Default,
        fontWeight = FontWeight.Medium,
        fontSize = 10.sp,
        lineHeight = 16.sp,
        letterSpacing = 1.5.sp
    )
}
