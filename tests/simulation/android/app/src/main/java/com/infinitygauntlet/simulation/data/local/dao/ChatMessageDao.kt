package com.infinitygauntlet.simulation.data.local.dao

import androidx.room.*
import com.infinitygauntlet.simulation.data.local.entities.ChatMessageEntity
import kotlinx.coroutines.flow.Flow

/**
 * Data Access Object for Chat Messages
 * 
 * Week 2: Phase 2.1 - Room Database
 * 
 * Provides methods to interact with chat_messages table.
 * Supports pagination, reactions, replies, and real-time updates.
 * 
 * @see ChatMessageEntity
 */
@Dao
interface ChatMessageDao {
    
    /**
     * Get all messages for a channel
     * Ordered by timestamp (newest first)
     * 
     * @param channelId Channel ID
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId 
        ORDER BY timestamp DESC
    """)
    fun getMessagesByChannel(channelId: String): Flow<List<ChatMessageEntity>>
    
    /**
     * Get paginated messages for a channel
     * 
     * @param channelId Channel ID
     * @param limit Maximum messages to return
     * @param offset Starting position
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId 
        ORDER BY timestamp DESC
        LIMIT :limit OFFSET :offset
    """)
    suspend fun getMessagesByChannelPaged(
        channelId: String,
        limit: Int = 50,
        offset: Int = 0
    ): List<ChatMessageEntity>
    
    /**
     * Get messages after a timestamp (for incremental loading)
     * 
     * @param channelId Channel ID
     * @param afterTimestamp Get messages after this timestamp
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId AND timestamp > :afterTimestamp
        ORDER BY timestamp ASC
    """)
    fun getMessagesAfter(channelId: String, afterTimestamp: Long): Flow<List<ChatMessageEntity>>
    
    /**
     * Get messages before a timestamp (for infinite scroll)
     * 
     * @param channelId Channel ID
     * @param beforeTimestamp Get messages before this timestamp
     * @param limit Maximum messages to return
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId AND timestamp < :beforeTimestamp
        ORDER BY timestamp DESC
        LIMIT :limit
    """)
    suspend fun getMessagesBefore(
        channelId: String,
        beforeTimestamp: Long,
        limit: Int = 50
    ): List<ChatMessageEntity>
    
    /**
     * Get a single message by ID
     * 
     * @param messageId Message ID
     */
    @Query("SELECT * FROM chat_messages WHERE id = :messageId")
    suspend fun getMessageById(messageId: String): ChatMessageEntity?
    
    /**
     * Get message by ID as Flow
     * 
     * @param messageId Message ID
     */
    @Query("SELECT * FROM chat_messages WHERE id = :messageId")
    fun getMessageByIdFlow(messageId: String): Flow<ChatMessageEntity?>
    
    /**
     * Get messages by author type
     * 
     * @param channelId Channel ID
     * @param authorType Author type (user, bot, system)
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId AND author_type = :authorType
        ORDER BY timestamp DESC
    """)
    fun getMessagesByAuthorType(channelId: String, authorType: String): Flow<List<ChatMessageEntity>>
    
    /**
     * Get messages by type
     * 
     * @param channelId Channel ID
     * @param messageType Message type (text, command, system, error)
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId AND message_type = :messageType
        ORDER BY timestamp DESC
    """)
    fun getMessagesByType(channelId: String, messageType: String): Flow<List<ChatMessageEntity>>
    
    /**
     * Get replies to a message
     * 
     * @param messageId Parent message ID
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE reply_to_id = :messageId
        ORDER BY timestamp ASC
    """)
    fun getReplies(messageId: String): Flow<List<ChatMessageEntity>>
    
    /**
     * Search messages by content
     * 
     * @param channelId Channel ID
     * @param query Search query
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId 
        AND content LIKE '%' || :query || '%'
        ORDER BY timestamp DESC
    """)
    fun searchMessages(channelId: String, query: String): Flow<List<ChatMessageEntity>>
    
    /**
     * Get messages with attachments
     * 
     * @param channelId Channel ID
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId 
        AND attachment_url IS NOT NULL
        ORDER BY timestamp DESC
    """)
    fun getMessagesWithAttachments(channelId: String): Flow<List<ChatMessageEntity>>
    
    /**
     * Get edited messages
     * 
     * @param channelId Channel ID
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId 
        AND is_edited = 1
        ORDER BY timestamp DESC
    """)
    fun getEditedMessages(channelId: String): Flow<List<ChatMessageEntity>>
    
    /**
     * Get latest message in a channel
     * 
     * @param channelId Channel ID
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId 
        ORDER BY timestamp DESC 
        LIMIT 1
    """)
    suspend fun getLatestMessage(channelId: String): ChatMessageEntity?
    
    /**
     * Get latest message as Flow
     * 
     * @param channelId Channel ID
     */
    @Query("""
        SELECT * FROM chat_messages 
        WHERE channel_id = :channelId 
        ORDER BY timestamp DESC 
        LIMIT 1
    """)
    fun getLatestMessageFlow(channelId: String): Flow<ChatMessageEntity?>
    
