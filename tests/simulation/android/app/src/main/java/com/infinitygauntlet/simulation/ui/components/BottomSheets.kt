package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Bottom sheet components following Material Design 3 guidelines
 * 
 * Bottom sheet types:
 * 1. Modal Bottom Sheet - Blocks interaction with rest of screen
 * 2. Standard Bottom Sheet - Part of screen hierarchy
 */

/**
 * Modal bottom sheet
 * Sheet that appears over content and blocks interaction
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModalBottomSheetContent(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(),
    dragHandle: @Composable (() -> Unit)? = { BottomSheetDefaults.DragHandle() },
    content: @Composable ColumnScope.() -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier,
        dragHandle = dragHandle,
        content = content
    )
}

/**
 * Bottom sheet with title
 * Modal bottom sheet with standard title layout
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TitledBottomSheet(
    title: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(),
    content: @Composable ColumnScope.() -> Unit
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = PaddingPresets.BottomSheetHorizontal, vertical = PaddingPresets.BottomSheetVertical)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = Spacing.Medium)
            )
            
            content()
        }
    }
}

/**
 * Action bottom sheet
 * Bottom sheet with list of actions
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActionBottomSheet(
    title: String,
    actions: List<BottomSheetAction>,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState()
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = PaddingPresets.BottomSheetHorizontal, vertical = PaddingPresets.BottomSheetVertical)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = Spacing.Medium)
            )
            
            actions.forEach { action ->
                NavigationDrawerItem(
                    label = {
                        Text(
                            text = action.label,
                            style = MaterialTheme.typography.bodyLarge
                        )
                    },
                    icon = action.icon?.let {
                        {
                            Icon(
                                imageVector = it,
                                contentDescription = null
                            )
                        }
                    },
                    selected = false,
                    onClick = {
                        action.onClick()
                        onDismiss()
                    },
                    modifier = Modifier.padding(vertical = Spacing.XXSmall)
                )
            }
        }
    }
}

/**
 * Confirmation bottom sheet
 * Bottom sheet for confirming actions
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConfirmationBottomSheet(
    title: String,
    message: String,
    confirmText: String,
    dismissText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState(),
    isDestructive: Boolean = false
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = PaddingPresets.BottomSheetHorizontal, vertical = PaddingPresets.BottomSheetVertical)
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = if (isDestructive) {
                    MaterialTheme.colorScheme.error
                } else {
                    MaterialTheme.colorScheme.onSurface
                }
            )
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
            
            Spacer(modifier = Modifier.height(Spacing.Large))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextButton(onClick = onDismiss) {
                    Text(
                        text = dismissText.uppercase(),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
                
                Spacer(modifier = Modifier.width(Spacing.Small))
                
                Button(
                    onClick = {
                        onConfirm()
                        onDismiss()
                    },
                    colors = if (isDestructive) {
                        ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        )
                    } else {
                        ButtonDefaults.buttonColors()
                    }
                ) {
                    Text(
                        text = confirmText.uppercase(),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
    }
}

/**
 * Filter bottom sheet
 * Bottom sheet with filter options
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilterBottomSheet(
    title: String,
    filters: List<FilterOption>,
    selectedFilters: Set<String>,
    onFilterToggle: (String) -> Unit,
    onApply: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    sheetState: SheetState = rememberModalBottomSheetState()
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = PaddingPresets.BottomSheetHorizontal, vertical = PaddingPresets.BottomSheetVertical)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge
                )
                
                TextButton(onClick = {
                    onApply()
                    onDismiss()
                }) {
                    Text(
                        text = "APPLY",
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            filters.forEach { filter ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = Spacing.Small),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = filter.label,
                            style = MaterialTheme.typography.bodyLarge
                        )
                        if (filter.description != null) {
                            Text(
                                text = filter.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    
                    Switch(
                        checked = selectedFilters.contains(filter.id),
                        onCheckedChange = { onFilterToggle(filter.id) }
                    )
                }
            }
        }
    }
}

/**
 * Data class for bottom sheet actions
 */
data class BottomSheetAction(
    val label: String,
    val icon: ImageVector? = null,
    val onClick: () -> Unit
)

/**
 * Data class for filter options
 */
data class FilterOption(
    val id: String,
    val label: String,
    val description: String? = null
)
