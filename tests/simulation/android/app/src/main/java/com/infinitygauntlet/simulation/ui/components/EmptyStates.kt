package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Empty state components for displaying when no content is available
 */

/**
 * Basic empty state
 * Simple message with optional icon
 */
@Composable
fun EmptyState(
    message: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null
) {
    Column(
        modifier = modifier
            .fillMaxSize()
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
            
            Spacer(modifier = Modifier.height(Spacing.Large))
        }
        
        Text(
            text = message,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

/**
 * Empty state with action
 * Message with call-to-action button
 */
@Composable
fun EmptyStateWithAction(
    title: String,
    message: String,
    actionText: String,
    onAction: () -> Unit,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null
) {
    Column(
        modifier = modifier
            .fillMaxSize()
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
            
            Spacer(modifier = Modifier.height(Spacing.Large))
        }
        
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.Small))
        
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.Large))
        
        Button(onClick = onAction) {
            Text(
                text = actionText.uppercase(),
                style = MaterialTheme.typography.labelLarge
            )
        }
    }
}

/**
 * No results state
 * For search/filter with no results
 */
@Composable
fun NoResultsState(
    query: String,
    modifier: Modifier = Modifier,
    onClearFilters: (() -> Unit)? = null
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(Spacing.Medium),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = AppIcons.SearchOff,
            contentDescription = null,
            modifier = Modifier.size(Size.IconXLarge),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(Spacing.Large))
        
        Text(
            text = "No results found",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.Small))
        
        Text(
            text = "No results for \"$query\"",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        
        if (onClearFilters != null) {
            Spacer(modifier = Modifier.height(Spacing.Large))
            
            TextButton(onClick = onClearFilters) {
                Text(
                    text = "CLEAR FILTERS",
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

/**
 * Error state
 * For error conditions
 */
@Composable
fun ErrorState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(Spacing.Medium),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = AppIcons.Error,
            contentDescription = null,
            modifier = Modifier.size(Size.IconXLarge),
            tint = MaterialTheme.colorScheme.error
        )
        
        Spacer(modifier = Modifier.height(Spacing.Large))
        
        Text(
            text = title,
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.Small))
        
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        
        if (onRetry != null) {
            Spacer(modifier = Modifier.height(Spacing.Large))
            
            Button(onClick = onRetry) {
                Text(
                    text = "RETRY",
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}

/**
 * Loading state
 * For loading content
 */
@Composable
fun LoadingState(
    message: String = "Loading...",
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(Spacing.Medium),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        IndeterminateCircularProgress()
        
        Spacer(modifier = Modifier.height(Spacing.Large))
        
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

/**
 * No connection state
 * For offline/no network
 */
@Composable
fun NoConnectionState(
    modifier: Modifier = Modifier,
    onRetry: (() -> Unit)? = null
) {
    ErrorState(
        title = "No Connection",
        message = "Please check your internet connection and try again.",
        modifier = modifier,
        onRetry = onRetry
    )
}

/**
 * Coming soon state
 * For features not yet implemented
 */
@Composable
fun ComingSoonState(
    featureName: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(Spacing.Medium),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = AppIcons.HourglassEmpty,
            contentDescription = null,
            modifier = Modifier.size(Size.IconXLarge),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(Spacing.Large))
        
        Text(
            text = "Coming Soon",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.Small))
        
        Text(
            text = "$featureName is currently under development.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

/**
 * Permission denied state
 * For missing permissions
 */
@Composable
fun PermissionDeniedState(
    permissionName: String,
    modifier: Modifier = Modifier,
    onRequestPermission: (() -> Unit)? = null
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(Spacing.Medium),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = AppIcons.Block,
            contentDescription = null,
            modifier = Modifier.size(Size.IconXLarge),
            tint = MaterialTheme.colorScheme.error
        )
        
        Spacer(modifier = Modifier.height(Spacing.Large))
        
        Text(
            text = "Permission Required",
            style = MaterialTheme.typography.titleLarge,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(Spacing.Small))
        
        Text(
            text = "This feature requires $permissionName permission.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        
        if (onRequestPermission != null) {
            Spacer(modifier = Modifier.height(Spacing.Large))
            
            Button(onClick = onRequestPermission) {
                Text(
                    text = "GRANT PERMISSION",
                    style = MaterialTheme.typography.labelLarge
                )
            }
        }
    }
}
