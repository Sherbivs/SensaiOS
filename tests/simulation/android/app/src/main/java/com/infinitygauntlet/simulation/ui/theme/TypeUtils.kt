package com.infinitygauntlet.simulation.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Typography utilities and extensions for Infinity Gauntlet Simulation
 * 
 * Provides helper functions for text style transformations and common patterns.
 */

/**
 * Create a bold variant of a text style
 */
fun TextStyle.bold(): TextStyle = copy(fontWeight = FontWeight.Bold)

/**
 * Create a medium weight variant of a text style
 */
fun TextStyle.medium(): TextStyle = copy(fontWeight = FontWeight.Medium)

/**
 * Create a light variant of a text style
 */
fun TextStyle.light(): TextStyle = copy(fontWeight = FontWeight.Light)

/**
 * Create a semibold variant of a text style
 */
fun TextStyle.semiBold(): TextStyle = copy(fontWeight = FontWeight.SemiBold)

/**
 * Apply italic styling
 */
fun TextStyle.italic(): TextStyle = copy(
    fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
)

/**
 * Scale font size by a factor
 * 
 * @param factor Multiplier for font size (e.g., 1.2 for 20% larger)
 * @return Scaled text style
 */
fun TextStyle.scaleFontSize(factor: Float): TextStyle = copy(
    fontSize = fontSize * factor,
    lineHeight = lineHeight * factor
)

/**
 * Apply custom letter spacing
 * 
 * @param spacing Letter spacing in SP
 * @return Text style with custom spacing
 */
fun TextStyle.withLetterSpacing(spacing: Float): TextStyle = copy(
    letterSpacing = spacing.sp
)

/**
 * Apply custom line height
 * 
 * @param height Line height in SP
 * @return Text style with custom line height
 */
fun TextStyle.withLineHeight(height: Float): TextStyle = copy(
    lineHeight = height.sp
)

/**
 * Make text all caps
 * Note: This returns a copy with uppercase, apply to actual text string
 */
fun TextStyle.uppercase(): TextStyle = copy(
    letterSpacing = (letterSpacing.value + 1).sp // Add extra letter spacing for caps
)

/**
 * Common font size scaling factors
 */
object FontScale {
    const val XXSmall = 0.75f    // 75% of base size
    const val XSmall = 0.875f    // 87.5% of base size
    const val Small = 0.9375f    // ~94% of base size
    const val Normal = 1.0f      // Base size
    const val Large = 1.125f     // 112.5% of base size
    const val XLarge = 1.25f     // 125% of base size
    const val XXLarge = 1.5f     // 150% of base size
}

/**
 * Common line height ratios
 */
object LineHeightRatio {
    const val Tight = 1.2f       // Tight line spacing
    const val Normal = 1.5f      // Normal line spacing
    const val Relaxed = 1.75f    // Relaxed line spacing
    const val Loose = 2.0f       // Loose line spacing
}

/**
 * Recommended text styles for specific use cases
 */
object TextStylePresets {
    /**
     * Error message text
     */
    val ErrorMessage = CustomTextStyles.Code.copy(
        fontSize = 12.sp,
        lineHeight = 18.sp
    )
    
    /**
     * Success message text
     */
    val SuccessMessage = CustomTextStyles.Code.copy(
        fontSize = 12.sp,
        lineHeight = 18.sp
    )
    
    /**
     * Chat message text
     */
    val ChatMessage = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp
    )
    
    /**
     * Chat author name
     */
    val ChatAuthor = TextStyle(
        fontWeight = FontWeight.SemiBold,
        fontSize = 13.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.sp
    )
    
    /**
     * Test scenario name
     */
    val TestScenarioName = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 24.sp,
        letterSpacing = 0.15.sp
    )
    
    /**
     * Test scenario description
     */
    val TestScenarioDescription = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp
    )
    
    /**
     * Stat label (small uppercase label)
     */
    val StatLabel = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 10.sp,
        lineHeight = 16.sp,
        letterSpacing = 1.5.sp
    )
    
    /**
     * Stat value (large numeric display)
     */
    val StatValue = TextStyle(
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 40.sp,
        letterSpacing = 0.sp
    )
    
    /**
     * Badge text (status badges, chips)
     */
    val BadgeText = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.5.sp
    )
    
    /**
     * Button text (uppercase, medium weight)
     */
    val ButtonText = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 1.25.sp
    )
    
    /**
     * Dialog title
     */
    val DialogTitle = TextStyle(
        fontWeight = FontWeight.Medium,
        fontSize = 24.sp,
        lineHeight = 32.sp,
        letterSpacing = 0.sp
    )
    
    /**
     * Dialog body text
     */
    val DialogBody = TextStyle(
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.25.sp
    )
}

/**
 * Minimum font sizes for accessibility
 */
object MinFontSize {
    const val Body = 12f         // Minimum for body text
    const val Label = 10f        // Minimum for labels
    const val Touch = 14f        // Minimum for touch targets
}

/**
 * Calculate optimal line height for a given font size
 * 
 * @param fontSize Font size in SP
 * @param ratio Line height ratio (default: Normal = 1.5)
 * @return Optimal line height in SP
 */
fun calculateLineHeight(fontSize: Float, ratio: Float = LineHeightRatio.Normal): Float {
    return fontSize * ratio
}

/**
 * Check if text style meets minimum accessibility requirements
 * 
 * @return True if accessible
 */
fun TextStyle.isAccessible(): Boolean {
    val fontSizeValue = fontSize.value
    return when {
        // Body text should be at least 12sp
        fontWeight == FontWeight.Normal && fontSizeValue < MinFontSize.Body -> false
        // Labels should be at least 10sp
        fontWeight == FontWeight.Medium && fontSizeValue < MinFontSize.Label -> false
        else -> true
    }
}
