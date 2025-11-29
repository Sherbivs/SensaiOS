package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Badge components following Material Design 3 guidelines
 * 
 * Badge types:
 * 1. Notification Badge - Shows count of notifications
 * 2. Status Badge - Shows status indicator
 * 3. Dot Badge - Simple indicator without text
 */

/**
 * Notification badge
 * Badge showing notification count
 */
@Composable
fun NotificationBadge(
    count: Int,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.error,
    contentColor: Color = MaterialTheme.colorScheme.onError
) {
    if (count > 0) {
        Badge(
            modifier = modifier,
            containerColor = containerColor,
            contentColor = contentColor
        ) {
            Text(
                text = if (count > 99) "99+" else count.toString(),
                style = MaterialTheme.typography.labelSmall
            )
        }
    }
}

/**
 * Badged box
 * Content with badge overlay
 */
@Composable
fun BadgedContent(
    badge: @Composable BoxScope.() -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable BoxScope.() -> Unit
) {
    BadgedBox(
        badge = badge,
        modifier = modifier,
        content = content
    )
}

/**
 * Dot badge
 * Simple indicator without text
 */
@Composable
fun DotBadge(
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.error
) {
    Box(
        modifier = modifier
            .size(Size.BadgeSmall)
            .background(color = color, shape = CircleShape)
    )
}

/**
 * Status badge with text
 * Badge indicating status with color
 */
@Composable
fun StatusBadgeText(
    status: String,
    modifier: Modifier = Modifier
) {
    val (backgroundColor, textColor) = when (status.uppercase()) {
        "PASSED" -> StatusSuccess to Color.White
        "FAILED" -> StatusError to Color.White
        "RUNNING" -> StatusRunning to Color.White
        "SKIPPED" -> StatusWarning to Color.White
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
 * Count badge
 * Badge showing numeric count with label
 */
@Composable
fun CountBadge(
    count: Int,
    label: String,
    modifier: Modifier = Modifier,
    containerColor: Color = MaterialTheme.colorScheme.primaryContainer,
    contentColor: Color = MaterialTheme.colorScheme.onPrimaryContainer
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = containerColor,
        contentColor = contentColor
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            ),
            horizontalArrangement = Arrangement.spacedBy(Spacing.XXSmall),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = count.toString(),
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Bold
                )
            )
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall
            )
        }
    }
}

/**
 * Level badge
 * Badge showing level/tier
 */
@Composable
fun LevelBadge(
    level: Int,
    modifier: Modifier = Modifier,
    prefix: String = "Lv."
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.tertiaryContainer,
        contentColor = MaterialTheme.colorScheme.onTertiaryContainer
    ) {
        Text(
            text = "$prefix $level",
            style = MaterialTheme.typography.labelMedium,
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            )
        )
    }
}

/**
 * New badge
 * Indicator for new content
 */
@Composable
fun NewBadge(
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.error,
        contentColor = MaterialTheme.colorScheme.onError
    ) {
        Text(
            text = "NEW",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            )
        )
    }
}

/**
 * Updated badge
 * Indicator for updated content
 */
@Composable
fun UpdatedBadge(
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = StatusInfo,
        contentColor = Color.White
    ) {
        Text(
            text = "UPDATED",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            )
        )
    }
}

/**
 * Beta badge
 * Indicator for beta features
 */
@Composable
fun BetaBadge(
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = StatusWarning,
        contentColor = Color.White
    ) {
        Text(
            text = "BETA",
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            )
        )
    }
}

/**
 * Custom color badge
 * Badge with custom colors
 */
@Composable
fun CustomColorBadge(
    text: String,
    backgroundColor: Color,
    textColor: Color,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = backgroundColor,
        contentColor = textColor
    ) {
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            )
        )
    }
}

/**
 * Icon badge
 * Badge with icon and optional text
 */
@Composable
fun IconBadge(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
    text: String? = null,
    containerColor: Color = MaterialTheme.colorScheme.primaryContainer,
    contentColor: Color = MaterialTheme.colorScheme.onPrimaryContainer
) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = containerColor,
        contentColor = contentColor
    ) {
        Row(
            modifier = Modifier.padding(
                horizontal = Spacing.Small,
                vertical = Spacing.XXSmall
            ),
            horizontalArrangement = Arrangement.spacedBy(Spacing.XXSmall),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(12.dp)
            )
            if (text != null) {
                Text(
                    text = text,
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }
    }
}
