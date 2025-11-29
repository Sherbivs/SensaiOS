package com.infinitygauntlet.simulation.presentation.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infinitygauntlet.simulation.domain.models.AuthorType
import com.infinitygauntlet.simulation.domain.models.ChatMessage
import com.infinitygauntlet.simulation.domain.models.MessageType
import com.infinitygauntlet.simulation.domain.repository.ChannelRepository
import com.infinitygauntlet.simulation.domain.repository.ChatRepository
import com.infinitygauntlet.simulation.database.DatabaseCommandHandler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.time.Instant
import javax.inject.Inject

/**
 * ViewModel for ChatUIActivity - Discord-like Chat Screen
 * 
 * MIGRATED TO:
 * - Hilt dependency injection
 * - Repository pattern (no direct DAO access)
 * - MVI architecture (UiState + UiEvent)
 * - StateFlow (instead of LiveData)
 * - Database persistence (via repositories)
 * - Database command integration (/db commands)
 * 
 * Features:
 * - Load channels and messages from database
 * - Switch between channels
 * - Send user messages
 * - Simulate bot responses
 * - Typing indicators
 * - Message reactions
 * - Unread message tracking
 * - Message editing
 * - Database queries via /db commands
 */
@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val channelRepository: ChannelRepository
) : ViewModel() {
    
    // UI State - Single source of truth for chat screen
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()
    
    // One-time events for UI (toasts, scrolling, animations)
    private val _events = MutableSharedFlow<ChatUiEvent>()
    val events: SharedFlow<ChatUiEvent> = _events.asSharedFlow()
    
    // Current channel ID for filtering messages
    private val _currentChannelId = MutableStateFlow<Long?>(null)
    
    // Database command handler for /db commands
    private val databaseHandler = DatabaseCommandHandler()
    
    init {
        loadChannels()
        observeMessages()
    }
    
    override fun onCleared() {
        super.onCleared()
        // Cleanup database connections
        databaseHandler.cleanup()
    }
    
    /**
     * Load all available channels from database
     * Auto-selects first channel if none selected
     */
    private fun loadChannels() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            
            try {
                channelRepository.getAllChannels()
                    .catch { error ->
                        _uiState.update { 
                            it.copy(
                                isLoading = false,
                                error = "Failed to load channels: ${error.message}"
                            )
                        }
                        _events.emit(ChatUiEvent.Error("Failed to load channels: ${error.message}"))
                    }
                    .collect { channels ->
                        _uiState.update { 
                            it.copy(
                                channels = channels,
                                isLoading = false
                            )
                        }
                        
                        // Auto-select first channel if none selected
                        if (_currentChannelId.value == null && channels.isNotEmpty()) {
                            switchChannel(channels.first().id.toLongOrNull() ?: 0)
                        }
                    }
            } catch (e: Exception) {
                _uiState.update { 
                    it.copy(
                        isLoading = false,
                        error = "Unexpected error: ${e.message}"
                    )
                }
                _events.emit(ChatUiEvent.Error("Unexpected error: ${e.message}"))
            }
        }
    }
    
    /**
     * Observe messages for current channel
     * Updates automatically when channel changes or new messages arrive
     */
    private fun observeMessages() {
        viewModelScope.launch {
            _currentChannelId
                .filterNotNull()
                .flatMapLatest { channelId ->
                    chatRepository.getMessagesByChannel(channelId.toString())
                }
                .catch { error ->
                    _events.emit(ChatUiEvent.Error("Failed to load messages: ${error.message}"))
                }
                .collect { messages ->
                    _uiState.update { it.copy(messages = messages) }
                }
        }
    }
    
    /**
     * Switch to a different channel
     * Loads messages and updates unread count
     */
    fun switchChannel(channelId: Long) {
        viewModelScope.launch {
            try {
                val channel = channelRepository.getChannelByIdSync(channelId.toString())
                if (channel != null) {
                    _currentChannelId.value = channelId
                    _uiState.update { 
                        it.copy(
                            currentChannel = channel
                        )
                    }
                    
                    // Clear unread count for this channel
                    channelRepository.clearUnreadCount(channelId.toString())
                    
                    _events.emit(
                        ChatUiEvent.ChannelSwitched(
                            channelId = channelId,
                            channelName = channel.name
                        )
                    )
                    _events.emit(ChatUiEvent.ScrollToBottom)
                }
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Failed to switch channel: ${e.message}"))
            }
        }
    }
    
    /**
     * Send a message in the current channel
     * Handles both regular messages and database commands (/db)
     */
    fun sendMessage(content: String) {
        viewModelScope.launch {
            val channelId = _currentChannelId.value
            if (channelId == null) {
                _events.emit(ChatUiEvent.Error("No channel selected"))
                return@launch
            }
            
            if (content.isBlank()) {
                _events.emit(ChatUiEvent.Error("Message cannot be empty"))
                return@launch
            }
            
            try {
                _uiState.update { it.copy(isSendingMessage = true) }
                
                // Create user message
                val userMessage = ChatMessage(
                    id = "0", // Auto-generated
                    channelId = channelId.toString(),
                    content = content,
                    authorType = AuthorType.USER,
                    authorName = "User",
                    messageType = if (content.startsWith("/")) MessageType.COMMAND else MessageType.TEXT,
                    timestamp = Instant.now().toEpochMilli(),
                    replyToId = null,
                    replyToContent = null,
                    reactions = emptyMap(),
                    attachmentUrl = null,
                    isEdited = false
                )
                
                // Insert message into database
                chatRepository.insertMessage(userMessage)
                
                _uiState.update { it.copy(isSendingMessage = false) }
                _events.emit(ChatUiEvent.MessageSent(userMessage.id.toLongOrNull() ?: 0L))
                _events.emit(ChatUiEvent.ScrollToBottom)
                
                // Handle database commands (/db)
                if (databaseHandler.isDatabaseCommand(content)) {
                    handleDatabaseCommand(content, channelId)
                }
                // Trigger bot response for other commands
                else if (content.startsWith("/")) {
                    simulateBotResponse(content, channelId)
                }
                
            } catch (e: Exception) {
                _uiState.update { it.copy(isSendingMessage = false) }
                _events.emit(ChatUiEvent.Error("Failed to send message: ${e.message}"))
            }
        }
    }
    
    /**
     * Handle database commands (/db)
     * Executes database queries and displays results
     */
    private fun handleDatabaseCommand(command: String, channelId: Long) {
        viewModelScope.launch {
            try {
                // Add bot to typing users
                val botName = "DatabaseBot"
                channelRepository.addTypingUser(channelId.toString(), botName)
                _events.emit(ChatUiEvent.BotTypingStarted(botName))
                
                // Execute database command on IO thread
                val result = withContext(Dispatchers.IO) {
                    databaseHandler.processCommand(command)
                }
                
                // Remove bot from typing users
                channelRepository.removeTypingUser(channelId.toString(), botName)
                _events.emit(ChatUiEvent.BotTypingStopped)
                
                // Send bot response with database results
                val botMessage = ChatMessage(
                    id = "0", // Auto-generated
                    channelId = channelId.toString(),
                    content = result,
                    authorType = AuthorType.BOT,
                    authorName = botName,
                    messageType = MessageType.TEXT,
                    timestamp = Instant.now().toEpochMilli(),
                    replyToId = null,
                    replyToContent = null,
                    reactions = emptyMap(),
                    attachmentUrl = null,
                    isEdited = false
                )
                
                // Insert bot message
                chatRepository.insertMessage(botMessage)
                _events.emit(ChatUiEvent.MessageReceived(botMessage))
                _events.emit(ChatUiEvent.ScrollToBottom)
                
            } catch (e: Exception) {
                channelRepository.removeTypingUser(channelId.toString(), "DatabaseBot")
                _events.emit(ChatUiEvent.BotTypingStopped)
                _events.emit(ChatUiEvent.Error("Database command failed: ${e.message}"))
            }
        }
    }
    
    /**
     * Simulate bot response to a command
     * Shows typing indicator, delays, then sends bot message
     */
    private fun simulateBotResponse(command: String, channelId: Long) {
        viewModelScope.launch {
            try {
                // Add bot to typing users
                val botName = "InfinityBot"
                channelRepository.addTypingUser(channelId.toString(), botName)
                _events.emit(ChatUiEvent.BotTypingStarted(botName))
                
                // Simulate bot thinking (500-1000ms)
                delay(500 + (Math.random() * 500).toLong())
                
                // Remove bot from typing users
                channelRepository.removeTypingUser(channelId.toString(), botName)
                _events.emit(ChatUiEvent.BotTypingStopped)
                
                // Generate bot response
                val botResponse = generateBotResponse(command)
                val botMessage = ChatMessage(
                    id = "0", // Auto-generated
                    channelId = channelId.toString(),
                    content = botResponse,
                    authorType = AuthorType.BOT,
                    authorName = botName,
                    messageType = MessageType.TEXT,
                    timestamp = Instant.now().toEpochMilli(),
                    replyToId = null,
                    replyToContent = null,
                    reactions = emptyMap(),
                    attachmentUrl = null,
                    isEdited = false
                )
                
                // Insert bot message
                val messageId = chatRepository.insertMessage(botMessage)
                _events.emit(ChatUiEvent.MessageReceived(botMessage))
                _events.emit(ChatUiEvent.ScrollToBottom)
                
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Bot response failed: ${e.message}"))
            }
        }
    }
    
    /**
     * Generate bot response based on command
     * Includes both game commands and database commands
     */
    private fun generateBotResponse(command: String): String {
        return when {
            command.startsWith("/starter") -> 
                "Choose your starter Pokémon:\n• Bulbasaur (Grass/Poison)\n• Charmander (Fire)\n• Squirtle (Water)"
            command.startsWith("/home") -> 
                "Returning to your homestead... 🏠"
            command.startsWith("/walk") -> 
                "You venture into the wild area... A wild Pokémon appears! ⚔️"
            command.startsWith("/heal") -> 
                "Your Pokémon have been fully healed! ❤️"
            command.startsWith("/battle") -> 
                "Challenge accepted! Prepare for battle! ⚔️"
            command.startsWith("/help") -> 
                """
                Available commands:
                
                Game Commands:
                /starter - Choose starter Pokémon
                /home - Return home
                /walk - Explore wild area
                /heal - Heal your Pokémon
                /battle - Start a battle
                
                Database Commands:
                /db list - List all databases
                /db status <db> - Check database connection
                /db tables <db> - Show tables in database
                /db query <db> <sql> - Execute custom query
                /db preset <name> <db> - Run pre-built query
                /db help - Database command help
                
                Database shortcuts: prod, dev, exp
                """.trimIndent()
            else -> 
                "Unknown command: $command\nType /help for available commands."
        }
    }
    
    /**
     * Add a reaction emoji to a message
     */
    fun addReaction(messageId: Long, emoji: String) {
        viewModelScope.launch {
            try {
                chatRepository.addReaction(messageId.toString(), emoji)
                _events.emit(ChatUiEvent.ReactionAdded(messageId, emoji))
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Failed to add reaction: ${e.message}"))
            }
        }
    }
    
    /**
     * Remove a reaction emoji from a message
     */
    fun removeReaction(messageId: Long, emoji: String) {
        viewModelScope.launch {
            try {
                chatRepository.removeReaction(messageId.toString(), emoji)
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Failed to remove reaction: ${e.message}"))
            }
        }
    }
    
    /**
     * Edit an existing message
     * Only user messages can be edited
     */
    fun editMessage(messageId: Long, newContent: String) {
        viewModelScope.launch {
            try {
                if (newContent.isBlank()) {
                    _events.emit(ChatUiEvent.Error("Message cannot be empty"))
                    return@launch
                }
                
                chatRepository.updateMessageContent(messageId.toString(), newContent)
                _events.emit(ChatUiEvent.MessageEdited(messageId))
                _events.emit(ChatUiEvent.ShowMessage("Message edited"))
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Failed to edit message: ${e.message}"))
            }
        }
    }
    
    /**
     * Delete a message
     */
    fun deleteMessage(messageId: Long) {
        viewModelScope.launch {
            try {
                val message = chatRepository.getMessageById(messageId.toString())
                if (message != null) {
                    chatRepository.deleteMessage(message)
                }
                _events.emit(ChatUiEvent.ShowMessage("Message deleted"))
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Failed to delete message: ${e.message}"))
            }
        }
    }
    
    /**
     * Clear all messages in current channel
     */
    fun clearMessages() {
        viewModelScope.launch {
            val channelId = _currentChannelId.value
            if (channelId == null) {
                _events.emit(ChatUiEvent.Error("No channel selected"))
                return@launch
            }
            
            try {
                // Clear messages from database
                chatRepository.deleteMessagesByChannel(channelId.toString())
                _events.emit(ChatUiEvent.ShowMessage("Messages cleared"))
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Failed to clear messages: ${e.message}"))
            }
        }
    }
    
    /**
     * Search messages in current channel
     */
    fun searchMessages(query: String) {
        viewModelScope.launch {
            val channelId = _currentChannelId.value
            if (channelId == null) {
                _events.emit(ChatUiEvent.Error("No channel selected"))
                return@launch
            }
            
            try {
                // Search messages in database
                // Note: searchMessages returns Flow, so we need to collect
                chatRepository.searchMessages(channelId.toString(), query).collect { results ->
                    _events.emit(ChatUiEvent.ShowMessage("Found ${results.size} messages matching '$query'"))
                }
            } catch (e: Exception) {
                _events.emit(ChatUiEvent.Error("Search failed: ${e.message}"))
            }
        }
    }
    
    /**
     * Mark current channel as read
     */
    fun markChannelAsRead() {
        viewModelScope.launch {
            val channelId = _currentChannelId.value
            if (channelId != null) {
                channelRepository.clearUnreadCount(channelId.toString())
            }
        }
    }
    
    /**
     * Clear error message from UI state
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
