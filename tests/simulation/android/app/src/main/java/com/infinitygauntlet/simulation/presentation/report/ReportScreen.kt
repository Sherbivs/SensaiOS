package com.infinitygauntlet.simulation.presentation.report

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.infinitygauntlet.simulation.domain.models.ResultStatus
import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.ui.components.*
import com.infinitygauntlet.simulation.ui.theme.Spacing

/**
 * Report Screen - Test Result Viewer with Export
 * 
 * Week 4: Phase 4.2 - UI Screens
 * 
 * Features:
 * - Test result summary card with statistics
 * - Pass/fail metrics with visual indicators
 * - Duration and timestamp display
 * - Export to HTML/JSON/Text formats
 * - Format switching tabs
 * - Error message display
 * - Loading and empty states
 * 
 * Architecture:
 * - Uses ReportViewModel for state management
 * - Collects StateFlow for reactive UI
 * - Handles one-time events via SharedFlow
 * - Integrates Week 3 component library
 */
@Composable
fun ReportScreen(
    viewModel: ReportViewModel = hiltViewModel(),
    scenarioId: Long = 0
) {
    // Collect UI state
    val uiState by viewModel.uiState.collectAsState()
    
    // Collect one-time events
    val events by viewModel.events.collectAsState(initial = null)
    
    // Snackbar host for messages
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Load report on first composition
    LaunchedEffect(scenarioId) {
        if (scenarioId > 0) {
            viewModel.loadLatestReport(scenarioId)
        }
    }
    
    // Handle one-time events
    LaunchedEffect(events) {
        events?.let { event ->
            when (event) {
                is ReportUiEvent.Error -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = SnackbarDuration.Short
                    )
                }
                is ReportUiEvent.ShowMessage -> {
                    snackbarHostState.showSnackbar(
                        message = event.message,
                        duration = SnackbarDuration.Short
                    )
                }
                is ReportUiEvent.ReportExported -> {
                    snackbarHostState.showSnackbar(
                        message = "Exported to ${event.filename}",
                        duration = SnackbarDuration.Short
                    )
                }
                is ReportUiEvent.FormatSwitched -> {
                    snackbarHostState.showSnackbar(
                        message = "Switched to ${event.format.name} format",
                        duration = SnackbarDuration.Short
                    )
                }
                else -> {
                    // Other events (ReportLoaded, ReportGenerated)
                }
            }
        }
    }
    
    Scaffold(
        topBar = {
            ReportTopBar(
                result = uiState.result,
                onRefresh = {
                    if (scenarioId > 0) {
                        viewModel.loadLatestReport(scenarioId)
                    }
                }
            )
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
                        onRetry = {
                            if (scenarioId > 0) {
                                viewModel.loadLatestReport(scenarioId)
                            }
                        }
                    )
                }
                uiState.result == null -> {
                    // Empty state
                    EmptyContent(
                        onLoadSample = {
                            // TODO: Load sample report
                        }
                    )
                }
                else -> {
                    // Main content with report
                    ReportContent(
                        result = uiState.result!!,
                        currentFormat = uiState.currentFormat,
                        reportContent = uiState.currentReportContent,
                        isGenerating = uiState.isGenerating,
                        onFormatChange = viewModel::switchFormat,
                        onExportReport = { format ->
                            // Export with formatted filename
                            val filename = "report_${uiState.result!!.scenarioName}_${uiState.result!!.formatExecutionTime()}.${format.name.lowercase()}"
                            viewModel.exportReport(filename)
                        }
                    )
                }
            }
        }
    }
}

/**
 * Top App Bar for Report Screen
 */
