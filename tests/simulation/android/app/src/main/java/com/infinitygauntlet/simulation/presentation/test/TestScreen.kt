package com.infinitygauntlet.simulation.presentation.test

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.infinitygauntlet.simulation.domain.models.TestScenario
import com.infinitygauntlet.simulation.domain.models.TestStatus
import com.infinitygauntlet.simulation.ui.components.*
import com.infinitygauntlet.simulation.ui.theme.Spacing

/**
 * Test Screen - Test Scenario Manager
 * 
 * Week 4: Phase 4.3 - UI Screens
 * 
 * Features:
 * - Test scenario list with status indicators
 * - Individual scenario execution
 * - Run all scenarios at once
 * - Overall statistics summary
 * - Progress tracking during execution
 * - Result navigation
 * - Category filtering
 * - Loading and empty states
 * 
 * Architecture:
 * - Uses TestViewModel for state management
 * - Collects StateFlow for reactive UI
 * - Handles one-time events via SharedFlow
 * - Integrates Week 3 component library
 */
@Composable
fun TestScreen(
    viewModel: TestViewModel = hiltViewModel(),
    onNavigateToResult: (Long, String) -> Unit = { _, _ -> }
) {
    // Collect UI state
    val uiState by viewModel.uiState.collectAsState()
    
    // Collect one-time events
    val events by viewModel.events.collectAsState(initial = null)
    
    // Snackbar host for messages
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Category filter state
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    
    // Load scenarios on first composition
    LaunchedEffect(Unit) {
        viewModel.loadScenarios()
    }
    
    // Handle one-time events
    LaunchedEffect(events) {
        events?.let { event ->
            when (event) {
                is TestUiEvent.Error -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = SnackbarDuration.Short
                    )
                }
                is TestUiEvent.ShowMessage -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = SnackbarDuration.Short
                    )
                }
                is TestUiEvent.TestCompleted -> {
                    snackbarHostState.showSnackbar(
                        message = if (event.success) {
                            "Test completed successfully!"
                        } else {
                            "Test failed. View details for more info."
                        },
                        duration = SnackbarDuration.Short
                    )
                }
                is TestUiEvent.AllTestsCompleted -> {
                    snackbarHostState.showSnackbar(
                        message = "All tests completed: ${event.passedScenarios}/${event.totalScenarios} passed",
                        duration = SnackbarDuration.Long
                    )
                }
                is TestUiEvent.NavigateToResult -> {
                    onNavigateToResult(event.resultId, event.scenarioName)
                }
                is TestUiEvent.ProgressUpdate -> {
                    // Progress updates handled in UI state
                }
            }
        }
    }
    
    Scaffold(
        topBar = {
            TestTopBar(
                totalScenarios = uiState.scenarios.size,
                completedScenarios = uiState.completedScenarios,
                onRefresh = { viewModel.loadScenarios() }
            )
        },
        floatingActionButton = {
            if (!uiState.isRunning && uiState.scenarios.isNotEmpty()) {
                PrimaryFAB(
                    text = "Run All",
                    icon = AppIcons.PlayArrow,
                    contentDescription = "Run all test scenarios",
                    onClick = { viewModel.runAllScenarios() },
                    expanded = true
                )
            }
        },
        snackbarHost = {
            SnackbarHost(hostState = snackbarHostState)
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> {
                    // Loading state
                    LoadingContent()
                }
                uiState.error != null -> {
                    // Error state
                    ErrorContent(
                        error = uiState.error!!,
                        onRetry = { viewModel.loadScenarios() }
                    )
                }
                uiState.scenarios.isEmpty() -> {
                    // Empty state
                    EmptyContent(
                        onCreateSample = { /* TODO: Create sample scenarios */ }
                    )
                }
                else -> {
                    // Main content with scenarios
                    Column(
                        modifier = Modifier.fillMaxSize()
                    ) {
                        // Statistics summary
                        StatisticsSummarySection(uiState = uiState)
                        
                        // Category filter
                        if (uiState.scenarios.isNotEmpty()) {
                            CategoryFilterSection(
                                scenarios = uiState.scenarios,
                                selectedCategory = selectedCategory,
                                onCategorySelected = { selectedCategory = it }
                            )
                        }
                        
                        // Progress indicator (when running)
                        if (uiState.isRunning) {
                            RunningProgressSection(
                                currentScenario = uiState.currentRunningScenario,
                                progress = uiState.progress
                            )
                        }
                        
                        // Scenario list
                        ScenarioList(
                            scenarios = if (selectedCategory != null) {
                                uiState.scenarios.filter { it.category == selectedCategory }
                            } else {
                                uiState.scenarios
                            },
                            isRunning = uiState.isRunning,
                            currentRunningScenario = uiState.currentRunningScenario,
                            onRunScenario = { scenario -> viewModel.runScenario(scenario) },
                            onViewResult = { scenario ->
                                // TODO: Navigate to result
                            }
                        )
                    }
                }
            }
        }
    }
}

/**
 * Top App Bar for Test Screen
 */
