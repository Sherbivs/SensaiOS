package com.infinitygauntlet.simulation.presentation.common

/**
 * Sealed interface representing UI state
 * 
 * Week 1: Phase 2.2 - State Management (MVI Pattern)
 * 
 * This is the foundation of our state management approach.
 * Every screen will have a state class that implements this pattern.
 * 
 * @param T The type of data held in the Success state
 * 
 * Usage:
 * ```kotlin
 * sealed class TestScreenState : UiState<List<TestScenario>> {
 *     object Loading : TestScreenState()
 *     data class Success(override val data: List<TestScenario>) : TestScreenState()
 *     data class Error(override val message: String) : TestScreenState()
 * }
 * ```
 */
sealed interface UiState<out T> {
    
    /**
     * Initial state - no data loaded yet
     */
    object Initial : UiState<Nothing>
    
    /**
     * Loading state - data is being fetched/processed
     */
    object Loading : UiState<Nothing>
    
    /**
     * Success state - data loaded successfully
     * 
     * @param data The loaded data
     */
    data class Success<T>(val data: T) : UiState<T>
    
    /**
     * Error state - something went wrong
     * 
     * @param message Error message to display
     * @param throwable Optional exception for debugging
     */
    data class Error(
        val message: String,
        val throwable: Throwable? = null
    ) : UiState<Nothing>
    
    /**
     * Empty state - successful load but no data available
     * 
     * @param message Optional message explaining why it's empty
     */
    data class Empty(val message: String = "No data available") : UiState<Nothing>
}

/**
 * Extension functions for UiState
 */

/**
 * Check if state is loading
 */
fun <T> UiState<T>.isLoading(): Boolean = this is UiState.Loading

/**
 * Check if state is success
 */
fun <T> UiState<T>.isSuccess(): Boolean = this is UiState.Success

/**
 * Check if state is error
 */
fun <T> UiState<T>.isError(): Boolean = this is UiState.Error

/**
 * Check if state is empty
 */
fun <T> UiState<T>.isEmpty(): Boolean = this is UiState.Empty

/**
 * Get data if success, null otherwise
 */
fun <T> UiState<T>.dataOrNull(): T? = (this as? UiState.Success)?.data

/**
 * Get error message if error, null otherwise
 */
fun <T> UiState<T>.errorOrNull(): String? = (this as? UiState.Error)?.message
