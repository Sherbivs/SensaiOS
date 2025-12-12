package com.infinitygauntlet.simulation

import android.content.Intent
import android.os.Bundle
import android.view.MenuItem
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import com.google.android.material.snackbar.Snackbar
import com.infinitygauntlet.simulation.presentation.report.ReportViewModel
import com.infinitygauntlet.simulation.presentation.report.ReportFormat
import kotlinx.coroutines.launch

/**
 * Report Viewer Activity - Displays test results in HTML/JSON/text format
 * Supports WebView for HTML reports and TextView for other formats
 */
class ReportViewerActivity : AppCompatActivity() {
    
    private lateinit var viewModel: ReportViewModel
    private var currentFormat: ReportFormat = ReportFormat.HTML
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_report)
        
        // Setup toolbar
        setSupportActionBar(findViewById(R.id.toolbar))
        supportActionBar?.apply {
            title = "Test Reports"
            setDisplayHomeAsUpEnabled(true)
        }
        
        // Initialize ViewModel
        viewModel = ViewModelProvider(this)[ReportViewModel::class.java]
        
        // Setup views
        setupWebView()
        setupButtons()
        
        // Observe report data
        observeReports()
        
        // Check for passed result ID
        val resultId = intent.getLongExtra("RESULT_ID", -1L)
        if (resultId != -1L) {
            viewModel.loadReport(resultId)
        } else {
            viewModel.loadLatestReport()
        }
    }
    
    private fun setupWebView() {
        findViewById<WebView>(R.id.webView).apply {
            webViewClient = WebViewClient()
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                loadWithOverviewMode = true
                useWideViewPort = true
                builtInZoomControls = true
                displayZoomControls = false
            }
        }
    }
    
    private fun setupButtons() {
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnHtml).setOnClickListener {
            switchFormat(ReportFormat.HTML)
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnJson).setOnClickListener {
            switchFormat(ReportFormat.JSON)
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnText).setOnClickListener {
            switchFormat(ReportFormat.TEXT)
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.shareButton).setOnClickListener {
            shareReport()
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.exportButton).setOnClickListener {
            exportReport()
        }
    }
    
    private fun observeReports() {
        // Observe UI state using StateFlow with proper lifecycle awareness
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.uiState.collect { state ->
                    // Update loading indicator
                    findViewById<android.widget.ProgressBar>(R.id.progressBar).visibility =
                        if (state.isLoading || state.isGenerating) View.VISIBLE else View.GONE
                    
                    // Show error if present
                    if (state.error != null) {
                        Snackbar.make(
                            findViewById(android.R.id.content),
                            state.error,
                            Snackbar.LENGTH_LONG
                        ).show()
                        viewModel.clearError()
                    }
                    
                    // Update report display based on current format
                    when (state.currentFormat) {
                        ReportFormat.HTML -> state.htmlReport?.let { showWebView(it) }
                        ReportFormat.JSON -> state.jsonReport?.let { showTextView(it) }
                        ReportFormat.TEXT -> state.textReport?.let { showTextView(it) }
                    }
                    
                    // Update format buttons
                    updateFormatButtons(state.currentFormat)
                }
            }
        }
    }
    
    private fun switchFormat(format: ReportFormat) {
        currentFormat = format
        viewModel.switchFormat(format)
    }
    
    private fun updateFormatButtons(format: ReportFormat) {
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnHtml).apply {
            isEnabled = format != ReportFormat.HTML
        }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnJson).apply {
            isEnabled = format != ReportFormat.JSON
        }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnText).apply {
            isEnabled = format != ReportFormat.TEXT
        }
    }
    
    private fun showWebView(html: String) {
        findViewById<WebView>(R.id.webView).apply {
            visibility = View.VISIBLE
            loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        }
        findViewById<TextView>(R.id.textView).visibility = View.GONE
    }
    
    private fun showTextView(text: String) {
        findViewById<TextView>(R.id.textView).apply {
            visibility = View.VISIBLE
            setText(text)
        }
        findViewById<WebView>(R.id.webView).visibility = View.GONE
    }
    
    private fun shareReport() {
        val state = viewModel.uiState.value
        val content = state.currentReportContent
        
        if (content != null) {
            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, "Simulation Test Report")
                putExtra(Intent.EXTRA_TEXT, content)
            }
            startActivity(Intent.createChooser(shareIntent, "Share Report"))
        } else {
            Snackbar.make(
                findViewById(android.R.id.content),
                "No report available to share",
                Snackbar.LENGTH_SHORT
            ).show()
        }
    }
    
    private fun exportReport() {
        // TODO: Implement file export
        Snackbar.make(
            findViewById(android.R.id.content),
            "Export feature coming soon",
            Snackbar.LENGTH_SHORT
        ).show()
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                finish()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}