@Composable
private fun ReportTopBar(
    result: TestResult?,
    onRefresh: () -> Unit
) {
    SmallTopBar(
        title = result?.scenarioName ?: "Test Report",
        navigationIcon = AppIcons.ArrowBack,
        onNavigationClick = { /* TODO: Navigate back */ },
        actions = {
            IconActionButton(
                icon = AppIcons.Refresh,
                contentDescription = "Refresh report",
                onClick = onRefresh
            )
            
            IconActionButton(
                icon = AppIcons.Info,
                contentDescription = "Report info",
                onClick = { /* TODO: Show info dialog */ }
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
            text = "Loading report...",
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
        title = "Failed to Load Report",
        message = error,
        onRetry = onRetry
    )
}

/**
 * Empty Content
 */
@Composable
private fun EmptyContent(
    onLoadSample: () -> Unit
) {
    EmptyStateWithAction(
        title = "No Report Available",
        message = "Run a test scenario to generate a report",
        actionText = "Load Sample Report",
        onAction = onLoadSample,
        icon = AppIcons.Description
    )
}

/**
 * Main Report Content
 */
@Composable
private fun ReportContent(
    result: TestResult,
    currentFormat: ReportFormat,
    reportContent: String?,
    isGenerating: Boolean,
    onFormatChange: (ReportFormat) -> Unit,
    onExportReport: (ReportFormat) -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(Spacing.Medium),
        verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
    ) {
        // Result summary card
        ResultSummaryCard(result = result)
        
        // Statistics section
        StatisticsSection(result = result)
        
        // Error message (if failed)
        if (!result.errorMessage.isNullOrEmpty()) {
            ErrorMessageCard(errorMessage = result.errorMessage)
        }
        
        // Export actions
        ExportActionsSection(
            onExportReport = onExportReport
        )
        
        // Format tabs
        FormatTabs(
            currentFormat = currentFormat,
            onFormatChange = onFormatChange
        )
        
        // Report content preview
        if (isGenerating) {
            ReportGeneratingCard()
        } else if (reportContent != null) {
            ReportContentCard(
                content = reportContent,
                format = currentFormat
            )
        } else {
            ReportNotGeneratedCard(format = currentFormat)
        }
    }
}

/**
 * Result Summary Card
 */
@Composable
private fun ResultSummaryCard(
    result: TestResult
) {
    ResultCard(
        passed = result.passedTests,
        failed = result.failedTests,
        skipped = 0, // TODO: Add skipped tests to model
        duration = result.formatDuration(),
        modifier = Modifier.fillMaxWidth()
    )
}

/**
 * Statistics Section
 */
@Composable
private fun StatisticsSection(
    result: TestResult
) {
    ElevatedSurface(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            Text(
                text = "Statistics",
                style = MaterialTheme.typography.titleMedium
            )
            
            Spacer(modifier = Modifier.height(Spacing.Small))
            
            // Status badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Status",
                    style = MaterialTheme.typography.bodyMedium
                )
                StatusBadgeText(status = result.status.name)
            }
            
            ItemDivider()
            
            // Execution time
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Executed",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = result.formatExecutionTime(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            ItemDivider()
            
            // Duration
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Duration",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = result.formatDuration(),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            ItemDivider()
            
            // Pass rate
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Pass Rate",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "${result.passRate.toInt()}%",
                    style = MaterialTheme.typography.bodySmall,
                    color = if (result.passRate >= 80f) {
                        MaterialTheme.colorScheme.primary
                    } else {
                        MaterialTheme.colorScheme.error
                    }
                )
            }
            
            ItemDivider()
            
            // Total tests
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Total Tests",
                    style = MaterialTheme.typography.bodyMedium
                )
                Text(
                    text = "${result.passedTests + result.failedTests}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            // Progress bar
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            LinearProgressWithLabel(
                progress = result.passRate / 100f,
                label = "Test Progress"
            )
        }
    }
}

/**
 * Error Message Card
 */
@Composable
private fun ErrorMessageCard(
    errorMessage: String
) {
    StatusSurface(
        status = "FAILED",
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(Spacing.Medium)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                Icon(
                    imageVector = AppIcons.Error,
                    contentDescription = "Error",
                    tint = MaterialTheme.colorScheme.error
                )
                Text(
                    text = "Error Details",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.error
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.Small))
            
            Text(
                text = errorMessage,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

/**
 * Export Actions Section
 */
@Composable
private fun ExportActionsSection(
    onExportReport: (ReportFormat) -> Unit
) {
    ElevatedSurface(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(Spacing.Medium),
            verticalArrangement = Arrangement.spacedBy(Spacing.Small)
        ) {
            Text(
                text = "Export Report",
                style = MaterialTheme.typography.titleMedium
            )
            
            Spacer(modifier = Modifier.height(Spacing.Small))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
            ) {
                OutlinedActionButton(
                    text = "HTML",
                    onClick = { onExportReport(ReportFormat.HTML) },
                    modifier = Modifier.weight(1f)
                )
                
                OutlinedActionButton(
                    text = "JSON",
                    onClick = { onExportReport(ReportFormat.JSON) },
                    modifier = Modifier.weight(1f)
                )
                
                OutlinedActionButton(
                    text = "Text",
                    onClick = { onExportReport(ReportFormat.TEXT) },
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

/**
 * Format Tabs
 */
@Composable
private fun FormatTabs(
    currentFormat: ReportFormat,
    onFormatChange: (ReportFormat) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(Spacing.Small)
    ) {
        ReportFormat.values().forEach { format ->
            FilterSelectionChip(
                label = format.name,
                selected = currentFormat == format,
                onClick = { onFormatChange(format) }
            )
        }
    }
}

/**
 * Report Generating Card
 */
@Composable
private fun ReportGeneratingCard() {
    ElevatedSurface(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.Large),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            CircularProgressIndicator()
            
            Text(
                text = "Generating report...",
                style = MaterialTheme.typography.bodyMedium
            )
        }
    }
}

/**
 * Report Content Card
 */
@Composable
private fun ReportContentCard(
    content: String,
    format: ReportFormat
) {
    ElevatedSurface(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(Spacing.Medium)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${format.name} Preview",
                    style = MaterialTheme.typography.titleMedium
                )
                
                IconActionButton(
                    icon = AppIcons.Visibility,
                    contentDescription = "View full report",
                    onClick = { /* TODO: Open full report viewer */ }
                )
            }
            
            Spacer(modifier = Modifier.height(Spacing.Medium))
            
            OutlinedSurface(
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = content.take(500) + if (content.length > 500) "\n\n... (preview truncated)" else "",
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(Spacing.Medium)
                )
            }
        }
    }
}

/**
 * Report Not Generated Card
 */
@Composable
private fun ReportNotGeneratedCard(
    format: ReportFormat
) {
    OutlinedSurface(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(Spacing.Large),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Spacing.Medium)
        ) {
            Icon(
                imageVector = AppIcons.Description,
                contentDescription = "No report",
                modifier = Modifier.size(48.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Text(
                text = "${format.name} report not generated",
                style = MaterialTheme.typography.bodyMedium,
                textAlign = TextAlign.Center
            )
            
            Text(
                text = "Export the report to generate ${format.name} format",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center
            )
        }
    }
}
