package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Snackbar components following Material Design 3 guidelines
 * 
 * Snackbar types:
 * 1. Basic Snackbar - Simple message
 * 2. Action Snackbar - Message with action button
 * 3. Custom Snackbar - Fully customizable
 */

/**
 * Standard snackbar host
 * Place at bottom of Scaffold
 */
@Composable
fun StandardSnackbarHost(
    hostState: SnackbarHostState,
    modifier: Modifier = Modifier
) {
    SnackbarHost(
        hostState = hostState,
        modifier = modifier
    )
}

/**
 * Show simple snackbar
 * Helper function to show basic snackbar
 */
suspend fun showSnackbar(
    hostState: SnackbarHostState,
    message: String,
    duration: SnackbarDuration = SnackbarDuration.Short
): SnackbarResult {
    return hostState.showSnackbar(
        message = message,
        duration = duration
    )
}

/**
 * Show snackbar with action
 * Helper function to show snackbar with action button
 */
suspend fun showSnackbarWithAction(
    hostState: SnackbarHostState,
    message: String,
    actionLabel: String,
    duration: SnackbarDuration = SnackbarDuration.Short
): SnackbarResult {
    return hostState.showSnackbar(
        message = message,
        actionLabel = actionLabel,
        duration = duration
    )
}

/**
 * Success snackbar
 * Custom snackbar for success messages
 */
@Composable
fun SuccessSnackbar(
    message: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null
) {
    Snackbar(
        modifier = modifier,
        containerColor = StatusSuccess,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        action = action
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = AppIcons.CheckCircle,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * Error snackbar
 * Custom snackbar for error messages
 */
@Composable
fun ErrorSnackbar(
    message: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null
) {
    Snackbar(
        modifier = modifier,
        containerColor = StatusError,
        contentColor = MaterialTheme.colorScheme.onError,
        action = action
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = AppIcons.Error,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * Warning snackbar
 * Custom snackbar for warning messages
 */
@Composable
fun WarningSnackbar(
    message: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null
) {
    Snackbar(
        modifier = modifier,
        containerColor = StatusWarning,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        action = action
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = AppIcons.Warning,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * Info snackbar
 * Custom snackbar for informational messages
 */
@Composable
fun InfoSnackbar(
    message: String,
    modifier: Modifier = Modifier,
    action: @Composable (() -> Unit)? = null
) {
    Snackbar(
        modifier = modifier,
        containerColor = StatusInfo,
        contentColor = MaterialTheme.colorScheme.onPrimary,
        action = action
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = AppIcons.Info,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * Custom icon snackbar
 * Snackbar with custom icon
 */
@Composable
fun IconSnackbar(
    message: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    containerColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.inverseSurface,
    contentColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.inverseOnSurface,
    action: @Composable (() -> Unit)? = null
) {
    Snackbar(
        modifier = modifier,
        containerColor = containerColor,
        contentColor = contentColor,
        action = action
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * Helper functions for showing different snackbar types
 */
suspend fun showSuccessSnackbar(
    hostState: SnackbarHostState,
    message: String,
    actionLabel: String? = null,
    duration: SnackbarDuration = SnackbarDuration.Short
): SnackbarResult {
    return if (actionLabel != null) {
        hostState.showSnackbar(
            message = "✓ $message",
            actionLabel = actionLabel,
            duration = duration
        )
    } else {
        hostState.showSnackbar(
            message = "✓ $message",
            duration = duration
        )
    }
}

suspend fun showErrorSnackbar(
    hostState: SnackbarHostState,
    message: String,
    actionLabel: String? = null,
    duration: SnackbarDuration = SnackbarDuration.Long
): SnackbarResult {
    return if (actionLabel != null) {
        hostState.showSnackbar(
            message = "✕ $message",
            actionLabel = actionLabel,
            duration = duration
        )
    } else {
        hostState.showSnackbar(
            message = "✕ $message",
            duration = duration
        )
    }
}

suspend fun showWarningSnackbar(
    hostState: SnackbarHostState,
    message: String,
    actionLabel: String? = null,
    duration: SnackbarDuration = SnackbarDuration.Short
): SnackbarResult {
    return if (actionLabel != null) {
        hostState.showSnackbar(
            message = "⚠ $message",
            actionLabel = actionLabel,
            duration = duration
        )
    } else {
        hostState.showSnackbar(
            message = "⚠ $message",
            duration = duration
        )
    }
}

suspend fun showInfoSnackbar(
    hostState: SnackbarHostState,
    message: String,
    actionLabel: String? = null,
    duration: SnackbarDuration = SnackbarDuration.Short
): SnackbarResult {
    return if (actionLabel != null) {
        hostState.showSnackbar(
            message = "ℹ $message",
            actionLabel = actionLabel,
            duration = duration
        )
    } else {
        hostState.showSnackbar(
            message = "ℹ $message",
            duration = duration
        )
    }
}
