package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * List components following Material Design 3 guidelines
 * 
 * List types:
 * 1. List Item - Standard list item with optional icons
 * 2. Section Header - Divider with title for sections
 * 3. Divider - Horizontal line separator
 */

/**
 * Standard list item
 * One-line list item with optional icons
 */
@Composable
fun StandardListItem(
    headlineText: String,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    onTrailingIconClick: (() -> Unit)? = null,
    onClick: (() -> Unit)? = null
) {
    ListItem(
        headlineContent = {
            Text(
                text = headlineText,
                style = MaterialTheme.typography.bodyLarge
            )
        },
        modifier = if (onClick != null) {
            modifier.clickable(onClick = onClick)
        } else {
            modifier
        },
        supportingContent = supportingText?.let {
            {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        leadingContent = leadingIcon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(Size.IconMedium)
                )
            }
        },
        trailingContent = trailingIcon?.let {
            {
                if (onTrailingIconClick != null) {
                    IconButton(onClick = onTrailingIconClick) {
                        Icon(
                            imageVector = it,
                            contentDescription = null,
                            modifier = Modifier.size(Size.IconMedium)
                        )
                    }
                } else {
                    Icon(
                        imageVector = it,
                        contentDescription = null,
                        modifier = Modifier.size(Size.IconMedium)
                    )
                }
            }
        }
    )
}

/**
 * Two-line list item
 * List item with headline and supporting text
 */
@Composable
fun TwoLineListItem(
    headlineText: String,
    supportingText: String,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    onTrailingIconClick: (() -> Unit)? = null,
    onClick: (() -> Unit)? = null
) {
    StandardListItem(
        headlineText = headlineText,
        supportingText = supportingText,
        modifier = modifier,
        leadingIcon = leadingIcon,
        trailingIcon = trailingIcon,
        onTrailingIconClick = onTrailingIconClick,
        onClick = onClick
    )
}

/**
 * Three-line list item
 * List item with headline and multiline supporting text
 */
@Composable
fun ThreeLineListItem(
    headlineText: String,
    supportingText: String,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    onTrailingIconClick: (() -> Unit)? = null,
    onClick: (() -> Unit)? = null
) {
    ListItem(
        headlineContent = {
            Text(
                text = headlineText,
                style = MaterialTheme.typography.bodyLarge
            )
        },
        supportingContent = {
            Text(
                text = supportingText,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2
            )
        },
        modifier = if (onClick != null) {
            modifier.clickable(onClick = onClick)
        } else {
            modifier
        },
        leadingContent = leadingIcon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(Size.IconMedium)
                )
            }
        },
        trailingContent = trailingIcon?.let {
            {
                if (onTrailingIconClick != null) {
                    IconButton(onClick = onTrailingIconClick) {
                        Icon(
                            imageVector = it,
                            contentDescription = null,
                            modifier = Modifier.size(Size.IconMedium)
                        )
                    }
                } else {
                    Icon(
                        imageVector = it,
                        contentDescription = null,
                        modifier = Modifier.size(Size.IconMedium)
                    )
                }
            }
        }
    )
}

/**
 * Selectable list item
 * List item with selection state
 */
@Composable
fun SelectableListItem(
    headlineText: String,
    selected: Boolean,
    onSelectionChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
    leadingIcon: ImageVector? = null
) {
    ListItem(
        headlineContent = {
            Text(
                text = headlineText,
                style = MaterialTheme.typography.bodyLarge
            )
        },
        supportingContent = supportingText?.let {
            {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        modifier = modifier.clickable { onSelectionChange(!selected) },
        leadingContent = leadingIcon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(Size.IconMedium)
                )
            }
        },
        trailingContent = {
            Checkbox(
                checked = selected,
                onCheckedChange = onSelectionChange
            )
        }
    )
}

/**
 * Switch list item
 * List item with toggle switch
 */
@Composable
fun SwitchListItem(
    headlineText: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    supportingText: String? = null,
    leadingIcon: ImageVector? = null,
    enabled: Boolean = true
) {
    ListItem(
        headlineContent = {
            Text(
                text = headlineText,
                style = MaterialTheme.typography.bodyLarge
            )
        },
        supportingContent = supportingText?.let {
            {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        modifier = modifier.clickable(enabled = enabled) { onCheckedChange(!checked) },
        leadingContent = leadingIcon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(Size.IconMedium)
                )
            }
        },
        trailingContent = {
            Switch(
                checked = checked,
                onCheckedChange = onCheckedChange,
                enabled = enabled
            )
        }
    )
}

/**
 * Section header
 * Divider with title for grouping list items
 */
@Composable
fun SectionHeader(
    title: String,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxWidth()) {
        Spacer(modifier = Modifier.height(Spacing.Medium))
        
        Text(
            text = title.uppercase(),
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(
                horizontal = PaddingPresets.ListItemHorizontal,
                vertical = Spacing.Small
            )
        )
    }
}

/**
 * Horizontal divider
 * Thin line separator between items
 */
@Composable
fun ItemDivider(
    modifier: Modifier = Modifier,
    thickness: androidx.compose.ui.unit.Dp = DividerThickness.Thin,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.outlineVariant
) {
    HorizontalDivider(
        modifier = modifier,
        thickness = thickness,
        color = color
    )
}

/**
 * Inset divider
 * Divider with left padding (for icon alignment)
 */
@Composable
fun InsetDivider(
    modifier: Modifier = Modifier,
    inset: androidx.compose.ui.unit.Dp = 72.dp,
    thickness: androidx.compose.ui.unit.Dp = DividerThickness.Thin,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.outlineVariant
) {
    HorizontalDivider(
        modifier = modifier.padding(start = inset),
        thickness = thickness,
        color = color
    )
}

/**
 * Test scenario list item
 * Specialized list item for test scenarios
 */
@Composable
fun TestScenarioListItem(
    name: String,
    description: String,
    status: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ListItem(
        headlineContent = {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge
            )
        },
        supportingContent = {
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingContent = {
            StatusChip(status = status)
        },
        modifier = modifier.clickable(onClick = onClick)
    )
}

/**
 * Pokemon list item
 * Specialized list item for Pokemon
 */
@Composable
fun PokemonListItem(
    name: String,
    types: List<String>,
    level: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ListItem(
        headlineContent = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    text = "Lv. $level",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        },
        supportingContent = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                types.forEach { type ->
                    PokemonTypeChip(type = type)
                }
            }
        },
        trailingContent = {
            Icon(
                imageVector = AppIcons.ChevronRight,
                contentDescription = null
            )
        },
        modifier = modifier.clickable(onClick = onClick)
    )
}

/**
 * Empty list placeholder
 * Displays message when list is empty
 */
@Composable
fun EmptyListPlaceholder(
    message: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(Spacing.Medium),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(Size.IconXLarge),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
        }
        
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
