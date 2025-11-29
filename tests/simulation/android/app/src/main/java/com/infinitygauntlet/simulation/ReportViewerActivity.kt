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
import com.google.android.material.snackbar.Snackbar
import com.infinitygauntlet.simulation.viewmodels.ReportViewModel

/**
 * Report Viewer Activity - Displays test results in HTML/JSON/text format
 * Supports WebView for HTML reports and TextView for other formats
 */
class ReportViewerActivity : AppCompatActivity() {
    
    private lateinit var viewModel: ReportViewModel
    private var currentFormat: String = "html"
    
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
        
        // Check for passed result
        val resultJson = intent.getStringExtra("RESULT_JSON")
        if (resultJson != null) {
            viewModel.loadResultFromJson(resultJson)
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
            switchFormat("html")
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnJson).setOnClickListener {
            switchFormat("json")
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnText).setOnClickListener {
            switchFormat("text")
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.shareButton).setOnClickListener {
            shareReport()
        }
        
        findViewById<com.google.android.material.button.MaterialButton>(R.id.exportButton).setOnClickListener {
            exportReport()
        }
    }
    
    private fun observeReports() {
        viewModel.htmlReport.observe(this) { html ->
            if (currentFormat == "html" && html != null) {
                showWebView(html)
            }
        }
        
        viewModel.jsonReport.observe(this) { json ->
            if (currentFormat == "json" && json != null) {
                showTextView(json)
            }
        }
        
        viewModel.textReport.observe(this) { text ->
            if (currentFormat == "text" && text != null) {
                showTextView(text)
            }
        }
        
        viewModel.isLoading.observe(this) { isLoading ->
            findViewById<android.widget.ProgressBar>(R.id.progressBar).visibility =
                if (isLoading) View.VISIBLE else View.GONE
        }
        
        viewModel.errorMessage.observe(this) { error ->
            if (error != null) {
                Snackbar.make(
                    findViewById(android.R.id.content),
                    error,
                    Snackbar.LENGTH_LONG
                ).show()
            }
        }
    }
    
    private fun switchFormat(format: String) {
        currentFormat = format
        updateFormatButtons(format)
        
        when (format) {
            "html" -> viewModel.generateHtmlReport()
            "json" -> viewModel.generateJsonReport()
            "text" -> viewModel.generateTextReport()
        }
    }
    
    private fun updateFormatButtons(format: String) {
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnHtml).apply {
            isEnabled = format != "html"
        }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnJson).apply {
            isEnabled = format != "json"
        }
        findViewById<com.google.android.material.button.MaterialButton>(R.id.btnText).apply {
            isEnabled = format != "text"
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
        val content = when (currentFormat) {
            "html" -> viewModel.htmlReport.value
            "json" -> viewModel.jsonReport.value
            "text" -> viewModel.textReport.value
            else -> null
        }
        
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
