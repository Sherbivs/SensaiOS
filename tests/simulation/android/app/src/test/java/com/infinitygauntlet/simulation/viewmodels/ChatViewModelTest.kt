package com.infinitygauntlet.simulation.viewmodels

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.infinitygauntlet.simulation.models.*
import com.infinitygauntlet.simulation.repositories.ChatRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.*
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.*
import org.mockito.MockitoAnnotations

/**
 * Unit tests for ChatViewModel
 * Tests message sending, AI responses, channel management, and chat history.
 */
@ExperimentalCoroutinesApi
class ChatViewModelTest {

    @get:Rule
    val instantExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()

    @Mock
    private lateinit var mockRepository: ChatRepository

    private lateinit var viewModel: ChatViewModel

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        Dispatchers.setMain(testDispatcher)
        
        // Mock repository responses
        `when`(mockRepository.getChannels()).thenReturn(createSampleChannels())
        
        viewModel = ChatViewModel(mockRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `initial state should be correct`() = runTest {
        // When
        val messages = viewModel.messages.first()
        val isTyping = viewModel.isAITyping.first()
        val currentChannel = viewModel.currentChannel.first()

        // Then
        assertTrue(messages.isEmpty())
        assertFalse(isTyping)
        assertNull(currentChannel)
    }

    @Test
    fun `sendMessage should add user message`() = runTest {
        // Given
        val messageText = "Hello, AI!"

        // When
        viewModel.sendMessage(messageText)
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertTrue(messages.isNotEmpty())
        
        val lastMessage = messages.last()
        assertEquals(messageText, lastMessage.content)
        assertEquals(MessageType.USER, lastMessage.type)
    }

    @Test
    fun `sendMessage should trigger AI response`() = runTest {
        // Given
        `when`(mockRepository.getAIResponse(anyString())).thenReturn("AI response")

        // When
        viewModel.sendMessage("Test message")
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertTrue(messages.size >= 2) // User message + AI response
        
        val aiMessage = messages.find { it.type == MessageType.ASSISTANT }
        assertNotNull(aiMessage)
        assertEquals("AI response", aiMessage?.content)
    }

    @Test
    fun `sendMessage should set isTyping during AI response`() = runTest {
        // Given
        `when`(mockRepository.getAIResponse(anyString())).thenAnswer {
            Thread.sleep(100) // Simulate delay
            "AI response"
        }

        // When
        viewModel.sendMessage("Test message")
        advanceTimeBy(50) // Check midway

        // Then
        val isTyping = viewModel.isAITyping.first()
        assertTrue(isTyping)
    }

    @Test
    fun `sendMessage should clear isTyping after response`() = runTest {
        // Given
        `when`(mockRepository.getAIResponse(anyString())).thenReturn("AI response")

        // When
        viewModel.sendMessage("Test message")
        advanceUntilIdle()

        // Then
        val isTyping = viewModel.isAITyping.first()
        assertFalse(isTyping)
    }

    @Test
    fun `sendMessage should handle empty messages`() = runTest {
        // When
        viewModel.sendMessage("")
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertTrue(messages.isEmpty()) // Should not add empty message
    }

    @Test
    fun `sendMessage should trim whitespace`() = runTest {
        // When
        viewModel.sendMessage("  Test message  ")
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertEquals("Test message", messages.last().content)
    }

    @Test
    fun `loadChannels should populate channels list`() = runTest {
        // When
        viewModel.loadChannels()
        advanceUntilIdle()

        // Then
        val channels = viewModel.channels.first()
        assertTrue(channels.isNotEmpty())
        verify(mockRepository, times(2)).getChannels() // Initial + manual load
    }

    @Test
    fun `selectChannel should update current channel`() = runTest {
        // Given
        viewModel.loadChannels()
        advanceUntilIdle()
        val channels = viewModel.channels.first()
        val targetChannel = channels.first()

        // When
        viewModel.selectChannel(targetChannel)
        advanceUntilIdle()

        // Then
        val currentChannel = viewModel.currentChannel.first()
        assertEquals(targetChannel.id, currentChannel?.id)
    }

    @Test
    fun `selectChannel should load channel messages`() = runTest {
        // Given
        val channel = createSampleChannels().first()
        `when`(mockRepository.getChannelMessages(channel.id)).thenReturn(createSampleMessages())

        // When
        viewModel.selectChannel(channel)
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertTrue(messages.isNotEmpty())
        verify(mockRepository).getChannelMessages(channel.id)
    }

    @Test
    fun `clearMessages should empty message list`() = runTest {
        // Given
        viewModel.sendMessage("Test message")
        advanceUntilIdle()

        // When
        viewModel.clearMessages()
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertTrue(messages.isEmpty())
    }

    @Test
    fun `getMessageCount should return correct count`() = runTest {
        // Given
        viewModel.sendMessage("Message 1")
        viewModel.sendMessage("Message 2")
        viewModel.sendMessage("Message 3")
        advanceUntilIdle()

        // When
        val count = viewModel.getMessageCount()

        // Then
        assertTrue(count >= 3) // At least 3 user messages
    }

    @Test
    fun `exportChat should generate text export`() = runTest {
        // Given
        viewModel.sendMessage("User: Hello")
        `when`(mockRepository.getAIResponse(anyString())).thenReturn("AI: Hi there!")
        advanceUntilIdle()

        // When
        val export = viewModel.exportChat()

        // Then
        assertNotNull(export)
        assertTrue(export.contains("User:"))
        assertTrue(export.contains("Hello"))
    }

    @Test
    fun `sendCommand should handle special commands`() = runTest {
        // When
        viewModel.sendCommand("/help")
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        val systemMessage = messages.find { it.type == MessageType.SYSTEM }
        assertNotNull(systemMessage)
    }

    @Test
    fun `sendCommand should handle clear command`() = runTest {
        // Given
        viewModel.sendMessage("Test message")
        advanceUntilIdle()

        // When
        viewModel.sendCommand("/clear")
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertTrue(messages.isEmpty())
    }

    @Test
    fun `error handling should update error state`() = runTest {
        // Given
        `when`(mockRepository.getAIResponse(anyString())).thenThrow(RuntimeException("API error"))

        // When
        viewModel.sendMessage("Test message")
        advanceUntilIdle()

        // Then
        val errorState = viewModel.error.first()
        assertNotNull(errorState)
        assertTrue(errorState?.contains("error", ignoreCase = true) ?: false)
    }

    @Test
    fun `concurrent messages should be handled correctly`() = runTest {
        // Given
        `when`(mockRepository.getAIResponse(anyString())).thenReturn("AI response")

        // When
        viewModel.sendMessage("Message 1")
        viewModel.sendMessage("Message 2")
        viewModel.sendMessage("Message 3")
        advanceUntilIdle()

        // Then
        val messages = viewModel.messages.first()
        assertTrue(messages.size >= 3)
    }

    @Test
    fun `searchMessages should filter by content`() = runTest {
        // Given
        viewModel.sendMessage("Hello world")
        viewModel.sendMessage("Test message")
        viewModel.sendMessage("Another hello")
        advanceUntilIdle()

        // When
        viewModel.searchMessages("hello")
        advanceUntilIdle()

        // Then
        val filtered = viewModel.filteredMessages.first()
        assertTrue(filtered.all { it.content.contains("hello", ignoreCase = true) })
    }

    @Test
    fun `getRecentMessages should return last N messages`() = runTest {
        // Given
        repeat(10) { viewModel.sendMessage("Message $it") }
        advanceUntilIdle()

        // When
        val recent = viewModel.getRecentMessages(5)

        // Then
        assertEquals(5, recent.size)
    }

    // Helper methods

    private fun createSampleChannels(): List<Channel> {
        return listOf(
            Channel(
                id = "channel-001",
                name = "General",
                description = "General discussion",
                type = ChannelType.TEXT,
                memberCount = 100
            ),
            Channel(
                id = "channel-002",
                name = "Test Results",
                description = "Test execution results",
                type = ChannelType.TEXT,
                memberCount = 50
            ),
            Channel(
                id = "channel-003",
                name = "AI Chat",
                description = "Chat with AI assistant",
                type = ChannelType.TEXT,
                memberCount = 25
            )
        )
    }

    private fun createSampleMessages(): List<ChatMessage> {
        val now = System.currentTimeMillis()
        return listOf(
            ChatMessage(
                id = "msg-001",
                content = "Hello!",
                type = MessageType.USER,
                authorName = "User",
                authorAvatar = null,
                timestamp = now - 5000,
                channelId = "channel-001"
            ),
            ChatMessage(
                id = "msg-002",
                content = "Hi there! How can I help?",
                type = MessageType.ASSISTANT,
                authorName = "AI Assistant",
                authorAvatar = null,
                timestamp = now - 3000,
                channelId = "channel-001"
            )
        )
    }
}
