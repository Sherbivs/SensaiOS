package com.infinitygauntlet.simulation.presentation.report

import com.infinitygauntlet.simulation.domain.models.TestResult

/**
 * One-time events emitted by ReportViewModel
 * These events are consumed once by the UI and do not persist in state
 */
sealed class ReportUiEvent {
    /**
     * Report loaded successfully
     */
    data class ReportLoaded(
        val result: TestResult
    ) : ReportUiEvent()
    
    /**
     * Report generated successfully
     */
    data class ReportGenerated(
        val format: com.infinitygauntlet.simulation.presentation.report.ReportFormat
    ) : ReportUiEvent()
    
    /**
     * Report format switched
     */
    data class FormatSwitched(
        val format: com.infinitygauntlet.simulation.presentation.report.ReportFormat
    ) : ReportUiEvent()
    
    /**
     * Report exported successfully
     */
    data class ReportExported(
        val filename: String,
        val format: com.infinitygauntlet.simulation.presentation.report.ReportFormat
    ) : ReportUiEvent()
    
    /**
     * Error occurred
     */
    data class Error(
        val message: String
    ) : ReportUiEvent()
    
    /**
     * Success message to display
     */
    data class ShowMessage(
        val message: String
    ) : ReportUiEvent()
}