@Composable
private fun TestTopBar(
    totalScenarios: Int,
    completedScenarios: Int,
    onRefresh: () -> Unit
) {
    SmallTopBar(
        title = "Test Scenarios",
        navigationIcon = AppIcons.Menu,
        onNavigationClick = { /* TODO: Open drawer */ },
        actions = {
            // Progress badge
            if (completedScenarios > 0) {
                BadgedContent(
                    badge = {
                        NotificationBadge(count = completedScenarios)
                    }
                ) {
                    IconActionButton(
                        icon = AppIcons.CheckCircle,
                        contentDescription = "Completed scenarios",
                        onClick = { /* TODO: Filter completed */ }
                    )
                }
            }
            
            IconActionButton(
                icon = AppIcons.Refresh,
                contentDescription = "Refresh scenarios",
                onClick = onRefresh
            )
            
            IconActionButton(
                icon = AppIcons.Settings,
                contentDescription = "Test settings",
                onClick = { /* TODO: Open settings */ }
            )
        }
    )
}

/**
 * Loading Content
 */
@Composable
private fun LoadingContent() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        CircularProgressIndicator()
        Spacer(modifier = Modifier.height(Spacing.Medium))
        Text(
            text = "Loading scenarios...",
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

/**
 * Error Content
 */
@Composable
private fun ErrorContent(
    error: String,
    onRetry: () -> Unit
) {
    ErrorState(
        title = "Failed to Load Scenarios",
        message = error,
        onRetry = onRetry
    )
}

/**
 * Empty Content
 */
@Composable
private fun EmptyContent(
    onCreateSample: () -> Unit
) {
    EmptyStateWithAction(
        title = "No Test Scenarios",
        message = "Create or import test scenarios to begin testing",
        actionText = "Create Sample Scenarios",
        onAction = onCreateSample,
        icon = AppIcons.TestTube
    )
}

/**
 * Statistics Summary Section
 */
@Composable
private fun StatisticsSummarySection(
    uiState: TestUiState
) {
    ResultCard(
        passed = uiState.passedScenarios,
        failed = uiState.failedScenarios,
        skipped = 0, // Calculate skipped if needed
        duration = "${uiState.scenarios.sumOf { it.estimatedDuration } / 1000}s estimated",
        modifier = Modifier
            .fillMaxWidth()
            .padding(Spacing.Medium)
    )
}

/**
 * Category Filter Section
 */
@Composable
private fun CategoryFilterSection(
    scenarios: List<TestScenario>,
    selectedCategory: String?,
    onCategorySelected: (String?) -> Unit
) {
    val categories = remember(scenarios) {
        scenarios.map { it.category }.distinct().sorted()
    }
    
    if (categories.isNotEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.Medium)
        ) {
            Text(
                text = "Filter by Category",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(Spacing.XSmall))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                // "All" chip
                FilterSelectionChip(
                    label = "All (${scenarios.size})",
                    selected = selectedCategory == null,
                    onClick = { onCategorySelected(null) }
                )
                
                // Category chips
                categories.forEach { category ->
                    val count = scenarios.count { it.category == category }
                    FilterSelectionChip(
                        label = "$category ($count)",
                        selected = selectedCategory == category,
                        onClick = { onCategorySelected(category) }
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
        }
    }
}

/**
 * Running Progress Section
 */
@Composable
private fun RunningProgressSection(
    currentScenario: TestScenario?,
    progress: Int
) {
    ElevatedSurface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = Spacing.Medium)
    ) {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Running Tests...",
                    style = MaterialTheme.typography.titleMedium
                )
                
                Text(
                    text = "$progress%",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            if (currentScenario != null) {
                Text(
                    text = "Current: ${currentScenario.name}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            LinearProgressWithLabel(
                progress = progress / 100f,
                label = "Overall Progress"
            )
        }
    }
    
    Spacer(modifier = Modifier.height(Spacing.Medium))
}

/**
 * Scenario List
 */
@Composable
private fun ScenarioList(
    scenarios: List<TestScenario>,
    isRunning: Boolean,
    currentRunningScenario: TestScenario?,
    onRunScenario: (TestScenario) -> Unit,
    onViewResult: (TestScenario) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(Spacing.Medium),
        verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
    ) {
        items(
            items = scenarios,
            key = { it.id }
        ) { scenario ->
            TestScenarioListItem(
                scenario = scenario,
                isRunning = isRunning && currentRunningScenario?.id == scenario.id,
                onRunClick = { onRunScenario(scenario) },
                onViewResultClick = { onViewResult(scenario) },
                enabled = !isRunning
            )
        }
    }
}

/**
 * Test Scenario List Item
 */
@Composable
private fun TestScenarioListItem(
    scenario: TestScenario,
    isRunning: Boolean,
    onRunClick: () -> Unit,
    onViewResultClick: () -> Unit,
    enabled: Boolean
) {
    TestScenarioCard(
        title = scenario.name,
        description = scenario.description,
        status = scenario.status.name,
        onClick = if (enabled) onRunClick else null,
        modifier = Modifier.fillMaxWidth()
    )
}
