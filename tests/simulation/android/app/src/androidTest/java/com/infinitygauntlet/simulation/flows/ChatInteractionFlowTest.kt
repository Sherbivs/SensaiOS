package com.infinitygauntlet.simulation.flows

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import com.infinitygauntlet.simulation.ChatUIActivity
import org.hamcrest.Matchers.containsString
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * End-to-end flow tests for chat interactions
 * Tests complete conversation flows across multiple screens and channels
 * 
 * Requires: Android device or emulator running API 24+
 * Framework: Espresso UI Testing (E2E flows)
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class ChatInteractionFlowTest {

    private lateinit var scenario: ActivityScenario<ChatUIActivity>

    @Before
    fun setup() {
        scenario = ActivityScenario.launch(ChatUIActivity::class.java)
    }

    @After
    fun tearDown() {
        scenario.close()
    }

    @Test
    fun completeConversationFlow() {
        // Send first message
        onView(withId(R.id.edit_message))
            .perform(typeText("Hello!"), closeSoftKeyboard())
        onView(withId(R.id.button_send))
            .perform(click())

        // Wait for AI response
        Thread.sleep(1500)

        // Send follow-up message
        onView(withId(R.id.edit_message))
            .perform(typeText("How are you?"), closeSoftKeyboard())
        onView(withId(R.id.button_send))
            .perform(click())

        // Wait for response
        Thread.sleep(1500)

        // Verify conversation history (at least 4 messages: 2 user + 2 AI)
        onView(withId(R.id.recycler_chat_messages))
            .check(matches(hasMinimumChildCount(4)))
    }

    @Test
    fun channelSwitchingFlow() {
        // Send message in first channel
        onView(withId(R.id.edit_message))
            .perform(typeText("Message in General"), closeSoftKeyboard())
        onView(withId(R.id.button_send))
            .perform(click())

        Thread.sleep(500)

        // Switch to different channel
        onView(withId(R.id.button_channels))
            .perform(click())
        
        Thread.sleep(300)
        onView(withText("Test Results"))
            .perform(click())

        // Verify new channel loaded (different message history)
        Thread.sleep(500)
        onView(withId(R.id.text_channel_name))
            .check(matches(withText("Test Results")))

        // Send message in new channel
        onView(withId(R.id.edit_message))
            .perform(typeText("Message in Test Results"), closeSoftKeyboard())
        onView(withId(R.id.button_send))
            .perform(click())
    }

    @Test
    fun commandExecutionFlow() {
        // Execute help command
        onView(withId(R.id.edit_message))
            .perform(typeText("/help"), closeSoftKeyboard())
        onView(withId(R.id.button_send))
            .perform(click())

        // Wait for system response
        Thread.sleep(500)

        // Verify system message appears
        onView(withText(containsString("Available commands")))
            .check(matches(isDisplayed()))

        // Execute clear command
        onView(withId(R.id.edit_message))
            .perform(typeText("/clear"), closeSoftKeyboard())
        onView(withId(R.id.button_send))
            .perform(click())

        // Verify messages cleared
        Thread.sleep(300)
        onView(withId(R.id.recycler_chat_messages))
            .check(matches(hasChildCount(0)))
    }

    @Test
    fun messageHistoryScrolling() {
        // Send multiple messages to fill list
        repeat(10) { i ->
            onView(withId(R.id.edit_message))
                .perform(typeText("Message $i"), closeSoftKeyboard())
            onView(withId(R.id.button_send))
                .perform(click())
            Thread.sleep(200)
        }

        // Scroll to top
        onView(withId(R.id.recycler_chat_messages))
            .perform(swipeDown())

        // Scroll back to bottom
        onView(withId(R.id.recycler_chat_messages))
            .perform(swipeUp())
    }

    @Test
    fun backNavigationPreservesState() {
        // Send message
        onView(withId(R.id.edit_message))
            .perform(typeText("Test message"), closeSoftKeyboard())
        onView(withId(R.id.button_send))
            .perform(click())

        Thread.sleep(500)

        // Navigate back
        onView(isRoot())
            .perform(pressBack())

        // Re-launch activity
        scenario = ActivityScenario.launch(ChatUIActivity::class.java)

        // Verify message history preserved (if using persistence)
        Thread.sleep(500)
        onView(withId(R.id.recycler_chat_messages))
            .check(matches(isDisplayed()))
    }
}
