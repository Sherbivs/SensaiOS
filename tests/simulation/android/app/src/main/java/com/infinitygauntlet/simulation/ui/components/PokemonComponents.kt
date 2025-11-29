package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Pokemon-specific UI components
 * Custom components themed for Pokemon gameplay
 */

/**
 * Pokemon type badge
 * Badge styled with Pokemon type colors
 */
@Composable
fun PokemonTypeBadge(
    type: String,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val typeColor = getPokemonTypeColor(type)
    
    if (onClick != null) {
        Surface(
            onClick = onClick,
            modifier = modifier,
            shape = MaterialTheme.shapes.small,
            color = typeColor,
            contentColor = Color.White
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
    } else {
        Surface(
            modifier = modifier,
            shape = MaterialTheme.shapes.small,
            color = typeColor,
            contentColor = Color.White
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
 * Pokemon HP bar
 * Health bar with Pokemon-themed colors
 */
@Composable
fun PokemonHPBar(
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
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = "$currentHP / $maxHP",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        LinearProgressIndicator(
            progress = { progress.coerceIn(0f, 1f) },
            modifier = Modifier
                .fillMaxWidth()
                .height(8.dp)
                .clip(MaterialTheme.shapes.small),
            color = color,
            trackColor = MaterialTheme.colorScheme.surfaceVariant
        )
    }
}

/**
 * Pokemon stats display
 * Display Pokemon statistics (Attack, Defense, Speed, etc.)
 */
@Composable
fun PokemonStatBar(
    statName: String,
    statValue: Int,
    maxValue: Int = 255,
    modifier: Modifier = Modifier
) {
    val progress = if (maxValue > 0) statValue.toFloat() / maxValue.toFloat() else 0f
    val color = when {
        statValue >= 150 -> ElectricYellow40
        statValue >= 100 -> WaterBlue40
        statValue >= 50 -> GrassGreen40
        else -> Neutral50
    }

    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(Spacing.XXSmall)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = statName,
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.width(80.dp)
            )
            
            LinearProgressIndicator(
                progress = { progress.coerceIn(0f, 1f) },
                modifier = Modifier
                    .weight(1f)
                    .height(6.dp)
                    .clip(MaterialTheme.shapes.small),
                color = color,
                trackColor = MaterialTheme.colorScheme.surfaceVariant
            )
            
            Text(
                text = statValue.toString(),
                style = MaterialTheme.typography.labelMedium,
                modifier = Modifier.width(40.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.End
            )
        }
    }
}

/**
 * Pokemon level badge
 * Displays Pokemon level
 */
@Composable
fun PokemonLevelBadge(
    level: Int,
    modifier: Modifier = Modifier
) {
    LevelBadge(
        level = level,
        modifier = modifier,
        prefix = "Lv."
    )
}

/**
 * Pokeball icon indicator
 * Simple Pokeball representation
 */
@Composable
fun PokeballIndicator(
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = 24.dp,
    color: Color = PokemonRed40
) {
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(color)
    ) {
        // Top half (red)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.5f)
                .background(color)
        )
        
        // Bottom half (white)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .fillMaxHeight(0.5f)
                .align(Alignment.BottomCenter)
                .background(Color.White)
        )
        
        // Center circle
        Box(
            modifier = Modifier
                .size(size * 0.3f)
                .align(Alignment.Center)
                .clip(CircleShape)
                .background(Color.White)
        )
        
        // Center button
        Box(
            modifier = Modifier
                .size(size * 0.15f)
                .align(Alignment.Center)
                .clip(CircleShape)
                .background(Neutral50)
        )
    }
}

/**
 * Battle move button
 * Button styled for battle moves
 */
@Composable
fun BattleMoveButton(
    moveName: String,
    moveType: String,
    pp: Int,
    maxPP: Int,
    onMoveSelected: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    val typeColor = getPokemonTypeColor(moveType)
    
    Button(
        onClick = onMoveSelected,
        modifier = modifier,
        enabled = enabled && pp > 0,
        colors = ButtonDefaults.buttonColors(
            containerColor = typeColor,
            contentColor = Color.White,
            disabledContainerColor = typeColor.copy(alpha = 0.38f),
            disabledContentColor = Color.White.copy(alpha = 0.38f)
        ),
        shape = MaterialTheme.shapes.medium
    ) {
        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.Start
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = moveName,
                    style = MaterialTheme.typography.labelLarge
                )
                
                PokemonTypeBadge(
                    type = moveType,
                    modifier = Modifier.height(16.dp)
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.XXSmall))
            
            Text(
                text = "PP: $pp / $maxPP",
                style = MaterialTheme.typography.labelSmall
            )
        }
    }
}

/**
 * Pokemon sprite placeholder
 * Placeholder for Pokemon images
 */
@Composable
fun PokemonSpritePlaceholder(
    pokemonName: String,
    modifier: Modifier = Modifier,
    size: androidx.compose.ui.unit.Dp = Size.PokemonSpriteMedium
) {
    Surface(
        modifier = modifier.size(size),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surfaceVariant
    ) {
        Box(
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = pokemonName.take(2).uppercase(),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

/**
 * Pokemon team slot
 * Displays a Pokemon team member with status
 */
@Composable
fun PokemonTeamSlot(
    pokemonName: String,
    level: Int,
    currentHP: Int,
    maxHP: Int,
    isFainted: Boolean,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val containerColor = if (isFainted) {
        MaterialTheme.colorScheme.errorContainer
    } else {
        MaterialTheme.colorScheme.surfaceVariant
    }

    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.medium,
        color = containerColor,
        onClick = onClick ?: {}
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.Small),
            horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
            verticalAlignment = Alignment.CenterVertically
        ) {
            PokemonSpritePlaceholder(
                pokemonName = pokemonName,
                size = Size.AvatarSmall
            )
            
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(Spacing.Small),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = pokemonName,
                        style = MaterialTheme.typography.bodyMedium
                    )
                    PokemonLevelBadge(level = level)
                }
                
                if (!isFainted) {
                    PokemonHPBar(
                        currentHP = currentHP,
                        maxHP = maxHP,
                        showLabel = false,
                        modifier = Modifier.padding(top = Spacing.XXSmall)
                    )
                } else {
                    Text(
                        text = "FAINTED",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        }
    }
}
