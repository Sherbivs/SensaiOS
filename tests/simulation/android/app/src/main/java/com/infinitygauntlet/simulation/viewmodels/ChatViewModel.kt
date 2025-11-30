package com.infinitygauntlet.simulation.viewmodels

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.infinitygauntlet.simulation.domain.models.ChatMessage
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * ViewModel for ChatUIActivity
 * Manages chat state, messages, and bot responses
 */
class ChatViewModel : ViewModel() {
    
    private val _messages = MutableLiveData<List<ChatMessage>>()
    val messages: LiveData<List<ChatMessage>> = _messages
    
    private val _currentChannel = MutableLiveData<String>("homestead")
    val currentChannel: LiveData<String> = _currentChannel
    
    private val _isTyping = MutableLiveData<Boolean>(false)
    val isTyping: LiveData<Boolean> = _isTyping
    
    // Store messages per channel
    private val channelMessages = mutableMapOf<String, MutableList<ChatMessage>>(
        "homestead" to mutableListOf(),
        "arena" to mutableListOf(),
        "wild-area" to mutableListOf()
    )
    
    init {
        // Add welcome message to homestead
        addMessage(
            ChatMessage.createSystemMessage(
                "Welcome to the Infinity Gauntlet Simulation!\n" +
                "Try these commands:\n" +
                "• /starter - Choose your starting Pokémon\n" +
                "• /home - Return home\n" +
                "• /walk - Explore the wild\n" +
                "• /heal - Heal your Pokémon\n" +
                "• /battle - Start a battle",
                "homestead"
            )
        )
        _messages.value = channelMessages["homestead"]
    }
    
    fun switchChannel(channel: String) {
        _currentChannel.value = channel
        _messages.value = channelMessages[channel] ?: emptyList()
    }
    
    fun sendMessage(text: String) {
        val channel = _currentChannel.value ?: "homestead"
        
        // Add user message
        val userMessage = ChatMessage.createUserMessage(text, channel)
        addMessage(userMessage)
        
        // Simulate bot response
        if (text.startsWith("/")) {
            simulateBotResponse(text, channel)
        }
    }
    
    private fun addMessage(message: ChatMessage) {
        val channel = message.channel
        val currentMessages = channelMessages[channel] ?: mutableListOf()
        currentMessages.add(message)
        channelMessages[channel] = currentMessages
        
        // Update LiveData if this is the current channel
        if (channel == _currentChannel.value) {
            _messages.value = currentMessages
        }
    }
    
    private fun simulateBotResponse(command: String, channel: String) {
        viewModelScope.launch {
            // Show typing indicator
            _isTyping.value = true
            
            // Simulate bot thinking (500ms)
            delay(500)
            
            // Hide typing indicator
            _isTyping.value = false
            
            // Generate and add bot response
            val botMessage = ChatMessage.simulateBotResponse(command, channel)
            addMessage(botMessage)
        }
    }
    
    fun clearMessages() {
        val channel = _currentChannel.value ?: "homestead"
        channelMessages[channel]?.clear()
        _messages.value = emptyList()
    }
    
    fun getMessageCount(channel: String): Int {
        return channelMessages[channel]?.size ?: 0
    }
}
