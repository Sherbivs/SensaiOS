package com.infinitygauntlet.simulation.presentation.report

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.GsonBuilder
import com.infinitygauntlet.simulation.domain.models.ResultStatus
import com.infinitygauntlet.simulation.domain.models.TestResult
import com.infinitygauntlet.simulation.domain.repository.TestResultRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * ViewModel for ReportViewerActivity - Test Report Display Screen
 * 
 * MIGRATED TO:
 * - Hilt dependency injection
 * - Repository pattern (no direct DAO access)
 * - MVI architecture (UiState + UiEvent)
 * - StateFlow (instead of LiveData)
 * - Database queries (via repository)
 * 
 * Features:
 * - Load test results from database
 * - Generate HTML/JSON/Text reports
 * - Switch between report formats
 * - Export reports
 * - View historical results
 */
@HiltViewModel
class ReportViewModel @Inject constructor(
    private val resultRepository: TestResultRepository
) : ViewModel() {
    
    // UI State - Single source of truth for report viewer screen
    private val _uiState = MutableStateFlow(ReportUiState())
    val uiState: StateFlow<ReportUiState> = _uiState.asStateFlow()
    
    // One-time events for UI (toasts, exports, sharing)
    private val _events = MutableSharedFlow<ReportUiEvent>()
    val events: SharedFlow<ReportUiEvent> = _events.asSharedFlow()
    
    /**
     * Load the most recent test result from database
     * Automatically generates HTML report
     */
    fun loadLatestReport(scenarioId: Long = 0) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            try {
                val latestResult = resultRepository.getLatestResult(scenarioId)
                if (latestResult != null) {
                    _uiState.update { 
                        it.copy(
                            result = latestResult,
                            isLoading = false
                        )
                    }
                    _events.emit(ReportUiEvent.ReportLoaded(latestResult))
                    
                    // Auto-generate HTML report
                    generateHtmlReport()
                } else {
                    _uiState.update { 
                        it.copy(
                            isLoading = false,
                            error = "No test results found"
                        )
                    }
                    _events.emit(ReportUiEvent.Error("No test results found"))
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = "Failed to load report: ${e.message}"
                    )
                }
                _events.emit(ReportUiEvent.Error("Failed to load report: ${e.message}"))
            }
        }
    }
    
    /**
     * Load a specific test result by ID
     */
    fun loadReport(resultId: Long) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            
            try {
                // Get specific result by ID
                val result = resultRepository.getResultById(resultId)
                if (result != null) {
                    _uiState.update { 
                        it.copy(
                            result = result,
                            isLoading = false
                        )
                    }
                    _events.emit(ReportUiEvent.ReportLoaded(result))
                    
                    // Auto-generate HTML report
                    generateHtmlReport()
                } else {
                    _uiState.update { 
                        it.copy(
                            isLoading = false,
                            error = "Result not found"
                        )
                    }
                    _events.emit(ReportUiEvent.Error("Result not found"))
                }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = "Failed to load report: ${e.message}"
                    )
                }
                _events.emit(ReportUiEvent.Error("Failed to load report: ${e.message}"))
            }
        }
    }
    
    /**
     * Load results for a specific scenario
     */
    fun loadScenarioResults(scenarioId: Long) {
        viewModelScope.launch {
            try {
                resultRepository.getResultsByScenario(scenarioId).collect { results ->
                    if (results.isNotEmpty()) {
                        // Load the most recent result
                        val latestResult = results.first()
                        _uiState.update { it.copy(result = latestResult) }
                        _events.emit(ReportUiEvent.ReportLoaded(latestResult))
                        generateHtmlReport()
                    } else {
                        _events.emit(ReportUiEvent.Error("No results for this scenario"))
                    }
                }
            } catch (e: Exception) {
                _events.emit(ReportUiEvent.Error("Failed to load scenario results: ${e.message}"))
            }
        }
    }
    
    /**
     * Generate HTML report from current result
     */
    fun generateHtmlReport() {
        val result = _uiState.value.result
        if (result == null) {
            viewModelScope.launch {
                _events.emit(ReportUiEvent.Error("No result loaded"))
            }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isGenerating = true) }
            
            try {
                // Simulate generation time (300ms)
                delay(300)
                
                val html = buildHtmlReport(result)
                _uiState.update { 
                    it.copy(
                        htmlReport = html,
                        currentFormat = ReportFormat.HTML,
                        isGenerating = false
                    )
                }
                _events.emit(ReportUiEvent.ReportGenerated(ReportFormat.HTML))
            } catch (e: Exception) {
                _uiState.update { it.copy(isGenerating = false) }
                _events.emit(ReportUiEvent.Error("Failed to generate HTML: ${e.message}"))
            }
        }
    }
    
    /**
     * Generate JSON report from current result
     */
    fun generateJsonReport() {
        val result = _uiState.value.result
        if (result == null) {
            viewModelScope.launch {
                _events.emit(ReportUiEvent.Error("No result loaded"))
            }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isGenerating = true) }
            
            try {
                // Simulate generation time (200ms)
                delay(200)
                
                val gson = GsonBuilder().setPrettyPrinting().create()
                val json = gson.toJson(result)
                _uiState.update { 
                    it.copy(
                        jsonReport = json,
                        currentFormat = ReportFormat.JSON,
                        isGenerating = false
                    )
                }
                _events.emit(ReportUiEvent.ReportGenerated(ReportFormat.JSON))
            } catch (e: Exception) {
                _uiState.update { it.copy(isGenerating = false) }
                _events.emit(ReportUiEvent.Error("Failed to generate JSON: ${e.message}"))
            }
        }
    }
    
    /**
     * Generate plain text report from current result
     */
    fun generateTextReport() {
        val result = _uiState.value.result
        if (result == null) {
            viewModelScope.launch {
                _events.emit(ReportUiEvent.Error("No result loaded"))
            }
            return
        }
        
        viewModelScope.launch {
            _uiState.update { it.copy(isGenerating = true) }
            
            try {
                // Simulate generation time (200ms)
                delay(200)
                
                val text = buildTextReport(result)
                _uiState.update { 
                    it.copy(
                        textReport = text,
                        currentFormat = ReportFormat.TEXT,
                        isGenerating = false
                    )
                }
                _events.emit(ReportUiEvent.ReportGenerated(ReportFormat.TEXT))
            } catch (e: Exception) {
                _uiState.update { it.copy(isGenerating = false) }
                _events.emit(ReportUiEvent.Error("Failed to generate text: ${e.message}"))
            }
        }
    }
    
    /**
     * Switch report format
     * Generates report if not already generated for that format
     */
    fun switchFormat(format: ReportFormat) {
        val currentState = _uiState.value
        
        // Check if format already generated
        val isGenerated = when (format) {
            ReportFormat.HTML -> currentState.htmlReport != null
            ReportFormat.JSON -> currentState.jsonReport != null
            ReportFormat.TEXT -> currentState.textReport != null
        }
        
        if (isGenerated) {
            // Just switch format
            _uiState.update { it.copy(currentFormat = format) }
            viewModelScope.launch {
                _events.emit(ReportUiEvent.FormatSwitched(format))
            }
        } else {
            // Generate report for this format
            when (format) {
                ReportFormat.HTML -> generateHtmlReport()
                ReportFormat.JSON -> generateJsonReport()
                ReportFormat.TEXT -> generateTextReport()
            }
        }
    }
    
    /**
     * Export current report to file
     * TODO: Implement actual file export
     */
    fun exportReport(filename: String) {
        viewModelScope.launch {
            val state = _uiState.value
            if (!state.hasReport) {
                _events.emit(ReportUiEvent.Error("No report to export"))
                return@launch
            }
            
            try {
                // TODO: Implement file export logic
                _events.emit(
                    ReportUiEvent.ReportExported(
                        filename = filename,
                        format = state.currentFormat
                    )
                )
                _events.emit(ReportUiEvent.ShowMessage("Report exported: $filename"))
            } catch (e: Exception) {
                _events.emit(ReportUiEvent.Error("Failed to export: ${e.message}"))
            }
        }
    }
    
    /**
     * Build HTML report from test result
     */
    private fun buildHtmlReport(result: TestResult): String {
        val passRate = String.format("%.1f", result.passRate)
        val statusColor = if (result.allTestsPassed) "#4CAF50" else "#F44336"
        val statusText = if (result.allTestsPassed) "PASSED" else "FAILED"
        
        return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test Report - ${result.scenarioName}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            padding: 24px;
        }
        h1 {
            margin: 0 0 8px 0;
            color: #333;
        }
        .status {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: 600;
            color: white;
            background: $statusColor;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 16px;
            margin: 24px 0;
        }
        .stat-card {
            padding: 16px;
            border-radius: 8px;
            background: #f8f9fa;
        }
        .stat-value {
            font-size: 32px;
            font-weight: 700;
            margin-bottom: 4px;
        }
        .stat-label {
            font-size: 14px;
            color: #666;
        }
        .pass { color: #4CAF50; }
        .fail { color: #F44336; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${result.scenarioName}</h1>
        <span class="status">$statusText</span>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value pass">${result.passedTests}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value fail">${result.failedTests}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$passRate%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
        </div>
        
        <p><strong>Duration:</strong> ${result.formatDuration()}</p>
        <p><strong>Execution Time:</strong> ${result.executionTimestamp}</p>
    </div>
</body>
</html>
        """.trimIndent()
    }
    
    /**
     * Build plain text report from test result
     */
    private fun buildTextReport(result: TestResult): String {
        val passRate = String.format("%.1f", result.passRate)
        val statusText = if (result.allTestsPassed) "PASSED ✓" else "FAILED ✗"
        
        return """
========================================
TEST REPORT: ${result.scenarioName}
========================================

Status: $statusText

Statistics:
-----------
Passed:    ${result.passedTests}
Failed:    ${result.failedTests}
Pass Rate: $passRate%

Duration: ${result.formatDuration()}
Execution Time: ${result.executionTimestamp}

${if (result.errorMessage != null) """
Error Details:
${result.errorMessage}
""" else ""}
        """.trimIndent()
    }
    
    /**
     * Clear error message from UI state
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
