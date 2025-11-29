package com.infinitygauntlet.simulation.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import com.infinitygauntlet.simulation.domain.models.TestStatus
import com.infinitygauntlet.simulation.domain.models.ResultStatus

/**
 * Color utilities and extensions for Infinity Gauntlet Simulation
 * 
 * Provides helper functions for:
 * - Status-based colors
 * - Pokemon type colors
 * - Color contrast calculations
 * - Color transformations
 */

/**
 * Get color for test scenario status
 * 
 * @param status Test scenario status
 * @return Appropriate status color
 */
@Composable
@ReadOnlyComposable
fun ColorScheme.getStatusColor(status: TestStatus): Color {
    return when (status) {
        TestStatus.READY -> onSurfaceVariant        // Neutral
        TestStatus.RUNNING -> tertiary              // Blue (running)
        TestStatus.PASSED -> GrassGreen40           // Green (success)
        TestStatus.FAILED -> error                  // Red (error)
    }
}

/**
 * Get color for test result status
 * 
 * @param status Result status
 * @return Appropriate status color
 */
@Composable
@ReadOnlyComposable
fun ColorScheme.getResultStatusColor(status: ResultStatus): Color {
    return when (status) {
        ResultStatus.PASSED -> GrassGreen40         // Green (success)
        ResultStatus.FAILED -> error                // Red (error)
        ResultStatus.ERROR -> error                 // Red (error)
        ResultStatus.SKIPPED -> FireOrange40        // Orange (warning)
    }
}

/**
 * Get container color for test scenario status
 * Used for cards and chips background
 * 
 * @param status Test scenario status
 * @return Appropriate container color
 */
@Composable
@ReadOnlyComposable
fun ColorScheme.getStatusContainerColor(status: TestStatus): Color {
    return when (status) {
        TestStatus.READY -> surfaceVariant          // Neutral
        TestStatus.RUNNING -> tertiaryContainer     // Light blue
        TestStatus.PASSED -> GrassGreen90           // Light green
        TestStatus.FAILED -> errorContainer         // Light red
    }
}

/**
 * Get Pokemon type color
 * 
 * @param typeName Pokemon type name (e.g., "Fire", "Water")
 * @return Color for that type
 */
fun getPokemonTypeColor(typeName: String): Color {
    return when (typeName.lowercase()) {
        "normal" -> TypeNormal
        "fire" -> TypeFire
        "water" -> TypeWater
        "electric" -> TypeElectric
        "grass" -> TypeGrass
        "ice" -> TypeIce
        "fighting" -> TypeFighting
        "poison" -> TypePoison
        "ground" -> TypeGround
        "flying" -> TypeFlying
        "psychic" -> TypePsychic
        "bug" -> TypeBug
        "rock" -> TypeRock
        "ghost" -> TypeGhost
        "dragon" -> TypeDragon
        "dark" -> TypeDark
        "steel" -> TypeSteel
        "fairy" -> TypeFairy
        else -> Neutral50  // Default neutral color
    }
}

/**
 * Calculate if text should be dark or light based on background luminance
 * 
 * @return True if dark text should be used, false for light text
 */
fun Color.shouldUseDarkText(): Boolean {
    return luminance() > 0.5
}

/**
 * Get contrasting text color for a background
 * 
 * @return Black or white depending on background luminance
 */
fun Color.contrastingTextColor(): Color {
    return if (shouldUseDarkText()) {
        Color.Black
    } else {
        Color.White
    }
}

/**
 * Apply alpha transparency to a color
 * 
 * @param alpha Alpha value (0.0 to 1.0)
 * @return Color with applied alpha
 */
fun Color.withAlpha(alpha: Float): Color {
    return copy(alpha = alpha.coerceIn(0f, 1f))
}

/**
 * Lighten a color by a percentage
 * 
 * @param amount Amount to lighten (0.0 to 1.0)
 * @return Lightened color
 */
fun Color.lighten(amount: Float): Color {
    val factor = 1f + amount.coerceIn(0f, 1f)
    return copy(
        red = (red * factor).coerceIn(0f, 1f),
        green = (green * factor).coerceIn(0f, 1f),
        blue = (blue * factor).coerceIn(0f, 1f)
    )
}

/**
 * Darken a color by a percentage
 * 
 * @param amount Amount to darken (0.0 to 1.0)
 * @return Darkened color
 */
fun Color.darken(amount: Float): Color {
    val factor = 1f - amount.coerceIn(0f, 1f)
    return copy(
        red = red * factor,
        green = green * factor,
        blue = blue * factor
    )
}

/**
 * Mix two colors together
 * 
 * @param other Other color to mix with
 * @param ratio Ratio of other color (0.0 = all this, 1.0 = all other)
 * @return Mixed color
 */
fun Color.mix(other: Color, ratio: Float): Color {
    val clampedRatio = ratio.coerceIn(0f, 1f)
    return Color(
        red = red * (1f - clampedRatio) + other.red * clampedRatio,
        green = green * (1f - clampedRatio) + other.green * clampedRatio,
        blue = blue * (1f - clampedRatio) + other.blue * clampedRatio,
        alpha = alpha * (1f - clampedRatio) + other.alpha * clampedRatio
    )
}

/**
 * Convert color to hex string
 * 
 * @return Hex string (e.g., "#FF5733")
 */
fun Color.toHexString(): String {
    val red = (red * 255).toInt()
    val green = (green * 255).toInt()
    val blue = (blue * 255).toInt()
    return "#%02X%02X%02X".format(red, green, blue)
}

/**
 * Common alpha values for various UI states
 */
object AlphaValues {
    const val Disabled = 0.38f          // Disabled content
    const val Medium = 0.60f            // Medium emphasis
    const val High = 0.87f              // High emphasis text
    const val Surface1 = 0.05f          // Surface elevation 1
    const val Surface2 = 0.08f          // Surface elevation 2
    const val Surface3 = 0.11f          // Surface elevation 3
    const val Surface4 = 0.12f          // Surface elevation 4
    const val Surface5 = 0.14f          // Surface elevation 5
    const val Hover = 0.08f             // Hover state
    const val Focus = 0.12f             // Focus state
    const val Press = 0.12f             // Press state
    const val Drag = 0.16f              // Drag state
}
