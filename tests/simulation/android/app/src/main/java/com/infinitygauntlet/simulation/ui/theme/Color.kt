package com.infinitygauntlet.simulation.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Color palette for Infinity Gauntlet Simulation
 * 
 * Following Material Design 3 color system with Pokemon-themed colors.
 * Colors are defined as base tokens, then mapped to semantic roles in ColorScheme.
 * 
 * Color naming convention:
 * - Use descriptive names (not semantic roles like "primary")
 * - Include lightness level for variants (e.g., PokemonRed40, PokemonRed80)
 * - Numbers indicate lightness: 0 = black, 100 = white
 * 
 * Pokemon Theme Colors:
 * - Red: Primary brand color (Pokeball red)
 * - Yellow: Secondary accent (Electric type)
 * - Blue: Tertiary accent (Water type)
 * - Green: Success/Nature accent (Grass type)
 */

// ============================================================================
// POKEMON RED (Primary) - Pokéball Red
// ============================================================================
val PokemonRed10 = Color(0xFF2B0000)   // Darkest
val PokemonRed20 = Color(0xFF5C0000)
val PokemonRed30 = Color(0xFF8E0000)
val PokemonRed40 = Color(0xFFDC0A2D)   // Brand color
val PokemonRed50 = Color(0xFFE63946)
val PokemonRed60 = Color(0xFFEE5A63)
val PokemonRed70 = Color(0xFFF47B82)
val PokemonRed80 = Color(0xFFF99CA1)   // Light accent
val PokemonRed90 = Color(0xFFFCBDC0)
val PokemonRed95 = Color(0xFFFEDEDF)
val PokemonRed99 = Color(0xFFFFFBFF)   // Nearly white

// ============================================================================
// ELECTRIC YELLOW (Secondary) - Pikachu Yellow
// ============================================================================
val ElectricYellow10 = Color(0xFF332900)   // Darkest
val ElectricYellow20 = Color(0xFF665200)
val ElectricYellow30 = Color(0xFF997B00)
val ElectricYellow40 = Color(0xFFFFCB05)   // Brand color
val ElectricYellow50 = Color(0xFFFFD633)
val ElectricYellow60 = Color(0xFFFFDD5C)
val ElectricYellow70 = Color(0xFFFFE485)
val ElectricYellow80 = Color(0xFFFFEBAD)   // Light accent
val ElectricYellow90 = Color(0xFFFFF2D6)
val ElectricYellow95 = Color(0xFFFFF9EB)
val ElectricYellow99 = Color(0xFFFFFEF9)   // Nearly white

// ============================================================================
// WATER BLUE (Tertiary) - Blastoise Blue
// ============================================================================
val WaterBlue10 = Color(0xFF0F1428)   // Darkest
val WaterBlue20 = Color(0xFF1E2850)
val WaterBlue30 = Color(0xFF2D3C78)
val WaterBlue40 = Color(0xFF3B4CCA)   // Brand color
val WaterBlue50 = Color(0xFF5C6AD4)
val WaterBlue60 = Color(0xFF7D88DD)
val WaterBlue70 = Color(0xFF9EA6E6)
val WaterBlue80 = Color(0xFFBFC4EF)   // Light accent
val WaterBlue90 = Color(0xFFDFE2F7)
val WaterBlue95 = Color(0xFFEFF1FB)
val WaterBlue99 = Color(0xFFFCFCFF)   // Nearly white

// ============================================================================
// GRASS GREEN (Success/Nature) - Bulbasaur Green
// ============================================================================
val GrassGreen10 = Color(0xFF18280F)   // Darkest
val GrassGreen20 = Color(0xFF30501E)
val GrassGreen30 = Color(0xFF48782D)
val GrassGreen40 = Color(0xFF78C850)   // Brand color
val GrassGreen50 = Color(0xFF8DD36A)
val GrassGreen60 = Color(0xFFA2DE84)
val GrassGreen70 = Color(0xFFB7E99E)
val GrassGreen80 = Color(0xFFCCF4B8)   // Light accent
val GrassGreen90 = Color(0xFFE1F9D2)
val GrassGreen95 = Color(0xFFF0FCE9)
val GrassGreen99 = Color(0xFFFAFFF5)   // Nearly white

