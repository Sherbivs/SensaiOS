package com.infinitygauntlet.simulation.presentation.report

import com.infinitygauntlet.simulation.domain.models.TestResult

/**
 * UI state for ReportViewModel
 * Represents the complete state of the report viewer screen
 */
data class ReportUiState(
    val result: TestResult? = null,
    val htmlReport: String? = null,
    val jsonReport: String? = null,
    val textReport: String? = null,
    val currentFormat: ReportFormat = ReportFormat.HTML,
    val isLoading: Boolean = false,
    val isGenerating: Boolean = false,
    val error: String? = null
) {
    /**
     * Check if a report is loaded
     */
    val hasReport: Boolean
        get() = result != null
    
    /**
     * Get current report content based on format
     */
    val currentReportContent: String?
        get() = when (currentFormat) {
            ReportFormat.HTML -> htmlReport
            ReportFormat.JSON -> jsonReport
            ReportFormat.TEXT -> textReport
        }
    
    /**
     * Check if current format report is generated
     */
    val isCurrentFormatGenerated: Boolean
        get() = currentReportContent != null
}

/**
 * Report display format options
 */
enum class ReportFormat {
    HTML,
    JSON,
    TEXT
}
