package com.infinitygauntlet.simulation.ui.theme

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Spacing and dimension tokens for Infinity Gauntlet Simulation
 * 
 * Following Material Design 3 spacing system based on 4dp grid.
 * All spacing should use these tokens for consistency.
 * 
 * Naming convention:
 * - space* : Padding and margins
 * - size* : Component dimensions
 * - elevation* : Shadow elevation values
 * 
 * Reference: https://m3.material.io/foundations/layout/applying-layout/spacing
 */

/**
 * Standard spacing tokens based on 4dp grid
 */
object Spacing {
    val None: Dp = 0.dp
    val XXSmall: Dp = 2.dp      // Compact spacing
    val XSmall: Dp = 4.dp       // Minimal spacing
    val Small: Dp = 8.dp        // Small padding
    val Medium: Dp = 12.dp      // Standard padding
    val Large: Dp = 16.dp       // Comfortable padding
    val XLarge: Dp = 24.dp      // Spacious padding
    val XXLarge: Dp = 32.dp     // Extra spacious
    val XXXLarge: Dp = 48.dp    // Section spacing
    val Huge: Dp = 64.dp        // Large section spacing
}

/**
 * Component size tokens
 */
object Size {
    // Icon sizes
    val IconXSmall: Dp = 16.dp
    val IconSmall: Dp = 20.dp
    val IconMedium: Dp = 24.dp
    val IconLarge: Dp = 32.dp
    val IconXLarge: Dp = 48.dp
    
    // Touch target sizes (minimum 48dp for accessibility)
    val TouchTargetMin: Dp = 48.dp
    val TouchTargetSmall: Dp = 40.dp  // Use sparingly
    val TouchTargetMedium: Dp = 48.dp
    val TouchTargetLarge: Dp = 56.dp
    
    // Button sizes
    val ButtonHeightSmall: Dp = 32.dp
    val ButtonHeightMedium: Dp = 40.dp
    val ButtonHeightLarge: Dp = 48.dp
    
    // Avatar/Image sizes
    val AvatarSmall: Dp = 24.dp
    val AvatarMedium: Dp = 40.dp
    val AvatarLarge: Dp = 64.dp
    val AvatarXLarge: Dp = 96.dp
    
    // Pokemon sprite sizes
    val PokemonSpriteSmall: Dp = 48.dp
    val PokemonSpriteMedium: Dp = 96.dp
    val PokemonSpriteLarge: Dp = 144.dp
    
    // Card sizes
    val CardMinWidth: Dp = 280.dp
    val CardMaxWidth: Dp = 600.dp
    
    // Progress indicator sizes
    val ProgressSmall: Dp = 16.dp
    val ProgressMedium: Dp = 24.dp
    val ProgressLarge: Dp = 48.dp
    
    // Badge sizes
    val BadgeSmall: Dp = 16.dp
    val BadgeMedium: Dp = 20.dp
    val BadgeLarge: Dp = 24.dp
}

/**
 * Elevation tokens for shadow/depth
 * Material 3 uses less elevation than Material 2
 */
object Elevation {
    val Level0: Dp = 0.dp       // No elevation (flat)
    val Level1: Dp = 1.dp       // Barely elevated (cards)
    val Level2: Dp = 3.dp       // Slightly elevated (app bar)
    val Level3: Dp = 6.dp       // Moderately elevated (FAB)
    val Level4: Dp = 8.dp       // Elevated (dialogs)
    val Level5: Dp = 12.dp      // Highly elevated (nav drawer)
}

/**
 * Border width tokens
 */
object BorderWidth {
    val None: Dp = 0.dp
    val Thin: Dp = 1.dp         // Default border
    val Medium: Dp = 2.dp       // Emphasized border
    val Thick: Dp = 4.dp        // Heavy border
}

/**
 * Divider thickness tokens
 */
object DividerThickness {
    val Thin: Dp = 1.dp         // Standard divider
    val Medium: Dp = 2.dp       // Emphasized divider
    val Thick: Dp = 4.dp        // Heavy divider
}

/**
 * Common padding presets for layouts
 */
object PaddingPresets {
    // Screen padding (edges of screen)
    val ScreenHorizontal: Dp = Spacing.Large        // 16dp
    val ScreenVertical: Dp = Spacing.Large          // 16dp
    val ScreenAll: Dp = Spacing.Large               // 16dp
    
    // Card padding (inside cards)
    val CardHorizontal: Dp = Spacing.Large          // 16dp
    val CardVertical: Dp = Spacing.Medium           // 12dp
    val CardAll: Dp = Spacing.Large                 // 16dp
    
    // List item padding
    val ListItemHorizontal: Dp = Spacing.Large      // 16dp
    val ListItemVertical: Dp = Spacing.Medium       // 12dp
    
    // Button padding
    val ButtonHorizontal: Dp = Spacing.Large        // 16dp
    val ButtonVertical: Dp = Spacing.Small          // 8dp
    
    // Dialog padding
    val DialogHorizontal: Dp = Spacing.XLarge       // 24dp
    val DialogVertical: Dp = Spacing.Large          // 16dp
    
    // Bottom sheet padding
    val BottomSheetHorizontal: Dp = Spacing.Large   // 16dp
    val BottomSheetVertical: Dp = Spacing.XLarge    // 24dp
    
    // Chip padding
    val ChipHorizontal: Dp = Spacing.Medium         // 12dp
    val ChipVertical: Dp = Spacing.XSmall           // 4dp
}

/**
 * Common margin presets for spacing between elements
 */
object MarginPresets {
    // Vertical spacing between sections
    val SectionSmall: Dp = Spacing.Large            // 16dp
    val SectionMedium: Dp = Spacing.XLarge          // 24dp
    val SectionLarge: Dp = Spacing.XXLarge          // 32dp
    
    // Horizontal spacing between inline elements
    val InlineSmall: Dp = Spacing.XSmall            // 4dp
    val InlineMedium: Dp = Spacing.Small            // 8dp
    val InlineLarge: Dp = Spacing.Medium            // 12dp
    
    // List item spacing
    val ListItemSmall: Dp = Spacing.Small           // 8dp
    val ListItemMedium: Dp = Spacing.Medium         // 12dp
    val ListItemLarge: Dp = Spacing.Large           // 16dp
}

/**
 * Width presets for common component widths
 */
object WidthPresets {
    val ButtonMinWidth: Dp = 64.dp
    val ButtonMaxWidth: Dp = 320.dp
    
    val TextFieldMinWidth: Dp = 120.dp
    val TextFieldMaxWidth: Dp = 480.dp
    
    val DialogMinWidth: Dp = 280.dp
    val DialogMaxWidth: Dp = 560.dp
    
    val BottomSheetMaxWidth: Dp = 640.dp
}

/**
 * Height presets for common component heights
 */
object HeightPresets {
    val TopAppBar: Dp = 64.dp
    val BottomAppBar: Dp = 80.dp
    val BottomNavigationBar: Dp = 80.dp
    
    val ListItemSmall: Dp = 56.dp
    val ListItemMedium: Dp = 72.dp
    val ListItemLarge: Dp = 88.dp
    
    val TextFieldSmall: Dp = 40.dp
    val TextFieldMedium: Dp = 56.dp
    val TextFieldLarge: Dp = 64.dp
}
