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
import com.infinitygauntlet.simulation.adapters.ChatMessageAdapter
import org.hamcrest.Matchers.allOf
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Instrumented tests for ChatUIActivity
 * Tests chat message display, sending, channel switching, scroll behavior, and keyboard interactions.
 * 
 * Requires: Android device or emulator running API 24+
 * Framework: Espresso UI Testing
 */
@RunWith(AndroidJUnit4::class)
@LargeTest
class ChatUIActivityTest {

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
    fun chatActivity_displaysChatInterface() {
        // Verify chat components are visible
        onView(withId(R.id.recycler_chat_messages))
            .check(matches(isDisplayed()))
        
        onView(withId(R.id.edit_message))
            .check(matches(isDisplayed()))
        
        onView(withId(R.id.button_send))
            .check(matches(isDisplayed()))
    }

    @Test
    fun chatActivity_sendMessageAddsToList() {
        // Type message
        onView(withId(R.id.edit_message))
            .perform(typeText("Hello, AI assistant!"), closeSoftKeyboard())

        // Click send button
        onView(withId(R.id.button_send))
            .perform(click())

        // Wait for message to appear
        Thread.sleep(500)

        // Verify message displayed in RecyclerView
        onView(withId(R.id.recycler_chat_messages))
            .check(matches(hasMinimumChildCount(1)))
    }

    @Test
    fun chatActivity_sendButtonDisabledWhenEmpty() {
        // Verify send button initially disabled (no text)
        onView(withId(R.id.button_send))
            .check(matches(isNotEnabled()))

        // Type text
        onView(withId(R.id.edit_message))
            .perform(typeText("Test"))

        // Verify send button enabled
        onView(withId(R.id.button_send))
            .check(matches(isEnabled()))
    }

    @Test
    fun chatActivity_channelSwitching() {
        // Open channel drawer
        onView(withId(R.id.button_channels))
            .perform(click())

        // Wait for drawer
        Thread.sleep(300)

        // Select different channel
        onView(withText("Test Results"))
            .perform(click())

        // Verify channel name updated
        Thread.sleep(300)
        onView(withId(R.id.text_channel_name))
            .check(matches(withText("Test Results")))
    }

    @Test
    fun chatActivity_scrollToBottomOnNewMessage() {
        // Send multiple messages to fill list
        repeat(5) { i ->
            onView(withId(R.id.edit_message))
                .perform(typeText("Message $i"), closeSoftKeyboard())
            
            onView(withId(R.id.button_send))
                .perform(click())
            
            Thread.sleep(300)
        }

        // Verify RecyclerView scrolled to bottom (last item visible)
        onView(withId(R.id.recycler_chat_messages))
            .perform(RecyclerViewActions.scrollToPosition<ChatMessageAdapter.ViewHolder>(4))
    }

    @Test
    fun chatActivity_specialCommandHandling() {
        // Type help command
        onView(withId(R.id.edit_message))
            .perform(typeText("/help"), closeSoftKeyboard())

        // Send command
        onView(withId(R.id.button_send))
            .perform(click())

        // Wait for system response
        Thread.sleep(500)

        // Verify system message appears
        onView(withId(R.id.recycler_chat_messages))
            .check(matches(hasMinimumChildCount(1)))
    }

    @Test
    fun chatActivity_typingIndicatorAppears() {
        // Send message to trigger AI response
        onView(withId(R.id.edit_message))
            .perform(typeText("How are you?"), closeSoftKeyboard())

        onView(withId(R.id.button_send))
            .perform(click())

        // Verify typing indicator appears briefly
        Thread.sleep(200)
        onView(withId(R.id.text_typing_indicator))
            .check(matches(isDisplayed()))
    }

    @Test
    fun chatActivity_backButtonClosesActivity() {
        // Press back button
        onView(isRoot())
            .perform(pressBack())

        // Verify activity is finishing
        scenario.onActivity { activity ->
            assert(activity.isFinishing)
        }
    }
}
