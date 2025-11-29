# ROUTER
Title: UI Components Library
Purpose: Material Design 3 component library with Pokemon theme integration
Owned Globs: ui/components/**
Last Updated (UTC): 2025-11-29T00:00:00Z

Notes:
- Complete Material 3 component library (120+ components)
- Pokemon-themed specializations (type colors, HP bars, battle UI)
- 17 component files + previews + documentation
- Integrates with theme system (colors, typography, shapes, spacing)
- All components wrapped in InfinityGauntletTheme for automatic theming

Areas:
- `Buttons.kt` — Button components (primary, secondary, outlined, text, elevated, icon, FAB)
- `Cards.kt` — Card components (elevated, filled, outlined, test scenario, result, Pokemon, info)
- `TextFields.kt` — Input components (filled, outlined, password, search, multiline, number)
- `Chips.kt` — Chip components (assist, filter, input, suggestion, status, type, count)
- `Progress.kt` — Progress indicators (linear, circular, HP bar, test execution, loading)
- `Dialogs.kt` — Dialog components (alert, confirmation, error, loading, custom, full-screen, list selection)
- `BottomSheets.kt` — Bottom sheet components (modal, titled, action, confirmation, filter)
- `Navigation.kt` — Navigation components (top bars, bottom nav, drawer, rail, tabs)
- `Lists.kt` — List components (standard, two-line, three-line, selectable, switch, test scenario, Pokemon)
- `Badges.kt` — Badge components (notification, dot, status, count, level, new, updated, beta, icon)
- `EmptyStates.kt` — Empty state components (basic, with action, no results, error, loading, coming soon, permission)
- `Snackbars.kt` — Snackbar components (standard, success, error, warning, info, icon) + helper functions
- `Surfaces.kt` — Surface components (elevated, filled, outlined, tonal, container, interactive, status, semantic)
- `Icons.kt` — Centralized icon definitions (90+ Material Icons organized by category)
- `PokemonComponents.kt` — Pokemon-specific components (type badges, HP bars, stat bars, sprites, moves, team slots)
- `ComponentPreviews.kt` — Preview composables for all components (15+ previews, light/dark themes)
- `WEEK-3-COMPONENT-LIBRARY.md` — Complete component library documentation

Integration Points:
- Theme System: `ui/theme/Theme.kt` provides InfinityGauntletTheme wrapper
- Color System: `ui/theme/Color.kt` + `ColorScheme.kt` + `ColorUtils.kt` (108 colors)
- Typography: `ui/theme/Type.kt` + `TypeUtils.kt` (33 text styles)
- Shapes: `ui/theme/Shape.kt` (14 shape definitions)
- Dimensions: `ui/theme/Dimension.kt` (spacing, sizing, elevation tokens)
- Screens: All screen composables use these components
- ViewModels: State management for component interactions

Component Categories:
- Core UI (6 files): Buttons, Cards, TextFields, Chips, Progress, Dialogs
- Layout (4 files): BottomSheets, Navigation, Lists, Badges
- Feedback (3 files): EmptyStates, Snackbars, Surfaces
- Utilities (3 files): Icons, PokemonComponents, ComponentPreviews
- Documentation (1 file): WEEK-3-COMPONENT-LIBRARY.md

Usage Pattern:
```kotlin
import com.infinitygauntlet.simulation.ui.components.*
import com.infinitygauntlet.simulation.ui.theme.*

@Composable
fun MyScreen() {
    InfinityGauntletTheme {
        Scaffold(
            topBar = {
                SmallTopBar(
                    title = "My Screen",
                    navigationIcon = AppIcons.ArrowBack,
                    onNavigationClick = { /* navigate back */ }
                )
            }
        ) { padding ->
            Column(modifier = Modifier.padding(padding)) {
                PrimaryButton(
                    text = "Action",
                    onClick = { /* handle */ },
                    icon = AppIcons.Add
                )
                
                PokemonCard(
                    name = "Pikachu",
                    types = listOf("electric"),
                    level = 25,
                    hp = 80,
                    maxHp = 100
                )
            }
        }
    }
}
```

Preview Usage:
```kotlin
@Preview(showBackground = true)
@Composable
fun MyScreenPreview() {
    InfinityGauntletThemePreview {
        MyScreen()
    }
}
```

Component Statistics:
- Total Components: 120+
- Button Variants: 9
- Card Types: 7
- Input Fields: 6
- Chips: 10
- Progress Indicators: 9
- Dialogs: 8
- Bottom Sheets: 5
- Navigation: 9
- Lists: 11
- Badges: 10
- Empty States: 8
- Snackbars: 9
- Surfaces: 13
- Icons: 90+
- Pokemon Components: 8

Design Token Coverage:
- Colors: 108 (60 base + 48 semantic)
- Typography: 33 text styles
- Shapes: 14 definitions
- Spacing: 10 levels
- Sizes: 40+ tokens
- Elevation: 6 levels

Quality Metrics:
- ✅ Material 3 compliance
- ✅ WCAG AA accessibility
- ✅ Type-safe APIs
- ✅ Zero hardcoded values
- ✅ Comprehensive previews
- ✅ Full documentation

Dependencies:
- androidx.compose.material3
- androidx.compose.material.icons
- Theme system (ui/theme/**)
- Material You (dynamic color on Android 12+)

Related Documentation:
- `docs/WEEK-3-PROGRESS.md` — Theme system documentation
- `docs/WEEK-3-COMPONENT-LIBRARY.md` — Component library documentation
- `ui/theme/ROUTER.md` — Theme system documentation
