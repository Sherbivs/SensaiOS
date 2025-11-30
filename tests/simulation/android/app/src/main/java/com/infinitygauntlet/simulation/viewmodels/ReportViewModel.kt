package com.infinitygauntlet.simulation.viewmodels

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.infinitygauntlet.simulation.domain.models.TestResult
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * ViewModel for ReportViewerActivity
 * Manages report generation and format switching
 */
class ReportViewModel : ViewModel() {
    
    private val _htmlReport = MutableLiveData<String?>()
    val htmlReport: LiveData<String?> = _htmlReport
    
    private val _jsonReport = MutableLiveData<String?>()
    val jsonReport: LiveData<String?> = _jsonReport
    
    private val _textReport = MutableLiveData<String?>()
    val textReport: LiveData<String?> = _textReport
    
    private val _isLoading = MutableLiveData<Boolean>(false)
    val isLoading: LiveData<Boolean> = _isLoading
    
    private val _errorMessage = MutableLiveData<String?>()
    val errorMessage: LiveData<String?> = _errorMessage
    
    private var currentResult: TestResult? = null
    
    fun loadLatestReport() {
        // Load sample result for demonstration
        currentResult = TestResult.createSampleResult()
        generateHtmlReport()
    }
    
    fun loadResultFromJson(json: String) {
        try {
            currentResult = TestResult.fromJson(json)
            generateHtmlReport()
        } catch (e: Exception) {
            _errorMessage.value = "Failed to parse result: ${e.message}"
        }
    }
    
    fun generateHtmlReport() {
        val result = currentResult ?: return
        
        viewModelScope.launch {
            _isLoading.value = true
            delay(300) // Simulate generation time
            
            val html = buildHtmlReport(result)
            _htmlReport.value = html
            
            _isLoading.value = false
        }
    }
    
    fun generateJsonReport() {
        val result = currentResult ?: return
        
        viewModelScope.launch {
            _isLoading.value = true
            delay(200) // Simulate generation time
            
            val gson = GsonBuilder().setPrettyPrinting().create()
            val json = gson.toJson(result)
            _jsonReport.value = json
            
            _isLoading.value = false
        }
    }
    
    fun generateTextReport() {
        val result = currentResult ?: return
        
        viewModelScope.launch {
            _isLoading.value = true
            delay(200) // Simulate generation time
            
            val text = buildTextReport(result)
            _textReport.value = text
            
            _isLoading.value = false
        }
    }
    
    private fun buildHtmlReport(result: TestResult): String {
        val passRate = String.format("%.1f", result.getPassRate())
        val statusColor = if (result.isSuccess()) "#4CAF50" else "#F44336"
        val statusText = if (result.isSuccess()) "PASSED" else "FAILED"
        
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
        .skip { color: #FF9800; }
        .failures {
            margin-top: 24px;
        }
        .failure-item {
            padding: 16px;
            border-left: 4px solid #F44336;
            background: #FFF3F3;
            margin-bottom: 12px;
            border-radius: 4px;
        }
        .failure-test {
            font-weight: 600;
            margin-bottom: 8px;
        }
        .failure-detail {
            font-family: monospace;
            font-size: 13px;
            margin: 4px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${result.scenarioName}</h1>
        <span class="status">$statusText</span>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value pass">${result.passed}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value fail">${result.failed}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat-card">
                <div class="stat-value skip">${result.skipped}</div>
                <div class="stat-label">Skipped</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">$passRate%</div>
                <div class="stat-label">Pass Rate</div>
            </div>
        </div>
        
        <p><strong>Duration:</strong> ${result.getDurationSeconds()}s</p>
        <p><strong>Total Tests:</strong> ${result.getTotal()}</p>
        
        ${if (result.failureDetails.isNotEmpty()) """
        <div class="failures">
            <h2>Failed Tests (${result.failureDetails.size})</h2>
            ${result.failureDetails.joinToString("\n") { failure -> """
            <div class="failure-item">
                <div class="failure-test">${failure.testName}</div>
                <div class="failure-detail">Expected: ${failure.expectedValue}</div>
                <div class="failure-detail">Actual: ${failure.actualValue}</div>
                <div class="failure-detail">Error: ${failure.errorMessage}</div>
            </div>
            """ }}
        </div>
        """ else ""}
    </div>
</body>
</html>
        """.trimIndent()
    }
    
    private fun buildTextReport(result: TestResult): String {
        val passRate = String.format("%.1f", result.getPassRate())
        val statusText = if (result.isSuccess()) "PASSED ✓" else "FAILED ✗"
        
        val failuresText = if (result.failureDetails.isNotEmpty()) {
            "\n\nFailed Tests:\n" + result.failureDetails.joinToString("\n\n") { failure ->
                """
                Test: ${failure.testName}
                Expected: ${failure.expectedValue}
                Actual: ${failure.actualValue}
                Error: ${failure.errorMessage}
                """.trimIndent()
            }
        } else {
            ""
        }
        
        return """
========================================
TEST REPORT: ${result.scenarioName}
========================================

Status: $statusText

Statistics:
-----------
Passed:    ${result.passed}
Failed:    ${result.failed}
Skipped:   ${result.skipped}
Pass Rate: $passRate%

Duration: ${result.getDurationSeconds()}s
Total Tests: ${result.getTotal()}
$failuresText
        """.trimIndent()
    }
}
