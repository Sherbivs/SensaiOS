package com.infinitygauntlet.simulation.ui.theme

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme

/**
 * Material Design 3 Color Schemes for Infinity Gauntlet Simulation
 * 
 * Defines light and dark color schemes following Material Design 3 guidelines.
 * Maps base color tokens to semantic roles (primary, secondary, tertiary, etc.).
 * 
 * Color roles explained:
 * - primary: Main brand color (buttons, FABs, active states)
 * - onPrimary: Text/icons on primary color
 * - primaryContainer: Tonal variant of primary (chips, cards)
 * - onPrimaryContainer: Text on primary container
 * 
 * Same pattern for secondary, tertiary, error.
 * 
 * Surface colors:
 * - surface: Default background for components
 * - surfaceVariant: Alternative surface color
 * - surfaceTint: Color used for tinting surfaces at different elevations
 * 
 * Reference: https://m3.material.io/styles/color/roles
 */

/**
 * Light color scheme - Pokemon Red theme
 * 
 * Designed for readability and accessibility in light mode.
 * Uses darker color tones for text and lighter tones for backgrounds.
 */
val LightColorScheme = lightColorScheme(
    // ========================================================================
    // PRIMARY (Pokemon Red - Pokeball)
    // ========================================================================
    primary = PokemonRed40,              // Main brand color
    onPrimary = Neutral100,              // White text on primary
    primaryContainer = PokemonRed90,     // Light tonal variant
    onPrimaryContainer = PokemonRed10,   // Dark text on light container
    
    // ========================================================================
    // SECONDARY (Electric Yellow - Pikachu)
    // ========================================================================
    secondary = ElectricYellow40,        // Secondary accent
    onSecondary = Neutral0,              // Black text on yellow
    secondaryContainer = ElectricYellow90, // Light tonal variant
    onSecondaryContainer = ElectricYellow10, // Dark text on container
    
    // ========================================================================
    // TERTIARY (Water Blue - Blastoise)
    // ========================================================================
    tertiary = WaterBlue40,              // Tertiary accent
    onTertiary = Neutral100,             // White text on blue
    tertiaryContainer = WaterBlue90,     // Light tonal variant
    onTertiaryContainer = WaterBlue10,   // Dark text on container
    
    // ========================================================================
    // ERROR (Material Red)
    // ========================================================================
    error = Error40,                     // Standard error color
    onError = Neutral100,                // White text on error
    errorContainer = Error90,            // Light error container
    onErrorContainer = Error10,          // Dark text on error container
    
    // ========================================================================
    // BACKGROUND & SURFACE
    // ========================================================================
    background = Neutral99,              // Main background (off-white)
    onBackground = Neutral10,            // Dark text on background
    
    surface = Neutral99,                 // Component surfaces (cards, sheets)
    onSurface = Neutral10,               // Text on surfaces
    surfaceVariant = NeutralVariant90,   // Alternative surface color
    onSurfaceVariant = NeutralVariant30, // Text on surface variant
    
    surfaceTint = PokemonRed40,          // Tint for elevated surfaces
    
    // ========================================================================
    // OUTLINE & INVERSE
    // ========================================================================
    outline = NeutralVariant50,          // Borders and dividers
    outlineVariant = NeutralVariant80,   // Lighter borders
    
    inverseSurface = Neutral20,          // Dark surface (tooltips, snackbars)
    inverseOnSurface = Neutral95,        // Light text on dark surface
    inversePrimary = PokemonRed80,       // Light primary on dark surface
    
    // ========================================================================
    // SCRIM (Overlay for dialogs and bottom sheets)
    // ========================================================================
    scrim = Neutral0                     // Black overlay with alpha
)

/**
 * Dark color scheme - Pokemon Red theme
 * 
 * Designed for reduced eye strain in low-light environments.
 * Uses lighter color tones for text and darker tones for backgrounds.
 * 
 * Note: Dark theme colors are carefully chosen to maintain contrast ratios
 * while being easier on the eyes than pure white on black.
 */
val DarkColorScheme = darkColorScheme(
    // ========================================================================
    // PRIMARY (Pokemon Red - Pokeball)
    // ========================================================================
    primary = PokemonRed80,              // Lighter primary for dark mode
    onPrimary = PokemonRed20,            // Dark text on light primary
    primaryContainer = PokemonRed30,     // Dark tonal variant
    onPrimaryContainer = PokemonRed90,   // Light text on dark container
    
    // ========================================================================
    // SECONDARY (Electric Yellow - Pikachu)
    // ========================================================================
    secondary = ElectricYellow80,        // Lighter secondary for dark mode
    onSecondary = ElectricYellow20,      // Dark text on light secondary
    secondaryContainer = ElectricYellow30, // Dark tonal variant
    onSecondaryContainer = ElectricYellow90, // Light text on container
    
    // ========================================================================
    // TERTIARY (Water Blue - Blastoise)
    // ========================================================================
    tertiary = WaterBlue80,              // Lighter tertiary for dark mode
    onTertiary = WaterBlue20,            // Dark text on light tertiary
    tertiaryContainer = WaterBlue30,     // Dark tonal variant
    onTertiaryContainer = WaterBlue90,   // Light text on container
    
    // ========================================================================
    // ERROR (Material Red)
    // ========================================================================
    error = Error80,                     // Lighter error for dark mode
    onError = Error20,                   // Dark text on light error
    errorContainer = Error30,            // Dark error container
    onErrorContainer = Error90,          // Light text on error container
    
    // ========================================================================
    // BACKGROUND & SURFACE
    // ========================================================================
    background = Neutral10,              // Dark background
    onBackground = Neutral90,            // Light text on background
    
    surface = Neutral10,                 // Component surfaces (cards, sheets)
    onSurface = Neutral90,               // Text on surfaces
    surfaceVariant = NeutralVariant30,   // Alternative surface color
    onSurfaceVariant = NeutralVariant80, // Text on surface variant
    
    surfaceTint = PokemonRed80,          // Tint for elevated surfaces (lighter)
    
    // ========================================================================
    // OUTLINE & INVERSE
    // ========================================================================
    outline = NeutralVariant60,          // Borders and dividers
    outlineVariant = NeutralVariant30,   // Darker borders in dark mode
    
    inverseSurface = Neutral90,          // Light surface (tooltips, snackbars)
    inverseOnSurface = Neutral20,        // Dark text on light surface
    inversePrimary = PokemonRed40,       // Dark primary on light surface
    
    // ========================================================================
    // SCRIM (Overlay for dialogs and bottom sheets)
    // ========================================================================
    scrim = Neutral0                     // Black overlay with alpha
)

/**
 * Get color scheme based on dark mode preference
 * 
 * @param darkTheme Whether dark theme is enabled
 * @return Appropriate color scheme
 */
fun getColorScheme(darkTheme: Boolean) = if (darkTheme) {
    DarkColorScheme
} else {
    LightColorScheme
}