// ============================================================================
// FIRE ORANGE (Warning) - Charizard Orange
// ============================================================================
val FireOrange10 = Color(0xFF2B1400)   // Darkest
val FireOrange20 = Color(0xFF5C2800)
val FireOrange30 = Color(0xFF8E3C00)
val FireOrange40 = Color(0xFFFF7F00)   // Brand color
val FireOrange50 = Color(0xFFFF9933)
val FireOrange60 = Color(0xFFFFAD5C)
val FireOrange70 = Color(0xFFFFC285)
val FireOrange80 = Color(0xFFFFD6AD)   // Light accent
val FireOrange90 = Color(0xFFFFEBD6)
val FireOrange95 = Color(0xFFFFF5EB)
val FireOrange99 = Color(0xFFFFFCF9)   // Nearly white

// ============================================================================
// NEUTRAL COLORS (Backgrounds, Surfaces, Outlines)
// ============================================================================
val Neutral0 = Color(0xFF000000)      // Pure black
val Neutral10 = Color(0xFF1C1B1F)     // Darkest surface
val Neutral20 = Color(0xFF313033)
val Neutral30 = Color(0xFF484649)
val Neutral40 = Color(0xFF605D62)
val Neutral50 = Color(0xFF787579)
val Neutral60 = Color(0xFF928F93)
val Neutral70 = Color(0xFFACA9AE)
val Neutral80 = Color(0xFFC7C4C9)
val Neutral90 = Color(0xFFE3E0E4)
val Neutral95 = Color(0xFFF2EFF3)
val Neutral99 = Color(0xFFFFFBFF)     // Nearly white
val Neutral100 = Color(0xFFFFFFFF)    // Pure white

// ============================================================================
// NEUTRAL VARIANT (Outline, Secondary Container)
// ============================================================================
val NeutralVariant0 = Color(0xFF000000)
val NeutralVariant10 = Color(0xFF1D1A22)
val NeutralVariant20 = Color(0xFF322F37)
val NeutralVariant30 = Color(0xFF49454F)
val NeutralVariant40 = Color(0xFF605D66)
val NeutralVariant50 = Color(0xFF79747E)
val NeutralVariant60 = Color(0xFF938F99)
val NeutralVariant70 = Color(0xFFAEA9B4)
val NeutralVariant80 = Color(0xFFCAC4D0)
val NeutralVariant90 = Color(0xFFE7E0EC)
val NeutralVariant95 = Color(0xFFF5EFF7)
val NeutralVariant99 = Color(0xFFFFFBFF)
val NeutralVariant100 = Color(0xFFFFFFFF)

// ============================================================================
// ERROR COLORS (Material Red)
// ============================================================================
val Error0 = Color(0xFF000000)
val Error10 = Color(0xFF410E0B)
val Error20 = Color(0xFF601410)
val Error30 = Color(0xFF8C1D18)
val Error40 = Color(0xFFB3261E)       // Standard error
val Error50 = Color(0xFFDC362E)
val Error60 = Color(0xFFE46962)
val Error70 = Color(0xFFEC928E)
val Error80 = Color(0xFFF2B8B5)
val Error90 = Color(0xFFF9DEDC)
val Error95 = Color(0xFFFCEEEE)
val Error99 = Color(0xFFFFFBF9)
val Error100 = Color(0xFFFFFFFF)

// ============================================================================
// POKEMON TYPE COLORS (For UI decorations and badges)
// ============================================================================
// Use these for type-specific UI elements, not semantic roles
val TypeNormal = Color(0xFFA8A878)
val TypeFire = Color(0xFFF08030)
val TypeWater = Color(0xFF6890F0)
val TypeElectric = Color(0xFFF8D030)
val TypeGrass = Color(0xFF78C850)
val TypeIce = Color(0xFF98D8D8)
val TypeFighting = Color(0xFFC03028)
val TypePoison = Color(0xFFA040A0)
val TypeGround = Color(0xFFE0C068)
val TypeFlying = Color(0xFFA890F0)
val TypePsychic = Color(0xFFF85888)
val TypeBug = Color(0xFFA8B820)
val TypeRock = Color(0xFFB8A038)
val TypeGhost = Color(0xFF705898)
val TypeDragon = Color(0xFF7038F8)
val TypeDark = Color(0xFF705848)
val TypeSteel = Color(0xFFB8B8D0)
val TypeFairy = Color(0xFFEE99AC)

// ============================================================================
// STATUS COLORS (For test results and battle indicators)
// ============================================================================
val StatusSuccess = GrassGreen40        // Tests passed
val StatusError = Error40               // Tests failed
val StatusWarning = FireOrange40        // Tests skipped/warning
val StatusInfo = WaterBlue40            // Information
val StatusRunning = ElectricYellow40    // Tests running
