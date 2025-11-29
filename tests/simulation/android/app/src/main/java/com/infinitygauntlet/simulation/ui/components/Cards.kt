package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.Card
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Card components following Material Design 3 guidelines
 * 
 * Card types:
 * 1. Elevated Card - Default card with shadow
 * 2. Filled Card - Filled background, no shadow
 * 3. Outlined Card - Border outline, no fill/shadow
 */

/**
 * Elevated card with shadow
 * Default card style for most content
 */
@Composable
fun ElevatedContentCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    shape: Shape = MaterialTheme.shapes.medium,
    elevation: CardElevation = CardDefaults.elevatedCardElevation(
        defaultElevation = Elevation.Level1
    ),
    colors: CardColors = CardDefaults.elevatedCardColors(),
    content: @Composable ColumnScope.() -> Unit
) {
    if (onClick != null) {
        ElevatedCard(
            onClick = onClick,
            modifier = modifier,
            shape = shape,
            elevation = elevation,
            colors = colors,
            content = content
        )
    } else {
        ElevatedCard(
            modifier = modifier,
            shape = shape,
            elevation = elevation,
            colors = colors,
            content = content
        )
    }
}

/**
 * Filled card with background color
 * Use for content that needs emphasis
 */
@Composable
fun FilledContentCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    shape: Shape = MaterialTheme.shapes.medium,
    colors: CardColors = CardDefaults.cardColors(
        containerColor = MaterialTheme.colorScheme.surfaceVariant
    ),
    content: @Composable ColumnScope.() -> Unit
) {
    if (onClick != null) {
        Card(
            onClick = onClick,
            modifier = modifier,
            shape = shape,
            colors = colors,
            content = content
        )
    } else {
        Card(
            modifier = modifier,
            shape = shape,
            colors = colors,
            content = content
        )
    }
}

/**
 * Outlined card with border
 * Use for less emphasis or grouped content
 */
@Composable
fun OutlinedContentCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    shape: Shape = MaterialTheme.shapes.medium,
    border: BorderStroke = BorderStroke(
        width = BorderWidth.Thin,
        color = MaterialTheme.colorScheme.outline
    ),
    colors: CardColors = CardDefaults.outlinedCardColors(),
    content: @Composable ColumnScope.() -> Unit
) {
    if (onClick != null) {
        OutlinedCard(
            onClick = onClick,
            modifier = modifier,
            shape = shape,
            border = border,
            colors = colors,
            content = content
        )
    } else {
        OutlinedCard(
            modifier = modifier,
            shape = shape,
            border = border,
            colors = colors,
            content = content
        )
    }
}

/**
 * Test scenario card
 * Displays test information with status
 */
@Composable
fun TestScenarioCard(
    title: String,
    description: String,
    status: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val statusColor = when (status.uppercase()) {
        "PASSED" -> StatusSuccess
        "FAILED" -> StatusError
        "RUNNING" -> StatusRunning
        else -> MaterialTheme.colorScheme.outline
    }

    ElevatedContentCard(
        modifier = modifier,
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(PaddingPresets.CardAll)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f)
                )
                Surface(
                    shape = MaterialTheme.shapes.small,
                    color = statusColor.copy(alpha = AlphaValues.Medium),
                    contentColor = statusColor
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
            
            Spacer(modifier = Modifier.height(Spacing.Small))
            
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Result card
 * Displays test execution results
 */
@Composable
fun ResultCard(
    passed: Int,
    failed: Int,
    skipped: Int,
    duration: String,
    modifier: Modifier = Modifier
) {
    FilledContentCard(
        modifier = modifier,
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(PaddingPresets.CardAll)
        ) {
            Text(
                text = "Test Results",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                ResultStatItem(
                    label = "Passed",
                    value = passed.toString(),
                    color = StatusSuccess
                )
                ResultStatItem(
                    label = "Failed",
                    value = failed.toString(),
                    color = StatusError
                )
                ResultStatItem(
                    label = "Skipped",
                    value = skipped.toString(),
                    color = StatusWarning
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            Text(
                text = "Duration: $duration",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}

/**
 * Helper composable for result statistics
 */
@Composable
private fun ResultStatItem(
    label: String,
    value: String,
    color: androidx.compose.ui.graphics.Color
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = value,
            style = MaterialTheme.typography.headlineMedium,
            color = color
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}

/**
 * Pokemon card
 * Displays Pokemon information
 */
@Composable
fun PokemonCard(
    name: String,
    types: List<String>,
    level: Int,
    hp: Int,
    maxHp: Int,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    ElevatedContentCard(
        modifier = modifier,
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(PaddingPresets.CardAll)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.titleLarge
                )
                Text(
                    text = "Lv. $level",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.Small))
            
            // Type badges
            Row(
                horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                types.forEach { type ->
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = getPokemonTypeColor(type),
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
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            // HP bar
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "HP",
                        style = MaterialTheme.typography.labelMedium
                    )
                    Text(
                        text = "$hp / $maxHp",
                        style = MaterialTheme.typography.labelMedium
                    )
                }
                
                Spacer(modifier = Modifier.height(Spacing.XXSmall))
                
                LinearProgressIndicator(
                    progress = { hp.toFloat() / maxHp.toFloat() },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(8.dp),
                    color = when {
                        hp.toFloat() / maxHp > 0.5f -> StatusSuccess
                        hp.toFloat() / maxHp > 0.2f -> StatusWarning
                        else -> StatusError
                    }
                )
            }
        }
    }
}

/**
 * Info card with icon and content
 * Reusable card for displaying information
 */
@Composable
fun InfoCard(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit
) {
    OutlinedContentCard(
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(PaddingPresets.CardAll)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.primary
            )
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            content()
        }
    }
}
