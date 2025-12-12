@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Component preview composables
 * Previews for all custom components in light and dark themes
 */

// ==================== BUTTON PREVIEWS ====================

@Preview(name = "Buttons Light", showBackground = true)
@Composable
fun ButtonsPreview() {
    InfinityGauntletTheme(darkTheme = false) {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            PrimaryButton(text = "Primary", onClick = {})
            SecondaryButton(text = "Secondary", onClick = {})
            OutlinedActionButton(text = "Outlined", onClick = {})
            TextActionButton(text = "Text", onClick = {})
            ElevatedActionButton(text = "Elevated", onClick = {})
        }
    }
}

@Preview(name = "Buttons Dark", showBackground = true)
@Composable
fun ButtonsDarkPreview() {
    InfinityGauntletTheme(darkTheme = true) {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            PrimaryButton(text = "Primary", onClick = {})
            SecondaryButton(text = "Secondary", onClick = {})
            OutlinedActionButton(text = "Outlined", onClick = {})
        }
    }
}

@Preview(name = "Icon Buttons", showBackground = true)
@Composable
fun IconButtonsPreview() {
    InfinityGauntletTheme {
        Row(
            modifier = Modifier.padding(Spacing.Medium),
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            IconActionButton(
                icon = AppIcons.Add,
                contentDescription = "Add",
                onClick = {}
            )
            FilledIconButton(
                icon = AppIcons.Edit,
                contentDescription = "Edit",
                onClick = {}
            )
            PrimaryFAB(
                icon = AppIcons.Add,
                contentDescription = "Add",
                onClick = {}
            )
        }
    }
}

// ==================== CARD PREVIEWS ====================

@Preview(name = "Cards", showBackground = true)
@Composable
fun CardsPreview() {
    InfinityGauntletTheme {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            TestScenarioCard(
                title = "Login Test",
                description = "Verify user can log in with valid credentials",
                status = "PASSED"
            )
            
            PokemonCard(
                name = "Pikachu",
                types = listOf("Electric"),
                level = 25,
                hp = 80,
                maxHp = 100
            )
        }
    }
}

@Preview(name = "Result Card", showBackground = true)
@Composable
fun ResultCardPreview() {
    InfinityGauntletTheme {
        ResultCard(
            passed = 15,
            failed = 2,
            skipped = 3,
            duration = "2m 34s",
            modifier = Modifier.padding(Spacing.Medium)
        )
    }
}

// ==================== TEXT FIELD PREVIEWS ====================

@Preview(name = "Text Fields", showBackground = true)
@Composable
fun TextFieldsPreview() {
    InfinityGauntletTheme {
        var text by remember { mutableStateOf("") }
        var searchText by remember { mutableStateOf("") }
        
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            OutlinedInputField(
                value = text,
                onValueChange = { text = it },
                label = "Username",
                placeholder = "Enter username"
            )
            
            SearchField(
                value = searchText,
                onValueChange = { searchText = it }
            )
        }
    }
}

// ==================== CHIP PREVIEWS ====================

@Preview(name = "Chips", showBackground = true)
@Composable
fun ChipsPreview() {
    InfinityGauntletTheme {
        var selectedFilter by remember { mutableStateOf(false) }
        
        WrappedChipGroup(modifier = Modifier.padding(Spacing.Medium)) {
            AssistActionChip(label = "Assist", onClick = {})
            FilterSelectionChip(
                label = "Filter",
                selected = selectedFilter,
                onClick = { selectedFilter = !selectedFilter }
            )
            StatusChip(status = "PASSED")
            PokemonTypeChip(type = "fire")
        }
    }
}

// ==================== PROGRESS PREVIEWS ====================

@Preview(name = "Progress Indicators", showBackground = true)
@Composable
fun ProgressPreview() {
    InfinityGauntletTheme {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Large)
        ) {
            LinearProgressWithLabel(progress = 0.65f, label = "Loading")
            CircularProgressWithLabel(progress = 0.75f)
            HPBar(currentHP = 80, maxHP = 100)
        }
    }
}

// ==================== BADGE PREVIEWS ====================

@Preview(name = "Badges", showBackground = true)
@Composable
fun BadgesPreview() {
    InfinityGauntletTheme {
        FlowRow(
            modifier = Modifier.padding(Spacing.Medium),
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
            verticalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            StatusBadgeText(status = "PASSED")
            StatusBadgeText(status = "FAILED")
            StatusBadgeText(status = "RUNNING")
            LevelBadge(level = 25)
            NewBadge()
            BetaBadge()
            BadgedContent(
                badge = { NotificationBadge(count = 5) }
            ) {
                Icon(
                    imageVector = AppIcons.Notifications,
                    contentDescription = "Notifications"
                )
            }
        }
    }
}

// ==================== LIST PREVIEWS ====================

@Preview(name = "List Items", showBackground = true)
@Composable
fun ListItemsPreview() {
    InfinityGauntletTheme {
        Column {
            SectionHeader(title = "Test Scenarios")
            StandardListItem(
                headlineText = "Login Test",
                supportingText = "Verify authentication",
                leadingIcon = AppIcons.CheckCircle,
                trailingIcon = AppIcons.ChevronRight
            )
            ItemDivider()
            TestScenarioListItem(
                name = "API Test",
                description = "Test REST endpoints",
                status = "RUNNING",
                onClick = {}
            )
        }
    }
}

