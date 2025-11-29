@file:OptIn(ExperimentalMaterial3Api::class)

package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Dialog components following Material Design 3 guidelines
 * 
 * Dialog types:
 * 1. Alert Dialog - Simple confirmation/information dialog
 * 2. Confirmation Dialog - Action confirmation with cancel
 * 3. Custom Dialog - Full custom content dialog
 */

/**
 * Basic alert dialog
 * Simple information or confirmation dialog
 */
@Composable
fun AlertDialog(
    title: String,
    message: String,
    confirmButtonText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dismissButtonText: String? = null
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge
            )
        },
        text = {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(
                    text = confirmButtonText.uppercase(),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        },
        dismissButton = if (dismissButtonText != null) {
            {
                TextButton(onClick = onDismiss) {
                    Text(
                        text = dismissButtonText.uppercase(),
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        } else null,
        modifier = modifier
    )
}

/**
 * Confirmation dialog
 * Dialog for confirming destructive or important actions
 */
@Composable
fun ConfirmationDialog(
    title: String,
    message: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    confirmButtonText: String = "Confirm",
    dismissButtonText: String = "Cancel",
    isDestructive: Boolean = false
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge
            )
        },
        text = {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium
            )
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                colors = if (isDestructive) {
                    ButtonDefaults.textButtonColors(
                        contentColor = MaterialTheme.colorScheme.error
                    )
                } else {
                    ButtonDefaults.textButtonColors()
                }
            ) {
                Text(
                    text = confirmButtonText.uppercase(),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = dismissButtonText.uppercase(),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        },
        modifier = modifier
    )
}

/**
 * Error dialog
 * Dialog for displaying error messages
 */
@Composable
fun ErrorDialog(
    title: String,
    errorMessage: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dismissButtonText: String = "OK"
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = title,
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.error
            )
        },
        text = {
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodyMedium
            )
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(
                    text = dismissButtonText.uppercase(),
                    style = MaterialTheme.typography.labelLarge
                )
            }
        },
        modifier = modifier,
        icon = {
            Icon(
                imageVector = AppIcons.Error,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error
            )
        }
    )
}

/**
 * Loading dialog
 * Dialog with circular progress indicator
 */
@Composable
fun LoadingDialog(
    message: String,
    modifier: Modifier = Modifier,
    dismissible: Boolean = false,
    onDismiss: () -> Unit = {}
) {
    val dialogContent: @Composable () -> Unit = {
        Card(
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = PaddingPresets.DialogHorizontal, vertical = PaddingPresets.DialogVertical)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
            ) {
                CircularProgressIndicator()
                
                Text(
                    text = message,
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )
            }
        }
    }
    
    if (dismissible) {
        BasicAlertDialog(
            onDismissRequest = onDismiss,
            modifier = modifier,
            content = dialogContent
        )
    } else {
        BasicAlertDialog(
            onDismissRequest = {},
            modifier = modifier,
            content = dialogContent
        )
    }
}

/**
 * Custom content dialog
 * Dialog with fully customizable content
 */
@Composable
fun CustomDialog(
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    dismissible: Boolean = true,
    content: @Composable ColumnScope.() -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = dismissible,
            dismissOnClickOutside = dismissible
        )
    ) {
        Card(
            modifier = modifier,
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier
                    .padding(horizontal = PaddingPresets.DialogHorizontal, vertical = PaddingPresets.DialogVertical)
                    .fillMaxWidth(),
                content = content
            )
        }
    }
}

/**
 * Full-screen dialog
 * Dialog that covers entire screen
 */
@Composable
fun FullScreenDialog(
    title: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    actions: @Composable RowScope.() -> Unit = {},
    content: @Composable ColumnScope.() -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false
        )
    ) {
        Surface(
            modifier = modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // Top bar
                TopAppBar(
                    title = {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleLarge
                        )
                    },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(
                                imageVector = AppIcons.Close,
                                contentDescription = "Close"
                            )
                        }
                    },
                    actions = actions
                )
                
                // Content
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(Spacing.Medium),
                    content = content
                )
            }
        }
    }
}

/**
 * Dialog with custom buttons
 * Dialog with flexible button configuration
 */
@Composable
fun DialogWithButtons(
    title: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    buttons: @Composable RowScope.() -> Unit,
    content: @Composable ColumnScope.() -> Unit
) {
    Dialog(
        onDismissRequest = onDismiss
    ) {
        Card(
            modifier = modifier,
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier.fillMaxWidth()
            ) {
                // Title
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = PaddingPresets.DialogHorizontal, vertical = PaddingPresets.DialogVertical)
                )
                
                // Content
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            start = PaddingPresets.DialogHorizontal,
                            end = PaddingPresets.DialogHorizontal,
                            bottom = Spacing.Medium
                        ),
                    content = content
                )
                
                // Buttons
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(
                            start = PaddingPresets.DialogHorizontal,
                            end = PaddingPresets.DialogHorizontal,
                            bottom = PaddingPresets.DialogVertical
                        ),
                    horizontalArrangement = Arrangement.End,
                    content = buttons
                )
            }
        }
    }
}

/**
 * List selection dialog
 * Dialog for selecting from a list
 */
@Composable
fun <T> ListSelectionDialog(
    title: String,
    items: List<T>,
    itemText: (T) -> String,
    onItemSelected: (T) -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier
) {
    Dialog(
        onDismissRequest = onDismiss
    ) {
        Card(
            modifier = modifier,
            shape = MaterialTheme.shapes.large
        ) {
            Column(
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleLarge,
                    modifier = Modifier.padding(horizontal = PaddingPresets.DialogHorizontal, vertical = PaddingPresets.DialogVertical)
                )
                
                Column(
                    modifier = Modifier.fillMaxWidth()
                ) {
                    items.forEach { item ->
                        TextButton(
                            onClick = {
                                onItemSelected(item)
                                onDismiss()
                            },
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text(
                                text = itemText(item),
                                style = MaterialTheme.typography.bodyLarge,
                                modifier = Modifier.fillMaxWidth(),
                                textAlign = TextAlign.Start
                            )
                        }
                    }
                }
            }
        }
    }
}
