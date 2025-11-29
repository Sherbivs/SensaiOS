package com.infinitygauntlet.simulation.ui.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

/**
 * Main theme composable for Infinity Gauntlet Simulation
 * 
 * Provides Material Design 3 theming with Pokemon brand colors.
 * Supports:
 * - Light and dark color schemes
 * - Dynamic color (Material You) on Android 12+
 * - Custom Pokemon-themed colors
 * - Consistent typography, shapes, and spacing
 * 
 * Usage:
 * ```kotlin
 * InfinityGauntletTheme {
 *     // Your app content
 * }
 * ```
 * 
 * @param darkTheme Whether to use dark theme (defaults to system preference)
 * @param dynamicColor Whether to use dynamic color (Material You) on Android 12+
 * @param content App content to theme
 */
@Composable
fun InfinityGauntletTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false, // Disabled by default to show Pokemon branding
    content: @Composable () -> Unit
) {
    // Select color scheme based on theme and dynamic color support
    val colorScheme = when {
        // Dynamic color available on Android 12+ (API 31+)
        dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> {
            val context = LocalContext.current
            if (darkTheme) {
                dynamicDarkColorScheme(context)
            } else {
                dynamicLightColorScheme(context)
            }
        }
        // Use custom Pokemon-themed colors
        darkTheme -> DarkColorScheme
        else -> LightColorScheme
    }
    
    // Update system bars to match theme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            
            // Modern edge-to-edge design
            WindowCompat.setDecorFitsSystemWindows(window, false)
            
            // Set status bar icons to light/dark based on theme
            WindowCompat.getInsetsController(window, view)?.isAppearanceLightStatusBars = !darkTheme
        }
    }
    
    // Apply Material Theme with all design tokens
    MaterialTheme(
        colorScheme = colorScheme,
        typography = InfinityGauntletTypography,
        shapes = InfinityGauntletShapes,
        content = content
    )
}

/**
 * Preview theme for Compose previews
 * Always uses light theme with static colors for consistency
 * 
 * Usage in @Preview:
 * ```kotlin
 * @Preview
 * @Composable
 * fun MyComponentPreview() {
 *     InfinityGauntletThemePreview {
 *         MyComponent()
 *     }
 * }
 * ```
 */
@Composable
fun InfinityGauntletThemePreview(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = LightColorScheme,
        typography = InfinityGauntletTypography,
        shapes = InfinityGauntletShapes,
        content = content
    )
}

/**
 * Dark theme preview for Compose previews
 * Always uses dark theme with static colors
 * 
 * Usage in @Preview:
 * ```kotlin
 * @Preview
 * @Composable
 * fun MyComponentDarkPreview() {
 *     InfinityGauntletThemeDarkPreview {
 *         MyComponent()
 *     }
 * }
 * ```
 */
@Composable
fun InfinityGauntletThemeDarkPreview(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = DarkColorScheme,
        typography = InfinityGauntletTypography,
        shapes = InfinityGauntletShapes,
        content = content
    )
}
