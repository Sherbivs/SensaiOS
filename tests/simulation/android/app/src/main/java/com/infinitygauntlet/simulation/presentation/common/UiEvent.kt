package com.infinitygauntlet.simulation.presentation.common

/**
 * Sealed interface representing one-time UI events
 * 
 * Week 1: Phase 2.2 - State Management (MVI Pattern)
 * UPGRADED: KSP Migration (2025-12-20) - Using data object for Kotlin 2.0+
 *
 * UI events are one-time occurrences that don't persist in state.
 * Examples: showing a snackbar, navigating to another screen, showing a dialog.
 *
 * These are consumed once and then cleared, unlike UiState which persists.
 *
 * Usage:
 * ```kotlin
 * sealed interface TestScreenEvent : UiEvent {
 *     data class NavigateToDetails(val testId: String) : TestScreenEvent
 *     data class ShowError(override val message: String) : TestScreenEvent
 * }
 * ```
 */
sealed interface UiEvent {

    /**
     * Show a snackbar message
     *
     * @param message The message to display
     * @param actionLabel Optional action button label
     * @param duration Duration to show the snackbar
     */
    data class ShowSnackbar(
        val message: String,
        val actionLabel: String? = null,
        val duration: SnackbarDuration = SnackbarDuration.Short
    ) : UiEvent

    /**
     * Show a toast message (shorter than snackbar)
     *
     * @param message The message to display
     */
    data class ShowToast(val message: String) : UiEvent

    /**
     * Navigate to a specific route/screen
     *
     * @param route The navigation route
     * @param popUpTo Optional route to pop up to
     * @param inclusive Whether to include the popUpTo route in the pop
     */
    data class Navigate(
        val route: String,
        val popUpTo: String? = null,
        val inclusive: Boolean = false
    ) : UiEvent

    /**
     * Navigate back
     */
    data object NavigateBack : UiEvent

    /**
     * Show a dialog
     *
     * @param title Dialog title
     * @param message Dialog message
     * @param confirmText Confirm button text
     * @param dismissText Optional dismiss button text
     */
    data class ShowDialog(
        val title: String,
        val message: String,
        val confirmText: String = "OK",
        val dismissText: String? = null
    ) : UiEvent

    /**
     * Show a bottom sheet
     *
     * @param content Identifier for the bottom sheet content
     */
    data class ShowBottomSheet(val content: String) : UiEvent

    /**
     * Hide any showing bottom sheet
     */
    data object HideBottomSheet : UiEvent

    /**
     * Copy text to clipboard
     *
     * @param text Text to copy
     * @param label Label for the clipboard entry
     */
    data class CopyToClipboard(
        val text: String,
        val label: String = "Copied"
    ) : UiEvent

    /**
     * Share content
     *
     * @param content Content to share
     * @param mimeType MIME type of content
     */
    data class Share(
        val content: String,
        val mimeType: String = "text/plain"
    ) : UiEvent
}

/**
 * Snackbar duration enum
 */
enum class SnackbarDuration {
    Short,
    Long,
    Indefinite
}
