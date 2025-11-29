package com.infinitygauntlet.simulation.presentation.chat

import com.infinitygauntlet.simulation.domain.models.ChatMessage

/**
 * One-time events emitted by ChatViewModel
 * These events are consumed once by the UI and do not persist in state
 */
sealed class ChatUiEvent {
    /**
     * Message sent successfully
     */
    data class MessageSent(
        val messageId: Long
    ) : ChatUiEvent()
    
    /**
     * Message received from bot or system
     */
    data class MessageReceived(
        val message: ChatMessage
    ) : ChatUiEvent()
    
    /**
     * Channel switched successfully
     */
    data class ChannelSwitched(
        val channelId: Long,
        val channelName: String
    ) : ChatUiEvent()
    
    /**
     * Error occurred
     */
    data class Error(
        val message: String
    ) : ChatUiEvent()
    
    /**
     * Success message to display
     */
    data class ShowMessage(
        val message: String
    ) : ChatUiEvent()
    
    /**
     * Scroll to bottom of message list
     */
    object ScrollToBottom : ChatUiEvent()
    
    /**
     * Bot is typing indicator started
     */
    data class BotTypingStarted(
        val botName: String
    ) : ChatUiEvent()
    
    /**
     * Bot typing indicator stopped
     */
    object BotTypingStopped : ChatUiEvent()
    
    /**
     * Reaction added to message
     */
    data class ReactionAdded(
        val messageId: Long,
        val emoji: String
    ) : ChatUiEvent()
    
    /**
     * Message edited successfully
     */
    data class MessageEdited(
        val messageId: Long
    ) : ChatUiEvent()
}
