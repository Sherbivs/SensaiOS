package com.infinitygauntlet.simulation.presentation.chat

import com.infinitygauntlet.simulation.domain.models.Channel
import com.infinitygauntlet.simulation.domain.models.ChatMessage

/**
 * UI state for ChatViewModel
 * Represents the complete state of the chat screen
 */
data class ChatUiState(
    val channels: List<Channel> = emptyList(),
    val currentChannel: Channel? = null,
    val messages: List<ChatMessage> = emptyList(),
    val isTyping: Boolean = false,
    val typingUsers: List<String> = emptyList(),
    val unreadCount: Int = 0,
    val isLoading: Boolean = false,
    val isSendingMessage: Boolean = false,
    val error: String? = null
) {
    /**
     * Get total unread messages across all channels
     */
    val totalUnreadCount: Int
        get() = channels.sumOf { it.unreadCount }
    
    /**
     * Check if current channel has unread messages
     */
    val currentChannelHasUnread: Boolean
        get() = currentChannel?.hasUnreadMessages == true
    
    /**
     * Get typing indicator text for current channel
     */
    val typingIndicatorText: String?
        get() = currentChannel?.getTypingIndicatorText()
    
    /**
     * Check if any user is typing in current channel
     */
    val isAnyoneTyping: Boolean
        get() = typingUsers.isNotEmpty()
}
