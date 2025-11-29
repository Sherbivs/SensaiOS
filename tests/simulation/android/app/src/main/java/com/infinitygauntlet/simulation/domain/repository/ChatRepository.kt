package com.infinitygauntlet.simulation.domain.repository

import com.infinitygauntlet.simulation.domain.models.ChatMessage
import com.infinitygauntlet.simulation.domain.models.AuthorType
import com.infinitygauntlet.simulation.domain.models.MessageType
import kotlinx.coroutines.flow.Flow

/**
 * Repository Interface: Chat (Messages)
 * 
 * Week 2: Phase 2.2 - Repository Pattern
 * 
 * Defines the contract for chat message data operations.
 * Domain layer interface - implemented in data layer.
 * Supports pagination, reactions, replies, and real-time updates.
 */
interface ChatRepository {
    
    /**
     * Get all messages for a channel
     * Ordered by timestamp (newest first)
     * 
     * @param channelId Channel ID
     */
    fun getMessagesByChannel(channelId: String): Flow<List<ChatMessage>>
    
    /**
     * Get paginated messages for a channel
     * 
     * @param channelId Channel ID
     * @param limit Maximum messages to return
     * @param offset Starting position
     */
    suspend fun getMessagesByChannelPaged(
        channelId: String,
        limit: Int = 50,
        offset: Int = 0
    ): List<ChatMessage>
    
    /**
     * Get messages after a timestamp (for incremental loading)
     * 
     * @param channelId Channel ID
     * @param afterTimestamp Get messages after this timestamp
     */
    fun getMessagesAfter(channelId: String, afterTimestamp: Long): Flow<List<ChatMessage>>
    
    /**
     * Get messages before a timestamp (for infinite scroll)
     * 
     * @param channelId Channel ID
     * @param beforeTimestamp Get messages before this timestamp
     * @param limit Maximum messages to return
     */
    suspend fun getMessagesBefore(
        channelId: String,
        beforeTimestamp: Long,
        limit: Int = 50
    ): List<ChatMessage>
    
    /**
     * Get a single message by ID
     * 
     * @param messageId Message ID
     */
    suspend fun getMessageById(messageId: String): ChatMessage?
    
    /**
     * Get message by ID as Flow
     * 
     * @param messageId Message ID
     */
    fun getMessageByIdFlow(messageId: String): Flow<ChatMessage?>
    
    /**
     * Get messages by author type
     * 
     * @param channelId Channel ID
     * @param authorType Author type to filter by
     */
    fun getMessagesByAuthorType(channelId: String, authorType: AuthorType): Flow<List<ChatMessage>>
    
    /**
     * Get messages by type
     * 
     * @param channelId Channel ID
     * @param messageType Message type to filter by
     */
    fun getMessagesByType(channelId: String, messageType: MessageType): Flow<List<ChatMessage>>
    
    /**
     * Get replies to a message
     * 
     * @param messageId Parent message ID
     */
    fun getReplies(messageId: String): Flow<List<ChatMessage>>
    
    /**
     * Search messages by content
     * 
     * @param channelId Channel ID
     * @param query Search query
     */
    fun searchMessages(channelId: String, query: String): Flow<List<ChatMessage>>
    
    /**
     * Get messages with attachments
     * 
     * @param channelId Channel ID
     */
    fun getMessagesWithAttachments(channelId: String): Flow<List<ChatMessage>>
    
    /**
     * Get edited messages
     * 
     * @param channelId Channel ID
     */
    fun getEditedMessages(channelId: String): Flow<List<ChatMessage>>
    
    /**
     * Get latest message in a channel
     * 
     * @param channelId Channel ID
     */
    suspend fun getLatestMessage(channelId: String): ChatMessage?
    
    /**
     * Get latest message as Flow
     * 
     * @param channelId Channel ID
     */
    fun getLatestMessageFlow(channelId: String): Flow<ChatMessage?>
    
    /**
     * Get message count for a channel
     * 
     * @param channelId Channel ID
     */
    suspend fun getMessageCount(channelId: String): Int
    
    /**
     * Get message count by type
     * 
     * @param channelId Channel ID
     * @param messageType Message type
     */
    suspend fun getMessageCountByType(channelId: String, messageType: MessageType): Int
    
    /**
     * Insert a message
     * 
     * @param message Message to insert
     */
    suspend fun insertMessage(message: ChatMessage)
    
    /**
     * Insert multiple messages
     * 
     * @param messages List of messages to insert
     */
    suspend fun insertMessages(messages: List<ChatMessage>)
    
    /**
     * Update a message
     * 
     * @param message Message to update
     */
    suspend fun updateMessage(message: ChatMessage)
    
    /**
     * Update message content (for editing)
     * 
     * @param messageId Message ID
     * @param newContent New content
     */
    suspend fun updateMessageContent(messageId: String, newContent: String)
    
    /**
     * Update message reactions
     * 
     * @param messageId Message ID
     * @param reactions Map of emoji to count
     */
    suspend fun updateReactions(messageId: String, reactions: Map<String, Int>)
    
    /**
     * Add reaction to message
     * 
     * @param messageId Message ID
     * @param emoji Emoji to add
     */
    suspend fun addReaction(messageId: String, emoji: String)
    
    /**
     * Remove reaction from message
     * 
     * @param messageId Message ID
     * @param emoji Emoji to remove
     */
    suspend fun removeReaction(messageId: String, emoji: String)
    
    /**
     * Delete a message
     * 
     * @param message Message to delete
     */
    suspend fun deleteMessage(message: ChatMessage)
    
    /**
     * Delete message by ID
     * 
     * @param messageId Message ID
     */
    suspend fun deleteMessageById(messageId: String)
    
    /**
     * Delete all messages in a channel
     * 
     * @param channelId Channel ID
     */
    suspend fun deleteMessagesByChannel(channelId: String)
    
    /**
     * Delete all messages
     */
    suspend fun deleteAllMessages()
    
    /**
     * Delete old messages (older than timestamp)
     * 
     * @param channelId Channel ID
     * @param olderThan Timestamp threshold
     * @return Number of deleted rows
     */
    suspend fun deleteOldMessages(channelId: String, olderThan: Long): Int
}
