package com.infinitygauntlet.simulation.services

import android.app.Service
import android.content.Intent
import android.os.Binder
import android.os.IBinder
import com.infinitygauntlet.simulation.domain.models.TestResult
// TestSummary removed - no longer needed
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

/**
 * Background service for generating test reports.
 * 
 * Features:
 * - Generates HTML, JSON, and plain text reports
 * - Saves reports to external storage
 * - Provides progress updates via StateFlow
 * - Supports multiple report formats simultaneously
 * - Handles large result sets efficiently
 * 
 * Usage:
 * ```kotlin
 * val intent = Intent(context, ReportGeneratorService::class.java)
 * intent.putExtra("results", ArrayList(results))
 * intent.putExtra("format", "html")
 * context.startService(intent)
 * ```
 */
class ReportGeneratorService : Service() {

    companion object {
        const val EXTRA_RESULTS = "results"
        const val EXTRA_FORMAT = "format"
        const val EXTRA_OUTPUT_PATH = "output_path"
        
        const val FORMAT_HTML = "html"
        const val FORMAT_JSON = "json"
        const val FORMAT_TEXT = "text"
        const val FORMAT_ALL = "all"
    }

    private val binder = ReportGeneratorBinder()
    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    // State management
    private val _generationState = MutableStateFlow<GenerationState>(GenerationState.Idle)
    val generationState: StateFlow<GenerationState> = _generationState.asStateFlow()
    
    private val _progress = MutableStateFlow(0)
    val progress: StateFlow<Int> = _progress.asStateFlow()
    
    private var currentJob: Job? = null

    inner class ReportGeneratorBinder : Binder() {
        fun getService(): ReportGeneratorService = this@ReportGeneratorService
    }

    override fun onBind(intent: Intent?): IBinder {
        return binder
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val results = intent?.getParcelableArrayListExtra<TestResult>(EXTRA_RESULTS) ?: emptyList()
        val format = intent?.getStringExtra(EXTRA_FORMAT) ?: FORMAT_HTML
        val outputPath = intent?.getStringExtra(EXTRA_OUTPUT_PATH)
        
        if (results.isNotEmpty()) {
            generateReport(results, format, outputPath)
        }
        
        return START_NOT_STICKY
    }

    /**
     * Generate test report in specified format.
     * 
     * @param results List of test results to include in report
     * @param format Report format (html, json, text, or all)
     * @param outputPath Optional custom output path
     */
    fun generateReport(
        results: List<TestResult>,
        format: String = FORMAT_HTML,
        outputPath: String? = null
    ) {
        if (_generationState.value is GenerationState.Generating) {
            // Already generating, queue or ignore
            return
        }
        
        _generationState.value = GenerationState.Generating
        _progress.value = 0
        
        currentJob = serviceScope.launch {
            try {
                val summary = TestSummary.fromResults(results, "android-report")
                val baseOutputPath = outputPath ?: getDefaultOutputPath()
                val generatedFiles = mutableListOf<File>()
                
                when (format) {
                    FORMAT_HTML -> {
                        _progress.value = 25
                        val file = generateHtmlReport(summary, baseOutputPath)
                        generatedFiles.add(file)
                        _progress.value = 100
                    }
                    FORMAT_JSON -> {
                        _progress.value = 25
                        val file = generateJsonReport(summary, baseOutputPath)
                        generatedFiles.add(file)
                        _progress.value = 100
                    }
                    FORMAT_TEXT -> {
                        _progress.value = 25
                        val file = generateTextReport(summary, baseOutputPath)
                        generatedFiles.add(file)
                        _progress.value = 100
                    }
                    FORMAT_ALL -> {
                        _progress.value = 10
                        val htmlFile = generateHtmlReport(summary, baseOutputPath)
                        generatedFiles.add(htmlFile)
                        
                        _progress.value = 40
                        val jsonFile = generateJsonReport(summary, baseOutputPath)
                        generatedFiles.add(jsonFile)
                        
                        _progress.value = 70
                        val textFile = generateTextReport(summary, baseOutputPath)
                        generatedFiles.add(textFile)
                        
                        _progress.value = 100
                    }
                }
                
                _generationState.value = GenerationState.Complete(generatedFiles)
                
                // Auto-stop after completion
                delay(1000)
                stopSelf()
                
            } catch (e: CancellationException) {
                _generationState.value = GenerationState.Cancelled
            } catch (e: Exception) {
                _generationState.value = GenerationState.Error(e.message ?: "Unknown error")
            }
        }
    }

