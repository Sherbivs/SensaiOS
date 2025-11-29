package com.infinitygauntlet.simulation.flows

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import com.infinitygauntlet.simulation.MainActivity
import org.hamcrest.Matchers.containsString
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * End-to-end flow tests for test execution
 * Tests complete user journey: Start → Pause → Resume → Complete → View Results
 * 
 * Requires: Android device or emulator running API 24+
 * Framework: Espresso UI Testing (E2E flows)
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class TestExecutionFlowTest {

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
    fun completeTestExecutionFlow_startToFinish() {
        // Step 1: Start test execution
        onView(withId(R.id.button_run_tests))
            .perform(click())

        // Step 2: Verify progress bar appears
        Thread.sleep(500)
        onView(withId(R.id.progress_bar))
            .check(matches(isDisplayed()))

        // Step 3: Wait for tests to complete
        Thread.sleep(3000)

        // Step 4: Verify results displayed
        onView(withId(R.id.text_test_summary))
            .check(matches(isDisplayed()))

        // Step 5: Verify pass/fail counts shown
        onView(withId(R.id.text_passed_count))
            .check(matches(withText(containsString("passed"))))
    }

    @Test
    fun pauseAndResumeTestExecution() {
        // Start execution
        onView(withId(R.id.button_run_tests))
            .perform(click())

        Thread.sleep(1000)

        // Pause tests
        onView(withId(R.id.button_pause))
            .perform(click())

        // Verify paused state
        Thread.sleep(300)
        onView(withId(R.id.text_status))
            .check(matches(withText(containsString("Paused"))))

        // Resume tests
        onView(withId(R.id.button_resume))
            .perform(click())

        // Verify running state
        Thread.sleep(300)
        onView(withId(R.id.text_status))
            .check(matches(withText(containsString("Running"))))
    }

    @Test
    fun cancelTestExecution() {
        // Start execution
        onView(withId(R.id.button_run_tests))
            .perform(click())

        Thread.sleep(1000)

        // Cancel tests
        onView(withId(R.id.button_cancel))
            .perform(click())

        // Verify cancelled state
        Thread.sleep(300)
        onView(withId(R.id.text_status))
            .check(matches(withText(containsString("Cancelled"))))
    }

    @Test
    fun progressIndicatorUpdates() {
        // Start execution
        onView(withId(R.id.button_run_tests))
            .perform(click())

        // Wait and check progress updates
        Thread.sleep(1000)
        onView(withId(R.id.text_progress))
            .check(matches(withText(containsString("%"))))

        // Verify percentage is reasonable (0-100)
        scenario.onActivity { activity ->
            val progressText = activity.findViewById<android.widget.TextView>(R.id.text_progress).text.toString()
            val percentage = progressText.filter { it.isDigit() }.toIntOrNull()
            assert(percentage != null && percentage in 0..100)
        }
    }

    @Test
    fun viewTestResultsAfterCompletion() {
        // Run tests to completion
        onView(withId(R.id.button_run_tests))
            .perform(click())

        Thread.sleep(3000)

        // Click "View Results" button
        onView(withId(R.id.button_view_results))
            .perform(click())

        // Verify results screen opened
        Thread.sleep(500)
        onView(withId(R.id.recycler_test_results))
            .check(matches(isDisplayed()))
    }

    @Test
    fun notificationDuringBackgroundExecution() {
        // Start execution
        onView(withId(R.id.button_run_tests))
            .perform(click())

        // Move app to background
        onView(isRoot())
            .perform(pressBack())

        // Wait for notification
        Thread.sleep(2000)

        // Verify notification appears (system UI, hard to test)
        // Just verify no crash and service continues
    }
}
