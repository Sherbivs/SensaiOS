package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.unit.dp
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Progress indicator components following Material Design 3 guidelines
 * 
 * Indicator types:
 * 1. Linear Progress - Horizontal progress bar
 * 2. Circular Progress - Circular loading indicator
 */

/**
 * Linear progress indicator
 * Determinate progress (0.0 to 1.0)
 */
@Composable
fun LinearProgress(
    progress: Float,
    modifier: Modifier = Modifier,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary,
    trackColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.surfaceVariant
) {
    LinearProgressIndicator(
        progress = { progress.coerceIn(0f, 1f) },
        modifier = modifier
            .fillMaxWidth()
            .height(4.dp),
        color = color,
        trackColor = trackColor
    )
}

/**
 * Linear progress indicator with label
 * Shows percentage text above bar
 */
@Composable
fun LinearProgressWithLabel(
    progress: Float,
    modifier: Modifier = Modifier,
    label: String? = null,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary,
    trackColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.surfaceVariant
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(Spacing.Small)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (label != null) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Text(
                text = "${(progress * 100).toInt()}%",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        
        LinearProgress(
            progress = progress,
            color = color,
            trackColor = trackColor
        )
    }
}

/**
 * Indeterminate linear progress
 * For unknown progress duration
 */
@Composable
fun IndeterminateLinearProgress(
    modifier: Modifier = Modifier,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary,
    trackColor: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.surfaceVariant
) {
    LinearProgressIndicator(
        modifier = modifier
            .fillMaxWidth()
            .height(4.dp),
        color = color,
        trackColor = trackColor
    )
}

/**
 * Circular progress indicator
 * Determinate progress (0.0 to 1.0)
 */
@Composable
fun CircularProgress(
    progress: Float,
    modifier: Modifier = Modifier,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary,
    strokeWidth: androidx.compose.ui.unit.Dp = 4.dp
) {
    CircularProgressIndicator(
        progress = { progress.coerceIn(0f, 1f) },
        modifier = modifier.size(Size.ProgressMedium),
        color = color,
        strokeWidth = strokeWidth
    )
}

/**
 * Circular progress with label
 * Shows percentage inside circle
 */
@Composable
fun CircularProgressWithLabel(
    progress: Float,
    modifier: Modifier = Modifier,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary,
    strokeWidth: androidx.compose.ui.unit.Dp = 4.dp
) {
    Box(
        modifier = modifier.size(Size.ProgressLarge),
        contentAlignment = Alignment.Center
    ) {
        CircularProgressIndicator(
            progress = { progress.coerceIn(0f, 1f) },
            modifier = Modifier.fillMaxSize(),
            color = color,
            strokeWidth = strokeWidth
        )
        
        Text(
            text = "${(progress * 100).toInt()}%",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

/**
 * Indeterminate circular progress
 * For unknown progress duration
 */
@Composable
fun IndeterminateCircularProgress(
    modifier: Modifier = Modifier,
    color: androidx.compose.ui.graphics.Color = MaterialTheme.colorScheme.primary,
    strokeWidth: androidx.compose.ui.unit.Dp = 4.dp
) {
    CircularProgressIndicator(
        modifier = modifier.size(Size.ProgressMedium),
        color = color,
        strokeWidth = strokeWidth
    )
}

/**
 * HP bar progress
 * Colored bar based on health percentage
 */
@Composable
fun HPBar(
    currentHP: Int,
    maxHP: Int,
    modifier: Modifier = Modifier,
    showLabel: Boolean = true
) {
    val progress = if (maxHP > 0) currentHP.toFloat() / maxHP.toFloat() else 0f
    val color = when {
        progress > 0.5f -> StatusSuccess
        progress > 0.2f -> StatusWarning
        else -> StatusError
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(Spacing.XXSmall)
    ) {
        if (showLabel) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "HP",
                    style = MaterialTheme.typography.labelMedium
                )
                Text(
                    text = "$currentHP / $maxHP",
                    style = MaterialTheme.typography.labelMedium
                )
            }
        }
        
        LinearProgress(
            progress = progress,
            color = color
        )
    }
}

/**
 * Test execution progress
 * Shows passed/failed/total counts with progress bar
 */
@Composable
fun TestExecutionProgress(
    passed: Int,
    failed: Int,
    total: Int,
    modifier: Modifier = Modifier
) {
    val completed = passed + failed
    val progress = if (total > 0) completed.toFloat() / total.toFloat() else 0f
    
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(Spacing.Small)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = "Test Execution",
                style = MaterialTheme.typography.titleSmall
            )
            Text(
                text = "$completed / $total",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        
        LinearProgress(
            progress = progress,
            color = if (failed > 0) StatusWarning else StatusSuccess
        )
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.XXSmall),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .drawBehind {
                            drawCircle(color = StatusSuccess)
                        }
                )
                Text(
                    text = "Passed: $passed",
                    style = MaterialTheme.typography.bodySmall
                )
            }
            
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.XXSmall),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .drawBehind {
                            drawCircle(color = StatusError)
                        }
                )
                Text(
                    text = "Failed: $failed",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

/**
 * Loading indicator with message
 * Circular progress with text below
 */
@Composable
fun LoadingIndicator(
    message: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
    ) {
        IndeterminateCircularProgress()
        
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
