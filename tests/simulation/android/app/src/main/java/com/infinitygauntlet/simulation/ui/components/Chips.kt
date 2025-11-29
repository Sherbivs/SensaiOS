@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Chip components following Material Design 3 guidelines
 * 
 * Chip types:
 * 1. Assist Chip - Action chips for contextual help
 * 2. Filter Chip - Selection chips with checkmarks
 * 3. Input Chip - Removable chips with close icon
 * 4. Suggestion Chip - Recommendations without state
 */

/**
 * Assist chip
 * Action chip for contextual assistance
 */
@Composable
fun AssistActionChip(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true
) {
    AssistChip(
        onClick = onClick,
        label = { 
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium
            ) 
        },
        modifier = modifier,
        enabled = enabled,
        leadingIcon = icon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(Size.IconSmall)
                )
            }
        }
    )
}

/**
 * Filter chip
 * Selection chip with checkmark
 */
@Composable
fun FilterSelectionChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true
) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { 
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium
            ) 
        },
        modifier = modifier,
        enabled = enabled,
        leadingIcon = if (selected || icon != null) {
            {
                if (selected) {
                    Icon(
                        imageVector = AppIcons.Done,
                        contentDescription = "Selected",
                        modifier = Modifier.size(Size.IconSmall)
                    )
                } else if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(Size.IconSmall)
                    )
                }
            }
        } else null
    )
}

/**
 * Input chip
 * Removable chip with close icon
 */
@Composable
fun InputDataChip(
    label: String,
    onRemove: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true
) {
    InputChip(
        selected = false,
        onClick = { },
        label = { 
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium
            ) 
        },
        modifier = modifier,
        enabled = enabled,
        leadingIcon = icon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(Size.IconSmall)
                )
            }
        },
        trailingIcon = {
            IconButton(
                onClick = onRemove,
                modifier = Modifier.size(Size.IconSmall)
            ) {
                Icon(
                    imageVector = AppIcons.Close,
                    contentDescription = "Remove",
                    modifier = Modifier.size(Size.IconSmall)
                )
            }
        }
    )
}

/**
 * Suggestion chip
 * Recommendation chip without state
 */
@Composable
fun SuggestionActionChip(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    enabled: Boolean = true
) {
    SuggestionChip(
        onClick = onClick,
        label = { 
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium
            ) 
        },
        modifier = modifier,
        enabled = enabled,
        icon = icon?.let {
            {
                Icon(
                    imageVector = it,
                    contentDescription = null,
                    modifier = Modifier.size(Size.IconSmall)
                )
            }
        }
    )
}

/**
 * Status chip
 * Colored chip indicating status
 */
@Composable
fun StatusChip(
    status: String,
    modifier: Modifier = Modifier
) {
    val (backgroundColor, textColor) = when (status.uppercase()) {
        "PASSED" -> StatusSuccess to MaterialTheme.colorScheme.onPrimary
        "FAILED" -> StatusError to MaterialTheme.colorScheme.onError
        "RUNNING" -> StatusRunning to MaterialTheme.colorScheme.onPrimary
        "SKIPPED" -> StatusWarning to MaterialTheme.colorScheme.onPrimary
        "READY" -> MaterialTheme.colorScheme.primary to MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
    }

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = backgroundColor,
        contentColor = textColor
    ) {
        Text(
            text = status.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            )
        )
    }
}

/**
 * Pokemon type chip
 * Chip styled with Pokemon type color
 */
@Composable
fun PokemonTypeChip(
    type: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val typeColor = getPokemonTypeColor(type)
    
    if (onClick != null) {
        AssistChip(
            onClick = onClick,
            label = {
                Text(
                    text = type.uppercase(),
                    style = MaterialTheme.typography.labelMedium
                )
            },
            modifier = modifier,
            colors = AssistChipDefaults.assistChipColors(
                containerColor = typeColor,
                labelColor = MaterialTheme.colorScheme.onPrimary
            )
        )
    } else {
        Surface(
            modifier = modifier,
            shape = MaterialTheme.shapes.small,
            color = typeColor,
            contentColor = MaterialTheme.colorScheme.onPrimary
        ) {
            Text(
                text = type.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                modifier = Modifier.padding(
                    horizontal = Spacing.Small,
                    vertical = Spacing.XXSmall
                )
            )
        }
    }
}

/**
 * Count chip
 * Chip displaying a numeric count
 */
@Composable
fun CountChip(
    count: Int,
    label: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null
) {
    AssistChip(
        onClick = { },
        label = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.XXSmall),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(Size.IconSmall)
                    )
                }
                Text(
                    text = "$count $label",
                    style = MaterialTheme.typography.labelMedium
                )
            }
        },
        modifier = modifier,
        enabled = false
    )
}

/**
 * Chip group
 * Row of chips with proper spacing
 */
@Composable
fun ChipGroup(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
        content = content
    )
}

/**
 * Wrapped chip group
 * Chips that wrap to multiple lines
 */
@Composable
fun WrappedChipGroup(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
        verticalArrangement = Arrangement.spacedBy(Spacing.Small)
    ) {
        content()
    }
}