    /**
     * Get message count for a channel
     * 
     * @param channelId Channel ID
     */
    @Query("SELECT COUNT(*) FROM chat_messages WHERE channel_id = :channelId")
    suspend fun getMessageCount(channelId: String): Int
    
    /**
     * Get message count by type
     * 
     * @param channelId Channel ID
     * @param messageType Message type
     */
    @Query("""
        SELECT COUNT(*) FROM chat_messages 
        WHERE channel_id = :channelId AND message_type = :messageType
    """)
    suspend fun getMessageCountByType(channelId: String, messageType: String): Int
    
    /**
     * Insert a message
     * 
     * @param message Message to insert
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessage(message: ChatMessageEntity)
    
    /**
     * Insert multiple messages
     * 
     * @param messages List of messages to insert
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMessages(messages: List<ChatMessageEntity>)
    
    /**
     * Update a message
     * 
     * @param message Message to update
     */
    @Update
    suspend fun updateMessage(message: ChatMessageEntity)
    
    /**
     * Update message content (for editing)
     * 
     * @param messageId Message ID
     * @param newContent New content
     * @param editedAt Timestamp of edit
     */
    @Query("""
        UPDATE chat_messages 
        SET content = :newContent,
            is_edited = 1,
            edited_at = :editedAt
        WHERE id = :messageId
    """)
    suspend fun updateMessageContent(
        messageId: String,
        newContent: String,
        editedAt: Long = System.currentTimeMillis()
    )
    
    /**
     * Update message reactions
     * 
     * @param messageId Message ID
     * @param reactions JSON string of reactions
     */
    @Query("""
        UPDATE chat_messages 
        SET reactions = :reactions
        WHERE id = :messageId
    """)
    suspend fun updateReactions(messageId: String, reactions: String?)
    
    /**
     * Delete a message
     * 
     * @param message Message to delete
     */
    @Delete
    suspend fun deleteMessage(message: ChatMessageEntity)
    
    /**
     * Delete message by ID
     * 
     * @param messageId Message ID
     */
    @Query("DELETE FROM chat_messages WHERE id = :messageId")
    suspend fun deleteMessageById(messageId: String)
    
    /**
     * Delete all messages in a channel
     * 
     * @param channelId Channel ID
     */
    @Query("DELETE FROM chat_messages WHERE channel_id = :channelId")
    suspend fun deleteMessagesByChannel(channelId: String)
    
    /**
     * Delete all messages
     */
    @Query("DELETE FROM chat_messages")
    suspend fun deleteAllMessages()
    
    /**
     * Delete old messages (older than timestamp)
     * Useful for message retention policies
     * 
     * @param channelId Channel ID
     * @param olderThan Timestamp threshold
     * @return Number of deleted rows
     */
    @Query("""
        DELETE FROM chat_messages 
        WHERE channel_id = :channelId AND timestamp < :olderThan
    """)
    suspend fun deleteOldMessages(channelId: String, olderThan: Long): Int
}
