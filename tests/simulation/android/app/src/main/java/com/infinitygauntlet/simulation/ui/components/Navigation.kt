package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Navigation components following Material Design 3 guidelines
 * 
 * Navigation types:
 * 1. Top App Bar - Top navigation with title and actions
 * 2. Bottom Navigation Bar - Bottom tabs navigation
 * 3. Navigation Drawer - Side drawer navigation
 * 4. Navigation Rail - Side rail navigation (tablet/desktop)
 */

/**
 * Small top app bar
 * Standard top app bar for most screens
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmallTopBar(
    title: String,
    modifier: Modifier = Modifier,
    navigationIcon: ImageVector? = null,
    onNavigationClick: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {}
) {
    TopAppBar(
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge
            )
        },
        modifier = modifier,
        navigationIcon = {
            if (navigationIcon != null && onNavigationClick != null) {
                IconButton(onClick = onNavigationClick) {
                    Icon(
                        imageVector = navigationIcon,
                        contentDescription = "Navigate back"
                    )
                }
            }
        },
        actions = actions
    )
}

/**
 * Medium top app bar
 * Top app bar with more vertical space
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediumTopBar(
    title: String,
    modifier: Modifier = Modifier,
    navigationIcon: ImageVector? = null,
    onNavigationClick: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {}
) {
    MediumTopAppBar(
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall
            )
        },
        modifier = modifier,
        navigationIcon = {
            if (navigationIcon != null && onNavigationClick != null) {
                IconButton(onClick = onNavigationClick) {
                    Icon(
                        imageVector = navigationIcon,
                        contentDescription = "Navigate back"
                    )
                }
            }
        },
        actions = actions
    )
}

/**
 * Large top app bar
 * Top app bar with expanded title space
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LargeTopBar(
    title: String,
    modifier: Modifier = Modifier,
    navigationIcon: ImageVector? = null,
    onNavigationClick: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {}
) {
    LargeTopAppBar(
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineMedium
            )
        },
        modifier = modifier,
        navigationIcon = {
            if (navigationIcon != null && onNavigationClick != null) {
                IconButton(onClick = onNavigationClick) {
                    Icon(
                        imageVector = navigationIcon,
                        contentDescription = "Navigate back"
                    )
                }
            }
        },
        actions = actions
    )
}

/**
 * Bottom navigation bar
 * Bottom tabs for primary navigation destinations
 */
@Composable
fun BottomNavBar(
    items: List<NavigationItem>,
    selectedItem: String,
    onItemSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    NavigationBar(
        modifier = modifier
    ) {
        items.forEach { item ->
            NavigationBarItem(
                icon = {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.label
                    )
                },
                label = {
                    Text(
                        text = item.label,
                        style = MaterialTheme.typography.labelMedium
                    )
                },
                selected = selectedItem == item.id,
                onClick = { onItemSelected(item.id) }
            )
        }
    }
}

/**
 * Navigation drawer
 * Side drawer for navigation menu
 */
@Composable
fun NavigationDrawerContent(
    items: List<NavigationItem>,
    selectedItem: String,
    onItemSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    header: @Composable (ColumnScope.() -> Unit)? = null
) {
    ModalDrawerSheet(
        modifier = modifier
    ) {
        header?.invoke(this)
        
        if (header != null) {
            Spacer(modifier = Modifier.height(Spacing.Medium))
        }
        
        items.forEach { item ->
            NavigationDrawerItem(
                icon = {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = null
                    )
                },
                label = {
                    Text(
                        text = item.label,
                        style = MaterialTheme.typography.labelLarge
                    )
                },
                selected = selectedItem == item.id,
                onClick = { onItemSelected(item.id) },
                modifier = Modifier.padding(NavigationDrawerItemDefaults.ItemPadding)
            )
        }
    }
}

/**
 * Navigation rail
 * Side rail navigation for tablets/desktop
 */
@Composable
fun NavigationRailContent(
    items: List<NavigationItem>,
    selectedItem: String,
    onItemSelected: (String) -> Unit,
    modifier: Modifier = Modifier,
    header: @Composable (ColumnScope.() -> Unit)? = null
) {
    NavigationRail(
        modifier = modifier,
        header = header
    ) {
        Spacer(modifier = Modifier.height(Spacing.Medium))
        
        items.forEach { item ->
            NavigationRailItem(
                icon = {
                    Icon(
                        imageVector = item.icon,
                        contentDescription = item.label
                    )
                },
                label = {
                    Text(
                        text = item.label,
                        style = MaterialTheme.typography.labelMedium
                    )
                },
                selected = selectedItem == item.id,
                onClick = { onItemSelected(item.id) }
            )
        }
    }
}

/**
 * Tabs
 * Horizontal tabs for content organization
 */
@Composable
fun TabRow(
    tabs: List<String>,
    selectedTab: Int,
    onTabSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    androidx.compose.material3.TabRow(
        selectedTabIndex = selectedTab,
        modifier = modifier
    ) {
        tabs.forEachIndexed { index, title ->
            Tab(
                selected = selectedTab == index,
                onClick = { onTabSelected(index) },
                text = {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleSmall
                    )
                }
            )
        }
    }
}

/**
 * Scrollable tabs
 * Tabs that can scroll horizontally
 */
@Composable
fun ScrollableTabRow(
    tabs: List<String>,
    selectedTab: Int,
    onTabSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    androidx.compose.material3.ScrollableTabRow(
        selectedTabIndex = selectedTab,
        modifier = modifier
    ) {
        tabs.forEachIndexed { index, title ->
            Tab(
                selected = selectedTab == index,
                onClick = { onTabSelected(index) },
                text = {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.titleSmall
                    )
                }
            )
        }
    }
}

/**
 * Icon tabs
 * Tabs with icons instead of text
 */
@Composable
fun IconTabRow(
    tabs: List<Pair<ImageVector, String>>, // Icon and content description
    selectedTab: Int,
    onTabSelected: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    androidx.compose.material3.TabRow(
        selectedTabIndex = selectedTab,
        modifier = modifier
    ) {
        tabs.forEachIndexed { index, (icon, contentDescription) ->
            Tab(
                selected = selectedTab == index,
                onClick = { onTabSelected(index) },
                icon = {
                    Icon(
                        imageVector = icon,
                        contentDescription = contentDescription
                    )
                }
            )
        }
    }
}

/**
 * Data class for navigation items
 */
data class NavigationItem(
    val id: String,
    val label: String,
    val icon: ImageVector
)
