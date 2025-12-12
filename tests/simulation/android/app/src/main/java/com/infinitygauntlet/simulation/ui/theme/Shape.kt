package com.infinitygauntlet.simulation.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Material Design 3 Shape System for Infinity Gauntlet Simulation
 * 
 * Defines corner radius values for components following Material 3 guidelines.
 * 
 * Shape families:
 * - extraSmall: Small components (chips, badges)
 * - small: Buttons, text fields
 * - medium: Cards, dialogs
 * - large: Sheets, large cards
 * - extraLarge: Full-screen components
 * 
 * All shapes use RoundedCornerShape for consistent rounded corners.
 * 
 * Reference: https://m3.material.io/styles/shape/shape-scale-tokens
 */

val InfinityGauntletShapes = Shapes(
    /**
     * Extra Small - 4dp radius
     * Use for: Small chips, badges, small buttons
     * Example: Status badges, notification dots
     */
    extraSmall = RoundedCornerShape(4.dp),
    
    /**
     * Small - 8dp radius
     * Use for: Buttons, text fields, standard chips
     * Example: Primary button, search field
     */
    small = RoundedCornerShape(8.dp),
    
    /**
     * Medium - 12dp radius
     * Use for: Cards, dialogs, elevated components
     * Example: Test scenario card, message bubble
     */
    medium = RoundedCornerShape(12.dp),
    
    /**
     * Large - 16dp radius
     * Use for: Large cards, sheets, prominent surfaces
     * Example: Report card, bottom sheet
     */
    large = RoundedCornerShape(16.dp),
    
    /**
     * Extra Large - 28dp radius
     * Use for: Full-screen components, hero cards
     * Example: Modal bottom sheet, full-screen dialog
     */
    extraLarge = RoundedCornerShape(28.dp)
)

/**
 * Custom shape definitions for specific use cases
 */
object CustomShapes {
    /**
     * Pill shape - Fully rounded
     * Use for: Pills, tags, infinite scrolling buttons
     */
    val Pill = RoundedCornerShape(percent = 50)
    
    /**
     * Top rounded only - 12dp
     * Use for: Bottom sheets, modal dialogs
     */
    val TopRounded = RoundedCornerShape(
        topStart = 12.dp,
        topEnd = 12.dp,
        bottomStart = 0.dp,
        bottomEnd = 0.dp
    )
    
    /**
     * Bottom rounded only - 12dp
     * Use for: App bars with content below
     */
    val BottomRounded = RoundedCornerShape(
        topStart = 0.dp,
        topEnd = 0.dp,
        bottomStart = 12.dp,
        bottomEnd = 12.dp
    )
    
    /**
     * Left rounded only - 12dp
     * Use for: Received message bubbles (chat)
     */
    val LeftRounded = RoundedCornerShape(
        topStart = 12.dp,
        topEnd = 0.dp,
        bottomStart = 12.dp,
        bottomEnd = 0.dp
    )
    
    /**
     * Right rounded only - 12dp
     * Use for: Sent message bubbles (chat)
     */
    val RightRounded = RoundedCornerShape(
        topStart = 0.dp,
        topEnd = 12.dp,
        bottomStart = 0.dp,
        bottomEnd = 12.dp
    )
    
    /**
     * Chat bubble - User (right aligned)
     * Rounded except bottom-right corner
     */
    val ChatBubbleUser = RoundedCornerShape(
        topStart = 12.dp,
        topEnd = 12.dp,
        bottomStart = 12.dp,
        bottomEnd = 2.dp  // Small radius for "tail"
    )
    
    /**
     * Chat bubble - Bot (left aligned)
     * Rounded except bottom-left corner
     */
    val ChatBubbleBot = RoundedCornerShape(
        topStart = 12.dp,
        topEnd = 12.dp,
        bottomStart = 2.dp,  // Small radius for "tail"
        bottomEnd = 12.dp
    )
    
    /**
     * Rectangle - No rounding
     * Use for: Dividers, full-width components
     */
    val Rectangle = RoundedCornerShape(0.dp)
    
    /**
     * Pokeball shape - Large top rounding
     * Use for: Pokemon-themed components
     */
    val Pokeball = RoundedCornerShape(
        topStart = 24.dp,
        topEnd = 24.dp,
        bottomStart = 8.dp,
        bottomEnd = 8.dp
    )
}

/**
 * Corner radius tokens (raw values for manual use)
 */
object CornerRadius {
    val None = 0.dp
    val ExtraSmall = 4.dp
    val Small = 8.dp
    val Medium = 12.dp
    val Large = 16.dp
    val ExtraLarge = 24.dp
    val XXLarge = 28.dp
    val Full = 9999.dp  // Infinite rounding (becomes pill)
}
