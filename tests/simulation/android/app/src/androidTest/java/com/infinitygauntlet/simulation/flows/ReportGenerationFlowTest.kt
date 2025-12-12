package com.infinitygauntlet.simulation.flows

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.espresso.web.assertion.WebViewAssertions.webMatches
import androidx.test.espresso.web.sugar.Web.onWebView
import androidx.test.espresso.web.webdriver.DriverAtoms.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import com.infinitygauntlet.simulation.MainActivity
import org.hamcrest.Matchers.containsString
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * End-to-end flow tests for report generation
 * Tests complete report lifecycle: Test completion → Generation → Viewing → Export → Sharing
 * 
 * Requires: Android device or emulator running API 24+
 * Framework: Espresso UI Testing (E2E flows)
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class ReportGenerationFlowTest {

    private lateinit var scenario: ActivityScenario<MainActivity>

    @Before
    fun setup() {
        scenario = ActivityScenario.launch(MainActivity::class.java)
    }

    @After
    fun tearDown() {
        scenario.close()
    }

    @Test
    fun completeReportGenerationFlow() {
        // Step 1: Run tests
        onView(withId(R.id.button_run_tests))
            .perform(click())

        // Wait for completion
        Thread.sleep(3000)

        // Step 2: Click "Generate Report"
        onView(withId(R.id.button_generate_report))
            .perform(click())

        // Wait for report generation
        Thread.sleep(1000)

        // Step 3: Verify report viewer opened
        onView(withId(R.id.webview_report))
            .check(matches(isDisplayed()))

        // Step 4: Verify HTML report loaded
        Thread.sleep(500)
        onWebView(withId(R.id.webview_report))
            .check(webMatches(getText(), containsString("Test Report")))
    }

    @Test
    fun formatSwitchingWorkflow() {
        // Generate initial report (HTML)
        onView(withId(R.id.button_run_tests))
            .perform(click())
        Thread.sleep(3000)

        onView(withId(R.id.button_generate_report))
            .perform(click())
        Thread.sleep(1000)

        // Switch to JSON format
        onView(withId(R.id.button_format_json))
            .perform(click())
        Thread.sleep(500)

        // Verify JSON displayed
        onWebView(withId(R.id.webview_report))
            .check(webMatches(getText(), containsString("{")))

        // Switch to CSV format
        onView(withId(R.id.button_format_csv))
            .perform(click())
        Thread.sleep(500)

        // Verify CSV displayed
        onWebView(withId(R.id.webview_report))
            .check(webMatches(getText(), containsString(",")))

        // Switch back to HTML
        onView(withId(R.id.button_format_html))
            .perform(click())
        Thread.sleep(500)
    }

    @Test
    fun exportAndShareWorkflow() {
        // Generate report
        onView(withId(R.id.button_run_tests))
            .perform(click())
        Thread.sleep(3000)

        onView(withId(R.id.button_generate_report))
            .perform(click())
        Thread.sleep(1000)

        // Export report to file
        onView(withId(R.id.button_export))
            .perform(click())

        // Wait for file operation
        Thread.sleep(1000)

        // Verify success message
        onView(withText(containsString("exported")))
            .check(matches(isDisplayed()))

        // Share report
        onView(withId(R.id.button_share))
            .perform(click())

        // Wait for share dialog (system UI)
        Thread.sleep(500)
    }

    @Test
    fun viewPreviousReportsFlow() {
        // Open reports menu
        onView(withContentDescription("More options"))
            .perform(click())

        onView(withText("View Reports"))
            .perform(click())

        // Wait for reports list
        Thread.sleep(500)

        // Verify reports list displayed
        onView(withId(R.id.recycler_reports))
            .check(matches(isDisplayed()))

        // Click first report
        onView(withId(R.id.recycler_reports))
            .perform(click())

        // Verify report opened
        Thread.sleep(500)
        onView(withId(R.id.webview_report))
            .check(matches(isDisplayed()))
    }

    @Test
    fun deleteReportWorkflow() {
        // Navigate to reports list
        onView(withContentDescription("More options"))
            .perform(click())

        onView(withText("View Reports"))
            .perform(click())

        Thread.sleep(500)

        // Long-press first report to select
        onView(withId(R.id.recycler_reports))
            .perform(longClick())

        // Click delete button
        onView(withId(R.id.button_delete))
            .perform(click())

        // Confirm deletion
        onView(withText("Delete"))
            .perform(click())

        // Verify report removed
        Thread.sleep(300)
    }
}