// ==================== POKEMON COMPONENT PREVIEWS ====================

@Preview(name = "Pokemon Components", showBackground = true)
@Composable
fun PokemonComponentsPreview() {
    InfinityGauntletTheme {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            PokemonHPBar(currentHP = 85, maxHP = 100)
            
            PokemonStatBar(
                statName = "Attack",
                statValue = 120,
                maxValue = 255
            )
            
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.Small)) {
                PokemonTypeBadge(type = "fire")
                PokemonTypeBadge(type = "water")
                PokemonTypeBadge(type = "electric")
            }
            
            PokemonTeamSlot(
                pokemonName = "Charizard",
                level = 50,
                currentHP = 150,
                maxHP = 200,
                isFainted = false
            )
        }
    }
}

@Preview(name = "Battle Move Button", showBackground = true)
@Composable
fun BattleMoveButtonPreview() {
    InfinityGauntletTheme {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            BattleMoveButton(
                moveName = "Flamethrower",
                moveType = "fire",
                pp = 15,
                maxPP = 15,
                onMoveSelected = {}
            )
            BattleMoveButton(
                moveName = "Hydro Pump",
                moveType = "water",
                pp = 5,
                maxPP = 10,
                onMoveSelected = {}
            )
        }
    }
}

// ==================== EMPTY STATE PREVIEWS ====================

@Preview(name = "Empty States", showBackground = true, heightDp = 400)
@Composable
fun EmptyStatesPreview() {
    InfinityGauntletTheme {
        EmptyStateWithAction(
            title = "No Tests Found",
            message = "Start by creating your first test scenario",
            actionText = "Create Test",
            onAction = {},
            icon = AppIcons.TestTube
        )
    }
}

@Preview(name = "Error State", showBackground = true, heightDp = 400)
@Composable
fun ErrorStatePreview() {
    InfinityGauntletTheme {
        ErrorState(
            title = "Something Went Wrong",
            message = "Unable to load test results. Please try again.",
            onRetry = {}
        )
    }
}

// ==================== NAVIGATION PREVIEWS ====================

@Preview(name = "Top App Bar", showBackground = true)
@Composable
fun TopAppBarPreview() {
    InfinityGauntletTheme {
        SmallTopBar(
            title = "Test Scenarios",
            navigationIcon = AppIcons.Menu,
            onNavigationClick = {},
            actions = {
                IconActionButton(
                    icon = AppIcons.Search,
                    contentDescription = "Search",
                    onClick = {}
                )
                IconActionButton(
                    icon = AppIcons.MoreVert,
                    contentDescription = "More",
                    onClick = {}
                )
            }
        )
    }
}

@Preview(name = "Bottom Navigation", showBackground = true)
@Composable
fun BottomNavigationPreview() {
    InfinityGauntletTheme {
        BottomNavBar(
            items = listOf(
                NavigationItem("home", "Home", AppIcons.Home),
                NavigationItem("tests", "Tests", AppIcons.TestTube),
                NavigationItem("pokemon", "Pokemon", AppIcons.CatchingPokemon),
                NavigationItem("settings", "Settings", AppIcons.Settings)
            ),
            selectedItem = "home",
            onItemSelected = {}
        )
    }
}

// ==================== SURFACE PREVIEWS ====================

@Preview(name = "Surfaces", showBackground = true)
@Composable
fun SurfacesPreview() {
    InfinityGauntletTheme {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            ElevatedSurface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.Small)
            ) {
                Text(
                    text = "Elevated Surface",
                    modifier = Modifier.padding(Spacing.Medium)
                )
            }
            
            OutlinedSurface(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.Small)
            ) {
                Text(
                    text = "Outlined Surface",
                    modifier = Modifier.padding(Spacing.Medium)
                )
            }
            
            StatusSurface(
                status = "PASSED",
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(Spacing.Small)
            ) {
                Text(
                    text = "Status Surface - PASSED",
                    modifier = Modifier.padding(Spacing.Medium)
                )
            }
        }
    }
}

// ==================== COMBINED PREVIEW ====================

@Preview(name = "Component Showcase", showBackground = true, heightDp = 800)
@Composable
fun ComponentShowcasePreview() {
    InfinityGauntletTheme {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            Text(
                text = "Material 3 Components",
                style = MaterialTheme.typography.headlineMedium
            )
            
            PrimaryButton(text = "Primary Action", onClick = {})
            
            TestScenarioCard(
                title = "Sample Test",
                description = "Testing component library",
                status = "PASSED"
            )
            
            Row(horizontalArrangement = Arrangement.spacedBy(Spacing.Small)) {
                StatusChip(status = "PASSED")
                StatusChip(status = "FAILED")
                StatusChip(status = "RUNNING")
            }
            
            LinearProgressWithLabel(progress = 0.75f, label = "Progress")
        }
    }
}
