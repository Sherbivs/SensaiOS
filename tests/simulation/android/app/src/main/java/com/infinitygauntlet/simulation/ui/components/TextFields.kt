package com.infinitygauntlet.simulation.ui.components

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import com.infinitygauntlet.simulation.ui.theme.*

/**
 * Text field components following Material Design 3 guidelines
 * 
 * TextField types:
 * 1. Filled TextField - Default style with filled background
 * 2. Outlined TextField - Border outline style
 */

/**
 * Filled text field
 * Default text input style
 */
@Composable
fun FilledInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    onTrailingIconClick: (() -> Unit)? = null,
    isError: Boolean = false,
    errorMessage: String? = null,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    singleLine: Boolean = true,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Done,
    onDone: (() -> Unit)? = null
) {
    Column(modifier = modifier) {
        TextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            placeholder = placeholder?.let { { Text(it) } },
            leadingIcon = leadingIcon?.let {
                {
                    Icon(
                        imageVector = it,
                        contentDescription = null
                    )
                }
            },
            trailingIcon = if (trailingIcon != null) {
                {
                    if (onTrailingIconClick != null) {
                        IconButton(onClick = onTrailingIconClick) {
                            Icon(
                                imageVector = trailingIcon,
                                contentDescription = null
                            )
                        }
                    } else {
                        Icon(
                            imageVector = trailingIcon,
                            contentDescription = null
                        )
                    }
                }
            } else null,
            isError = isError,
            enabled = enabled,
            readOnly = readOnly,
            singleLine = singleLine,
            maxLines = maxLines,
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = imeAction
            ),
            keyboardActions = KeyboardActions(
                onDone = { onDone?.invoke() }
            ),
            modifier = Modifier.fillMaxWidth()
        )
        
        if (isError && errorMessage != null) {
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(
                    start = Spacing.Medium,
                    top = Spacing.XXSmall
                )
            )
        }
    }
}

/**
 * Outlined text field
 * Alternative text input style with border
 */
@Composable
fun OutlinedInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null,
    onTrailingIconClick: (() -> Unit)? = null,
    isError: Boolean = false,
    errorMessage: String? = null,
    enabled: Boolean = true,
    readOnly: Boolean = false,
    singleLine: Boolean = true,
    maxLines: Int = if (singleLine) 1 else Int.MAX_VALUE,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Done,
    onDone: (() -> Unit)? = null
) {
    Column(modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            placeholder = placeholder?.let { { Text(it) } },
            leadingIcon = leadingIcon?.let {
                {
                    Icon(
                        imageVector = it,
                        contentDescription = null
                    )
                }
            },
            trailingIcon = if (trailingIcon != null) {
                {
                    if (onTrailingIconClick != null) {
                        IconButton(onClick = onTrailingIconClick) {
                            Icon(
                                imageVector = trailingIcon,
                                contentDescription = null
                            )
                        }
                    } else {
                        Icon(
                            imageVector = trailingIcon,
                            contentDescription = null
                        )
                    }
                }
            } else null,
            isError = isError,
            enabled = enabled,
            readOnly = readOnly,
            singleLine = singleLine,
            maxLines = maxLines,
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = imeAction
            ),
            keyboardActions = KeyboardActions(
                onDone = { onDone?.invoke() }
            ),
            modifier = Modifier.fillMaxWidth()
        )
        
        if (isError && errorMessage != null) {
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(
                    start = Spacing.Medium,
                    top = Spacing.XXSmall
                )
            )
        }
    }
}

/**
 * Password text field
 * Specialized field for password input with visibility toggle
 */
@Composable
fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    passwordVisible: Boolean = false,
    onVisibilityToggle: () -> Unit,
    isError: Boolean = false,
    errorMessage: String? = null,
    enabled: Boolean = true,
    imeAction: ImeAction = ImeAction.Done,
    onDone: (() -> Unit)? = null
) {
    OutlinedInputField(
        value = value,
        onValueChange = onValueChange,
        label = label,
        modifier = modifier,
        isError = isError,
        errorMessage = errorMessage,
        enabled = enabled,
        singleLine = true,
        keyboardType = KeyboardType.Password,
        imeAction = imeAction,
        onDone = onDone,
        trailingIcon = if (passwordVisible) {
            AppIcons.Visibility
        } else {
            AppIcons.VisibilityOff
        },
        onTrailingIconClick = onVisibilityToggle
    )
}

/**
 * Search field
 * Specialized field for search input
 */
@Composable
fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Search...",
    enabled: Boolean = true,
    onClear: (() -> Unit)? = null,
    onSearch: (() -> Unit)? = null
) {
    OutlinedInputField(
        value = value,
        onValueChange = onValueChange,
        label = "Search",
        placeholder = placeholder,
        modifier = modifier,
        leadingIcon = AppIcons.Search,
        trailingIcon = if (value.isNotEmpty()) {
            AppIcons.Clear
        } else null,
        onTrailingIconClick = onClear,
        enabled = enabled,
        singleLine = true,
        keyboardType = KeyboardType.Text,
        imeAction = ImeAction.Search,
        onDone = onSearch
    )
}

/**
 * Multiline text field
 * Text field for longer text input
 */
@Composable
fun MultilineInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    minLines: Int = 3,
    maxLines: Int = 6,
    isError: Boolean = false,
    errorMessage: String? = null,
    enabled: Boolean = true,
    readOnly: Boolean = false
) {
    Column(modifier = modifier) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            placeholder = placeholder?.let { { Text(it) } },
            isError = isError,
            enabled = enabled,
            readOnly = readOnly,
            singleLine = false,
            minLines = minLines,
            maxLines = maxLines,
            modifier = Modifier.fillMaxWidth()
        )
        
        if (isError && errorMessage != null) {
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(
                    start = Spacing.Medium,
                    top = Spacing.XXSmall
                )
            )
        }
    }
}

/**
 * Number input field
 * Specialized field for numeric input
 */
@Composable
fun NumberInputField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    isError: Boolean = false,
    errorMessage: String? = null,
    enabled: Boolean = true,
    imeAction: ImeAction = ImeAction.Done,
    onDone: (() -> Unit)? = null
) {
    OutlinedInputField(
        value = value,
        onValueChange = { newValue ->
            // Only allow digits
            if (newValue.isEmpty() || newValue.all { it.isDigit() }) {
                onValueChange(newValue)
            }
        },
        label = label,
        placeholder = placeholder,
        modifier = modifier,
        isError = isError,
        errorMessage = errorMessage,
        enabled = enabled,
        singleLine = true,
        keyboardType = KeyboardType.Number,
        imeAction = imeAction,
        onDone = onDone
    )
}
