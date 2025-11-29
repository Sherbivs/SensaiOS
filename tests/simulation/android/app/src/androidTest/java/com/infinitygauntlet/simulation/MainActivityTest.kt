package com.infinitygauntlet.simulation

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.contrib.RecyclerViewActions
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import androidx.recyclerview.widget.RecyclerView
import com.infinitygauntlet.simulation.adapters.TestScenarioAdapter
import org.hamcrest.Matchers.allOf
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented tests for MainActivity
 * Tests navigation, UI interactions, test execution, results viewing, and menu operations.
 * 
 * Requires: Android device or emulator running API 24+
 * Framework: Espresso UI Testing
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class MainActivityTest {

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
    fun mainActivity_displaysToolbarTitle() {
        // Verify toolbar shows app name
        onView(withText("Pokémon Battle Simulator"))
            .check(matches(isDisplayed()))
    }

    @Test
    fun mainActivity_displaysTestScenarioList() {
        // Verify RecyclerView is visible
        onView(withId(R.id.recycler_test_scenarios))
            .check(matches(isDisplayed()))
    }

    @Test
    fun mainActivity_scenarioListHasItems() {
        // Verify at least one scenario is displayed
        onView(withId(R.id.recycler_test_scenarios))
            .check(matches(hasMinimumChildCount(1)))
    }

    @Test
    fun mainActivity_clickScenarioShowsDetails() {
        // Click first scenario in list
        onView(withId(R.id.recycler_test_scenarios))
            .perform(RecyclerViewActions.actionOnItemAtPosition<TestScenarioAdapter.ViewHolder>(0, click()))

        // Wait for details to appear (bottom sheet or dialog)
        Thread.sleep(500)

        // Verify scenario details are displayed
        onView(withId(R.id.text_scenario_name))
            .check(matches(isDisplayed()))
    }

    @Test
    fun mainActivity_runTestButtonIsVisible() {
        // Verify run button exists
        onView(withId(R.id.button_run_tests))
            .check(matches(isDisplayed()))
    }

    @Test
    fun mainActivity_runTestButtonStartsExecution() {
        // Click run button
        onView(withId(R.id.button_run_tests))
            .perform(click())

        // Wait for execution to start
        Thread.sleep(1000)

        // Verify progress indicator appears
        onView(withId(R.id.progress_bar))
            .check(matches(isDisplayed()))
    }

    @Test
    fun mainActivity_navigateToChatActivity() {
        // Open menu
        onView(withContentDescription("More options"))
            .perform(click())

        // Click "Chat" menu item
        onView(withText("Chat"))
            .perform(click())

        // Verify ChatUIActivity opened (check for chat-specific view)
        Thread.sleep(500)
        onView(withId(R.id.edit_message))
            .check(matches(isDisplayed()))
    }

    @Test
    fun mainActivity_navigateToReportViewer() {
        // Open menu
        onView(withContentDescription("More options"))
            .perform(click())

        // Click "Reports" menu item
        onView(withText("Reports"))
            .perform(click())

        // Verify ReportViewerActivity opened
        Thread.sleep(500)
        onView(withId(R.id.webview_report))
            .check(matches(isDisplayed()))
    }

    @Test
    fun mainActivity_filterByCategory() {
        // Open filter menu
        onView(withId(R.id.button_filter))
            .perform(click())

        // Select "Battle" category
        onView(withText("Battle"))
            .perform(click())

        // Verify list updates (check RecyclerView has items)
        Thread.sleep(500)
        onView(withId(R.id.recycler_test_scenarios))
            .check(matches(hasMinimumChildCount(1)))
    }

    @Test
    fun mainActivity_searchScenarios() {
        // Click search icon
        onView(withId(R.id.action_search))
            .perform(click())

        // Type search query
        onView(withId(R.id.search_src_text))
            .perform(typeText("battle"), closeSoftKeyboard())

        // Wait for filter
        Thread.sleep(300)

        // Verify filtered results displayed
        onView(withId(R.id.recycler_test_scenarios))
            .check(matches(isDisplayed()))
    }
}
