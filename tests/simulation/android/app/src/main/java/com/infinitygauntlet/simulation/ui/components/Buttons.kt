package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Button components following Material Design 3 guidelines
 * 
 * Component hierarchy:
 * 1. Filled Button - High emphasis (primary actions)
 * 2. Filled Tonal Button - Medium emphasis (secondary actions)
 * 3. Outlined Button - Medium emphasis (alternative actions)
 * 4. Text Button - Low emphasis (tertiary actions)
 * 5. Elevated Button - High emphasis with shadow
 * 6. Icon Button - Single icon actions
 */

/**
 * Primary filled button
 * High emphasis, use for primary actions
 * 
 * @param text Button label
 * @param onClick Click handler
 * @param modifier Modifier
 * @param enabled Whether button is enabled
 * @param icon Optional leading icon
 */
@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    Button(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary
        ),
        contentPadding = PaddingValues(
            horizontal = PaddingPresets.ButtonHorizontal,
            vertical = PaddingPresets.ButtonVertical
        )
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Spacer(modifier = Modifier.size(Spacing.Small))
        }
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelLarge
        )
    }
}

/**
 * Secondary filled tonal button
 * Medium emphasis, use for secondary actions
 */
@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    FilledTonalButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = ButtonDefaults.filledTonalButtonColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer
        ),
        contentPadding = PaddingValues(
            horizontal = PaddingPresets.ButtonHorizontal,
            vertical = PaddingPresets.ButtonVertical
        )
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Spacer(modifier = Modifier.size(Spacing.Small))
        }
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelLarge
        )
    }
}

/**
 * Outlined button
 * Medium emphasis with border, use for alternative actions
 */
@Composable
fun OutlinedActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = ButtonDefaults.outlinedButtonColors(
            contentColor = MaterialTheme.colorScheme.primary
        ),
        border = ButtonDefaults.outlinedButtonBorder(enabled = enabled),
        contentPadding = PaddingValues(
            horizontal = PaddingPresets.ButtonHorizontal,
            vertical = PaddingPresets.ButtonVertical
        )
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Spacer(modifier = Modifier.size(Spacing.Small))
        }
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelLarge
        )
    }
}

/**
 * Text button
 * Low emphasis, use for tertiary/cancel actions
 */
@Composable
fun TextActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    TextButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = ButtonDefaults.textButtonColors(
            contentColor = MaterialTheme.colorScheme.primary
        ),
        contentPadding = PaddingValues(
            horizontal = PaddingPresets.ButtonHorizontal,
            vertical = PaddingPresets.ButtonVertical
        )
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Spacer(modifier = Modifier.size(Spacing.Small))
        }
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelLarge
        )
    }
}

/**
 * Elevated button with shadow
 * High emphasis with depth
 */
@Composable
fun ElevatedActionButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    icon: ImageVector? = null
) {
    ElevatedButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = ButtonDefaults.elevatedButtonColors(
            containerColor = MaterialTheme.colorScheme.surface,
            contentColor = MaterialTheme.colorScheme.primary
        ),
        elevation = ButtonDefaults.elevatedButtonElevation(
            defaultElevation = Elevation.Level1
        ),
        contentPadding = PaddingValues(
            horizontal = PaddingPresets.ButtonHorizontal,
            vertical = PaddingPresets.ButtonVertical
        )
    ) {
        if (icon != null) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(Size.IconSmall)
            )
            Spacer(modifier = Modifier.size(Spacing.Small))
        }
        Text(
            text = text.uppercase(),
            style = MaterialTheme.typography.labelLarge
        )
    }
}

/**
 * Icon-only button
 * Single icon action without text
 */
@Composable
fun IconActionButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    tint: androidx.compose.ui.graphics.Color? = null
) {
    IconButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint ?: MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.size(Size.IconMedium)
        )
    }
}

/**
 * Filled icon button with background
 */
@Composable
fun FilledIconButton(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    androidx.compose.material3.FilledIconButton(
        onClick = onClick,
        modifier = modifier,
        enabled = enabled,
        colors = IconButtonDefaults.filledIconButtonColors(
            containerColor = MaterialTheme.colorScheme.primary,
            contentColor = MaterialTheme.colorScheme.onPrimary
        )
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(Size.IconMedium)
        )
    }
}

/**
 * Floating Action Button (FAB)
 * Primary action button that floats above content
 */
@Composable
fun PrimaryFAB(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    expanded: Boolean = false,
    text: String? = null
) {
    if (expanded && text != null) {
        ExtendedFloatingActionButton(
            onClick = onClick,
            modifier = modifier,
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                modifier = Modifier.size(Size.IconMedium)
            )
            Spacer(modifier = Modifier.size(Spacing.Small))
            Text(
                text = text,
                style = MaterialTheme.typography.labelLarge
            )
        }
    } else {
        FloatingActionButton(
            onClick = onClick,
            modifier = modifier,
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            contentColor = MaterialTheme.colorScheme.onPrimaryContainer
        ) {
            Icon(
                imageVector = icon,
                contentDescription = contentDescription,
                modifier = Modifier.size(Size.IconMedium)
            )
        }
    }
}

/**
 * Small FAB variant
 */
@Composable
fun SmallFAB(
    icon: ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    SmallFloatingActionButton(
        onClick = onClick,
        modifier = modifier,
        containerColor = MaterialTheme.colorScheme.primaryContainer,
        contentColor = MaterialTheme.colorScheme.onPrimaryContainer
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            modifier = Modifier.size(Size.IconSmall)
        )
    }
}

/**
 * Helper composable for spacing between buttons
 */
@Composable
fun ButtonSpacer() {
    Spacer(modifier = Modifier.size(Spacing.Medium))
}