    /**
     * Generate HTML report.
     * 
     * @param summary Test summary to convert to HTML
     * @param basePath Base output path
     * @return The generated file
     */
    private suspend fun generateHtmlReport(summary: TestSummary, basePath: String): File {
        return withContext(Dispatchers.IO) {
            val filename = "${basePath}_${getTimestamp()}.html"
            val file = File(filename)
            
            val html = summary.toHtml()
            file.writeText(html)
            
            file
        }
    }

    /**
     * Generate JSON report.
     * 
     * @param summary Test summary to convert to JSON
     * @param basePath Base output path
     * @return The generated file
     */
    private suspend fun generateJsonReport(summary: TestSummary, basePath: String): File {
        return withContext(Dispatchers.IO) {
            val filename = "${basePath}_${getTimestamp()}.json"
            val file = File(filename)
            
            val json = summary.toJsonPretty()
            file.writeText(json)
            
            file
        }
    }

    /**
     * Generate plain text report.
     * 
     * @param summary Test summary to convert to text
     * @param basePath Base output path
     * @return The generated file
     */
    private suspend fun generateTextReport(summary: TestSummary, basePath: String): File {
        return withContext(Dispatchers.IO) {
            val filename = "${basePath}_${getTimestamp()}.txt"
            val file = File(filename)
            
            val text = summary.toText()
            file.writeText(text)
            
            file
        }
    }

    /**
     * Get default output path for reports.
     * 
     * @return Default path in external files directory
     */
    private fun getDefaultOutputPath(): String {
        val reportsDir = File(getExternalFilesDir(null), "reports")
        if (!reportsDir.exists()) {
            reportsDir.mkdirs()
        }
        return File(reportsDir, "test_report").absolutePath
    }

    /**
     * Get timestamp string for filename.
     * 
     * @return Formatted timestamp
     */
    private fun getTimestamp(): String {
        val formatter = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.getDefault())
        return formatter.format(Date())
    }

    /**
     * Cancel report generation.
     */
    fun cancelGeneration() {
        currentJob?.cancel()
        _generationState.value = GenerationState.Cancelled
    }

    override fun onDestroy() {
        super.onDestroy()
        currentJob?.cancel()
        serviceScope.cancel()
    }

    /**
     * Sealed class representing report generation states.
     */
    sealed class GenerationState {
        object Idle : GenerationState()
        object Generating : GenerationState()
        data class Complete(val files: List<File>) : GenerationState()
        object Cancelled : GenerationState()
        data class Error(val message: String) : GenerationState()
    }

    /**
     * Helper class for batch report generation.
     */
    class BatchReportGenerator(private val service: ReportGeneratorService) {
        private val jobs = mutableListOf<Deferred<File>>()
        
        suspend fun generateAll(
            results: List<TestResult>,
            outputPath: String
        ): List<File> = coroutineScope {
            val summary = TestSummary.fromResults(results, "batch-report")
            
            val htmlJob = async { service.generateHtmlReport(summary, outputPath) }
            val jsonJob = async { service.generateJsonReport(summary, outputPath) }
            val textJob = async { service.generateTextReport(summary, outputPath) }
            
            listOf(
                htmlJob.await(),
                jsonJob.await(),
                textJob.await()
            )
        }
    }

    /**
     * Report sharing helper.
     */
    object ReportSharer {
        /**
         * Create share intent for report file.
         * 
         * @param file Report file to share
         * @return Share intent
         */
        fun createShareIntent(file: File): Intent {
            return Intent(Intent.ACTION_SEND).apply {
                type = when (file.extension) {
                    "html" -> "text/html"
                    "json" -> "application/json"
                    "txt" -> "text/plain"
                    else -> "*/*"
                }
                putExtra(Intent.EXTRA_SUBJECT, "Test Report - ${file.nameWithoutExtension}")
                putExtra(Intent.EXTRA_TEXT, "Test report generated at ${Date()}")
                // Note: In production, use FileProvider for file URIs
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
        }
    }
}
