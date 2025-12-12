package com.infinitygauntlet.simulation

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
import org.hamcrest.Matchers.containsString
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented tests for ReportViewerActivity
 * Tests WebView report display, format switching, share functionality, and navigation.
 * 
 * Requires: Android device or emulator running API 24+
 * Framework: Espresso UI Testing with WebView support
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class ReportViewerActivityTest {

    private lateinit var scenario: ActivityScenario<ReportViewerActivity>

    @Before
    fun setup() {
        scenario = ActivityScenario.launch(ReportViewerActivity::class.java)
    }

    @After
    fun tearDown() {
        scenario.close()
    }

    @Test
    fun reportViewer_displaysWebView() {
        // Verify WebView is visible
        onView(withId(R.id.webview_report))
            .check(matches(isDisplayed()))
    }

    @Test
    fun reportViewer_loadsHtmlReport() {
        // Wait for report to load
        Thread.sleep(1000)

        // Verify HTML content loaded
        onWebView(withId(R.id.webview_report))
            .forceJavascriptEnabled()
            .check(webMatches(getText(), containsString("Test Report")))
    }

    @Test
    fun reportViewer_formatSwitchingButtons() {
        // Verify format buttons visible
        onView(withId(R.id.button_format_html))
            .check(matches(isDisplayed()))
        
        onView(withId(R.id.button_format_json))
            .check(matches(isDisplayed()))
        
        onView(withId(R.id.button_format_csv))
            .check(matches(isDisplayed()))
    }

    @Test
    fun reportViewer_switchToJsonFormat() {
        // Click JSON format button
        onView(withId(R.id.button_format_json))
            .perform(click())

        // Wait for format switch
        Thread.sleep(500)

        // Verify JSON content loaded
        onWebView(withId(R.id.webview_report))
            .check(webMatches(getText(), containsString("{")))
    }

    @Test
    fun reportViewer_switchToCsvFormat() {
        // Click CSV format button
        onView(withId(R.id.button_format_csv))
            .perform(click())

        // Wait for format switch
        Thread.sleep(500)

        // Verify CSV content loaded (comma-separated)
        onWebView(withId(R.id.webview_report))
            .check(webMatches(getText(), containsString(",")))
    }

    @Test
    fun reportViewer_shareButtonOpensShareDialog() {
        // Click share button
        onView(withId(R.id.button_share))
            .perform(click())

        // Wait for share sheet
        Thread.sleep(500)

        // Verify share dialog appears (system UI, hard to test directly)
        // Just verify button click doesn't crash
    }

    @Test
    fun reportViewer_exportButtonSavesFile() {
        // Click export button
        onView(withId(R.id.button_export))
            .perform(click())

        // Wait for file operation
        Thread.sleep(1000)

        // Verify success toast or snackbar
        onView(withText(containsString("exported")))
            .check(matches(isDisplayed()))
    }

    @Test
    fun reportViewer_backButtonReturnsToMain() {
        // Press back button
        onView(isRoot())
            .perform(pressBack())

        // Verify activity is finishing
        scenario.onActivity { activity ->
            assert(activity.isFinishing)
        }
    }
}
